# Enterable buildings: marker, prompt, register and Jump filter (#409)

Status: enriched 2026-10-21, maintainer decisions applied 2026-10-21 (epic #414, first part). Entering itself is **not** here: it is #411 (6c) and #412 (hideout
objects), #413 (spiral stair, blocked on the model). This issue is the shared groundwork they all use.

## Goal

On foot (Z, #202) the player can tell which buildings and objects can be entered, and can find them:

- **In the world:** the entrance glows softly from about 15 m, on foot only.
- **Prompt:** standing at the entrance shows `E · Enter` in the bottom prompt line.
- **Minimap:** a small door icon on every enterable object that is ready (and revealed).
- **Register:** one pure data module, the single source of truth for everything enterable, plus a filter chip in the Jump dialog (J).

Nothing here walks through a door. The interface (`id`, names de/en, position, kind, `ready`, entrances, `secret`) is what #411 and #412 build on.

## Maintainer decisions this spec rests on

Confirmed 2026-10-21:

- **Key `E`, on foot only.** In the car `E` stays the right blinker.
- **Hideout objects (Eiffel, Atomium) are listed** in the J "Enterable" filter (and on the minimap) **only after `HIDE.found`**.
- **Titanic is not in the register.**
- **Wireframes approved** (saved under `docs/design/enterable-buildings/`).
- The J chip stays mouse/touch only (default, see the open question below).

Earlier:

- Enterable now or later: entries for things that are not yet enterable exist from day one with `ready: false` (#410-#413 flip them).
- On foot only; nothing shows while driving.
- **Privacy:** the register and every string name only the public address (Bodenackerstrasse 6c, Sisseln) and that the building will be
  enterable. Nothing about flats, floors or sides, in code, strings, tests or changelog.

## How it fits the existing code (evidence)

- **On foot:** `FOOT = { on, hover, vy, pitch, car }` (`prototype/index.html`, "#202 on foot"), `P` stays the position, `stepOnFoot(dt)`
  runs the pure `stepFoot` (`prototype/foot.js`). `footKeyAction(code)` in `foot.js` swallows the car's keys on foot.
- **Prompt line:** `#prompt` (HUD, filled in `hud(dt)`), e.g. `pontoonBuild: 'U · build a pontoon bridge'`. The format is `KEY · action`.
  The prompt is set per frame from a pure decision function (`pontoonPrompt` in `pontoon.js`) - the same split is used here.
- **J dialog:** `JUMP_ENTRIES = landmarkEntries(LANDMARK_INFO, anchors, buildings, gemeinden)` (`index.html`, `landmarks.js`), one entry
  `{ n, g, x, z, j?, look?, ramp?, wreck? }`. `crashyard.js` shows how a game-side entry is injected after the list is built
  (`yardEntry`, spliced in at `JUMP_ENTRIES`). `jumpRows()` -> `filterLandmarks(entries, query, gemeinde)`; `renderJump()` draws the
  Gemeinde chips from `gemeindenOf(...)`; the chip handler sets `JUMP.g`.
- **Landmarks** that become enterable already exist: `Bodenackerstrasse 6c` (`building: 171822634`), `Plattform Sisslerfeld`
  (`anchor: 'plattform'`), `Reservoir Hübel` (the hideout, deliberately named without the tower) in `LANDMARK_INFO`.
- **Hideout objects** live in star rooms: `ROOMS` in `rooms.js` (`eiffel`, `atomium`, `titanic`; `signed: false` - nobody points at
  them, finding them stays a surprise), room frame from `roomLayout(k)`. The hideout counts as found via `HIDE.found`
  (`localStorage` key `mm.hideout`, `foundHideout()`).
- **Strings:** `strings.js` `STRINGS.en` / `STRINGS.de` with identical keys (`strings.test.mjs` pins that).

## Key choice: E, on foot only

Every letter on the keyboard is bound somewhere in `prototype/*.js` / `index.html` (checked 2026-10-21 by grepping `e.code ===`, `keys.Key*`,
`held(keys, [...])`, `FOOT_BLOCKED`, `TAKE_OVER_KEYS`, pause.js `TOGGLE`/`KeyX`/`Tab`/`F3`, carselect.js, startscreen.js):

| Key | Bound to |
|---|---|
| A D S W, arrows, Space, Shift | steering / walking / lift |
| B look back, C camera, F fly (hover on foot), G bounds, H horn, I navi, J jump, K trip, L lights, M mute, N nitro, O drive-to, P pause, Q/E blinkers, R reset, T style, U pontoon, V hide car, X photo, Y (by letter) borders, Z out/in | game |
| Digit1 | hazard lights |
| Enter / NumpadEnter | horn (and confirm in dialogs) |
| Tab, Esc, F1, F3 | map, pause/close, help, debug |

So no key is free in the car context. **Picked: `E`**, valid **only while FOOT.on**: `E` is the right blinker, but on foot
`footKeyAction('KeyE')` already returns `'block'` (the car's keys are swallowed, `foot.js` `FOOT_BLOCKED`), so the blinker cannot fire there
and the key is dead weight. `E` also reads as "Enter", which the prompt spells out. `footKeyAction('KeyE')` changes from `'block'` to
a new `'enter'`; the car context is untouched (`KeyE` while driving is still the right blinker, pinned by `test_smoke.py`). The issue's remark
"E and Enter are taken" is true for driving; it does not hold on foot. Confirmed by the maintainer (2026-10-21).

Touch: out of scope, like the whole of on-foot mode (spec 2026-10-17).

## Design

### Register: `prototype/enterables.js` (pure, no DOM, no three.js)

Mirrors `LANDMARK_INFO` / `landmarkEntries`: static info with references, a resolver that turns references into game coordinates.

```js
// kinds
export const KINDS = ['building', 'tower', 'hideout'];
export const ENTERABLE_INFO = [
  { id: 'bodenackerstrasse-6c', kind: 'building', name: { de: 'Bodenackerstrasse 6c', en: 'Bodenackerstrasse 6c' },
    gemeinde: 'Sisseln', landmark: 'Bodenackerstrasse 6c', building: 171822634, level: 'surface', ready: false, secret: false, entrances: [] },
  { id: 'plattform-sisslerfeld', kind: 'tower', name: { de: 'Plattform Sisslerfeld', en: 'Plattform Sisslerfeld' },
    gemeinde: 'Münchwilen', landmark: 'Plattform Sisslerfeld', anchor: 'plattform', level: 'surface', ready: false, secret: false, entrances: [] },
  { id: 'eiffel', kind: 'hideout', name: { de: 'Eiffelturm', en: 'Eiffel Tower' }, gemeinde: 'Münchwilen',
    landmark: 'Reservoir Hübel', room: 'eiffel', level: 'eiffel', ready: false, secret: true, entrances: [] },
  { id: 'atomium', kind: 'hideout', name: { de: 'Atomium', en: 'Atomium' }, gemeinde: 'Münchwilen',
    landmark: 'Reservoir Hübel', room: 'atomium', level: 'atomium', ready: false, secret: true, entrances: [] },
];
```

Entry fields (the contract #410-#413 fill in):

| Field | Meaning |
|---|---|
| `id` | stable kebab-case id; #411/#412 key their handler on it |
| `kind` | `'building'`, `'tower'` or `'hideout'` (drives the minimap glyph tint and nothing else) |
| `name.de` / `name.en` | display names, not via `tr()`: they are proper names, resolved by `enterableName(entry, lang)` |
| `gemeinde` | the J chip group, same strings as `GEMEINDEN` |
| `landmark` | the name of the existing J landmark this entry belongs to; the J row is that landmark, not a new place |
| position ref | exactly one of `building` (OSM id), `anchor` (anchors key), `at: [x, z]`, `room` (a `ROOMS` id, centre from `roomLayout`), resolved to `x, z` |
| `level` | `'surface'` or a room id (`isRoomLevel`); marker and prompt only fire when the walker is on that level |
| `ready` | `false` until the owner issue lands; only `ready` entries glow, prompt, get a door icon and a handler |
| `secret` | `true` for hideout objects: hidden everywhere (J filter, minimap, glow) until `revealed`, see below |
| `entrances` | `[{ x, z, th, w }]` or `[{ rel: [a, b], th, w }]` (relative to the resolved centre, along/across the entry's heading); `th` = the direction you walk **in**, `w` = door width (m). Empty while not ready |

Pure functions (all unit-tested, no DOM):

- `enterableEntries(info, anchors, buildings, roomCentres)` -> resolved entries `{ ...info, x, z, entrances (absolute) }`; an entry whose position cannot be resolved is dropped (as `landmarkEntries` does).
- `visibleEnterables(entries, revealed)` -> without `secret` entries unless `revealed` (revealed = `HIDE.found`).
- `enterableName(entry, lang)`.
- `nearestEntrance(entries, level, x, z, range)` -> `{ entry, entrance, d } | null`, ready entries on that level only.
- `enterPrompt(near)` -> `null | { id, key: 'KeyE' }`; non-null only at `d <= PROMPT_RANGE`.
- `glowStrength(d)` -> 0 at `GLOW_RANGE`, ramping to 1 at `PROMPT_RANGE` (smoothstep); 0 beyond.
- `filterEnterable(entries, onlyEnterable)` for the J list (below).
- Constants: `GLOW_RANGE = 15`, `PROMPT_RANGE = 2.5` (= `WALKER.enterReach`, the existing "close enough to the car" reach).

No new module imports `index.html`; `index.html` calls these once at startup (after `JUMP_ENTRIES`) and per frame.

### World marker (on foot only)

Per ready, visible, same-level entrance within 15 m: one soft additive glow - a camera-facing sprite or a flat quad on the door
sill, warm-white, opacity = `glowStrength(d)`, with a slow pulse (reduced to constant when `prefers-reduced-motion`). One pooled mesh
per entrance, created lazily the first time that entry is within range, hidden when `!FOOT.on`. It does not collide, is not in `OBB`,
and is never drawn in the car context (`FOOT.on === false` hides all). Cost: the nearest-entrance scan is over a handful of entries.

### Prompt

`hud(dt)` sets `#prompt` to `E · Enter` / `E · Betreten` while `enterPrompt(...)` is non-null and `FOOT.on`, else leaves the existing
prompt logic alone (the pontoon prompt is car-only, so they never compete). Pressing `E` calls `pressEnter()`: it looks up
`ENTER_HANDLERS[entry.id]` (a plain object in `index.html`, empty after this issue); #411/#412 add their handler. No handler -> toast
`enterSoon` ("Not enterable yet" / "Noch nicht begehbar"); unreachable while all entries are `ready: false`, kept as the guard.

### Minimap

A small door glyph (a 5x7 px dark door with a light frame) over each ready, visible, `level === 'surface'` entry on the map; hideout objects
are underground - on the surface map they show as **one** glyph at the Hübel only once the hideout is found. Painted in `drawMap()`
over the static map, so the static map and `__mm.mapBoxes` stay unchanged. Nothing is drawn while all entries are not ready.

### Jump dialog (J): "Enterable" filter

One extra chip in the chip row, after the Gemeinde chips, toggled by click/tap (the chips are mouse/touch today; no key, so no new
key binding inside the dialog, which also keeps the search field's typing). It composes with the Gemeinde chip and the text search (AND).

- Rows when the filter is on: the register's visible entries, each as its J landmark row (`landmark` name), so the jump works exactly as today (`jumpTo` -> a road next to the object; J always ends foot mode through `resetCar`, then Z gets you out).
- **Not-yet-enterable** entries are listed, dimmed, with a small `soon` / `bald` tag in the right-hand column instead of the Gemeinde. They stay jumpable (it is the same landmark).
- Hideout entries: the filter shows the single row `Reservoir Hübel` (already always listed) and no object names until `revealed`. Revealed: the rows are the object names (`Eiffelturm`, `Atomium`) and jump to the Hübel's jump point (rooms are reached by the lift).
- In drive/navi modes the chip is not shown (they are destinations on streets).
- State: `JUMP.enterable` (boolean) reset to `false` in `openJump`, like `JUMP.g`.
- The mechanism is a pure `jumpRowsFor(entries, enterables, { q, g, enterable }, revealed)` in `enterables.js`, so `index.html` only renders.

### Wireframes (approved 2026-10-21)

The ASCII wireframes (J dialog with the "Enterable" chip off and on, the on-foot glow and prompt states, the minimap glyph, the one-line
flow) were approved by the maintainer on 2026-10-21 and are saved in `docs/design/enterable-buildings/wireframe.md` (repo convention,
phase 1 of the UI workflow). They are not repeated here.

## Strings (de + en, Swiss spelling)

| Key | en | de |
|---|---|---|
| `enterPrompt` | `E · Enter` | `E · Betreten` |
| `enterSoon` | `Not enterable yet` | `Noch nicht begehbar` |
| `chipEnterable` | `Enterable` | `Begehbar` |
| `enterableSoon` | `soon` | `bald` |
| `keyEnter` | `on foot, at a glowing door: enter` | `zu Fuss, an einer leuchtenden Tür: betreten` |

`strings.test.mjs` already pins equal keys and arities. Help (F1) gets one row `<kbd>E</kbd><span data-i18n="keyEnter">` next to the Z row.

## Non-goals

- Entering, multi-level walking, inner shells, stair, lift (#411-#413).
- A keyboard way to toggle the J chip; a touch Enter button (on-foot touch is out of scope).
- Changing what the car context does with `E`.
- Any statement about the inside of 6c.

## Testing

- `node --test`: `enterables.test.mjs` (resolver, visibility, nearest entrance, prompt, glow, Jump rows), `foot.test.mjs` (`KeyE` -> `'enter'`; the other car keys stay blocked), `strings.test.mjs` (existing parity).
- No browser run is part of enriching. The implementing run does one targeted Playwright file (`test_on_foot.py` addition + `test_jump.py` addition), as the repo's rule for small changes.
- Since every register entry ships `ready: false`, the glow/prompt/door icon are not visible in the shipped game yet; the browser test therefore flips one entry to ready through a test hook (`__mm.enterables`, see the plan) and asserts glow, prompt and `E` -> toast, then flips it back.

## Acceptance criteria

1. `prototype/enterables.js` exists, pure, with the four entries above, all `ready: false`, hideout entries `secret: true`; no text names flats, floors or sides.
2. On foot next to a ready entrance: glow from 15 m, `E · Enter` within 2.5 m; in the car nothing shows.
3. `E` on foot reaches the entry's handler, or the `enterSoon` toast; `E` in the car is still the right blinker.
4. J has an "Enterable" chip that combines with Gemeinde and search; not-ready rows are dimmed with `soon`; hideout objects appear only after the hideout is found.
5. Minimap shows the door glyph on ready, visible entries only.
6. de + en strings; `node --test prototype/tests/*.test.mjs` green.

## Open questions (for the maintainer)

1. Should the J chip also be reachable by keyboard (e.g. a key inside the dialog)? **Default kept:** no, the chip is mouse/touch only like the
   Gemeinde chips today; revisit only if asked.

Resolved 2026-10-21: key `E` on foot only; hideout objects secret until the hideout is found; Titanic not listed; wireframes approved.
