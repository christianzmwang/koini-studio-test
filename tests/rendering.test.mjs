import { test } from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Texture, SRGBColorSpace, NoColorSpace, LinearSRGBColorSpace, FloatType, RepeatWrapping } from 'three';
import { configureSurfaceTexture, createKoiniEnvironment, surfaceSets } from '../site/rendering.js';

test('surface relief channels stay linear while colour maps use sRGB', () => {
  for (const channel of ['color', 'normal', 'roughness', 'ao']) {
    const texture = configureSurfaceTexture(new Texture(), channel, 4, 3, surfaceSets.herringbone.tile);
    assert.equal(texture.colorSpace, channel === 'color' ? SRGBColorSpace : NoColorSpace);
    assert.equal(texture.wrapS, RepeatWrapping);
    assert.equal(texture.wrapT, RepeatWrapping);
    // Herringbone represents a 3.4 metre patch in Koini, not an arbitrary 3x3 repeat.
    assert.ok(Math.abs(texture.repeat.x * 3.4 - 4) < 1e-10);
    assert.ok(Math.abs(texture.repeat.y * 3.4 - 3) < 1e-10);
    // A point half a metre below the native image's top edge must land on that
    // same texel after Three's bottom-left UV convention and repeat transform.
    const surfaceV = 1 - 0.5 / 3;
    const imageV = 1 - (surfaceV * texture.repeat.y + texture.offset.y);
    assert.ok(Math.abs(imageV - 0.5 / 3.4) < 1e-10);
    texture.dispose();
  }
});

test('the measured native colour atlas is published losslessly with its provenance', async () => {
  const provenance = JSON.parse(await readFile('docs/render-calibration.json', 'utf8'));
  const atlas = await readFile(`dist${provenance.atlas.asset}`);
  assert.equal(atlas.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual([atlas.readUInt32BE(16), atlas.readUInt32BE(20)], [1089, 33]);
  assert.equal(atlas[24], 8);
  assert.equal(createHash('sha256').update(atlas).digest('hex'), provenance.atlas.sha256);
  await access(provenance.atlas.generator);
  await assert.rejects(access('dist/__calibration'));
  await assert.rejects(access('dist/render-reference'));
});

test('the lighting retains HDR window highlights and responds to the actual floor colour', () => {
  const studio = createKoiniEnvironment(undefined, 128, 64);
  const oak = createKoiniEnvironment(surfaceSets.oak.mean, 128, 64);
  const pale = createKoiniEnvironment(surfaceSets.lightOak.mean, 128, 64);
  assert.equal(studio.type, FloatType);
  assert.equal(studio.colorSpace, LinearSRGBColorSpace);
  assert.ok(Math.max(...studio.image.data) > 10, 'window illumination must not be clipped to an LDR image');
  assert.ok(studio.image.data.every(Number.isFinite));
  const offset = (5 * 128 + 64) * 4;
  assert.ok(oak.image.data[offset] > studio.image.data[offset], 'floor bounce should light the lower hemisphere');
  assert.ok(pale.image.data[offset] > oak.image.data[offset], 'a lighter floor should return more light');
  assert.equal(oak.image.data[offset + 3], 1);
  studio.dispose(); oak.dispose(); pale.dispose();
});

test('all native material channels are included in the production build', async () => {
  for (const [name, set] of Object.entries(surfaceSets)) {
    for (const channel of ['color', 'normal', 'roughness', 'ao']) {
      const path = channel === 'color' && set.directory === 'floors'
        ? `floors/${name}.jpg` : `${set.directory}/${name}-${channel}.webp`;
      await access(`dist/assets/${path}`);
    }
  }
});
