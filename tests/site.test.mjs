import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { config } from '../vercel.mjs';

test('the production page has no missing locally referenced image, style or script', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  for (const match of html.matchAll(/(?:src|href|data-side|data-front)="(\/[^"#]+)"/g)) {
    if (match[1] === '/' || ['/privacy', '/support'].includes(match[1])) continue;
    await access('dist' + match[1]);
  }
  assert.equal((html.match(/class="gallery-card"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<!-- GALLERY -->/);
});

test('only the room landing page is forwarded, with no snapshot write API or admin proxy', () => {
  const room = config.rewrites.find(route => route.source.startsWith('/room-copy/'));
  assert.ok(room);
  assert.equal(room.source, '/room-copy/:token([0-9a-f]{32})');
  assert.equal(room.destination, '/api/room-copy?token=:token');
  assert.ok(config.rewrites.every(route => !route.source.includes('admin') && !route.source.includes('room-copies')));
  assert.ok(config.headers.some(route => route.source === '/room-copy/:path*' && route.headers.some(header => header.key === 'Cache-Control' && header.value === 'no-store')));
});
