# Koini Studio

Koini's public website at https://koinistudio.com, deployed on Vercel.

`site/` contains the HTML, CSS, client interaction and static render assets.
`npm run build` builds the gallery from `site/assets/gallery.json` and writes
`dist/`. The main Explore button opens the app overview on this page.

`vercel.mjs` proxies `/room-copy/<32 lowercase hexadecimal characters>` to the
existing Koini API, preserving its app-opening page and snapshot expiry checks.
Privacy and support are served from the existing backend pages. No customer
room data or credentials are bundled into this website.

The room images use Koini's RealityKit renderer and a synthetic furniture layout.
The furniture gallery renders the publicly published Moss, Cloud and Storfjord
models made in Koini Lab3D, in their original materials. Asset provenance is in
`docs/render-provenance.json`. Large USDZ models are not shipped to browsers.

```sh
npm ci
npm run build
npm test
```

Vercel project: `koini-studio`, team `christianzmwangs-projects`.
Cloudflare manages DNS; the apex uses the project-specific Vercel CNAME with
proxying disabled. Deployment credentials and `.vercel/` stay out of Git.
