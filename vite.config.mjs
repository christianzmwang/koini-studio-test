import { defineConfig, loadEnv } from 'vite';
import { Readable } from 'node:stream';
import tailwindcss from '@tailwindcss/vite';
import { renderGallery } from './scripts/render-gallery.mjs';

function authServer(server) {
  server.middlewares.use(async (req, res, next) => {
    if (!/^\/auth\/(signin|callback|session|account|signout)(\?|$)/.test(req.url || '')) return next();
    try {
      const { GET, POST } = await import('./api/auth.mjs');
      const init = { method: req.method, headers: req.headers };
      if (!['GET', 'HEAD'].includes(req.method)) Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' });
      const request = new Request(`http://${req.headers.host}${req.url}`, init);
      const response = await (req.method === 'POST' ? POST : GET)(request);
      res.statusCode = response.status;
      for (const [key, value] of response.headers) if (key !== 'set-cookie') res.setHeader(key, value);
      res.setHeader('Set-Cookie', response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { next(error); }
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['GOOGLE_CLIENT_ID', 'AUTH_SECRET', 'AUTH_ORIGIN']) if (env[key] && !process.env[key]) process.env[key] = env[key];
  return {
    root: 'site',
    plugins: [tailwindcss(), { name: 'koini-auth', configureServer: authServer, configurePreviewServer: authServer }, {
      name: 'koini-gallery',
      transformIndexHtml: { order: 'pre', handler: html => html.replace('<!-- GALLERY -->', renderGallery()) },
    }],
    build: { outDir: '../dist', emptyOutDir: true },
  };
});
