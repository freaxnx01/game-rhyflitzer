# Teleport to a clicked point in the landscape (#165) — design

## Context (state of `main`, 4587571)

- The minimap already does this on the road: double-click (mouse) or double-tap (touch, two taps < 300 ms and < 30 px) calls `placeFromMap` -> `jumpTo` -> `placeOnRoad(x, z, th, name)` (`index.html` near `function placeFromMap`, `placeOnRoad` ~1680). `placeOnRoad` sets `P.safe` (so R returns there), clears the Navi, `resetCar()` (stops the autopilot, ends a flight, zero velocity, `P.y = groundH`), and sets **`R.jumped = true` while armed or racing** ("with a jump, not counted").
- A plain click or double-click on the 3D view (`<canvas id="gl">`, `touch-action: none`) does nothing today. The HUD is `pointer-events: none` except real buttons, so a click on empty HUD reaches the canvas; the touch steering circles (`#touch button`) take their own taps.
- `nearestJumpable(x, z)` returns `{ d, x, z, th }`, the nearest point on a drivable road. `collide(r)` pushes the car out of buildings; `window.__mm.pushAt` already uses it as a read-only probe. Terrain meshes are one `THREE.Mesh` per role in `MESH` (`grass`, `field`, `road`, `roadOsm`, `roadPlain`, ...); `window.__mm.topAt` raycasts them.
- Keys bound: A B C D E F G H I J K M N O Q R S T V W X; P reserved for the pontoon bridge (#100); L is wanted for lights (#2).

## Design

**Gesture: double-click (mouse) / double-tap (touch) on the 3D view.** Same gesture as the minimap, no key needed, works on touch, and a single click stays free for later. Placements < 500 ms apart are one gesture (like `MAP.placedT`).

**Pick:** a `THREE.Raycaster` from the pointer through the camera (`setFromCamera`) against the terrain and road meshes only (`grass`, `field`, `road`, `roadOsm`, `roadPlain`; buildings, trees and water are not targets, so clicking a house beams to the ground behind it, clicking the sky does nothing). The hit's `x, z` is the target; the height comes from `groundH` like every placement.

**Landing:** on the clicked **terrain point itself** (a hill top is fine), car standing still, **heading kept**. If that spot is blocked (inside a building: `collide` pushes it out; or in water: `waterLevelAt` is not null) the car lands on the **nearest drivable road within 30 m** instead, heading along the road; no road in reach -> a toast "No place to beam to there" and nothing moves. This decision is a pure function `beamSpot(x, z, { blocked, nearestRoad })` in a new module `beam.js`, unit-tested with node.

**Races:** it goes through `placeOnRoad`, so during a race it **flags the run like J: `R.jumped`**, "with a jump, not counted". No new flag, no new result text.

**Not available when** the start/result overlay, the J/O/I dialog, the help, the pause menu or the car selection is open, or **while flying** (the heli has F; `resetCar` would silently end the flight).

**Touch:** double-tap in an empty area of the screen (the steering circles and buttons keep their taps). A new `keyBeam` line in the help lists the gesture.

## Acceptance Criteria

- [ ] Double-clicking the 3D view while driving puts the car on the clicked ground point (`__mm.car()` equals the pick, within 0.5 m) with the heading unchanged and zero speed; a toast "Beamed!" / „Gebeamt!“ shows.
- [ ] A single click does nothing.
- [ ] A double-tap on a touch device does the same (Playwright `touchscreen.tap` twice).
- [ ] If the clicked point is in water or inside a building, the car lands on the nearest drivable road within 30 m, else nothing moves and the toast „Dort kann man nicht landen“ / "No place to beam to there" shows.
- [ ] During `armed`/`racing` it sets `raceFlags().jumped`; the result says "with a jump, not counted".
- [ ] Ignored on the start screen, with dialogs, pause, car selection open, and while flying.
- [ ] `beam.js` has node tests (terrain, blocked -> road, blocked -> too far); `strings.js` `en`/`de` have `beamed`, `beamNone`, `keyBeam` with equal keys; the help panel lists the gesture.
- [ ] `test_minimap.py` (the map's double-click) and `test_jump.py` stay green.

## Assumptions

- **A0** [needs maintainer] **Gesture = double-click / double-tap on the 3D view.** Rejected: a modifier + click (Alt/Shift+click: no touch equivalent, Alt is eaten by some window managers); "key then click" (L/U/Y/Z are the only free keys, L is wanted for lights #2, and a mode adds state); plain single click (would fire on every stray click and on touch tap-to-focus).
- **A1** [needs maintainer] **A beam during a race flags the run as "jumped" (does not count).** Reuses the J flag and text. Alternative: a separate flag with its own text "with a beam, not counted" (one more string and flag, as in #189); or counting beams (not recommended: it skips the course).
- **A2** [needs maintainer] **Landing on the exact terrain point, not snapped to a road**, as the issue says ("a hill"). Snapping only when the spot is blocked. Rejected: always the nearest road (that is what J and the map do already).
- **A3** [med] Heading is kept; the car stands still. Rejected: facing the direction of the camera ray (the camera would then swing).
- **A4** [med] Disabled while flying. Rejected: letting it end the flight (surprising) or move the heli (a different feature).
- **A5** [med] 30 m snap radius for a blocked spot (`BEAM_SNAP`); one constant in `beam.js`.
- **A6** [med] The beam is a plain placement: no sound, no flash. Rejected for now: an effect (could be a later polish, needs design).
- **A7** [high] `P.safe` is set to the landing spot, so R "back on the road" returns there (same as J). On open terrain R therefore puts the car back on that terrain spot, not on a road; accepted.
- **A8** [high] Tests use the hooks `__mm.beamPick(cx, cy)` and `__mm.beam()` (last landing) and wait two frames for the camera matrices; no loosened assertions.

## Consequences

- A double-click on the canvas that used to do nothing now moves the car. Players who double-click the game to focus it will beam by accident; during a race that flags the run.
- On open ground R returns to the beamed spot (A7).
- The raycast against the big terrain meshes runs once per gesture (no per-frame cost).
