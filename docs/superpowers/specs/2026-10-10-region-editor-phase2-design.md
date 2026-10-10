# Region editor phase 2: the game loads a generated world — design

Status: quick-mode enrichment of #167, 2026-10-10. Builds on the approved
[region editor design](2026-10-09-region-editor-design.md) (sections 1 and 3) and on the file format of phase 1
(#166, plan `docs/superpowers/plans/2026-10-09-region-editor-phase1.md`, Task 4: `world.json` with a `region`
block, `terrain.mmh` "MMH1", `meta.json` "MMR1"). Security prerequisite: #176 (`esc()`, text-only `toast()`).

## What the player gets

- `?world=<id>` opens a generated world (12 hex characters, phase 1's `frame.world_id`). The HUD, the start
  screen and the J list carry the world's name; the race is there when the world has one, otherwise the
  start screen offers free driving and the surprise hunt.
- **Download world** (start screen, only in a generated world) saves `rhyflitzer-<id>.zip` with `world.json`,
  `terrain.mmh`, `meta.json` and `LICENSE-ODbL.txt`.
- **Load world file** (start screen, always) reads such a zip locally, checks it, keeps it in IndexedDB and
  reloads with `?world=<id>`. A saved copy wins over the host, so it works offline and after the link expired.
- An expired link shows "This world has expired. Build it again?" with a link to the editor
  (`../editor.html?bbox=e0,n0,e1,n1`, phase 4) and "Drive Hochrhein instead". The world behind the panel is
  Hochrhein, like the `?region=` fallback.

## Components

| Piece | Where | Pure / testable |
|---|---|---|
| Minimal zip reader and writer (stored + deflate, no zip64, no encryption) on the native `DecompressionStream` / `CompressionStream('deflate-raw')` | `prototype/zip.js` | yes, `node --test` |
| World id, host, URLs, editor link, strict file checks (`parseMmh`, `checkMeta`, `checkWorld`), loader with injected `fetch` / `idbGet`, zip pack / unpack, licence text | `prototype/worlds.js` | yes, `node --test` |
| `generatedRegion(id, world)`: a REGION-shaped entry whose storage keys derive from the id; `regionSearch` also drops `world` | `prototype/regions.js` | yes |
| Wiring: load before the layout, race-less worlds, region-row button, expired panel, upload, download | `prototype/index.html` | Playwright |

## Host and testability

- One constant `WORLD_HOST` in `worlds.js` (`https://rhyflitzer-api.freaxnx01.ch`, the host name #168 confirmed). Files: `${host}/worlds/<id>/{world.json,terrain.mmh,meta.json}`; status:
  `${host}/api/worlds/<id>` → `{id, status, bbox: {lv95: [e0, n0, e1, n1]}}` with `status` ∈ queued, building, ready, failed, expired (the same values as a job's `state` in #168; the game acts on `expired` only, any other status leaves the panel without a frame). Progress is not here: it is `GET /api/jobs/<id>`, which the game does not read.
- `?worldhost=http://127.0.0.1:<port>` overrides it **only** when the page itself is served from
  `localhost` / `127.0.0.1` and the override also points there. On GitHub Pages it is ignored, so a link cannot
  point the game at someone else's server. Playwright runs a second local HTTP server with CORS that serves
  fixture files, which also proves the cross-origin path.

## Untrusted input rules

- The id is checked against `^[0-9a-f]{12}$` before any URL or storage key is built from it.
- Zip: file ≤ 32 MB; 1–8 entries; names exactly from the allowlist (no folders, no `..`, no duplicates);
  methods 0 and 8 only; encrypted and zip64 entries refused; per-entry caps (`world.json`, `terrain.mmh`
  16 MB; `meta.json`, `LICENSE-ODbL.txt` 64 KB) checked against the declared size **and** while inflating
  (zip bombs stop at the cap); local header must match the central directory; CRC-32 must match.
- `meta.json`: `format === "MMR1"`, `id` a world id, `name` 1–80 chars, `bbox.lv95` four finite numbers,
  `license` a string. `world.json`: `format === "MMW1"`, `region.id === meta.id === <id>`, the arrays and
  `waterSdf` the layout reads, a well-formed `region` block (strings capped, numbers finite, ≤ 50 J places).
- `terrain.mmh`: magic `MMH1`, header length 2–4096 and 4-byte aligned, integer `w`/`h` 2–4096, finite
  `step > 0`, `x0`, `z0`, and the byte length exactly `8 + n + w·h·4`.
- JSON via `JSON.parse` only, never `eval` / `new Function`. All world text reaches the page through
  `textContent` or #176's `esc()`; status and error lines are text-only.

## Storage keys (derived from the id)

| What | Key |
|---|---|
| Saved world file (IndexedDB `mapmadness` / `kv`) | `world:<id>` → `{worldText, terrain: ArrayBuffer, metaText}` |
| Uploaded replacement terrain (existing "Load terrain") | `terrain:world:<id>` |
| Best time | `mm.best2.world.<id>` |

## Zip decision

Native streams plus a ~150-line reader/writer, not a vendored library. The subset is tiny (phase 3's Python
`zipfile` and our own writer produce stored or deflated entries, nothing else), the validation has to be ours
anyway, and the repo stays dependency-free. `deflate-raw` is in Chrome/Edge 103+, Firefox 113+, Safari 16.4+
and Node ≥ 21.2. Rejected: vendoring fflate (MIT, ~30 KB): a new third-party file to review and update, for
features we would refuse anyway.

## Out of scope

The API service (#168), the editor page (#169), the gallery row (#170), `lastPlayed` updates (server-side on
GET, phase 3), rebuilding outdated worlds, a par-time display.
