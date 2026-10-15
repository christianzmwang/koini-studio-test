import { createServer } from 'vite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A local-only workbench. Native references and captures never enter public/ or dist/.
const referenceDirectory = process.argv[2] && resolve(process.argv[2]);
const output = resolve('.local/render-calibration');
const server = await createServer({
  server: { host: '127.0.0.1', port: 55874, strictPort: true },
  plugins: [{
    name: 'koini-render-calibration',
    resolveId(id) { if (id === 'virtual:koini-calibration') return '\0koini-calibration'; },
    load(id) { if (id === '\0koini-calibration') return `import ${JSON.stringify('/@fs' + fileURLToPath(new URL('./calibration-view.js', import.meta.url)))};`; },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        try {
          const url = new URL(request.url, 'http://localhost');
          if (url.pathname === '/__calibration') {
            response.setHeader('Content-Type', 'text/html');
            response.end(await vite.transformIndexHtml(url.pathname, '<!doctype html><html><head><title>Koini native rendering comparison</title></head><body><script type="module" src="/@id/virtual:koini-calibration"></script></body></html>'));
          } else if (/^\/__reference\/(oak|lightOak|herringbone)$/.test(url.pathname)) {
            const finish = url.pathname.split('/').pop();
            const view = ['iso', 'front', 'left', 'right', 'top'].includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'iso';
            if (!referenceDirectory && view !== 'iso') { response.statusCode = 404; response.end('Native reference missing for this view'); return; }
            const path = referenceDirectory ? `${referenceDirectory}/room-${finish}${view === 'iso' ? '' : `-${view}`}.png` : `site/public/assets/room-${finish}.webp`;
            try { response.setHeader('Content-Type', referenceDirectory ? 'image/png' : 'image/webp'); response.end(await readFile(path)); }
            catch { response.statusCode = 404; response.end('Native reference missing'); }
          } else if (url.pathname === '/__capture' && request.method === 'POST') {
            if (request.headers.origin !== 'http://127.0.0.1:55874') { response.statusCode = 403; response.end(); return; }
            const chunks = []; let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              if (size > 20_000_000) { response.statusCode = 413; response.end(); return; }
              chunks.push(chunk);
            }
            const { name, image, comparison, report } = JSON.parse(Buffer.concat(chunks).toString());
            if (!/^[a-zA-Z0-9-]{1,80}$/.test(name) || !image.startsWith('data:image/png;base64,')) { response.statusCode = 400; response.end(); return; }
            await mkdir(output, { recursive: true });
            await writeFile(`${output}/${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
            if (comparison?.startsWith('data:image/png;base64,')) await writeFile(`${output}/${name}-comparison.png`, Buffer.from(comparison.split(',')[1], 'base64'));
            await writeFile(`${output}/${name}.json`, JSON.stringify(report, null, 2) + '\n');
            response.end(`Saved ${name}`);
          } else next();
        } catch (error) { next(error); }
      });
    },
  }],
});
await server.listen();
console.log('Rendering comparison: http://127.0.0.1:55874/__calibration');
