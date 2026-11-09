# Bus shelters are obstacles (#760) — design

## Problem

The glass shelters at the Postauto stops (#712) are drawn only: `busStop()` in `index.html` (~line 2102) adds roof, glass
and posts to the `signs` group and registers no collider, so the car drives straight through them.

## Decisions (confirmed by the maintainer, 2026-11-09)

- **Vehicles only.** The shelter is solid for the car (and everything that reads `OBB_GRID`: helicopter floor, camera
  probe), but **not on foot**: the walker can step in under the roof. Mechanism: the existing `carOnly` flag, which
  `footSolids()` (`index.html` ~4521) already skips — the same precedent as the Plattform core (`plattform.js:136`,
  `plattformCoreCollider`).
- **Only the shelter.** The stop pole (8 cm, 0.2 m from the asphalt) stays non-solid.

## Design

- New pure export in `busstop.js`: `shelterCollider(layout, base, cfg = STOP)` → `null` when `layout.shelter` is null
  (sign-only stop), else one box
  `{ x: layout.shelter.x, z: layout.shelter.z, hw: cfg.shelter.w / 2, hd: cfg.shelter.d / 2, c: cos(layout.yaw), s: sin(layout.yaw), h: base + cfg.shelter.h + 0.25, carOnly: true }`.
  The OBB convention (`index.html:1562` `addOBB`, local `lx = dx*c + dz*s` against `hw`) puts `hw` along the kerb,
  which is the layout's `u = (cos yaw, sin yaw)` (`busstop.js` `stopLayout`). `h` is absolute (terrain at the pole + roof
  top: roof box at `S.h + 0.1`, 0.15 thick).
- `index.html` `busStop()`: after the shelter meshes, `const solid = shelterCollider(layout, b); if (solid) addSolid(solid);`
  — `addSolid`, not `addOBB`/`pushOBB`: a shelter is not a building and must not show on the minimap (same as trees, #131).
- `buildBusStops()` runs at startup (`index.html` ~6013) while `OBB_GRID` is the surface grid, so the solid lands in the
  surface world.

## Acceptance

- Driving the car head-on into a shelter stops it at the box face: the car centre never enters the shelter footprint.
- On foot the shelter does not block (collider has `carOnly: true`).
- Sign-only stops (`shelter: null`) add no collider.
- Existing stop tests stay green.

## Consequences

- The helicopter can land on a shelter roof (heliFloor reads `OBB_GRID`).
- The chase camera pulls in when a shelter is between it and the car, as with any solid.
- The Postautos ignore it (they are not steered by `collide`), which is fine: the layout keeps the shelter ≥ 0.5 m clear of
  every standing bus.
