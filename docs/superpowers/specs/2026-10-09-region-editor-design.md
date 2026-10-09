# Region editor — design

Status: approved in brainstorming 2026-10-09 (sections 1–5). Builds on the idea in
[`docs/04-region-editor.md`](../../04-region-editor.md) and on the Ehrendingen region (#127), the
first region built end to end with the pipeline as a CLI.

## Goal

Anyone who opens the game can drag a frame on a map of Switzerland and, a minute or two later, drive in
that area: real roads, terrain, buildings with measured heights, an automatic race, a J list. Worlds can
be shared by link, downloaded, and the best ones end up in a gallery the owner curates.

## Decisions

| Question | Decision |
|---|---|
| Audience | **Public, anonymous.** No accounts in v1. |
| Result | **Mix:** a share link kept 30 days after the last play, always downloadable as a zip, plus a gallery that only the owner curates. |
| Coverage | **Switzerland only** in v1 (gold tier: swisstopo terrain and DSM building heights). Built so more extracts (Baden-Württemberg first) can be added later. |
| Area model | **One rectangle per world**, 1 × 1 km to 4 × 4 km, snapped to a 250 m grid, entirely inside Switzerland. No tiles. |
| Gameplay | **Free driving + automatic race + automatic J list.** Blitz and Surprise hunt work on top. |
| Hosting | **Everything on ionos1 (VPS DE)** as one Docker service behind Traefik; the game and the editor page stay on GitHub Pages. |

Rejected: a tile grid (the game would have to stream and stitch tiles); builds on odroid-plus-pve (public
load on home infrastructure; can be added later behind the same API); builds in GitHub Actions (latency,
Actions limits, worlds in git).

## Measured basis (Ehrendingen, 2026-10-09)

- Area 3.4 × 4.4 km (15 km²). Total build about 70 s: cut 8 s, terrain 12 s, world 50 s.
- `osmium extract -s simple` from the whole Swiss extract (547 MB) peaks at **1.94 GB**, independent of
  the bbox size (`-s smart` needs about 3.6 GB).
- Output: `terrain.mmh` 3.7 MB, `world.json` 0.5 MB.
- swisstopo raw tiles downloaded per build: swissSURFACE3D about **850 MB**, swissALTI3D about 70 MB.
- ionos1: 6 cores, 11 GB RAM (about 5 GB available), 58 GB free disk, about 65 other containers.

## 1. Components and data flow

```
Player (browser)                     ionos1 (Docker, Traefik)                 External
editor.html (GitHub Pages)
  swisstopo map, frame ≤ 4×4 km  ──►  POST /api/jobs {bbox}
  (snaps to 250 m grid)               ├─ checks: inside CH, size, rate limit
                                      ├─ dedupe: same bbox → same world id
                                      └─ queue (SQLite) ──► 1 worker
                                                            ├─ osmium cut (-s simple) ◄─ CH extract (weekly, Geofabrik)
                                                            ├─ terrain.py             ◄─ swissALTI3D (swisstopo STAC)
                                                            ├─ osm.py build + DSM     ◄─ swissSURFACE3D
                                                            ├─ auto race + J list
                                                            └─ /data/worlds/<id>/{world.json, terrain.mmh, meta.json}
  polls GET /api/jobs/<id>  ◄──────  status: queued (position) / building (step) / done / failed
  "Drive!" → game ?world=<id>
game (GitHub Pages) ─────────────►   GET /worlds/<id>/world.json, terrain.mmh  (static, CORS, cache headers)
```

- **World id** = hash of the snapped bbox and the pipeline version. The same frame never builds twice.
- **Game:** `?world=<id>` loads like `?region=ehrendingen`, from the API host. `regions.js` gets a
  "generated" entry whose URLs and storage keys (IndexedDB terrain, best times) derive from the id.
- **Pipeline:** `pipeline/` gets `build_world(bbox, out_dir) → files`; the existing CLI and the API
  service both call it. One pipeline, no fork.
- **Server data:** Swiss extract (~550 MB, replaced weekly); swisstopo raw tiles only during a build
  (deleted afterwards, or a small LRU cache); results at ~5 MB per world.
- **Map in the editor:** swisstopo WMTS (free since 2021, no key, attribution). Never the public OSM tile
  servers or the public Overpass API.

## 2. Limits and abuse protection

| Limit | v1 value |
|---|---|
| Area | 1 × 1 km to 4 × 4 km, snapped to 250 m, entirely inside Switzerland (swissBOUNDARIES outline) |
| Workers | exactly 1; container `MemoryMax` 3 GB |
| Queue | at most 20 waiting jobs; beyond that "Server busy, try again later" |
| Per IP | 1 active job; at most 5 new builds per day (cache hits are free) |
| Global | at most 100 new builds per day |
| Job timeout | 10 min; then failed, temporary files deleted |
| Complexity | abort above 20 000 buildings or 50 000 road points, with a clear message |
| Disk | world store capped at 10 GB; oldest unplayed share worlds evicted first; gallery worlds never |

- IPs are stored only as a hash with a daily salt.
- No player free text in v1: a world's name is the Gemeinde at its centre (or "A · B" across a border).
- Rate limits in the API (SQLite) plus a Traefik rate-limit middleware against floods.

## 3. Share link, download, gallery

- **Share link** `https://github.freaxnx01.ch/game-rhyflitzer/?world=<id>`. Kept **30 days after the last
  play** (`meta.json` `lastPlayed`, updated at most hourly on load). A nightly cleanup removes expired
  worlds. An expired link shows "This world has expired. Build it again?" and reopens the editor with the
  same frame; the id, and so the link, stays the same.
- **Download:** "Download world" in the editor and the game gives a zip of `world.json`, `terrain.mmh`,
  `meta.json` and `LICENSE-ODbL.txt`. **Upload:** "Load world file" in the game reads the zip locally
  (IndexedDB), so it works offline and after the link expired.
- **Gallery:** only the owner adds worlds, via an admin endpoint with a bearer token (secret on ionos1
  and in Passbolt, never in the game). Gallery worlds are never evicted. `GET /api/gallery` lists title,
  description and id; the start screen shows them as a "Worlds" row beside the regions. v1 admin is a
  `curl` call or a small CLI script, no admin page.
- **Versioning:** `meta.json` records the pipeline version. On an incompatible format change, worlds are
  rebuilt on next load from their stored bbox, or marked "needs updating".

## 4. Generated content

| What | Generated from |
|---|---|
| Start | the `primary`/`secondary`/`tertiary` road point nearest the frame centre |
| Race | 5 checkpoints + finish on the road graph, 500–1200 m apart along the route, preferring major roads and named places, away from the frame edge; every leg checked drivable with A* (the `route.js` logic shared as a pure function or ported); par time from route length at an average speed |
| Checkpoint names | nearest OSM name (station, church, school, square, street), else "Checkpoint n" |
| J list | up to 15 places: `railway=station`, `amenity=place_of_worship/school/townhall`, `tourism=attraction/viewpoint`, `leisure=stadium`, `place=square`, and every village or town centre, under one chip named after the world |
| Village names | `place=village/town/hamlet` nodes |
| Gemeinde boundaries | already built by the pipeline |
| Forest | OSM `landuse=forest` / `natural=wood` (shared with #13) |
| Name | Gemeinde at the frame centre; "A · B" if the frame spans two |

- No hero assets (LANDI silo, Eiffel Tower, …): those stay exclusive to curated regions.
- If no race fits (too few roads), the world is built for free driving only, and the editor says so
  before building.

## 5. Licensing, errors, testing

**Licensing**
- OSM is ODbL: generated worlds are a derivative database. Attribution in the game (already there), the
  ODbL notice in `meta.json`, `LICENSE-ODbL.txt` in every download, and a line on the editor page.
- swisstopo: free use with "© swisstopo"; `meta.json` lists the actual tile sources and the game shows them.
- swisstopo WMTS: attribution in the editor map's corner.

**Errors**
- Job status per step: queued, cutting, terrain, world, race, done.
- Clear player-facing reasons: outside Switzerland, too big, too complex, server busy, build failed.
- Server logs follow the repo's logging rule (attempt, then outcome, with the cause on failure).
- swisstopo or Geofabrik unreachable: two retries, then "Data source unreachable, try again later". A
  failed weekly extract update keeps the previous file.

**Testing**
- Pipeline (pytest): `build_world` on a small fixed extract; pure functions for bbox snapping, the
  Switzerland check, the auto race and the J list.
- API (pytest): limits, dedupe, queue, retention, admin token, with the build mocked.
- Game (Playwright): `?world=<id>` against a local test server, zip upload, the expired-link page.
- Real-data builds run only by hand or on ionos1, never in CI.

## Phases

Each phase is its own issue with its own spec section → plan → PR.

1. **Pipeline library:** `build_world(bbox)`, auto race, J list, village names, OSM forest; a CLI that
   builds any Swiss rectangle. Usable on its own.
2. **Game:** `?world=<id>` from a URL, zip download and upload, expired-link handling.
3. **API service on ionos1:** queue, limits, storage, retention, Traefik routing, weekly extract update.
4. **Editor page:** swisstopo map, frame, status polling, "Drive!".
5. **Gallery:** admin endpoint and the "Worlds" row on the start screen.

## Open points for the plans

- The exact average speed for the par time and the medal thresholds (tune on two or three test worlds).
- Whether `route.js`'s A* is shared with the pipeline as a JS module run by Node, or ported to Python
  (decide in phase 1; prefer one implementation).
- The API host name (e.g. `rhyflitzer-api.freaxnx01.ch`) and routing via the `homelab-service-routing`
  skill (VPS-DE: Cloudflare DNS + Traefik labels).
