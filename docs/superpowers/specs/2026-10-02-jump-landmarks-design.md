# Jump dialog as a searchable landmark list — design

Status: approved in chat 2026-10-02 · Issue #41

## Goal

The J dialog ("Jump to") becomes a list of the game's **3D landmarks**, **searchable by name** and **filterable by Gemeinde** (Dorf). Picking an entry puts the car on the nearest road there, as today.

Split off on 2026-10-02 (not part of this spec):

- #44 — extend the region west to Rheinfelden (Feldschlösschen).
- #46 — more in-region landmarks whose buildings are not in the world yet (Schloss Schönau, Gallusturm, Diebsturm, Bahnhof Bad Säckingen, Kursaal, Aqualon Therme, Bahnhof Eiken, Gemeindehaus Sisseln, Schulhaus Sisseln). Needs a local pipeline rebuild.
- #47 — extend the region south to Flugplatz Schupfart.
- #48 — toggle to show Gemeinde boundaries.

## Starting point (verified 2026-10-02 on `main` @ `4db004a`)

- `#jump` markup: `prototype/index.html:120` — a title, an `<ol>` and a hint line (`1–9, 0 or click · J / Esc closes`). CSS at `:34-35`.
- `PLACES` (`prototype/index.html:844`): village labels (minus `RHEIN`) + the two station checkpoints, max 9; fallback without a world: `CPS + FINISH`.
- `jumpTo(p)` (`:848`) snaps `{n, x, z}` to the nearest jumpable road and toasts `p.n`; `randomSpot()` (`:849`). Both stay unchanged.
- Key handling is one global `keydown` listener (`:815`). It records `keys[e.code] = true` for driving and fires single-key actions (`C` camera, `R` reset, `M` mute, `T`, `V`, `K`, `Q`, `E`, `H`, `+`/`-`, digits in the jump dialog). Typing into a text field today would trigger all of them.
- The list is filled once at `:928-929`.
- Landmarks reach the game only through the **generated** `data/world_hochrhein.json` (`anchors.landmarks.<key> = {x, z, kind, h, rot}`), which only the local pipeline can rebuild (`docs/11-pipeline-osm.md`). The OSM extract is not in the repo, so a CI agent cannot regenerate it.
- World buildings carry `id`, `ring` and `addr` (`docs/superpowers/specs/2026-10-02-street-labels-design.md`). Bodenackerstrasse 6 is building `171822634` (`addr` `6a–6d`), Bodenackerstrasse 10 is `171822943` (`10a–10f`); both stand in the world today (Winkelacker quarter keeps every building, `pipeline/anchors.json` `areas.winkelacker`).
- Pure, unit-tested helpers live in `prototype/world.js` with node tests in `prototype/tests/world.test.mjs`; Playwright tests in `prototype/tests/test_*.py` (`conftest.py` serves the repo root).

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Where names and Gemeinden live | New pure ES module `prototype/landmarks.js`. Positions still come from the world (anchor keys or building ids); only names and Gemeinden are hand-kept in the prototype. | Agent-implementable without a pipeline rebuild; no second source of positions. |
| Entry sources | An entry references **either** an anchor key (`anchor: 'muenster'` → `anchors.landmarks.muenster.{x,z}`) **or** a world building id (`building: 171822634` → mean of the footprint `ring` vertices). An entry whose anchor or building is missing from the loaded world is skipped. | The two Bodenackerstrasse houses are buildings, not anchors. |
| Landmark list | The 14 entries in the table below. | 12 existing 3D landmarks + 2 houses requested on 2026-10-02. |
| Gemeinde values | Hand-kept per entry; verified 2026-10-02 against OSM (admin_level 8 / Nominatim address). | No admin boundaries in the world file. |
| Gemeinde chips | `All` + the Gemeinden that occur in the entries, ordered **west → east**: Bad Säckingen, Stein, Münchwilen, Eiken, Sisseln. Single select; `All` is the default each time the dialog opens. | Five values fit as one row of chips; one click. |
| Search | Case- and accent-insensitive substring match on the **name** only: both sides `normalize('NFD')`, combining marks stripped, lower-cased. `munster` and `Münster` both find Fridolinsmünster. Search and chip combine (AND). | Spec asked for search by name; Gemeinde is the chip's job. |
| List order | By Gemeinde (west → east), then table order within a Gemeinde. **Random spot** is always the last row and is never filtered out. | Matches the chip order; random spot stays reachable. |
| Row content | Name left, Gemeinde right (muted). | Shows the Gemeinde when `All` is active. |
| Opening | `J` (overlay hidden) opens the dialog, clears the search, resets the chip to `All`, selects the first row and focuses the search field. | |
| Keys while open | Handled **before** the game handler, which then returns early: printable keys go into the search field; `↑`/`↓` move the selection (wrapping); `Enter`/`NumpadEnter` jumps to the selected row; `Esc` closes; `J` closes **only when the search field is empty** (otherwise it is a letter). No driving key is recorded in `keys` and no single-key action fires while the dialog is open. | Typing "c", "r", "m" must not change camera, reset or mute. |
| Digit shortcuts | **Removed** (`1–9`, `0`). | Digits now type into the search field; approved 2026-10-02. |
| Click | Clicking a row jumps; clicking a chip filters (keeps focus in the search field). | |
| No match | List shows only **Random spot**; no extra message. | |
| Fallback without world | Entries = checkpoints + finish (`CPS`, `FINISH`), no Gemeinde, **no chip row**. | Hand-traced layout has no anchors. |
| Hint line | `type to search · ↑↓ Enter · J / Esc closes` | |
| Language | UI strings stay English like the rest of the HUD; names are German proper nouns. #9 translates the UI later. | |
| Test hooks | `window.__mm.jumpList()` → `[{ n, g }]` of the rows currently shown (Random spot as `{ n: 'Random spot', g: null }`); the car position comes from the existing `window.__mm.car()` (`{ x, y, z, … }`). | Tests observe behaviour, not DOM internals. |

### Landmark table

| Name | Gemeinde | Source |
|---|---|---|
| Fridolinsmünster | Bad Säckingen | anchor `muenster` |
| Holzbrücke | Bad Säckingen | anchor `holzbruecke` |
| Fridolinsbrücke | Bad Säckingen | anchor `fridolinsbruecke` |
| Kirche Stein | Stein | anchor `steinChurch` |
| Bahnhof Stein-Säckingen | Stein | anchor `stationStein` |
| Plattform Sisslerfeld | Münchwilen | anchor `plattform` |
| DSM-Kamin | Eiken | anchor `dsmChimney` |
| Bahnhof Sisseln | Eiken | anchor `stationSisseln` |
| DSM-Wasserturm | Sisseln | anchor `dsmWaterTower` |
| Smile-Kreisel | Sisseln | anchor `smileKreisel` |
| Hallenbad Sissila | Sisseln | anchor `hallenbad` |
| Bodenackerstrasse 6c | Sisseln | building `171822634` |
| Bodenackerstrasse 10B | Sisseln | building `171822943` |
| Sprungschanze | Sisseln | anchor `jumpRamp` |

## Wireframe

```
┌─ Jump to ────────────────────────────────┐
│ [ münst_                               ] │
│ (All) (Bad Säckingen) (Stein) (Münchwilen)│
│ (Eiken) (Sisseln)                         │
│ ──────────────────────────────────────── │
│ ▶ Fridolinsmünster         Bad Säckingen │
│   Random spot                            │
│ type to search · ↑↓ Enter · J / Esc closes│
└──────────────────────────────────────────┘
```

Same panel style as today (`#jump`): dark plate, bevelled border, Barlow Condensed. Selected row and hover in `#ffc61a`; active chip filled, others outlined. The list scrolls (max height ~50 vh) and keeps the selected row in view. Phone width: chips wrap, panel max width `calc(100vw - 32px)`.

## Module interface — `prototype/landmarks.js`

```js
export const GEMEINDEN = ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln'];   // west → east
export const LANDMARK_INFO = [ { name, gemeinde, anchor } | { name, gemeinde, building }, ... ];  // the table above, in order
export function foldText(s) { /* NFD, strip combining marks, lower-case */ }
export function landmarkEntries(info, anchors, buildings) { /* → [{ n, g, x, z }], skips missing sources, sorted by GEMEINDEN index then info order */ }
export function filterLandmarks(entries, query, gemeinde) { /* gemeinde null = all; query '' = all */ }
export function gemeindenOf(entries) { /* GEMEINDEN that occur in entries, in order */ }
```

No DOM, no three.js; imported by the module script in `index.html`.

## Testing

- **Unit (node:test)** `prototype/tests/landmarks.test.mjs`: folding (`Münster` ↔ `munster`), anchor entry, building entry (ring mean), missing source skipped, ordering, search, chip, search + chip, `gemeindenOf`, `LANDMARK_INFO` has 14 entries with Gemeinden from `GEMEINDEN`.
- **Browser (Playwright)** `prototype/tests/test_jump.py` against the real world (skip without it, like the other tests): J opens and focuses the field and shows 14 + 1 rows; typing `münst` → Fridolinsmünster + Random spot; chip Sisseln → 6 Sisseln rows + Random spot; Enter jumps (car within 60 m of the landmark, dialog hidden); typing `r` and `c` while open neither resets the car nor changes the camera; `J` with text in the field types `j`, with an empty field closes; Esc closes; fallback without world shows the checkpoints and no chips.
- Manual playtest entry in `test-todo.md` (keyboard flow and phone width).

## Out of scope

- New landmark models or buildings (#46), region extensions (#44, #47, #19).
- Searching by Gemeinde name or by street address.
- The minimap double-click placement (`placeFromMap`) — unchanged.
