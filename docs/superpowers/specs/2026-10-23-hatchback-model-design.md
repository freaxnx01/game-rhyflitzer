# Hatchback: a real 3D car in the car select (#236)

Status: enriched 2026-10-23, maintainer decisions applied 2026-10-23 (issue #236 and its comments, style test #368 / PR#444).
Executed **locally** by subagents, not by the pipeline: the model prep needs the original GLB (not in the repo) and the
visual checks need the GPU browser (#304).

## Intent

Add a second, higher-quality car next to today's compact: the Sketchfab model „2020 Mazda 3 Hatchback" by OUTPISTON
(CC BY-NC-SA 4.0, https://skfb.ly/pAOpM), shipped as an **unbranded** ~21k-triangle game model called **Hatchback**.

- A **new entry in the car select**; the compact stays the default and stays procedural.
- Paint picker works on the Hatchback's body (mild-gloss paint, default red).
- It drives a little livelier than the compact, has its own 4-cylinder sound, and takes part in everything a car takes part in:
  steering and rolling wheels, damage and wreck, lights, ground shadow, rear-view mirror, photo.
- **See-through windows** (a deliberate exception to the dark windows of #133 for this car only).
- The model is **lazy-loaded** (only when the player highlights or starts with the Hatchback) and falls back to the compact
  with a toast when the file cannot be loaded.
- The licence and the credit are part of the deliverable: file note, README, CHANGELOG, in-game help (F1 / Ctrl+P).

## Decisions (maintainer, 2026-10-10 … 2026-10-23)

| # | Decision | Source |
|---|---|---|
| D1 | Use the model **without the maker's name and badges**: front emblem, rear emblem, rear lettering and the `RimBadges` texture are gone; unbranded like the DeLorean look-alike | #236 |
| D2 | The game stays **non-commercial**; the modified file stays CC BY-NC-SA 4.0; credits in README and in the game | #236, #235 |
| D3 | Optimise for desktop, not phones | #236 |
| D4 | **New vehicle** in the car select (id `hatchback`, name „Hatchback" in de and en); compact stays the default | 2026-10-23 |
| D5 | Take the **~21k variant without chrome** from the style test: grey plastic trims, mild-gloss paint, badges neutralised, wheels as separate nodes; ≤ 25k triangles, ≤ 8 materials, ≤ 500 KB | #368 |
| D6 | **Keep the see-through windows**: cheap glass (transparent, low opacity, slight tint, env-map sheen), **no `KHR_materials_transmission`**. If the simplified interior reads badly through it, add a simple dark interior shell behind the glass | #236 comment |
| D7 | Committed file `prototype/assets/hatchback.glb` (meshopt-compressed) + `prototype/assets/hatchback.LICENSE.md`; the original (16.7 MB) is **never** committed | 2026-10-23 |
| D8 | Reproducible prep script `tools/prepare-hatchback.mjs`: reads the original GLB from a path argument, documents the node names | 2026-10-23 |
| D9 | Lazy load on highlight / start; a loading hint in the select; on failure fall back to the compact and show a toast | 2026-10-23 |
| D10 | Livelier than the compact (slightly higher top speed and grip), own engine sound (4 cylinders, higher revving), length 4.46 m, own camera points | 2026-10-23 |
| D11 | Repaintable through the existing `PAINTS`, **default red** | 2026-10-23 |
| D12 | Damage like every car: no deformation, damage bar, smoke, wreck at 100 % | 2026-10-23 |
| D13 | Credit string `creditHatchback` (de + en) at the bottom of the F1 / Ctrl+P help, README, CHANGELOG; pinned by `prototype/tests/test_credits.py` | 2026-10-23 |

## Source facts (measured in #236 and #368)

| Fact | Value |
|---|---|
| Original GLB | `2020_mazda_3_hatchback.glb`, 16.7 MB, 149 meshes / 301 nodes, ~473k triangles, 26 materials, 3 JPEG textures; on agent-dev at `~/LocalSend/2020_mazda_3_hatchback.glb` |
| Units / frame | not metres (bbox ±227k × ±125k × ±554k); long axis = z, front = +z; scale to **4.46 m** length |
| Material names | prefix `2020_Mazda_3_Hatchback_`: body panels `Machine_Gray_Metallic` (the game's light renders it near-black, so it is repainted), `RedMain`, `DarkRed`, `Windows` (transmission), `HeadLightsGlass`, `BrakeLightsGlass`, `ChromeTrims`, `BlackChrome`, `Rims1`, `RimBadges`, `Tires`, `BrakeRotors1`, `Lugnuts`, `Mirrors`, `WindowsTrims` … (run the script's `--list` for the full set) |
| Badge meshes | front emblem `Object_118/114/196/224`, rear emblem `Object_298/260`, rear lettering `Object_248/292/252` |
| Style-test result | 21 530 triangles / 19 materials / 491 KB at simplify ratio 0.031, error 0.03; no visible difference from the original beyond 5 m; chrome is the one thing that says „Sketchfab" (`docs/ai-notes/2026-10-22-vehicle-style-test.md`) |
| Pipeline trap | strip `NORMAL`, `TANGENT` and the unused `TEXCOORD_0/1` from every untextured primitive **before** `weld`; with them the simplifier stalls at ~80k triangles |

## The game model (`prototype/assets/hatchback.glb`)

### Budget (hard limits, pinned by a node test that reads the committed file)

| | Limit |
|---|---|
| File size | ≤ 500 KB (`EXT_meshopt_compression`; the game's loader already carries the decoder) |
| Triangles | ≤ 25 000 (target ~21 000) |
| Materials | ≤ 8 (by role, below) |
| Textures | 0 (the tyre and brake-disc maps become plain colours; fewer seams for the simplifier, no VRAM) |
| Extensions | `EXT_meshopt_compression` only; **no** `KHR_materials_transmission`, no `KHR_texture_basisu` |
| Names | no brand in any node / mesh / material name |

### Frame and nodes (the contract between the prep script and the game)

Metres, **+x forward, +y up, +z right** (the compact's frame), wheels on y = 0, origin centred on the car footprint, length 4.46 m.

| Node | Content |
|---|---|
| `hatchback` | scene root (one node, no transform left over) |
| `body` | everything that does not turn: one mesh, one primitive per material |
| `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR` | front/rear, left (−z) / right (+z); **origin at the wheel centre** (translation = the centre, vertices centred on it), one mesh each (tyre + rim + brake disc), axle along z |

Materials (8 roles; the prep script maps every original material onto one of them and **fails loudly on an unmapped name**):

| Role | Look | `extras` |
|---|---|---|
| `Paint` | white base colour so the paint swatch is the colour, metalness 0.25, roughness 0.35, mild gloss; takes the body panels and the rear emblem blank | `{ "paint": true }` (the game's `applyPaint` already tints every material whose `userData.paint` is set) |
| `Glass` | alpha-blended, base `rgb(0.05, 0.07, 0.09)` at alpha ~0.28, roughness 0.05, no transmission | `{ "glass": true }` |
| `Trim` | grey plastic instead of chrome (grille surround, window trims, mirrors, lugnuts, black chrome), metalness 0, roughness 0.6–0.7 | |
| `LampHead` / `LampTail` | opaque lens, emissive (warm white / red) | `{ "lamp": "head" }` / `{ "lamp": "tail" }` |
| `Tyre` | near-black rubber, roughness 0.9 | |
| `Rim` | light grey alloy, metalness 0.6, roughness 0.5; brake discs too | |
| `Interior` | matte near-black (seats, dash, floor, underbody) | |

**Interior shell (decision at review time).** The 21k variant keeps its seats and dash. Through the new glass they may read as
noise or as holes. The prep script has `--interior-shell`: one extra dark mesh (`Interior` material) shrunk 4 cm inside the glass
bounds, replacing the original interior primitives. The reviewer looks at the chase, near and turntable views and picks the
variant; the shell is the fallback, not the default.

### Prep script (`tools/prepare-hatchback.mjs`)

`node prepare-hatchback.mjs <original.glb> <out.glb> [--list] [--interior-shell] [--ratio 0.031] [--error 0.03]`

Dependencies are installed **outside the repo** (no `package.json`, no `node_modules` in the game): `npm i --prefix <scratch>/hbprep
@gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer` and run the script **from that folder** (copy
it there: ESM resolves bare imports relative to the script). Memory-heavy: run under
`systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Steps, in order (a header comment documents them and the node
names above):

1. Neutralise badges (recolour the front emblem to the trim role, drop the rear lettering, rear emblem becomes paint, `RimBadges` texture gone).
2. Units and frame: scale so the length is 4.46 m, rotate +90° about y (model +z becomes +x), centre, wheels on y = 0, bake into the vertices (no residual node transform).
3. Wheels: pick the primitives whose material is tyre / rim / brake / lugnut, cluster them by the sign of x and z of their bounds into four wheels, move each into `wheel_XX` and re-centre its vertices on the wheel centre.
4. Materials: map every original material onto the eight roles; windows → `Glass` (no transmission), lamp glass → opaque emissive.
5. Strip `NORMAL`/`TANGENT`/`TEXCOORD_*` (nothing is textured any more), `dedup` → `flatten` → `join({ keepNamed: true })` (so the wheel nodes stay apart) → `weld({ tolerance: 0.0005 })` → `simplify({ ratio, error, lockBorder: false })` → `prune`. The script re-runs with an adjusted ratio (≤ 6 tries) until the count is 20–24k.
6. Write with `EXT_meshopt_compression`, print triangles, materials, size, the wheel centres and the bounding box.

The game recomputes smooth normals on load, as in the style test.

## Game integration (`prototype/index.html` and two pure modules)

### Pure modules (node-testable)

- `prototype/hatchback.js` — the vehicle table entry `HATCHBACK` (data only) and the wheel-node helpers.
- `prototype/gltfvehicle.js` — the rules every glTF vehicle shares: load state machine, which model is built right now, the URL and its test override, paint on select, lamp role, race-button rule.

```js
// hatchback.js
export const HATCHBACK = { model: 'gltf', gltf: { id: 'hatchback', url: './assets/hatchback.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'swiss',
  wheels: [[1.36, 0.77], [-1.36, 0.77]], wheelR: 0.33, /* drive, mass, engineAt, collision, camera, sound, blinkers: see the table */ };
export const WHEEL_NODES = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];
export function wheelPlan(nodeNames)                 // → [{ name, front, side }] in FL FR RL RR order, side = -1 left / +1 right; throws Error('hatchback: wheel node wheel_RL missing')
export function wheelEntries(centres)                // centres { name: [x, y, z] } → [{ name, front, side, x, z, r }] (r = centre height = wheel radius)
export function tableWheels(entries)                 // → [[x, |z|] front, [x, |z|] rear], the shape of VEHICLES[..].wheels

// gltfvehicle.js
export function loadStep(state, event)               // 'idle' --want--> 'loading' --loaded--> 'ready' | --error--> 'failed'; 'failed' stays failed on 'want' (no retry storm); anything else unchanged
export function buildableId(id, def, state)          // def.gltf && state !== 'ready' ? def.gltf.fallback : id
export function modelUrl(def, search)                // def.gltf.url; `?glb=./assets/<name>.glb` overrides it (test hook), anything else ignored
export function paintOnSelect(def, currentPaint, factoryPaint = 'navy')   // currentPaint === factoryPaint && def.defaultPaint ? def.defaultPaint : currentPaint
export function lampRole(extras)                     // extras?.lamp === 'head' | 'tail' ? that : null
export function raceBlocked(def, state)              // true while a glTF vehicle is 'idle' or 'loading' (the Race! button waits)
```

### Vehicle table entry

`VEHICLES.hatchback = HATCHBACK` (imported). Numbers are starting values, tuned by ear and by a test drive, but the **relations** are pinned
by the node test (livelier than the compact in top speed and grip; heavier; own sound).

| Field | Value | Why |
|---|---|---|
| `model` / `gltf` | `'gltf'`, `{ id, url, fallback: 'compact' }` | `MODELS.gltf` builds it from the cached file; `checkVehicle` accepts it |
| `paint` / `defaultPaint` | `true` / `'swiss'` (red `#e0322d`) | `paintable()` says `true`; red is the first look |
| `wheels` / `wheelR` | `[[1.36, 0.77], [-1.36, 0.77]]` / `0.33` | Mazda 3: wheelbase 2.725 m, track 1.53 m, 225/45 R18; a node test asserts the table matches the file's wheel centres within 3 cm |
| `drive` | `top 64, topNitro 95, accel 17.5, accelNitro 36, brake 25, reverse 8, reverseMax 14, grip 10, gripHandbrake 1.8, steerRate 2.7, airSteer 0.4` | compact: 60 / 90 / 16 / 34 / 24 / 9 / 2.6. Stat bars become 9 / 9 / 9 and mass 4 |
| `mass` | `1.1` | a little heavier than the compact (1.0) |
| `collision` | `{ shape: 'circle', r: 1.25 }` | the compact (4.66 m) uses 1.3; only circles exist (`checkVehicle`) |
| `engineAt` | `[1.4, 1.0, 0]` | wreck smoke, model metres |
| `camera` | chase `6.9 / 2.5`, near `4.6 / 1.8`, cockpit eye `[-0.2, 1.18, -0.37]`, bumper eye `[2.2, 0.5, 0]`, drone `18 / 12` | tuned from the first screenshots; the cockpit and bumper eye hide the body (`car.visible`), so the interior is only ever seen from outside |
| `sound.engine` | 4 cylinders, idle 900, shift 6800, limit 7400, a raspier harmonic mix than the compact, filter open 3000 | „higher revving"; `gears [0, 21, 47, 78, 113, 153, 999]`, horn `[392, 494]`, crash `thump 72, noise 1900` |
| `blinkers` | `[[2.12, 0.62, 0.74], [-2.14, 0.7, 0.74]]` mirrored to ±z | the indicator boxes of the compact, at this body |

### Building the car (`MODELS.gltf`)

`buildGltfVehicle(g, v)` clones the cached scene (`clone(true)`, geometry and materials **shared** with the cache) and:

1. **Wheels.** For each `wheel_XX`: a `steer` group at the wheel centre and a `roll` group inside it; the wheel node moves into `roll` at the origin. Push `{ front, steer, roll, d: null, home, spun: 0 }` onto `g.userData.wheels` — exactly what `buildWheels` produces, so `drawWheels`, `detachWheels` (damage) and the wheel tests work unchanged. Both sides roll about +z (`roll.rotation.z = -spin`), so no mirroring.
2. **Paint.** Materials with `userData.paint` (from the file's `extras`) are tinted by the existing `applyPaint`; nothing else in `applyPaint` changes.
3. **Environment.** Every `MeshStandardMaterial` of the file joins the car-env list (`CAR_ENV_MATS`) so `buildCarEnv` gives it the style's sky map at `St.carEnv` (also after a style switch). The materials are added to `SHARED_CAR_MATS`: `freeCar` must not dispose the cached materials.
4. **Glass.** `transparent`, `depthWrite = false`, the glass meshes drawn after the opaque body (three.js sorts transparent last); each glass mesh gets `userData.glass`.
5. **Lamps.** Materials with `extras.lamp` are collected (`lampRole`); `applyLamps` writes their `emissiveIntensity` from `s.headLevel` / `s.tailLevel`, next to the compact's two lamp materials, so head lights and brake lights work.
6. **Blinkers.** Indicator boxes into `BLINK.left` / `BLINK.right` at `v.blinkers`.
7. `castShadow`, plate, shadow and `measureCar()` are handled by `buildCar` as for the other cars; the shadow decal is baked from the measured box.

### Lazy loading and fallback

```
highlight / start ──> state idle ──want──> loading ──loaded──> ready ──> build the Hatchback, apply paint
                                              └──error──> failed ──> choice falls back to compact + toast
```

- `loadVehicleModel(id)` imports `GLTFLoader` and `MeshoptDecoder` from the import map (as `loadModel` does for the hideout models), loads `modelUrl(def, location.search)`, caches the scene per id, and drives `loadStep`.
- `selectVehicle(id)` for a glTF vehicle that is not `ready`: `CHOICE.id` changes at once (stats, swatches, garage dot), the stage keeps the car that is built, `#csloading` shows „Loading Hatchback …", and the **Race!** button is disabled (`raceBlocked`). When the model arrives and it is still the highlighted one, `setVehicle` + `applyPaint(paintOnSelect(...))` swap it in.
- **Boot** with a stored choice or `?vehicle=hatchback`: the page starts with the fallback car, and swaps when the file arrives as long as the race has not started (the pre-race state, or the car select is open); otherwise the swap waits for the next reset or start. No physics change mid-race.
- **Failure**: `CHOICE.id` goes back to the fallback, `setVehicle(fallback)`, `toast(tr('vehicleLoadFailed', name))`; the stored choice is **not** overwritten, so the next visit tries again; a session retries nothing (`failed` is sticky).
- `setVehicle(def)` for a glTF vehicle that is not `ready` builds the **fallback** def (`buildableId`), never half a model; tests call `await window.__mm.loadVehicle('hatchback')` first.
- Test hook: `?glb=./assets/missing.glb` (allow-listed pattern) makes the load fail; `window.__mm.gltfVehicle()` reports `{ state, tris, materials, wheels, paintColor, lamps }` for the Playwright checks.

### Strings (de + en, `prototype/strings.js`)

`veh_hatchback_name` „Hatchback"; `veh_hatchback_class` „Compact hatchback · Class B" / „Kompaktklasse · Klasse B"; `veh_hatchback_desc`; `carselLoading` („Loading %s …" / „%s wird geladen …"); `vehicleLoadFailed` („The %s could not be loaded — driving the compact instead." / „%s konnte nicht geladen werden — es fährt der Kompakte."); `creditHatchback`:

- en: `3D model „2020 Mazda 3 Hatchback" by OUTPISTON (Sketchfab), CC BY-NC-SA 4.0; simplified, repainted, badges removed`
- de: `3D-Modell „2020 Mazda 3 Hatchback" von OUTPISTON (Sketchfab), CC BY-NC-SA 4.0; vereinfacht, neu lackiert, Embleme entfernt`

(The licence requires the work's title in the attribution; the car itself is called „Hatchback" in the game.)

## Licence and credits

- `prototype/assets/hatchback.LICENSE.md`: title, author, source URL, licence link, the list of **modifications** (units and frame, wheels split into nodes, simplified to ~21k triangles, textures removed, materials merged into eight, chrome replaced by grey plastic, windows made cheap glass, badges and lettering removed, repainted), and the sentence that the modified file stays CC BY-NC-SA 4.0 and the game stays non-commercial.
- README: the existing „2020 Mazda 3 Hatchback" line gets the file path (`prototype/assets/hatchback.glb`, the one deviation from `assets/models/`, as asked) and its licence note.
- CHANGELOG `[Unreleased]` → `Added`, player voice.
- Help (F1 / Ctrl+P): a `<small data-i18n="creditHatchback">` after the Titanic credit.
- `CREDITS.md` is geodata-only today and stays untouched.

## Testing approach

Buildless stack: node unit tests on the pure modules and on the committed file are the real gate; one Playwright file confirms the
car works in the page. Playwright runs **foreground only, after commit and push**, one file at a time, SwiftShader locally; the
screenshots use the GPU browser (`PW_CDP_ENDPOINT`, local sessions only).

- **Node `prototype/tests/hatchback.test.mjs`**: the table entry passes the same shape checks `checkVehicle` makes (collision circle, numeric drive / mass, sound keys), is `paintable` and not `paintable` for a fixed-paint glTF, livelier than the compact (top, grip) and heavier, `statBars` 9 / 9 / 9 / 4; `parseChoice` / `initialChoice` accept `hatchback` and fall back to `compact` for an unknown id; `wheelPlan` / `wheelEntries` / `tableWheels`; `loadStep`, `buildableId`, `modelUrl`, `paintOnSelect`, `lampRole`, `raceBlocked`.
- **Node `prototype/tests/hatchback_asset.test.mjs`** (reads the GLB with plain `fs`, no dependencies): size, triangles, materials, extensions, no brand names, the node contract, the four wheel centres against the table (±3 cm), length 4.46 ± 0.03, the `paint` / `glass` / `lamp` extras, no transmission.
- **Playwright `prototype/tests/test_hatchback.py`** (hand-traced layout, no data files): select the Hatchback in the car select (loading hint, then ready), the Race! button waits while loading, start and drive (wheels turn with speed, only the fronts steer), paint swatch changes the body colour, lights (head / brake) change the lamp emissive, damage to 100 % wrecks it with smoke and the wheels come off, a bad `?glb=` URL gives the fallback and the toast, the triangle / mesh budget and the measured length, the other cars are unaffected.
- **Existing Playwright files** that assumed two vehicles are re-run and updated where the count legitimately changed (`test_carselect.py` first); never loosened.
- **Screenshots** (1920 × 1080 @2x, GPU browser): car select turntable, chase, near, drone, close-up through the glass at 5 m, red and one other paint, night with head lights on, wreck smoke; next to the compact. Used to decide the interior shell and to tune the cameras.

## Acceptance criteria

- [ ] „Hatchback" is the third entry in the car select (de + en name, class, description), with stat bars and a working paint picker; the compact is still the default and unchanged.
- [ ] `prototype/assets/hatchback.glb` is ≤ 500 KB, ≤ 25 000 triangles, ≤ 8 materials, meshopt-compressed, no transmission, no brand in any name, four wheel nodes with their origin at the wheel centre; `tools/prepare-hatchback.mjs` reproduces it from the original (path argument), which is not committed.
- [ ] The windows are see-through glass (transparent, tinted, with the sky sheen); the interior reads acceptably through it, or the dark interior shell is used (decided on screenshots).
- [ ] Driving: wheels spin with speed, the front wheels steer, the car is a little livelier than the compact, has its own 4-cylinder sound; collision, chase / near / cockpit / bumper / drone cameras come from its table entry.
- [ ] Paint: every swatch recolours the body panels; the first look is red; the other cars' paint behaviour is unchanged.
- [ ] Damage, smoke, wreck at 100 %, head lights and brake lights, ground shadow, rear-view mirror and photo mode work with the Hatchback.
- [ ] The model loads lazily (not before it is highlighted or started with); the select shows a loading hint and holds the Race! button; on a failed load the compact is used and a toast says so; the stored choice is kept.
- [ ] Credit string `creditHatchback` (de + en) is at the bottom of the F1 / Ctrl+P help; README, CHANGELOG and `hatchback.LICENSE.md` credit OUTPISTON, the title, the link and CC BY-NC-SA 4.0; `test_credits.py` pins all of it.
- [ ] `node --test prototype/tests/*.test.mjs` green; `test_hatchback.py`, `test_carselect.py`, `test_vehicles.py`, `test_wheels.py`, `test_car_look.py`, `test_credits.py` green; the page loads with an empty console.
- [ ] Screenshots at 1920 × 1080 @2x attached to the PR; CHANGELOG entry in player voice.

## Assumptions

- **A1** [high] The file lives at `prototype/assets/hatchback.glb` (as asked), not under `prototype/assets/models/` like the three hideout models; the credits tests point at the asked path.
- **A2** [med] „Default red": the Hatchback has `defaultPaint: 'swiss'` (`#e0322d`, the existing red). The paint choice is global: selecting the Hatchback while the paint is still the factory navy switches it to red; a paint the player picked is kept. A player who deliberately chose navy and then picks the Hatchback therefore also gets red once.
- **A3** [high] The prep script does the wheel split itself (cluster by material and quadrant); if the cluster does not give exactly four wheels it fails loudly rather than guess.
- **A4** [high] The body panels `Machine_Gray_Metallic` and the rear-emblem blank carry the paint role; `RedMain` / `DarkRed` map to `Paint` or `Trim` by what the first render shows (the script's mapping table is the one place to change it).
- **A5** [med] No texture at all (the 21k test variant kept two 512² maps); if the tyre looks too flat, one 512² tread map is allowed within the 500 KB limit.
- **A6** [high] Blinker boxes, plate and shadow are the compact's mechanisms re-used; no number plate is added to the Hatchback (a plate text is a brand-neutral detail nobody asked for).
- **A7** [med] The cockpit and bumper views hide the body, so the interior is only seen from outside; no cockpit dashboard is built.
- **A8** [high] `modelUrl`'s `?glb=` override is allow-listed to `./assets/<name>.glb` so it cannot load a foreign file.

## Out of scope (do not do)

- Ambient traffic cars (#364, the Quaternius set) and a 5k LOD variant.
- Body deformation, opening doors or a drivable interior; a dashboard in the cockpit view.
- A second GLB car, or turning the compact / DeLorean into glTF.
- Hub card / screenshot regeneration (`freaxnx01.github.io`), release tagging, `version.js`.
- Moving the three hideout models, or changing `loadModel` for the rooms.

## Open questions for the maintainer

None blocking. Two are settled by the screenshots during implementation: the interior shell (D6) and the camera points.
