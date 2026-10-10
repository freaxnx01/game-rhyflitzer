# Region editor page — design (editor phase 4, #169)

Quick-mode enrich, 2026-10-10. Detail design for sections 1, 2, 4 and 5 of
[`2026-10-09-region-editor-design.md`](2026-10-09-region-editor-design.md) as seen from the browser page.
Phases 1 (#166, pipeline), 2 (#167, game), 3 (#168, API) are open and enriched in parallel; the contract
the page assumes is written down in "API contract" below.

## Goal

A static page on GitHub Pages, `editor/index.html` (`https://github.freaxnx01.ch/game-rhyflitzer/editor/`):
a swisstopo map of Switzerland with a draggable, resizable frame (1 × 1 to 4 × 4 km, snapped to 250 m in
LV95, entirely inside Switzerland). Before building it shows the world's name (the Gemeinde at the frame
centre) and warns when the frame will be "free driving only". **Build** first runs a short human check (ALTCHA) on the device (not for a world that already exists), then posts the frame to the API, the page
follows the job (queue position, then the build steps) and ends with **Drive!**, a share link and
**Download world**. Every API failure has a plain message. German and English via the shared `i18n.js`;
usable at 360 px with ≥ 44 px targets. All API/OSM/geo.admin text goes through `textContent`.

## Decisions

| Question | Decision |
|---|---|
| Map library | **Leaflet 1.9.4, vendored** under `vendor/leaflet/` (`leaflet.js` 148 kB, `leaflet.css` 15 kB, `LICENSE`, BSD-2-Clause). No marker images (unused). Raster WMTS only. |
| Map tiles | swisstopo WMTS, Web Mercator: `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg`, zoom 7–18, attribution `© swisstopo`. Never OSM tile servers. |
| Page location | `editor/index.html` + `editor/*.js` (ES modules), plus a root **`editor.html`** that redirects to `editor/` keeping the query (the same one-liner as the root `index.html:9`) — #167's expired-world panel links `../editor.html?bbox=…` (its A4). **Drive!** → `../?world=<id>`. |
| Coordinates | The frame lives in **LV95** (`[e0, n0, e1, n1]`, metres). Map ↔ frame through swisstopo's approximate formulas (≈ 1 m), pure JS, no proj library. |
| Frame on the map | A Leaflet `L.polygon` draws the true LV95 rectangle (4 corners). A DOM overlay above the map container carries the drag body and the 4 corner handles (44 × 44 px). |
| Switzerland check | Client-side against `pipeline/ch_outline.geojson` (phase 1, swissBOUNDARIES3D, ≈ 90 kB, fetched at load). The API's check stays authoritative. |
| World name | Live from geo.admin.ch `identify` on `ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill` at the frame centre (`timeInstant=<year>`, attribute `gemname`). CORS `*`, no key. The final name comes from the job (`A · B` across a border). |
| "Free driving only" | From `GET /api/preview?bbox=…` → `{ id, exists, name, gemeinden, raceOk, reason? }` (API contract below); only `raceOk === false` shows the note. If the endpoint answers 404, `raceOk: null` (no road index yet) or fails, no warning is shown before the build; the done card still shows it from the job's `race`. |
| Human check | **ALTCHA** (open source, MIT, self-hosted proof of work, no third party, no cookies), the official `altcha` web component vendored under `vendor/altcha/` (3.3.0, one file). **Only when the player presses Build**: `GET /api/challenge` → solved in the widget's Web Workers (~1 s) → sent as `altcha` in `POST /api/jobs`. Never for the preview, polling, downloads or page load, **and not for a world that already exists** (`exists` in the preview: that POST carries no solution). Invisible widget, no puzzle; the status „Checking you're human…" and all errors come from `editor/strings.js` (en/de). |
| State in the URL | `?bbox=e0,n0,e1,n1` (LV95, snapped) reproduces a frame — the entry point #167's expired-link page ("Build it again?") uses. The page rewrites it with `history.replaceState` on every commit. |
| Strings | Own table `editor/strings.js` (`en`/`de`, same shape as `prototype/strings.js`), language from `window.GG_LANG`, re-render on `gg-langchange`. |

Rejected:

- **Plain WMTS tiles on a canvas.** Saves 160 kB but pan, pinch-zoom, inertia, retina tiles and tile
  loading are the bug-prone part of a map on a phone; Leaflet has them solved. The frame logic (snap, LV95,
  Switzerland) is pure JS either way.
- **MapLibre GL** (vector, WebGL, ≈ 800 kB): overkill for raster tiles, and headless Playwright already
  struggles with WebGL.
- **Leaflet from a CDN** (like three.js in the game): the user asked for a vendored copy; it also keeps the
  page working when a CDN is blocked.
- **A Leaflet editing plugin** (Geoman, Leaflet.Editable): a second dependency for one rectangle.
- **Frame in WGS84 degrees**: the grid and the limits are metres in LV95; the API takes LV95.
- **Name from the API**: an extra round trip on every frame move; geo.admin answers in ≈ 100 ms and works
  before #168 exists.

## Page layout

Desktop (≥ 900 px): header strip, map on the left filling the rest, a 340 px panel on the right.
Phone (< 900 px): header, map 52 vh, panel below (page scrolls), `#game-nav` footer at the bottom.

See `docs/design/region-editor/wireframe.md` (ASCII) and `flow.md` (Mermaid) — written in Task 1.

Panel contents by state:

- **edit** — size readout `2.5 × 3.0 km`, world name (or `…` while loading, `—` when none), a hint
  „Drag the frame, pull a corner to resize", the "free driving only" note when `race === false`, the
  Switzerland error when outside, **Build** (disabled while outside CH or while the outline is loading).
- **verifying** (≈ 1 s) — „Checking you're human…", Build disabled.
- **submitting / queued / building** — a step list `Queued (#3) → Cutting → Terrain → World → Race → Done`
  with the active step lit, „about 1–2 minutes", and the world name.
- **done** — name, **Drive!** (primary, `../?world=<id>`), share link (read-only input + **Copy**),
  **Download world** (`<a download>`), „free driving only" when `race === false`, the ODbL / swisstopo line,
  **New frame** (back to edit).
- **failed** — the reason as a sentence, **Change the frame** (back to edit, keeps the frame).

Design tokens: the game's `:root` (`--charcoal --ink --sun --signal --cream --steel --steel-l --go --red`),
Bungee for the title, Barlow Condensed for everything else, `.btn` / `.btn.primary` as in
`prototype/index.html:84-86`. Dark page, no new fonts.

## Frame UX

- Initial frame: `?bbox=` if valid, else a 2 × 2 km square centred on Ehrendingen
  (`2667000,1259750,2669000,1261750`), the map fitted to it. Without `?bbox=` the map shows Switzerland
  first (`fitBounds` of the outline) and the frame sits at the default.
- **Move**: pointer down inside the frame, drag; the map does not pan while dragging the frame (the overlay
  sits above the map container and captures the pointer).
- **Resize**: drag a corner handle; the opposite corner stays fixed.
- **While dragging** the polygon follows the pointer unsnapped (ghost); **on release** the rectangle snaps
  to the 250 m grid and each side is clamped to 1–4 km (`clampRect`), then committed.
- **Keyboard**: the frame body is focusable (`tabindex=0`, `role=group`, `aria-label`). Arrow keys move it
  250 m; Shift + arrows grow/shrink it by 250 m (right/up grow, left/down shrink); each key press commits.
- **Commit** = snap → clamp → Switzerland check → polygon redraw → URL `?bbox=` → debounced preview
  (name + race, 400 ms).
- Outside Switzerland: the polygon turns red (`--red`), the panel says „The frame must lie entirely inside
  Switzerland", **Build** is disabled. Size over 4 km or under 1 km cannot happen after clamping.
- Map: `maxBounds` Switzerland with margin, `minZoom` 7, `maxZoom` 18; `L.control.scale` metric; the
  attribution control shows `© swisstopo`.

## Build flow and polling

1. **Build.** When the last preview for this frame said `exists: true`, go straight to step 2 without a solution. Otherwise state `verifying`: `GET /api/challenge`, then a fresh invisible `<altcha-widget>` solves it in Web Workers (`editor/human.js`). A preview that has not answered yet counts as "new" (full human check); the server is the authority either way.
2. `POST /api/jobs` with `{ lv95: [e0, n0, e1, n1], altcha? }` (LV95, snapped; `altcha` only after step 1). While in flight: state `submitting`, button disabled. A `403 human_check_failed` runs step 1 and the POST once more with a fresh challenge (this also covers a world that expired between preview and Build); a second refusal is shown as `errHuman`. A refused or unreachable challenge keeps its HTTP meaning (`errServer`, …).
3. `202` job view `{ id, state: "queued", position, … }` → state `queued`/`building`; `200` with `state: "ready"` (a cache hit, free) → `done` directly.
4. Poll `GET /api/jobs/<id>` (`state`, `step`, `position`; `/api/worlds/<id>` is #167's tombstone and has no progress) every 2 s, 5 s after the first minute (`pollDelay`). Stop on `ready` / `failed` / `expired`.
   A failed poll request (network) retries after the same delay and shows "Connection lost, retrying…" after
   3 misses in a row; it never gives up by itself.
5. `ready` → read `GET ${API_BASE}/worlds/<id>/meta.json` (`name`, `race`) for the done card (the preview's guesses stay if that fails) → **Drive!** `../?world=<id>`, share `https://github.freaxnx01.ch/game-rhyflitzer/?world=<id>`, **Download world**: #168 has no zip route, so the click fetches `world.json`, `terrain.mmh` and `meta.json` from `${API_BASE}/worlds/<id>/` and packs them with #167's `packWorldZip` (`../prototype/worlds.js`, imported on click; without #167 the click shows `dlError`). The id is validated (`/^[0-9a-f]{12}$/`, phase 1's `world_id`) before it goes into any URL.
6. Leaving the page during a build loses nothing: the same frame posts again and the API dedupes.
 (player-facing sentences, en/de)

| Source | Key | English |
|---|---|---|
| `400` `outside-ch` | `errOutsideCh` | The frame must lie entirely inside Switzerland. |
| `400` `too-big` / `too-small` / `bad-bbox` / `bad-request` | `errBadFrame` | That frame is not allowed: 1 × 1 to 4 × 4 km. |
| `403` `human_check_failed` (twice) / widget error or timeout | `errHuman` | The human check did not work. Please try again. |
| `429` `daily-limit` | `errRateLimit` | You have built enough worlds for today — try again tomorrow, or drive one you built. |
| `429` `one-at-a-time` | `errOneAtATime` | You already have a world being built. Wait until it is done, then build the next one. |
| `429` `server-daily-limit` | `errServerDaily` | The server has built all the worlds it can for today. Try again tomorrow. |
| `503` `busy` | `errBusy` | The server is busy right now. Try again in a few minutes. |
| `failed` `too-complex` | `errTooComplex` | Too many buildings or roads in this frame. Try a smaller one. |
| `failed` `source-unreachable` | `errSource` | A data source is not reachable right now. Try again later. |
| `failed` `timeout` / `build-failed` / other | `errBuildFailed` | The build failed. Try a different frame. |
| network / `5xx` / `503 human-check-unavailable` / unparsable | `errServer` | The server is not reachable. Check your connection and try again. |

## API contract (phase 3, #168 is authoritative)

Base URL: one constant `API_BASE` in `editor/api.js` (`https://rhyflitzer-api.freaxnx01.ch`, host name
confirmed 2026-10-10; one line to change). All responses JSON. CORS only for `https://github.freaxnx01.ch`
(#168's `CORS_ORIGINS`): a local run of the page needs its own origin added there. Errors are `{ error: "<code>", message }`.

| Call | Response |
|---|---|
| `GET /api/challenge` | `200` a signed ALTCHA PoW-v2 challenge (`{ parameters: {algorithm: "PBKDF2/SHA-256", cost, salt, nonce, keyPrefix, keyLength, expiresAt}, signature }`, good for 10 minutes, `no-store`) / `503 human-check-unavailable` |
| `GET /api/preview?bbox=e0,n0,e1,n1` (LV95) | `200 { id, exists, name, gemeinden, raceOk: true \| false \| null, reason? }` — cheap, no build; `id` is the world id of the snapped frame (12 lowercase hex), `exists` is `true` when a POST would only join or read that world (built, queued, building), so no human check is needed; `raceOk: null` = no road index yet; `400` as for jobs; `429 preview-rate-limit`. No human check. |
| `POST /api/jobs` `{ lv95: [e0,n0,e1,n1], altcha? }` (`altcha` needed only for a NEW build) | `202` job view (new or already queued/building) / `200` job view with `state: "ready"` and `files` (cache hit) / `400 { error: "bad-request" \| "bad-bbox" \| "too-small" \| "too-big" \| "outside-ch" }` / `403 { error: "human_check_failed" }` / `429 { error: "one-at-a-time" \| "daily-limit" \| "server-daily-limit" }` / `503 { error: "busy" }` |
| `GET /api/jobs/<id>` | the job view `{ id, state, step, position?, error, message, lv95, files? }`: `state` ∈ queued, building, ready, failed, expired; `step` ∈ cutting, terrain, world, places, race, done (while building); `position` only while queued; `error` ∈ too-complex, source-unreachable, timeout, build-failed on a failed job; `404 { error: "unknown" }` |
| `GET /worlds/<id>/meta.json` | `no-cache`; the final `name` (`A · B` across a border) and `race` (boolean) for the done card |
| `GET /worlds/<id>/{world.json, terrain.mmh}` | the files; with `meta.json` they are what **Download world** packs (no `world.zip` on the server) |

`GET /api/worlds/<id>` (`{ id, status, bbox }`) is #167's tombstone call and carries no progress; the editor does not read it.

`parsePreview(json)` reads the preview as `{ name, raceOk, id, exists }` (wrong types become `null` / `false`; `exists` needs a valid `id`). `parseJob(json)` maps the job view onto the page's status (`queued`, `cutting`, `terrain`, `world`, `race`, `done`, `failed`, `expired`) and throws on an unknown `state`; `parseMeta(json)` reads `{ name, race }`.


- Every piece of text from the API, geo.admin or the world (`name`, `reason`, `error`) is written with
  `textContent`; the page has no `innerHTML` with data in it. Own strings are set with `textContent` too.
- `id` validated before use in a URL; `?bbox=` parsed into numbers (`parseBbox`), never echoed as text.
- No secrets: the editor talks to public endpoints only. The ALTCHA payload is a one-time proof, not a credential; no cookie is set (`credentials: 'omit'`).
- The vendored widget is MIT, a single pinned file with a recorded sha256 (`vendor/README.md`); its workers are `data:` URLs.

## Mobile

360 px: single column, the map 52 vh, panel below, all buttons ≥ 44 px tall (the `.btn` is 64 px, `.btn.small`
raised to 44 px here), the corner handles 44 × 44 px, `touch-action: none` on the overlay so a drag moves the
frame, not the page. The Leaflet map keeps pinch-zoom. No horizontal scroll.

## Testing

- `node --test prototype/tests/editor-*.test.mjs`: `geo.js` (LV95 ↔ WGS84 at Bern and Ehrendingen within
  1.5 m, round trip, snap, clamp, move/resize, `parseBbox`, rectangle-in-outline with a square outline that
  has a hole), `api.js` (`parseJob`, `parseMeta`, `parsePreview`, `errorKey`, `isWorldId`, URLs, `pollDelay`, `gemeindeName`),
  `strings.js` (en/de parity, Swiss spelling).
- Playwright `prototype/tests/test_editor.py` against the repo served by the existing `server` fixture, with
  `page.route` stubs for WMTS tiles (1 × 1 PNG), geo.admin identify, `ch_outline.geojson` (a synthetic
  square with a hole, so the test does not need #166) and the API (`/api/jobs`, `/api/jobs/<id>`,
  `/api/preview`, `/worlds/<id>/…`, `/api/challenge` with a real-shaped cost-1 challenge that the widget actually solves): load without errors, drag moves and snaps, corner resize clamps at 4 km, outside the
  outline disables Build, keyboard move, build → queued #3 → steps → done with the Drive href and share
  link, every error row above, 360 px layout, EN/DE toggle re-renders. Frame-light (small viewport, no
  WebGL), foreground, under `systemd-run --user --scope -q -p MemoryMax=2G`.

## Assumptions

- **A1** [med] Leaflet 1.9.4 vendored under `vendor/leaflet/` (new dependency, new directory). Rejected:
  canvas tiles (pinch/inertia hand-written) and a CDN copy. Evidence: the repo has no `vendor/` yet; the
  game loads three.js from jsdelivr (`prototype/index.html:320`); the stack overlay allows `vendor/`.
- **A2** [med] The page is `editor/index.html` (clean URL `/editor/`); a root `editor.html` is a one-line
  redirect keeping the query, because #167 links `../editor.html?bbox=` (its plan, `EDITOR_URL`). The modules
  live beside the page, `../prototype/i18n.js` and `../prototype/version.js` are reused as classic scripts.
  Rejected: the whole page at the root (modules would sit in a folder the page is not in; `../?world=`
  would become `./?world=`). Evidence: `index.html:9` redirects the root to `prototype/` with the query.
- **A3** [med] The world name comes from geo.admin.ch `identify` (CORS `*`, verified 2026-10-10 with
  `timeInstant=2025` → one result `gemname: "Ehrendingen"`), not from our API. Phase 1 already uses
  geo.admin.ch for the outline (`2026-10-09-region-editor-phase1.md:21`).
- **A4** [med] The "free driving only" preview is `GET /api/preview?bbox=` → `{ id, exists, name, gemeinden, raceOk, reason? }`,
  as #168 specifies it (an estimate from a road index; the world's `race` in `meta.json` stays authoritative). If it is missing,
  `raceOk` is `null` or the call fails, the editor shows the note only on the done card.
- **A5** [low] HTTP codes and error codes as in "API contract": `400` + phase 1's frame codes, `429`, `503`,
  `failed.reason`. One mapping function `errorKey`; unknown → `errServer`.
- **A6** [med] There is no server zip (#168). **Download world** fetches the three files (`fileUrl`) and packs them with #167's `packWorldZip`, imported on click from `../prototype/worlds.js`; until #167 is merged the click shows `dlError`.
- **A7** [high] `?bbox=e0,n0,e1,n1` (LV95 whole metres) is the editor's input for a prefilled frame; #167's
  expired-world panel links `../editor.html?bbox=…` from the status endpoint's `bbox.lv95` (#167 A3/A4). The
  value is snapped and validated like any frame; an invalid one falls back to the default frame.
- **A11** [med] Progress is polled at `GET /api/jobs/<id>` (`state`, `step`, `position`; one URL function `jobUrl`). `/api/worlds/<id>` is #167's tombstone (`status`, `bbox`, no progress) and is not read. `POST /api/jobs` starts a build.
- **A8** [high] Strings in an own table `editor/strings.js`, not in `prototype/strings.js` (the game would
  load 40 unused keys; the parity test is copied). `translate` is 5 lines, duplicated on purpose.
- **A9** [high] The Switzerland check in the client uses the phase 1 file at `../pipeline/ch_outline.geojson`
  (GitHub Pages serves the whole repo). If #166 is not merged when this is implemented, Task 0 says how to
  generate the file (`ch_outline.py` from the #166 plan).
- **A10** [high] No one-way door: no credentials, no cost beyond free swisstopo/geo.admin calls, no public
  interface others depend on (the API contract is stated, not changed).

- **A12** [med] **Human check = the official `altcha` 3.3.0 web component, vendored** (`vendor/altcha/altcha.min.js`,
  sha256 `fc27a83d…ad829`, MIT; second vendored dependency after Leaflet), started only at Build, invisible, with the
  page's own de/en texts (the widget's i18n bundle, 178 kB, is not shipped). Rejected: a hosted CAPTCHA (third party,
  cookies, puzzle), a hand-written PoW (would drift from #168's `altcha` server library, which speaks the same PoW v2).
  The challenge is fetched by the page and handed to the widget, so a refused challenge keeps its HTTP status.

## Consequences

- New top-level directories `editor/` and `vendor/`, a root `editor.html` stub; 165 kB of vendored Leaflet.
- GitHub Pages now serves a second page; the hub card (`freaxnx01.github.io`) can link it later (phase 5).
- Every frame commit makes one geo.admin request and one API preview request (debounced 400 ms; the API limits previews to 60 a minute per client).
- A Build press for a new frame costs one ≈ 1 s proof of work on the device; a frame the preview reports as `exists` costs none; 120 kB more to load (gzip ≈ 34 kB).
- `pipeline/ch_outline.geojson` becomes a runtime asset of the site, not only a pipeline input: a change to
  it changes what the editor accepts.
- The `.btn.small` height differs between the game (40 px) and the editor (44 px) — the editor's own CSS.
- Playwright has a new test file (≈ 2 min); the node tests add three files.
- `CHANGELOG.md` `[Unreleased]` / Added gets a player-facing entry; `test-todo.md` gets a playtest section.

## Out of scope

Gallery (phase 5), accounts, a "use my location" button, map search, a frame rotated against the grid,
cancelling a job, the hub card.
