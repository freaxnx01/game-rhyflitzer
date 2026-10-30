# Plattform Sisslerfeld: the car stops at the core cylinder (#567)

## Problem

Test feedback (maintainer, 2026-10-30): the car drives straight through the Plattform Sisslerfeld.

`plattformTower()` (`prototype/index.html:1484`) gives only the **three corner posts** a collider
(`addOBB(px, pz, 0.26, 0.26, …)`, `prototype/index.html:1504`). They stand on a triangle with 6 m sides
(`PLATTFORM.frame.side`, `prototype/plattform.js:8`), so each gap between two posts is about 5.7 m wide, room
enough for any car. The batten ring of the core cylinder (`PLATTFORM.core.r` = 1.56 m) and the central post
have **no** collider. The comment at `prototype/index.html:1508` says "the car never gets inside the ring";
that is wrong.

## Reproduction (measured 2026-10-30, before the fix)

Headless, live world (Hochrhein), GPU browser via `PW_CDP_ENDPOINT`. Hooks: `__mm.plattform()` →
`{ facing: -1.5067, base: 0.297, x: 304.75, z: 427.08, deckY: 6.032 }`. The car starts 15 m from the centre on
each of the three gaps (φ = 0° door side, 120°, 240°, measured from `facing`), aimed at the centre, 8 m/s, `KeyW`
held, simulated in 40 chained `__mm.sim(x, z, th, v, 0.1, ['KeyW'])` steps (4 s).

| Approach φ | Closest to the centre | Speed when crossing | End (signed along the approach, + = start side) |
|---|---|---|---|
| 0° (door) | **0.39 m** | 16.5 m/s | **−2.03 m** (far side, stopped by the opposite post) |
| 120° | **0.37 m** | 16.5 m/s | **−2.02 m** |
| 240° | **0.40 m** | 16.5 m/s | **−2.03 m** |

The car passes 0.4 m from the central post, deep inside the 1.56 m ring, and only stops on the far side when it
runs into a corner post. No page errors.

On foot (same run): from the entrance (r 2.0 m on the door side) walking in for 0.5 s, the walker reaches
**0.47 m** from the centre at ground level, through the door.

## Who the colliders affect

The collider grid `OBB_GRID` is read by:

- the car, `collide()` (`prototype/index.html:3975`);
- **the walker**, `footSolids()` → `collideFoot()`, `footFree()` and `footFloor()` (`prototype/index.html:3522-3529`):
  an OBB pushes the walker out *and* its top is a floor the walker can step onto (`prototype/foot.js:50-53`, `stepUp` 0.6 m);
- the helicopter floor, `heliFloor()` (`prototype/index.html:3750`, `prototype/heli.js:21`);
- the chase camera's wall test (`prototype/index.html:4042`);
- the placement test `free()` (`prototype/index.html:1241`).

So any plain collider on the ring would also act on the walker. A full disc would push the walker out of the core
and, near the top of the upper flight, offer its top as a floor. A ring of thin OBB segments would duplicate the
walkway walls (`plattformWalk`, `prototype/plattform.js:79-95`), which already hold the walker on the stair, and
could push a walker standing on a segment's centre line to the wrong side.

## Decision

One **car-only circle collider** over the whole core:

- shape: `circle: PLATTFORM.core.r` (1.56 m) at the centre, the shape `colliderPush()` already supports
  (`prototype/world.js:896`; trees use it, `treeCollider`);
- `h = base + PLATTFORM.roof.eaves`, like the corner posts;
- `carOnly: true`; `footSolids()` drops `carOnly` colliders, so on foot nothing changes: the walkway walls of
  `plattformWalk` keep holding the walker, the door stays open;
- added with `addSolid()` (not `addOBB()`): solid for car, heli floor and camera, not drawn on the minimap,
  like the trees (#131). The corner posts keep their `addOBB`.
- a pure builder `plattformCoreCollider(frame, base)` in `prototype/plattform.js`, unit-tested in node.

The door gap (±15°, chord 0.81 m at r 1.56) is narrower than any car, so the car-only circle needs no gap.

Rejected:

- ring of OBB segments with a door gap: also hits the walker (see above), and needs ~35 segments where one
  circle does;
- full circle without `carOnly`: blocks the walker from entering the core at all.

## Confirmation of the cause

A trial of exactly the decision above (not committed) in the same harness: all three approaches stop at
**2.86 m** from the centre on the start side (ring 1.56 m + the car's front half), speed 0.1 m/s; the walker still
reaches **0.47 m** from the centre through the door. No page errors.

## Acceptance

- The car aimed at the centre from any of the three gaps stops outside the ring: closest approach > core r + 0.5 m,
  and it stays on the side it came from.
- On foot: through the door into the core, unchanged; the walker on the upper flight still reaches the deck
  (`test_plattform_stair.py`).
- `test_smoke.py::test_plattform_tower_blocks_the_car` gets the tighter assertion (stopped before the ring).

## Out of scope

- The car parked inside the core (not reachable with this fix).
- Exit spots: `footFree()` ignores `carOnly`, so stepping out of a car parked against the core could put the walker
  just inside the ring; the walkway walls then hold the walker there. Not changed here.
