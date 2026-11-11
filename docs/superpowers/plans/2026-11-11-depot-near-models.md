# Depot: real models near, boxes far (#807) Implementation Plan

**Goal:** the vehicle depot keeps at most 6 real vehicle models alive (nearest slots within 100 m), shows a grey box on
every other slot, and frees real models plus the glTF files it loaded itself when the player drives away.

**Spec:** `docs/superpowers/specs/2026-11-11-depot-near-models-design.md` (measurements, assumptions).

**Architecture:** pure rule `depotWants` in `depot.js`, a new `evict` transition in `gltfvehicle.js` `loadStep`
(both `node --test`); `index.html` glue: `evictVehicleModel` next to `loadVehicleModel` (`index.html:3226`), the depot
block (`index.html:5710-5795`) reworked: box `InstancedMesh`, no fallback build, free + evict.

**Global constraints:**

- Buildless, files in the repo root, no new dependencies, `const`/`let` only, no test edited to go green.
- TDD for the pure modules: failing test, red, implement, green. `node --test tests/*.test.mjs` after each pure task.
- Browser: run **only** `pytest tests/test_depot.py`, in the **foreground**, generous `timeout`, never the full suite.
  Commit and push the branch **before** the Playwright run.
- Never hard-code the slot count (21 today; #830 makes it 20) — read `__mm.carsel().count`.

---

### Task 1: `depotWants` (depot.js)

**Files:** `depot.js`, `tests/depot.test.mjs`

- [ ] **Write the failing test** (append to `tests/depot.test.mjs`):

```js
import { depotWants } from '../depot.js';
const row = (n, x0 = 0, dx = 10) => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, x: x0 + i * dx, z: 0 }));
const cfg = { ...DEPOT, near: 100, nearMax: 3, keep: 130, keepMax: 4 };

test('depotWants: nearest first, within near, capped, never the driven id', () => {
  const w = depotWants(25, 0, row(20), 'v2', cfg);
  assert.deepEqual(w.load, ['v3', 'v1', 'v4']);              // from x 25: v2 driven, v3 5 m, then v1 / v4 15 m in table order (stable sort)
  assert.ok(!w.keep.has('v2'));
  assert.equal(w.keep.size, 4);
});

test('depotWants: nothing beyond near, keep reaches farther than load', () => {
  assert.deepEqual(depotWants(-115, 0, row(3), null, cfg).load, []);       // v0 is 115 m away
  assert.deepEqual([...depotWants(-115, 0, row(3), null, cfg).keep], ['v0', 'v1']);
});
```

- [ ] Run `node --test tests/depot.test.mjs` → red.
- [ ] **Implement** in `depot.js`: extend `DEPOT` with `near: 100, nearMax: 6, keep: 130, keepMax: 8, boxH: 1.5,
  boxHLong: 3`, and

```js
// #807: which slots get a real model: `load` the nearest nearMax within near (nearest first), `keep` the looser set a
// built model may stay in (hysteresis); never the driven vehicle
export function depotWants(x, z, slots, drivenId, cfg = DEPOT) {
  const ranked = slots.filter(s => s.id !== drivenId).map(s => ({ id: s.id, d: Math.hypot(s.x - x, s.z - z) }))
    .sort((a, b) => a.d - b.d);
  const pick = (r, n) => ranked.filter(s => s.d <= r).slice(0, n).map(s => s.id);
  return { load: pick(cfg.near, cfg.nearMax), keep: new Set(pick(cfg.keep, cfg.keepMax)) };
}
```

- [ ] Green; `node --test tests/*.test.mjs` green. Commit `feat(depot): depotWants picks the slots that get a real model (#807)`.

### Task 2: `loadStep` evict (gltfvehicle.js)

**Files:** `gltfvehicle.js:5-10`, `tests/hatchback.test.mjs` (where the `loadStep` tests live)

- [ ] **Failing test:**

```js
test('loadStep: evict sends a ready model back to idle, nothing else', () => {
  assert.equal(loadStep('ready', 'evict'), 'idle');
  for (const s of ['idle', 'loading', 'failed']) assert.equal(loadStep(s, 'evict'), s);
});
```

- [ ] Red, then add `if (state === 'ready' && event === 'evict') return 'idle';` and update the header comment
  (`'ready' --evict--> 'idle'`). Green. Commit `feat(gltf): a ready model can be evicted back to idle (#807)`.

### Task 3: browser test first (tests/test_depot.py)

**Files:** `tests/test_depot.py`

- [ ] Replace `ALL_BUILT` and `test_depot_builds_every_vehicle_and_leaves_the_driven_car_alone` with:

```python
NEAR_BUILT = "() => { const d = window.__mm.depot(); return d.slots.length === window.__mm.carsel().count && d.real === Math.min(6, d.slots.length - 1) && d.slots.every(s => s.model); }"


def test_depot_builds_only_the_nearest_models_and_frees_them(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        before = page.evaluate("() => window.__mm.carStats()")
        gpu0 = page.evaluate("() => window.__mm.gpu()")
        page.evaluate(AT_DEPOT)
        page.wait_for_function(NEAR_BUILT, timeout=240000)
        d = depot(page)
        page.evaluate("() => window.__mm.sim(832.3 - 600, -107.5, 0, 0, 0.1, [])")
        page.wait_for_function("() => window.__mm.depot().real === 0 && window.__mm.depot().cached.length === 0", timeout=T)
        wait_frames(page, 3)
        gpu1 = page.evaluate("() => window.__mm.gpu()")
        after = page.evaluate("() => window.__mm.carStats()")
        b.close()
    me = [s for s in d["slots"] if s["id"] == "compact"][0]
    assert not me["shown"] and not me["solid"], me                       # the driven car's slot is empty
    assert all(s["shown"] and s["solid"] for s in d["slots"] if s["id"] != "compact"), d
    assert sum(s["model"] == "gltf" for s in d["slots"]) == d["real"] <= 6, d
    assert all(s["model"] == "box" for s in d["slots"] if s["model"] != "gltf"), d
    assert gpu1["geometries"] <= gpu0["geometries"] + 5 and gpu1["textures"] <= gpu0["textures"] + 2, (gpu0, gpu1)
    assert after == before, (before, after)
    assert not errors, errors
```

- [ ] `test_parked_paint_ignores_later_repaints`: before `wait_for_function(HYPER_GLTF)`, stand at the hyper's slot so it
  is in the near set: `s = slots_by_id(page)["hyper"]` after `ALL_PLACED`, then `__mm.sim(s.x + cos(th)*(l/2+2), …)` as
  in `board_from_car` (move `slots_by_id` above it). Expectations unchanged.
- [ ] Add: `test_a_depot_evicted_vehicle_loads_again_in_choose_car` — near the hyper until `HYPER_GLTF`, drive 600 m away,
  wait `cached.length === 0`, open `#carbtn`, pick the hyper (`__mm` / the tile as `test_carselect.py` does), Escape,
  wait until `window.__mm.gltfVehicle('hyper').state === 'ready'` and `window.__mm.carsel().id === 'hyper'`
  (`index.html:5173`). Without the `WANTED.delete` in Task 4 the state stays `idle` and this times out.
- [ ] Do not run Playwright yet (the hooks come in Task 4). Commit `test(depot): only the nearest models, freed when away (#807)`.

### Task 4: index.html glue

**Files:** `index.html` (glTF block ~`:3195-3245`, depot block `:5710-5795`)

- [ ] `evictVehicleModel(id)` after `loadVehicleModel`:

```js
// #807: give a cached glTF back: its geometries, materials and their textures (never the shared car env map), out of the
// env and shared material lists, back to idle; WANTED forgets it so Choose car can load it again
function evictVehicleModel(id) {
  const e = GLTF_CARS[id]; if (!e || e.state !== 'ready') return;
  const mats = new Set(); e.scene.traverse(o => { if (!o.isMesh) return; o.geometry.dispose(); for (const m of [].concat(o.material)) mats.add(m); });
  for (const m of mats) { for (const v of Object.values(m)) if (v?.isTexture && v !== m.envMap) v.dispose(); m.dispose(); SHARED_CAR_MATS.delete(m); const i = CAR_ENV_MATS.indexOf(m); if (i >= 0) CAR_ENV_MATS.splice(i, 1); }
  e.state = loadStep(e.state, 'evict'); e.scene = e.mats = e.promise = null; e.tris = 0; WANTED.delete(id);
}
```

- [ ] Depot: `DEPOT_S` gains `boxes: null, owned: new Set(), wants: { load: [], keep: new Set() }`. Import `depotWants`.
- [ ] `buildDepotSlot(s)` — drop the `loadChain` line and the `old`-fallback branch (a slot is built once, only when
  buildable); store `{ mesh, model: 'gltf', paint }`. Solids move to a `placeDepot()` that runs once with the layout and
  also builds the boxes: one `THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x6b7178 }), slots.length)`;
  per slot `i` a matrix from position `(s.x, groundH + h/2, s.z)`, rotation y `-s.th`, scale `(s.l, h, s.w)` with
  `h = s.l > DEPOT.longL ? DEPOT.boxHLong : DEPOT.boxH`; keep the matrices in `DEPOT_S.boxMats[i]`; `scene.add`.
- [ ] `freeDepotSlot(id)`: `scene.remove` + `disposeParked`, `built.delete(id)`; then if `canEvict(id)` →
  `evictVehicleModel(id); owned.delete(id)`. `canEvict = owned.has(id) && id !== CHOICE.id && id !== PENDING_SWAP && car.userData.gltfId !== id && !CARSEL.on`.
- [ ] `requestDepotModel(id)`: if glTF and `gltfState(id) === 'idle'` and not already queued: `owned.add(id)`,
  `loadChain = loadChain.then(() => DEPOT_S.wants.load.includes(id) ? loadVehicleModel(id) : null)`.
  (If skipped, the id stays `idle` and `owned`; clear it from a `DEPOT_S.queued` set in the chain step so it can queue again.)
- [ ] `stepDepot()`: layout + `placeDepot()` on the first visit (as now); then `DEPOT_S.wants = depotWants(P.x, P.z, slots, CHOICE.id)`;
  free every built id not in `wants.keep`; evict owned ids that are `ready`, unbuilt and outside `keep` (a load that
  finished after the player left); for `wants.load` in order: `requestDepotModel(id)`, and build the **first** id that is
  unbuilt and buildable (`!def.gltf || gltfState(id) === 'ready'`) — one build per frame. Boxes: instance hidden (scale 0
  matrix) when driven or built, else its `boxMats[i]`; `instanceMatrix.needsUpdate = true` only on change;
  `boxes.visible = show`. Real meshes and solids: as now.
- [ ] `__mm.depot()`: `model: b ? 'gltf' : DEPOT_S.boxes ? 'box' : null`, plus `real: DEPOT_S.built.size`,
  `cached: [...DEPOT_S.owned].filter(id => gltfState(id) === 'ready')`.
- [ ] Remove orphans (fallback-only paths); update the block's header comment (`index.html:5710-5712`).
- [ ] `node --test tests/*.test.mjs` green. Commit and push, then run in the foreground
  `PW_CDP_ENDPOINT=… pytest tests/test_depot.py` (timeout 1800 s). If a test fails 3 times, stop and report.
- [ ] CHANGELOG `[Unreleased]` (timestamp `TZ=Europe/Zurich date '+%F %H:%M'`): `- \`<ts>\` The **vehicle depot** only parks the nearest cars for real; the far slots
  wait under grey covers until you come close, so weak devices no longer crash there.` Commit
  `fix(depot): real models only for the nearest slots, boxes far, freed when away (#807)`.

### Out of scope (note in the PR)

- `buildCarEnv` on every glTF load (`index.html:3208`, `:3036`) is the likely source of the 4.6 s frame — follow-up issue.
- The Choose car gallery keeping every model (~160 MB) — unchanged.
