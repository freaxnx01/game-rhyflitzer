# Enterable Buildings Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On foot, enterable buildings and objects glow from 15 m, show `E · Enter` at the door, carry a door glyph on the minimap, and are listed in one pure register with an "Enterable" filter chip in the Jump dialog (J). Entering itself stays with #411/#412/#413.

**Architecture:** A new pure module `prototype/enterables.js` (node-tested) holds the register (`ENTERABLE_INFO`), the resolver and every decision (visibility, nearest entrance, prompt, glow strength, Jump rows). `foot.js` gains one key action (`KeyE` -> `'enter'`). `index.html` wires it: resolve at startup, per-frame glow and prompt, `pressEnter()` with an empty `ENTER_HANDLERS` object, a minimap glyph, the J chip. `strings.js` gets the de+en strings.

**Tech Stack:** Vanilla JS (ES modules), three.js (one pooled glow sprite per entrance), `node --test`, pytest + Playwright (one targeted file each).

**Spec:** `docs/superpowers/specs/2026-10-21-enterable-buildings-register-design.md` (issue #409, epic #414).

## Global Constraints

- Buildless static game: no packages, no framework, no new assets (CLAUDE.md). The glow is a three.js primitive.
- **Privacy:** only the public address `Bodenackerstrasse 6c` and "will be enterable". No flats, floors, sides, residents - not in code, strings, tests, comments, CHANGELOG.
- All register entries ship `ready: false`; hideout entries `secret: true`. #410-#413 flip them; this plan must not make anything enterable.
- `E` is re-purposed **on foot only**. While driving `KeyE` is still the right blinker (`test_smoke.py` pins it) - do not touch `index.html`'s blinker line.
- Never modify a test to make it green. The one existing test that changes (`foot.test.mjs` line `footKeyAction_FTogglesHover_...`) changes because the spec changes `KeyE` from `'block'` to `'enter'`; Task 2 states it explicitly.
- New UI text goes through `tr()` with en and de entries, Swiss spelling (`strings.test.mjs`); key sets stay identical.
- `index.html` is the game itself (no bundler): edit it directly, small and surgical. Line numbers are from `main` @ `c7306b0`; re-find by the quoted code.
- CHANGELOG entry hand-written, player-facing, English, under `[Unreleased]`. Never `git cliff -o CHANGELOG.md`.
- Browser tests: foreground only, capped, targeted: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/<file> -q -p no:cacheprovider -k "<name>"`. Commit and push before the browser step. Never the full suite.

## Review Focus

1. **Car context unchanged.** Expected: `KeyE` while driving is still the right blinker. Pinned by `test_smoke.py` blinker test and `footKeyAction_*` (Task 2).
2. **Nothing visible in the shipped game.** Expected: all four entries `ready: false`, so no glow, prompt or glyph without the test hook. Pinned by `enterableEntries_AllShippedEntriesNotReady` (Task 1).
3. **Secrets stay secret.** Expected: hideout objects absent from the J filter, minimap and glow until `HIDE.found`. Pinned by `visibleEnterables_SecretUnrevealed_Hidden` and `jumpRowsFor_HideoutUnrevealed_OnlyReservoirRow` (Task 1).
4. **No privacy leak.** Expected: no register or string text beyond the address. Pinned by `enterables_Text_NamesNoFlatFloorOrSide` (Task 1).
5. **Interface for #411/#412.** Expected: `ENTERABLE_INFO` fields and `ENTER_HANDLERS[id]` are the whole contract. Pinned by `enterableInfo_Entries_HaveTheContractFields` (Task 1).

---

### Task 1: Pure module `enterables.js`

**Files:**
- Create: `prototype/enterables.js`
- Test: `prototype/tests/enterables.test.mjs`

**Interfaces:**
- Produces: `KINDS`, `GLOW_RANGE`, `PROMPT_RANGE`, `ENTERABLE_INFO`, `enterableEntries(info, anchors, buildings, roomCentres)`, `visibleEnterables(entries, revealed)`, `enterableName(entry, lang)`, `nearestEntrance(entries, level, x, z, range)`, `enterPrompt(near)`, `glowStrength(d)`, `jumpRowsFor(jumpEntries, enterables, filter, revealed)`.
- Consumes: `foldText` from `./landmarks.js` (pure); position resolution copies the `sourcePos` rules (`at` / `anchor` / `building` ring mean). Do not export from `landmarks.js`; keep this module independent.

- [ ] **Step 1: Write the failing tests.** Create `prototype/tests/enterables.test.mjs`, header comment `// #409: the enterable-buildings register -- pure helpers. node --test prototype/tests/enterables.test.mjs`. Tests (names exactly):
  - `enterableInfo_Entries_HaveTheContractFields`: every entry has `id` (kebab-case, unique), `kind` in `KINDS`, `name.de` and `name.en`, `gemeinde`, `landmark`, `level`, boolean `ready` and `secret`, array `entrances`, and exactly one of `building` / `anchor` / `at` / `room`.
  - `enterableEntries_AllShippedEntriesNotReady`: resolving `ENTERABLE_INFO` against a fake `anchors` ({ plattform: { x: 10, z: 20 } }), one fake building (`id` 171822634, a square ring) and `roomCentres` ({ eiffel: [0, 0], atomium: [500, 0] }) gives four entries, every `ready === false`, hideout ones `secret === true`.
  - `enterableEntries_UnresolvableReference_IsDropped`: no anchor `plattform` -> that entry is absent, the others stay.
  - `enterableEntries_RelEntrance_BecomesAbsolute`: an info with `at: [100, 200]` and `entrances: [{ rel: [3, 0], th: 0, w: 2 }]` gives `{ x: 103, z: 200, th: 0, w: 2 }`; an `{ x, z }` entrance passes through unchanged.
  - `visibleEnterables_SecretUnrevealed_Hidden`: `revealed = false` drops `secret` entries; `true` keeps all.
  - `enterableName_German_UsesDe`: `'Eiffelturm'` for de, `'Eiffel Tower'` for en; unknown language falls back to en.
  - `nearestEntrance_ReadyEntranceInRange_ReturnsItWithDistance`: a ready entry with one entrance, query 10 m away, range 15 -> `{ entry, entrance, d: 10 }`.
  - `nearestEntrance_NotReady_IsIgnored`, `nearestEntrance_OtherLevel_IsIgnored`, `nearestEntrance_OutOfRange_ReturnsNull`.
  - `nearestEntrance_TwoEntrances_PicksTheCloser`.
  - `enterPrompt_WithinPromptRange_AsksForKeyE`: `d = 2` -> `{ id, key: 'KeyE' }`; `d = 3` -> `null`; `null` -> `null`.
  - `glowStrength_FarEdgeZero_NearOne_MonotoneBetween`: `0` at 15 and beyond, `1` at 2.5 and nearer, strictly increasing between.
  - `jumpRowsFor_FilterOff_ReturnsJumpEntriesFiltered`: with `{ q: '', g: null, enterable: false }` the rows equal `filterLandmarks`-style filtering of the J entries (same objects).
  - `jumpRowsFor_EnterableOn_ReturnsLandmarkRowsOfVisibleEntries`: `enterable: true` -> only the J rows whose `n` equals a visible entry's `landmark`, de-duplicated (Reservoir Hübel once), in J order; each row gets `soon: true` when none of its entries is ready.
  - `jumpRowsFor_HideoutUnrevealed_OnlyReservoirRow`: unrevealed -> the Hübel row keeps its landmark name; revealed -> rows named by `enterableName` (Eiffelturm, Atomium) carrying the Hübel's `x, z, j`.
  - `jumpRowsFor_GemeindeAndQuery_Compose`: `g: 'Sisseln'` leaves only 6c; `q: 'platt'` leaves only Plattform.
  - `enterables_Text_NamesNoFlatFloorOrSide`: JSON of `ENTERABLE_INFO` and the `enter*`/`chipEnterable`/`keyEnter` strings of both languages contain none of `/wohnung|flat|stock|floor|etage|links|rechts|left|right|seite|side/i`.
- [ ] **Step 2: Run, expect failure** (module missing). `node --test prototype/tests/enterables.test.mjs` -> FAIL. verify: output shows `Cannot find module '../enterables.js'`.
- [ ] **Step 3: Implement** `prototype/enterables.js` per the spec's "Register" section. `ENTERABLE_INFO` is the four entries from the spec verbatim (6c, Plattform, Eiffel, Atomium; all `ready: false`). `GLOW_RANGE = 15`, `PROMPT_RANGE = 2.5`. `glowStrength` is a smoothstep between the two ranges. `jumpRowsFor` reuses `foldText` and the `filterLandmarks` rules (Gemeinde equality, folded substring on the name) - write them once locally, do not edit `landmarks.js`. Header comment states "pure, no DOM, no three.js" and the privacy rule. Small functions (<=20 lines), guard clauses.
- [ ] **Step 4: Run tests.** verify: `node --test prototype/tests/enterables.test.mjs` -> all pass (the text test needs Task 3's strings; until then it covers `ENTERABLE_INFO` only and reads the strings in Task 3 - add the strings assertions there).
- [ ] **Step 5: Commit.** `feat(foot): pure register of enterable buildings (#409)`.

### Task 2: `E` on foot

**Files:**
- Modify: `prototype/foot.js` (`FOOT_BLOCKED`, `footKeyAction`)
- Modify: `prototype/tests/foot.test.mjs` (the test at line ~106)

**Interfaces:**
- Produces: `footKeyAction('KeyE') === 'enter'`.
- Consumes: nothing.

- [ ] **Step 1: Update the test, stating why.** In `footKeyAction_FTogglesHover_CarKeysBlocked_RestPass` remove `'KeyE'` from the blocked list. This is the spec's deliberate change (E on foot is now Enter), not a green-making edit. Add `footKeyAction_KeyE_IsEnter`: `assert.equal(footKeyAction('KeyE'), 'enter')`, and `footKeyAction_OtherCarKeys_StayBlocked`: `KeyQ`, `KeyH`, `Enter`, `Digit1` -> `'block'`.
- [ ] **Step 2: Run, expect failure.** verify: `node --test prototype/tests/foot.test.mjs` -> `footKeyAction_KeyE_IsEnter` fails (`'block'` !== `'enter'`).
- [ ] **Step 3: Implement.** Remove `KeyE` from `FOOT_BLOCKED`; add `if (code === 'KeyE') return 'enter';` before the set lookup. Update the comment above (`F toggles hover; E enters a building; the car's own controls are swallowed`).
- [ ] **Step 4: Run.** verify: `node --test prototype/tests/foot.test.mjs` -> all pass.
- [ ] **Step 5: Commit.** `feat(foot): E is the enter key on foot (#409)`.

### Task 3: Strings and help row

**Files:**
- Modify: `prototype/strings.js` (en block and de block)
- Modify: `prototype/index.html` (help list, next to the `keyFoot` row)
- Test: `prototype/tests/strings.test.mjs` (existing parity) and `prototype/tests/enterables.test.mjs` (privacy test)

**Interfaces:**
- Produces: `enterPrompt`, `enterSoon`, `chipEnterable`, `enterableSoon`, `keyEnter` in both languages.

- [ ] **Step 1: Write the failing test.** In `enterables.test.mjs` extend `enterables_Text_NamesNoFlatFloorOrSide` with the five strings of `STRINGS.en` and `STRINGS.de` (import `../strings.js`), plus add `strings_EnterKeys_ExistInBothLanguages`: each of the five keys is a non-empty string in en and de, `enterPrompt` starts with `E · ` in both. verify: fails (keys missing).
- [ ] **Step 2: Implement.** en: `enterPrompt: 'E · Enter'`, `enterSoon: 'Not enterable yet'`, `chipEnterable: 'Enterable'`, `enterableSoon: 'soon'`, `keyEnter: 'on foot, at a glowing door: enter'`. de: `'E · Betreten'`, `'Noch nicht begehbar'`, `'Begehbar'`, `'bald'`, `'zu Fuss, an einer leuchtenden Tür: betreten'`. Place them after `footTooFar` (en and de). In `index.html` add `<kbd>E</kbd><span data-i18n="keyEnter">on foot, at a glowing door: enter</span>` right after the Z row (`<kbd>Z</kbd><span data-i18n="keyFoot">`).
- [ ] **Step 3: Run.** verify: `node --test prototype/tests/strings.test.mjs prototype/tests/enterables.test.mjs` -> pass.
- [ ] **Step 4: Commit.** `feat(foot): strings for the enter prompt and the Enterable chip (#409)`.

### Task 4: Wire the register in `index.html` (resolve, prompt, `E`)

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_on_foot.py` (add)

**Interfaces:**
- Consumes: `enterables.js` (Task 1), `footKeyAction` (Task 2), the strings (Task 3).
- Produces: `ENTERABLES` (resolved list), `ENTER_HANDLERS = {}`, `pressEnter()`, `window.__mm.enterables`.

- [ ] **Step 1: Write the failing browser test** `test_e_on_foot_at_a_ready_entrance_shows_the_prompt_and_reaches_the_toast` in `test_on_foot.py` (follow the file's existing fixtures: load, get out with Z). Flip a test entry ready through `__mm.enterables.setReady('plattform-sisslerfeld', true, [x, z])` (a hook that sets `ready` and one entrance at a world point), place the walker 2 m from it, assert `#prompt` text is `E · Enter` (English; the test sets `lang`), press `E`, assert the toast shows `Not enterable yet` (no handler) and the right blinker did **not** turn on; move 30 m away, assert the prompt is empty; flip back. Do not run it yet.
- [ ] **Step 2: Implement.**
  - Import from `./enterables.js` next to the `crashyard.js` import; right after the yard splice (`if (YARD) { ... yardEntry ... }`), build `ENTERABLES = enterableEntries(ENTERABLE_INFO, L ? L.anchors : {}, L ? L.buildings : [], hideoutRoomCentres())` where `hideoutRoomCentres()` returns `{ eiffel: roomLayout(0).centre, atomium: roomLayout(1).centre }` (import `roomLayout` from `./rooms.js` if not already; build lazily on first use so no mesh/layout cost at load when the hideout is absent). `revealed = () => !!(HIDE && HIDE.found)`.
  - `const ENTER_HANDLERS = {};` with a comment: "#411 / #412 add `ENTER_HANDLERS[id] = (entry, entrance) => ...`".
  - In `hud(dt)`: when `FOOT.on`, `const near = nearestEntrance(visibleEnterables(ENTERABLES, revealed()), levelNow(), P.x, P.z, GLOW_RANGE); HUD.enter = enterPrompt(near) && near;` and set `#prompt` to `tr('enterPrompt')` only when `HUD.enter`; otherwise do not touch the prompt (no competing prompt on foot). `levelNow()` is the existing level id used by `isRoomLevel` checks (find it by the `ROOM`/`LEVEL` state next to `levelFloorY`); on the surface it is `'surface'`.
  - In the keydown handler's existing foot block: `if (fa === 'enter') pressEnter();` (before the `if (fa !== 'pass')` swallow line; `'enter'` is not `'pass'`, so it is swallowed - the blinker cannot fire).
  - `function pressEnter() { const n = HUD.enter; if (!n) return; const h = ENTER_HANDLERS[n.entry.id]; if (h) h(n.entry, n.entrance); else toast(tr('enterSoon')); }`.
  - `window.__mm.enterables = { list: () => ENTERABLES.map(e => ({ id: e.id, ready: e.ready, secret: e.secret, x: e.x, z: e.z, entrances: e.entrances.length })), setReady: (id, ready, at) => { ... }, prompt: () => HUD.enter && HUD.enter.entry.id }` (a test hook, next to the other `__mm` hooks; `setReady` mutates the live entry).
- [ ] **Step 3: Run the node tests and the new browser test (foreground, capped, targeted).** verify: `node --test prototype/tests/*.test.mjs` green; `... pytest prototype/tests/test_on_foot.py -k enter` passes. Commit and push first.
- [ ] **Step 4: Commit.** `feat(foot): E · Enter prompt at ready entrances (#409)`.

### Task 5: Glow marker in the world

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_on_foot.py` (extend the Task 4 test or add one)

**Interfaces:**
- Consumes: `glowStrength`, `nearestEntrance` (Task 1), the entry's entrances.
- Produces: `window.__mm.enterables.glows()` -> `[{ id, opacity }]` for visible glows.

- [ ] **Step 1: Write the failing assertion** in `test_on_foot.py`: `test_a_ready_entrance_glows_on_foot_only` - flip the test entry ready, place the walker at 10 m: `glows()` has one entry with `0 < opacity < 1`; at 2 m opacity is `1`; at 20 m the list is empty; get back into the car (Z) at 10 m from it (teleport the car with `__mm.sim`/`placeFromMap` as the neighbouring tests do): the list is empty.
- [ ] **Step 2: Implement.** One pooled `THREE.Sprite` (additive blending, a tiny canvas radial gradient texture, warm-white, `depthWrite: false`, `depthTest: true`) per entrance, created lazily on first need, added to `scene`; each frame in the foot branch: for each ready, visible, same-level entrance set `position` at the door sill (entrance x, z; y = `groundH(x, z, P.y)` + 1.2), `scale` to the door width x 2.4, `material.opacity = glowStrength(d) * (0.85 + 0.15 * sin(t * 2))`; pulse constant under `matchMedia('(prefers-reduced-motion: reduce)')`; hide all when `!FOOT.on`. Not in `OBB`, no collider. Reuse the shared clock the neighbouring glows use (`CAM.t` or the loop's time) so it freezes with the pause.
- [ ] **Step 3: Run.** verify: the targeted pytest `-k glow` passes; commit and push first.
- [ ] **Step 4: Commit.** `feat(foot): enterable entrances glow from 15 m on foot (#409)`.

### Task 6: Jump dialog "Enterable" chip

**Files:**
- Modify: `prototype/index.html` (`JUMP`, `jumpRows`, `renderJump`, chip handler, `openJump`, small CSS for the dimmed row and tag)
- Test: `prototype/tests/test_jump.py` (add)

**Interfaces:**
- Consumes: `jumpRowsFor`, `visibleEnterables`, `enterableName` (Task 1), strings (Task 3).

- [ ] **Step 1: Write the failing browser test** `test_enterable_chip_lists_the_register_and_composes_with_the_gemeinde_chip` in `test_jump.py`: open J, assert a chip `Enterable` exists; click it -> rows are the visible register landmarks (Plattform Sisslerfeld, Bodenackerstrasse 6c, Reservoir Hübel), each of the first two with a `soon` tag; click chip `Sisseln` too -> only 6c; click `Enterable` again -> full list again; reopening J starts with the filter off. In drive mode (`O`) the chip is absent.
- [ ] **Step 2: Implement.**
  - `JUMP = { q: '', g: null, enterable: false, sel: 0, rows: [], mode: 'jump' }`; `openJump` sets `JUMP.enterable = false`.
  - `jumpRows()`: for `jump` mode use `jumpRowsFor(JUMP_ENTRIES, ENTERABLES, { q: JUMP.q, g: JUMP.g, enterable: JUMP.enterable }, revealed())` instead of `filterLandmarks(...)`; keep the random-spot row only when the filter is off. Other modes unchanged.
  - `renderJump()`: after the Gemeinde chips append `<button type="button" data-enterable="1" class="on?">Begehbar/Enterable</button>` only in `jump` mode; rows with `soon` get class `soon` and the right-hand text `tr('enterableSoon')` instead of `r.g`. Chip click handler: a button with `dataset.enterable` toggles `JUMP.enterable` (it must not be read as a Gemeinde: the existing handler reads `dataset.g`, so branch first).
  - CSS: `#jump li.soon{opacity:.55}` and the chip reuses `#jump .chips button` styling.
  - `pickJump` is unchanged: rows are landmark rows (`x, z, j`, `look`) so `jumpTo(r)` works; revealed hideout rows carry the Hübel's `x, z, j`.
  - `window.__mm.jumpList` additionally returns `soon` so tests can read it.
- [ ] **Step 3: Run.** verify: `node --test prototype/tests/*.test.mjs` green; `pytest prototype/tests/test_jump.py -k enterable` passes; the other `test_jump.py` tests are NOT run in full (rows unchanged when the filter is off, pinned by `jumpRowsFor_FilterOff_ReturnsJumpEntriesFiltered`).
- [ ] **Step 4: Commit.** `feat(jump): Enterable filter chip (#409)`.

### Task 7: Minimap door glyph

**Files:**
- Modify: `prototype/index.html` (`drawMap`)
- Test: `prototype/tests/test_minimap.py` (add)

**Interfaces:**
- Consumes: `visibleEnterables`, `ENTERABLES`, `revealed()`.
- Produces: `window.__mm.enterables.mapMarks()` -> `[{ id, x, z }]` drawn this frame.

- [ ] **Step 1: Write the failing test** `test_a_ready_enterable_gets_a_door_glyph_and_a_not_ready_one_does_not` in `test_minimap.py`: with all entries not ready `mapMarks()` is `[]`; flip `plattform-sisslerfeld` ready -> exactly that id; flip back -> `[]`. Hideout entries never appear before `HIDE.found`; after found, one mark at the Hübel, not one per object.
- [ ] **Step 2: Implement.** In `drawMap()`, after the static map blit and the existing overlays, loop over `visibleEnterables(ENTERABLES, revealed())` with `ready && level === 'surface'` (hideout entries collapse to one mark at the Hübel position, drawn once if any is ready), map the world point with the same transform the other map overlays use, and draw a 5x7 px door (dark rect, light 1 px frame). No change to `mapStatic` or `__mm.mapBoxes`.
- [ ] **Step 3: Run.** verify: `pytest prototype/tests/test_minimap.py -k door` passes (foreground, capped).
- [ ] **Step 4: Commit.** `feat(map): door glyph on enterable buildings (#409)`.

### Task 8: Changelog, regression pass

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]`)

- [ ] **Step 1: Entry.** Under `## [Unreleased]` -> `### Added`: "Zu Fuss siehst Du jetzt, welche Gebäude man betreten kann: der Eingang leuchtet ab etwa 15 m, an der Tür steht `E · Betreten`, und im Sprung-Dialog (J) zeigt der Filter „Begehbar“ nur diese Ziele. Betreten kann man sie erst, wenn die nächsten Teile fertig sind." Written in the changelog's existing language and voice (check the file's last entries first; use English if the file is English). No flats, floors or sides.
- [ ] **Step 2: Full node suite.** verify: `node --test prototype/tests/*.test.mjs` -> all pass.
- [ ] **Step 3: Targeted regression.** verify, foreground and capped, one file at a time: `test_on_foot.py -k "z_gets_out or enter or glow"`, `test_smoke.py -k blinker` (E while driving is still the right blinker), `test_jump.py -k "chip_filters or enterable"`. Do not run the full browser suite.
- [ ] **Step 4: Commit.** `docs(changelog): enterable buildings are marked (#409)`.

## Self-review checklist

- Spec coverage: marker (Task 5), prompt (Task 4), minimap (Task 7), register (Task 1), Jump filter (Task 6), key (Task 2), strings (Task 3), changelog (Task 8).
- The interface for #410-#413 is `ENTERABLE_INFO` + `ENTER_HANDLERS`; nothing else needs to change for them.
- No placeholder types: every function named in a task exists in Task 1's produces list.
