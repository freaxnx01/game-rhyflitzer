# Region editor — flow

```mermaid
stateDiagram-v2
    [*] --> Loading: page load (outline + ?bbox= parsed)
    Loading --> Edit: outline loaded → frame drawn, preview requested
    Edit --> Edit: drag / corner / arrow keys → snap 250 m, clamp 1–4 km, CH check,\n?bbox= rewritten, name + race preview (400 ms debounce)
    Edit --> Verifying: Build (enabled only inside CH), preview did not say exists → GET /api/challenge, ALTCHA solved on the device (~1 s)
    Edit --> Submitting: Build, preview said exists → POST without a solution
    Verifying --> Submitting: solved → POST with the solution
    Verifying --> Failed: challenge refused / solving failed → errorKey / errHuman
    Submitting --> Verifying: 403 human_check_failed (once: fresh challenge)
    Submitting --> Queued: 202 {id, state queued, position}
    Submitting --> Done: 200 {state ready} (same frame built before)
    Submitting --> Failed: 400 / 403 (twice) / 429 / 503 / network → errorKey, or 202 {state failed} → failKey
    Queued --> Building: poll says state building (step cutting | terrain | world | places)
    Queued --> Queued: poll every 2 s (5 s after 60 s), position updates
    Building --> Building: poll, step advances
    Building --> Done: state ready → meta.json {name, race}
    Queued --> Failed: state failed {error}
    Building --> Failed: state failed {error}
    Done --> [*]: Drive! → ../?world=<id>
    Done --> Edit: New frame
    Failed --> Edit: Change the frame (frame kept)
```

**Keys while the frame has focus:** ← → ↑ ↓ move 250 m · Shift + ← → ↑ ↓ shrink/grow 250 m (right/up grow, left/down shrink; the
south-west corner stays) · Tab moves on to Build. The map keeps its own +/− and drag.

**Preview** (on every commit, debounced 400 ms, both in parallel, each ignored when a newer commit happened):
1. `GET api3.geo.admin.ch …/identify?geometry=<centre E,N>&layers=all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill&timeInstant=<year>&sr=2056` → `gemname`.
2. `GET ${API_BASE}/api/preview?bbox=e0,n0,e1,n1` → `{ id, exists, name, gemeinden, raceOk }`; `raceOk === false` → the free-driving note; `null`, 404 or an error → no note before the build; `exists === true` → Build skips the human check. No human check here.

**Polling:** `GET ${API_BASE}/api/jobs/<id>` (`state`, `step`, `position`; `expired` counts as failed); network miss → retry after the same delay, "Connection lost, retrying…" after 3 misses; never gives up. On `ready` the page reads `${API_BASE}/worlds/<id>/meta.json` (`name`, `race`) for the done card.

**URL:** `?bbox=e0,n0,e1,n1` in LV95 whole metres (snapped) is read on load and rewritten with `history.replaceState` on every commit — #167's expired-world panel links `../editor.html?bbox=…` (root stub → `editor/`).
