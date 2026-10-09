# Car shadow: a soft contact shadow that lies on the ground (#163)

**Issue:** fix(vehicles): car shadow looks fake: hard flat ellipse, too big, ignores slope and sun.
**Mode:** quick enrich, no clarifying questions. Related: #164 (more realistic cars), #2 (night driving), #37 (V hides the car and its shadow), #132 (state written by the physics step, read by a draw function).

## Today

`prototype/index.html`:

- `:1195` the shadow is `blob`: `CircleGeometry(2.6, 16)` with a `MeshBasicMaterial` at a flat opacity 0.45, `rotation.x = -π/2`, scaled `(VEH.scale, 0.55 * VEH.scale, 1)` in `buildCar()` (`:1201`). That is a hard ellipse 5.2 m × 2.86 m: longer than both cars (compact 4.66 × 2.18 m over the mirrors, `test_vehicles.py:216`; DeLorean 4.27 m).
- `:1402`, inside `stepCar()`: `blob.position.set(P.x, gh2 + 0.05, P.z); blob.rotation.z = -P.th; blob.visible = wl === null && (P.y - gh2) < 6 && !eye && !HUD.carHidden; opacity = 0.45 * clamp(1 - (P.y - gh2) / 6, 0.2, 1)`. Flat on every slope, no sun, and written from the physics step (the state/render split of #132 is not applied here). `stepFly()` (`:1306`) never touches it, so in the helicopter the disc stays where the car took off, with whatever visibility it had.
- `:1086` the sun is one fixed `DirectionalLight` at `(-300, 400, -200)` (elevation ≈ 48°, light coming from the north-west in game axes: x east, z south). `:1092` every mesh receives shadows, `buildCar()` sets `castShadow` on every car part, and `applyStyle()` (`:1228`) turns the shadow map on only for the `smooth` style (`STYLES.smooth.shadows = true`, `:1224`); `original` has none. So in `smooth` the car already casts a real, sun-aligned shadow and the blob is drawn on top of it; in `original` the blob is the only shadow.
- `window.__mm.hud().shadowVisible` (`:1316`) returns `blob.visible`; `test_smoke.py:496-507` asserts V hides it one frame after the car.

## Goal

One shadow that reads as the car's: the car's footprint with a soft edge, lying on the ground under the car (following the slope), shifted a little away from the sun, the same for every vehicle, hidden with V, in the cockpit and bumper cameras, over water, high in the air and in the helicopter. Cheap: one quad, one small texture, no second shadow pass, nothing that needs several rendered frames to verify.

## Approaches considered

1. **Soft contact-shadow decal** (chosen). One textured quad sized from the measured car box, tilted to the ground sampled around the car, offset along the sun's horizontal direction. Cost: one draw call, a 128 × 64 texture baked once per vehicle build, two extra `groundH` samples per physics step. Works identically in both styles and on a phone; `smooth` keeps its real shadow-map shadow and gets the decal as the contact darkening under the body (the "ambient occlusion" a shadow map cannot give).
2. **Second directional light with a tight shadow camera for the car only.** Correct silhouette and sun direction, but every ground fragment pays a second shadow-map lookup in both styles, it needs a second depth pass per frame, and the `original` style is deliberately shadow-free (pixel look, `pixel` ratio capped). On SwiftShader a second pass is a measurable share of a frame already under 1 fps. Rejected.
3. **Turn the shadow map on in `original` too.** Changes the look of the whole style, not just the car; roofs, trees and walls would all start casting. Out of scope for a car-shadow fix. Rejected.

## Design

### Pure module `prototype/shadow.js`

No three.js, no DOM, unit-tested with `node --test prototype/tests/*.test.mjs` (same shape as `heli.js`, `steering.js`). Frame as the car: x east, z south, `th` heading (0 = +x), car model +x forward, +z right.

- `SHADOW = { margin: 0.5, core: 0.92, lift: 0.04, hideAbove: 6, minFade: 0.2, bodyMid: 0.4, roll: 1.0 }` — the soft edge in metres, the dark core as a fraction of the measured box (tyres and body, not the mirror tips), the height above the ground, the air height at which it is gone, the opacity floor while fading, the body-centre height as a fraction of the car height (what the sun shifts), the lateral sample distance in metres.
- `shadowSize(box)` → `{ l, w, cl, cw }`: quad length/width = `box.l * core + 2 * margin`, `box.w * core + 2 * margin`; core = `box.l * core`, `box.w * core`. Compact: quad ≈ 5.29 × 3.0 m with a 4.29 × 2.0 m dark core; the old disc was 5.2 × 2.86 m solid.
- `shadowAlpha(u, v, fu, fv)` → 0..1 for texture coordinates `u, v ∈ [-1, 1]`: 1 inside the core box `|u| ≤ 1 - fu`, `|v| ≤ 1 - fv`, then a smoothstep to 0 at the edge, measured along the nearer axis (a rounded-rectangle falloff: distance outside the core box, normalised per axis, `smoothstep(0, 1, 1 - d)`). `fu = margin / (l / 2)`, `fv = margin / (w / 2)` come from `shadowSize`, so the soft edge is 0.5 m in the world on both axes. Baked into an `ImageData` by `index.html` — no canvas `filter: blur`, so the texture is identical in Chromium, SwiftShader and on phones.
- `groundTilt(fore, aft, left, right, dx, dz)` → `{ pitch, roll }`: `pitch = atan((fore - aft) / (2 * dx))` (positive = nose up), `roll = atan((right - left) / (2 * dz))` (positive = right side up). `fore/aft` are the heights `dx` ahead/behind the car centre, `left/right` the heights `dz` to each side.
- `sunShift(sun, height)` → `{ x, z }`: where a point `height` m above the ground lands when projected along the light. `sun` is the vector from the scene to the sun (not normalised, `sun.position` as-is): `x = -sun.x / sun.y * height`, `z = -sun.z / sun.y * height`; `{ 0, 0 }` when `sun.y <= 0` (sun below the horizon: #2 will decide what a night shadow is). With the scene's sun and the compact's body centre (`0.4 * 1.55 = 0.62 m`) the shift is ≈ `(+0.47, +0.31)` m: a hand's width toward the south-east, enough to read as "the sun is over there", not a second car.
- `shadowOpacity(base, air)` → `base * clamp(1 - air / hideAbove, minFade, 1)` (today's fade, parameterised by the style's base).
- `shadowShown({ fly, wet, air, eye, hidden })` → boolean: `!fly && !wet && air < hideAbove && !eye && !hidden`. One place for the whole visibility rule, including the helicopter case that is missing today.

### Scene object (`index.html`)

- `shadowMesh`: a `PlaneGeometry(1, 1)` rotated by `rotateX(-π/2)` once (lying in XZ, normal +y, geometry x = car length, geometry z = car width), `MeshBasicMaterial({ map, color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })`, `rotation.order = 'YZX'` (yaw about world Y, then pitch about the car's side axis Z, then roll about its forward axis X: the same axes `stepCar` uses for the car at `:1401`). `renderOrder = 1` so it draws after the opaque ground. Replaces `blob`; every `blob` reference goes (`:1195`, `:1201`, `:1316`, `:1402`).
- Texture: `makeTex(128, 64, draw, { alpha: true })` where `draw` fills an `ImageData` with `shadowAlpha` (black, alpha = value). Baked in `buildCar()` from `CAR_SIZE` right after `measureCar()`; the previous map is disposed first (the GPU-leak test `test_rebuilds_free_gpu_memory` counts textures). `shadowMesh.scale.set(size.l, 1, size.w)` in the same place.
- Style: `STYLES.original.carShadow = 0.55` (the only shadow), `STYLES.smooth.carShadow = 0.3` (a contact darkening under the shadow-map shadow). Read live in the draw step, so a style switch changes it without a rebuild. #2 can scale or zero it at night from here.

### State and draw (the #132 split)

- `SHADOW_STATE = { y: 0, pitch: 0, roll: 0, wet: false, air: 0 }`, written by `stepCar()` only, in place of today's `blob` line: `y = gh2`, `pitch = atan(slope)` from the two forward samples the car already takes (`:1401`, ±2 m along the heading; the car's own tilt is `0.8 ×` that, the shadow uses the full slope since it lies on the ground), `roll` from two new `groundH` samples `SHADOW.roll` m to the left and right of the centre (`P.x ∓ fz, P.z ± fx` scaled), `wet = wl !== null`, `air = P.y - gh2`. The two extra samples cost what the two slope samples cost; `window.__mm.physMs` stays the gauge.
- `drawShadow()`, called in `loop()` next to `drawWheels()` (`:1619`), reads `SHADOW_STATE`, `P`, `FLY.on`, `camView`, `HUD.carHidden`, `sun.position` and `STYLES[styleKey].carShadow`, and writes the mesh only: `visible = shadowShown(...)`; `position = (P.x + shift.x, SHADOW_STATE.y + SHADOW.lift, P.z + shift.z)` with `shift = sunShift(sun.position, SHADOW.bodyMid * CAR_SIZE.h)`; `rotation.set(roll, -P.th, pitch)` (order `YZX`); `material.opacity = shadowOpacity(carShadow, air)`. Nothing in `stepCar` or `stepFly` touches the mesh; in the helicopter `shadowShown` hides it every frame.
- Hooks: `window.__mm.hud().shadowVisible` keeps its meaning (`shadowMesh.visible`), so `test_smoke.py` is untouched. New read-only `window.__mm.shadow()` → `{ visible, opacity, size: [scale.x, scale.z], pos: [x, y, z], rot: [x, y, z], shift: [x, z], ground }`.

### Look

Original style: a soft dark patch the size of the car, darkest under the body, fading out over half a metre, lying on the road and tilting with it on the ramp and on the Hochrhein's banks; the car sits on it. On a jump it fades and shrinks nothing (size stays, only opacity drops) and it is gone above 6 m. Smooth style: the real shadow-map shadow stays the sun shadow; the decal only darkens the ground right under the car so it no longer looks like it hovers. Both cars: the DeLorean's shadow is shorter and a little narrower than the compact's, because it is measured, not drawn.

## Tests

- Node (`prototype/tests/shadow.test.mjs`): `shadowSize` from the compact box; `shadowAlpha` is 1 in the core, 0 at the edge, monotone in between, symmetric; `groundTilt` sign and value on a known slope, zero on flat ground; `sunShift` zero for a sun straight up, the scene's sun gives a positive x and z shift of the expected length, sun below the horizon gives zero; `shadowOpacity` floor and full; `shadowShown` false for each single reason, true otherwise.
- Browser (`prototype/tests/test_shadow.py`, hand layout, frame-light: every read after `wait_frames(page, 2)` from `test_vehicles.py`): the quad is sized from the car (compact: `size[0] ≈ 5.29`, `size[1] ≈ 3.0`, and `size[0] - 2 * margin < carSize.l`, so the dark core is shorter than the car where the old 5.2 m disc was longer); switching to the DeLorean (`?vehicle=delorean` via `open_hand_query`) gives a shorter quad; placed on the jump ramp (`__mm.ramp()`, `__mm.place()` at its middle, heading +x) the shadow's pitch is `atan(h / (x1 - x0))` within 0.03 rad and its y is within 0.1 m of `__mm.ground()` there; the shift is `(+0.47, +0.31) ± 0.05` for the compact; F (helicopter) hides it and landing shows it again; C to the cockpit view hides it; the GPU texture count is unchanged after two `setVehicle` round trips.
- Existing: `test_smoke.py` V toggle (unchanged), `test_vehicles.py::test_rebuilds_free_gpu_memory`.

## Out of scope

- A sun that moves (night, #2): `sunShift` already takes the sun vector, so #2 only has to call it with the moving light and decide the night opacity.
- Shadows of the helicopter, of other traffic, or of the car on walls and buildings (the decal is a ground plane; against a wall it clips as the old disc did).
- Stretching the shadow into a long evening shadow: with a fixed 48° sun the stretch would be ~1.1× and would need the quad to turn to the sun azimuth, decoupling it from the car's footprint. Offset only.
