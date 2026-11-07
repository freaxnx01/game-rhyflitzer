# Postauto: spinning wheels, a closed floor, engine sound (#709): design

**Issue:** #709. **Builds on:** #500 / PR#696 (Postautos), #478 (the bus glTF).

## Goal

The timetable Postautos roll their wheels with their speed, show a closed floor from inside, and are heard
(engine, louder when near), reusing what the player's vehicles already do.

## Findings (measured, not guessed)

**Floor.** `assets/bus.glb` is not missing a floor: the underbody exists (material `Plain_7`, dark grey, 8025 vertices,
about 28.6 m2 of triangles facing down at y = 0.24). It is a **single-sided shell whose faces point down only**, and the
material is not double-sided (glTF `doubleSided` is unset, only `Glass` has it). Probe with three.js 0.170 on the shipped
file, rays over the cabin footprint (x -5..5, z -1..1, 105 samples):

| Ray | Front faces only (as rendered) | Both sides |
|---|---|---|
| up from below the bus | 105 / 105 hit | 105 / 105 |
| down from inside the cabin (y = 2) | **0 / 105 hit** | 105 / 105 |

So from outside and below the bus looks closed; seen from above or through the tinted glass the floor is back-face culled
and the road shows through. The cause is the asset's face orientation plus the default `FrontSide`, not the Postauto mesh
prep: `buildPostautoMesh` (`index.html:3891`) clones the cached scene unchanged, and `prepareGltfScene`
(`index.html:2892`) only touches glass and over-glass materials (`index.html:2894`). **The player's bus has the same
defect**: both use the same cached scene, `GLTF_CARS.bus.scene` (`index.html:2913`, `index.html:3892`), and the
materials are shared (`SHARED_CAR_MATS`, `index.html:2947`), so one material change fixes both.
`tools/prepare-bus.mjs:94` already supports `doubleSided` per material for the asset pipeline, but the SketchUp original
is not in the repo, so the fix is applied at load time.

**Wheels.** The player's wheel nodes are wrapped in `steer > roll` groups by `wireWheels` (`index.html:2919`) and turned
by `drawWheels` (`index.html:2979`): `roll.rotation.z = -WHEEL_STATE.spin`, spin from `stepWheelSpin`
(`steering.js:19`). `buildPostautoMesh` deliberately does not call `wireWheels` because it writes the player's globals
(`index.html:3890`, spec A8 of #500), so Postauto wheels never move.

**Sound.** The only engine voice is the player's (`SFX.update`, `index.html:3742`; `buildEngine` / `engineStep` /
`engineMix` / `applyEngine`, `sound.js:22-77`). It has no notion of position. The bus already has a sound preset
(`VEHICLES.bus.sound`, `index.html:2671`, a slow 6-cylinder diesel).

## Design

- **Floor:** a data-driven list `gltf.doubleSided: ['Plain_7']` on `VEHICLES.bus`. A pure helper `doubleSidedNames(def,
  materialNames)` in `gltfvehicle.js` returns the names (fails fast with an Error if a listed name is missing, like
  `spinPlan`); `prepareGltfScene` sets `material.side = THREE.DoubleSide` on those. Applies to the player's bus and every
  Postauto, once per file.
- **Wheels:** `buildPostautoMesh` wraps each of the four wheel nodes (`wheelPlan`, `hatchback.js:23`) of its own clone in a
  `roll` group at the wheel centre, stored in `g.userData.wheelRolls`, touching no globals. `drawPostauto` advances
  `g.userData.spin = stepWheelSpin(spin, b.v, VEHICLES.bus.wheelR, dt)` and sets `roll.rotation.z = -spin` like
  `drawWheels`. A standing bus (`b.v = 0`) does not turn its wheels. No steering of the front wheels.
- **Sound:** a pure module `postautofx.js` (no DOM, no three.js, node --test): `engineGain(dist, cfg)` (1 within
  `ref`, smooth falloff to 0 at `max`), `pickVoices(buses, listener, cfg)` (the nearest at most `voices` buses with
  gain above `floor`, as `{ key, gain, kmh }`, buses that are `done` excluded). `SFX.busEngines(list, dt)` in
  `index.html` owns one `buildEngine` voice per picked bus (each with its own `engineStep` state, the bus preset), sets the
  voice level to `engineMix(...).gain * gain`, and releases a voice that drops out of the list. The listener is the
  camera's x/z, so follow mode and the drone camera sound right. Nothing plays below the surface (`LEVELS.isSurface()`),
  while muted or paused (`SFX` holds). `stepPostauto` calls it once per frame with the bus list.
- **Debug hook:** `window.__mm.postauto()` buses gain `wheelSpin` (rad); the object gains `voices` (count) and `floorSided`.

## Assumptions

- **A1** [high] The floor is fixed at the material, not the Postauto mesh. Rejected: patching only `buildPostautoMesh`.
  The defect is in the shared glTF (probe above) and the player's bus shows it too (`index.html:2913`).
- **A2** [med] Fix by double-siding `Plain_7` at load time via `VEHICLES.bus.gltf.doubleSided`. Rejected: re-exporting
  `bus.glb` (needs the SketchUp original and the npm tool chain, not in the repo, `tools/prepare-bus.mjs:4-9`) and adding
  a mirrored top face in code (more geometry for the same look). Cost: the floor is lit from above as `Plain_7`'s dark grey
  (`baseColorFactor` 0.11), which reads as a dark interior floor.
- **A3** [high] Postauto wheels reuse `stepWheelSpin` and the `roll.rotation.z = -spin` convention of `drawWheels`
  (`index.html:2979`). Rejected: a second spin formula.
- **A4** [med] The spin radius is `VEHICLES.bus.wheelR` (0.5, `index.html:2666`), the same value the player's bus turns
  with, although the model's tyre is 0.44 m (glb wheel extents +-0.44). Rejected: 0.44, since a Postauto and the
  player's bus at the same speed should look the same; the 13 % difference is not visible.
- **A5** [high] Front wheels do not steer. Rejected: copying `steer` groups. Out of the issue's scope, the Postauto
  has no steering state (`busPose` gives only a heading).
- **A6** [high] Engine voices reuse `buildEngine` / `engineStep` / `engineMix` / `applyEngine` and `VEHICLES.bus.sound`.
  Rejected: a new synth; a fake looped sample.
- **A7** [med] At most 3 simultaneous bus voices (the nearest), full level within 8 m, silent beyond 80 m, smooth
  falloff in between (constants in `postautofx.js`, `PA.maxBuses` is 8, `postauto.js:14`). Rejected: one voice per bus
  (8 buses x 6 oscillators and 2 noise sources). The numbers are a starting point to tune by ear; no repo signal for
  the exact values, so they sit in one config object.
- **A8** [med] Distance is measured to the camera, not the car. Rejected: the car (follow mode from #707 would then be
  silent exactly when the user watches a bus).
- **A9** [high] Distance falloff only, no stereo panning. Rejected: a `StereoPannerNode` per voice, not asked for.
- **A10** [med] A standing bus idles audibly (kmh 0, `engineStep` at `idleRpm`), at its distance gain. Rejected:
  silent while standing; a bus at a stop with the engine running is what the timetable shows.
- **A11** [high] One Playwright test (`tests/test_postauto.py`), the rest in node --test. Sound level itself is not
  asserted in the browser (headless audio is suspended until a gesture); the voice choice and gain are unit-tested.

## Consequences

- Cost: up to 3 extra engine graphs (about 4 oscillators + 2 noise sources each) while buses are near. None far from line 133.
- The player's bus gets a visible floor from the cockpit and chase cameras too (it was see-through there as well).
- The `Plain_7` material is double-sided for every glTF scene that uses it; no other vehicle uses the bus file.
- Standing Postautos at a stop are audible as idling when the player is close.
