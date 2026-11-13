# #905 — Rhy Monster, a monster truck as a new vehicle (design)

## Goal

A **monster truck** joins the garage as `VEHICLES.monster`: a real glTF model the way the Rhy Estate (`estate.js`,
`beb07da`) and the Rhy Gullwing (#831) came in. In the game it is the **Rhy Monster** (de: **Rhy Monster**), type
`screen`: a 1970s-style pickup cab on a tube chassis over four 1.7 m tyres, about 5.4 m long and 3.1 m high. It
drives on **vehicle parameters only**: a big wheel radius, a tall body, a slow top speed, heavy, soft on the
steering. No new physics.

## Maintainer decisions (2026-11-13, confirmed in the enrich interview)

- Model source: **"CC model, unbranded"** — a CC-BY glTF (e.g. Sketchfab), logos and brand names removed, the author
  credited in the LICENSE file, the same path as the DeLorean/Mini. The game stays non-commercial, so CC BY-NC is
  acceptable too.
- Driving: **"Big wheels + high clearance"** — only vehicle parameters (large wheel radius, high ride height, soft
  suspension, lower top speed, heavy). It rolls over kerbs and small bumps. No new physics, no wall climbing, no
  crushing cars.
- Gallery category: **`screen`**, the same type chip as the DeLorean/Mini (`carselect.js:178` `VEHICLE_TYPES`).

## The model

**"Free Monster Truck Model" by steelcyclonestudios**, Sketchfab,
https://sketchfab.com/3d-models/free-monster-truck-model-96d16754451d4ca3a0b4c5252452f0b5 — **CC BY 4.0**
(Sketchfab API 2026-11-13: licence slug `by`, 177,333 faces, 97,220 vertices, **0 textures, 63 materials**,
1 animation, downloadable; published 2022-12-05). A yellow old-style pickup cab and bed on a tube frame, four
big lugged tyres with white rims, round head lamps, no maker's badge visible; one small emblem on the bed's side
and any lettering found on inspection are deleted. The author's text: free "for commercial or non-commercial use".

Why this one: plain materials and no textures match the ≤ 8-materials-by-role pipeline
(`docs/ai-notes/2026-10-22-vehicle-style-test.md`); the look is a classic monster truck, not a cartoon
(the 1.9k "Low-Poly Monster Truck" by MRJohnson12 and the 540-tri Blockbench one are toys; the 7k VamsiSky one
carries a logo and Monster-Jam tags). Fallback if the file turns out unusable on inspection: **"Free Destroyer
Monster Truck" by Jorma Rysky** (Rysky), CC BY 4.0, 144,577 faces, 14 textures,
https://sketchfab.com/3d-models/free-destroyer-monster-truck-8e4b03aa6fb94634b9623c5ae22f0075 (textures would be
replaced by plain materials, as the hatchback's were).

**Source file in the repo.** As for #831 (`5e86df2`), the unmodified download is committed at
`assets/src/free_monster_truck_model.glb` with `assets/src/free_monster_truck_model.LICENSE.md` **before dispatch**:
the Sketchfab download needs the maintainer's API token, which the pipeline does not have. The prep script is
deterministic from that file.

## Not in scope

- New physics: no wheel-by-wheel suspension, no climbing walls, no crushing traffic, no damage to other cars.
- Traffic use, a second LOD, changes to the depot's build order (#807) or the vehicle list order (#830).
- A new paint colour.

## Design

### 1. The asset: `assets/monster.glb` from `tools/prepare-monster.mjs`

A prep script in the `tools/prepare-*.mjs` family (template: `tools/prepare-estate.mjs` — simplify to a budget,
roles by material name, an unmapped name throws; the `--list` probe from `tools/prepare-delorean.mjs`). Run outside
the repo with `@gltf-transform/*` + `meshoptimizer` under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.

Output contract (`tools/prepare-hatchback.mjs`'s):

- Metres, +x forward, +y up, +z right, tyres on y = 0, origin on the axle midpoint. Scaled to a **3.30 m wheelbase**
  (a typical 130-inch monster truck). Expected: about 5.4 m long, 3.1 m high, 3.5 m wide, tyre radius about 0.84 m
  (66-inch tyres). The script prints l/w/h and the wheel centres; the real numbers go into `monster.js` and the tests.
- Nodes: root `monster`, `body`, `wheel_FL` `wheel_FR` `wheel_RL` `wheel_RR` (tyre, rim and hub grouped per corner
  by the sign of x and z, `hatchback.js` `wheelPlan`; translation = the tyre centre, vertices centred on it).
- The one animation is dropped. Any mesh that is an emblem, badge, lettering or number plate is deleted; node, mesh
  and material names carry no brand word.
- Materials, **≤ 8 by role**: `Paint { extras: { paint: true } }` (the cab, bonnet and bed panels — white, the swatch
  colours it), `Black` (frame, tube cage, suspension, bumpers), `Chrome` (rims, hubs, grille bars), `Rubber` (tyres),
  `Glass { extras: { glass: true } }`, `LampHead { extras: { lamp: 'head' } }` (the round head lamps),
  `LampTail { extras: { lamp: 'tail' } }`, `Amber` (the marker lights on the cab roof and bumper). The 63 original
  names are mapped in `MATERIAL_ROLES`; the `--list` probe decides which.
- Simplified from 177k to **24k–30k triangles** (the estate's budget), normals rebuilt, `EXT_meshopt_compression`,
  file ≤ 1000 KiB (`tests/test_credits.py` pins the same bound for every vehicle).

### 2. The table entry: `monster.js`

Pure module like `estate.js`, imported in `index.html` beside the other vehicle modules (`index.html:1041`) and
added as the last `VEHICLES` entry (`index.html:3317`). Values — physical units as the table header says:

| key | value | why |
|---|---|---|
| `type` | `'screen'` | confirmed |
| `model` / `gltf` | `'gltf'`, `{ id: 'monster', url: './assets/monster.glb', fallback: 'compact' }` | the compact stands in |
| `paint` / `defaultPaint` | `true` / `'sunflower'` | the model is yellow; monster trucks are loud |
| `wheels` / `wheelR` | the model's wheel nodes, r ≈ 0.84 | **big wheels**: the spin and the planted wheels follow it |
| `drive` | `top: 33` (119 km/h), `topNitro: 50`, `accel: 11`, `accelNitro: 24`, `brake: 16`, `reverse: 6`, `reverseMax: 9`, `grip: 6.5`, `gripHandbrake: 1.4`, `steerRate: 1.6`, `airSteer: 0.5` | slow top, strong V8, soft and wide in the corners |
| `mass` | `4.5` | 4.5 t: shrugs off hits, loses little speed |
| `collision` | `{ shape: 'circle', r: 1.9 }` | 5.4 m long, 3.5 m wide |
| `engineAt` | `[1.6, 1.9, 0]` | under the bonnet, up high |
| `camera` | chase `{ dist: 10, h: 4.2 }`, near `{ dist: 7, h: 3.2 }`, cockpit eye `[0.2, 2.7, -0.4]`, bumper `[2.9, 1.3, 0]`, drone `{ dist: 22, h: 14 }` | the tall body needs the cameras up and back |
| `sound` | gears `[0, 45, 999]` (a two-speed automatic), V8 like the tumbler's (`cylinders: 8`, idle 900, shift 6000, limit 6800, `topKmh: 119`), horn `{ notes: [233, 294], dur: 1.0, gain: 0.25, band: 900, wave: 'sawtooth' }`, crash `{ weight: 3, thump: 42, noise: 1100, gain: 1.1 }` | a blown V8 with two long gears; an air horn |
| `blinkers` | at the head lamps and the tail, from the model's bounds | `buildGltfVehicle -> addBlinkers` |

**High clearance** is the model's geometry (the body sits ~1.2 m over the tyre bottoms) plus `wheelR`; the kerb
logic of #902 (`vehicle.js:10` `KERB`) already steps every car onto kerbs, so the truck rolls over them like
everything else — just visibly, with its big wheels. No `tip` config: it does not tip over.

### 3. Texts, credits, tests

- `strings.js`: `veh_monster_name` "Rhy Monster" / "Rhy Monster", `veh_monster_class` "Monster truck" /
  "Monstertruck", `veh_monster_desc` (en/de), `creditMonster` (en/de) in the estate's wording; `<small
  data-i18n="creditMonster">` in the About credits (`index.html:747`).
- `README.md` credits list (after the estate line, `README.md:128`), `CHANGELOG.md` `[Unreleased] / Added`
  (timestamped, `TZ=Europe/Zurich`), `assets/monster.LICENSE.md` like `assets/estate.LICENSE.md`.
- Tests: `tests/monster.test.mjs` (the table entry, as `tests/estate.test.mjs`), `tests/monster_asset.test.mjs`
  (the file against the contract, as `tests/delorean_asset.test.mjs`), `tests/test_monster_model.py` (Playwright,
  as `tests/test_estate_model.py`), two cases in `tests/test_credits.py`, and the vehicle counts in
  `tests/test_carselect.py:93-96,192-194` go up by one (20→21, 21→22).

## Assumptions

- **A1** [confirmed] Model source: CC model, unbranded — "a CC-BY glTF (e.g. Sketchfab), with logos and brand names
  removed and the author credited in the LICENSE file. Same path as the DeLorean/Mini. The game stays
  non-commercial, so a CC-BY-NC model is acceptable too."
- **A2** [confirmed] Driving: Big wheels + high clearance — "only vehicle parameters (large wheel radius, high ride
  height, soft suspension, lower top speed, heavy). It rolls over kerbs and small bumps. No new physics, no wall
  climbing, no crushing cars."
- **A3** [confirmed] Gallery category: "screen" — the same type chip as the DeLorean/Mini.
- **A4** [med] The model is steelcyclonestudios' "Free Monster Truck Model" (CC BY 4.0, verified through the
  Sketchfab API). Rejected: Rysky's "Free Destroyer Monster Truck" (textured, based on a named real truck) and the
  cartoon/toy ones. The look is a taste call; the fallback is named above.
- **A5** [med] The unmodified source GLB is committed to `assets/src/` by the maintainer before dispatch, as for
  #831 (`5e86df2`, `assets/src/delorean_dmc_12_animated.LICENSE.md`). Rejected: downloading in the pipeline — it has
  no Sketchfab token. Without the file Task 1 cannot run.
- **A6** [med] Paintable, sunflower from the factory. Rejected: a fixed yellow livery (`paint: false`) — every
  plain-material car since the estate is paintable (`estate.js`, `coupe.js`, `hyper.js`), and a monster truck
  invites colours.
- **A7** [high] "Soft suspension" maps to the lower `grip` / `steerRate` and the bigger lean the existing body-lean
  code gives a heavy car; there is no per-vehicle suspension parameter (`index.html:3653` reads only `car.rotation.x`
  and `TIP_S.roll`). Rejected: a `tip` config like the wobbler's — the truck should not fall over.
- **A8** [high] Name "Rhy Monster" in both languages, in the "Rhy X" family of every recent vehicle (`strings.js:648`).

## Consequences

- The garage count rises to 21 selectable vehicles; `tests/test_carselect.py` pins "Car 1 of N" and the garage
  line, so those assertions move.
- At r 1.9 the collision circle is the widest of the cars (the bus is a capsule); the truck clips kerbs and
  bollards a little earlier than it looks, like the harvester.
- The chase camera sits 10 m back and 4.2 m up: behind the truck the road ahead reads from higher than in any
  other car.
- Another ~1 MB GLB in `assets/` and one more depot build (#807) on the start screen.
