import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GET } from '../api/room-copy.mjs';

const token = 'a'.repeat(32);
const request = (host = 'koinistudio.com', query = `token=${token}`) => new Request(`https://${host}/api/room-copy?${query}`);

test('invalid or ambiguous tokens cannot make upstream requests', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw Error('must not fetch'); });
  for (const query of ['token=short', `token=${token}&token=${token}`, 'token=%3Cscript%3E', '']) {
    assert.equal((await GET(request('koinistudio.com', query))).status, 404);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('live links verify availability without fetching room contents and offer both app-opening paths', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `https://koini-api.onrender.com/room-copy/${token}`);
    assert.equal(options.method, 'HEAD');
    assert.equal(options.cache, 'no-store');
    return new Response(null, { status: 200 });
  });
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  const html = await response.text();
  assert.ok(html.includes(`href="https://open.koinistudio.com/room-copy/${token}"`));
  assert.ok(html.includes(`href="koini://room-copy/${token}"`));
  assert.match(html, /Snapchat.*Safari/s);
  assert.match(html, /id="copy-link"/);
  assert.doesNotMatch(html, /window.location|location.replace|location.href/);
});

test('the opening subdomain offers a different-host universal link', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 200 }));
  const html = await (await GET(request('open.koinistudio.com'))).text();
  assert.ok(html.includes(`href="https://koinistudio.com/room-copy/${token}"`));
});

test('expired and stopped links remain unavailable and never show an app-opening button', async t => {
  for (const status of [404, 410]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status }));
    const response = await GET(request());
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(await response.text(), /id="open-room"|koini:\/\//);
    t.mock.restoreAll();
  }
});

test('upstream outages give a retry response without exposing the token or exception', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw Error('secret upstream error'); });
  const log = t.mock.method(console, 'error', () => {});
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret upstream error|aaaaaaaa/);
  assert.deepEqual(log.mock.calls[0].arguments, ['room_link_availability_check_failed']);
});

test('the app association matches the signed customer app and only room-copy paths', async () => {
  const association = JSON.parse(await readFile('dist/.well-known/apple-app-site-association', 'utf8'));
  assert.deepEqual(association.applinks.details, [{
    appIDs: ['9X55B435P8.com.christianwang.koini'], components: [{ '/': '/room-copy/*' }],
  }]);
});

test('the room landing page assets are included in the production build', async () => {
  for (const file of ['room-copy.css', 'room-copy.js']) {
    const source = await readFile(`site/public/${file}`, 'utf8');
    assert.equal(await readFile(`dist/${file}`, 'utf8'), source);
  }
});
