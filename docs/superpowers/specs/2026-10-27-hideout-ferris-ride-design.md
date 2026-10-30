# Ride the Ferris wheel on foot (#516)

Status: enriched 2026-10-27 (early run). Deadline: **live on the site Thursday 2026-11-05 15:15**; dispatch right
after PR#514 (the wheel, #513) is merged on **Wednesday 2026-11-04**; merge the same evening. Builds on the
wheel of `docs/superpowers/specs/2026-10-27-hideout-ferris-wheel-design.md` and on the on-foot mode (#202,
#409, #411/#412). Line numbers below are those of `origin/feature/513-ferris-wheel` (PR#514), valid on `main`
once PR#514 is merged.

## Goal

In star room 6 the player can **ride the Ferris wheel on foot**: get out of the car (<kbd>Z</kbd>), walk to a small
**boarding platform** (a gravel pad) under the rim, press <kbd>E</kbd> at the lowest gondola, be carried up in it for
**one full turn** with the camera inside the gondola (over the room from ~107 m eye height, the wheel's top is
112 m), and get out at the bottom again.

**Success criterion:** at the pad, with the lowest gondola in reach, the prompt `E · Ride the Ferris wheel` shows;
<kbd>E</kbd> lifts the walker into that gondola, the wheel carries it once round (the walker's camera follows the
gondola, which stays upright, the walker cannot walk off), and at the bottom the walker is set down on the pad
and can walk again. <kbd>E</kbd> at the bottom ends the ride early; <kbd>J</kbd>, <kbd>R</kbd>, the beam and the
Testhub end it cleanly. `node --test` and one targeted Playwright test pass; the page loads with an empty
console; the room stays unsigned.

## Out of scope

- Other gondolas than the lowest one, a queue, tickets, a gate, a ride operator, lights, ride sound (a creak
  or wind can come later with #412's sound work).
- Riding as a passenger in the car, or from the helicopter / hover mode (boarding needs the walker on the ground).
- A walk-in interior mesh of the gondola (no seats, no windows): see A5.
- Changing the wheel's look or its resting speed (0.01 rad/s stays; it only speeds up while someone rides, A2).
- Entering objects on foot in general (#412), the object list (#420), a spoke sign or room name for the player.
- Co-riders, saving the ride, a ride counter.

## Today (evidence)

- `prototype/ferris.js:10-18` `FERRIS` (rim 50, hub 59, gondola `{ n: 32, w: 4, d: 3.2, h: 2, drop: 2 }`, spin 0.01);
  `:21` `gondolaAngles`; `:24` `wheelAngle(t) = (t * spin) % 2π`; `:39-49` `ferrisPlacement` returns
  `{ wheel: { x, z, th }, colliders }` with no pad ("a boarding strip is #412's job").
- `prototype/ferrismesh.js:70-79` a gondola `i` is a pivot at `(0, rim·sin t_i, rim·cos t_i)` in the wheel group, the
  cabin `drop` m below it; `:87` `setWheelAngle` sets `wheel.rotation.x = angle` and every pivot's
  `rotation.x = -angle`. So gondola `i` sits at the effective angle **φ = t_i − angle**: world-up height
  `hub + rim·sin φ − drop` (cabin centre, hanging upright), across `rim·cos φ`, along the axle 0. **Gondola 0 is
  at the side, not at the bottom** (the `ferris.js:20` comment "one hangs straight down" is wrong for the mesh):
  the lowest at `angle = 0` is index 24 (`t = 3π/2`), cabin centre 7 m, floor 6 m over the lawn. The ride maths
  follows the mesh (A3), and a test pins it to three.js's x-rotation.
- `prototype/index.html:2883` `roomFerris`, `:2887` `stepFerris` (angle from `performance.now()` only,
  `wheelAngle(now/1000)`), `:2968` `window.__mm.ferris`, `:2657` `ROOM` (`ferris` slot), `:2818` `ensureRoom`,
  `:2839` `flatStrip(pts, hw, y, colour)` (the gravel path ribbon; a 2-point path is a rectangle).
- On foot: `index.html:3222` `FOOT`; `:3326` `getOut` (Z in the car), `:3268` `pressZ`, `:3341` `endFoot`,
  `:3342` `toggleHover`, `:3522` `stepOnFoot` (the walker is `P`, `P.y` = feet), `:3537` `footCamera`
  (`footView(P.x, P.y, P.z, P.th, FOOT.pitch, WALKER.eye, …)`, so the camera follows `P` and mouse look works),
  `:3533` `footMouse`; `prototype/foot.js:79-85` `footKeyAction`: on foot <kbd>E</kbd> is `'enter'` and the
  keydown handler (`index.html:3034`) calls `pressEnter()` (`:3258`) and swallows the key, `stepEnter` (`:3259`)
  owns the `#prompt` line (`E · Enter`, `strings.js:163`).
- Every way out the issue names ends on foot through one door: <kbd>R</kbd> (`index.html:3034` →
  `resetCar` `:3161`), <kbd>J</kbd> (`jumpTo` → `placeOnRoad` → `resetCar`), the beam (`beamTo` → `placeOnRoad`),
  the Testhub (`testhubGo` → `placeOnRoad` / `resetCar`). `resetCar` calls `endFoot()` (`:3341`): the one hook.
- Loop: `index.html:4406-4407` `if (FOOT.on) stepOnFoot(dt); else if (TRAIN.on) …; stepFerris();` — dt is clamped
  to 0.05 s, and the pause (`PAUSE.on`) returns before any step (`:4406`), so a pause freezes a ride's own clock.
- Key check, every `prototype/*.js` and `index.html` (grep `KeyE`): <kbd>E</kbd> is bound in `foot.js:81` (on
  foot: enter), `enterables.js:73` (the prompt's key), `train.js:198` (right switch, loco only), `index.html:3034`
  (right blinker, in the car only — swallowed on foot) and the help legend `index.html:294`. `pause.js` binds
  no <kbd>E</kbd>. On foot <kbd>E</kbd> is already the "enter this thing" key, so the ride **reuses it**; no new
  key is needed (A1). <kbd>Z</kbd> stays "get in the car" (blocked during the ride).
- `prototype/tests/test_hideout.py:872` `into_room`, `:22` `open_page`, `:99` `ride`, `:1128` the Ferris test (PR#514);
  `__mm.footSim` (`index.html:3634`) steps only `stepOnFoot`.

## Design

### Pure module `prototype/ferrisride.js` (no three.js, no DOM, `node --test`)

All numbers in one object `RIDE`: `reach` 5 m (from the walker to the lowest gondola's point on the floor),
`window` 0.15 rad (the arc round straight-down where one may get out: floor ≤ 6.6 m, across ≤ 7.5 m),
`groundTol` 1.5 m, `board` 1.2 s, `alight` 1.2 s, `spin` 0.1 rad/s, `turn` 2π, `eye` 1.2 m over the gondola floor.

- `gondolaPose(i, angle)` → `{ phi, x: 0, y, z, floor }` — the formula of the evidence above (wheel frame:
  x along the axle, z across, y over the floor).
- `bottomOffset(i, angle)`, `lowestGondola(angle)` → `{ index, offset }`. With 32 gondolas one is always
  within π/32 = 0.098 rad of straight down.
- `toWheel(w, x, z)` / `fromWheel(w, lx, lz)`: world ↔ wheel frame for `w = { x, z, th }` (the placement's
  `wheel`); `fromWheel` is `c + f·lx + v·lz` as `ferrisPlacement`'s `loc`.
- `boardingTarget(angle, local)` → `{ index, dist }` or `null`: the lowest gondola if the walker is within `reach`
  of its floor point `(0, z)`.
- State machine, a plain object `{ phase, … }`: `rideIdle()`, `rideBegin(angle, index, from)`,
  `rideStep(s, dt, leave)`, `rideAngle(s)`, `rideFeet(s)`, `rideAction(s, angle, local, grounded)`,
  `clockOffset(angle, nowS)`.

  ```
  idle ──board──▶ boarding (1.2 s, wheel held, walker glides up into the gondola)
                     ──▶ riding (wheel at 0.1 rad/s, one turn = 62.8 s)
                     ──turn done, or E within the bottom window──▶ alighting (1.2 s, wheel held, glide down to the pad)
                     ──▶ idle (carries the wheel angle on)
  ```
  <kbd>E</kbd> while riding outside the window is refused with a hint (A4). Any phase can be dropped to `idle`
  by `endRide()` in the page (reset, jump, beam, Testhub): it hands the wheel its angle back.
- The wheel's clock: while idle the wheel turns by the wall clock plus an offset, `wheelAngle(now + offset)`;
  `clockOffset(angle, now)` is the offset that makes the wall clock agree with `angle` at `now`, so the wheel
  never jumps when a ride ends (it was held or sped up by the ride).

### The page (`prototype/index.html`)

- `RIDE = { s: rideIdle(), offset: 0 }`; `currentWheelAngle()` = the ride's angle while a ride runs, else the clock.
  `stepFerris` (`:2887`) uses it.
- `stepRide(dt)` replaces `stepOnFoot` while a ride runs (loop `:4406`): `rideStep`, then the walker `P` is put
  at `rideFeet` through `fromWheel` (+ `ROOM.layout.y`), `P.y` lowered so the eye sits `RIDE.eye` over the floor, `P.vx/vz/vy = 0`,
  `followCave()`. Mouse look still works (`footMouse`/`footCamera`); no other movement does.
- `pressEnter` (`:3258`): <kbd>E</kbd> boards (`rideAction` = board), asks to get out (leave) or shows the hint (wait).
  `stepEnter` (`:3259`) writes the prompt: `E · Ride the Ferris wheel` at the pad, `E · Get out` in the bottom
  window. `pressZ` (`:3268`) and `toggleHover` (`:3342`) do nothing during a ride. `endFoot` (`:3341`) calls `endRide()`
  first.
- **Boarding platform.** `FERRIS.pad = { hw: 5, hd: 8, lift: 0.12 }` and `ferrisPlacement(...).pad = { x, z, th, hw, hd }`
  (pure, centred under the hub, 10 m along the axle × 16 m across, covers where the lowest gondola's floor point
  can be: |z| ≤ rim·sin(window) = 7.5 m). `roomFerris` (`:2883`) draws it as two `flatStrip`s: a gravel pad
  (`0xb9ae96`) and a yellow edge line. No collider, no path (`roomLayout(6).paths.length` stays 2): the car
  drives over it like over gravel.
- Strings (en + de): `ridePrompt`, `rideExit`, `rideWait`. Real umlauts in German.
- Debug hook `window.__mm.ferrisRide()` → `{ phase, index, travelled, action, lowest: { index, x, z }, wheelAngle }`
  and `window.__mm.rideSim(secs)` (steps `stepRide` + `stepFerris` at 1/60 s; returns the hook plus `maxY`, the highest
  feet `y` seen): headless Chromium renders under 1 fps and a real minute-long ride would take ages (see the
  stack overlay's note on animated cameras).

### The view

The gondola cabin is a closed `BoxGeometry` with front faces only, so from inside its walls and floor are culled
and the player looks out through "glass"; the roof's underside is a dark ceiling just over the head (the eye is
1.2 m over the floor, the roof 2.0 m). No mesh change (A5). Eye height at the top: 59 + 50 − 2 − 1 + 1.2 ≈ 107 m.

## Acceptance criteria

- [ ] `prototype/ferrisride.js` exists and is pure; `gondolaPose` agrees with a three.js x-rotation of the pivot
      point (the mesh convention); at `angle = 0` the lowest gondola is index 24 with its floor at 6 m.
- [ ] `lowestGondola` is within 0.1 rad of straight down for every wheel angle; `boardingTarget` answers only
      within `RIDE.reach` of that gondola's floor point.
- [ ] State machine `idle → boarding → riding → alighting → idle`: boarding and alighting hold the wheel; riding
      turns it at 0.1 rad/s and ends by itself after exactly 2π; `leave` is honoured only within `RIDE.window` of
      straight down; `leave` during boarding is ignored; `rideStep` never mutates its input.
- [ ] `rideFeet`: the walker starts where it stood, ends on the floor under the gondola, and is at the gondola
      floor height all through riding (≤ 6.6 m at the bottom, ≥ 105 m at the top).
- [ ] `clockOffset(angle, now)` makes `wheelAngle(now + offset)` equal `angle` (mod 2π): no jump when a ride ends.
- [ ] `ferrisPlacement(...).pad` is centred on the wheel with `hw` 5, `hd` 8, and covers the exit point of the
      bottom window; `roomLayout(6).paths.length` is still 2; no other room has a pad.
- [ ] In the page: at the pad the prompt `E · Ride the Ferris wheel` shows; <kbd>E</kbd> boards; the camera follows
      the gondola over one turn (peak feet height ≥ 105 m); movement keys, <kbd>Z</kbd> and <kbd>F</kbd> do nothing during the
      ride, mouse look works; <kbd>E</kbd> outside the bottom window shows `rideWait` and does not get out; at the
      bottom (or <kbd>E</kbd> in the window) the walker is set down on the pad, on foot again.
- [ ] <kbd>R</kbd>, <kbd>J</kbd> (landmark jump), the beam and the Testhub during a ride all end it through `endFoot`
      (`__mm.ferrisRide().phase === 'idle'`, `__mm.foot().on === false`); the wheel keeps turning without a jump.
- [ ] Pausing mid-ride and resuming continues the ride (the ride clock is dt-driven).
- [ ] No new key is bound: <kbd>E</kbd> is the existing on-foot "enter" key (grep recorded in the plan); `pause.js` untouched.
- [ ] The room stays unsigned (`spokeSigns(ROOMS)` empty); nothing else about the room changes.
- [ ] CHANGELOG `[Unreleased]` → `### Added` has one timestamped, player-facing entry.
- [ ] `node --test prototype/tests/*.test.mjs` is green; `pytest prototype/tests/test_hideout.py -k ferris_ride` is green
      on the GPU browser; no other Playwright file is run.

## Assumptions

- **A1** [high] **<kbd>E</kbd> is the key** (board, get out). It is already on foot the "enter" key with a prompt
  (`foot.js:81`), so the ride is just one more enterable thing and no key is taken (grep of all `prototype/*.js`
  incl. `pause.js`: no other on-foot meaning). Rejected: a new key (<kbd>Enter</kbd> and <kbd>H</kbd> are blocked
  on foot, `FOOT_BLOCKED` in `foot.js:77`; every free letter is a candidate for a later feature), <kbd>Z</kbd>
  (means "get in the car").
- **A2** [med] **The wheel speeds up to 0.1 rad/s for the ride** (one turn in 63 s); at rest it keeps 0.01 rad/s
  (10.5 min per turn, too long to wait in a gondola). The wheel visibly speeds up while someone rides and
  returns to its slow turn after; `clockOffset` keeps the angle continuous. Rejected: riding at 0.01 rad/s
  (10+ min for a demo); a faster wheel for everyone (changes #513's look and test: `angle` growth, 0.01 rad/s
  in its acceptance criteria); a time-limited "half turn" (the issue says one full turn).
- **A3** [high] **The ride follows the mesh, not the `ferris.js` comment**: gondola `i` is at φ = t_i − angle
  and index 24 hangs at the bottom at angle 0. Rejected: "gondola 0 is the lowest" (true neither in
  `ferrismesh.js` nor in `gondolaAngles`' values). The test pins the formula to three.js's rotation about x so
  a later mesh change that breaks it is caught. The `ferris.js:20` comment is left alone (not this issue).
- **A4** [med] **<kbd>E</kbd> mid-ride is honoured only within 0.15 rad of straight down**; elsewhere a toast
  says one gets out at the bottom. Rejected: getting out anywhere (a 100 m drop to the lawn, the walker would
  need falling damage rules); no early exit (the issue asks for <kbd>E</kbd>).
- **A5** [med] **The camera sits in the existing closed cabin box**, no interior mesh: its faces are single-sided,
  so from inside the walls read as glass and the roof underside as a ceiling. Rejected: a new open gondola mesh
  (graphics work for a one-run budget; #412 can add it); a see-through material change (touches #513).
- **A6** [med] **Boarding is a short scripted glide** (1.2 s up / down), not walking on a platform at gondola
  height. The pad is at ground level because the gondola floor is 6 m up (PR#514 leaves 6 m clearance on
  purpose). Rejected: a stair or ramp to the gondola (the wheel turns, the stair would have to follow); lowering
  the wheel (changes #513's numbers and tests).
- **A7** [med] **Boarding reach 5 m from the lowest gondola's floor point and ground contact ≤ 1.5 m**: with 32
  gondolas the lowest is up to 0.098 rad (4.9 m across) off straight down. Hovering walkers (<kbd>F</kbd>) cannot board.
  Rejected: boarding from anywhere on the pad (the lowest gondola may be 5 m off its centre).
- **A8** [med] **The pad is purely visual** (two flat strips like the gravel paths), no collider, not in `paths`.
  Rejected: a raised deck with a collider (the car would be stopped by a 0.3 m step; the walker's `stepUp` is
  0.6 m but the car's collide has no such rule); adding a third path (breaks `paths.length === 2`, `rooms.test.mjs`).
- **A9** [low] **`followCave()` per frame in `stepRide` is enough for the cave look at 112 m in the room**
  (the same call `stepOnFoot` makes). It is untested at that height: the Playwright test asserts only an empty
  console. If the look is wrong at the top, that is a follow-up, not this issue.
- **A10** [med] **Ending a ride through `endFoot`** covers R, J, the beam and the Testhub (all pass through
  `resetCar`). Rejected: a hook in each of the four (drift); a hook in `resetCar` only (`endFoot` is also called
  by `getIn`, which cannot happen during a ride, and the walker is on foot only if a ride is possible).
- **A11** [med] **One targeted Playwright test** drives the ride with `__mm.rideSim` (headless renders < 1 fps);
  R-ends-the-ride is checked in the same test. J, the beam and the Testhub are not driven in the browser: they
  share `resetCar`/`endFoot` with R. Rejected: a test per exit (the full suite is ~2 h; one is enough).
- **A12** [med] **The CHANGELOG timestamp is the Swiss local time of the commit** that writes the entry
  (`TZ=Europe/Zurich date`). Rejected: the demo time.
- **A13** [low] **No sound, no ride toast on boarding.** The prompt and the visible lift are the feedback.
  Rejected: reusing `SFX.step` or the lift sound (wrong feel; sound is out of scope).

## Consequences

- A new pure module and its test (`ferrisride.js`, `ferrisride.test.mjs`); `ferris.js` gains `FERRIS.pad` and a
  `pad` in the placement; `strings.js` three keys; `index.html` gains a ride block of ~50 lines and touches
  `stepFerris`, `roomFerris`, `pressEnter`, `stepEnter`, `pressZ`, `toggleHover`, `endFoot` and the frame loop.
- `rooms.js`, `ferrismesh.js`, `pause.js`, `foot.js` stay unchanged.
- While someone rides, the wheel turns ten times faster and `__mm.ferris().angle` jumps in rate (the #513 test
  runs without a ride, unaffected).
- The help legend (`keyEnter`, "on foot, at a glowing door: enter") does not mention the ride; the prompt does.
- #412 (entering objects on foot) can reuse `toWheel`/`rideAction`; a proper gondola interior replaces the
  "glass cabin" (A5) without touching the state machine.
