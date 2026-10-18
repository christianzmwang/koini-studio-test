import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { Box3, Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three';
import { config } from '../vercel.mjs';
import { centerModel } from '../site/room-scene.js';

const featuredRoom = JSON.parse(await readFile('site/featured-room.json', 'utf8'));
const gallery = JSON.parse(await readFile('site/public/assets/gallery.json', 'utf8'));

test('the built page references existing images, styles, scripts and 3D models', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  for (const match of html.matchAll(/(?:src|href|data-model)="(\/[^"#]+)"/g)) {
    if (match[1] === '/' || ['/privacy', '/support', '/auth/signin'].includes(match[1]) || /^\/room-copy\/[0-9a-f]{32}$/.test(match[1])) continue;
    await access('dist' + match[1]);
  }
  assert.equal((html.match(/data-gallery-card/g) ?? []).length, 3);
  assert.equal((html.match(/data-viewer/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<!-- GALLERY -->|data-angle|styles\.css/);
});

test('each furniture viewer ships a real, self-contained glTF model', async () => {
  const files = new Set([...gallery.map(model => `/assets/models/${model.id}.glb`), ...featuredRoom.items.map(item => item.model).filter(Boolean)]);
  for (const file of files) {
    const buffer = await readFile(`dist${file}`);
    assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
    assert.equal(buffer.readUInt32LE(4), 2);
    assert.equal(buffer.readUInt32LE(8), buffer.length);
    const data = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
    assert.ok(data.meshes.length > 0);
    assert.ok(data.materials.length > 0);
    assert.ok(data.images.length > 0);
    assert.ok(data.buffers.every(buffer => !buffer.uri));
    assert.ok(data.images.every(image => image.bufferView !== undefined));
  }
});

test('model placement preserves proportions, centers furniture, and puts its feet on the floor', () => {
  const model = new Group();
  const mesh = new Mesh(new BoxGeometry(2, 3, 4), new MeshStandardMaterial());
  mesh.position.set(7, 8, -9); model.add(mesh);
  const placed = centerModel(model, 4);
  const bounds = new Box3().setFromObject(placed);
  const size = bounds.getSize(new Vector3());
  assert.deepEqual(size.toArray(), [4, 6, 8]);
  assert.deepEqual(bounds.getCenter(new Vector3()).toArray(), [0, 3, 0]);
  assert.equal(bounds.min.y, 0);
  mesh.geometry.dispose(); mesh.material.dispose();
  assert.throws(() => centerModel(new Group()), /no visible geometry/);
});

test('only the room landing page is forwarded, with no snapshot write API or admin proxy', () => {
  const room = config.rewrites.find(route => route.source.startsWith('/room-copy/'));
  assert.ok(room);
  assert.equal(room.source, '/room-copy/:token([0-9a-f]{32})');
  assert.equal(room.destination, '/api/room-copy?token=:token');
  assert.ok(config.rewrites.some(route => route.source === '/sign-in' && route.destination === '/api/auth?action=signin'), 'the /sign-in entry path must route to the sign-in handler');
  assert.ok(config.rewrites.every(route => !route.source.includes('admin') && !route.source.includes('room-copies')));
  assert.ok(config.headers.some(route => route.source === '/room-copy/:path*' && route.headers.some(header => header.key === 'Cache-Control' && header.value === 'no-store')));
});

test('the homepage features the selected saved room and keeps private room exports out of the build', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  assert.equal(featuredRoom.name, 'Meeting demo');
  assert.deepEqual([featuredRoom.widthCm, featuredRoom.lengthCm, featuredRoom.heightCm], [400, 300, 250]);
  assert.equal(featuredRoom.floorMaterial, 'herringbone');
  assert.equal(featuredRoom.items.length, 3);
  assert.match(html, /data-floor="herringbone" aria-pressed="true"/);
  assert.match(html, /4\.00 × 3\.00 m/);
  assert.doesNotMatch(html, /Example living room|An example room|Sleeping room|Big room test/);
  assert.ok(featuredRoom.items.every(item => !('id' in item) && !('glbFilename' in item)));
  await assert.rejects(access('dist/.local'));
  await assert.rejects(access('dist/rooms.json'));
});
