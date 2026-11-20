# Deep Space Nine with the Defiant docked — design (#620)

## Decisions (maintainer, 2026-11-17)

- Models: **„Deep Space Nine - Star Trek" by rossrobotics** and **„U.S.S. Defiant" by Feltman_Langer**, both
  Sketchfab, CC BY 4.0; the unmodified downloads are on main in `assets/src/` (`ds9_station.glb`,
  `uss_defiant.glb`, each with its LICENSE.md).
- Scale **50 %** (the issue said ≈ 55 %; ring 1's floor is only 600 m over ring 2's, so 55 % would leave no room
  to fly over the station): DS9 **726 m across**, about 494 m tall.
- The Defiant at the **same scale**: about 85 m long (real 170.7 m).
- Docked at the **outer docking ring**, level, nose to the station, on the side towards the portal.
- Room: **r2room1**, the next free ring-2 room (`NEXT_ROOMS2`, `rooms.js`; r2room7 went to the Shuttle, #811).
  Look `space`, unsigned, like the Enterprise room (#491).

## Source facts (measured 2026-11-17)

- DS9: one material, no textures, 410'493 triangles in 6 meshes (an STL scan, "ds9_terrok_nor"), Z up in the
  meshes (the root node carries the Z-to-Y matrix and a 0.0346 scale). Mesh bounds ±812 × ±808 × ±556 units;
  the farthest vertex is 817.1 units off the axis; the docking ring's outer band (vertices beyond 93 % of that
  radius) lies at z −26.6 … +26.6, i.e. on the station's mid-plane.
- Defiant: 22 materials (plain colours, no textures), 118'225 triangles. Its nose is on local +y (mesh space of
  node `ds9_defiant_3`), 549 × 426 × 93 units. A stray 12-triangle default cube (`Cube_0`, material `Material`)
  sits at the origin and is dropped.

## The asset: `assets/models/ds9.glb` (`tools/prepare-ds9.mjs`)

One file, so the room loads one model through `loadModel`'s hovering-ship branch (as the Enterprise):

- metres, +y up, the station's axis on x = z = 0, **y = 0 at the station's lowest point**; the station scaled by
  s = 726 / (2 × 817.1) (≈ 0.4442 m per unit), the Defiant by its own factor to **85.4 m long** (half of 170.7 m;
  its source units differ from the station's).
- node `ds9` (root) → node `station`: one mesh, simplified to **60k–80k triangles**, one material `Hull`
  (`#9a9ea3`, metallic 0.35, roughness 0.55), crease normals.
- node `defiant`: its meshes simplified to **15k–25k triangles**, materials kept per role (the cube dropped);
  the lamp, window, deflector, bussard, engine and impulse materials get an emissive equal to their base colour.
  Bow on the node's local +x; the node turned 180° about y so the bow points at the axis; its translation puts
  the nose tip 1 m outside the ring's outer face (x = 817.1 × s + 1 + half its length), at the ring's height
  (y = 555.8 × s, the mid-plane over the lowest point), z = 0.
- `EXT_meshopt_compression`, ≤ 2.5 MB. The script prints the station's size, the ring radius and height, and
  the Defiant's length.

## The room

- `ds9.js` (pure, as `enterprise.js`): `DS9 = { key: 'ds9', h, diameter: 726, hover: 25, yaw: Math.PI / 6,
  bob: { amp: 1, period: 20 }, ceiling: 570, url: './assets/models/ds9.glb', loadWithin: 400, scale: 1,
  anchor: [0, 0, 0] }`. `hover` sends `loadModel` down the hovering-ship branch; `enterprisePlacement` places it
  (station axis on the room centre, model +x — where the Defiant docks — towards the portal, turned 30° to the
  right, so the Defiant is in view on arrival); `stepEnterprise` bobs it.
- `rooms.js`: `TAKEN2[1] = { name: 'Deep Space Nine', object: DS9, signed: false, look: 'space' }`;
  `roomLayout`'s `fly.ceiling` becomes `room.object?.ceiling ?? ROOM_FLY.ceiling` (570 m here: 51 m over the
  station's top at 519 m, still under ring 1's floor at 600 m).
- No hull colliders (as the Enterprise): the car drives under the lower pylons (lowest point 25 m up).
- `window.__mm.ds9()` (flat index 9, like `__mm.enterprise()`): `{ ...states, y, th, ceiling, defiant: world
  position of the Defiant node }`.
- Credits: `CREDITS.md`, README's model list, `creditDs9` / `creditDefiant` EN/DE in the F1 help, both
  LICENSE.md files next to the asset, a CHANGELOG entry.

## Testing

- `tests/ds9_asset.test.mjs`: budget, nodes, materials, the Defiant node's place against the measured ring.
- `tests/ds9.test.mjs` + `tests/rooms.test.mjs`: config, placement, room entry, fly ceiling 570 only here.
- One Playwright test (as the Enterprise one): ride to ring 2, enter r2room1, ds9.glb fetched once, hovering
  25 m up, the Defiant towards the portal at ring height, the car drives under the station, the helicopter
  ceiling is 570 m; a screenshot from the portal.

## Out of scope

Walking inside, lights in the station's windows, the Defiant flying, a wormhole.
