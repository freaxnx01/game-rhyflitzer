# Hideout tests red on main (#906) - Design

Three independent causes, each measured on origin/main (c955b30) on the GPU browser
(`PW_CDP_ENDPOINT=http://192.168.1.120:9223`).

## 1. Stein church .glb request (4 tests)

Measured: the server log of a hideout test shows all three landmark GLBs fetched at **boot**, one after the other, a second
apart (`fridolinskapelle-sisseln`, `kirche-bruder-klaus-stein`, `reformierte-kirche-stein`), before any drive. It is **not** a
preload near the hideout. `index.html:2866-2885`: an async IIFE loads every entry of `assets/landmarks/index.json` in sequence,
by design (#649: "the start does not wait"). The tests attach `page.on("request")` after the start click, so the last, third file
lands after the listener on a slow box and shows up as an "extra" request. The files are 2-6 KB each (11 KB total).

Decision: the boot load is deliberate (tiny, async, the churches are surface landmarks visible from the Hübel region); a
lazy "near Stein" loader would add proximity logic and pop-in for 11 KB. **Fix the tests**, not the game: the tests' invariant is
"the room / the Hübel fetch no *model* beyond the Eiffel", so surface landmarks are excluded explicitly by the names in
`assets/landmarks/index.json`. A stray model `.glb` still fails. (Line 1505 of `tests/test_hideout.py` already does this
by path; the others get the same rule.)

Also: line 565 waits for "any .glb" and can be satisfied by a landmark; it must wait for `eiffel_tower.glb`.

## 2. test_cave_mode_toggles_and_restores: 107 -> 115 programs (8 new)

Measured with `renderer.info.programs` before and after entering the cave, plus the owner mesh of each new program:

- 7 programs = the **vehicle glTFs** (`hatchback.glb` the player car, `bus.glb` the Postauto): Trim, Plate, Plain_7, Glass x3, Display.
- 1 program = the **ch-landmark** vertex-colour lambert (two churches in the cave scene).

Cause: the start pre-compile (`index.html:7319-7329`) runs once, in both looks, for what is in the scene then. The vehicle GLBs
(`loadVehicleModel`, `index.html:3555`) and the landmarks arrive later and are compiled in the day look only (the landmark warm-up
mesh is compiled day-only too, `:7328`), so their cave-look variants compile at the first cave entry: a real shader hitch, not
only a test artefact. Related to #734.

Fix (validated: 115 before == 115 inside, no new program):
- landmark warm-up mesh joins the scene before the cave pre-compile, so both looks compile it;
- `compileLooks(root)` compiles a late model in both looks (flip the cave look only on the surface, at k 0, not in the cave);
  called after `prepareGltfScene` in `loadVehicleModel`; guarded by `LOOKS_READY` (set after the start pre-compile, avoids a TDZ
  on `camera` when a model loads before the loop code runs).

## 3. test_t1_fades_between_day_and_cave_without_a_cut_both_ways (hover assertion)

Red in CI on PR#909 (run 43197562116), **green on main on the GPU browser** unthrottled: a timing flake, not a game bug.
Failing line: `len({r["on"] for r in hover}) == 1`. Measured with `Emulation.setCPUThrottlingRate` 8: each hover row places the car at
s = 39 + 2.5 sin(i) then lets 3 rAF frames run with the car still at 3 m/s (`T1_STEP`: `sim(..., v=3, ...)`), so the car drifts
0.40 m at normal speed and 0.56 m slow (dt capped at 0.05 per frame). Row i=8 (s 41.47) lands at 42.03 >= `CAVE_SWITCH_IN` 42;
`caveSwitch` hysteresis (`hideout.js:181`) then keeps `on` True (> 36) for the rest of the hover: `{False, True}`. The test's own
margin (0.5 m) is smaller than the frame-rate dependent drift.

Fix: the hover rows are meant to *hover*: place the car at v = 0 (T1_STEP takes a `v` parameter, default 3, hover passes 0). All
assertions unchanged. Not the same as #616 (black frames in the crop-brightness tests); both are slow-runner effects.

## Assumptions

- **A1** [high] Churches load at boot by design; tests exclude landmarks by name. Rejected: lazy near-Stein loader (11 KB, adds
  proximity logic and pop-in); widening the filter to any `.glb`. `index.html:2866-2885`, `tests/test_hideout.py:1505`.
- **A2** [med] `compileLooks` runs inside `loadVehicleModel` (a one-off compile at the arrival of each vehicle file, a few ms on the
  GPU, longer on swiftshader). Rejected: compile on first bus spawn (the hitch moves to gameplay).
- **A3** [med] The cave flip is skipped when not on the surface in the plain day look; those models keep compiling on first sight.
- **A4** [high] T1 is a test flake, fixed in the test (v = 0 hover). Rejected: widening the margin to 1 m (still frame-rate dependent).

## Consequences

- The start pre-compile now builds one more day+cave program set (the landmark lambert in the cave): negligible.
- Late vehicle GLBs add 7 cave-look programs at load time instead of at first cave entry.
