# Rhy Gullwing real 3D model — Implementation Plan (#831)

**Goal:** `assets/delorean.glb` (JEX-D's DMC-12, CC BY 4.0, unbranded) swaps in over the procedural Rhy Gullwing
the way the mini's model does; doors, steel, lamps and driving values stay. Spec:
`docs/superpowers/specs/2026-11-11-delorean-model-design.md`.

**Global constraints:** buildless; node unit tests via `node --test tests/<file>.test.mjs`; Playwright only the files
named in Task 5, foreground, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Line numbers
are from `4d8d742`; grep, don't trust them. Commit and push before the browser tests.

**Source GLB:** the unmodified original is in the repo at `assets/src/delorean_dmc_12_animated.glb` (CC BY 4.0,
JEX-D, see `assets/src/delorean_dmc_12_animated.LICENSE.md`). Run the prep script on it. Nodes `C`, `D`, `M`, `M.001`
(likely the "DMC" letters) and `DeLorean Body_license plate_0` are branding: remove them, and check with `--list`.

---

### Task 1: `tools/prepare-delorean.mjs` and the asset

**Files:** `tools/prepare-delorean.mjs`, `assets/delorean.glb`, `assets/delorean.LICENSE.md`, `tests/delorean_asset.test.mjs` (all new)

- [ ] **Step 1: Failing asset test** — copy `tests/hatchback_asset.test.mjs` (its `readGlb`, `triangles`,
  `nodeByName` helpers), point `FILE`/`LICENSE` at `assets/delorean.glb` / `assets/delorean.LICENSE.md`, and pin:

```js
test('deloreanGlb_Committed_WithinTheBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-delorean.mjs and copy the result to assets/delorean.glb');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 500 * 1024, `size ${statSync(FILE).size}`);
  assert.ok(triangles(j) >= 8000 && triangles(j) <= 12000, `triangles ${triangles(j)}`);
  assert.ok(j.materials.length <= 8, `materials ${j.materials.length}`);
  assert.ok(!j.textures?.length && !j.animations?.length, 'no textures, no animations');
  assert.deepEqual(j.extensionsUsed, ['EXT_meshopt_compression']);
});
test('deloreanGlb_Nodes_RootBodyFourWheelsTwoDoors', () => {
  const j = readGlb(FILE);
  for (const n of ['gullwing', 'body', 'wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'door_L', 'door_R']) assert.ok(nodeByName(j, n), n);
  const [l, r] = [nodeByName(j, 'door_L'), nodeByName(j, 'door_R')];
  assert.ok(!l.rotation && !r.rotation && l.translation[1] > 1.0 && Math.abs(l.translation[2]) < 0.3, 'door origin on the roof spine');
  assert.ok(Math.abs(l.translation[2] + r.translation[2]) < 1e-3, 'doors mirrored');
});
test('deloreanGlb_Materials_ByRoleWithLampsGlassAndNoPaint', () => {
  const mats = readGlb(FILE).materials, m = (n) => mats.find(x => x.name === n);
  for (const n of ['Steel', 'Glass', 'LampHead', 'LampTail']) assert.ok(m(n), n);
  assert.deepEqual(m('Glass').extras, { glass: true }); assert.equal(m('LampHead').extras.lamp, 'head'); assert.equal(m('LampTail').extras.lamp, 'tail');
  assert.ok(!mats.some(x => x.extras?.paint), 'no paint material');
});
test('deloreanGlb_Names_CarryNoBrand', () => {
  const j = readGlb(FILE), names = [...j.nodes, ...j.meshes, ...j.materials].map(x => x.name ?? '').join(' ');
  assert.ok(!/delorean|dmc|plate|license/i.test(names), names);
  assert.ok(existsSync(LICENSE));
});
```

- [ ] **Step 2:** `node --test tests/delorean_asset.test.mjs` → FAIL (no file).
- [ ] **Step 3: Write `tools/prepare-delorean.mjs`** from `tools/prepare-knight.mjs` (header, usage, helpers):
  1. `--list` probe first: every node/mesh/material with triangle counts, the animation names. Delete
     `license_plate`, any mesh named `logo|badge|text|letter|emblem|dmc`, any mesh under 50 triangles on the nose,
     tail or dashboard (lettering). Record the drops in the header and `LICENSE.md`.
  2. Frame: bake transforms; split the two wheel nodes (`/wheels/i`) by the sign of x and z into four
     (`prepare-tumbler.mjs` splits by side); scale to `WHEELBASE_M = 2.41`; +x forward, +y up, +z right, tyres on
     y = 0, origin on the axle midpoint. Print l/w/h; if the length is outside 4.22–4.32 m, scale by `LENGTH_M = 4.27`
     and say so in the header.
  3. Doors: `door` / `door.001` → `door_L` (z < 0) / `door_R`. Hinge = `[(min.x+max.x)/2, max.y, side * min|z|]` of
     the door's vertices; subtract it, set it as the node translation, no rotation. Dispose every animation, `prune()`.
  4. `MATERIAL_ROLES` keyed by the 16 original names: `Steel` (base `[0.49, 0.51, 0.53]`, metal 0.9, rough 0.42),
     `Dark`, `Glass` (`extras.glass`, BLEND, alpha 0.35), `LampHead` / `LampTail` (the knight's factors, `extras.lamp`),
     `Rubber`, `Rim`, `Interior`. An unplaced name throws. No `Paint`, no `extras.paint`.
  5. Scene `gullwing` → `body`, four `wheel_*`, `door_L`, `door_R`; `dedup`, `prune`, `joinByMaterial`, `weld`,
     crease normals, `EXT_meshopt_compression`. Print wheel centres and radius, door hinges, counts.
- [ ] **Step 4:** run it under the memory cap from a scratch folder with the npm packages; copy the output to
  `assets/delorean.glb`; write `assets/delorean.LICENSE.md` like `assets/knight.LICENSE.md` (title, author JEX-D,
  https://sketchfab.com/JEX-D, source URL, CC BY 4.0, in-game name "Rhy Gullwing", the modifications).
- [ ] **Step 5:** `node --test tests/delorean_asset.test.mjs` → PASS. **Commit**
  `feat(vehicles): the Rhy Gullwing's 3D model and its prep script (#831)`.

### Task 2: `doorPanelOffset` (delorean.js)

**Files:** `delorean.js`, `tests/delorean.test.mjs`

- [ ] **Step 1: Failing test** (append; add `doorPanelOffset` to the import):

```js
test('doorPanelOffset: the lowest outer corner of a door box, by side (#831)', () => {
  const box = { min: { x: -0.7, y: -0.62, z: 0.02 }, max: { x: 0.8, y: 0.0, z: 0.95 } };
  assert.deepEqual(doorPanelOffset(box, 1), [0.05, -0.62, 0.95]);
  assert.deepEqual(doorPanelOffset({ min: { x: -0.7, y: -0.62, z: -0.95 }, max: { x: 0.8, y: 0, z: -0.02 } }, -1), [0.05, -0.62, -0.95]);
});
```

- [ ] **Step 2:** `node --test tests/delorean.test.mjs` → FAIL. **Step 3: Implement** below `stepDoor`:

```js
// #831: the model's door nodes sit on the hinge, so their own position never moves; __mm.doors watches a marker at the
// door's lowest outer corner instead. box = the node-local bounds { min, max }, side -1 left (-z) / +1 right
export function doorPanelOffset(box, side) { return [(box.min.x + box.max.x) / 2, box.min.y, side > 0 ? box.max.z : box.min.z]; }
```

- [ ] **Step 4:** PASS. **Commit** `feat(vehicles): door panel marker for a glTF gull-wing door (#831)`.

### Task 3: Wire the model into the game (index.html)

- [ ] **Step 1:** add `doorPanelOffset` to the `./delorean.js` import (~891).
- [ ] **Step 2:** `VEHICLES.delorean` (~2947): `gltf: null` → `gltf: { id: 'delorean', url: './assets/delorean.glb', fallback: 'delorean' }`;
  add `blinkers: [[2.02, 0.5, 0.8], [-2.06, 0.5, 0.8]],` on its own line after the first, and above the entry the
  comment `// #831: the real model (assets/delorean.glb) is built by buildDelorean once loaded; until then the primitives (fallback: itself)`
  like the mini's (~2960). Keep `model: 'delorean'`, `paint: false`, wheels, drive, sound, camera.
- [ ] **Step 3:** first line of `buildDelorean` (~3082):
  `if (gltfState('delorean') === 'ready') { buildGltfVehicle(g, v); dressGullwing(g); return; }`
- [ ] **Step 4:** add after `buildDelorean`:

```js
// #831: the model in the game's brushed steel (the shared, restyled, never-disposed material), and its two door nodes on the
// hinge wired into the same { side, hinge, panel } drawDoors and __mm.doors read for the primitives car
function dressGullwing(g) {
  g.traverse(o => { if (o.isMesh && o.material?.name === 'Steel') o.material = carMats.steel; });
  for (const [name, side] of [['door_L', -1], ['door_R', 1]]) {
    const hinge = g.getObjectByName(name); if (!hinge) throw new Error(`delorean: door node ${name} missing`);
    const box = new THREE.Box3(); hinge.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });   // node-local: no transform below the door node
    const panel = new THREE.Object3D(); panel.position.fromArray(doorPanelOffset(box, side)); hinge.add(panel);
    g.userData.doors.push({ side, hinge, panel });
  }
}
```

  `g.userData.doors` is the fresh `[]` from `buildCar` (~3280). Not `Box3.setFromObject`: that is world space, and
  the car group is already placed and turned.
- [ ] **Step 5:** `node --test tests/` → PASS. **Commit** `feat(vehicles): the Rhy Gullwing builds its 3D model once loaded (#831)`.

### Task 4: Credits and texts

**Files:** `strings.js`, `index.html`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1:** `strings.js` after `creditKnight` in both tables: EN
  `creditDelorean: '3D model „DeLorean DMC 12 (Animated)" by JEX-D (Sketchfab), CC BY 4.0; rescaled, plain materials in the game's brushed steel, number plate and lettering removed, the doors and wheels in their own nodes'`;
  DE `creditDelorean: '3D-Modell „DeLorean DMC 12 (Animated)" von JEX-D (Sketchfab), CC BY 4.0; neu skaliert, schlichte Materialien im gebürsteten Stahl des Spiels, Nummernschild und Schriftzüge entfernt, Türen und Räder als eigene Knoten'`.
- [ ] **Step 2:** `index.html` ~697: `<small data-i18n="creditDelorean"></small>` after `creditEstate`.
- [ ] **Step 3:** `README.md` third-party models list (after the Blaze line, ~125), in the Knight line's shape:
  title, Sketchfab link, JEX-D, CC BY 4.0; "rescaled to the real 2.41 m wheelbase, new plain materials (the body in
  the game's brushed steel), the number plate and lettering removed, the gull-wing doors and the wheels in their own
  nodes, in the game as the **Rhy Gullwing** car (`assets/delorean.glb`, see `assets/delorean.LICENSE.md`)".
- [ ] **Step 4:** `CHANGELOG.md` `[Unreleased]` → `### Changed` (create if absent), newest first, `TZ=Europe/Zurich date '+%F %H:%M'`:
  `` - `<ts>` The **Rhy Gullwing** now looks like the real thing: a detailed **3D model** in brushed steel with the proper wedge nose, louvres and door handles. The **gull-wing doors** still swing up on the start screen, the lamps still follow <kbd>L</kbd>. ``
- [ ] **Step 5:** `node --test tests/strings.test.mjs tests/about.test.mjs` → PASS. **Commit**
  `docs(vehicles): credit JEX-D for the Rhy Gullwing model (#831)`.

### Task 5: Browser tests

**Files:** `tests/test_delorean_model.py` (new)

- [ ] **Step 1:** copy `tests/test_mini_model.py`, `load_delorean` with `'delorean'`, four tests:
  - `..._builds_true_to_size_with_lamps_and_doors`: `state == 'ready'`, `triangles <= 15000`, `len(materials) <= 8`,
    `"Paint" not in materials`, `l 4.27 ± 0.05`, `h 1.14 ± 0.05`, `w 2.0 ± 0.08`, `wheels == 4`, two front / two
    rear in `wheelYaw()`, `lamps.head == 1`, `lamps.tail == 1`, `len(__mm.doors().panelY) == 2`.
  - `..._doors_open_on_the_start_screen_and_close_for_the_run`: wait `__mm.doors().open > 0.95`, read `panelY`;
    click `#startbtn`, wait `< 0.05`, read again; each up > down + 0.3 (`test_vehicles.py:345-358` on the model).
  - `..._swaps_in_from_the_url`: `query="?vehicle=delorean"`, wait `gltfVehicle('delorean').state === 'ready' && .wheels === 4`,
    then `vehicle().model == 'delorean'`, `carSize().l ≈ 4.27`.
  - `..._lamps_follow_the_lights`: as the mini's.
- [ ] **Step 2: Run**, one file at a time, foreground: `test_delorean_model.py test_vehicles.py test_car_look.py
  test_lights.py test_shadow.py test_wheels.py test_about.py`. Change a tolerance only with the measured reason in the assert.
- [ ] **Step 3:** `node --test tests/` → PASS. **Commit** `test(vehicles): the Rhy Gullwing's 3D model (#831)`.

### Manual check

- [ ] Choose car → Rhy Gullwing: the primitives car stays until the model arrives, then the model; doors swing up;
  Race closes them; L lights the lamps; no paint swatch touches the steel; console clean.
