# Manneken Pis in the Atomium room — Implementation Plan (#585)

**Goal:** the life-size Manneken Pis (0.61 m) in its stone fountain corner beside the fries figure in star room 1,
with an animated water jet. Spec: `docs/superpowers/specs/2026-11-17-manneken-pis-design.md` (all numbers there).

**Global constraints:** buildless; node tests `node --test tests/<file>.test.mjs`; Playwright only the one new test
in Task 4, foreground, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`. Grep, don't trust
line numbers. Commit and push before the browser test. Follow the fries figure (#451: `fries.js`, `friesmesh.js`,
`tests/fries.test.mjs`, `roomFigure` in `index.html`) file for file.

**Precondition:** `assets/src/manneken_pis.glb` + `assets/src/manneken_pis.LICENSE.md` are on main. If missing,
stop and say so — do not download.

---

### Task 1: `tools/prepare-manneken.mjs` and the asset

**Files:** `tools/prepare-manneken.mjs`, `assets/models/manneken_pis.glb`, `assets/models/manneken_pis.LICENSE.md`,
`tests/manneken_asset.test.mjs` (all new)

- [ ] **Step 1: Failing test** — copy `readGlb` / `triangles` from `tests/delorean_asset.test.mjs`:

```js
const FILE = new URL('../assets/models/manneken_pis.glb', import.meta.url);
const LICENSE = new URL('../assets/models/manneken_pis.LICENSE.md', import.meta.url);
test('mannekenGlb_Committed_WithinTheBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-manneken.mjs');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 600 * 1024, `size ${statSync(FILE).size}`);
  assert.ok(triangles(j) >= 14000 && triangles(j) <= 22000, `triangles ${triangles(j)}`);
  assert.equal(j.meshes.length, 1); assert.ok(!j.textures?.length && !j.animations?.length);
  assert.deepEqual(j.extensionsUsed, ['EXT_meshopt_compression']);
});
test('mannekenGlb_LifeSize_FeetOnTheOrigin', () => {
  const j = readGlb(FILE), a = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
  assert.ok(Math.abs(a.min[1]) < 0.002 && Math.abs(a.max[1] - 0.61) < 0.005, `height ${a.max[1] - a.min[1]}`);
  assert.ok(Math.abs(a.min[0] + a.max[0]) < 0.03 && Math.abs(a.min[2] + a.max[2]) < 0.03, 'centred');
});
test('mannekenGlb_OneBronzeMaterial_LicenceCredited', () => {
  const j = readGlb(FILE), m = j.materials;
  assert.equal(m.length, 1); assert.equal(m[0].name, 'Bronze');
  assert.equal(m[0].pbrMetallicRoughness.metallicFactor, 0.6); assert.equal(m[0].pbrMetallicRoughness.roughnessFactor, 0.45);
  assert.match(readFileSync(LICENSE, 'utf8'), /RascalFR[\s\S]*CC BY 4\.0/);
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** write the script from `tools/prepare-delorean.mjs` (header, usage block, `--list` probe):
  bake the root matrix (Z up → Y up), join the 8 meshes into one, `weld`, simplify (meshoptimizer) to aim 18000,
  scale so the height is 0.61 m, translate the base bottom to y = 0 and the bounds' centre to x = z = 0, face
  +z (verify on the probe: the figure faces Sketchfab's default camera; if the face is on −z, turn 180°), one
  material `Bronze` (`#5b4a2e`, metallic 0.6, roughness 0.45), smooth normals, `EXT_meshopt_compression`.
  Print the jet start: the vertex with the largest z among those within 0.04 m of x = 0 at 36–46 % of the height.
- [ ] **Step 4:** run it under the memory cap from a scratch folder with the npm packages; copy the output; write
  the LICENSE.md like `assets/src/manneken_pis.LICENSE.md` plus the modifications (simplified, rescaled, own
  material). Record the printed jet start for Task 2.
- [ ] **Step 5:** test → PASS. Commit `feat(hideout): the Manneken Pis model and its prep script (#585)`.

### Task 2: `manneken.js` (pure) and `rooms.js`

**Files:** `manneken.js`, `tests/manneken.test.mjs` (new); `rooms.js`

- [ ] **Step 1: Failing test** — copy the frame helpers of `tests/fries.test.mjs` (`R = roomLayout(1)`, `toLocal`,
  `inside`) and adapt its placement/facing/collider tests to `MANNEKEN` / `mannekenPlacement`, plus:

```js
const M = mannekenPlacement(R, MANNEKEN);
test('MANNEKEN_LifeSizeOnAPedestalIn6mHighCorner', () => {
  assert.equal(MANNEKEN.figure.h, 0.61); assert.equal(MANNEKEN.pedestal.top, 1.9); assert.equal(MANNEKEN.walls.h, 6);
  assert.equal(MANNEKEN.url, './assets/models/manneken_pis.glb');
});
test('mannekenPlacement_NearTheFriesFigure_ClearOfIt', () => {
  const d = Math.hypot(M.x - R.figure.x, M.z - R.figure.z);
  assert.ok(d > 12 && d < 25, `${d.toFixed(1)} m from the fries`);
});
test('jetArc_StartsAtTheBoy_EndsOnTheWaterInsideTheBasin', () => {
  const pts = jetArc(MANNEKEN), a = pts[0], b = pts.at(-1);
  assert.ok(Math.abs(a.y - (MANNEKEN.pedestal.top + MANNEKEN.jet.from[1])) < 1e-9);
  assert.ok(Math.abs(b.y - MANNEKEN.basin.water) < 1e-6 && Math.hypot(b.x, b.z) < MANNEKEN.basin.r);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x >= pts[i - 1].x, 'flows forward');
});
test('roomLayout_OnlyTheAtomiumRoomHasTheCorner', () => {
  assert.equal(ROOMS[1].corner, MANNEKEN); assert.deepEqual(R.corner, M);
  assert.ok(R.colliders.includes(M.colliders[0]));
  for (const [k, room] of ROOMS.entries()) if (k !== 1) assert.equal(roomLayout(k).corner, null);
});
```

  Placement checks as fries: outside the spheres, inside the gravel loop, clear of every foot, |b| > 20 + reach,
  a < 0, faces the portal; collider `hw` 2.3 (x), `hd` 3.3 (z), `h` = ROOM_Y + 6.3, `low: true`, the car stops at
  the railing and passes 8 m in front.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** `manneken.js`: `MANNEKEN = { key: 'manneken', at: [-60, -34], url, figure: { h: 0.61 },
  walls: { h: 6, len: 3.2, t: 0.6 }, niche: { w: 1.6, h: 3.4, depth: 0.6 }, basin: { r: 0.7, rim: 0.7, water: 0.6 },
  pedestal: { r: 0.175, top: 1.9 }, railing: { r: 1.9, h: 1.2, step: 0.12 }, jet: { from: [..Task 1..], r: 0.012 },
  box: { hw: 2.3, hd: 3.3, h: 6.3 } }`, `mannekenPlacement(room, cfg)` (copy `friesPlacement`), and
  `jetArc(cfg, n = 16)` — a parabola in the corner frame from the boy's jet start to the water about 0.5 m ahead.
  `rooms.js`: `{ ..., figure: FRIES, corner: MANNEKEN }` on `atomium`; in `roomLayout` place `corner` like `figure`,
  push its collider, return `corner` (null elsewhere).
- [ ] **Step 4:** both node test files and `tests/fries.test.mjs` → PASS. Commit
  `feat(hideout): place the Manneken Pis corner beside the fries (#585)`.

### Task 3: `mannekenmesh.js` and `index.html`

**Files:** `mannekenmesh.js` (new), `index.html`, `strings.js`, `CREDITS.md`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1:** `mannekenmesh.js` from `friesmesh.js`: `buildManneken(cfg)` → a group (`userData.role =
  'manneken'`) with the corner of the spec (walls, plinth band, cornice, niche frame and arch, shell, basin,
  water disc, pedestal, railing with spear tips; one merged mesh per colour, ≤ 5000 triangles), the jet as a
  `TubeGeometry` along `jetArc` with a `CanvasTexture` of soft stripes (`wrapS/T = Repeat`, transparent,
  opacity 0.7); `loadMannekenFigure(group, cfg)` (async: GLTFLoader + MeshoptDecoder as `loadModel`, stands the
  boy on the pedestal at `pedestal.top`, resolves with its triangle count); `stepJet(group, dt)` scrolls the
  jet's `map.offset.x`.
- [ ] **Step 2:** `index.html`: import; `ROOM.manneken = null` (and reset where `ROOM.figure` is reset);
  `roomManneken(group, R)` called in `buildRoom` next to `roomFigure`; place it like the fries
  (`position`, `rotation.y = -th`); `ROOM.manneken = { x, z, th, y, loaded: false, tris: 0, height: null,
  colliders }`, filled when the figure loads (log before and after, as `loadModel`); `stepManneken(dt)` in the
  loop next to `stepRallyhall()`; `window.__mm.manneken = () => ROOM.manneken && ROOM.group ? { ...ROOM.manneken,
  built: ROOM.built } : null`.
- [ ] **Step 3:** credits — `creditManneken` EN `'3D model „177_ Manneken Pis In Brussels, Belgium" by RascalFR
  (Sketchfab), CC BY 4.0; simplified, rescaled, own bronze'`, DE `'3D-Modell „177_ Manneken Pis In Brussels,
  Belgium" von RascalFR (Sketchfab), CC BY 4.0; vereinfacht, neu skaliert, eigene Bronze'`, its `<small
  data-i18n>` after `creditAtomium`; CREDITS.md and README's model list (with the link); CHANGELOG under
  `[Unreleased]`, timestamped, e.g. "The **Manneken Pis** now stands in its **fountain corner** beside the
  Atomium, life size."
- [ ] **Step 4:** `node --test tests/*.test.mjs` → PASS. Commit
  `feat(hideout): the Manneken Pis in its fountain corner with a flowing jet (#585)` and push.

### Task 4: browser test

**Files:** `tests/test_hideout.py`

- [ ] **Step 1:** after `test_atomium_room_builds_…`, add
  `test_atomium_room_has_the_manneken_pis_life_size_in_its_solid_fountain_corner(server, tmp_path)`: record
  requests ending `manneken_pis.glb`; `ride(page, h, "ring")`, assert `__mm.manneken()` is None and no request;
  `into_room(page, 1, "atomium")`; wait `__mm.manneken().loaded === true` (timeout 120000). Assert one request;
  `14000 <= tris <= 22000`; `abs(height - 0.61) < 0.01`; `pushAt(x, z, -600)` moves the car (> 1 m),
  `pushAt` 8 m in front (along `th`) does not (< 0.01); `errors == []`. Put the camera 4 m in front at 2 m
  height looking at the boy, screenshot `tmp_path / "manneken.png"`, and look at it: the face looks at the
  camera, the jet reaches the basin.
- [ ] **Step 2:** run only this test (and the Atomium one) → PASS. Commit
  `test(hideout): the Manneken Pis corner in the browser (#585)`, push, open the PR (Closes #585).
