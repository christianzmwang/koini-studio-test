# Koini Studio

This is the disposable test copy of Koini Studio. The private repository is
`christianzmwang/koini-studio-test`; its Vercel project is `koini-studio-test`.
It uses a separate Google OAuth client and session secret. See
[the test environment record](docs/test-environment.md) for scope and cleanup.
The original project notes below describe the functionality copied here.

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
lights, stable contact-shadow geometry, multisample antialiasing, and a final
output pass using a measured RealityKit HDR colour-response atlas. The room's 43-degree camera and initial pose match the
RealityKit preview. Supplemental texture provenance is recorded in
`docs/surface-provenance.json`. Native texture origins, 3 cm wall thickness,
8.5 cm baseboards and noncasting walls match the app. Calibration evidence and
limits are recorded in `docs/render-calibration.json`.

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

## Google sign-in

The header's **Sign in** link opens `/auth/signin`. Google Identity Services
uses the existing Lab3D / Sofia Review web OAuth client. Studio verifies the ID
token with Google's official Node library, checks its browser-specific nonce,
and creates its own seven-day HttpOnly session. No Google access or refresh
tokens are stored. Studio sign-in is open to Google accounts accepted by the
shared Google consent configuration; it does not grant access to Lab3D or sync
the iPhone app's rooms or furniture.

Server configuration is `GOOGLE_CLIENT_ID`, `AUTH_SECRET` (a Studio-only random
value of at least 32 characters), and `AUTH_ORIGIN` (`https://koinistudio.com`
in production). A Google client secret is not used by this sign-in flow.
Google Cloud's existing client must list `https://koinistudio.com` under
**Authorized JavaScript origins**. Its existing Lab3D and Sofia redirect URIs
remain in place; this popup flow does not need a new redirect URI.

For local development, copy `.env.example` to `.env.local`, provide the client
ID and a separate session secret, then open `http://localhost:55873` after
`pnpm dev`. Register `http://localhost` and `http://localhost:55873` as JavaScript
origins on the same Google client. Vite's development and preview middleware
serve the same auth handlers as Vercel. Random preview deployment hosts send
visitors to the configured canonical sign-in host.

`api/auth.mjs` serves sign-in, callback, session, account, and POST-only sign-out
routes through `vercel.mjs`. `lib/auth.mjs` signs and verifies the session and
login transaction with separate JWT audiences. Callback requests require the
configured origin, a signed ten-minute login cookie, and a matching nonce in
the Google ID token. Account output escapes Google profile fields. Sign-out
requires a session-bound CSRF token. Auth responses are never cached.

`.vercelignore` excludes local exports, environment files, and build artifacts
from CLI uploads, in addition to the repository's `.gitignore` rules.

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

## Matching the native renderer

`pnpm calibrate .local/render-reference` starts a local comparison workbench at
http://127.0.0.1:55874/__calibration. It compares the same 1400 × 1080 camera
against colour-managed sRGB native PNGs: `room-herringbone.png`, `room-oak.png`,
and `room-lightOak.png`. Other angles use `room-<finish>-<view>.png`, with views
`front`, `left`, `right` and `top`. Without a reference directory it uses the
published native posters for the initial angle. Captures and numeric reports
stay in Git-ignored `.local/render-calibration/`; the workbench and references
are not production routes or bundled assets.

The browser's small, lossless `assets/rendering/realitykit-tone.png` is a
33 × 33 × 33 colour lookup atlas sampled from synthetic linear HDR colours
through RealityKit on the iOS 26.1 simulator. Its logarithmic input range is
0–15.9375. It approximates the native renderer's colour response; it does not
replace the materials, lighting or actual interactive geometry. Atlas sampling
happens in linear space, before the final sRGB conversion. Transparent edges
are unpremultiplied before tone mapping and premultiplied afterward.

To regenerate the atlas with Xcode and a booted iOS simulator:

```sh
xcrun -sdk iphonesimulator swiftc -O -target arm64-apple-ios26.0-simulator \
  -o /tmp/koini-native-tone scripts/export-native-tone.swift
xcrun simctl spawn YOUR_SIMULATOR_UDID /tmp/koini-native-tone /tmp/koini-native-tone-p3.png
magick /tmp/koini-native-tone-p3.png \
  -profile '/System/Library/ColorSync/Profiles/sRGB Profile.icc' \
  -filter point -resize 50% -depth 8 -strip \
  site/public/assets/rendering/realitykit-tone.png
```

Different native renderer versions, display gamuts, material conversions and
shadow implementations can still differ. The comparison uses native
RealityKit reference renders, rather than a measured physical iPhone display.
