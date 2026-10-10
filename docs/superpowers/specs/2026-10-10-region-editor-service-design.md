# Region editor phase 3: the build service on ionos1 — design

Status: quick-mode enrichment of #168, 2026-10-10. Builds on the approved
[region editor design](2026-10-09-region-editor-design.md) (sections 1, 2, 3, 5) and on phase 1
(`region.build_world`, #166; race #179). This file records only what phase 3 decides on top of that design.

## Goal

A small HTTP service on ionos1 (VPS DE) that accepts a frame, queues it, builds it with the phase 1 pipeline
(imported as a library), and serves the result as static files to the game on GitHub Pages — within the limits
of the design's table, with 30-day retention and a 10 GB store cap.

## Shape

```
Traefik (myRateLimit@file, TLS) ──► rhyflitzer-api      (uvicorn + Starlette, mem_limit 512m)
                                      │  POST /api/jobs, GET /api/jobs/<id>, GET /api/worlds/<id>, GET /api/health
                                      │  GET /api/challenge (ALTCHA), GET /api/preview
                                      │  GET /worlds/<id>/{world.json, terrain.mmh, meta.json}
                                      │  PUT/DELETE /api/admin/gallery/<id>   (bearer token)
                                      ▼
                               /data (one volume)
                                 service.sqlite3   queue = worlds table, builds per day, daily salts, kv
                                 worlds/<id>/      published worlds; worlds/.<id>.tmp while building
                                 extract/switzerland-latest.osm.pbf
                                 cache/            swisstopo tiles, pruned to 1 GB per collection
                                      ▲
                               rhyflitzer-worker   (same image, mem_limit 3g, cpus 2, no Traefik)
                                 loop: heartbeat → nightly cleanup (03 UTC) → weekly extract (Mon 04 UTC)
                                       → claim next job → subprocess `python -m rhyflitzer_api.build`
```

- **Two compose services from one image.** The 3 GB cap sits on the worker only, so an OOM kill takes down a
  build, never the API. SQLite in WAL mode on the shared local volume is safe across the two processes.
- **One build = one subprocess.** The worker relays its `STEP` lines into the job's `step`, kills it after
  10 minutes, and publishes `worlds/.<id>.tmp` → `worlds/<id>` with one rename, only on success.
- **Job id = world id** (`frame.world_id(snapped rect, PIPELINE_VERSION)`). One row per world is both the job
  and the world's metadata; a rebuild after expiry reuses the row, so the share link never changes.

## API contract (consumed by phase 2, the game, and phase 4, the editor)

| Request | Answer |
|---|---|
| `POST /api/jobs` `{"lv95": [e0, n0, e1, n1]}` or `{"lonlat": [w, s, e, n]}` | `202` job (new or already queued/building), `200` job when already built (cache hit, free); `400 {error, message}` with `bad-request`, `bad-bbox`, `too-small`, `too-big`, `outside-ch`; **`403` `human_check_failed`** (a NEW build without a valid ALTCHA solution in `"altcha"`); `429` `one-at-a-time`, `daily-limit`, `server-daily-limit`; `503` `busy` |
| `GET /api/challenge` | a signed ALTCHA challenge (`Cache-Control: no-store`); `503 human-check-unavailable` without the key file |
| `GET /api/preview?bbox=e0,n0,e1,n1` (LV95) | `{name, gemeinden, raceOk, reason?}`; `raceOk` is `true`, `false` (`reason: few-major-roads`) or `null` (`reason: no-road-index`); `400` as for `POST /api/jobs`; `429 preview-rate-limit` |
| `GET /api/jobs/<id>` | `{id, state, step, position?, error, message, lv95, files?}`; `state` ∈ queued, building, ready, failed, expired; `step` ∈ cutting, terrain, world, places, race, done; `404 unknown` |
| `GET /api/worlds/<id>` | `{id, status, bbox: {lv95: [e0, n0, e1, n1]}}` — #167's status call; the row stays after expiry (a tombstone), because the id is a hash and "Build it again?" needs the frame back; `404 unknown` |
| `GET /worlds/<id>/world.json` | `Cache-Control: no-cache`; every load revalidates, so **this request is the play signal** (`lastPlayed` in the store and `meta.json`, at most hourly) |
| `GET /worlds/<id>/meta.json` | `Cache-Control: no-cache` |
| `GET /worlds/<id>/terrain.mmh` | `Cache-Control: public, max-age=86400` |
| any other `/worlds/<id>/…`, or a world that is not ready | `404 {error: expired | not-ready | unknown}` |

World ids are exactly 12 lowercase hex characters (`^[0-9a-f]{12}$`), checked before any lookup. The zip
download (the three files + `LICENSE-ODbL.txt`) is packed in the browser by #167; the server has no zip route.
| `PUT /api/admin/gallery/<id>` `{title, description}` / `DELETE` | bearer token; pins/unpins a ready world (gallery worlds are never expired or evicted) |
| `GET /api/health` | `{status, queued, building, worlds, storedBytes, extract, workerSeenSecondsAgo}` |

CORS: `Access-Control-Allow-Origin` on `/worlds/*` and `/api/*`, only for `CORS_ORIGINS` (default
`https://github.freaxnx01.ch`).

## Human check (ALTCHA) on new builds

`POST /api/jobs` for a **new** build must carry `"altcha": <base64 payload>`, the solution of a challenge from `GET /api/challenge`. Playing, polling, downloading, gallery reads, a cache hit (the world exists) and joining a frame that is already queued or building never need it; for those the field is ignored and nothing is spent.

- **Server side: the `altcha` package** (PyPI, official `altcha-org/altcha-lib-py`, MIT, zero dependencies, 2.3.0 of 2026-10-04), PoW v2 like the `altcha` 3.x widget; `challenge.py` is a thin wrapper. A pure re-implementation was rejected: v2 signs a canonical JSON that mimics JavaScript number formatting, and would drift from the widget.
- **Parameters:** `PBKDF2/SHA-256`, `cost` 5000 iterations per try (`ALTCHA_COST`), key prefix `00` (one try in 256): ~1.3 M iterations per solve, about 1 s on a phone; verification is one derivation. Expiry 10 minutes.
- **HMAC key:** a Docker secret file (`ALTCHA_SECRET_FILE`), read per request, never logged; no key means `503` on the challenge and `403` on a new build (fail closed).
- **Replay:** the challenge signature goes into `used_challenges(signature, expires)` **inside the admission transaction**, before the limits: a second use is `403`, and a refusal by a limit (`429`/`503`) rolls it back, so the player can retry with the same solution. Expired rows are deleted on the next new build.
- The per-IP and global limits below stay as they are; the human check is an additional layer, and it is checked first (`403` before `429`).

## Frame preview

`GET /api/preview` answers without building, in well under 2 s and with little memory: **name and Gemeinden** from swisstopo's identify service (a point request at the centre and an envelope request, 0.9 s timeout each, cached per snapped frame; "A" or "A · B", centre first; a failed lookup is `name: null`); **`raceOk`** from a road index the worker builds after each weekly extract update: metres of primary/secondary/tertiary road (`places.MAJOR`) per 500 m LV95 cell, via `osmium tags-filter` (streaming, no cut) and pyosmium, stored in SQLite. A frame is `raceOk` with at least 3000 m of major road in its cells (`RACE_MIN_ROAD_M`), an estimate to calibrate against real builds. No human check; 60 requests per minute per client IP, in memory only.

## Limits (design section 2, enforced in `store.submit` inside one `BEGIN IMMEDIATE`)

Queue ≤ 20 waiting → `busy`; per IP 1 queued-or-building → `one-at-a-time`; per IP 5 new builds per UTC day
→ `daily-limit`; 100 new builds per UTC day → `server-daily-limit`. Cache hits, and joining a job that is
already queued, cost nothing. Job timeout 10 min. Complexity: > 20 000 buildings or > 50 000 road points →
`too-complex` (checked on the built world; a rebuild of that frame is refused without building again).
`source-unreachable` (any `requests` error) is retried twice, 30 s apart.

**IPs** are stored only as `sha256(daily salt : ip)[:16]`; the salt is random per UTC day and deleted with the
day's build counts at the nightly cleanup, so hashes cannot be linked across days. The client IP is the
rightmost `X-Forwarded-For` entry (the one Traefik appends); the container publishes no port.

## Retention and storage

- Nightly (first worker tick after 03:00 UTC): worlds unplayed for 30 days (`last_played`, else build time)
  are deleted and marked `expired`; the 10 GB cap evicts least-recently-played first; gallery worlds are
  exempt from both. Also: past days' salts and build counts, stray temp dirs, swisstopo tile caches pruned to
  1 GB each (`region.prune_tiles`). The cap is also enforced after every build.
- Weekly (Monday after 04:00 UTC, or at once when missing): Geofabrik's `switzerland-latest.osm.pbf` is
  downloaded to `.part`, checked against Geofabrik's `.md5`, then swapped in with `os.replace`. Any failure
  keeps the old file; a failed update is tried again at most hourly. Builds wait while no extract exists.
- Disk budget: worlds ≤ 10 GB, extract 0.55 GB (+ 0.55 GB during an update), tiles ≤ 2 GB, one build's temp
  ≤ ~1 GB: about 14 GB of the 58 GB free.

## Secrets, logging, deployment

- ALTCHA HMAC key: a Docker secret file (`ALTCHA_SECRET_FILE`), kept in Passbolt, API container only; never in the repo.
- Admin token: a Docker secret file (`ADMIN_TOKEN_FILE`), kept in Passbolt; read per request, compared with
  `hmac.compare_digest`, never logged. Missing file → every admin call is `401` (fail closed).
- Logs: one JSON object per line on stdout (`ts`, `level`, `logger`, `msg`, fields such as `world`); messages
  follow the repo's rule (attempt, then outcome with the cause).
- Image: `python:3.12-slim-bookworm` + `osmium-tool` (apt) + Node 20 copied from `node:20-bookworm-slim`
  (#179's race runs `prototype/route.js`). Built on ionos1 by compose from the git URL; no registry.
- The compose services, the DNS record and the secret live outside this repo: an operator checklist in
  `service/README.md` and in #168.

## Testing

pytest in `service/tests` with the build mocked (fake subprocess commands, a fake `region.build_world`,
fake HTTP for Geofabrik and swisstopo, challenges solved in-process at cost 1); no real build, no download, no Docker build in CI or by the implementing agent.
