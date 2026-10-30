# Bodenackerstrasse 6: top-storey flicker (parapet band z-fighting) — design

Issue: #453 (remaining part after PR#460 / PR#476).

## Problem

The top storey of the Bodenackerstrasse 6 block (OSM way 171822634) shows dark hatched patterns that flicker while the camera moves, from the street side and from the west.

## Root cause (measured 2026-10-29)

`bodenackerBuilding()` draws the white parapet band with
`extrudeFootprint(bodyWorld, base + h, BODENACKER6.parapet, white, 'plasterWhite', …)` (`prototype/index.html:1371`).
`extrudeFootprint` always starts its walls 2 m below its base (`y0 = base - 2`, `prototype/index.html:1268`), a skirt meant for buildings standing on terrain. For the parapet, the base is the eaves `base + h`, so its walls run from `base + h - 2` to `base + h + 0.5` on the **same body ring** as the façade quads (`wallQuads`). The top 2 m of the 2.53 m top storey are drawn twice, coplanar, with two textures (window band vs. plain plaster): z-fighting.

Measured on the GPU browser (AMD Radeon Vega 11, 640×360, camera 50 m out from the longest wall at base + 42 m, 40 frames, 2 cm camera step per frame):

| View | Band | today: flips / MAD | parapet without the 2 m skirt |
|---|---|---|---|
| West | top storey | 10.79 % / 14.58 | 0 % / 0.07 |
| West | storey below | 0 % / 0.22 | 0 % / 0.22 |
| East (street) | top storey | 4.04 % / 9.70 | 0 % / 0.03 |
| East | storey below | 0 % / 0.05 | 0 % / 0.05 |

(flips = share of band pixels whose luminance jumps by > 50 between consecutive frames; MAD = mean absolute luminance difference.)

Raycast proxy: a horizontal ray at the top storey's mid-height, 12 m out from the street, back and end walls, hits two faces at exactly the same distance (12.0000 m: the façade role and `plasterWhite`). Without the skirt only the façade role is hit.

Ruled out: texture aliasing (all three textures have mipmaps, LinearMipmapLinear, anisotropy 16 = GPU max), general depth precision (near 0.5 / far 4200; lower storeys stay at 0 % flips under the same motion), the black roof box (fixed in PR#460, housings render white).

## Design

- `extrudeFootprint(ring, base, h, c, role, roofC, tile, uPerFace, below = 2)`: a new trailing parameter `below` (metres under `base` the walls reach), the same meaning as `wallQuads`' `below`. Default 2 keeps every other building byte-identical. The wall UV `v0` becomes `-below / tile[1]` (unchanged for the default).
- The parapet call passes `below = 0`: the band runs from the eaves `base + h` to the roof slab `base + h + parapet`, meeting the façade quads' top edge without overlap.
- Test hook `window.__mm.wallRolesAt(x, z, tx, tz, up, eps = 0.01)`: every role a horizontal ray hits within `eps` of the first hit, sorted, unique. `wallRoleAt` keeps its behaviour and shares the ray code (`wallHits`).

## Testing

- Browser (Playwright, `prototype/tests/test_bodenacker6.py`): at the top storey's mid-height the ray from the street, from the west and from an end wall returns exactly one role (`bodenacker` / `bodenackerLoggia` / `bodenacker`), never `plasterWhite`. Red on main (two coplanar roles), green after the fix. This is the deterministic proxy for the flicker: a moving-camera pixel test is GPU-dependent (SwiftShader frames are pixel-identical for a static camera).
- Regression: the existing `test_facades_by_side_and_the_roof_housing_is_plain` keeps passing; the parapet band is still there above the eaves (a ray at `base + h + parapet/2` hits `plasterWhite`).

## Out of scope

The 6c housing / black box (done in PR#460), other buildings' 2 m skirt (needed on terrain), camera near/far.
