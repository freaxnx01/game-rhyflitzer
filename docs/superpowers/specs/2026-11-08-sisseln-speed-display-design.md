# Smiley speed display in Sisseln (#745): design

**Issue:** #745. **Builds on:** the Smile-Kreisel (`landmarks.js:31`, anchor `smileKreisel`, built by `smileKreiselAt`,
`index.html:1525`), Volg Sisseln (`landmarks.js:39`, building 171822900) and the prop pattern of the Postauto stops
(`busstop.js` pure layout + `busStop`, `index.html:2044`, canvas-texture sign via `makeTex`, `index.html:860`).

## Goal

A village-entrance speed display stands in Sisseln on the Hauptstrasse between the Smile-Kreisel and the Volg, at
the bend, on the right-hand side of the traffic that drives from the roundabout into the village. Approaching it,
the panel lights up with the player's speed in km/h and a green 🙂 at or under 50 km/h or a red 🙁 above. From the
other side the player sees the back of the sign; on foot, in the loco and in the helicopter it stays dark. Pure
village detail: no reward, no penalty.

## What is there today (measured)

Nothing: `git grep -i "radar\|smiley\|speed display"` finds only the roundabout's smiley discs. The road geometry
comes from `data/world_hochrhein.json` (probe over `roads`, `anchors.landmarks`, `buildings`):

- Smile-Kreisel anchor `smileKreisel` at `(1270, −148)`; Volg Sisseln (171822900) ring mean `(1524.9, −253.7)`;
  the two are 276 m apart.
- The Hauptstrasse between them: a straight `tertiary` way 7.5 m wide from `(1395.6, −153.9)` to `(1437.4, −156.1)`
  (heading −1.9°, i.e. east), then a 9-point way 7 m wide that bends left towards the north-east:
  `(1437.4, −156.1) → (1443.3, −156.3) → (1453.4, −158.8) → (1463.4, −162.5) → (1473.4, −168.5) → (1488, −182.7) →
  (1524.3, −222.2) → (1544.4, −245.5) → (1557.2, −262)`; segment headings −1.9°, −13.9°, −20.3°, −31.0°, −44.2°,
  −47.4°, −49.2°, −52.2°. The bend is the stretch x 1437 … 1488; its middle point is `(1463.4, −162.5)`.
- Game axes: +x east, +z south (`rightOf`, `route.js:61`, and `busstop.js:76`: `n = (−u.z, u.x)` is right of travel).
  Right of eastward travel is therefore +z.
- The straight approach from the roundabout is really straight: the road centre line stays within 0.7 m of the
  axis through the chosen sign spot along the straight's direction for the whole 125 m back (probe), and the
  roundabout exit lies 196 m back along that axis.

## Design

### 1. Pure module `speeddisplay.js` (node --test)

No DOM, no three.js. Exports:

- `SPEED_DISPLAY` constants:
  - `x: 1465.45, z: −158.27`: the sign's foot. Derived: the bend's middle road point `(1463.4, −162.5)`, local
    tangent averaged over the neighbours `(0.900, −0.436)`, pushed `w/2 + 1.2 = 4.7 m` to the right of travel
    (`n = (0.436, 0.900)`). Probe: 1.20 m off the nearest asphalt edge (the Hauptstrasse), no other road nearer,
    nearest building (171822747) 5.4 m away, no OSM prop within 5 m.
  - `approach: [0.99862, −0.05256]`: unit direction of the traffic that is measured, taken from the straight before
    the bend (`(1395.6, −153.9) → (1437.4, −156.1)`), not from the bend tangent, so the panel faces the straight the
    cars come down and the detection corridor follows that straight.
  - `limit: 50` (Innerorts), `range: 120` (m before the sign where it lights up), `lateral: 10` (m either side of
    the approach axis; Widenmattstrasse is 16–25 m off the axis, the cycleway 143 m back), `minKmh: 3` (dark for a
    standing car).
  - `panel: { w: 0.8, h: 1.2, y: 2.2 }` (metres; `y` = panel centre height), `tex: { w: 256, h: 384 }`.
- `faceYaw(cfg = SPEED_DISPLAY)` → `Math.atan2(−approach[0], −approach[1])` = −1.518 rad: the group's `rotation.y`
  such that local +z (the panel's front) points against the approach, at the oncoming cars.
- `displayState(car, cfg = SPEED_DISPLAY)` with `car = { x, z, vx, vz, ground }` →
  `{ on: false }` or `{ on: true, kmh, happy }`:
  - `ground` false (on foot, loco, helicopter) → off.
  - `d = (cfg.x − car.x)·u + (cfg.z − car.z)·u` (distance still to drive to the sign along the approach): off unless
    `0 < d ≤ range`. So a car that has passed the sign (d < 0) and anyone coming from the village (d < 0 the whole
    way) see nothing.
  - `|lateral| = |(car − sign)·n| > cfg.lateral` → off.
  - closing: `vx·u.x + vz·u.z ≤ 0` → off (driving away, or sideways).
  - `kmh = Math.round(Math.hypot(vx, vz) · 3.6)`; `kmh < minKmh` → off.
  - otherwise `{ on: true, kmh, happy: kmh ≤ cfg.limit }`.
- `displayKey(state)` → `'off'` or `` `${kmh}:${happy ? 'h' : 's'}` ``: the panel is redrawn only when this string
  changes.
- `panelColors(state)` → `{ digits: '#ffb000', face: '#39d353' }` when happy, `{ digits: '#ffb000', face: '#ff3b30' }`
  when not; the digits are always amber LED, the face green or red. Pure so the test can pin it.

### 2. The sign (`index.html`)

`speedDisplayBuild()` in the landmark block (`index.html:2419`, where `at(k)` reads `L.anchors.landmarks`), guarded
by `at('smileKreisel')` so it exists only in the world that has the roundabout. Group in `signs`, at
`(SPEED_DISPLAY.x, terrainH(x, z), SPEED_DISPLAY.z)`, `rotation.y = faceYaw()`:

- **Pole**: grey `#9aa0a8` cylinder r 0.05, 0 → 2.8 m (same steel look as `busStop`).
- **Housing**: anthracite `#2b2f36` box `panel.w × panel.h × 0.12` centred at `y = panel.y`, its front face at local
  +z. A thin lighter `#4a515e` frame rim is enough (a 0.02 m larger box behind the face, optional).
- **Face**: `PlaneGeometry(panel.w − 0.08, panel.h − 0.08)` at local `z = 0.065`, `MeshBasicMaterial` with a live
  `THREE.CanvasTexture` (`colorSpace = SRGBColorSpace`) of `tex.w × tex.h`. Unlit material so the LEDs glow
  regardless of the sun. Not `makeTex` (that is for static textures): the canvas is kept and redrawn.
- **Drawing** (`drawSpeedPanel(g, w, h, state)`): black `#07080a` background always. Off → nothing else (dark
  panel). On → the number in `800 italic` Barlow Condensed, ~0.42 h tall, centred in the upper 55 %, amber from
  `panelColors`; a small "km/h" under it (0.08 h, same amber, 60 % alpha); in the lower 40 % a face drawn with
  canvas arcs: a ring (lineWidth 0.025 h), two eye dots, and a mouth arc — smiling (arc below centre, ends up) when
  happy, frowning (arc above the mouth line, ends down) when not. No emoji glyph: fonts differ per machine and a
  colour emoji ignores `fillStyle`.
- **Back**: the housing's back face is plain anthracite; nothing drawn.

### 3. Per frame (`index.html`)

`stepSpeedDisplay()` is called in `loop` next to `stepPostauto(dt)` (`index.html:5774`): it builds
`car = { x: P.x, z: P.z, vx: P.vx, vz: P.vz, ground: !FOOT.on && !TRAIN.on && !FLY.on }`, computes
`displayState`, compares `displayKey` with the last key, and only on a change redraws the canvas and sets
`texture.needsUpdate = true` (the `relabelFerrisSign` pattern, `index.html:3504`). The state is kept on a small
`SPEEDSIGN` object (`{ tex, key, state, redraws }`); nothing when the sign was not built.

### 4. Debug hook

`window.__mm.speedDisplay = () => { stepSpeedDisplay(); return SPEEDSIGN ? { x, z, yaw, key, state, redraws } : null; }`
— steps first, like `__mm.touch` (`index.html:3840`), because a headless renderer draws under 1 fps.

### 5. Tests

- `tests/speeddisplay.test.mjs` (node --test): `displayState` on/off for every rule (approach side, past the sign,
  from the village, lateral, driving away, standing, not ground), `happy` at 50 vs 51, `displayKey`,
  `faceYaw`, `panelColors`; and a data guard that reads `data/world_hochrhein.json` (skipped when the file is
  missing, like `tests/busstop.test.mjs`) and asserts the foot is 1.0–1.5 m off the nearest asphalt edge, that this
  nearest road is a `Hauptstrasse`, and that the approach axis stays within 1.5 m of the Hauptstrasse centre line
  at 30, 70 and 110 m back. A rebuilt world that moves the road fails the test instead of leaving the sign in a field.
- `tests/test_speed_display.py` (Playwright, one file, foreground): opens the page like
  `tests/test_street_labels.py:15` (`open_page`, mmh blocked), then `__mm.sim(1395, −154.0, −0.0526, 60/3.6, 0.1)`
  and asserts `__mm.speedDisplay().state` is on with `kmh > 50` and `happy == false`; again at `30/3.6` → on,
  happy; then `__mm.place(1480, −175, 2.6)` (past the sign, facing the roundabout) → off; and no page errors.
  Not the full suite.

### 6. Changelog

`CHANGELOG.md` `[Unreleased]` → `### Added`, player voice, Swiss timestamp: a smiley speed display at the Sisseln
village entrance between the Smile-Kreisel and the Volg shows your speed and smiles at 50 or under.

## Assumptions

- **A1** [confirmed] Direction measured: "Nur Richtung Dorf" — only traffic driving from the Smile-Kreisel into the
  village; from the other side you see the back of the sign. `displayState` requires `0 < d ≤ range` along the
  approach and a closing velocity.
- **A2** [confirmed] What the board shows: "km/h + Smiley" — LED panel with the speed in km/h, below it a green 🙂 at
  or under 50 km/h and a red 🙁 above. `limit: 50`, `happy = kmh ≤ 50`.
- **A3** [confirmed] Gameplay: "Nur Anzeige" — pure village detail, no reward, no penalty. Nothing in `stepCar`,
  the race or the HUD changes.
- **A4** [confirmed] On foot / in the helicopter: "Dunkel bleiben" — reacts only to ground vehicles; on foot and in
  the helicopter the board stays dark. `ground = !FOOT.on && !TRAIN.on && !FLY.on` (`index.html:4168`, `3125`;
  the loco counts as not a ground vehicle on the road either).
- **A5** [high] The spot is a fixed game point in `speeddisplay.js`, not a new pipeline anchor. Rejected: adding it
  to `pipeline/anchors.json` and rebuilding `world_hochrhein.json` — a data build for one prop; the repo already
  holds hand-placed points (`landmarks.js:117` `at:`, `index.html:2318` bus stop). The node data guard keeps the
  point honest against the world file.
- **A6** [med] The exact spot: the middle of the bend (road point `(1463.4, −162.5)`, heading change 20° → 31°
  there), right of travel, 1.2 m off the asphalt edge → foot `(1465.45, −158.27)`, 5.4 m from building 171822747.
  Rejected: the start of the bend at `(1437.4, −156.1)` (that is the Widenmattstrasse junction) and the end at
  `(1488, −182.7)` (already past the bend, 50 m from the Volg). Right side because Swiss speed displays stand on
  the right shoulder of the measured direction, and the right is the outside of this left bend, visible down the
  whole straight.
- **A7** [med] Facing and corridor follow the straight approach (`approach` from `(1395.6, −153.9) →
  (1437.4, −156.1)`), yaw −1.518 rad, not the bend tangent at the sign (−0.45 rad). Rejected: the bend tangent —
  a straight corridor along it leaves the road after 30 m and the panel would face a field. Measured: the road
  centre line stays within 0.7 m of the approach axis over the whole 125 m behind the sign.
- **A8** [med] Activation range 120 m, lateral tolerance 10 m, dark under 3 km/h. Real village displays (Viasis
  and the like) pick cars up at 100–150 m; 120 m puts the switch-on 76 m after the roundabout exit (196 m back).
  Rejected: route distance along the Hauptstrasse (a graph walk per frame for a straight road).
- **A9** [med] Look: anthracite housing 0.8 × 1.2 m on a grey pole, centre 2.2 m up, black LED face with amber
  digits `#ffb000`, "km/h" small under them, and a procedurally drawn ring face: green `#39d353` smile, red
  `#ff3b30` frown. Rejected: an emoji glyph (font-dependent, ignores colour) and a separate "Danke"/"Langsam"
  text panel (the confirmed answer is number + smiley only).
- **A10** [high] The canvas is redrawn only when `displayKey` changes (integer km/h or face), never every frame.
  Rejected: `makeTex` per frame (allocates a texture each time).
- **A11** [high] Built only when `at('smileKreisel')` exists, in the landmark block after the roundabout
  (`index.html:2425`). The Ehrendingen world has no such anchor and gets no sign.
- **A12** [med] No collision box for the pole or the housing — the player drives through it, as through the bus
  stop poles (`2026-11-07-swiss-bus-stops-design.md`, Out of scope). Rejected: `addOBB` for a 0.1 m pole.

## Consequences

- One `displayState` per frame (a handful of multiplications) and a 256 × 384 canvas redraw whenever the rounded
  km/h changes while the player is in the corridor — at most a few redraws per second, bounded by the speed change.
- The node data guard ties the test suite to `data/world_hochrhein.json`'s Hauptstrasse geometry; a world rebuild
  that moves the road by more than ~0.3 m or renames the way fails `node --test` with a clear message.
- The Playwright file adds one browser start (~1–2 min headless) to the targeted run; the full suite is unchanged
  in scope.
- The sign is in the Hochrhein world only; other regions are untouched.

## Out of scope

- Any gameplay effect (score, toast, achievement, tutorial step).
- A second display for the other direction or for other villages.
- A collision box; a flashing "Danke" / "Langsam" text; a speed-camera flash.
- A pipeline anchor or a world rebuild.
