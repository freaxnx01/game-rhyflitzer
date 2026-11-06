# Fridolinskapelle landmark (#649) Implementation Plan

**Goal:** the Fridolinskapelle in Sisseln shows as its swissBUILDINGS3D model (`assets/landmarks/fridolinskapelle-sisseln.glb`)
instead of the flat OSM box 171822707, on the terrain, still solid for the car. The loader is generic over
`assets/landmarks/index.json`. Spec: `docs/superpowers/specs/2026-11-06-fridolinskapelle-landmark-design.md`.

**Architecture:** a pure module `chlandmarks.js` (offsets, which OSM building a landmark replaces, colour role per face) with
node tests; `index.html` fetches `index.json` before the house loop, `osmBuilding` skips the replaced building's mesh but keeps
its collider, and the GLBs load asynchronously after the houses.

**Global constraints**
- The offset comes from loaded data only: `index.json.origin` (e, n, h), `L.origin` (E, N of the world, `world.js:119`) and
  `REAL.hdr.base` (the terrain `.mmh` header, today 284.0; `index.html:1029`). Never hard-code 218.65 / 4.0 / −212.92.
- No landmark without measured terrain (`REAL` null), without `L.origin`, or in another region than the one `REPLACES` names:
  hand layout, Ehrendingen and generated worlds behave exactly as today.
- `osmBuilding` draws seeded random numbers (`rr`, `rnd`) for every building; a replaced building must draw the same ones
  before it returns, so every later building keeps its colours (same pattern as `isBodenacker6`, `index.html:1500`).
- The GLB is Draco-compressed. Use `DRACOLoader` from the import map's three (`three/addons/loaders/DRACOLoader.js`) with decoder
  path `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/` (same CDN and version as the import map,
  `index.html:676`). Keep the existing `MeshoptDecoder` loaders untouched.
- Never weaken an existing test. Run `node --test tests/*.test.mjs`, then only this plan's Playwright file, in the foreground.
  Commit and push before the Playwright run.

**Files**
- Create: `chlandmarks.js`, `tests/chlandmarks.test.mjs`, `tests/test_ch_landmarks.py`
- Modify: `index.html`, `CHANGELOG.md`

---

### Task 1 - Pure placement rules in `chlandmarks.js` (TDD)

**Files:** create `chlandmarks.js`, `tests/chlandmarks.test.mjs`

**Interfaces**
```js
export const REPLACES;                                   // { [landmarkId]: { osm: number, region: string } }
export function landmarkOffset(lmOrigin, worldOrigin, terrainBase);   // -> { x, y, z }
export function chLandmarksFor(index, regionId, worldOrigin, terrainBase);
// -> [{ id, file, offset: {x,y,z}, top, osm }]; [] when index, worldOrigin or terrainBase is missing
export function roofOrWall(ny);                          // 'roof' | 'wall'
```

- [ ] **Step 1: Write the failing test** `tests/chlandmarks.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPLACES, landmarkOffset, chLandmarksFor, roofOrWall } from '../chlandmarks.js';

const LM = { crs: 'EPSG:2056', e: 2640000, n: 1267000, h: 280 };
const WORLD = { E: 2639781.3458206826, N: 1266787.080520644, crs: 'EPSG:2056' };
const INDEX = { origin: LM, landmarks: { 'fridolinskapelle-sisseln': { file: 'fridolinskapelle-sisseln.glb',
  bounds: { min: [1513.3, 20.48, -221.29], max: [1537.45, 44.62, -207.21] } } } };

test('landmarkOffset_hochrhein_movesTheLandmarkFrameOntoTheWorldFrame', () => {
  const o = landmarkOffset(LM, WORLD, 284);
  assert.ok(Math.abs(o.x - 218.654) < 0.01, o.x);
  assert.equal(o.y, -4);   // origin.h - base: 280 - 284
  assert.ok(Math.abs(o.z + 212.919) < 0.01, o.z);
});

test('chLandmarksFor_hochrhein_placesTheChapelOverItsOsmFootprint', () => {
  const [c] = chLandmarksFor(INDEX, 'hochrhein', WORLD, 284);
  assert.equal(c.id, 'fridolinskapelle-sisseln');
  assert.equal(c.osm, 171822707);
  const cx = (1513.3 + 1537.45) / 2 + c.offset.x, cz = (-221.29 - 207.21) / 2 + c.offset.z;
  assert.ok(Math.hypot(cx - 1744.18, cz + 424.69) < 3, [cx, cz]);   // OSM rect centre of way 171822707
  assert.ok(Math.abs(c.top - (324.62 - 284)) < 0.05, c.top);          // turret top, world y
});

test('chLandmarksFor_otherRegionOrMissingData_placesNothing', () => {
  assert.deepEqual(chLandmarksFor(INDEX, 'ehrendingen', WORLD, 284), []);
  assert.deepEqual(chLandmarksFor(INDEX, 'hochrhein', null, 284), []);
  assert.deepEqual(chLandmarksFor(INDEX, 'hochrhein', WORLD, null), []);
  assert.deepEqual(chLandmarksFor(null, 'hochrhein', WORLD, 284), []);
});

test('chLandmarksFor_landmarkWithoutReplacesEntry_isSkipped', () => {
  const idx = { ...INDEX, landmarks: { ...INDEX.landmarks, 'unknown-x': INDEX.landmarks['fridolinskapelle-sisseln'] } };
  assert.deepEqual(chLandmarksFor(idx, 'hochrhein', WORLD, 284).map(c => c.id), ['fridolinskapelle-sisseln']);
});

test('REPLACES_chapel_isWay171822707InHochrhein', () => {
  assert.deepEqual(REPLACES['fridolinskapelle-sisseln'], { osm: 171822707, region: 'hochrhein' });
});

test('roofOrWall_byNormal_roofFacesUpWallsStand', () => {
  assert.equal(roofOrWall(0.9), 'roof');
  assert.equal(roofOrWall(0.4), 'roof');
  assert.equal(roofOrWall(0.1), 'wall');
  assert.equal(roofOrWall(-1), 'wall');
});
```

- [ ] **Step 2: Run** `node --test tests/chlandmarks.test.mjs` — fails (module missing).

- [ ] **Step 3: Implement** `chlandmarks.js`

```js
// #649 / #652: swissBUILDINGS3D landmarks (assets/landmarks, exported by .claude/skills/ch-landmarks) placed in the world.
// Pure: no three.js, no DOM. Landmark frame x = E - e, y = H - h, z = -(N - n) (landmarks.yaml origin); world frame
// x = E - E0, z = -(N - N0) (world origin) and y = H - base (terrain .mmh header).

// which OSM building each landmark replaces, and where; the export's index.json knows nothing of OSM
export const REPLACES = {
  'fridolinskapelle-sisseln': { osm: 171822707, region: 'hochrhein' },   // building=chapel, Schulhausstrasse 6.1, Sisseln
};

export function landmarkOffset(lm, world, base) {
  return { x: lm.e - world.E, y: lm.h - base, z: -(lm.n - world.N) };
}

export function chLandmarksFor(index, regionId, world, base) {
  if (!index || !index.origin || !index.landmarks || !world || base == null) return [];
  const offset = landmarkOffset(index.origin, world, base);
  return Object.entries(index.landmarks).flatMap(([id, lm]) => {
    const r = REPLACES[id];
    if (!r || r.region !== regionId) return [];
    return [{ id, file: lm.file, offset, top: lm.bounds.max[1] + offset.y, osm: r.osm }];
  });
}

// a face whose normal points up more than ~20 degrees from vertical walls is roof
export function roofOrWall(ny) { return ny > 0.35 ? 'roof' : 'wall'; }
```

- [ ] **Step 4: Run** `node --test tests/chlandmarks.test.mjs` — passes. Then `node --test tests/*.test.mjs`.
- [ ] **Step 5: Commit and push** `feat(landmarks): placement rules for swissBUILDINGS3D landmarks (#649)`; open the draft PR.

---

### Task 2 - Skip the replaced OSM building, keep its collider (`index.html`)

**Files:** modify `index.html`

- [ ] **Step 1:** import `chLandmarksFor`, `roofOrWall` from `./chlandmarks.js` next to the other module imports (around
  `index.html:686`).
- [ ] **Step 2:** directly before the house loop (`if (L) for (const b of L.buildings) osmBuilding(b);`, `index.html:2292`),
  load the placements once:

```js
// #649: swissBUILDINGS3D landmarks; none without measured terrain or outside the region their OSM building is in
const CH_LM = (L && REAL && L.origin) ? chLandmarksFor(await fetch('assets/landmarks/index.json').then(r => r.ok ? r.json() : null).catch(() => null), REGION.id, L.origin, REAL.hdr.base) : [];
const CH_LM_BY_OSM = new Map(CH_LM.map(c => [c.osm, c]));
window.__mm.counts.chLandmarks = { placed: [], replaced: [] };
```

  If `CH_LM` is needed before that line (it is not today), move the declaration up rather than duplicating the fetch.

- [ ] **Step 3:** in `osmBuilding` (`index.html:1485`), after the random draws of each branch and before any mesh, hand a
  replaced building over. Add a helper next to `osmBuilding`:

```js
// #649: a building a landmark replaces draws nothing, but stays solid as its ring up to the landmark's top
function landmarkReplaces(b, base) {
  const lm = CH_LM_BY_OSM.get(b.id); if (!lm) return false;
  const [cx, cz, w, d, rot] = b.rect;
  pushOBB({ x: cx, z: cz, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot), h: Math.max(base + 3, lm.top), ring: b.ring });
  window.__mm.counts.chLandmarks.replaced.push(b.id); return true;
}
```

  Call it in the gable branch right after `const door = …` (`if (landmarkReplaces(b, base)) return;`) and in the flat branch
  right after `const wc = …`, before the `isBodenacker6` line. Both spots come after all the branch's `rr()`/`rnd()` draws, so the
  seeded colours of every later building do not change. `osmBuilding` must be able to see `CH_LM_BY_OSM`; if it is declared
  later in the file, use a `let` declared before `osmBuilding` is first called and assign it in Step 2.

- [ ] **Step 4:** `node --test tests/*.test.mjs` still passes. Commit and push `feat(landmarks): a landmark replaces its OSM building (#649)`.

---

### Task 3 - Load and place the GLBs (`index.html`)

**Files:** modify `index.html`

- [ ] **Step 1:** after the house loop and before `loadStage('props', …)`, start the loads without awaiting them:

```js
// #649: the swissBUILDINGS3D landmarks, untextured: plaster walls and a dark roof by face normal; DoubleSide because CityGML
// normals are not consistent. Async: the start does not wait for them.
if (CH_LM.length) (async () => {
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')]);
  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/'));
  const wall = col('#ece6da'), roof = col('#5d4a40');
  for (const lm of CH_LM) {
    try {
      const gltf = await loader.loadAsync(`assets/landmarks/${lm.file}`);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry; g.computeVertexNormals();
        const n = g.attributes.normal, c = new Float32Array(n.count * 3);
        for (let i = 0; i < n.count; i++) { const k = roofOrWall(n.getY(i)) === 'roof' ? roof : wall; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3)); o.geometry = g;
        o.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); o.castShadow = o.receiveShadow = true;
      });
      gltf.scene.name = lm.id; gltf.scene.position.set(lm.offset.x, lm.offset.y, lm.offset.z); scene.add(gltf.scene);
      window.__mm.counts.chLandmarks.placed.push(lm.id);
    } catch (e) { console.warn(`landmark ${lm.id} not loaded`, e); }
  }
})();
```

  Match what the file already uses: if `col()` returns something else than a `THREE.Color`, or the scene/material helpers have
  other names (`scene`, `MeshLambertMaterial`, shadows), use the file's own. A face with `ny` from `computeVertexNormals` on a
  non-indexed geometry is the face normal, which is what `roofOrWall` expects. If a `DoubleSide` back face is lit black, flip
  `n.getY(i)` with `Math.abs` for the colour only.

- [ ] **Step 2:** export a hook for the test: `window.__mm.landmarkBox = (id) => { const o = scene.getObjectByName(id); if (!o) return null; const b = new THREE.Box3().setFromObject(o); return { min: b.min.toArray(), max: b.max.toArray() }; };`
  next to the other `window.__mm` hooks (around `index.html:4148`).

- [ ] **Step 3:** `node --test tests/*.test.mjs`. Commit and push `feat(landmarks): load the Fridolinskapelle model (#649)`.

---

### Task 4 - Playwright `tests/test_ch_landmarks.py`

**Files:** create `tests/test_ch_landmarks.py`

Follow the setup of `tests/test_building_collision.py` (`server` fixture, `needs_world`, launch args) but **do not** route the
`.mmh` to 404: the landmark needs the measured terrain.

- [ ] **Step 1:** write the tests:
  - `test_chapel_model_stands_on_its_footprint_and_terrain`: wait until `window.__mm.counts.chLandmarks.placed` contains
    `fridolinskapelle-sisseln` (timeout 120 s); `landmarkBox('fridolinskapelle-sisseln')` centre (x, z) within 3 m of
    (1744.18, −424.69); with `g = window.__mm.ground(cx, cz)`, `max.y − g` between 19 and 23 (the turret, 21 m) and
    `min.y ≤ g + 0.5` (no floating).
  - `test_flat_osm_box_is_replaced`: `window.__mm.counts.chLandmarks.replaced` equals `[171822707]`.
  - `test_car_stops_at_the_chapel`: drive at the chapel with `window.__mm.sim(x, z, th, 0, 4)` from a free point a few metres
    outside its ring (derive it from the ring of 171822707 in `data/world_hochrhein.json`, as `test_car_stops_at_the_drawn_wall`
    does) and assert the car stops (`speed < 1`) outside the ring.
- [ ] **Step 2:** commit and push, then run `pytest tests/test_ch_landmarks.py -x` in the foreground (generous timeout).

---

### Task 5 - Changelog

- [ ] Add under `[Unreleased]` → `### Changed`, newest first, time from `TZ=Europe/Zurich date '+%F %H:%M'`:
  `` - `<time>` The **Fridolinskapelle** in Sisseln now looks like a chapel: a 3D model from swisstopo's swissBUILDINGS3D with its ridge roof and **turret** replaces the flat box. ``
- [ ] Commit and push `docs(changelog): Fridolinskapelle model (#649)`.
