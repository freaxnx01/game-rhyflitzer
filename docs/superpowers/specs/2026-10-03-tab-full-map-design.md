# Tab shows the full map — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #77

## Goal

The issue: holding **Tab** runs the game three times faster (#20), and a run that used it does not count as a record. The tester wrote "Tab: macht irgendwie keinen sinn". The user decided on 2026-10-03 that Tab becomes a **full map while held**, like a scoreboard key in a shooter. The 3× time-lapse goes.

Success: while the player **holds Tab**, the minimap grows into a big map in the middle of the screen and shows the **whole region** (1×) with the car, the checkpoints and the finish. Releasing Tab puts the minimap back in its corner at the zoom the player had chosen. The game does not speed up anymore, and no run is marked "with time-lapse, not counted". The F1 help says what Tab does, in English and German.

## Starting point (verified 2026-10-03 on `main` @ `7e3f272`)

- Time-lapse: `loop` (`prototype/index.html:1104`) sets `HUD.scale = keys.Tab ? 3 : 1`, sets `R.fast = true` while Tab is held in an `armed`/`racing` state, and steps `stepCar`/`stepRace` `HUD.scale` times per frame. The `keydown` listener (`:889`) also sets `R.fast = true` on a Tab press in a race and lists `'Tab'` in its `preventDefault` set (this stops the browser from moving focus).
- Race flag: `startRace` (`:1004`) resets `R.fast = false`. `finish` (`:1007`) only saves a record when `!R.jumped && !R.fast`. `resultHtml` (`:1008`) adds `tr('notCountedFast')` when `R.fast`. `R.fast` is used nowhere else.
- Test hooks: `__mm.hud()` returns `timeScale: keys.Tab ? 3 : 1` (`:932`). `__mm.raceFlags()` returns `{ jumped, fast }` (`:942`).
- Strings: `notCountedFast` (`prototype/strings.js:33` en, `:131` de) and `keyTab` (`:86` en `game speed ×3 (hold; the run is not recorded)`, `:181` de). The F1 help line is `index.html:114`. `strings.test.mjs` enforces the same keys in `en` and `de`.
- Test: `test_hud_bundle` (`prototype/tests/test_smoke.py:385`) holds Tab and asserts `timeScale == 3`, then `1`, and `raceFlags().fast is True` (`:415`, `:426`). This is the only test that touches Tab.
- Minimap (#11): `#br` (`:150-154`) holds a title bar (`Map · Hochrhein · <#mapzoom>`, `N ↑`) and `<canvas id="map" width="800" height="400">`, shown at 400×200 CSS px (`:53`) and 240×120 under 900 px width (`:54`). `MAP = { zoom, … }`, `ZOOMS = [1, 2, 4, 8]` (`:1057`). `mapView()` (`:1058`) crops the pre-rendered `mapStatic` (800×400, the whole region) around the car at `MAP.zoom`. `worldToMap`/`mapToWorld` (`:1060-1061`) and `drawMap()` (`:1070`, called from `hud()` every frame) all go through `mapView()`. `stepMapZoom` (`:1062`) writes the `#mapzoom` label. Double-click/double-tap on the map places the car (`:1065-1068`) through `mapToWorld` and the canvas' bounding box, so it works at any CSS size. `__mm.map()` returns `{ zoom, cx, cz }` (`:1069`).
- Overlays: `#help` is centred with `z-index:21` (`:29`). `#br` has no z-index. The start/result overlay is `#overlay`. **C** only works while it is hidden (`:889`).
- Touch: the touch bar has only driving buttons (`:159-165`), and there has never been a touch control for Tab.
- CHANGELOG: the Tab sentence ("Hold **Tab** to run the game three times faster …") sits in `[Unreleased]` (`CHANGELOG.md:21`). The last release is `v0.2.0`, so the time-lapse never shipped in a release.

## Decisions

| Topic | Decision |
|---|---|
| What Tab does | **Hold Tab = full map** (user decision, 2026-10-03). Releasing it ends the full map at once. |
| Renderer | **The existing minimap, enlarged.** The `#map` canvas and `drawMap()` stay the only map renderer. While Tab is held, `#br` gets the class `full`, and CSS moves it to the middle of the screen and makes the canvas big. No second canvas, no second draw function. |
| View while full | The **whole region (1×)**, whatever zoom the player chose. `mapView()` uses `z = MAP.full ? 1 : MAP.zoom`. `MAP.zoom` is not changed, so the chosen zoom comes back on release. The `#mapzoom` label shows the zoom that is on screen (`1×` while full). |
| Size | `#br.full`: centred (`left:50%; top:50%; transform:translate(-50%,-50%)`, `right`/`bottom` reset), `z-index:20` (above the HUD, below the F1 help at 21). `#br.full #map`: `width:min(92vw, calc((100vh - 80px) * 2)); height:auto` — the canvas keeps its 2:1 shape and fits the screen. Two ids, so it also beats the `max-width:900px` rule for `#map`. |
| State | Read every frame, like the held keys N and B: `const full = !!keys.Tab && $('overlay').hidden`. A small `setFullMap(full)` changes `MAP.full`, the `full` class and the label only when the value changes. It is called from `hud()` right before `drawMap()`. `keyup`, `blur` and `openJump()` already clear `keys.Tab`. |
| Start overlay | Tab does nothing while the start/result overlay is open, same as C. |
| Game while held | **Keeps running.** No pause, no slow motion. The race clock keeps counting, so looking at the map costs time — like a scoreboard key. |
| Interactions while full | Unchanged and still working: double-click / double-tap places the car (through `mapToWorld`, now at 1×), the mouse wheel and **+**/**-** change `MAP.zoom` (shown after release). |
| Time-lapse | **Removed.** `loop` steps `stepCar`/`stepRace` once per frame. `HUD.scale` goes. |
| `R.fast` | **Removed** with everything that only served it: the `keydown` line, the reset in `startRace`, the check in `finish`, the `notCountedFast` part of `resultHtml`, the `notCountedFast` string (en + de) and `fast` in `__mm.raceFlags()`. `R.jumped` and `notCountedJump` stay. |
| `preventDefault` on Tab | **Kept** in the `keydown` listener, so Tab never moves browser focus. |
| Help | `keyTab` becomes `full map (hold)` / `ganze Karte (halten)`. The static English text at `index.html:114` changes with it. The line stays where it is. |
| HUD hint | **None added.** There is no HUD hint for Tab today. The full map explains itself the moment it opens. The F1 help is the only text about Tab. |
| Test hooks | `__mm.map()` gains `full` (bool). `__mm.hud()` loses `timeScale`. `__mm.raceFlags()` returns `{ jumped }`. |
| Touch | No touch button (there was none for the time-lapse either). |
| CHANGELOG | The Tab sentence in `[Unreleased]` (`CHANGELOG.md:21`) is rewritten: "Hold **Tab** to see the whole map big in the middle of the screen." The time-lapse never shipped, so there is no "Removed" entry. |

## Implementation sketch

```js
// next to MAP
function setFullMap(full) { if (full === !!MAP.full) return; MAP.full = full; $('br').classList.toggle('full', full); renderMapZoom(); }
const renderMapZoom = () => { $('mapzoom').textContent = (MAP.full ? 1 : MAP.zoom) + '×'; };
// mapView: const z = MAP.full ? 1 : MAP.zoom
// stepMapZoom: … ; renderMapZoom();
// hud(): setFullMap(!!keys.Tab && $('overlay').hidden); drawMap();
```

```css
#br.full{left:50%;top:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);z-index:20}
#br.full #map{width:min(92vw,calc((100vh - 80px) * 2));height:auto}
```

## Testing

TDD in a new `prototype/tests/test_full_map.py`, hand layout (`open_hand` from `test_minimap.py`, viewport 1280×720):

1. **Overlay gate:** with the start overlay open, hold Tab → `__mm.map().full` stays `false`.
2. **Full map while held:** click Start, press **+** twice (zoom 4). Hold Tab → wait for `full === true`. `zoom` is still `4`, `#mapzoom` reads `1×`, the map centre `(cx, cz)` equals the 1× centre measured before zooming, the `#map` box is wider than 1000 CSS px and its centre is within 2 px of the viewport centre (640, 360).
3. **Release:** release Tab → `full === false`, the zoom is 4 again, `#mapzoom` reads `4×`, the box is 400 px wide again.
4. **No time-lapse, the run counts:** after Start (race `armed`), hold Tab for a moment, release it, call `__mm.finishNow()` (`index.html:1046`). The result overlay does not contain `time-lapse`, `localStorage['mm.best2']` is set (a first finish saves the best time), `__mm.raceFlags()` has no `fast` key and `__mm.hud()` has no `timeScale` key. Today the Tab press sets `R.fast`, so the record is not saved and the result says `with time-lapse, not counted` — this test fails before the change.
5. **Help text:** `#help` contains `full map (hold)` and not `×3`.

`test_hud_bundle` (`test_smoke.py:415`, `:426`) changes because the feature it pins is removed: the Tab line checks `__mm.map().full` (`True` while held, `False` after), and the assertion drops `timeScale` and `raceFlags().fast`. `strings.test.mjs` keeps checking en/de key parity.

## Out of scope

- A touch control for the full map.
- A higher-resolution map canvas (the 800×400 canvas is upscaled while full).
- Labels, legend or extra layers that only the full map shows.
