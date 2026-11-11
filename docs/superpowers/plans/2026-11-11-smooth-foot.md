# Smooth foot movement Implementation Plan (#895)

**Goal:** eased walking, key turning and camera yaw/pitch on foot, frame-rate independent. **Spec:** `docs/superpowers/specs/2026-11-11-smooth-foot-design.md`.

**Global constraints:** buildless; pure functions in `foot.js`; node tests `node --test tests/foot.test.mjs tests/walkways.test.mjs`; no weakened assertions (see Task 3); CHANGELOG entry under `[Unreleased]` in player voice (German, like the existing entries); no full Playwright suite (run only `tests/test_on_foot.py` and the files named in Task 3, one at a time, foreground).

## Task 1: pure easing in `foot.js` (TDD)

**Files:** `foot.js`, `tests/foot.test.mjs`. **Interfaces:** `smoothK(dt, tau)`, `easeTo(v0, target, dt, tau) -> {v, avg}`, `easeLook(view, th, pitch, dt, ease) -> {th, pitch}`, `LOOK_EASE`, `WALKER.walkTau`, `WALKER.turnTau`.

- [ ] Write the failing tests first: `easeTo_SplitDt_SameDistance` (integrate `avg*dt` over 60x1/60, 30x1/30, 1x1 from v0=0 to target 4.5: equal within 1e-9), `easeTo_After3Tau_At95Percent`, `easeTo_NeverOvershoots`, `easeTo_ZeroTau_JumpsToTarget`, `easeLook_NullView_Snaps`, `easeLook_Follows_ByTheShortestAngle` (th 3.0 -> -3.0 turns across pi, not 6 rad), `easeLook_GapOverSnap_Snaps`, `easeLook_SplitDt_SameResult` (tolerance 1e-9, constant target).
- [ ] Run, see them fail. Implement exactly as the spec's code block; `easeLook`: `d = wrap(th - view.th)` into (-pi, pi]; snap when `|d| > ease.snap || |pitch - view.pitch| > ease.snap`; else `k = smoothK(dt, ease.tau)`, return `{ th: view.th + d*k, pitch: view.pitch + (pitch - view.pitch)*k }`. Add `walkTau: 0.10, turnTau: 0.12` to `WALKER`, `export const LOOK_EASE = { tau: 0.04, snap: 1.2 }`.
- [ ] Run, green. Commit `feat(foot): pure easing helpers`.

## Task 2: eased `stepFoot` (TDD)

**Files:** `foot.js`, `tests/foot.test.mjs`. **Interfaces:** `stepFoot(s, input, dt, floorAt, cfg)` where `s` may carry `lf, ls, tw` (default 0) and returns them.

- [ ] Failing tests: `stepFoot_WalkFromRest_RampsUpInAboutPointThreeSeconds` (after 0.05 s `hypot(vx,vz) < 0.5*walk`, after 0.5 s within 1 % of walk), `stepFoot_ReleaseKey_BrakesAndStopsMoving` (walk 1 s, release, 0.6 s later position stops changing; the glide is below `walk*walkTau*1.01`), `stepFoot_TurnKey_RampsAndSettlesAtTurnRate` (after 0.6 s settled `tw` within 1 % of `turnRate`; lost angle after 1 s = `turnRate*turnTau*(1-exp(-1/turnTau))` within 1e-6), `stepFoot_SameWalkAtDt60And30_SameDistance` (straight: 1e-9; with a turn key: 1e-3), `stepFoot_TurnWhileWalking_NoSideSlip` (hold W plus turn: local `ls` stays 0), `stepFoot_HoverWithNitro_RampsToTwiceHover`, `stepFoot_StateRoundTrip_IsDeterministic`.
- [ ] Implement in `stepFoot`:

```js
const tw = easeTo(s.tw ?? 0, input.turn * cfg.turnRate, dt, cfg.turnTau), th = s.th + tw.avg * dt, fx = Math.cos(th), fz = Math.sin(th);
let f = input.fwd, r = input.side; const m = Math.hypot(f, r); if (m > 1) { f /= m; r /= m; }
const speed = (s.hover ? cfg.hover : cfg.walk) * (input.nitro ? cfg.nitro : 1);
const lf = easeTo(s.lf ?? 0, f * speed, dt, cfg.walkTau), ls = easeTo(s.ls ?? 0, r * speed, dt, cfg.walkTau);
const vx = lf.avg * fx - ls.avg * fz, vz = lf.avg * fz + ls.avg * fx, x = s.x + vx * dt, z = s.z + vz * dt;
const moved = { ...s, x, z, th, vx, vz, lf: lf.v, ls: ls.v, tw: tw.v };
```

  Everything below (`floorAt`, `hoverStep`, `walkStep`) unchanged. Note the old code normalised the world vector the same way, so the diagonal rule holds.
- [ ] Green on the new tests; the pinned old ones fail as expected, handled in Task 3. Commit `feat(foot): eased walking and key turning`.

## Task 3: adapt the tests the spec changes (no weakening)

**Files:** `tests/foot.test.mjs`, `tests/walkways.test.mjs`, the browser tests listed in the spec.

- [ ] Add helper `settle = (s, input) => run(s, input, 1)` and use it as a lead-in. Change `WalkForward_MovesAtWalkSpeedAlongHeading`, `ForwardPlusSidestep_IsNotFaster`, `WalkWithNitro_IsTwiceAsFast`, `HoverWithNitro_IsTwiceAsFastButClimbsAsBefore`, and the `fast.x` check in `Hover_SpaceClimbs...`: settle, then measure the next second; the numbers asserted (4.5, 2x, 11, hypot) are unchanged. `TurnKeys_ChangeHeading`: as in the spec (settled rate = `turnRate`; analytic lost angle). `walkways.test.mjs:57` ramp: 110 steps instead of 90 (ramp start loses ~0.45 m), assertion unchanged. Add one line above each changed test saying why (#895).
- [ ] Never edit a threshold to make a test pass; a failing test not listed here is a regression, report it.
- [ ] Browser tests (distance based, headless): read each call in `tests/test_on_foot.py` (59-62, 96-104, 164-166), `test_depot.py:154`, `test_plattform_car.py:57`, `test_plattform_stair.py:115,131`, `test_enter_6c.py` (timed walks) and, only where the assertion is a walked distance, lengthen the hold by `WALKER.walkTau` (0.1 s; the nitro test measures the second 1 s after a 1 s settle). `test_depot.py:154` computes seconds as `dist / 4.5`: add `+ 0.1`. Do not run the whole suite; run `tests/test_on_foot.py` only, foreground, generous timeout.
- [ ] Run `node --test tests/*.test.mjs`, green. Commit `test(foot): measure settled speed and turn rate (#895)`.

## Task 4: wire `index.html`

**Files:** `index.html` (lines on `83d44ce`).

- [ ] Import `easeLook, LOOK_EASE` at 971. Extend `FOOT` (4664) with `mv: null, view: null`.
- [ ] `stepOnFoot` (5016): `stepFoot({ x, z, y, th, vy, hover, ...FOOT.mv }, ...)`; after the step `FOOT.mv = { lf: s.lf, ls: s.ls, tw: s.tw }` (after `headBump`, which spreads `s`; check that it keeps the keys). In the `LIFT_RIDE.busy` early return also `FOOT.mv = null`.
- [ ] `footCamera` (5032): `FOOT.view = easeLook(FOOT.view, P.th, FOOT.pitch, dt); ` then `footView(..., FOOT.view.th, FOOT.view.pitch, ...)`.
- [ ] Reset `FOOT.mv = FOOT.view = null` in `endFoot` (4817), `__mm.place` (5078), `__mm.setFootY` (5171), `platHopGo` (4703), `leaveBuilding` (4699), the ride board/idle lines (3869, 3877) and `stepRide` (3879). `__mm.footLook` (5173): also `FOOT.view = null`.
- [ ] Verify by node only plus `node --check` style import of the module block is not possible; do a quick `grep -n "FOOT.mv\|FOOT.view" index.html` review and run `tests/test_on_foot.py::test_mouse_look_turns_and_pitches_and_a_lost_lock_pauses_once` and `::test_n_held_on_foot_doubles_the_walking_speed` (foreground). No other browser run.
- [ ] CHANGELOG `[Unreleased]`, German, player voice: „Zu Fuss laufen, drehen und der Blick sind jetzt weich: Anlauf und Auslauf statt Ruckeln.“ Commit `feat(foot): smooth walking, turning and camera (#895)`, PR with `Closes #895`.
