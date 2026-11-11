# Vehicle depot: real models only near, cheap boxes far (#807) — design

**Issue:** #807 — the vehicle depot (#553, PR#787) crashes the tab on a weak GPU (`gpu-odroid`, Intel UHD Jasper Lake)
in `test_depot_builds_every_vehicle_and_leaves_the_driven_car_alone`.

## Measurement (2026-11-11, GPU browser, AMD Vega 11, current `main` 8836d8f)

Script: connect over CDP to the GPU browser, block terrain + world JSON (like `tests/test_depot.py`), start, then
`__mm.sim(832.3, -107.5, …)` (the depot centre) and sample `__mm.gpu()`, `performance.memory.usedJSHeapSize`,
`__mm.depot()` and the `console.info` model log every 2 s.

| | geometries | textures | JS heap |
|---|---|---|---|
| before the depot | 277 | 62 | ~114 MB |
| 21 slots placed (9 glTF, rest fallbacks), t+7.8 s | 584 (peak) | 86 | ~181 MB |
| all 21 real, t+25 s | ~501 | 90 | ~267 MB |
| driven 600 m away afterwards | 502 | 90 | ~272 MB |

- **glTF loads:** 19 files, strictly one after another, 12.2 MB on disk, ~496k triangles in the cache, 25 s from arrival
  to the last model (per file 0.5–4.9 s; wobbler 4.9 s, knight 2.6 s).
- **Frame times during the build:** 178 frames in 28.5 s (~6 fps), 49 frames over 100 ms, **one frame of 4.6 s**. Idle at
  the depot afterwards: max 203 ms.
- **Nothing is ever freed:** 600 m away the counters stay at the peak. The glTF cache (`GLTF_CARS`, `index.html:3195-3200`)
  keeps every scene, its materials stay in `CAR_ENV_MATS` and `SHARED_CAR_MATS` (`index.html:3207`), and the parked
  meshes stay in the scene, only hidden (`index.html:5768-5784`).
- **Crash itself:** only reproducible on the `gpu-odroid` runner, which is not reachable from agent-dev. The GPU
  browser (Vega 11) survives. The plan is based on the measured growth: everything above scales with the number of real
  models alive at once, and the current code makes that number "all of them, forever".

Code that builds the depot (`main` 8836d8f):

- `depot.js:7` — `DEPOT` (build 400 m, show 300 m); `depot.js:28-42` `depotLayout`.
- `index.html:5713` `DEPOT_S`; `index.html:5744-5766` `buildDepotSlot` — chains `loadVehicleModel` for every glTF slot
  (`:5746`), builds the stage car twice per slot (`withStageVehicle`, `index.html:5670-5678`), deep-clones its materials.
- `index.html:5768-5784` `stepDepot` — on the first visit within 400 m, builds every slot (one per frame), first as the
  fallback, then again as the glTF once its file is in (`:5775`).
- `index.html:3226-3243` `loadVehicleModel`; `index.html:3204-3209` `prepareGltfScene` (adds every file's materials to
  `CAR_ENV_MATS` and re-runs `buildCarEnv`, which sets `needsUpdate` on all of them).
- `gltfvehicle.js:5-10` `loadStep` — `ready` is sticky, there is no way back.

## Design

Confirmed direction: **"Nah echt, fern billig"** — real glTF only for the nearest slots, a cheap placeholder for the
rest, freed again when driving away.

1. **Pure rule in `depot.js`:** `depotWants(x, z, slots, drivenId, cfg)` returns `{ load, keep }`:
   - `load` — ids of the slots within `cfg.near` (100 m) of the player, nearest first, at most `cfg.nearMax` (6), never
     the driven id.
   - `keep` — the same with the looser `cfg.keep` (130 m) and `cfg.keepMax` (8): a real model is freed only when it
     leaves `keep`, so standing on a boundary does not build and free every frame.
2. **Placeholders:** one `THREE.InstancedMesh` (unit `BoxGeometry`, one `MeshLambertMaterial`, a grey tarp colour) with
   one instance per slot, sized `l × h × w` (h = 1.5 m, 3 m for long vehicles `l > DEPOT.longL`). An instance is
   hidden (zero scale) when its slot is the driven one or holds a real model. One geometry and one material for all
   slots, so their cost does not grow with the slot count. The whole mesh is hidden beyond `DEPOT.show`.
3. **Real models:** each frame `stepDepot` builds at most one real model: the first `load` id that is buildable now
   (non-glTF, or glTF `ready`). A glTF id that is still `idle` is put on the one-at-a-time `loadChain`; the chain step
   skips the load when the id has left `load` by the time it is its turn. **No fallback build any more** — the box
   stands in while the file loads.
4. **Freeing:** a real model whose id is not in `keep` is removed and `disposeParked` (as now). If the depot itself
   started that file's load (`DEPOT_S.owned`) and nothing else uses it, the cache entry is evicted:
   `evictVehicleModel(id)` disposes the cached scene's geometries, materials and their textures (never the shared car
   env map), removes the materials from `CAR_ENV_MATS` and `SHARED_CAR_MATS`, resets the entry to `idle` via a new
   `loadStep('ready', 'evict') → 'idle'` and deletes the id from `WANTED`.
   "Nothing else uses it" = not `CHOICE.id`, not `PENDING_SWAP`, not the built car (`car.userData.gltfId`), and the
   Choose car screen is closed (`CARSEL.on` false; its gallery loads every model anyway).
5. **Solids** stay as now: one per slot, created when the layout is made.
6. **Test hook:** `__mm.depot()` reports per slot `model: 'gltf' | 'box'` (`'gltf'` = a real model, also for the
   procedural compact) and adds `real` (count of real models) and `cached` (owned ids still `ready`).

## Acceptance criteria

- At the depot at most `DEPOT.nearMax` (6) real vehicle models exist at once; every other slot shows a box.
- The nearest slots get their real model (glTF or procedural) one per frame, nearest first; no fallback model is
  built for a glTF vehicle in the depot.
- Driving more than 130 m from a real model frees it; 600 m away the GPU counters return to within 5 geometries and 2
  textures of their value before the depot, and the depot-loaded glTF ids are back to `idle`.
- The driven vehicle, a pending swap and the open Choose car screen are never evicted from under the player.
- A depot-evicted vehicle picked later in Choose car loads again (its id is no longer in `WANTED`).
- Boarding, solids, prompts, the J row and parked paint behave as before.

## Assumptions

- **A0** [confirmed] Direction: "Nah echt, fern billig": first measure what runs out; then load the real glTF only for
  the nearest depot slots (~100 m), show far slots as a cheap placeholder, and free them again when driving away.
- **A1** [med] **A count cap (`nearMax` 6) on top of the 100 m radius.** The strip is 130 m long
  (`depot.js:7`), so from its centre every slot lies within ~66 m: a radius alone would still build all 20 at the jump
  point and the centre, i.e. no reduction where the crash happens. Rejected: radius only (measured peak unchanged);
  a smaller radius (30 m) instead of a cap (the J jump lands 62 m from the centre, `index.html:4234`, and rows of short
  cars would still put 10+ in range).
- **A2** [med] **Placeholder = a grey box per slot (one InstancedMesh), 1.5 m / 3 m high.** Rejected: the procedural
  fallback car (what grows today: geometries per slot), a low-poly copy of each glTF (needs new assets), nothing at all
  (an empty car park from afar reads as a bug).
- **A3** [high] **Evict the glTF cache only for files the depot itself loaded.** Rejected: evicting any cached model
  (would throw away the driven car's or the gallery's) and never evicting (heap and GPU stay at the peak, measured).
- **A4** [high] **Hysteresis by a looser keep set (130 m / 8).** Rejected: one radius (build/free flicker on the edge).
- **A5** [med] **The test that waited for all 21 models is replaced** by one that checks the cap and the release
  (`__mm.gpu()` before / at / away from the depot). It runs on the GPU browser and on SwiftShader as before; the odroid
  runner is not reachable locally, so its pass is confirmed only by the PR's CI.
- **A6** [high] **No change to `buildCarEnv`.** The 4.6 s frame most likely comes from re-running it on every load
  (`index.html:3208`, `:3036`); with ≤6 loads per visit that cost shrinks with this change. A separate fix is a discovery
  for a follow-up, not this issue.

## Consequences

- From the depot entrance you see grey boxes on most slots; real cars appear as you get within 100 m, nearest first,
  about one file per 0.5–5 s on the GPU browser.
- Leaving and coming back reloads the evicted files (network + parse again); a phone pays that on every visit.
- After the Choose car gallery has loaded every model (~160 MB), the depot evicts nothing it did not load itself, so
  that peak stays as before.
- Depends loosely on #830 (Speedster leaves the depot, 21 → 20 slots) and #831 (DeLorean becomes a glTF): neither
  changes this design; tests read the slot count from `__mm.carsel().count` and must not hard-code 21. Both touch
  `tests/test_depot.py` / the depot block in `index.html`, so expect a merge conflict if they land in parallel.
