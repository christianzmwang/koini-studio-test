import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { renderGallery } from './scripts/render-gallery.mjs';

export default defineConfig({
  root: 'site',
  plugins: [tailwindcss(), {
    name: 'koini-gallery',
    transformIndexHtml: { order: 'pre', handler: html => html.replace('<!-- GALLERY -->', renderGallery()) },
  }],
  build: { outDir: '../dist', emptyOutDir: true },
});
