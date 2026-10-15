import { test } from 'node:test';
import { access } from 'node:fs/promises';
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
    texture.dispose();
  }
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
