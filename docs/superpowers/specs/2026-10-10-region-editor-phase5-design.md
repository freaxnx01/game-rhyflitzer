# Region editor phase 5: the curated world gallery — design

Status: quick-mode enrichment of #170, 2026-10-10. Builds on the approved
[region editor design](2026-10-09-region-editor-design.md) section 3 (gallery), on phase 2
([#167](2026-10-10-region-editor-phase2-design.md): `?world=<id>`, `WORLD_HOST`, ids of 12 lowercase hex chars) and on
phase 3 (#168, the API service on ionos1; its plan had not landed when this was written). Security prerequisite:
#176 (`esc()`, text-only `toast()`).

## What the owner and the player get

- **Owner:** adds a finished world to the gallery with a title and a short description, and removes it again,
  with `scripts/gallery.py add|remove|list`. No admin page. The admin routes are **not public** (#168): they run on the
  internal `rhyflitzer-admin` listener and are used over SSH only (a tunnel, or `docker exec` on ionos1). The bearer token is a
  secret on ionos1 and in Passbolt; it is never in the repo, the game or a command line.
- **Player:** the start screen shows a **Worlds** row beside the Region row. One button per gallery world (its
  title), the description of the focused/hovered one underneath. A click opens `?world=<id>`. With an empty or
  unreachable gallery the row is not shown at all, and nothing else changes.
- **Gallery worlds never expire:** the 30-day retention and the disk-pressure eviction skip them.

## API (lives in the phase 3 service)

| Call | Auth | Body / result |
|---|---|---|
| `GET /api/gallery` | none, public, cacheable 60 s | `[{id, title, description}]`, owner's order (`position`), at most 50 |
| `PUT /api/admin/gallery/<id>` | internal listener only (SSH), `Authorization: Bearer <token>` | `{title, description}`; the world must exist and be `ready`; adds or replaces; sets `meta.json` `pinned: true` |
| `DELETE /api/admin/gallery/<id>` | internal listener only (SSH), bearer | removes the entry; the world falls back to normal retention with `lastPlayed = now` |

- Token: the Docker secret file `ADMIN_TOKEN_FILE` of #168's `rhyflitzer-admin` service (never a file in the repo). Missing or empty:
  the admin routes answer 503, the public list still works. Compared with `hmac.compare_digest`;
  wrong or absent token is 401 with no detail; the failure is logged (no token, no IP, only a count).
- Validation: `<id>` against `^[0-9a-f]{12}$`; `title` 1–80 characters, `description` 0–300, both stripped of control
  characters and surrounding whitespace; body ≤ 4 KB; anything else 400 with a reason.
- Storage: table `gallery(id TEXT PRIMARY KEY, title, description, position, added_at)` in the service's SQLite.
  `position` = insertion order; re-adding an id keeps its position.
- Retention: the nightly cleanup and the 10 GB disk eviction call `is_pinned(id)` and skip those worlds.
- Logging follows the repo rule: log the attempt, then the outcome with the cause on failure.

## Game

- `prototype/gallery.js` (pure, no DOM): `galleryUrl(host)`, `cleanEntry(raw)`, `parseGallery(json)`, and
  `loadGallery({host, fetch})` which never throws and returns `[]` on any failure. The client re-validates
  everything the server sent (id regex, string lengths, control characters, at most 50 entries, no duplicate
  ids): the server is trusted for availability, not for rendering.
- Rendering uses `document.createElement` + `textContent` only (no `innerHTML`, so `esc()` is not even needed
  here); the description line is `textContent` too. The host is `worldHost(location.href)` from phase 2, so the
  Playwright stub can stand in for the API through `?worldhost=`.
- The fetch starts after the layout is up and never blocks play; timeout 5 s.
- `aria-pressed="true"` marks the gallery world currently being played.
- Strings (en/de): the row label `worldsRow` ("Worlds" / "Welten"). Gallery text itself is the owner's single
  language and is not translated.

## Decisions

- Admin = bearer token + `curl`/CLI, as the parent spec says. No admin page, no accounts.
- Order = the owner's insertion order; no sorting UI, no ratings, no categories.
- The row is hidden when empty so a fresh install looks exactly as today.
- Rejected: baking the gallery into the game repo as a JSON file (every addition would need a commit and a
  deploy, defeating "owner curates live"); a client-side cache of the list (60 s HTTP cache is enough).

## Out of scope

The editor page (#169), an admin page, search/filter, thumbnails, translations of titles, anyone but the owner
adding worlds. Creating the token and the Passbolt entry is a manual one-way door (see the plan's Assumptions).
