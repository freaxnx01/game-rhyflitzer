# Bus stop sign mirrored text (#795) Design

## Problem

The Haltestellentafel of every PostAuto stop (`busStop()` in `index.html`, #712) reads mirrored from the road.

## Measured root cause

`index.html:2111`: the sign is `PlaneGeometry(0.9, 0.55)` with `side: THREE.DoubleSide` at local `z = -0.05`, no rotation. The group is placed with `rotation.y = -layout.yaw` (`index.html:2121`), so local +x runs along the kerb and local +z points away from the road (`busstop.js:46`, `n = [-u1, u0]`). A plane's front face looks to +z, so the lettering faces **away** from the road. The road side sees the back of the plane, which `DoubleSide` renders with the same UVs: mirrored. The canvas texture itself is not flipped (`makeTex`, `index.html:920`, default flipY) and there is no negative scale.

Measured with a node probe (three.js, same transform): the world normal of the sign's front face has dot +1.000 with "away from the road" for yaw 0, 1, 2.5 and -2. The rotation only turns the whole group, so **all stops are affected**, not one kerb side. The timetable sheet (`index.html:2113`) already has `rotation.y = PI` and faces the road; it is single-sided and unaffected.

## Design

- Two single-sided planes instead of one DoubleSide plane, sharing one texture:
  - road face at `z = -0.052`, `rotation.y = PI`, `FrontSide` (readable from the road);
  - back face at `z = -0.048`, no rotation, `FrontSide` (readable, unmirrored, from behind the pole, like a real double-sided sign).
- The face placement is a pure constant `SIGN_FACES` in `busstop.js` (`[{ z, rotY }]`) so a node test can pin the orientation; `busStop()` builds the meshes from it.
- No texture change, no new assets.

## Acceptance criteria

- [ ] From the road side, the sign text reads correctly (road face normal points to -z local = toward the road).
- [ ] The back face also reads correctly (not mirrored); no face uses DoubleSide.
- [ ] Holds for every stop yaw (group rotation is orthogonal to the face logic).
- [ ] A node test pins the face normals; a targeted Playwright probe confirms the built meshes for the real stops.

## Assumptions

- **A1** [high] Fix by splitting into two FrontSide planes. Rejected: `scale.x = -1` on one DoubleSide plane (mirrors winding, culling surprises) and a blank back (a real stop sign is printed both sides, and AC allows either).
- **A2** [high] All stops share the orientation: `stopLayout` always derives `n` away from the road (`busstop.js:46`). Verified by node probe, four yaws.
- **A3** [med] The back face carries the same texture (same rows). Rejected: a blank back.
- **A4** [high] The Fahrplantafel needs no change: `rotation.y = PI`, FrontSide (`index.html:2113`) already faces the road.
- **A5** [med] The two planes sit 4 mm apart to avoid z-fighting; invisible at play distance.

## Consequences

- Two draw calls per sign instead of one (they can share the one material and texture).
- The sign now reads from the pole's back for players walking behind the shelter.
