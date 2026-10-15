# Koini Studio

Koini’s public website at https://koinistudio.com, deployed on Vercel.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm test
```

Use Node 22.12+ and pnpm 10.28 (pinned in `package.json`). Vite serves the
site with hot reload at http://127.0.0.1:55873 and builds it to `dist/`.
`pnpm preview` serves the production build at the same address.

The HTML and viewer code live in `site/`. Styles use Tailwind CSS v4 utilities;
`site/global.css` contains only the Tailwind import and gallery source directive.
`site/public/` contains static assets. `scripts/render-gallery.mjs` generates
furniture cards from `site/public/assets/gallery.json` in both dev and production.

Each room and furniture preview opens a real Three.js viewer on demand. Drag
with one finger or the left mouse button to orbit; scroll/pinch to zoom;
right-drag or use two fingers to pan. The toolbar offers six camera angles,
rotation, zoom and reset. With the canvas focused, arrow keys rotate,
Shift + arrows pan, + / − zoom, and R resets. The viewers pause offscreen and
retain their image previews when WebGL or loading is unavailable. The renderer draws only
when the camera, finish, viewport or visibility changes.

`site/rendering.js` ports Koini's procedural HDR environment and floor bounce,
uses the original colour, normal, roughness and occlusion maps with metre-based
UV repeats, and keeps data maps in linear space. The viewer adds two soft shadow
lights, GTAO contact occlusion, multisample antialiasing, and one final tone-mapping
and sRGB output pass. The room's 43-degree camera and initial pose match the
RealityKit preview. Supplemental texture provenance is recorded in
`docs/surface-provenance.json`.

The furniture gallery uses the published Moss, Cloud and Storfjord models from
Koini Lab3D, converted to self-contained GLB files with original materials and
up to 2048 px WebP textures. Provenance is in `docs/render-provenance.json`.
The featured room is the user's selected “Meeting demo” room, matched to the
shared link using its saved room-sharing record on the iPhone. The public
`site/featured-room.json` contains only that room's dimensions, finishes and
three furniture placements. It uses the original Lukas and Moss models and
Koini's LACK table geometry. Both room viewers and the floor-plan illustration
use the same layout. Floor texture provenance is in `docs/floor-provenance.json`;
featured room provenance is in `docs/featured-room-provenance.json`.

The room's “Open shared room” link remains
`/room-copy/67f2a728937bcfaefb02e93b4513059e`. The 12-room iPhone export and its
other assets stay under Git-ignored `.local/rooms/` and are never bundled into
the public website. No account identifiers, credentials or other preferences
are retained by the export.

`vercel.mjs` routes `/room-copy/<32 lowercase hexadecimal characters>` to
`api/room-copy.mjs`, which checks availability with a HEAD request to the
existing Koini API without fetching room contents. Expired and revoked links
remain unavailable. The landing page offers a different-host Universal Link,
a custom-scheme fallback, and copy-link/Safari instructions for embedded browsers.

Both the apex and `open.koinistudio.com` serve the app association from
`site/public/.well-known/apple-app-site-association`. Universal Links also require
matching Associated Domains entitlements in an updated iOS build. Privacy and
support are forwarded to existing backend pages. These production rewrites are
handled by Vercel, not the standalone Vite dev server.

Vercel project: `koini-studio`, team `christianzmwangs-projects`.
Cloudflare manages DNS; the apex and `open` subdomain use the project-specific Vercel CNAME with
proxying disabled. Deployment credentials and `.vercel/` stay out of Git.

## Private access to saved iPhone rooms

Rooms currently stay on the phone; account sync includes furniture only.
With the phone unlocked, connected to this Mac, and Koini open, try:

```sh
pnpm rooms:export --device "YOUR IPHONE NAME"
```

The export uses Apple's `devicectl` and requires access to Koini's app container.
It temporarily reads the preferences file, extracts only `roomscanner.rooms.v1`,
and discards the rest. It then copies only furniture models and meshes referenced
by those rooms. It does not change the phone or contact the server. Add
`--rooms-only` to skip model/mesh transfers.

`rooms.json`, `index.json`, and assets are saved under `.local/rooms/`, which is
Git-ignored, outside the website, and excluded from Vite builds. Missing assets
are listed in `index.json`. Exported data stays private; selecting a room for the
public homepage is a separate source change. Container access was verified with the connected TestFlight iPhone: all 12 rooms
and their 10 referenced model files exported successfully. Keep the phone unlocked
and Koini open during future exports. Apple may restrict access on other devices.
