# Free the CPU copy of the merged world geometry (#323) — design

## Why now

2026-11-18: a tester opened https://rhyflitzer.ch/ on an iPhone (Safari and Brave). The loading bar reached 100 %,
the page reloaded, about four times, then Safari showed "A problem repeatedly occurred". That is WebKit's message
for a tab its process was killed for, most likely for memory: the loading path never calls `location.reload()`.
#323 measured ~1.1 GB tab memory on 2026-10-14. Target: the tab's ArrayBuffer memory clearly below ~700 MB after the
world is built, without changing what the player sees.

## Measurement (2026-11-18, main `081327a`, full Hochrhein world, GPU browser, 1280×720, after 20 frames)

`performance.memory.usedJSHeapSize` after a forced GC (CDP `HeapProfiler.collectGarbage`) includes ArrayBuffer
backing stores: **1,052 MB**.

Geometry reachable from the scene, by owner (CPU bytes of `geometry.attributes` + index + instance buffers):

| Owner | MB | of which `position` | vertices |
|---|---:|---:|---:|
| `MESH.roadPlain` | 131.0 | 35.7 | 2.98 M |
| `MESH.grass` (terrain) | 130.4 | 35.6 | 2.96 M |
| `MESH.meadow` | 28.5 | 7.8 | 0.65 M |
| `MESH.roadOsm` | 28.1 | 7.7 | 0.64 M |
| `MESH.field` | 18.9 | 5.1 | 0.43 M |
| `MESH.wall` / `stone` / `water` / `plaster` / `rail` / rest | ~28 | ~8 | |
| **all `MESH` roles** | **~365** | **~100** | |
| other meshes (decals, signs, marks, rooms: 1,701 geometries) | 23.0 | 9.2 | |
| forest coarse `InstancedMesh` (instance matrices) | 19.6 | — | |
| forest billboards (283 tiles, instance matrices) | 12.4 | — | |
| `treeBill` (scattered trees) | 0.2 | | |
| **scene total** | **424** | | |

Each merged role has four attributes (`position`, `normal`, `uv`, `color`, 44 bytes per vertex, no index).

The surprise: the module-level `parts` object (`index.html:1724`) still holds all **55,911 source geometries**
the roles were merged from (`index.html:3210`), 365 MB of arrays plus object overhead. Nothing reads it after the
merge.

In-page experiment on the same page (GC between steps):

| Step | usedJSHeapSize |
|---|---:|
| baseline | 1,052 MB |
| `parts` emptied | **630 MB** (−422) |
| + `normal`/`uv`/`color` arrays of every `MESH` role set to `null` | **364 MB** (−266) |
| + `position` arrays nulled too | 265 MB (−99) |

Frames rendered without errors after each step. With `normal`/`uv` nulled, a raycast against a role throws
(`Cannot read properties of null`): three.js r170's `Mesh.raycast` interpolates `uv`/`normal` for every hit.

### Whole-tab picture (same run) and what this fix leaves

| Side | Now | After this fix |
|---|---:|---:|
| JS heap objects (CDP `JSHeapUsedSize`: colliders, lists, layout) | ~250 MB | ~250 MB (less: 55,911 geometry objects go) |
| ArrayBuffers on the CPU | ~800 MB | ~115 MB |
| GPU vertex/instance buffers (same bytes as the uploaded attributes) | ~424 MB | ~424 MB |
| GPU textures (282 textures on scene materials, w×h×4, +1/3 for mipmaps) | ~131 MB | ~131 MB |
| framebuffer 1280×720 with MSAA (on an iPhone: CSS size × pixel ratio, capped at 1.5) | ~30 MB | ~30 MB |
| shadow maps (Original style draws none; Smooth: one 2048² map) | 0 (16 MB) | same |
| **sum** | **~1.6 GB** | **~0.95 GB** |

Per frame: 3.75 M triangles, 843 draw calls. On a phone CPU and GPU share one RAM, so both columns count. This fix
removes ~0.7 GB; what remains is dominated by the GPU copy of the merged roles (424 MB, `roadPlain` alone 131 MB
for 2.98 M vertices, more than the terrain) and textures (131 MB). Those are the next levers, as separate issues.

Validated in-page on the full world (2026-11-18): the position-only pick proxy plus `onUpload` dropping gave 365 MB,
`topAt`/`rayHits`/`beamPick` returned the same hits as before, and switching Smooth → Original drew without errors.
Nulling arrays *before* their first upload instead crashed the style switch (`reading 'byteLength'`): a role first
drawn later (e.g. by the shadow pass) must still have its array, which `onUpload` guarantees.

## CPU readers of the merged vertex data

- `beamPick` (`index.html:7723`) raycasts `BEAM_ROLES` (`grass`, `field`, `meadow`, `road`, `roadOsm`, `roadPlain`).
- Test hooks raycast roles: `topAt` (all roles, `:5656`), `rayHits` (`:5704`), `waterVisible` (`:5641`), `bed`
  (`:5644`), `sinkCheck` and its sibling (`:5728`, `:5731`), `wallHits` (`:5637`), the field check (`:5718`).
  None read `hit.uv`, `hit.normal` or `hit.face`: they use `point`, `distance`, `object`.
- `applyStyle` (`:3812`) swaps materials only. A new program binds the already uploaded GL buffers; no array read.
- Colliders (`OBB`, `addOBB`), the minimap and the editor are built from layout data, never from `MESH` geometry.
- `test_rebuilds_free_gpu_memory` concerns vehicle rebuilds, not the world.
- No `webglcontextlost` handling exists (context loss is not recovered today either).

## Design

1. **Release `parts` after the merge.** In the merge loop at `index.html:3210`, `delete parts[role]` once its mesh is
   built. All writes to `parts` happen before that line.
2. **Drop the non-position arrays after upload.** For each `MESH` role, `normal`, `uv`, `color` (every attribute but
   `position`) get `attribute.onUpload(dropArray)` with `function dropArray() { this.array = null; }`, the pattern
   from the three.js docs. Upload happens on the first frame that draws the mesh; the GPU copy stays.
3. **Keep `position`** for every role, and raycast against a **position-only pick geometry** that shares the same
   `position` attribute and bounding volumes: `mesh.raycast` is overridden to swap `this.geometry` to the pick
   geometry around `THREE.Mesh.prototype.raycast`. Hits keep `object` = the role mesh.
4. A read-only hook `window.__mm.cpuGeometry()` reports retained bytes for the test.

Expected: ~1,050 → ~365 MB ArrayBuffer-inclusive heap on the full world (−65 %).

### Rejected

- Nulling `position` too (−99 MB more): breaks every raycast; would need a separate CPU height source. Not worth it.
- Per-tile merging (#323 to-do 4): frame rate, not memory; own issue if phone numbers demand it.
- Freeing forest/tree instance buffers: 32 MB, read by nothing at runtime, but the LOD rebuild path and #211 are
  close by. Not worth the risk for 3 % of the total.

## Out of scope

Real-phone measurement (#323 to-do 3) stays a manual follow-up after deploy; per-tile merge; the forest.
