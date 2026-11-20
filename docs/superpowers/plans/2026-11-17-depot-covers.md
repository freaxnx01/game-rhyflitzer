# Depot car covers (#1045) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The far depot slots at the DSM car park show a draped car cover instead of a plain grey box.

**Architecture:** A pure module `depotcover.js` builds the cover as plain arrays (positions, normals-free, indices, per-vertex
colours) in a unit footprint, unit-tested in node. `index.html`'s `placeDepot` (around line 7079) turns each kind into a
`BufferGeometry` and keeps **one `InstancedMesh` per kind** (`car`, `long`) instead of the one `BoxGeometry` mesh; the per-slot
matrix and the hide/show logic stay as they are, mapped to (kind, index).

**Tech Stack:** vanilla JS ES modules, three.js (`index.html` only), `node --test`, Python Playwright.

**Spec:** GitHub issue #1045 (body is the spec). Background: `docs/superpowers/specs/2026-11-11-depot-near-models-design.md` (#807).

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Keep the 6-near limit: `DEPOT.near` 100, `DEPOT.nearMax` 6, `keep`/`keepMax` unchanged.
- No textures, no new material per slot; at most two `InstancedMesh` (one per kind) and two materials for all covers.
- Cover heights stay `DEPOT.boxH` (1.5 m) for a short vehicle and `DEPOT.boxHLong` (3 m) for a long one (`l > DEPOT.longL`).
- `depot.js` stays pure (no three.js); `depotcover.js` is pure too.
- The swap to the real model near the player, the solids and boarding are unchanged.
- `__mm.depot()` keeps `model: 'box'` for a covered slot (existing tests rely on it).
- Run only the targeted tests: `node --test tests/depotcover.test.mjs tests/depot.test.mjs` and `tests/test_depot.py`, never the full suite.
- Playwright needs `PW_CDP_ENDPOINT=http://192.168.1.120:9223`; run pytest as
  `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python -m pytest`, in the foreground.
- CHANGELOG entry under `[Unreleased]` → `### Changed`, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, bold 1–3 keywords.

## Review Focus

- A slot whose real model is evicted (driving away) must get its cover back, in the right kind's mesh — covered by the existing
  `test_depot_builds_only_the_nearest_models_and_frees_them` (every non-gltf slot is `'box'`) plus Task 2's `covers` assertion.
- The driven vehicle's slot shows no cover (existing `shown` assertion).
- A long vehicle's cover is not a stretched car silhouette: Task 1 tests the `long` kind's roof is flat.
- The cover's hem sits on the ground, not floating: Task 1 tests the lowest y is 0.
- Memory: no geometry per slot — Task 2 asserts exactly two cover geometries.

---

### Task 1: pure cover shape

**Files:**
- Create: `depotcover.js`
- Test: `tests/depotcover.test.mjs`

**Interfaces:**
- Produces: `export function coverMesh(kind: 'car' | 'long'): { positions: number[], indices: number[], colors: number[] }`
  — a closed-top shell (open bottom) in a unit footprint: x ∈ [-0.5, 0.5] along the length (+x = nose), z ∈ [-0.5, 0.5]
  across, y ∈ [0, 1] (scaled by the instance matrix to l × h × w). `colors` is RGB 0..1 per vertex.
- Produces: `export const COVER = { tarp: [r, g, b], wheel: [r, g, b] }` — tarp a muted blue-grey cloth, wheel near-black.

Shape (the implementer designs the exact profile; these are the checkable properties):
- `car`: side profile low at both ends (bonnet and boot ≈ 0.45–0.6 of the height), a cabin hump that reaches 1.0 between
  about x = -0.25 and x = 0.15, sloped screens in between; the top is crowned across (edges lower than the centre line);
  the sides drape down to a hem at y = 0.12–0.2, and below the hem four dark tyre stubs (wheel colour) reach y = 0 at
  x ≈ ±0.33, z ≈ ±0.42.
- `long`: a near-box tarp with a flat roof (y = 1 over most of the length), rounded upper edges, a slightly lower front
  end, same hem and wheel stubs (wheels at x ≈ ±0.38).
- ≤ 1500 triangles per kind.

- [ ] **Step 1: Write the failing tests** in `tests/depotcover.test.mjs`:
  - `coverMesh: both kinds fit the unit footprint and stand on the ground` — every vertex within x,z ∈ [-0.5, 0.5],
    y ∈ [0, 1]; min y === 0, max y within 1e-9 of 1; `indices.length % 3 === 0`, every index < vertex count;
    `colors.length === positions.length`; triangles ≤ 1500.
  - `coverMesh: the car cover has a cabin hump above a lower bonnet and boot` — max y of vertices with x > 0.4 and with
    x < -0.4 is ≤ 0.65, max y with |x| < 0.1 is ≥ 0.95.
  - `coverMesh: the long cover has a flat roof` — every vertex with |x| < 0.3 and |z| < 0.3 has y ≥ 0.95 or y ≤ 0.2
    (roof or underside hem, nothing in between).
  - `coverMesh: wheels are dark, the tarp is not` — vertices with y < 0.1 carry `COVER.wheel`; vertices with y > 0.3 carry `COVER.tarp`.
  - `coverMesh: an unknown kind throws` — `assert.throws(() => coverMesh('boat'), /kind/)`.
- [ ] **Step 2:** `node --test tests/depotcover.test.mjs` → FAIL (module missing).
- [ ] **Step 3:** implement `depotcover.js` (header comment in the style of `depot.js`: `// depotcover.js — #1045: …`).
- [ ] **Step 4:** `node --test tests/depotcover.test.mjs tests/depot.test.mjs` → all pass.
- [ ] **Step 5:** commit `feat(depot): pure car-cover shapes for the far slots (#1045)`.

### Task 2: covers in the depot

**Files:**
- Modify: `index.html` (`import … from './depot.js'` line ~1078, `DEPOT_S` ~7009, `BOX_GONE`/`placeDepot` ~7078–7096,
  the box show/hide ~7140–7150, the `__mm.depot()` slot report ~7158)
- Modify: `tests/test_depot.py` (`test_depot_builds_only_the_nearest_models_and_frees_them`)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `coverMesh(kind)`, `COVER` from Task 1.
- Produces: `__mm.depot().covers` → `{ car: <triangle count>, long: <triangle count> }` (counts of the two shared cover
  geometries; `0` for a kind with no slot), and `DEPOT_S.boxes` becomes `{ car: InstancedMesh|null, long: InstancedMesh|null }`
  with each slot's `(kind, index)` remembered (e.g. `DEPOT_S.boxAt[i] = [kind, index]`).

- [ ] **Step 1: Write the failing test.** In `test_depot_builds_only_the_nearest_models_and_frees_them`, after `d = depot(page)`:
  ```python
  assert d["covers"]["car"] > 12 and d["covers"]["long"] > 12, d["covers"]   # draped covers, not a 12-triangle box (#1045)
  ```
- [ ] **Step 2:** run `-k nearest_models` → FAIL (`KeyError: 'covers'`).
- [ ] **Step 3:** in `placeDepot`, build one `BufferGeometry` per kind from `coverMesh` (`computeVertexNormals()`), one shared
  `MeshLambertMaterial({ vertexColors: true })`, one `InstancedMesh` per kind sized to its slot count; same per-slot matrix as
  today (height from `boxH`/`boxHLong`). The box was symmetric, the cover is not: check that the cover's nose (+x) points the
  same way as the real model's nose in that slot (compare a slot before and after its glTF arrives); fix the rotation if not. Show/hide and `visible` act on both meshes. Report `covers` in `__mm.depot()`.
- [ ] **Step 4:** run `tests/test_depot.py` (whole file, foreground, generous timeout) → all pass; `node --test tests/*.test.mjs` → pass.
- [ ] **Step 5:** CHANGELOG `### Changed`: the far slots of the **vehicle depot** wait under **car covers** instead of grey boxes.
- [ ] **Step 6:** screenshot from the car park entrance (`__mm.sim(740, -107.5, 0, 0, 0.1, [])`, wait for arrival, camera
  looking east) to the session scratchpad for the maintainer to judge the look.
- [ ] **Step 7:** commit `feat(depot): car covers instead of grey boxes on the far slots (#1045)`.
