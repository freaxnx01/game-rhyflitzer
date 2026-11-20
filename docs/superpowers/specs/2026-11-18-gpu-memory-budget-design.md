# Cut the GPU memory of the merged world (#1065) — design

## Why

An iPhone 15 Pro Max reloads rhyflitzer.ch until Safari gives up (2026-11-18): iOS kills the WebKit tab for memory.
#323 (PR#1066) frees the CPU copies; on a phone the GPU side counts against the same RAM and is untouched by it.
Goal: cut the GPU bytes of the merged roles and the textures, with nothing a player can see changing.

## Measurement (2026-11-18, main `8a71247`, full Hochrhein world, GPU browser over CDP, 1280×720, Original style)

WebGL `bufferData` tally of the tab: **369 MB** of GPU buffers; the merged `MESH` roles are **348 MB** of it
(`renderer.info`: 3.75 M triangles, 843 calls). Every role is **non-indexed** with four Float32 attributes,
44 bytes per vertex: `push` turns every indexed source into a non-indexed copy (`index.html:1729`), and the terrain
is stored the same way (`parts.grass = [ground.toNonIndexed()]`, `:2571`, cut patches `:2584`).

### Why `roadPlain` has 2.98 M vertices

Instrumented `push` (caller → vertices):

| Source | calls | vertices now | vertices of the indexed source |
|---|---:|---:|---:|
| `disc()` junction / road-end discs (`:1855`, called from `:2633`, `:2634`) | 10,333 | **2,603,916** | 619,980 |
| `parkingMeshes` car parks, 5 m subdivided (`:2397`) | 468 | 373,053 | (non-indexed) |

A disc is `RingGeometry(0, r, 14, 3)`: 60 vertices, 84 triangles (14 of them degenerate at the centre), so
`toNonIndexed` makes 252 vertices of it. Road strips are a different role (`roadOsm`). Nothing is wrong with the
disc count itself (one per road end and junction); the waste is the de-indexing.

### Exact duplicates per role (hash of all attributes per vertex, in-page)

| Role | vertices | unique | now MB | indexed MB (Uint32 index) |
|---|---:|---:|---:|---:|
| `roadPlain` | 2,976,972 | 554,885 | 124.9 | 34.6 |
| `grass` (terrain) | 2,964,240 | 524,093 | 124.4 | 33.3 |
| `roadOsm` | 637,932 | 219,942 | 26.8 | 11.7 |
| `meadow` / `field` | 1,075,782 | 1,018,596 | 45.2 | 46.9 (no gain) |
| all roles | 7.92 M | | **348.4** | **141.1** |

Hashing at load takes 3.0 s (`roadPlain`) and 4.5 s (`grass`) on the desktop GPU browser, far too slow for a phone.
Keeping the index the sources already have gets most of it for free: `grass` ~0.53 M, `roadPlain` ~0.99 M vertices.

### Attribute formats

`normal` and `color` are Float32×3 (24 of the 44 bytes). In-page experiment: every role's `normal` → Int8×4
normalized and `color` → Uint8×4 normalized (alpha 255): 190 → 63 MB, no errors, screenshot diff after vs before
mean 0.01 / max 19 of 255 on 161 pixels, smaller than the frame-to-frame noise of the unchanged scene (mean 0.16,
8,586 pixels > 2). `uv` must stay Float32: values reach ±1,397 (`roadPlain`), 964 (`water`), where Float16 steps are
0.5–1 texel tiles. `position` stays Float32 (world metres, and #323's raycasts read it).

Four components, not three: Metal (WebKit's ANGLE backend on iOS) wants 4-byte vertex strides; a 3-byte stride is
converted into a second buffer, which would add memory instead of saving it.

### Textures

281 textures on scene materials, ~122 MB if all are uploaded (w×h×4 + mipmaps); 141 uploaded right after start, the
rest when first seen. 107 are **pixel-identical** copies (`toDataURL` compare), 39 MB:

| Source | extra copies | MB |
|---|---:|---:|
| bus stop sign `stopSignTex` (`:2465`), same stop in both directions | 26 | 21.1 |
| car park "P" board `textTex('P', …)` (`parkingSign`, `:2412`) | 36 | 12.0 |
| timetable sheet `timetableTex` (`:2468`) | 41 | 5.1 |
| car park name plate (`:2414`), same name | 3 | 0.8 |

None of these is ever disposed (`disposeGroup`, `:4056`, only frees ring rooms). Street names are already cached
per name (`nameTex`, `:2543`).

## Design

1. **Keep indices.** `push` keeps an indexed source indexed (a `clone()`, so `parts` still holds a private copy as
   `toNonIndexed` did); the terrain and its cut patches go in indexed. A new `mergeRole(list)` replaces
   `mergeGeometries(parts[role], false)` in the merge loop: if indexing the role saves bytes it gives the non-indexed
   parts an identity index and merges indexed, else it merges non-indexed as today. Lossless.
2. **Compact formats.** `mergeRole` then rewrites `normal` as Int8×4 and `color` as Uint8×4 (normalized), and stores
   the role's GPU byte count in `geometry.userData.gpu` (the arrays are gone after #323's `onUpload`).
3. **Share identical sign textures**: one `sharedTex(key, make)` cache for the stop sign (key: name + rows), the
   timetable sheet (key: its lines), the "P" board and the car park name plate.
4. Read-only hooks `window.__mm.gpuGeometry()` and `window.__mm.duplicateTextures()` for the test.

### Expected (full world)

| Lever | GPU MB saved | CPU MB saved |
|---|---:|---:|
| 1 keep indices (`grass` 124 → ~34, `roadPlain` 125 → ~53) | ~162 | ~30 (positions #323 keeps) |
| 2 compact `normal`/`color` (~3.5 M vertices left × 16 B) | ~56 | — (freed by #323 anyway) |
| 3 shared sign textures | up to 39 | ~29 (canvas backing stores) |
| **total** | **~255** (merged roles 348 → ~130, textures 122 → ~83) | ~59 |

### How it fits after #323 (PR#1066, lands first)

#323 adds, directly above the merge loop, `CPU_GEO`, `dropArray`, `pickGeometry`, `raycastPositions`, `freeCpuCopy`,
appends `freeCpuCopy(m); delete parts[role];` to the loop, and adds `window.__mm.cpuGeometry` and
`tests/test_cpu_geometry.py`. This design:

- changes only the `mergeGeometries(parts[role], false)` call in that loop to `mergeRole(parts[role])`, which runs
  before `freeCpuCopy`, so #323 drops the compact arrays after upload exactly as it drops today's;
- adds one line to `pickGeometry`: the position-only pick geometry must share the role's **index**, or rays would
  test the wrong triangles. The index stays on the CPU (raycasts need it): +23 MB of indices, −53 MB of positions;
- leaves `freeCpuCopy`, `dropArray` and the `cpuGeometry` hook and test unchanged; they still pass.

### Rejected

- Exact dedup (`mergeVertices`) at load: 3–4.5 s per big role on a desktop.
- Fewer rings per disc: changes the drive surface (`DISC_GRID` keeps the drawn triangles, `:1855`, #273) and the look;
  after indexing the discs cost ~27 MB.
- Indexing `ribbonGeo` (`roadOsm`, `water`, `rail`, `motorway`, ~20 MB): it also feeds the marking/boundary merges
  that mix with non-indexed geometry. Follow-up if the phone still needs it.
- Smaller sign textures (visible up close), freeing canvases after upload (a later `needsUpdate` would upload an empty
  canvas, `:2975`): follow-ups.

## Out of scope

The forest and `treeBill`, per-tile merging, the real-phone measurement (manual after deploy).
