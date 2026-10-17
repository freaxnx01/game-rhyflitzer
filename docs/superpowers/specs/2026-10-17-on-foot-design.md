# On foot: get out of the car, walk and hover in first person (#202)

## Goal

`Z` stops being "just a key" and becomes a second way to move: get out of the stopped car, walk around in first person with
gravity, toggle a Minecraft-style hover (Space up, Shift down), and get back in when standing next to the parked car. The tester's
use case (playtest 2026-10-11, entry 4) is the Eiffel room of the hideout (#277): leave the car on the meadow, walk between the
tower's legs, hover up beside it.

Maintainer decisions (comment on #202, 2026-10-17) are settled and not revisited here:

- walk with gravity + toggle to hover (Space up, Shift down), first person, **not** the helicopter;
- solid collisions in both modes with the car's own colliders;
- getting out during a race is allowed, but the run is then not clean (no best, no rank); checkpoints reached on foot don't count;
- `Z` matched by `e.key` (`'z'`/`'Z'`), so it is the key labelled Z on QWERTZ and QWERTY.

Touch is **out of scope**: there is no on-screen Z button and no touch look. A touch device simply never gets out (the feature
is keyboard + mouse). Adding a button would mean a new touch control row and touch drag-look; that is a follow-up, not this issue.

## How it fits the existing code

### The helicopter is the template (FLY)

The helicopter already solves "a second movement mode while the car is not driving":

- `FLY = { on, v, alt }` (`prototype/index.html:1931`) is the mode state; **`P` stays the position** "so map, compass and HUD
  follow" (comment at `index.html:1930`).
- The main loop picks the stepper: `if (FLY.on) stepFly(dt); else stepCar(dt);` (`index.html:2916`).
- The flight model is pure (`prototype/heli.js`): `heliInput(keys, touch)` reads Space/Shift as the lift axis
  (`heli.js:11-18`), `heliFloor` lifts the floor over non-bridge boxes (`heli.js:21-28`), `stepHeli` is one fixed step.
- `stepCamera` branches on the mode: `if (FLY.on) flyCamera(dt); else if (v.eye) …` (`index.html:2522`); C is ignored while
  flying (`index.html:2143`, `!FLY.on`), and `camView` is kept untouched, so landing returns to the view you had.
- `resetCar()` turns the mode off (`FLY.on = false`, `index.html:2228`). Every teleport goes through it — R, J (`jumpTo` →
  `placeOnRoad`, `index.html:2186-2188`), the map double-click (`placeFromMap`, `index.html:2775`), the beam (`beamTo`,
  `index.html:2786`) and Start (`startRace`, `index.html:2569`) — so all of them end a flight.
- The race marks a flight as not clean with `R.flown` (set in `takeOff`, `index.html:2282`; reset in `startRace`; read in the
  `clean` checks of `endHunt` `index.html:2584` and `finish` `index.html:2586`, and in `penalties()` `index.html:2588`), and
  checkpoints only count under `!FLY.on` (`stepRace`, `index.html:2577`); presents use `canCollect(…, FLY.on)`
  (`index.html:2578`, `presents.js:114-117`).

On foot copies this pattern one to one: a `FOOT` state object, `P` is the walker, a pure model in a new `prototype/foot.js`,
one more branch in the loop and in `stepCamera`, `resetCar()` ends it, and a new `R.walked` flag.

The one real difference: the car **stays in the world**. That falls out of the pattern for free — `car.position` is only
written by `stepCar` (`index.html:2493`) and `resetCar`, so while `stepCar` is not called the car mesh stays where it stopped.
`FOOT.car = { x, z, y, th }` records the parked pose (for collision, the shadow and getting back in).

### Camera: reuse the eye-view pipeline, no new CAM_VIEWS entry

`CAM_VIEWS` (`index.html:2507`) is what C cycles through (`cycleCamera`, `index.html:2511`). First person on foot must not be
reachable by C, and leaving it must restore the car's view, so it is **not** a sixth `CAM_VIEWS` entry. Instead it is a third
mode branch next to `flyCamera`, exactly like the helicopter's:

```js
if (FOOT.on) footCamera(); else if (FLY.on) flyCamera(dt); else if (v.eye) { … }
```

`footCamera()` does what the eye views already do (`camPos.set(…)`, `camera.position.copy(camPos)`, `camera.lookAt(…)`,
`index.html:2522`), fed by a pure `footView(x, y, z, th, pitch, cfg)` in `prototype/camera.js` (next to `droneSway`) that adds
the one thing the eye views lack: pitch. `camTail()` (`index.html:2528`) still runs after it, so sky, sun and the
underwater switch follow the walker's eye unchanged. C stays ignored on foot (as in flight); `camView` is untouched, so getting
back in returns to the view you left.

`car.visible` becomes `FOOT.on || (!v.eye && !HUD.carHidden && !FLY.on)` (`index.html:2521`): on foot you see your parked car
even if you got out of the cockpit view. The rear-view mirror is off on foot (`mirrorVisible({ flying: FLY.on || FOOT.on, … })`,
`index.html:2544`). The car's shadow decal is drawn at the parked pose, not under the walker (`drawShadow`, `index.html:1925`,
reads `FOOT.car` instead of `P` while on foot; `SHADOW_STATE.y` is frozen because `stepCar` does not run).

### Ground height

Walking uses the car's ground: `groundH(x, z, y)` (`index.html:799`), which on the surface is `surfaceGroundH`
(`index.html:800-813`: bridges/OSM decks/pontoon via `onBridge(x, z, y)`, riverbed, Kreisel aprons, the hideout lid —
"anything above the ceiling stands on the hill" — terrain/road/ramp) and in the room `LEVELS.groundAt` (`ROOM_Y`,
`room-eiffel.js` `groundAt: () => ROOM_Y`). Passing the walker's own `y` keeps the bridge-vs-underneath and lid-vs-cavern
decisions exactly as for the car.

On top of that a pure `footFloor(ground, boxes, x, z, y, cfg)` (in `foot.js`, modelled on `heliFloor`) lets you **stand on**
any non-bridge collider whose top is at most `stepUp` (0.6 m) above your feet: roofs you hovered onto, the Eiffel feet tops
(`EIFFEL.footH` 60 m, `hideout.js:26`), low walls, the parked car's roof. Without it, switching from hover to walk above a
building would drop you into the box until `collide` shoves you out sideways.

Hover keeps the walker inside the level:

- **room**: `roomFlyClamp(x, y, z, ROOM.layout)` (`room-eiffel.js`) — the helicopter's soft wall 25 m inside the ring and the
  420 m ceiling, reused as is;
- **surface**: at most `hoverMaxAgl` (150 m) over the ground; under the hill (`caveInside()`, `index.html:2198`) the eye stays
  0.3 m under `ceilingH(x, z)` (`index.html:773`), the same lid the chase camera respects (`underCeiling`, `index.html:2515`).

**The lift does not carry the walker.** `liftOnPlatform()` (`index.html:2114`) reads `P`; on foot it returns false, so the lift
stays idle when you walk onto the platform. Otherwise the ride (`liftSwitch`, `index.html:2130`) would move you to the other
level and leave the car behind on this one, and `keepBelow()` (`index.html:1999`) keeps `car` in the scene on both levels, so
the parked car would float in the wrong world. You drive into the lift, ride, then get out.

**Cave mode** (the hall's look under the hill) is switched in `stepCar` (`index.html:2492`). That line is extracted into
`followCave()` and called from both `stepCar` and `stepFoot`, so walking into the tunnel darkens the look exactly as driving does.

### Collision: the car's colliders, shared push geometry

The car collides in `collide(r)` (`index.html:2470`): it iterates `gridQuery(OBB_GRID, …)` — the surface grid with buildings,
`forestCollider` trunks (`world.js:802`), the hideout's `secret` walls (`index.html:1118`, `1124`), bridge parapets; in the
room the grid swapped in by `LEVELS.onChange` (`index.html:2001`) with the ring walls, the four Eiffel feet and the lift house
walls (`room-eiffel.js:16-22`) — filters some (`under && !o.secret`, bridge `y0`, `low` tops, the pontoon corridor through the
woods), computes a push-out for OBB / `circle` / `ring` shapes, and then applies the **car's** impact response (velocity
reflection, `crashHit`, `SFX.crash`).

The walker needs the same shapes but not the impact response. So the shape part moves into a pure
`colliderPush(o, x, z, r)` in `prototype/world.js` (next to `ringPush`, `world.js:778`) returning `{ wx, wz, pen } | null`;
`collide` calls it and keeps its response unchanged, and a new `collideFoot(r)` in `index.html` calls it with the walker's
filters and only moves `P.x/P.z`. The walker's filters are the car's, plus: a box whose top is at or below the walker's feet
does not block (you are on it or above it — this is what lets hover pass over roofs). The parked car is one extra OBB
(`FOOT.car` + `CAR_SIZE`, `index.html:1902`) checked by `collideFoot`; it is not added to the grid.

### Input

All keys listed in the task were grepped across `prototype/*.js` and `prototype/index.html` (incl. `pause.js`, `carselect.js`,
`route.js` `TAKE_OVER_KEYS`, the `keys.KeyB` / `keys.Tab` reads and `e.key` uses `'+' '=' '-' '?'`): neither `KeyZ`, `KeyY`
(the physical key under the Z label on QWERTZ) nor `e.key` `'z'`/`'y'` is used anywhere. Z is free.

`Z` is handled in the main keydown handler (`index.html:2143`), matched by `e.key.toLowerCase() === 'z'`, ignoring repeats.
`keys[e.code]` still records `KeyY`/`KeyZ`; nothing reads them.

On foot (pure `footInput(keys)` in `foot.js`):

| Key | On foot |
|---|---|
| W / ↑, S / ↓ | forward / back |
| A, D | sidestep left / right |
| ← / → | turn (the keyboard-only look) |
| mouse (pointer lock) | turn and look up/down |
| F | walk ↔ hover |
| Space | hover: up · walk: jump |
| Shift | hover: down |
| Z | back into the car (within reach) |

`F` toggles hover on foot. It is the "fly" key of this game (`keyHeli`, `strings.js:166`), and the helicopter cannot start
on foot anyway. Space/Shift are the helicopter's climb/sink keys (`heliInput`, `heli.js:15`), so the hover's up/down matches
what players already know.

**Disabled on foot** (the car's controls; a key that does nothing is silent, no toast): C (camera), O (autopilot), I (navi),
U (pontoon), N (nitro), Ctrl (handbrake), B (look back), H / Enter (horn), Q / E (turn signals), L (lights), 1 (hazard),
V (show/hide car — the parked car is always shown on foot), and the beam (`beamAllowed`, `index.html:2783`, gets `!FOOT.on` so
the click that grabs the mouse can never double-click-beam).

**Still active on foot**: Esc / P (pause), Tab (full map), +/- (map zoom), M, T, X (photo), G, K, F1/?, F3, and the teleports
R, J and the map double-click, which put the **car** on the road and you back in it (they go through `resetCar`, which ends
the on-foot mode — the same rule the helicopter follows).

### Mouse look and Esc

- A click on the canvas (`#gl`) while on foot (game running, no overlay, not paused) calls `gl.requestPointerLock()`. The
  get-out toast (`footOut`) carries the hint: "Z gets back in · click to look with the mouse".
- `mousemove` while `document.pointerLockElement === gl` turns (`movementX`) and pitches (`movementY`) through a pure
  `footLook(th, pitch, dx, dy, cfg)` (`foot.js`), pitch clamped to ±1.4 rad. Without pointer lock the arrow keys turn and the
  pitch stays where it is (keyboard-only works on its own).
- **Esc and pointer lock.** While the pointer is locked, the browser uses Esc to release it, and Chrome does not deliver that
  keydown to the page. So a `pointerlockchange` to "unlocked" while on foot calls `openPause()` (`index.html:2633`), which is
  already a no-op when paused or not in a run (`inRun`, `index.html:2631`). If the keydown does arrive, `pauseKey`
  (`index.html:2645`) opens the pause first and the later `pointerlockchange` finds it open. Either way one Esc = one pause.
  `openPause` also calls `document.exitPointerLock()` so P (pause without Esc) frees the cursor for the menu. Resume does not
  grab the mouse again; the next click on the canvas does.
- Getting back in and `resetCar` call `document.exitPointerLock()` after `FOOT.on = false`, so their unlock event does not
  pause.

### Getting out and back in

Out (`Z` in the car): only when the car stands (`hypot(P.vx, P.vz) < 0.5`), is on the ground and dry (`!P.air`,
`P.splash === 0`), and no helicopter, wreck, lift ride, car selection, overlay or pause is active. Otherwise: `footStopFirst`
when moving, silence for the other states (they are modes the player is obviously in). The walker appears beside the car, on
the left (driver's) side first, then right, behind, front (pure `exitSpots(car, size, cfg)` in `foot.js`); the first spot
that is not inside a collider and not in water wins. No free spot: toast `footNoRoom`, stay in. Getting out stops the autopilot
(`stopAuto('reset')`) and marks a race run (`R.walked = true` when `R.state` is `armed` or `racing`).

In (`Z` on foot): only within `enterReach` (2.5 m) of the parked car's box (pure `carReach` = distance from the walker to the
car's OBB). Too far: toast `footTooFar`. Getting in puts `P` back on `FOOT.car`, zero velocity, `FOOT.on = false`.

## Race rules

- `R.walked` is reset in `startRace`, set on getting out in `armed`/`racing`, added to both `clean` checks (`endHunt`,
  `finish`), to `penalties()` (`notCountedFoot`) and to `__mm.raceFlags()` (`index.html:2333`).
- Checkpoints and the finish: the `!FLY.on` gate in `stepRace` becomes `!FLY.on && !FOOT.on` — you walk through them
  without effect, and they still wait for the car.
- Presents (hunt): `canCollect(…, FLY.on || FOOT.on)`.
- The clock: armed → racing starts on movement (`stepRace`, `index.html:2577`) regardless of the mode, as for the helicopter.

## HUD and strings

New keys in both `en` and `de` of `prototype/strings.js` (the `strings.test.mjs` parity tests cover them): `footOut`,
`footIn`, `footHover`, `footWalk`, `footStopFirst`, `footNoRoom`, `footTooFar`, `notCountedFoot`, `keyFoot`.
German uses real umlauts and Swiss `ss` ("zu Fuss"). A help row `<kbd>Z</kbd><span data-i18n="keyFoot">` goes right after the
helicopter row (`index.html:209`).

The speedometer, compass, minimap and debug panel read `P`, so they show the walker; the engine sound is told `kmh: 0, gas: 0`
on foot so it idles like a parked car (`SFX.update`, `index.html:2916`).

## Testing

- **node** (`prototype/tests/foot.test.mjs`, new): `footInput`, `stepFoot` (walk speed, gravity, landing on the floor, jump only
  when grounded, hover up/down, sidestep), `footFloor` (stand on a box within `stepUp`, not on a higher one, ignore bridges),
  `footLook` (turn sign, pitch clamp), `exitSpots` (left first, distance clears the car), `carReach`, `colliderPush` (OBB,
  circle, miss) and `footView` (eye height, pitch looks up).
- **Playwright** (`prototype/tests/test_on_foot.py`, new, hand-traced layout like `test_heli.py` so it needs no data files),
  one browser per test, a `__mm.footSim(secs, hold)` hook stepping `stepFoot` headless:
  1. Z gets out beside the car, the camera is at eye height, the car stays visible where it stopped; Z far away says
     "too far", Z next to it gets back in; Z while moving says "stop first".
  2. Walking into a building stops at its wall; F + Space hovers up past its roof, F again lands on the roof.
  3. A race run with a get-out is not counted (`raceFlags().walked`), and a checkpoint walked through is not taken.
- No full suite. No room (hideout) Playwright test: it needs the real world and takes minutes; the room's colliders and clamp
  are the same functions as the helicopter's, which `test_hideout.py` already covers, and `colliderPush` is unit-tested.

## Out of scope / discoveries (not work)

- Touch controls for on foot (button + drag look).
- The upper Eiffel lattice is not solid for anyone: only the four feet up to `EIFFEL.footH` (60 m) are colliders
  (`room-eiffel.js:17-19`). Hovering above 60 m passes through the tower's struts. Making the lattice solid is a separate
  collider job (it would also change the helicopter).
- The minimap has no marker for the parked car; on foot it shows only you.
- Riding the lift on foot (would need the car to stay behind on its level, see Ground height).
- Walking does not add to the trip odometer (`P.trip` is counted in `stepCar`).
