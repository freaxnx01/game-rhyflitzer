# Postauto: line and destination in the model's own display slots (#713): design

**Issue:** #713. **Builds on:** #500 / PR#696 (Postautos), #478 (bus.glb).

## Problem

A Postauto draws its own LED plane in front of the bus (`index.html:3894-3895`) and leaves the glTF's baked display
("811 Sisseln") untouched. The result in the playtest: two displays on the front, a baked text on the side, "81" on the rear.

## Cause (measured, `assets/bus.glb` decoded with meshopt, model metres, +x forward, +y up, +z right)

The baked display is **one primitive** of the `body` mesh: material `Display` (`extras.overGlass`, white emissive, texture
`bus-display.png`, 512x64, text "811" at x 8 and "Sisseln" at x 130, `tools/prepare-bus.mjs:205-208`). It holds three quads (12 vertices, 6 triangles):

| Position | Plane | Extent (y, across) | Size | UV u window |
|---|---|---|---|---|
| Front | x = 5.820 | y 2.368..2.702, z -1.118..+1.118 | 2.236 x 0.334 m | 0.004..0.95 (almost the whole texture) |
| Side (right, +z) | z = 1.285 | y 2.026..2.282, x 2.447..4.009 | 1.562 x 0.256 m | 0.004..0.95 |
| Rear | x = -5.825 | y 2.533..2.814, z -0.232..+0.232 | 0.464 x 0.281 m | 0.004..0.22 (only the line number) |

(The UVs are shifted by -1 and rely on repeat wrapping; v runs 0.006 to -1.004. A replacement texture needs `wrapS/T = Repeat` and `flipY = false`.)

The #500 LED plane is placed from the **whole model's bounding box**, not from these quads:
`x = box.max.x + 0.03` and `y = box.max.y - 0.32` (`index.html:3893-3895`). The accessor bounds of the body give
max x 6.226 (bumper) and max y 2.895 (roof AC unit), so the plane sits at **x 6.256, y 2.575**, 1.9 x 0.24 m, opaque
(`MeshBasicMaterial`, drawn before the tinted glass).

| | LED plane | baked front quad | offset |
|---|---|---|---|
| x (forward) | 6.256 | 5.820 | **0.436 m in front** (0.279 m ahead of the glass, whose x max is 5.977) |
| y (centre) | 2.575 | 2.535 | 0.040 m higher |
| width | 1.9 m | 2.236 m | 0.336 m narrower |

So the plane floats in front of the windscreen, and the baked quad (drawn after the glass via `renderOrder = 1`,
`index.html:2894`) still shows through behind it. Side and rear have no replacement at all, so they keep "811 Sisseln".
Nothing in the model is wrong; the code never touched the `Display` material.

## Design

- **Retexture, do not overlay.** `buildPostautoMesh` removes the LED plane. For each cloned scene it finds the mesh whose
  material has `userData.overGlass` (the `Display` primitive), gives it its **own cloned material** and sets
  `map` and `emissiveMap` to a per-bus canvas texture with line and destination. All three quads (front, side, rear) update at once,
  flush in the model's own slots, drawn after the glass as before. The cached scene's materials (`SHARED_CAR_MATS`,
  `index.html:2896`) are not changed, so the player's bus and every other Postauto keep the baked display.
- **Pure layout module `busdisplay.js`** (no DOM, no three.js, node --test): `displayLayout(text, measure)` returns where line
  and destination go and at which font size, as fractions of the texture. The line number stays inside the rear window
  (u <= 0.205), the destination starts at u 0.254 (the baked position) and shrinks to fit.
- **Canvas texture** 1024x128 (UVs are normalised, so twice the baked resolution costs nothing in the model),
  orange `#ff9a1a` on `#0a0a0a`, the font stack the old LED used.
- **Disposal:** the cloned material and the texture belong to the bus; `disposePostautoMesh` already frees non-shared materials and their `map`.
- **Debug hook:** `window.__mm.postautoDisplay()` for the test.

## Assumptions

- **A1** [high] The cause is the plane's position from the bounding box, plus the untouched baked `Display` material. Numbers above; rejected: a wrong model offset. `index.html:3893-3895`, `tools/prepare-bus.mjs:205`.
- **A2** [high] Fix by retexturing the `Display` material per bus instead of three flush planes. Rejected: planes at 5.82 / 1.285 / -5.825, which needs hand-kept offsets, a z-fight margin and the glass ordering again. Evidence: the quads already carry correct UVs for all three positions (table above), `index.html:2894` already orders the material after the glass.
- **A3** [high] The cached glTF materials stay unchanged; the per-bus material is a `clone()`. Rejected: writing `map` on the shared material, which would also change the player's bus. Evidence: `index.html:2896` (`SHARED_CAR_MATS`), `index.html:3902-3906`.
- **A4** [med] The player's own bus keeps its baked "811 Sisseln" display; "consistent" is read as the same slot and the same look (orange on black, emissive), not as showing a destination. Rejected: also painting a text on the player's bus (it has no trip). Evidence: `buildGltfVehicle` clones the scene unchanged (`index.html:2927`).
- **A5** [med] The rear shows only the line number, as on the model (its UV window is u 0.004..0.22). Rejected: remapping the rear UVs to the full text, which needs a model rebuild (`tools/prepare-bus.mjs`) and shrinks the text to unreadable size on a 0.46 m quad.
- **A6** [med] There is one side display, on the right (door) side, as the model has it. Rejected: adding a left-side display, which the model does not have.
- **A7** [med] Look is judged on a screenshot by the maintainer; the Playwright test checks structure only (no free plane, own map and material, shared material untouched, text equals `userData.led`). Rejected: a pixel comparison, which is brittle with SwiftShader and the web font.

## Consequences

- Up to `PA.maxBuses` (8) extra 1024x128 canvas textures and cloned materials; one draw call per bus fewer (the plane is gone).
- The font differs from the baked "811" on the player's bus (Barlow Condensed vs. the prepared Liberation Sans); both are orange on black.
- A style change (`applyStyle`, `CAR_ENV_MATS`) does not reach the cloned display material; it is emissive, so the env map is barely visible on it.
- The text is drawn after the tinted glass (the `overGlass` order), so its brightness equals the baked display, not the old plane's.

## Testing

node --test for `busdisplay.js` (layout limits with a fake `measure`). One Playwright test, added to `tests/test_postauto.py`
(`__mm.postautoDisplay()`: no plane in any bus, `Display` material own and not the cached one, cached map still 512 px wide).
Manual: screenshot front, side and rear of a Postauto on a weekday timetable time, no second display, no "811 Sisseln".
