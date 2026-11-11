# Fenced ostrich paddock at the Straussenfarm Sisseln (#846)

Enriched headless on 2026-11-11 (`/enrich 846 --headless`). The ostrich-model question was answered by the user before the run; everything else in *Assumptions* is the agent's call.

## Intent

In Sisseln there is an ostrich farm (Hauptstrasse 51, farmyard OSM w189035720). A tester saw the light-green pasture beside the farm buildings and asked for the two things that make it read as an ostrich farm: a **fence** on the parcel's real outline and a **small group of ostriches** inside it that stand, peck, walk and run off a little when the player comes near. Cheap on weak GPUs, visible only near the farm, no third-party model.

## Where (measured)

Game frame: `x = E - 2639781.35`, `z = -(N - 1266787.08)` (`data/world_hochrhein.json` `origin`). Tester car: x 2313.5 / z -329.8, heading north-east. The light area in front of the car is the LWB `pasture` parcel in `data/world_hochrhein.json` `fields` (`kind: "pasture", src: "lwb"`, drawn in `#8db05a`, `world.js:1046`), east of the farmyard and north of the Hauptstrasse (road w122368060, centre z -314.5, 7 m wide).

Data probe 2026-11-11 (OSM map call, bbox 7.9945,47.5515,8.0015,47.5555): OSM has **no** `barrier=fence`, no `animal=*` / `animal_keeping=*`, no name containing "Strauss" at the farm. It has the farmyard w189035720 (x 2333.5–2403.9, z -318.7 to -366.1), the shed w222130965 (the tester's "nearest building", 7 x 5 m at 2349.6 / -333.2), the house w199700862 (Hauptstrasse 51), the stable w171822866 (`farm_auxiliary`, x 2381.6–2402.5, z -328.4 to -361.2) and a big `landuse=meadow` w189035739 that covers the whole block. So the fence follows the **LWB pasture parcel**, the only outline that matches the light area.

### Paddock outline (game x / z, from the LWB ring, micro-vertices dropped, clockwise from the road)

```
A 2376.9 -321.1   road side, west corner of the tongue (3 m north of the Hauptstrasse edge)
B 2432.9 -321.1   road side, east corner
C 2426.8 -523.6   north-east corner (Stelliweg track beyond)
D 2378.1 -523.2
E 2329.0 -526.2   north-west corner
F 2334.2 -378.6
G 2365.4 -379.3   gate corner (see Gate)
H 2374.1 -364.3
I 2383.2 -359.8   south-west corner of the stable
J 2404.5 -360.3   stable's east wall, moved 2 m east (LWB: 2402.4) so no post stands in the stable
K 2404.5 -333.6   (LWB: 2403.7)
L 2397.1 -332.4
M 2397.1 -330.5
N 2379.6 -328.5
O 2375.7 -324.1
```

A-B is the road side, B-C-D-E the far sides, E-F the west side of the big block, F-G-H-I the side towards the farmyard, I-J the stable's south wall, J-K its east wall, K-L-M-N-O the notch at the stable's north end. The parcel is ~2 ha (100 x 200 m), ~600 m of fence.

## What gets built

### Fence

- Wooden post-and-rail in the game's low-poly look: square posts 0.12 m, 1.8 m above the ground (ostrich fences are tall), every 4 m along each edge plus one on every corner; three rails (0.08 x 0.06 m) at 0.55, 1.1 and 1.65 m between neighbouring posts. Post colour `#6b4a2a`, rails `#8a6a44`, `MeshLambertMaterial`, vertex colours, the whole fence **one merged `BufferGeometry` in one `Mesh`** (like the props in `index.html:2044`), `castShadow` on.
- Each post stands at `terrainH(x, z)`; a rail runs from post top to post top, so the fence follows the slope.
- **Collision:** one `addSolid` oriented box per rail run (post to post, so <= 4 m long, `hd 0.1`, `h = max(terrainH at both posts) + 1.8`). Registered with `addSolid`, not `addOBB`: no minimap boxes, not counted as a building. The car collides (`collide`, `index.html:5223`), the walker cannot step over it (`footFloor` stepUp 0.6 m < 1.8). Solids are registered **after** the tree scatter, like the tree trunks (`index.html:2636-2637`), so `free()` never sees them.
- **Gate:** a 4 m opening on edge F-G, its east end 6 m from G (x ~2357–2361, z ~-379), towards the farmyard where the farm track would enter. Two taller gate posts (2.0 m) and a closed gate leaf: two rails plus one diagonal brace, colour `#9a7a50`. Closed means it collides exactly like a fence run. No opening animation.
- No tree inside the paddock: `free(x, z, rad)` (`index.html:1656`) also returns false when `inPaddock(x, z, rad + 1)` (same role as `inYard` for the Crash-Platz, `crashyard.js:37`).

### Ostriches

- **8 ostriches** built from three.js primitives in code: no file, no licence, no credit (confirmed by the user).
- Parts, each its own `InstancedMesh` (8 instances), so legs and neck can move per instance:
  1. `body`: sphere scaled to 1.3 x 0.9 x 0.8 m (length x height x width) at hip height 1.1 m, with two wing bumps (small scaled spheres, white tips as vertex colour) and a short tail cone, merged into one geometry.
  2. `neck`: cylinder 0.09 m radius, 1.1 m long, pivot at its base (front of the body, 1.4 m up), with the head (sphere 0.16 m) and beak (cone 0.06 x 0.14 m) merged at its tip; two black dot eyes are vertex colour, no extra geometry.
  3. `legL`, `legR`: cylinder 0.05 m radius, 1.1 m long, pivot at the hip, with a flat foot (scaled box) at the bottom and a feathered thigh (scaled sphere 0.25 m) at the top.
- Colours per instance via `setColorAt`: 3 males (body `#2b2b30`, white wing tips), 5 females (body `#8a7a66`); neck and legs `#c9a89a` for all. `MeshLambertMaterial({ vertexColors: true })` on every part. `frustumCulled = false` on each (the fish do the same, `index.html:2783`).
- Pose per instance = position (x, `terrainH`, z), yaw, then per part a joint angle: `neck.pitch` (0 = upright, 1.35 rad = beak at the ground), `legL.swing`, `legR.swing` (± 0.45 rad), `body.bob` (±0.04 m). The glue composes four matrices per ostrich per frame (`Matrix4.compose` into `setMatrixAt`, `instanceMatrix.needsUpdate`), the way `stepFish` does (`index.html:2791`).

### Behaviour (pure, `ostriches.js`, seeded `rng`, deterministic)

States per bird, timers in seconds:

| state | what | duration | speed |
|---|---|---|---|
| `stand` | neck up, tiny head turns | 2–6 s | 0 |
| `peck` | neck swings down (0.6 s), holds, 2–3 pecks, back up | 2–4 s | 0 |
| `walk` | towards a random target inside the paddock (inset 3 m) | until there, max 10 s | 1.2 m/s |
| `flee` | away from the player | until farther than 45 m or 6 s | 6.0 m/s |

- Next state after `stand`/`peck`/`walk`: random pick weighted stand 0.4 / peck 0.35 / walk 0.25.
- `flee` starts when the player (car **or** walker, `P.x/P.z`, whatever the mode) is within **25 m**. Direction = away from the player; if the next position would leave the paddock the bird tries the direction turned ±60° and ±120°, and stands if all are blocked (it is then in a corner).
- Birds keep **2 m** apart (a pairwise push on the position, 8 birds so 28 pairs).
- The paddock is the outline above inset by 1 m for the position test (`pointInRing`), so no bird stands in the fence.
- Leg swing: a sine on a distance phase (one stride = 1.6 m walking, 2.4 m fleeing). Standing legs stay at 0, the body bob follows the stride.
- Initial placement: 8 seeded random points inside the parcel's south half (z > -440, nearest the road and the farm, so the group is seen from the Hauptstrasse), at least 4 m apart.

### Distance culling

- `OSTRICH.show = 350` m from the paddock's centre (2380, -422): beyond it the fence mesh and the four instanced meshes are `visible = false` and the behaviour step returns early (no simulation at all; birds freeze where they are, nobody can see them). Within: `stepOstriches(dt)` every frame. Same shape as `stepDepot` (`index.html:5768`).
- Everything is built once at world build (the fence is one static mesh, the birds four draw calls); no lazy build is needed at this size.
- Only in the Hochrhein world (`REGION.id === 'hochrhein' && !REGION.generated`, as `DEPOT_S.on`).

### J jump list

`landmarks.js` `LANDMARK_INFO`, Sisseln block, after `Volg Sisseln`:
`{ name: 'Straussenfarm Sisseln', gemeinde: 'Sisseln', at: [2345, -318], look: [2385, -400] }` — J snaps to the Hauptstrasse in front of the farm and turns the car towards the paddock. On a road, so the autopilot may drive there too (`destEntries`, `index.html:5827`).

### Changelog, credits

- `CHANGELOG.md` `[Unreleased]` / `### Added`, newest first, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`: "A **fenced paddock** with eight **ostriches** at the Straussenfarm in Sisseln: they stand, peck and walk, and run off when the car or the walker comes close. <kbd>J</kbd> lists the farm."
- No credits: built from primitives.

## Goals / non-goals / anti-goals

- Goals: the parcel reads as the ostrich farm from the road; the fence stops the car; birds behave plausibly; zero cost away from the farm.
- Non-goals: a textured or rigged model, flocking, eating/drinking props, sound, the gate opening, ostriches outside the paddock, a hub screenshot.
- Anti-goals: a bird clipping through the fence; a visible frame-time cost elsewhere in the world; a third-party asset.

## Tests

- `tests/ostriches.test.mjs` (node): the outline is clockwise and closed; `inPaddock` for a point inside, a point in the stable, a point on the road; `fencePosts` spacing (every post <= 4 m from the last, corners included, exactly one 4 m gap at the gate); `stepFlock` keeps every bird inside the inset outline over 60 simulated seconds with a player circling inside; flee: a player 10 m from a bird puts it in `flee` and its distance grows; determinism (same seed, same poses).
- `tests/test_ostriches.py` (Playwright, swiftshader, like `tests/test_depot.py` but with the real world file, terrain 404'd): `window.__mm.ostriches()` reports `count 8`, all inside, fence solids > 100; `__mm.place(2345, -318, 1.5)` + `wait_frames` makes the meshes visible, `__mm.place(1500, 400, 0)` hides them; placing the car 8 m from a bird and waiting ~120 frames (the loop runs the behaviour; `__mm.sim` runs only the car physics) puts that bird in `flee` farther away than before.
- `tests/test-map.json`: `"ostriches.js": ["test_ostriches.py"]`, `"landmarks.js"` gains `test_ostriches.py` (it is listed at `tests/test-map.json:36`).
- Helpers that exist: `rng(seed)` (`world.js:669`), `inPoly(poly, x, z)` (`walkways.js:21`, even-odd), `wait_frames(page, n)` / `ARGS` / `MMH_ROUTE` (`tests/test_carselect.py:12-47`).

## Assumptions

- **A1** [confirmed] Ostrich model source: "Aus Primitiven bauen" — a low-poly ostrich built from primitives in code (no third-party model, no licence/credits), instanced and cheap, with pecking and walking animated through leg/neck joints in code.
- **A2** [high] The paddock outline is the LWB `pasture` parcel beside the farmyard, as listed above. Rejected: OSM `barrier`/`animal` data — the probe found none at the farm; the big OSM meadow w189035739 covers the whole block including the houses. `data/world_hochrhein.json` `fields[]` (`kind: "pasture", src: "lwb"`) is the drawn light area.
- **A3** [med] The gate sits on edge F-G near G, towards the farmyard, and is closed. Rejected: a gate on the Hauptstrasse side (the yard is where a farm track enters) and an opening gate (the birds must stay in anyway).
- **A4** [med] Post-and-rail wood, 1.8 m, three rails, posts every 4 m. Rejected: wire mesh (an alpha plane per run, worse in the flat-shaded look and more draw cost).
- **A5** [high] 8 birds, 3 dark males, 5 brown females; sizes in *Ostriches*.
- **A6** [med] Flee at 25 m from the player in any mode, 6 m/s, until 45 m away or 6 s; the walker and the car are the same `P` (`index.html:4425` `player` for the Postauto does the same). Rejected: fleeing from Postautos (they stay on the road, 3 m from the fence, it would look like a glitch).
- **A7** [high] Fence runs are `addSolid` boxes <= 4 m long registered after the tree scatter; `free()` gets an `inPaddock` test. Rejected: one box per edge (`free()` tests `hypot(hw, hd)`, `index.html:1656`, so a 150 m run would clear trees in a 75 m circle).
- **A8** [med] J entry `Straussenfarm Sisseln`, plain German like every `LANDMARK_INFO` name (`landmarks.js:7-60`), `at` on the Hauptstrasse, `look` at the paddock. Rejected: an off-road landing inside the paddock (the depot/yard pattern needs its own `jumpToX`; the road in front shows the farm anyway).
- **A9** [high] Visibility radius 350 m from the paddock centre, simulation paused beyond it.
- **A10** [med] Outline vertices J and K moved 2 m east of the LWB line so the fence clears the stable w171822866; its south wall (I-J) keeps a fence run along it, 1 m off.
- **A11** [high] Split: pure `ostriches.js` (outline, posts, gate, `inPaddock`, flock step) + glue in `index.html` (meshes, solids, `stepOstriches`, `window.__mm.ostriches`), the depot/fish convention.

## Consequences

- `free()` runs one more point-in-polygon test per scatter candidate (9000 at world build) and per forest tree: well under a millisecond in total.
- Leaving the Hauptstrasse eastbound between x 2377 and 2433 now hits a fence 3 m off the road where there was open field; the fence is 1.8 m, so the car cannot jump it from the road.
- ~150 new solids in `OBB_GRID`, all 4 m long: a grid cell on the fence line holds a few more entries for `collide()`, nothing elsewhere.
- The paddock lies inside the heuristic `sisselnWald` box (`index.html:2629`, `[1960, -520, 2500, -300]`); that box is only used without OSM woods, so the Hochrhein world is unaffected.
- The new J entry is a road target, so the autopilot and the Navi can also pick it.
- The pasture's colour stays LWB green; nothing is drawn on the ground.

## Left to the builder

Exact primitive proportions, the wing/tail detail, the post cap shape, the rail colour variation, and the rng seed.
