# Hideout tests red on main (#906) Implementation Plan

**Goal:** `tests/test_hideout.py` green on main again: church GLB filter, cave look pre-compiled for late models, steady T1 hover.

**Architecture:** one helper + small edits in `index.html`; test-only edits in `tests/test_hideout.py`.

**Spec:** `docs/superpowers/specs/2026-11-12-hideout-tests-red-on-main-design.md`

## Global Constraints

- Never weaken a test: every existing assertion stays, only the inputs / filters named below change.
- Run Playwright foreground, targeted, on the GPU browser, under a cap:
  `PW_CDP_ENDPOINT=http://192.168.1.120:9223 systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest -q <test>`.
  Never the whole file (~2 h) and never `run_in_background`.
- Add a `CHANGELOG.md` `[Unreleased]` line only if the cave hitch fix is player-visible: "Beim ersten Einfahren in den Berg
  ruckelt das Bild nicht mehr kurz." (Fixed).

## Task 1: Cave look compiled for late models (index.html)

**Files:** `index.html` (3 places).

- [ ] Step 1: reproduce. Add (temporarily, do not commit) `window.__mm.programList = () => renderer.info.programs.map(p => ({ id: p.id, name: p.name }));` after `window.__mm.renderInfo` (line ~5426). In a scratch test, read it after the start and again after the cave entry as in `test_cave_mode_toggles_and_restores`; expect 107 -> 115 with new names Trim, Plate, Plain_7, Glass x3, Display and an unnamed lambert.
- [ ] Step 2: after `const GLTF_CARS = {};` (line 3513) add:

```js
let LOOKS_READY = false;   // #906: set after the start pre-compile; a model that arrives later compiles its own cave look (compileLooks)
```

- [ ] Step 3: in `loadVehicleModel` (line 3555), right after `e.scene = gltf.scene; prepareGltfScene(e, e.scene, def); e.state = loadStep(e.state, 'loaded');` add:

```js
      compileLooks(e.scene);   // #906: its programs in the cave look too, so the first cave entry costs no hitch
```

- [ ] Step 4: replace the pre-compile line `if (CAVE_MODE.group) { setCave(true, 1); renderer.compile(scene, camera); setCave(false); renderer.compile(scene, camera); }` (line 7319) and the landmark warm-up block that follows it (lines 7320-7329) by:

```js
{ // #734: the ch-landmarks' program is pre-warmed too. Their meshes load async (#649: the start does not wait) and every one gets
  // the same vertex-coloured double-sided lambert, so the program is the same -- compiled once here, in both looks (#906), a landmark's
  // first sight mid-drive costs no hitch (and no program the load did not already have).
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  const warm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  scene.add(warm);
  if (CAVE_MODE.group) { setCave(true, 1); renderer.compile(scene, camera); setCave(false); }
  renderer.compile(scene, camera); scene.remove(warm);
  LOOKS_READY = true;
}
// #906: a model that arrives after the start compiles in both looks, as the start pre-compile does for what is there then (the vehicle
// glTFs load async: the hatchback and the Postauto bus showed up as 7 new programs on the first cave entry). Only on the surface in the
// plain day look -- mid-fade or below ground the look is not ours to flip; the programs then compile on first sight as before.
function compileLooks(root) {
  if (!LOOKS_READY) return;
  const flip = CAVE_MODE.group && !CAVE_MODE.on && CAVE_MODE.k === 0 && LEVELS.isSurface();
  try {
    if (flip) setCave(true, 1);
    renderer.compile(root, camera, scene);
    if (flip) { setCave(false); renderer.compile(root, camera, scene); }
  } catch (err) { console.warn('pre-compile of a late model failed', err); }
}
```

  Keep the existing `__mm.sim` assignment comment/order below unchanged (sim stays the readiness gate, after `LOOKS_READY`).
- [ ] Step 5: verify: `-k test_cave_mode_toggles_and_restores` (green; with the temporary probe, programs equal before and inside). Remove the probe.
- [ ] Step 6: verify nothing else moved: `-k "test_t1_fades or test_village_names_hidden"` and the node tests
  `node --test tests/*.test.mjs` for any file touching hideout/chlandmarks.

## Task 2: Church GLB filter (tests/test_hideout.py)

**Files:** `tests/test_hideout.py`.

- [ ] Step 1: near the top (after `HEADING`) add a helper:

```python
LANDMARKS = ROOT / "assets" / "landmarks" / "index.json"   # surface landmarks load at boot, async, 2-6 KB each (#649, index.html loader)


def room_glbs(urls):
    """The fetched .glb urls minus the surface landmarks (assets/landmarks/<name>.glb, listed in index.json): they stream in at boot
    and the last one can land after a test's request listener is attached (#906). Any other model still counts."""
    names = {lm["file"] for lm in json.loads(LANDMARKS.read_text(encoding="utf-8"))["landmarks"].values()}
    return [u for u in urls if not any(u.endswith("/assets/landmarks/" + n) for n in names)]
```

  (add `import json` to the imports.)
- [ ] Step 2: `test_eiffel_model_loads_lazily_and_matches_the_feet` (line 554): line 563 `requests == []` -> `room_glbs(requests) == []`; line 565 wait for `r.name.endsWith('eiffel_tower.glb')` instead of any `.glb`; line 573 -> `rg = room_glbs(requests); assert len(rg) == 1 and rg[0].endswith("/assets/models/eiffel_tower.glb"), requests`.
- [ ] Step 3: the three assertions `[u for u in requests if not u.endswith("/eiffel_tower.glb")] == []` (lines 1214, 1244, 1387: artemis, rally hall, ferris) -> `[u for u in room_glbs(requests) if not u.endswith("/eiffel_tower.glb")] == []`. Keep their comments, add "surface landmarks excluded by room_glbs (#906)". Line 1505 may use `room_glbs` too but is already green; leave it.
- [ ] Step 4: verify (foreground, each separately or one `-k` expression): the four named tests: `test_eiffel_model_loads_lazily_and_matches_the_feet`, `test_artemis_room_builds_the_rocket_and_capsule_on_entering_without_a_download`, `test_rallyhall_room_builds_the_hall_and_three_cars_on_entering_without_a_download`, `test_ferris_room_builds_the_turning_wheel_on_entering_without_a_download`.

## Task 3: Steady T1 hover (tests/test_hideout.py)

**Files:** `tests/test_hideout.py` (`T1_STEP` line 889, hover line 913).

- [ ] Step 1: `T1_STEP` takes an optional speed: `async ({x, z, th, v = 3}) => { window.__mm.place(x, z, th); window.__mm.sim(x, z, th, v, 0.05, [], window.__mm.car().y);` (rest unchanged).
- [ ] Step 2: hover rows pass `"v": 0`: `page.evaluate(T1_STEP, {"x": ..., "z": ..., "th": HEADING, "v": 0})`. All assertions unchanged.
- [ ] Step 3: verify under load, as CI sees it: run the test with a CPU throttle by adding (scratch only, not committed) `page.context.new_cdp_session(page).send("Emulation.setCPUThrottlingRate", {"rate": 8})` right after `open_page`; before the fix hover has `{False, True}` (row s 41.47 -> 42.03), after the fix it passes. Then the normal run is green.

## Review Focus

- `compileLooks` must never leave `CAVE_MODE` flipped: every `setCave(true, 1)` is followed by `setCave(false)` in the same call.
- `LOOKS_READY` is false until the start pre-compile finished (no TDZ on `camera`/`scene`).
- No assertion in tests was removed or loosened; the only changes are the landmark filter and `v = 0` on the hover.
