import { readFileSync } from 'node:fs';

const gallery = JSON.parse(readFileSync(new URL('../site/public/assets/gallery.json', import.meta.url), 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function renderGallery() {
  return gallery.map(model => `<article class="min-w-0" data-gallery-card>
    <div class="relative aspect-[1.45] overflow-hidden rounded-xl bg-[#e1e4db] md:aspect-[1.32]" data-viewer data-model="/assets/models/${escape(model.id)}.glb" data-name="${escape(model.name)}">
      <img class="absolute inset-0 size-full object-contain" src="/assets/${escape(model.id)}-front.webp" alt="${escape(model.name)}, a furniture model from Koini Lab3D" width="1200" height="850" loading="lazy" data-poster>
      <button class="absolute right-4 bottom-4 z-10 cursor-pointer rounded-full border border-[#bcc7b5] bg-[#f6f6f0]/90 px-4 py-2 text-xs text-[#354d3b] backdrop-blur-sm hover:bg-white" data-start>Explore in 3D ↻</button>
    </div>
    <div class="mt-4 flex items-baseline justify-between gap-3 md:block xl:flex"><h3 class="text-[22px] leading-tight tracking-tight">${escape(model.name)}</h3><span class="text-[10px] text-[#657267]">${escape(model.dimensions)}</span></div>
    <p class="mt-1 text-xs text-[#657267]">${escape(model.description)}</p>
  </article>`).join('\n');
}
