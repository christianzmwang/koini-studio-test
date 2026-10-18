import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('"Explore in 3D" buttons lazy-load and mount the real Three.js viewer instead of a placeholder', async () => {
  const source = await readFile('site/site.js', 'utf8');
  assert.match(source, /import\('\.\/viewer\.js'\)/, 'site.js must load site/viewer.js when a viewer is started');
  assert.match(source, /mountViewer\(host\)/, 'site.js must call mountViewer for the clicked viewer');
  assert.doesNotMatch(source, /Rate is too much/);
  const assets = await readdir('dist/assets');
  for (const file of assets.filter(name => name.endsWith('.js'))) {
    assert.doesNotMatch(await readFile(`dist/assets/${file}`, 'utf8'), /Rate is too much/);
  }
});

test('clicking "Explore in 3D" starts the viewer and reports a real failure honestly', async () => {
  const listeners = {};
  const appended = [];
  const start = { hidden: false, disabled: false, attrs: {}, addEventListener: (type, fn) => { listeners[type] = fn; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const host = {
    dataset: { name: 'Moss', model: '/assets/models/missing.glb' },
    querySelector: selector => (selector === '[data-start]' ? start : null),
    hasAttribute: () => false,
    append: node => appended.push(node),
    addEventListener: () => {},
  };
  const saved = { document: globalThis.document, fetch: globalThis.fetch, warn: console.warn };
  globalThis.fetch = async () => ({ ok: false });
  console.warn = () => {};
  globalThis.document = {
    querySelectorAll: selector => (selector === '[data-viewer]' ? [host] : []),
    createElement: () => ({ setAttribute() {}, hidden: false, textContent: '' }),
  };
  try {
    await import(`../site/site.js?test=${Date.now()}`);
    const status = appended[0];
    assert.ok(status, 'a status region is prepared for each viewer');
    assert.equal(status.hidden, true);
    await listeners.click();
    // Node has no WebGL, so mounting fails: the user must see an honest, retryable error, never a placeholder.
    assert.notEqual(status.textContent, 'Rate is too much');
    assert.match(status.textContent, /3D view could not be loaded/);
    assert.equal(status.hidden, false);
    assert.equal(start.disabled, false, 'the button can be used again to retry');
  } finally {
    globalThis.document = saved.document; globalThis.fetch = saved.fetch; console.warn = saved.warn;
  }
});
