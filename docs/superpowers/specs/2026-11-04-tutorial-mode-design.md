# Tutorial mode for newcomers (#534)

## Goal

A player who has never played a driving game (the issue's trigger: a contact of the Verein Plattform Sisslerfeld could not get started) learns the core of the game in one guided run: drive, brake, follow the arrow, nitro, jump to a place with J, get out with Z, walk up the Plattform Sisslerfeld, take a photo with X, get back in. Each step ticks itself off as soon as the game sees the action; there is no "Next" button.

## Today

- Five modes: `MODES = ['cruise', 'trial', 'blitz', 'hunt', 'view']` (`startscreen.js:4`), one button each in the start screen bar (`index.html:445-449`), mapped by `MODE_BTN` (`index.html:4533`), labels via `modeKey` (`:4470`), `modeTextKey` (`startscreen.js:22`), `renderModeLine` (`:4471`), `renderOverlay` (`:4539`). `tests/startscreen.test.mjs:9` asserts the exact list.
- The viewpoint hunt (#508, #660) is the pattern to copy: pure module `viewpoints.js`, a run object `VIEW_RUN` (`index.html:4449-4450`), `stepView` dispatched from `stepRace` (`:4476`, `:4479`), a test hook `window.__mm.views` (`:4871`).
- Signals the tutorial can observe without new input code: speed `Math.hypot(P.vx, P.vz)`; `P.nitro` (`:4348`, set from Shift / N in `stepCar`); every jump (J dialog, map click, testhub) goes through `placeOnRoad` (`:3573`); `FOOT.on` (`:3695`), `getOut` (`:3814`, needs speed < 0.5) and `getIn` (`:3824`) via `pressZ` (`:3756`); a photo request sets `photoPending` (`:5029`) and `loop` (`:5099`) runs `stepRace` before the render that captures it; the Plattform deck test is `standsAt` / `shotPoints` from `viewpoints.js` with the `plattform` viewpoint (`viewpoints.js:12`, r 6 m, 5 m above ground, subject `dsmChimney`).
- HUD: `#tc` (`index.html:316-326`) holds `#keybar`, `#arrow`, `#dist`, `#cpname`, `#toast`; `hud()` (`:5020`) points the arrow at `R.target` and writes `#cpname`. Toasts: `toast` / `toastHtml` / `toastBig` (`:4459-4461`), one `#toast` element, so a later toast replaces an earlier one.
- Controls: `controls.js` (#535 phase 1) is the single table of actions per context, each entry with `keys`, `cap` (key-bar cap), `touch` (`'button' | 'menu' | null`) and `label` (a `strings.js` key). Phone controls (#535 phase 2: joystick, Gas/Brake, Z/J/C buttons, ☰ menu, `touch.js`) are being implemented and are not on `main` yet.
- Pause menu: `PAUSE_BUTTONS` / `pauseButtonsFor(mode)` (`pause.js:5`, `:10`); `openPause` (`index.html:4675`) hides `#pauserestart` per mode.
- Plattform Sisslerfeld: landmark x 304.8, z 427.1; the J jump lands on the Geuerenstrasse 25 m east of it (`landmarks.js:20`, jump `[330.0, 418.6]`). The Hochrhein start is far away (x 1882.9, z -292.2).

## Decisions

| Topic | Decision |
|---|---|
| Form | A sixth mode `tutorial`, in game, not a separate page or overlay. `MODES` becomes `['cruise', 'trial', 'blitz', 'hunt', 'view', 'tutorial']`; own button `#tutorialbtn` after `#viewbtn` in the start screen bar, label "Tutorial" (en and de). |
| Where | Hochrhein only: the tutorial needs the Plattform (the `plattform` viewpoint) and its own point list. Like `view`, it is offered only where the world has viewpoints (`allowedModes` in `startscreen.js`); `index.html` also hides the button when `tutorialFor(REGION)` or the Plattform viewpoint is missing. Ehrendingen and generated worlds have no tutorial. |
| First visit | `localStorage['mm.tutorialDone']` absent: the start screen preselects the tutorial (`startModeFrom` returns `'tutorial'` unless `?mode=` names another allowed mode) and the button gets the class `first` (yellow outline). Finishing or quitting the tutorial writes `'1'`; then the start screen falls back to Cruise. Every storage access in try/catch; a throwing storage counts as "done" (no nagging when nothing can be stored). `?mode=tutorial` always preselects it. `lastModeFrom` never returns `tutorial` (the last-played slot does not reopen the tutorial). |
| Module | Pure `tutorial.js`: `TUT` constants, `TUT_KEY`, `TUTORIAL_STEPS`, `TUTORIAL_DEFS` (start pose and three checkpoints per region), `tutorialFor`, `howTo`, `stepsFor`, `tutorialStart`, `tutorialStep(state, observed)` returning the next state, `tutorialHint`. `index.html` gathers the observation each frame (`stepTutorial`, dispatched from `stepRace` like `stepView`) and keeps `TUT_RUN` like `VIEW_RUN`. |
| Start | The run starts on the Geuerenstrasse 205 m west of the Plattform (x 100, z 406.4), facing east, not at the region start. No clock: `R.state` stays `armed` (like Cruise) until the last step, then `finished`. `#tr` (time) is hidden (`body.tutorial`); the pips and counter show the steps ("3 / 9 steps"). |
| Steps | 1 `drive`: steer at least once and reach 20 km/h. 2 `brake`: below 5 km/h. 3 `checkpoints`: three tutorial checkpoints in order (Geuerenstrasse beside the Plattform x 250 z 414.1, Südspange x 386 z 399, Südspange south leg x 512.3 z 440), radius 8 m, in the car; the arrow points at the current one, `#cpname` says "Tutorial checkpoint n/3"; one marker (pillar + ring, same look as a race checkpoint) stands at the current one. The global `CPS` meshes are not used. 4 `nitro`: nitro held 1 s without a break, in the car. 5 `jump`: any jump that lands within 60 m of the Plattform (the J dialog's Plattform Sisslerfeld lands 26 m away). 6 `getOut`: on foot. 7 `climb`: standing on the deck (`standsAt` of the `plattform` viewpoint: 6 m radius, 5 m above ground); the arrow points at the Plattform. 8 `photo`: a photo taken on the deck facing the DSM chimney within 30° (`shotPoints > 0`); a photo off the deck or mis-aimed gets the viewpoint hunt's hint as the photo toast (`viewMiss` / `viewAim`). 9 `getIn`: back in a vehicle; the arrow points at the parked car. 10 `done`. |
| Wrong body | Car steps (1-4) while on foot show "Get back in the car first: <Z>"; foot steps (7-8) while in the car show "Get out first: <Z>". |
| Instruction | A dedicated hint line `#tuthint` in `#tc` right below `#cpname`, written every frame (only when the text changes), so toasts never overwrite it. Each completed step shows a short toast "✓ Step n/9 done" (3 s); each checkpoint "Checkpoint n/3" with the checkpoint sound. The photo step's confirmation is the photo's own toast (`photoNote`), so the "photo saved" toast does not replace it. |
| Input wording | Derived from `controls.js`: each step names a context and action (`drive`, `nitro`, `jump`, `getOut`, `walk`, `photo`, `getIn`); `howTo(step, coarse)` returns the key cap on desktop (`cap`, else the first key code without `Key`), and on a coarse pointer (`matchMedia('(pointer:coarse)')`) the entry's touch control: `button` → "[label]", `menu` → "☰ → label". The brake step overrides the key (`S`) and the touch label (`brake`). A step whose action has no touch control on a phone (today: nitro) is left out on phones, so the run there has 8 steps. |
| #535 phase 2 | #534 is dispatched only after #535 phase 2 is merged. The implementer reads `controls.js` and `touch.js` on `main` at that time and uses whatever touch metadata phase 2 added (a better touch label or symbol for an entry wins over the generic `label`; if phase 2 gives nitro a touch control, the nitro step is kept on phones automatically). |
| End | Step 10: `mm.tutorialDone` set, `toastBig` "Well done! You know the basics now. Next: Viewpoints or Cruise." (10 s), `R.state = 'finished'`, after 6 s the start screen with a result "Tutorial done / Next: Viewpoints or Cruise", focus on `#viewbtn` (or `#cruisebtn` where hidden). |
| Exit | In the tutorial the pause menu (Esc / P / II) shows Resume, Change vehicle, About, Key bar and **End tutorial** (`#pausetutorial`, replaces Restart and Main menu). End tutorial sets the flag and goes straight to the start screen (no abandon question; there is no clock). |
| Debug hook | `window.__mm.tutorial()` → `{ step, done }`, read-only. |
| Strings | All new texts in en and de in `strings.js`; German with real umlauts, `ss`, capitalised Du/Dir/Dein. |
| Tests | `node --test tests/tutorial.test.mjs` (pure step logic, TDD), additions to `tests/startscreen.test.mjs`, `tests/pause.test.mjs`, `tests/strings.test.mjs`; Playwright `tests/test_tutorial.py` runs through all steps with real key presses plus `__mm.place` / `__mm.setFootY` / `__mm.footSim`. |
| Test harness | A fresh Playwright context is a first visitor and would get the tutorial preselected, breaking every test that expects Cruise focused. `tests/hermetic_api.py` therefore seeds `mm.tutorialDone = '1'` in every new context through an init script, unless the URL contains `firstvisit` (a query parameter the game ignores). |
| Changelog | `[Unreleased]` → `### Added`, player voice, newest first. |

## Acceptance criteria

- The start screen has a sixth mode button "Tutorial" after "Viewpoints" on Hochrhein; it is hidden on Ehrendingen and generated worlds.
- With no `mm.tutorialDone` in localStorage, the start screen preselects the tutorial (focus on desktop, its intro text in the slot) and highlights its button; with the flag set, Cruise is preselected as before and the button is not highlighted.
- Starting the tutorial puts the car on the Geuerenstrasse west of the Plattform; the HUD shows "Tutorial · Hochrhein", the step pips and counter, no clock.
- A hint line below the checkpoint name always shows the current instruction, with key names on desktop and touch wording on a coarse pointer; toasts do not replace it.
- Each of the steps drive, brake, three checkpoints, nitro (desktop), jump to the Plattform, get out, climb onto the deck, photo of the DSM chimney, get back in completes on its own when the game observes the action, with a short confirmation toast.
- During the checkpoint step the arrow and a marker lead to the current tutorial checkpoint; the race checkpoints stay hidden.
- After the last step a big toast congratulates and suggests Viewpoints or Cruise, the flag `mm.tutorialDone` is `'1'`, and the start screen follows with the result and the Viewpoints button focused.
- In the tutorial, Esc opens the pause menu with "End tutorial" (no "Restart race", no "Main menu"); it sets the flag and returns to the start screen, where Cruise is now preselected.
- `window.__mm.tutorial()` returns `{ step, done }`.
- Every new text exists in en and de; German uses real umlauts, no ß, and capitalised Du/Dein.
- `node --test tests/*.test.mjs` passes, including the new `tests/tutorial.test.mjs`; `tests/test_tutorial.py` passes; the existing Playwright tests that expect Cruise preselected (`test_cruise.py`, `test_start_screen.py`, `test_viewpoints.py`) still pass.
- `CHANGELOG.md` has a player-facing `[Unreleased]` entry.

## Assumptions

- **A1** [high] Tutorial only where the Plattform viewpoint exists (Hochrhein). Rejected: a generic tutorial for every world; the jump/climb/photo steps need a known tower.
- **A2** [med] Start pose and checkpoint coordinates are taken from the OSM roads in `data/world_hochrhein.json` (Geuerenstrasse id -42004, Südspange id -42003). The implementer checks them in the browser (`__mm.roadDist() < 4` at each point). Rejected: reusing race checkpoints (wrong place, wrong meshes).
- **A3** [med] Steering is observed from the steering inputs (A/D/arrows, and the phone stick after #535 phase 2), not from yaw; "accelerate and steer" means steer at least once on the way to 20 km/h.
- **A4** [med] The photo step listens to `photoPending` in `stepTutorial`, so every way of requesting a photo (X key, phone ☰ → Photo) counts, without a new branch in the keydown dispatcher. A photo taken from the pause menu (X while paused) does not count; the pause skips `stepRace`.
- **A5** [high] No clock and no best time in the tutorial; it is a lesson, not a race. `R.state` stays `armed`, so Main-menu-style exits never ask to abandon.
- **A6** [med] A storage that throws counts as "tutorial done". Rejected: preselect on every visit for players with blocked storage.
- **A7** [med] The test harness seeds the flag (see Decisions). Rejected: editing every Playwright test that boots the start screen.

## Consequences

- The start screen keyboard text removal (#224, #268) is not part of this issue; F1 keeps the full key list.
- The hub screenshot of the start screen (freaxnx01.github.io) shows the tutorial highlighted when taken in a fresh browser.
- `tests/hermetic_api.py` gains a second job (seeding a returning player); its docstring says so.
- The phone layout of the mode grid (`index.html:227`): `#tutorialbtn` and `#carbtn` share the last row (today the car button spans it alone), so the grid keeps its four rows.
