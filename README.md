# Koini Studio

Koini's public website at https://koinistudio.com, deployed on Vercel.

`site/` contains the HTML, CSS, client interaction and static render assets.
`npm run build` builds the gallery from `site/assets/gallery.json` and writes
`dist/`. The main Explore button opens the app overview on this page.

`vercel.mjs` routes `/room-copy/<32 lowercase hexadecimal characters>` to a
Node function that checks availability with a HEAD request to the existing
Koini API. It preserves expiry/revocation and never fetches room contents.
The landing page offers a different-host Universal Link, the existing custom
scheme and a copy-link/Safari fallback for embedded browsers such as Snapchat.
Both `koinistudio.com` and `open.koinistudio.com` serve the customer app's
`/.well-known/apple-app-site-association` file. The iOS app needs its matching
Associated Domains entitlement and an updated distribution build. Third-party
browsers can still refuse to open apps; there is no guaranteed web escape.
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
Cloudflare manages DNS; the apex and `open` subdomain use the project-specific Vercel CNAME with
proxying disabled. Deployment credentials and `.vercel/` stay out of Git.
