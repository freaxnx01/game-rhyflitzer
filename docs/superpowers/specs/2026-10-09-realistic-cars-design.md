# Realistic cars, slice 1: the compact gets a real body, real paint and real wheels (#164)

**Issue:** feat(vehicles): much more realistic car models and materials.
**Mode:** quick enrich, no clarifying questions. Related: #163 (soft contact shadow, measures the car with `CAR_SIZE` at build time), #7 (car-select screen: turntable close-up, paint swatches on `carMats.body.color`), #6 (tractor and bus: the glTF path), #126 (DeLorean look-alike), #2 (night: lamps that light), #69 (true to size), #132 (steering wheels).

## Today

`prototype/index.html` (line numbers from `main` at `579ad3e`):

- `:1148` `carMats`: six shared materials — `body` Phong navy (shininess 70), `steel` Phong with the `STEEL_GRAIN` brush texture, `glass` Phong near-black (#123/#133: dark, opaque, shared with the helicopter), `dark` Lambert, `rim` Phong, `tyre` Lambert. The comment says why: *"Phong: no env map for MeshStandardMaterial metalness"*. `applyStyle()` (`:1228`) flips `flatShading` on `body` and `steel` for the `smooth` style.
- `:1154` `buildCompact`: one `ExtrudeGeometry` of a 16-point side profile (`bodyS`, depth 1.66 m, bevel 0.07 m) — a slab with the same cross-section from sill to roof, so the roof is as wide as the sills; a second extrude for the cabin glass; a `sill` box; four `MeshBasicMaterial` boxes for the lamps (flat colour, no shading); two mirror boxes; a grille box; the plate. The car measures 4.66 × 2.18 × 1.55 m (`test_vehicles.py::test_compact_car_is_true_to_size`, ±0.02).
- `:1150` `buildWheels` (shared by every procedural car): per wheel a 16-segment cylinder tyre, a 10-segment cylinder rim, a hub cylinder, under the #132 groups `steer > roll`. No spokes, no sidewall, no wheel arch — the wheels sink into the slab.
- `:1085-1090` lighting: one `HemisphereLight`, one `DirectionalLight` (the sun), a gradient sky dome (`skyMat`, a shader), a sun sprite. **No environment map anywhere**, so metalness and clearcoat have nothing to reflect, which is why every material is Phong/Lambert.
- `:1063` renderer: `SRGBColorSpace`; `original` style `NoToneMapping`, `smooth` style `ACESFilmic` (`:1222-1224`).
- `:1199-1201` `CAR_SIZE = measureCar()` after every build; `freeCar()` disposes per-build geometries and any material not in `SHARED_CAR_MATS`. `test_vehicles.py::test_rebuilds_free_gpu_memory` keeps the texture and geometry counts flat over rebuilds.
- `VEHICLES.compact.gltf: null` (`:1120`) and `checkVehicle` (`:1203`) *"glTF loading is not implemented yet"* — #6's spec (`2026-10-03-tractor-and-bus-design.md`) designs that path for the tractor and the bus with the Kenney Car Kit (CC0).
- Draw calls for the compact today: body, glass, sill, grille, plate, 4 lamps, 2 mirrors, 12 wheel parts = 23 visible meshes (blinkers and nitro flames are hidden groups).

## Goal

The compact reads as a real hatchback from the chase camera and up close on #7's turntable: a body with a narrower roof than its sills (tumblehome) and rounded shoulders, visible panel lines (doors, bonnet, boot), dark wheel arches the wheels sit in, bumpers, glossy clearcoat paint that reflects the sky and the horizon, dark reflective glass, chrome-like rims with spokes, rounded black tyres, lamps that glint like glass and glow a little — in both graphic styles, buildless, with a fixed frame budget. The DeLorean inherits the materials (its geometry is a later slice).

## Approaches considered

1. **Keep the procedural builders, upgrade them** (chosen). A pure loft module for the body, a baked panel-line texture, a lathe profile for tyre and rim, physically based materials lit by a small environment map generated from the game's own sky. Everything is code in the repo: no licence, no logo, no file size, works in both styles, #7's paint swatches keep recolouring `carMats.body.color`, #163's `CAR_SIZE` measurement keeps working, the DeLorean look-alike (decided 2026-10-08, `docs/07-brands-and-permissions.md`) stays a look-alike. Reversible: any part can be swapped later for a glTF without touching the rest.
2. **Switch to glTF models.** The repo's own precedent is #6: Kenney Car Kit (CC0) for the tractor and bus. But that kit is *low-poly stylised* — less realistic than the issue asks, not more. Realistic free car models are a one-way door: licences on Sketchfab/Poly Pizza are mostly CC-BY with real brands' shapes and badges (a trademark question `07-brands-and-permissions.md` deliberately avoids), files run 2-20 MB per car (GitHub Pages, phones), and the DeLorean would need its own licensed look-alike. Any model choice would need the owner's decision and cannot be made in a quick enrich. Rejected for this issue; the glTF *path* still arrives with #6.
3. **Hybrid now** (glTF for some, procedural for others). Adds #6's async loader to this issue's scope with none of its benefit for the compact. Rejected; #6 does it on its own.

## Design

### 1. An environment map for the car, generated from the sky (`index.html`)

- `carEnv`: a `THREE.PMREMGenerator(renderer)` runs once per style over a tiny private scene (`envScene`): a `SphereGeometry(50, 32, 16)` `BackSide` mesh with a `ShaderMaterial` that draws the style's sky gradient (`St.sky[0]` top, `St.sky[1]` horizon) over a darker ground half (`#5a5648` fading to `#3a3630` straight down) and a soft sun blob (the sun's direction, `sun.position` normalised, a `smoothstep` disc at ~4°, warm white). `pmrem.fromScene(envScene, 0.04).texture` is kept as `CAR_ENV.tex`.
- Only the car's materials get it: `mat.envMap = CAR_ENV.tex` for every entry in `carMats` that is a `MeshStandardMaterial`/`MeshPhysicalMaterial`. **Not** `scene.environment` — in the `smooth` style the whole world is `MeshStandardMaterial` (`:1225`) and must not change its look.
- `applyStyle()` regenerates it (the sky colours differ per style) and disposes the previous texture first; `STYLES[k].carEnv = { intensity }` sets `envMapIntensity` on the car materials: `original` 0.7 (NoToneMapping: reflections must not clip), `smooth` 1.0 (ACES handles the highlights).
- Cost: one PMREM pass per style switch (a few ms), one 256 px cubemap-equivalent texture resident; zero per-frame cost beyond the materials' own shading.

### 2. Materials (`carMats`, same keys as today)

| key | material | why |
|---|---|---|
| `body` | `MeshPhysicalMaterial({ color: 0x1b2d5e, metalness: 0.0, roughness: 0.38, clearcoat: 1.0, clearcoatRoughness: 0.06, map: BODY_LINES, envMapIntensity })` | Clearcoat gives car paint its two-layer look: a coloured, slightly rough base under a mirror-sharp coat. `color` stays the paint (#7's swatches set `carMats.body.color`, nothing else). `map` is the panel-line texture (§3): white with dark lines, multiplied with `color`, so every paint keeps its seams. |
| `steel` | `MeshStandardMaterial({ color: 0xb4b9be, metalness: 0.9, roughness: 0.42, map: STEEL_GRAIN, envMapIntensity })` | The DeLorean's brushed stainless, now actually metallic. Geometry untouched in this slice. |
| `glass` | `MeshPhysicalMaterial({ color: 0x0b0f14, metalness: 0.0, roughness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.0, envMapIntensity })` | Still dark and opaque (#123/#133, shared with the helicopter) but it reflects the sky, which is what makes dark glass read as glass. |
| `dark` | `MeshStandardMaterial({ color: 0x14171d, roughness: 0.75, metalness: 0.0 })` | Matte black trim, wheel wells, grille, bumpers. |
| `rim` | `MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1.0, roughness: 0.22, envMapIntensity })` | Polished alloy. |
| `tyre` | `MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.92, metalness: 0.0 })` | Rubber. |
| `lampHead` *(new)* | `MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0xfff6d0, emissiveIntensity: 0.35, metalness: 0.0, roughness: 0.12, envMapIntensity })` | A glossy lens that glints and glows faintly. #2 (night) can raise `emissiveIntensity` and attach a real light. |
| `lampTail` *(new)* | `MeshStandardMaterial({ color: 0xa01810, emissive: 0xe0322d, emissiveIntensity: 0.45, metalness: 0.0, roughness: 0.15, envMapIntensity })` | Red lens, same idea. |

All eight stay in `SHARED_CAR_MATS` (never disposed per build). `applyStyle()`'s `flatShading` flip on `body` and `steel` stays as it is (the `smooth` style's faceted look is deliberate, `docs/01-concept.md`). The blinker boxes and nitro flames keep their `MeshBasicMaterial` (they are indicators, not surfaces).

### 3. The compact's body: a loft, not a slab (`prototype/carbody.js`, pure)

A new pure module (no three.js, no DOM; `node --test`), same shape as `delorean.js`:

- `COMPACT = { stations: [...] }` — the side profile as ten **x stations**, each `{ x, floor, belt, roof, wSill, wBelt, wRoof, span }` in model metres (x forward, y up): the floor line, the belt line (the shoulder where the glass starts), the roof line, the half-widths at sill, belt and roof height (`wRoof < wBelt ≤ wSill`: the tumblehome), and `span: { top, side }` saying whether the stretch to the next station is glass on top (windscreen, rear window) and on the side (door glass). The stations reproduce today's silhouette (`bodyS`, `:1156`): bumper-to-bumper `x ∈ [-2.33, 2.33]`, roof 1.55 at `x ∈ [-0.9, 0.15]`, bonnet falling to 1.00 at `x = 2.0`. `wSill` = 0.90 (the body stays 1.80 wide plus the mirrors = 2.18), `wBelt` 0.87, `wRoof` 0.66 in the cabin, pinched to the nose and tail.
- `FILLET = { floor: 0.08, shoulder: 0.06, roof: 0.10, n: 4 }` and `fillet(a, b, c, r, n)`: a tangent arc replacing corner `b` (the tangent length clamped to 45 % of the shorter leg, so short legs never fold).
- `crossSection(station)` → `{ pts, band }`: the right half (`z ≥ 0`) of the station's ring, `2 + 3 (n + 1)` points `[y, z]` from the floor centre up the side to the roof centre — floor corner fillet, the side, shoulder fillet, **one straight glass band segment** (index `band`), roof corner fillet. Same point count at every station, so the rings loft as quad strips.
- `loftBody(def)` → `{ positions, uvs, bodyIndices, glassIndices, v }` plain arrays: each ring is the right half plus its mirror (the first point repeated last, the uv seam), rings connected as quads, a fan cap at the nose and the tail. A quad is in `glassIndices` when it is the band segment of a span with `side` or a top segment of a span with `top`; everything else is paint. So **the glass is part of the hull**: the builder makes one `BufferGeometry` with two groups (`[carMats.body, carMats.glass]`), `computeVertexNormals()` for smooth shading, and the old separate glass extrude goes. `uv.u = (x - xMin) / length`, `uv.v = ring index / ringCount` (0 at the floor on the right, ~0.47 at the roof, 1 back at the floor on the left); `v = { sill, belt, roof }` are the right side's marker fractions the body texture draws against.
- `bodyBox(def)` → `{ l, w, h, minY }` of the loft alone: `4.66 × 1.80 × 1.25` on `y = 0.30`; with the tyres (bottom at 0) and the mirrors the browser measurement stays `4.66 × 2.18 × 1.55 ± 0.02` (the existing test, unchanged). Probe run of the plan's code: 332 vertices, 640 triangles.
- `WHEEL_PROFILE(wheelR, width)` → `{ points, tyreCount }`: `[r, y]` lathe points for one wheel, from the inner face to the outer: tyre tread with rounded shoulders (`r = wheelR` over the middle 70 % of the width), sidewall down to the rim lip at `0.66 wheelR`, then the rim dish in to the hub boss at `0.22 wheelR` and the axis. `LatheGeometry(points, 24)` makes tyre+rim in one piece; the first `tyreCount` points are rubber, the rest alloy, split by index groups.
- `SPOKES = 5`, `spokeBars(wheelR)` → five `{ angle, r0, r1, width, thick }` bars from the hub boss to the rim lip (five boxes merged into one geometry per wheel; the openings between them show the `dark` dish behind).
- `ARCH = { lip: 0.04, gap: 0.09 }`, `archRadius(wheelR)` = `wheelR + gap`.

### 4. The compact's builder (`buildCompact`, `index.html`)

Per build (all geometries per build, disposed by `freeCar`):

1. **Hull**: the loft (§3) as one mesh with two material groups, `[carMats.body, carMats.glass]`; `userData.glass = 1` (the glass group's index) so `window.__mm.glass()` keeps finding the dark glass (the hook reads `material[userData.glass]` when the material is an array; the DeLorean's and the helicopter's `true` still resolve to their single material). The separate glass extrude and the `sill` box go.
2. **Wheel wells**: at each of the four `v.wheels` positions a `dark` upper-half `CircleGeometry(archRadius, 20, 0, π)` on the body side at `z = ±0.91` (turned by `rotation.y = π` on the left so its face points outward), and a `dark` half-`TorusGeometry(archRadius, ARCH.lip, 6, 14, π)` as the arch lip. The wheels stand in a black opening instead of sinking into paint. 8 meshes.
3. **Wheels** (`buildWheels`, shared): per wheel the lathe (two material groups: `tyre`, `rim`), the five merged spokes (`rim`), a `dark` dish disc behind the spokes. 3 meshes per wheel, 12 in all, under the unchanged `steer > roll` groups (`#132`; `g.userData.wheels` entries keep `{ front, steer, roll }`); `rotation.x = ±π/2` per side so the dished outer face points away from the car. The DeLorean gets these wheels too.
4. **Bumpers**: two `dark` capsules lying across the car under the nose and the tail: `x = ±2.30`, `y = 0.42`, 1.5 m wide, 0.14 high. 2 meshes.
5. **Lamps**: headlights as `lampHead` capsules lying along z at `x = 2.25, y = 0.76, z = ±0.55`; tail lamps as `lampTail` boxes `0.06 × 0.2 × 0.4` at `x = -2.31, y = 0.90, z = ±0.52`. 4 meshes. The blinker boxes stay where they are.
6. **Mirrors, grille, plate**: as today (the mirrors in `carMats.body`, with a small `dark` stalk each: +2 meshes).

Visible meshes: 1 + 8 + 12 + 2 + 4 + 6 = 33; the budget (§6) is 48.

### 5. The body texture (`BODY_LINES`, `index.html`, module level, shared)

`makeTex(1024, 512, draw)` with `draw` painting white, then in `rgba(0,0,0,0.55)` 2 px lines in the loft's uv space (u along the length, v around the ring, right side 0 → 0.5, left side 0.5 → 1): the front door shut line and the rear door shut line (vertical in u at the stations' x, from the sill to the belt), the bonnet seam (a line across the top at the windscreen base) and the boot seam, a short door handle dash per door at belt height, and a 4 px darker band along the sill (`rgba(0,0,0,0.25)`). Mirrored for the left half by drawing the same lines at `1 - v`. One texture, never disposed (it is created once like `STEEL_GRAIN`, `:1147`), `anisotropy` from the renderer so the lines stay crisp at an angle.

### 6. Frame budget, hooks and the state/render split

- New read-only hook `window.__mm.carStats()` → `{ meshes, triangles }`: traverses `car`, counts visible meshes (an `Object3D` with `isMesh` whose ancestors are all visible, so the hidden blinker and flame groups do not count) and sums `index ? index.count / 3 : position.count / 3`.
- Budget, asserted by a test: compact `meshes ≤ 48`, `triangles ≤ 30 000`. Expected: loft 640 tris (probe run), lathe 9 × 24 × 2 = 432 per wheel, everything else small — around 3 500 in all.
- `window.__mm.carMats()` → `{ <key>: { type, hasEnv, color, clearcoat, metalness, roughness, envMapIntensity } }` (read-only, `color` as `#rrggbb`).
- `physMs` is untouched: nothing here runs in `stepCar`. The build runs once per `setVehicle` and once per style switch (materials only, no rebuild).
- GPU accounting: `freeCar()` already disposes per-build geometries; the merged spoke geometry and the lathe are per build too. `BODY_LINES` and `CAR_ENV.tex` are shared; `applyStyle` disposes the old env texture before generating the next. `test_rebuilds_free_gpu_memory` stays green; a new test toggles the style three times and asserts `gpu().textures` returns to its first value.

### 7. Look

Chase camera, `original` style: a navy hatchback whose roof is visibly narrower than its sills, with soft reflections of the sky on the bonnet and roof, dark shut lines marking two doors, a black grille and bumpers, black wheel openings with five-spoke polished rims rolling in them, cream headlights that catch the light. `smooth` style: the same car with the deliberate flat facets on the paint, stronger reflections under ACES. On #7's turntable the shoulder line and the clearcoat highlight travel around the car as it turns. The DeLorean: same wheels, a body that now really is stainless steel, same lamps as before (its geometry is slice 2).

## Acceptance criteria

- [ ] `prototype/carbody.js` exists, pure (no `THREE`, no `document`), with `node --test prototype/tests/carbody.test.mjs` green: `loftBody` watertight and symmetric with a non-empty glass group, `bodyBox` = `4.66 × 1.80 × 1.25 ± 0.02` on `y = 0.30`, `crossSection` with the same point count at every station and `wRoof < wBelt ≤ wSill`, `WHEEL_PROFILE` radii within `[0, R]` with the rim lip at `0.66 R` and `tyreCount` splitting the run, `spokeBars` five entries 72° apart.
- [ ] `test_vehicles.py::test_compact_car_is_true_to_size` passes unchanged (4.66 × 2.18 × 1.55 ± 0.02).
- [ ] `window.__mm.carStats()` for the compact: `meshes ≤ 48`, `triangles ≤ 30000`; for the DeLorean `meshes ≤ 56` (its own parts + the new wheels).
- [ ] `window.__mm.carMats().body` is `MeshPhysicalMaterial` with `clearcoat === 1`, `hasEnv === true`, `color === '#1b2d5e'`; `glass` has `hasEnv`; `rim.metalness === 1`; `lampHead` and `lampTail` exist with `emissiveIntensity > 0`.
- [ ] After `setStyle('smooth')` → `setStyle('original')` → `setStyle('smooth')` the car materials still have `hasEnv === true` and `gpu().textures` equals the count after the first switch (the previous env texture is disposed).
- [ ] `test_vehicles.py::test_rebuilds_free_gpu_memory` and every test in `test_wheels.py` pass unchanged (the `steer > roll` groups and `g.userData.wheels` keep their shape).
- [ ] Both styles render the car with no console error or warning (`test_smoke.py` page-error check).
- [ ] The PR description carries two chase-camera screenshots of the compact (`original` and `smooth`), taken with the game's own **X** photo or Playwright `page.screenshot`, so the reviewer sees the result without running it.
- [ ] `CHANGELOG.md` `[Unreleased]` → `Changed`: one player-facing English entry.
- [ ] No new file under `prototype/` except `carbody.js` and its test; nothing downloaded, no model file, no new dependency, no import beyond `three` and the existing addons.

## Tests

- Node (`prototype/tests/carbody.test.mjs`): the geometry facts above.
- Browser (`prototype/tests/test_car_look.py`, hand layout, frame-light — one page, `wait_frames(page, 2)` after each change, under the memory cap): `carStats` budget for both vehicles; `carMats` facts; the style round trip and `gpu().textures`; `carSize` unchanged on the DeLorean too (`4.27` long, `delorean.test.mjs` numbers) because the new wheels must not poke out.
- Existing, run as the affected subset: `test_vehicles.py`, `test_wheels.py`, `test_smoke.py -k "error or style"`.

## Out of scope (later slices of #164 or other issues)

- The DeLorean's body loft, its lamp lenses and its louvres in the new materials (slice 2: same modules, a `DELOREAN` station table in `carbody.js`).
- Interior (seats, dashboard) visible through the glass — the glass stays opaque (#123).
- Real light sources from the lamps, light cones on the road: #2.
- Deformation on crashes, dirt, scratches.
- A glTF path: #6.
- Brake lights that brighten under braking (trivial once `lampTail.emissiveIntensity` exists; one line in `drawWheels`-style draw code — left for a follow-up with #2).
