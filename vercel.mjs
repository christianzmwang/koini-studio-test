import { routes } from '@vercel/config/v1';

export const config = {
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  framework: null,
  cleanUrls: true,
  rewrites: [
    routes.rewrite('/room-copy/:token([0-9a-f]{32})', '/api/room-copy?token=:token'),
    routes.rewrite('/privacy', 'https://koini-api.onrender.com/privacy'),
    routes.rewrite('/support', 'https://koini-api.onrender.com/support'),
  ],
  headers: [
    { source: '/(.*)', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] },
    { source: '/room-copy/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    { source: '/.well-known/apple-app-site-association', headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Cache-Control', value: 'public, max-age=3600' },
    ] },
  ],
};
