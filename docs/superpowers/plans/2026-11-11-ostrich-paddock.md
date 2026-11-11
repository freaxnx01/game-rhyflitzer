# Ostrich Paddock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A post-and-rail fence on the LWB pasture parcel of the Straussenfarm Sisseln with eight code-built ostriches inside that stand, peck, walk and flee from the player, shown only near the farm.

**Architecture:** Pure module `ostriches.js` (outline, posts, gate, `inPaddock`, deterministic flock step) + glue in `index.html` (one merged fence mesh, four `InstancedMesh` parts, `addSolid` runs, `stepOstriches`, `window.__mm.ostriches`), the depot/fish split. A J entry in `landmarks.js`.

**Tech Stack:** vanilla ES modules, three.js (`InstancedMesh`, `mergeGeometries`), node `--test`, Playwright (python).

**Spec:** `docs/superpowers/specs/2026-11-11-ostrich-paddock-design.md` (outline table, colours, sizes, timings: copy values from there).

## Global Constraints

- Hochrhein world only: `REGION.id === 'hochrhein' && !REGION.generated`.
- No file asset, no credit; all geometry from three.js primitives; `MeshLambertMaterial({ vertexColors: true })`.
- Fence solids via `addSolid`, runs <= 4 m, registered after the tree scatter; never `addOBB`.
- Show radius 350 m from (2380, -422); beyond it nothing is simulated.
- Outline vertices A–O exactly as in the spec (J/K at x 2404.5).
- CHANGELOG entry hand-written with `TZ=Europe/Zurich date '+%F %H:%M'`.
- Run Playwright in the foreground; commit and push before the browser test.

## Review Focus

1. A bird driven into a corner by the player must stand, never cross the fence (Task 1 corner test).
2. `dt` spikes (loop clamps at 0.05 s) must not teleport a fleeing bird through the inset (Task 1 big-dt test).
3. The gate run collides like a fence: the car stopped by the gate leaf (Task 2 solid count includes the gate).
4. `free()` must reject tree candidates inside the paddock but not the farmyard (Task 1 `inPaddock` farmyard point).
5. Pause: `stepOstriches` sits inside the stepped branch of `loop`, so `PAUSE.on` freezes the birds like everything else (loop structure, no test).

---

### Task 1: `ostriches.js` pure module

**Files:** Create `ostriches.js`, `tests/ostriches.test.mjs`.

**Interfaces (Produces):**
- `export const OSTRICH = { show: 350, centre: [2380, -422], count: 8, flee: 25, calm: 45, fleeSpeed: 6, walkSpeed: 1.2, apart: 2, inset: 1, postGap: 4, postH: 1.8, rails: [0.55, 1.1, 1.65], gate: { edge: ['F', 'G'], fromEnd: 6, width: 4 } }`
- `export const PADDOCK = [[2376.9, -321.1], ...]` (A–O, clockwise, no repeated closing point).
- `export function inPaddock(x, z, pad = 0)` → boolean (even-odd via `inPoly` from `walkways.js`; `pad > 0` also true within `pad` m of any edge, `pad < 0` requires the point to be that far inside).
- `export function fencePosts()` → `{ posts: [[x, z], ...], runs: [{ a: [x, z], b: [x, z], gate: false }, ...] }` — a post at every vertex, then every `postGap` along each edge (last gap shorter), runs between consecutive posts; the gate opening on edge F-G, its east end `fromEnd` m from G: the run across it has `gate: true` (a 4 m run, both ends taller posts).
- `export function makeFlock(seed, heightAt)` → `{ t: 0, birds: [{ x, z, yaw, state, timer, target, male, phase, neck, legL, legR, bob }] }` — 8 birds in the south half (z > -440), >= 4 m apart, 3 males (indices 0–2).
- `export function stepFlock(flock, dt, player, rnd)` → mutates in place; `player = { x, z }`; `rnd` the seeded `rng` function. Implements the state table (stand/peck/walk/flee, timings and speeds from the spec), the flee escape (±60°, ±120°, else stand), the 2 m pairwise push, the inset test on every move, stride phase → `legL`/`legR` (± 0.45 rad), `neck` (0..1.35 rad), `bob` (±0.04).
- `export function paddockEntry()` → `{ name: 'Straussenfarm Sisseln', gemeinde: 'Sisseln', at: [2345, -318], look: [2385, -400] }`.

- [ ] **Step 1: write the failing tests** in `tests/ostriches.test.mjs` (node:test, `assert/strict`; imports `rng` from `../world.js`):
  - `outline`: 15 vertices, `PADDOCK[0]` equals A `[2376.9, -321.1]`, no vertex repeated, shoelace area between 18 000 and 22 000 m² (about 2 ha).
  - `inPaddock`: `(2380, -450)` true; stable `(2392, -345)` false; road `(2400, -314)` false; farmyard `(2350, -340)` false; `inPaddock(2376.9, -321.1, 1)` true (edge pad).
  - `fencePosts`: every consecutive post pair on an edge <= 4.01 m apart; every vertex is a post; exactly one run with `gate: true`, its length 4 ± 0.05 and its midpoint within 10 m of G; `runs.length > 100`.
  - `makeFlock`: 8 birds, all `inPaddock(x, z, -1)`, all `z > -440`, pairwise distance >= 4, `birds[0..2].male === true`, two calls with seed 7 give identical positions.
  - `flock stays inside for 60 s with a player circling inside`: step 0.016 s, player on a circle radius 30 around (2380, -450); after every step every bird `inPaddock(x, z, -OSTRICH.inset + 0.01)`.
  - `bird flees`: player 10 m from bird 0 → after one 0.1 s step `state === 'flee'`, distance after 1 s > distance before; after player moved 60 m away and 7 s, state !== 'flee'.
  - `corner`: bird at (2378, -323) (corner A), player at (2390, -340) → after 2 s still inside, state in `['flee', 'stand']`.
  - `big dt`: `stepFlock(flock, 0.05, player, rnd)` x 200 while fleeing: always inside.
  - `walk animates legs`: a bird in `walk` for 0.5 s has `legL !== 0` and `legL === -legR` within 1e-9; a standing bird has `legL === 0`.
- [ ] **Step 2:** `node --test tests/ostriches.test.mjs` → fails (module missing).
- [ ] **Step 3:** implement `ostriches.js` as in Interfaces. Stand/peck/walk transition weights 0.4/0.35/0.25 drawn from `rnd()`; walk target = seeded point with `inPaddock(x, z, -3)` (retry up to 20 times); state timers from the spec ranges.
- [ ] **Step 4:** `node --test tests/ostriches.test.mjs` → PASS.
- [ ] **Step 5:** commit `feat(world): ostrich paddock rules (#846)`.

### Task 2: fence, birds and culling in `index.html`

**Files:** Modify `index.html` (import block near line 927; `free()` at 1656; world build after the tree scatter, ~2650; a `stepOstriches` next to `stepDepot`/`stepFish` in `loop` at ~6479; `window.__mm.ostriches` near `window.__mm.depot`), `tests/test_ostriches.py`, `tests/test-map.json`.

**Interfaces:**
- Consumes Task 1 exports; `terrainH(x, z)`, `addSolid(o)`, `mergeGeometries`, `rng`, `P`, `REGION`, `PAUSE`.
- Produces `window.__mm.ostriches()` → `{ on, visible, count, solids, birds: [{ x, z, state, inside }] }`.

- [ ] **Step 1: write the failing Playwright test** `tests/test_ostriches.py` (pattern of `tests/test_depot.py`, real `world_hochrhein.json`, terrain `.mmh` 404'd, `wait_frames` from `test_carselect`; skip if the world file is missing):
  - `test_paddock_built`: `__mm.ostriches()` has `count == 8`, `solids > 100`, every bird `inside`.
  - `test_shown_only_near_the_farm`: `__mm.place(2345, -318, 1.5)` + `wait_frames(page, 3)` → `visible` true; `__mm.place(1500, 400, 0)` + 3 frames → false.
  - `test_birds_flee_from_the_car`: read bird 0, `__mm.place(b.x + 8, b.z, 0)`, `wait_frames(page, 120)` → bird 0 `state == 'flee'` at some polled frame (poll every 10 frames) and its distance to the car grew.
  - `test_fence_stops_the_car`: `__mm.sim(2405, -300, -Math.PI/2, 15, 2, [])` (from the road, northbound into the A-B side at z -321.1) → `__mm.car().z > -321` (the fence holds the car on the road side).
  - `test_jump_list_has_the_farm`: open J, the list contains `Straussenfarm Sisseln` under Sisseln (reuse the helper in `tests/test_jump.py`).
- [ ] **Step 2:** run `python -m pytest tests/test_ostriches.py -x` in the foreground → fails (`__mm.ostriches` undefined).
- [ ] **Step 3: glue.** `import { OSTRICH, PADDOCK, inPaddock, fencePosts, makeFlock, stepFlock } from './ostriches.js'`. `free()`: add `if (OSTRICHES_ON && inPaddock(x, z, rad + 1)) return false;` after the `inYard` test. Build function `buildPaddock()` after the forest trees block: fence geometry (posts `BoxGeometry(0.12, postH, 0.12)` at `terrainH`, rails `BoxGeometry(len, 0.06, 0.08)` between post tops, colours `#6b4a2a` / `#8a6a44`, gate posts 2.0 m and leaf `#9a7a50` with a diagonal), merged into one `Mesh`, `castShadow = true`, `scene.add`; one `addSolid({ x, z, hw: len / 2, hd: 0.1, c, s, h })` per run (gate included). Four `InstancedMesh(…, 8)`: `body`, `neck`, `legL`, `legR` built as in the spec, `setColorAt` per bird, `frustumCulled = false`. `OST = { on, group, parts, flock: makeFlock(31, terrainH), rnd: rng(31), visible: true }`.
- [ ] **Step 4:** `function stepOstriches(dt)`: return if `!OST.on`; `d = hypot(P.x - centre.x, P.z - centre.z)`; `show = d < OSTRICH.show`; set `visible` on the fence mesh and the four parts; if `!show` return; `stepFlock(OST.flock, dt, { x: P.x, z: P.z }, OST.rnd)`; for each bird compose body (`y = terrainH + 1.1 + bob`, yaw), neck (translate to body front, rotate pitch), legs (hip pivot, swing) into `setMatrixAt`; `instanceMatrix.needsUpdate = true`. Call it in `loop` next to `stepFish(dt)` in both branches. `window.__mm.ostriches = () => ({ on: OST.on, visible: OST.visible, count: 8, solids: OST.solids, birds: OST.flock.birds.map(b => ({ x: b.x, z: b.z, state: b.state, inside: inPaddock(b.x, b.z, -0.5) })) })`.
- [ ] **Step 5:** `landmarks.js`: insert `{ name: 'Straussenfarm Sisseln', gemeinde: 'Sisseln', at: [2345, -318], look: [2385, -400] }` after `Volg Sisseln` (line 53). `tests/test-map.json`: add `"ostriches.js": ["test_ostriches.py"]` and `test_ostriches.py` to `landmarks.js`.
- [ ] **Step 6:** commit and push, then `python -m pytest tests/test_ostriches.py tests/test_jump.py -x` in the foreground → PASS; `node --test tests/` → PASS.
- [ ] **Step 7:** `CHANGELOG.md` `[Unreleased]` → `### Added`, newest first: `` - `<TZ=Europe/Zurich date '+%F %H:%M'>` A **fenced paddock** with eight **ostriches** at the Straussenfarm in Sisseln: they stand, peck and walk, and run off when the car or the walker comes close. <kbd>J</kbd> lists the farm. ``
- [ ] **Step 8:** commit `feat(world): fenced ostrich paddock at the Straussenfarm Sisseln (#846)`, push, open the PR.
