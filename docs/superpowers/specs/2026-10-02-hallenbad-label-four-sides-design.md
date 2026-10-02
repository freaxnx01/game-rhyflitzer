# Hallenbad Sissila label on all four sides (#38) — Design

## Problem

`hallenbad()` in `prototype/index.html:497` builds one `HALLENBAD SISSILA` plane
(16 × 2.2 m, `MeshBasicMaterial`, front side only) on the façade at local
`+d/2`. From the other three sides the name is not visible.

## Goal

Every façade of the Hallenbad carries the label, readable from outside, sized to
that façade, at today's height — for both callers:

- traced world: `hallenbad(...V(735, 525), 0)` → default `w = 28`, `d = 26`
  (`prototype/index.html:678`)
- OSM world: the `hallenbad` anchor with `size: [42.7, 47.1]`
  (`pipeline/anchors.json:9`, called at `prototype/index.html:702`)

## Design

A pure helper in `prototype/world.js`, unit-tested with `node:test`:

```js
export function facadeLabels(x, z, rot, w, d, off = 0.1)
// → [{ x, z, rotY, w, h }] × 4, one per façade
```

- Geometry convention matches `box()`: the hall is `BoxGeometry(w, h, d)`
  rotated by `rotateY(-rot)`. A local offset `(lx, lz)` maps to world
  `(x + lx·cos rot − lz·sin rot, z + lx·sin rot + lz·cos rot)`. For `lz = d/2`
  this is exactly today's label position.
- Façade `k` (0..3) has outward local normal `+z, +x, −z, −x`; its plane gets
  `rotation.y = -rot + k·π/2`. A `PlaneGeometry` faces `+z`, so each label faces
  outward. With the default `FrontSide` material, the label is invisible from
  behind (inside the hall), so it is never seen mirrored.
- Façade length is `w` for the ±z faces and `d` for the ±x faces. The label width
  is `min(0.6 · length, 20)`, and its height keeps today's aspect
  (`h = width · 2.2 / 16`). Traced hall: 16.8 / 15.6 m wide (today 16 m). OSM hall:
  20 m on every side (2.75 m tall).
- Offset in front of the wall stays at 0.1 m; the centre stays at `b + 6.5`.

`hallenbad()` builds one `textTex` texture and one material, then adds four meshes
(one per `facadeLabels` entry) to `signs`.

## Out of scope

Pool and deck, the hall box, the other landmark labels.

## Testing

- `node --test prototype/tests/world.test.mjs`: new `facadeLabels` test (positions
  at `rot = 0` and `rot = π/2`, rotations, sizes, clamp).
- Existing Playwright smoke test (`prototype/tests/test_smoke.py`) stays green.
- Manual: drive around the Hallenbad in both worlds and read the label on every side.
