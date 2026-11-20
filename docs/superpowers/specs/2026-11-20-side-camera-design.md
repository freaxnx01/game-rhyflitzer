# Side camera, from the left and diagonally above (#1106) — design

## Intent

The maintainer, while the Rhy Tanker (#1103) was being built: "wir brauchen noch eine kamera von links schräg oben". A sixth
view in the <kbd>C</kbd> cycle that shows the vehicle from its left side, above and a little behind, so the car's flank and a
swinging trailer are in the picture. It applies to every vehicle.

## Decisions (maintainer, 2026-11-20)

- **Numbers:** derived from each vehicle's existing chase numbers (`VEH.camera.chase`), so every vehicle — and every future
  one — gets the view without new data. A vehicle may override them with an optional `camera.side: { dist, h, back }`.
- **Turning:** the camera turns with the vehicle and eases after it like the chase cam; it always stays on the vehicle's left.
- **Order:** last in the cycle: chase · near · cockpit · bumper · drone · **side**. The drone stays view index 4; side is 5.
- **<kbd>B</kbd> (look back):** while held, the view mirrors to the vehicle's **right** side (same height and distance).

## Goals

1. `CAM_VIEWS` gets a sixth entry `{ nameKey: 'camSide', k: 'side' }`; <kbd>C</kbd> from the drone goes to side, <kbd>C</kbd> from
   side wraps to chase. The toast names it (en **Side**, de **Seite**).
2. Position: from the vehicle origin, `dist` m to its left, `back` m behind, `h` m above; it looks at a point 1.2 m over the
   vehicle's middle. For a vehicle with a trailer (`VEH.trailer`, #1103) the look point and the `back` offset move back by
   half of `hitch + length`, so truck and trailer both sit in the frame.
3. Derived numbers (no `camera.side`): `dist = chase.dist`, `h = chase.h * 1.6`, `back = chase.dist * 0.3`.
   E.g. the Fizz (6.9 / 2.6) → 6.9 m left, 4.2 m up, 2.1 m back; the tanker (20 / 6.5) → 20 m, 10.4 m, 6 m.
4. Eased toward its target with the chase cam's rate (6/s), snapped when B is pressed or released and when the view is
   entered; never below the ground + 1 m, and under the hideout ceiling like the chase cam (`underCeiling`).
5. The vehicle model is visible (not an eye view). Flying, the train and on foot keep their own cameras, as today.
6. Key bar and help: en `camera: chase · near · cockpit · bumper · drone · side`, de
   `Kamera: Verfolger · nah · Cockpit · Stossstange · Drohne · Seite`.

## Non-goals

- No obstacle pull-in (#777) for this view: in a narrow street the camera may sit inside a house wall beside the car.
- No speed-dependent distance, no hover sway.
- No per-vehicle `camera.side` numbers added now; the override only exists for later tuning.

## Shape

- A pure function in `camera.js`, node-tested: `sideOffsets(camera, trailer, scale?)` → `{ dist, h, back, aimBack }` and
  `sideTarget(pose, offsets, s)` → `{ eye: [x, y, z], at: [x, y, z] }` for `pose = { x, y, z, th }` (forward `(cos th, sin th)`,
  right `(-sin th, cos th)`), `s = 1` left, `s = -1` right (B held).
- `index.html` `stepCamera`: a branch for `v.k === 'side'` that lerps `camPos` to `eye` and looks at `at`.
- Tests: `tests/camera.test.mjs` for the two functions (left/right sign, derived numbers, override, trailer shift);
  `tests/test_sidecam.py` (Playwright): sixth view arrives left / above / behind, B mirrors to the right, C wraps to chase,
  help lists it de/en. `tests/test_drone.py` keeps passing unchanged (drone stays index 4, its help strings are substrings).

## Calls made by Claude (not the maintainer)

- The 1.6 and 0.3 factors and the 1.2 m look height — tuned once on the GPU browser in the implementation.
- No pull-in, no sway.
- The trailer shift through `VEH.trailer` rather than a per-vehicle number.
