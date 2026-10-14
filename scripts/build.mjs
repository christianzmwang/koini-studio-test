import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('site');
const output = resolve('dist');
const gallery = JSON.parse(await readFile(resolve(source, 'assets/gallery.json'), 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
if (gallery.length !== 3) throw new Error('Expected three actual Lab3D models for the gallery');
for (const finish of ['oak', 'lightOak', 'herringbone']) await access(resolve(source, `assets/room-${finish}.webp`));
for (const model of gallery) {
  if (!/^[a-z0-9-]+$/.test(model.id)) throw new Error('Invalid gallery identifier');
  for (const angle of ['front', 'side']) await access(resolve(source, `assets/${model.id}-${angle}.webp`));
}
const cards = gallery.map(model => `<article class="gallery-card"><div class="gallery-image"><img src="/assets/${model.id}-front.webp" alt="${escape(model.name)}, a furniture model from Koini Lab3D" width="1200" height="850" loading="lazy"><button class="angle-button" data-angle data-name="${escape(model.name)}" data-front="/assets/${model.id}-front.webp" data-side="/assets/${model.id}-side.webp" aria-pressed="false" aria-label="Show another angle of ${escape(model.name)}">Another angle <span aria-hidden="true">↻</span></button></div><div class="gallery-caption"><h3>${escape(model.name)}</h3><span>${escape(model.dimensions)}</span></div><p class="gallery-description">${escape(model.description)}</p></article>`).join('\n');
const html = (await readFile(resolve(source, 'index.html'), 'utf8')).replace('<!-- GALLERY -->', cards);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await writeFile(resolve(output, 'index.html'), html);
console.log('Built Koini Studio with three Lab3D models and three room finishes.');
