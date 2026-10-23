# Hatchback model (#236) Implementation Plan

**Goal:** a second drivable car „Hatchback" in the car select, built from the Sketchfab „2020 Mazda 3 Hatchback" (OUTPISTON,
CC BY-NC-SA 4.0) as an unbranded ~21k-triangle meshopt GLB with see-through glass, four wheel nodes, repaintable red paint,
livelier driving and its own sound, lazy-loaded with a compact fallback, credited in the file note, README, CHANGELOG and the F1 help.

**Spec:** `docs/superpowers/specs/2026-10-23-hatchback-model-design.md` (read it first; the node contract, the numbers and the
fallback flow are there, not repeated here). Pipeline notes: `docs/ai-notes/2026-10-22-vehicle-style-test.md`.

**Execution: LOCAL, subagents, not the pipeline** (`ai-implement` must not be used): Task 2 needs the original GLB
(`~/LocalSend/2020_mazda_3_hatchback.glb`, never committed) and Task 7 needs the GPU browser (`PW_CDP_ENDPOINT`, local sessions only).
Model choice: Tasks 1, 3–6 Sonnet; Task 2 (script + judging renders) and Task 7 (screenshots, interior shell, cameras) Fable per the
graphics rule, unless the maintainer says otherwise. Tasks run in order; Task 1 and Task 5 Step 1 could run in parallel (disjoint files).

**Global constraints:** buildless stack, no `package.json`, no `node_modules` in the repo, no framework, no new runtime dependency.
The prep script's npm packages are installed **outside the repo** (scratchpad). Node unit tests: `node --test prototype/tests/*.test.mjs`
(the glob, not the folder). Playwright: **foreground only, never `run_in_background`**, one file at a time
(`cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/<file> -q`), **after** commit and push, generous `timeout` (600000).
Memory-heavy commands (the prep script, `npm i`) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
TDD: failing test first, never edit a test to turn it green. Do not call `rr()`/`rnd()` in the new code (the seeded world RNG stays
unchanged). The original GLB, intermediate GLBs and screenshots' full-size PNGs go in the **scratchpad**, never into the repo.
Branch: `feature/236-hatchback-model` from `main`. Clean up scratch files and any Playwright profile at the end.

## File structure

- New `prototype/hatchback.js` — `HATCHBACK` table entry (data), wheel-node helpers. Pure.
- New `prototype/gltfvehicle.js` — load state machine, buildable id, model URL, paint on select, lamp role, race-button rule. Pure.
- New `prototype/tests/hatchback.test.mjs`, `prototype/tests/hatchback_asset.test.mjs` — node tests.
- New `tools/prepare-hatchback.mjs` — the reproducible prep script.
- New `prototype/assets/hatchback.glb`, `prototype/assets/hatchback.LICENSE.md`.
- Modify `prototype/index.html` — imports, `VEHICLES.hatchback`, `MODELS.gltf`, loader + cache, `selectVehicle` / boot / `setVehicle` for glTF vehicles, env list, lamps, `#csloading`, race button, help credit, `window.__mm.loadVehicle` / `gltfVehicle`.
- Modify `prototype/strings.js` (de + en), `README.md`, `CHANGELOG.md`, `prototype/tests/test_credits.py`, `prototype/tests/test-map.json`.
- New `prototype/tests/test_hatchback.py` — Playwright.
- Modify existing Playwright files only where a vehicle count legitimately changed (`test_carselect.py` first).
- New `docs/assets/hatchback/*.jpg` — the PR screenshots (≤ 300 KB each).

## Task 1: pure modules — table entry, wheel helpers, load rules (tests first)

**Files:** `prototype/tests/hatchback.test.mjs`, `prototype/hatchback.js`, `prototype/gltfvehicle.js`.

**Interfaces:** exactly the signatures in the spec's „Pure modules" block (`HATCHBACK`, `WHEEL_NODES`, `wheelPlan`, `wheelEntries`,
`tableWheels`, `loadStep`, `buildableId`, `modelUrl`, `paintOnSelect`, `lampRole`, `raceBlocked`). Header comments in the style of
`carselect.js` (issue number, „pure: no DOM, no three.js").

- [ ] **Step 1: write the failing tests.** Create `prototype/tests/hatchback.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HATCHBACK, WHEEL_NODES, wheelPlan, wheelEntries, tableWheels } from '../hatchback.js';
import { loadStep, buildableId, modelUrl, paintOnSelect, lampRole, raceBlocked } from '../gltfvehicle.js';
import { PAINTS, DEFAULT_CHOICE, paintable, statBars, parseChoice, initialChoice } from '../carselect.js';
import { checkSound } from '../sound.js';
import { checkCrash } from '../impact.js';

// the compact as in index.html's VEHICLES table (numbers that the Hatchback is compared against)
const COMPACT = { model: 'compact', drive: { top: 60, accel: 16, grip: 9 }, mass: 1.0 };
const IDS = ['compact', 'delorean', 'hatchback'], PAINT_IDS = PAINTS.map(p => p.id);
const CENTRES = { wheel_FL: [1.36, 0.33, -0.77], wheel_FR: [1.36, 0.33, 0.77], wheel_RL: [-1.36, 0.33, -0.77], wheel_RR: [-1.36, 0.33, 0.77] };

test('HATCHBACK_Entry_HasTheShapeCheckVehicleExpects', () => {
  assert.equal(HATCHBACK.model, 'gltf');
  assert.deepEqual(HATCHBACK.collision, { shape: 'circle', r: 1.25 });
  assert.ok([HATCHBACK.drive.top, HATCHBACK.drive.accel, HATCHBACK.drive.grip, HATCHBACK.mass, HATCHBACK.wheelR].every(Number.isFinite));
  assert.doesNotThrow(() => checkSound(HATCHBACK.sound));
  assert.doesNotThrow(() => checkCrash(HATCHBACK.sound.crash));
  assert.equal(HATCHBACK.sound.engine.cylinders, 4);
});

test('HATCHBACK_Entry_LivelierAndHeavierThanTheCompactWithOwnSound', () => {
  assert.ok(HATCHBACK.drive.top > COMPACT.drive.top && HATCHBACK.drive.grip > COMPACT.drive.grip && HATCHBACK.drive.accel > COMPACT.drive.accel);
  assert.ok(HATCHBACK.mass > COMPACT.mass);
  assert.ok(HATCHBACK.sound.engine.limitRpm > 6800, 'higher revving than the compact (limit 6800)');
  assert.deepEqual(statBars(HATCHBACK), { top: 9, accel: 9, handling: 9, mass: 4 });
});

test('HATCHBACK_Paint_RepaintableWithRedDefault', () => {
  assert.equal(paintable(HATCHBACK), true);
  assert.equal(paintable({ model: 'gltf' }), false, 'a fixed-paint glTF stays unpaintable');
  assert.equal(PAINTS.find(p => p.id === HATCHBACK.defaultPaint).hex, '#e0322d');
});

test('HATCHBACK_Camera_HasEveryViewTheTableNeeds', () => {
  for (const k of ['chase', 'near', 'cockpit', 'bumper', 'drone']) assert.ok(HATCHBACK.camera[k], k);
  assert.equal(HATCHBACK.camera.cockpit.eye.length, 3);
});

test('parseChoice_Hatchback_AcceptedAndUnknownFallsBackToCompact', () => {
  assert.deepEqual(parseChoice('{"id":"hatchback","paint":"ice"}', IDS, PAINT_IDS), { id: 'hatchback', paint: 'ice' });
  assert.deepEqual(parseChoice('{"id":"tank","paint":"ice"}', IDS, PAINT_IDS), { id: 'compact', paint: 'ice' });
  assert.equal(DEFAULT_CHOICE.id, 'compact');
  assert.deepEqual(initialChoice(null, '?vehicle=hatchback', IDS, PAINT_IDS), { id: 'hatchback', paint: 'navy' });
});

test('wheelPlan_AllFourNodes_FrontsFirstPerSideLeftIsMinusZ', () => {
  assert.deepEqual(wheelPlan([...WHEEL_NODES, 'body']), [
    { name: 'wheel_FL', front: true, side: -1 }, { name: 'wheel_FR', front: true, side: 1 },
    { name: 'wheel_RL', front: false, side: -1 }, { name: 'wheel_RR', front: false, side: 1 }]);
});

test('wheelPlan_MissingWheel_ThrowsNamingIt', () => {
  assert.throws(() => wheelPlan(['body', 'wheel_FL', 'wheel_FR', 'wheel_RR']), /wheel_RL missing/);
});

test('wheelEntries_FromCentres_GivesAxleXHalfTrackAndRadius', () => {
  const e = wheelEntries(CENTRES);
  assert.deepEqual(e.map(w => [w.name, w.x, w.z, w.r]), [['wheel_FL', 1.36, -0.77, 0.33], ['wheel_FR', 1.36, 0.77, 0.33], ['wheel_RL', -1.36, -0.77, 0.33], ['wheel_RR', -1.36, 0.77, 0.33]]);
});

test('tableWheels_FromEntries_MatchesTheHatchbackTable', () => {
  assert.deepEqual(tableWheels(wheelEntries(CENTRES)), HATCHBACK.wheels);
});

test('loadStep_Lifecycle_IdleLoadingReadyOrFailed', () => {
  assert.equal(loadStep('idle', 'want'), 'loading');
  assert.equal(loadStep('loading', 'loaded'), 'ready');
  assert.equal(loadStep('loading', 'error'), 'failed');
  assert.equal(loadStep('loading', 'want'), 'loading', 'a second highlight does not start a second load');
});

test('loadStep_FailedAndReady_AreSticky', () => {
  assert.equal(loadStep('failed', 'want'), 'failed', 'no retry storm in one session');
  assert.equal(loadStep('ready', 'want'), 'ready');
  assert.equal(loadStep('idle', 'loaded'), 'idle', 'an event out of order changes nothing');
});

test('buildableId_GltfNotReady_IsTheFallback', () => {
  for (const s of ['idle', 'loading', 'failed']) assert.equal(buildableId('hatchback', HATCHBACK, s), 'compact');
  assert.equal(buildableId('hatchback', HATCHBACK, 'ready'), 'hatchback');
  assert.equal(buildableId('compact', COMPACT, 'idle'), 'compact', 'a procedural car never waits');
});

test('modelUrl_Override_OnlyAllowListedAssetPaths', () => {
  assert.equal(modelUrl(HATCHBACK, ''), './assets/hatchback.glb');
  assert.equal(modelUrl(HATCHBACK, '?vehicle=hatchback&glb=./assets/missing.glb'), './assets/missing.glb');
  for (const bad of ['https://evil.example/x.glb', '//evil.example/x.glb', './assets/../index.html', './assets/a.html', '/etc/passwd'])
    assert.equal(modelUrl(HATCHBACK, `?glb=${encodeURIComponent(bad)}`), './assets/hatchback.glb', bad);
});

test('paintOnSelect_FactoryPaint_BecomesDefaultPaintOtherwiseKept', () => {
  assert.equal(paintOnSelect(HATCHBACK, 'navy'), 'swiss');
  assert.equal(paintOnSelect(HATCHBACK, 'ice'), 'ice');
  assert.equal(paintOnSelect(COMPACT, 'navy'), 'navy', 'a car without defaultPaint keeps the paint');
});

test('lampRole_Extras_HeadTailOrNull', () => {
  assert.equal(lampRole({ lamp: 'head' }), 'head');
  assert.equal(lampRole({ lamp: 'tail' }), 'tail');
  for (const x of [undefined, null, {}, { lamp: 'roof' }, { paint: true }]) assert.equal(lampRole(x), null);
});

test('raceBlocked_GltfWhileIdleOrLoading_TrueOtherwiseFalse', () => {
  assert.equal(raceBlocked(HATCHBACK, 'loading'), true);
  assert.equal(raceBlocked(HATCHBACK, 'idle'), true);
  assert.equal(raceBlocked(HATCHBACK, 'ready'), false);
  assert.equal(raceBlocked(HATCHBACK, 'failed'), false, 'a failed load falls back, the button must not hang');
  assert.equal(raceBlocked(COMPACT, 'idle'), false);
});
```

- [ ] **Step 2: run, expect failure** (modules not found): `node --test prototype/tests/hatchback.test.mjs`.
- [ ] **Step 3: implement** `prototype/hatchback.js` and `prototype/gltfvehicle.js` (functions ≤ 20 lines, guard clauses, no flag
  arguments). `HATCHBACK` carries the full table from the spec (drive, mass, engineAt, collision, camera, sound incl. horn / crash /
  gears, `blinkers`). `modelUrl` uses `new URLSearchParams(search).get('glb')` and the pattern `/^\.\/assets\/[\w.-]+\.glb$/`
  (rejects `..` by the pattern, no slashes after `assets/`). The numbers in the spec are starting values: if `checkSound` rejects the
  sound block, fix the block, not the test.
- [ ] **Step 4: run, expect pass.** `verify:` `node --test prototype/tests/hatchback.test.mjs` → all pass; then `node --test prototype/tests/*.test.mjs` still green.
- [ ] **Step 5: commit** `feat(vehicles): hatchback table entry and glTF vehicle rules (#236)`.

## Task 2: the model — asset test first, then the prep script and the GLB (local, original GLB needed)

**Files:** `prototype/tests/hatchback_asset.test.mjs`, `tools/prepare-hatchback.mjs`, `prototype/assets/hatchback.glb`, `prototype/assets/hatchback.LICENSE.md`.

**Interfaces:** the script CLI and node contract from the spec (`hatchback`, `body`, `wheel_FL|FR|RL|RR`; eight material roles; extras
`paint` / `glass` / `lamp`). Start from the scratchpad prototype `…/styletest/tools/mazda.mjs` of the style test (badge node names,
frame transform, simplify settings); it is a prototype to learn from, not a file to copy: it joins everything, strips no wheels and
keeps 19 materials.

- [ ] **Step 1: write the failing test.** `prototype/tests/hatchback_asset.test.mjs` reads the GLB with `node:fs` only (12-byte header,
  JSON chunk; counts come from the accessors, which stay readable under meshopt compression):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { HATCHBACK } from '../hatchback.js';

const FILE = new URL('../assets/hatchback.glb', import.meta.url);
const LICENSE = new URL('../assets/hatchback.LICENSE.md', import.meta.url);

function readGlb(url) {
  const b = readFileSync(url);
  assert.equal(b.readUInt32LE(0), 0x46546c67, 'glTF magic');
  const len = b.readUInt32LE(12);                      // first chunk = JSON
  assert.equal(b.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}
const triangles = (j) => j.meshes.flatMap(m => m.primitives).reduce((n, p) => n + ((p.mode ?? 4) === 4 ? j.accessors[p.indices].count / 3 : 0), 0);
const nodeByName = (j, n) => j.nodes.find(x => x.name === n);

test('hatchbackGlb_Committed_WithinTheSizeTriangleAndMaterialBudget', () => {
  assert.ok(existsSync(FILE), 'run tools/prepare-hatchback.mjs and copy the result to prototype/assets/hatchback.glb');
  const j = readGlb(FILE);
  assert.ok(statSync(FILE).size <= 500 * 1024, `size ${statSync(FILE).size}`);
  assert.ok(triangles(j) <= 25000 && triangles(j) >= 15000, `triangles ${triangles(j)}`);
  assert.ok(j.materials.length <= 8, `materials ${j.materials.length}`);
  assert.ok(!j.textures?.length, 'no textures');
});

test('hatchbackGlb_Extensions_MeshoptOnlyNoTransmission', () => {
  const j = readGlb(FILE);
  assert.ok(j.extensionsUsed.includes('EXT_meshopt_compression'));
  assert.ok(!JSON.stringify(j).includes('KHR_materials_transmission'));
  assert.deepEqual(j.extensionsUsed.filter(e => e !== 'EXT_meshopt_compression'), []);
});

test('hatchbackGlb_Names_CarryNoBrand', () => {
  const j = readGlb(FILE);
  const names = [...j.nodes, ...j.meshes, ...j.materials].map(x => x.name ?? '').join(' ');
  assert.doesNotMatch(names, /mazda|outpiston|badge|logo|lettering/i);
});

test('hatchbackGlb_Nodes_BodyAndFourWheelsWithTheirOriginAtTheWheelCentre', () => {
  const j = readGlb(FILE);
  assert.ok(nodeByName(j, 'hatchback') && nodeByName(j, 'body'));
  for (const [i, [x, z]] of [[1.36, -0.77], [1.36, 0.77], [-1.36, -0.77], [-1.36, 0.77]].entries()) {
    const n = nodeByName(j, ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'][i]);
    assert.ok(n && n.mesh !== undefined, 'wheel node with a mesh');
    const [tx, ty, tz] = n.translation;
    assert.ok(Math.abs(tx - x) < 0.03 && Math.abs(tz - z) < 0.03 && Math.abs(ty - HATCHBACK.wheelR) < 0.03, `${n.name} at ${n.translation}`);
  }
});

test('hatchbackGlb_Extras_PaintGlassAndLampsAreTagged', () => {
  const j = readGlb(FILE), ex = j.materials.map(m => m.extras ?? {});
  assert.ok(ex.some(e => e.paint === true) && ex.some(e => e.glass === true));
  assert.ok(ex.some(e => e.lamp === 'head') && ex.some(e => e.lamp === 'tail'));
  const glass = j.materials.find(m => m.extras?.glass);
  assert.equal(glass.alphaMode, 'BLEND');
  assert.ok(glass.pbrMetallicRoughness.baseColorFactor[3] < 0.5, 'low opacity glass');
});

test('hatchbackGlb_Length_IsFourPointFourSixMetres', () => {
  const j = readGlb(FILE), pos = j.meshes.flatMap(m => m.primitives).map(p => j.accessors[p.attributes.POSITION]);
  const xs = pos.flatMap(a => [a.min[0], a.max[0]]);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 4.46) < 0.03);   // the body alone; wheels sit inside the length
});

test('hatchbackLicenseNote_NamesAuthorTitleLinkLicenceAndModifications', () => {
  const t = readFileSync(LICENSE, 'utf8');
  for (const s of ['2020 Mazda 3 Hatchback', 'OUTPISTON', 'https://skfb.ly/pAOpM', 'CC BY-NC-SA 4.0', 'non-commercial', 'Modifications']) assert.ok(t.includes(s), s);
});
```

  (Accessor `min`/`max` for the length check come from the file; if the body node carries a transform, apply it. The wheel centres are read from the wheel nodes' `translation`.)
- [ ] **Step 2: run, expect failure** (file missing): `node --test prototype/tests/hatchback_asset.test.mjs`.
- [ ] **Step 3: set up the tool dependencies outside the repo.** `S=<scratchpad>/hbprep; mkdir -p $S`;
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 npm i --prefix $S @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer`.
  Copy the original to `<scratchpad>/orig/hatchback-original.glb` (outside the repo; `ls -l ~/LocalSend/2020_mazda_3_hatchback.glb` must be ~16.7 MB; if it is missing, **stop and tell the maintainer**, do not download or invent a model).
- [ ] **Step 4: write `tools/prepare-hatchback.mjs`** per the spec („Prep script"): header comment documents the usage, the node names and
  the material roles; `--list` prints the original materials / meshes / bounds and exits; `MATERIAL_MAP` is a plain object from original
  material name to role and an unmapped name throws with its name; the wheel split fails with a clear message unless exactly four
  clusters of `Tires` primitives are found; the ratio loop re-runs the simplify from the pre-simplify document until 20–24k triangles.
  Functions ≤ 20 lines; the file is data + small steps, one `main()`.
- [ ] **Step 5: run it.** `cd $S && cp <repo>/tools/prepare-hatchback.mjs . && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node prepare-hatchback.mjs <scratchpad>/orig/hatchback-original.glb <scratchpad>/out/hatchback.glb`
  (first with `--list` to map the materials). `verify:` the printed summary shows 20–24k triangles, ≤ 8 materials, 0 textures, ≤ 500 KB,
  four wheel centres within 3 cm of the table, length 4.46. Exit 137 means the memory cap: shrink nothing here, report it.
- [ ] **Step 6: look at it.** Load `out/hatchback.glb` in a throwaway page from the scratchpad (GLTFLoader + MeshoptDecoder from the import
  map, the game's `CAR_ENV` look, as in the style test) and screenshot front / side / rear / 3-4 view. Check: no badge or lettering,
  grey trims (no chrome), paint tintable (set the paint material colour to red and to blue), wheels pivot on their centre (rotate
  one about z), glass see-through. Fix the script, not the file by hand. If the interior reads as noise through the glass, re-run with
  `--interior-shell` and compare; Task 7 makes the final call on game renders, so keep both outputs until then.
- [ ] **Step 7: install the result.** Copy to `prototype/assets/hatchback.glb`. Write `prototype/assets/hatchback.LICENSE.md` (title,
  author, `https://skfb.ly/pAOpM`, the licence link, a **Modifications** list as in the spec, and „This modified file stays under CC
  BY-NC-SA 4.0; the game stays non-commercial").
- [ ] **Step 8: run, expect pass.** `verify:` `node --test prototype/tests/hatchback_asset.test.mjs` → all pass; full node glob green.
- [ ] **Step 9: commit** `feat(vehicles): hatchback model file and prep script (#236)` (GLB ≤ 500 KB, the script, the licence note).

## Task 3: the car in the page — table entry, builder, wheels, paint, env, lamps

**Files:** `prototype/index.html`, `prototype/strings.js`, `prototype/tests/test_hatchback.py` (first part).

**Interfaces:**

```js
// index.html (inline script, near MODELS / buildCar)
const GLTF_CARS = {};                                       // id -> { state, scene, mats, promise }
async function loadVehicleModel(id)                          // → Promise<boolean>; drives loadStep, caches the scene; never throws
function buildGltfVehicle(g, v)                              // MODELS.gltf: clone the cached scene, wire wheels / glass / lamps / blinkers
window.__mm.loadVehicle = (id) => loadVehicleModel(id);
window.__mm.gltfVehicle = () => ({ state, tris, materials: [names], wheels: n, paintColor: '#rrggbb', lamps: { head: n, tail: n } });
```

- [ ] **Step 1: write the failing Playwright tests** in the new `test_hatchback.py` (pattern of `test_carselect.py`: `MMH_ROUTE`,
  `ARGS`, `READY`, `open_page`, the `server` fixture, `T = 120000`; docstring „#236: the Hatchback. Slow (Playwright): run in the
  foreground."). Two tests now, the rest in Tasks 4 and 6:

```python
def load(page):
    return page.evaluate("async () => { await window.__mm.loadVehicle('hatchback'); return window.__mm.gltfVehicle(); }")

def test_hatchback_builds_with_four_turning_wheels_and_stays_in_budget(server):
    # open_page; g = load(page); g["state"] == "ready"; page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().hatchback)")
    # wait_frames; STATS_JS (copy from test_car_look.py): meshes <= 24 and triangles <= 25000
    # carSize()["l"] within 0.03 of 4.46; g["wheels"] == 4; g["materials"] has no name containing "mazda" (case-insensitive)
    # __mm.wheelYaw() has 2 front entries and 2 rear

def test_hatchback_paint_swatch_recolours_the_body(server):
    # load; select via window.__mm (setVehicle + applyPaint through the swatch click is Task 4); click the "ice" swatch
    # gltfVehicle()["paintColor"] == "#7fd1ff"; the compact's carMats().body.color is also "#7fd1ff" (shared choice)
```

  Run them: `verify:` both **fail** (no `loadVehicle` / `hatchback` entry). This is the red state; commit nothing yet.
- [ ] **Step 2: strings.** `prototype/strings.js`, de **and** en (the strings test requires equal keys and equal arity):
  `veh_hatchback_name/class/desc`, `carselLoading` (function of the name), `vehicleLoadFailed` (function of the name),
  `creditHatchback` (texts in the spec). German with real umlauts and capitalised address pronouns if any appear.
  `verify:` `node --test prototype/tests/strings.test.mjs` green.
- [ ] **Step 3: table and builder.** In `index.html`: `import { HATCHBACK } from './hatchback.js'; import { loadStep, buildableId, modelUrl, paintOnSelect, lampRole, raceBlocked } from './gltfvehicle.js';`
  (`wheelPlan` / `wheelEntries` too, where the wheels are wired); add `hatchback: HATCHBACK` to `VEHICLES` after the DeLorean (keep
  the file's comment style, one line: `// #236: ...`); `MODELS.gltf = buildGltfVehicle`.
  `buildGltfVehicle(g, v)`, ≤ 20 lines per helper (`wireWheels`, `wireMaterials`, `addBlinkers`):
  1. `const root = GLTF_CARS[v.gltf.id].scene.clone(true)` (`v` is the cloned def; the id lives in `gltf.id`, so no lookup by object is needed).
  2. Wheels: for each `wheelPlan(...)` entry take the node by name, make `steer` (at the node's position) and `roll` groups, reset the node position to 0 and add it to `roll`; push `{ front, steer, roll, d: null, home: steer.position.clone(), spun: 0 }` to `g.userData.wheels`. Both sides roll about z; do not mirror.
  3. Materials (collected once at load into `GLTF_CARS[id].mats`): `userData.paint` stays (the loader copies `extras`); glass materials `transparent = true`, `depthWrite = false`, glass meshes `userData.glass = true`; lamp materials sorted by `lampRole`; all `MeshStandardMaterial`s pushed into `CAR_ENV_MATS` and added to `SHARED_CAR_MATS`; call `buildCarEnv(STYLES[styleKey])` once after the load so they get the sky map.
  4. Blinkers from `v.blinkers` mirrored to ±z into `BLINK.left/right` (copy the compact's box + orange `MeshBasicMaterial`).
  5. `applyLamps`: `for (const m of lamps.head) m.emissiveIntensity = s.headLevel; for (const m of lamps.tail) m.emissiveIntensity = s.tailLevel;` for the current build.
  6. `setVehicle(def)`: `VEH = structuredClone(def.gltf && GLTF_CARS[def.gltf.id]?.state !== 'ready' ? VEHICLES[def.gltf.fallback] : def)` (the `buildableId` rule) so a glTF def that is not ready builds the fallback; `checkVehicle` accepts `model: 'gltf'`
     when `def.gltf` is present (`Object.hasOwn(MODELS, 'gltf')` already covers it; keep the circle-only check).
  7. `loadVehicleModel(id)`: `import('three/addons/loaders/GLTFLoader.js')` + `meshopt_decoder.module.js` as `loadModel` does, `loader.setMeshoptDecoder`, `loadAsync(modelUrl(def, location.search))`; on success traverse for `isMesh`, `computeVertexNormals()` where no normals, cache, `loadStep('loading','loaded')`; on error `console.warn`, `loadStep('loading','error')`, resolve `false`.
- [ ] **Step 4: commit and push, then run** `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_hatchback.py -q` (foreground).
  `verify:` the two tests pass; if the wheels do not turn, check the `steer`/`roll` pivots first (wheel node origin must be the wheel centre).
- [ ] **Step 5:** `verify:` the page loads with an empty console and the compact is untouched: `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_smoke.py::test_camera_cycles_with_c -q`.
- [ ] **Step 6: commit** `feat(vehicles): build the hatchback from its glTF file (#236)`.

## Task 4: lazy loading, the car select, fallback and toast

**Files:** `prototype/index.html`, `prototype/tests/test_hatchback.py`.

**Interfaces:** `selectVehicle(id)` / boot / `renderCarSel()` as in the spec's „Lazy loading and fallback"; one new element
`<div id="csloading" class="cs-hint" hidden></div>` in `#carsel` next to `#csdesc`, styled like the existing small hint text (no new
palette); a `pendingSwap` flag for the boot case.

- [ ] **Step 1: write the failing tests** (append to `test_hatchback.py`; `open_page(p, server, query=...)`):

```python
def test_highlighting_the_hatchback_loads_it_lazily_and_holds_the_race_button(server):
    # open_page(...): gltfVehicle()["state"] == "idle" (nothing is fetched for a compact player; assert no request for hatchback.glb via page.on("request"))
    # openCarSel; click the garage dot data-id="hatchback" -> carsel()["id"] == "hatchback"; #csloading visible with text containing "Hatchback" while state != ready
    # (route the glb with a 600 ms delay so the loading state is observable: page.route("**/hatchback.glb", lambda r: (time.sleep(.6), r.continue_())))
    # #csrace is disabled while loading; wait for state == "ready" -> #csloading hidden, #csrace enabled, carsel()["paintable"] is True, bodyColor == "#e0322d" (default red), carSize()["l"] ~ 4.46

def test_starting_with_the_hatchback_in_the_url_swaps_it_in_before_the_race(server):
    # open_page(query="?vehicle=hatchback"): first the compact is built (carSize l ~ 4.66), wait for state == "ready" -> carSize l ~ 4.46, VEH is the hatchback (vehicles via __mm.carsel().id)

def test_a_failed_load_falls_back_to_the_compact_with_a_toast(server):
    # open_page(query="?vehicle=hatchback&glb=./assets/missing.glb"); wait state == "failed"
    # carsel()["id"] == "compact"; #toast has class "show" and its text mentions "Hatchback"; localStorage mm.car still has id "hatchback"
    # highlighting it again does not start a second request (state stays failed)
```

  `verify:` run (after Step 2's commit not needed yet): the three **fail**.
- [ ] **Step 2: implement.**
  - `selectVehicle(id)`: `const def = VEHICLES[id]`; set `CHOICE.id`; if `def.gltf`: `wantVehicleModel(id)` (`loadStep('idle','want')`, starts `loadVehicleModel` once); build now only when `buildableId(...) === id`; else leave the stage car; `applyPaint(paintOnSelect(def, CHOICE.paint))`; `saveChoice()`; render. The load's completion handler: if `CHOICE.id === id` and the swap is allowed (`R.state === 'ready'` or `CARSEL.on`): `setVehicle(def)` + `applyPaint(...)` + `renderCarSelKeepFocus()` + `renderStartScreen()`; else set `pendingSwap = id` and apply it in `resetCar()` and `startRace()`.
  - Failure handler: if `CHOICE.id === id`: `CHOICE.id = def.gltf.fallback`, `setVehicle(VEHICLES[...])`, `toast(tr('vehicleLoadFailed', vehicleText(tr, id, 'name')), TOAST_S.event)`, render; **no** `saveChoice()`.
  - Boot: after `CHOICE` is parsed, `setVehicle(VEHICLES[CHOICE.id])` already builds the fallback; then `if (VEHICLES[CHOICE.id].gltf) wantVehicleModel(CHOICE.id)`.
  - `renderCarSel`: `#csloading` text `tr('carselLoading', name)` and `hidden = loadState !== 'loading' && loadState !== 'idle'` for the highlighted glTF vehicle; `$('csrace').disabled = raceBlocked(def, state)`; swatches follow `paintable(def)` as today.
  - `window.__mm.carsel()` unchanged in shape (tests rely on it).
- [ ] **Step 3: commit and push, then run** `test_hatchback.py` (foreground). `verify:` all pass. A failing swap test usually means `R.state`
  was not `'ready'` at load time: read the state values at `startRace`/`resetCar` before changing the rule.
- [ ] **Step 4: existing car-select tests.** Run `test_carselect.py`, `test_vehicles.py`, `test_wheels.py` one by one. A test that asserted
  „two vehicles" / `count == 2` / the garage dot count changes to the new count (3) **with the reason in the commit message**; any other
  failure is a bug in Task 3/4, fix the code. `verify:` all green.
- [ ] **Step 5: commit** `feat(vehicles): lazy-load the hatchback with a loading hint and a compact fallback (#236)`.

## Task 5: credits (test first)

**Files:** `prototype/tests/test_credits.py`, `prototype/index.html`, `README.md`, `CHANGELOG.md`, `prototype/tests/test-map.json`.

- [ ] **Step 1: write the failing test** (append to `test_credits.py`, pattern of the Titanic tests):

```python
def test_hatchback_model_is_credited_everywhere():
    """#236: "2020 Mazda 3 Hatchback" by OUTPISTON, CC BY-NC-SA 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "prototype/assets/hatchback.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "OUTPISTON" in t and "CC BY-NC-SA 4.0" in t and "skfb.ly/pAOpM" in t, f
    strings = (ROOT / "prototype" / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditHatchback") == 2 and 'data-i18n="creditHatchback"' in (ROOT / "prototype" / "index.html").read_text(encoding="utf-8")


def test_hatchback_model_is_committed_and_small():
    glb = ROOT / "prototype" / "assets" / "hatchback.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 500 * 1024
```

  `verify:` `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_credits.py -q` → the first test **fails** (help markup and CHANGELOG missing).
- [ ] **Step 2:** `index.html` help: `<small data-i18n="creditHatchback" style="display:block;margin-top:4px;color:var(--steel-l)"></small>` after the Titanic line.
- [ ] **Step 3:** `README.md`: extend the existing „2020 Mazda 3 Hatchback" bullet with the file path and „see `prototype/assets/hatchback.LICENSE.md`"; keep the non-commercial sentence. `CHANGELOG.md` `[Unreleased]` → `### Added`, player voice, Swiss local time as the other entries: a new car **Hatchback** in the car select, red by default and repaintable, with see-through windows, a livelier engine and its own sound; loads the first time it is picked; mention the credit (OUTPISTON, CC BY-NC-SA 4.0) once. Nothing about the build tooling.
- [ ] **Step 4:** `prototype/tests/test-map.json`: `"prototype/hatchback.js": ["test_hatchback.py", "test_carselect.py"]`, `"prototype/gltfvehicle.js": ["test_hatchback.py", "test_carselect.py"]`, `"prototype/assets/hatchback.*": ["test_hatchback.py", "test_credits.py"]`, `"tools/prepare-hatchback.mjs": ["test_credits.py"]` (so a prep change at least re-checks the committed file notes). `verify:` `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_select_tests.py -q` green.
- [ ] **Step 5: run** `test_credits.py` (foreground). `verify:` all green (no browser in this file).
- [ ] **Step 6: commit** `docs(credits): credit the hatchback model in the help, README and CHANGELOG (#236)`.

## Task 6: behaviour in the game — driving, damage, lights, shadow (tests first)

**Files:** `prototype/tests/test_hatchback.py`, `prototype/index.html` (fixes only).

- [ ] **Step 1: write the failing/characterising tests** (append; each starts with `load(page)` and `setVehicle(vehicles().hatchback)`, hand-traced layout, no data files):

```python
def test_hatchback_drives_wheels_roll_and_only_the_fronts_steer(server):
    # start a race (csrace click or __mm.startRace), hold ArrowUp ~2 s with a key down/up helper from test_wheels.py,
    # then hold ArrowLeft: wheelYaw()["spin"] changed, front[i] != 0 for both fronts, rear all 0
    # top speed with nitro off reaches > the compact's 60 m/s * 0.9 within 12 s (livelier), speed read from __mm state as in test_vehicles.py

def test_hatchback_damage_smokes_and_wrecks_at_one_hundred_percent(server):
    # setDamage(0.5): damage()["smoke"] grows after wreckSim(2); setDamage(1.0): wrecked True; wheelsOff == 4 after wreckSim(3) ... same expectations as the compact in test_crash.py

def test_hatchback_lights_follow_the_switches(server):
    # press L: gltfVehicle()["lamps"] head level == 2.0 (LAMP.head.on); release: 0.35; hold S/brake while moving: tail level 2.4

def test_hatchback_shadow_and_photo_and_mirror_work(server):
    # drawShadow: __mm shadow hook from test_shadow.py reports a size matching carSize() (+margin); cockpit view (C x3) shows the mirror (test_mirror.py hook) and photo (X) returns a PNG data URL without errors; no pageerror/console.error
```

  Reuse the helper functions and `__mm` hooks of `test_wheels.py`, `test_crash.py`, `test_lights.py`, `test_shadow.py`, `test_mirror.py`, `test_photo.py` (read them first; import by copying the few lines, tests do not import each other). `verify:` run once; fix the **code** for real failures (a wheel that does not detach, a lamp that never changes); a failing assertion about numbers (speed relations) is checked against the table, not loosened.
- [ ] **Step 2: fix what the run shows** in `index.html` (wheel detach for wrapped groups: `detachWheels` reads `w.steer.position`, so the wrapper must be in `car` directly; lamp materials missing in a clone; the glass `userData` for `__mm.glass()`).
- [ ] **Step 3: affected existing files, one by one, foreground:** `test_car_look.py` (its dark-glass check applies to the compact and the DeLorean; if it iterates all vehicles, exempt the Hatchback explicitly with the reason „#236 see-through glass"), `test_sound.py`, `test_shadow.py`, `test_wheels.py`, `test_crash.py`, `test_lights.py`, `test_mirror.py`, `test_photo.py`. `verify:` all green. Targeted run only, never the ~2 h full suite.
- [ ] **Step 4: commit and push** `test(vehicles): hatchback driving, damage, lights and shadow (#236)`.

## Task 7: look and feel on the GPU browser (local, Fable)

**Files:** `prototype/hatchback.js` (camera / numbers), `prototype/assets/hatchback.glb` (only if the interior shell wins), `tools/prepare-hatchback.mjs` (only then), `docs/assets/hatchback/*.jpg`.

- [ ] **Step 1: screenshots, 1920 × 1080 @2x on the GPU browser** (`PW_CDP_ENDPOINT`, a throwaway script in the scratchpad, game served from this worktree, HUD hidden): the car select turntable (front 3/4, side), chase, near, drone, a close-up through the glass at 5 m from the driver's side, both the plain and the `--interior-shell` GLB, red and ice paint, night with head lights on, wreck smoke; each next to the compact at the same spot. Full-size PNGs stay in the scratchpad.
- [ ] **Step 2: judge, against the Original (MM2) look and the compact.** Check: no chrome highlight, no badge shapes, glass reads as glass not as a hole, paint gloss similar to the compact's, wheels sit on the ground and in the arches, shadow decal matches the footprint, cameras frame the car (chase / near distance, cockpit eye at the left-hand seat height, bumper eye above the grille). Decide the **interior shell** (yes only if the plain interior reads as noise) and tune `camera` values and the glass opacity (0.2–0.35); re-run the prep script with the chosen option if needed and re-run `hatchback_asset.test.mjs`.
- [ ] **Step 3: a test drive.** Drive 60 s on the SwiftShader/GPU page (Sisseln road): acceleration and grip feel a bit livelier than the compact, no sound glitch at the gear changes, the stat bars read 9 / 9 / 9 / 4. Tune `drive` / `sound` in `hatchback.js` only; the relations in `hatchback.test.mjs` must stay green (they pin „livelier", not the numbers).
- [ ] **Step 4: save the PR screenshots** as 800 px JPEGs (≤ 300 KB each, ~8 files) under `docs/assets/hatchback/`; frame time is not asserted (vsync step, see the style test).
- [ ] **Step 5: final checks.** `node --test prototype/tests/*.test.mjs` green; `test_hatchback.py`, `test_carselect.py`, `test_credits.py` green; the page opens with an empty console; the original GLB is **not** in `git status`. `verify:` `git status --short` lists only intended files.
- [ ] **Step 6: commit, push, PR.** `feat(vehicles): add the hatchback, a real 3D car in the car select (#236)`; body with the template sections (Summary, Changes, Testing: node tests, the Playwright files run, GPU screenshots; Checklist: no secrets, licence note, original not committed), the screenshots inlined, `Closes #236`. Do not merge; the maintainer reviews the look.

## Out of scope (do not do)

- Ambient traffic (#364), a 5k LOD, body deformation, opening doors, a cockpit dashboard.
- Converting the compact or DeLorean to glTF; changing `loadModel` for the hideout models; moving the three existing models.
- Hub card / screenshot regeneration, release tagging, `version.js`.
- Committing the original GLB, an intermediate GLB or full-size PNGs; adding `package.json` or `node_modules`.
