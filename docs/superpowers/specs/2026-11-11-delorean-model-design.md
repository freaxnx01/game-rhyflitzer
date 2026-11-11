# A real 3D model for the Rhy Gullwing (DeLorean look-alike) (#831)

## Goal

The **Rhy Gullwing** (`VEHICLES.delorean`, built from primitives by `buildDelorean`, `index.html:3081`) gets a real
glTF model, the way the Little Classic (#468) and the Regional Bus (#478) did: the procedural car stays as the
stand-in while the file loads, the model swaps in when it arrives. The car keeps everything it does today: the
gull-wing doors that open on the start screen, brushed steel without the paint picker, lamps that follow the lights,
the DMC-12 driving values and sounds.

## Maintainer decisions (2026-11-10, confirmed)

- Model: **"DeLorean DMC 12 (Animated)" by JEX-D**, Sketchfab, **CC BY 4.0**,
  https://sketchfab.com/3d-models/delorean-dmc-12-animated-e90955c1dce945dfbcac09886b9f310e
  (API metadata 2026-11-11: 10'032 faces, 5'523 vertices, 16 materials, 0 textures, 18 animation clips, downloadable).
- **Unbranded**: no DMC logo, badge, lettering or plate. Credit the author in the README and in the game. The game
  stays non-commercial.
- Keep: gull-wing doors (`delorean.js` `DOOR` / `doorTarget` / `stepDoor`), brushed steel without the paint picker
  (`paint: false`), lamps (#270), driving values.
- The procedural build is the stand-in while the model loads: `gltf: { …, fallback: 'delorean' }`, like the mini
  and the bus.

## Not in scope

- A paintable body, a new name, new driving values or sounds.
- Any change to the depot's build order or memory use (#807) or to the vehicle list order (#830).
- Traffic cars or a second LOD.

## Design

### 1. The asset: `assets/delorean.glb` from `tools/prepare-delorean.mjs`

A prep script in the `tools/prepare-*.mjs` family (template: `tools/prepare-knight.mjs`, the wheel split as in
`tools/prepare-tumbler.mjs`), run outside the repo with `@gltf-transform/*` + `meshoptimizer` under
`systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. The original GLB
is committed unmodified at `assets/src/delorean_dmc_12_animated.glb` (CC BY 4.0, downloaded 2026-11-11 via the
Sketchfab API); the script is deterministic from that file. Nodes `C`, `D`, `M`, `M.001` (likely the "DMC" letters)
and `DeLorean Body_license plate_0` are branding to remove.

Output contract (the one `index.html` relies on, see `tools/prepare-hatchback.mjs`), plus the doors:

- Metres, +x forward, +y up, +z right, wheels on y = 0, origin on the axle midpoint. Scaled to the DMC-12's
  **2.41 m wheelbase**; the result must measure 4.27 m long (±0.05), 1.14 m high (±0.05) and about 2.0 m wide over the
  mirrors (±0.08) with the doors shut, which is what `tests/test_vehicles.py::test_delorean_is_in_the_table_and_true_to_size`
  and `tests/test_car_look.py::test_delorean_stays_within_the_frame_budget_and_size` already pin for the procedural
  car. If the model's proportions put the length more than 0.05 m off at that wheelbase, scale by the 4.27 m length
  instead and say so in the script's header.
- Nodes: root **`gullwing`** (not the brand word), `body`, `wheel_FL` `wheel_FR` `wheel_RL` `wheel_RR` (the model's
  two wheel nodes `DeLorean wheels.001/.002` split into four by the sign of x and z, each centred on its tyre,
  `hatchback.js` `wheelPlan`), **`door_L`** and **`door_R`** (the model's `door` / `door.001`).
- Door nodes: translation = the hinge point (the door's inner top edge: its highest y, its z nearest the centre line,
  its x centre), vertices relative to it, no rotation left on the node. The game rotates the node about its local x
  axis (`drawDoors`), exactly as it rotates the procedural hinge group today, so the door swings up about the roof
  spine. Every animation clip (`doorAction` and the other 17) is dropped: the game drives the doors itself.
- The `license_plate` mesh is deleted. Any lettering or badge found on inspection (the DMC grille letters, the rear
  "DeLorean" script, a dashboard logo) is deleted too; the node/mesh/material names carry no brand word
  (`tests/delorean_asset.test.mjs` greps for `delorean`, `dmc`, `plate`).
- Materials: the 16 originals merged into **≤ 8 by role** (the #368 budget, `docs/ai-notes/2026-10-22-vehicle-style-test.md`):
  `Steel` (the body panels), `Dark` (sills, louvres, bumpers, trim, interior plastics), `Glass { extras: { glass: true } }`,
  `LampHead { extras: { lamp: 'head' } }`, `LampTail { extras: { lamp: 'tail' } }`, `Rubber`, `Rim`, `Interior`
  (seats, dashboard). No `Paint` material and no `extras.paint` anywhere (the paint picker stays off). No textures,
  `EXT_meshopt_compression` only, ≤ 500 KB.
- Budget: 8'000–12'000 triangles (no simplify; the file is 10k).
- `assets/delorean.LICENSE.md` in the shape of `assets/knight.LICENSE.md`: title, author JEX-D
  (https://sketchfab.com/JEX-D), source URL, CC BY 4.0, the in-game name, the modifications list.

### 2. The game: the mini pattern, plus the doors

- `VEHICLES.delorean` (`index.html:2947`) gets `gltf: { id: 'delorean', url: './assets/delorean.glb', fallback: 'delorean' }`
  and `blinkers: [[2.02, 0.5, 0.8], [-2.06, 0.5, 0.8]]` (the procedural car's corner boxes, mirrored to ±z, which
  `buildGltfVehicle` → `addBlinkers` needs). `model: 'delorean'`, `paint: false`, wheels, drive, sound, camera stay.
- `buildDelorean` starts like `buildMini` (`index.html:3107`):
  `if (gltfState('delorean') === 'ready') { buildGltfVehicle(g, v); dressGullwing(g); return; }` — the primitives
  follow unchanged for the stand-in.
- `dressGullwing(g)` (new, beside `buildDelorean`):
  1. every mesh whose material is named `Steel` gets **`carMats.steel`** (the shared brushed-steel material with the
     grain map, `index.html:3018`) — so the model is the same steel as the stand-in, restyles with `applyStyle`, and
     is never disposed (`SHARED_CAR_MATS`);
  2. wires the doors: for `['door_L', -1]`, `['door_R', 1]` it finds the node, adds a `panel` marker
     (`THREE.Object3D`) at the door's lowest outer corner from `doorPanelOffset(box, side)` and pushes
     `{ side, hinge: node, panel }` into `g.userData.doors` — the shape `drawDoors` and `window.__mm.doors` already read.
     A missing door node throws (fail fast, like a missing wheel node).
- `delorean.js` gets one pure function, unit-tested:
  `doorPanelOffset({ min, max }, side)` → `[(min.x + max.x) / 2, min.y, side > 0 ? max.z : min.z]`: the node-local
  point whose world y the door test watches rise (`panelY`). Hinge geometry is the prep script's; the game only
  trusts the contract.
- Nothing changes in `stepDoors` / `drawDoors` / `DOOR` (`index.html:3315-3317`), in `loadVehicleModel`,
  `selectVehicle`, `vehicleLoaded`, the gallery or the depot: all of them already handle a vehicle that is its own
  fallback (mini, bus). The depot builds the stand-in and swaps the model in through the same `MODELS.delorean`.

### 3. Credits

- `strings.js`: `creditDelorean` EN/DE in the `creditKnight` style
  (EN: `3D model „DeLorean DMC 12 (Animated)" by JEX-D (Sketchfab), CC BY 4.0; rescaled, plain materials in the game's
  brushed steel, the number plate and the lettering removed, the doors and wheels in their own nodes`).
- `index.html` About → Credits: `<small data-i18n="creditDelorean"></small>` after `creditEstate` (line ~697);
  `tests/test_about.py::test_every_credit_moved_from_the_help_to_about` fails otherwise.
- `README.md` "Third-party 3D models" list: a line for the Rhy Gullwing in the existing shape (line ~109).
- `CHANGELOG.md` `[Unreleased]` → `### Changed`: one player-facing entry.

### 4. Tests

- Node: `tests/delorean.test.mjs` (`doorPanelOffset`), `tests/delorean_asset.test.mjs` (the committed GLB: size,
  triangles, ≤ 8 materials, no textures, meshopt only, the node names, no brand words, no animations, the
  `LICENSE.md` present).
- Browser (new `tests/test_delorean_model.py`, the shape of `tests/test_mini_model.py`): the model builds true to
  size with four wheels, head and tail lamp materials, no paint material, ≤ 8 materials; the doors open on the start
  screen and close on Start with the model loaded (`__mm.doors().panelY` rises by > 0.3 m); `?vehicle=delorean`
  starts with the stand-in and swaps the model in; the lamps follow L.
- Existing: `tests/test_vehicles.py` (the DeLorean block), `tests/test_car_look.py`, `tests/test_lights.py`,
  `tests/test_shadow.py`, `tests/test_wheels.py`, `tests/test_carselect.py` keep passing — they measure whichever
  build is current, and the model matches the stand-in's size.

## Acceptance criteria

- [ ] `assets/delorean.glb` (≤ 500 KB, 8–12k triangles, ≤ 8 materials, no textures, no animations, meshopt only)
      and `assets/delorean.LICENSE.md` are committed; `tools/prepare-delorean.mjs` produces the file from the
      original and is committed.
- [ ] Picking the Rhy Gullwing shows the procedural car until the model arrives, then the model; a failed load keeps
      the procedural car and shows the load-failed toast (`vehicleFailed`, unchanged, as for the mini).
- [ ] With the model: the doors swing up on the start screen and close on Start; the head and tail lamps follow L and
      the brakes; the four wheels roll and the front pair steers; the body is brushed steel, no paint swatch applies.
- [ ] No logo, badge, lettering or number plate on the model; no brand word in the file's names.
- [ ] Credit in `README.md`, `assets/delorean.LICENSE.md`, `strings.js` (EN + DE) and the About dialog.
- [ ] `node --test tests/` passes; the Playwright files named in the plan pass on the GPU runner.

## Relation to other issues

- **#830** (plan on main, `docs/superpowers/plans/2026-11-11-retire-speedster.md`): moves the `hatchback:` line
  inside the `VEHICLES` literal and replaces `Object.keys(VEHICLES)` with `vehicleIds()`. This issue edits the
  `delorean:` entry three lines away and adds nothing to the id list. Same file, adjacent lines: whichever lands
  second rebases over a trivial conflict in the literal; nothing else overlaps. #830's test changes
  (`Car 2 of 21` → `Car 2 of 20` for the DeLorean) are untouched here.
- **#807** (depot memory): no depot code changes here; the stand-in → model swap in the depot is the existing
  mini/bus path. #807's "skip the fallback build for glTF vehicles" idea would cover this car automatically.
