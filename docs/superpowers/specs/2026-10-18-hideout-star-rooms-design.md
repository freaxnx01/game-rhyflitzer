# Hübel hideout redesign: drive-through freight lift, tunnel ring, 8 star rooms (#361)

Status: enriched 2026-10-18 (headless `/enrich`, no human gate). The maintainer's decisions in #361 are final;
this spec only turns them into geometry, modules and tests. Replaces the above-ground route of #201/#277
(`2026-10-10-cave-system-eiffel-design.md`, `2026-10-11-hideout-lift-eiffel-room-design.md`); keeps the gate,
T1, the level machinery and the Eiffel room's content.

## Goal

The hideout becomes a hub that can take more landmark rooms over time (Atomium #355, Vasa, Titanic, …).
**Success:** the player drives through the „Reservoir Hübel" gate down the straight tunnel into a round lift
hall, the freight-lift door ahead opens as the car comes near, the car stops in the cabin, rides down, the
door in front opens onto a short exit into a wide tunnel ring, and eight spokes lead off the ring. The spoke
signed „La Tour Eiffel" ends, after a dark stretch, in a tunnel portal in the Eiffel room's tree ring. The
other seven spokes end in empty rooms of the same kind. The way back is the same in reverse, never needing a
U-turn: out of the room, round the ring, into the cabin from the ring side, up, and the door in front opens
towards the exit tunnel.

**Out of scope:** the new objects (each its own issue; #355 puts the Atomium into an empty room and adds its
sign); on-foot mode (#202 / PR#350); lazy loading of the surface world (#308 beyond "one room at a time").

## Today (evidence)

- `prototype/hideout.js:14-22`: T1 (105 m, 9 m wide, heading 95°) ends in R0 (`r 20`, ceiling `'lid'`); T2a →
  N1 → T2b → lobby (`[-790, 1855]`, ceiling 14) plus two bricked-up stubs. `LIFT` (`:57-63`) is a 10 × 16 m
  platform in the lobby facing down T2b.
- `prototype/lift.js`: the ride state machine (`idle → closing → descending → opening`), switch at the
  descent midpoint, disarmed until the car leaves the platform. A gate bar, no doors.
- `prototype/room-eiffel.js`: the 500 × 500 m room at `ROOM_Y = −600`, axis-aligned, centred 215 m ahead of
  the lobby's lift, lift house at the back; `flyAllowed` lets the helicopter fly in the room
  (`room-eiffel.js:50`), refused in the lift and under the roof.
- `prototype/levels.js`: one active level, `groundAt`/`colliders` per level, `onJump()` → surface.
- `prototype/index.html`: `hideoutBuild` (`:1114-1187`) builds walls, rings, stubs, lamps, `lobbyBuild`;
  `roomBuild`/`roomHouse` (`:2049-2087`) the room; `stepLift`/`liftSwitch` (`:2148-2168`); Testhub
  `hideout.tower` (`:2930`).
- The rock over R0 is deep: the ridge is 100–167 m high there, R0's floor 70.6 m (2026-10-10 probe, cave spec
  line 18), and the #102 cavern at R0 held a 33 m tower. A hall of 25 m radius at the same place fits.

## Design

### Layout (plan view; +x east, +z south; heading `H` = 95°, `f` = (cos H, sin H))

```
 surface level                                  'ring' level (y = −600)          room level k (y = −600)
 gate ─ T1 105 m ─┐                                    spoke k (s 0..100)
                  ▼                              ┌───────── 30 ─ 40 ▓dark▓ 60 ─ 70 ─────────┐
          ┌── lift hall r 25 ──┐                 │ ring draws s 0..70   room draws s 30..100 │
          │  A ▕ cabin 8×22 ▏ B│  ── ride ──►    │ switch: ring→room at s ≥ 52, back at ≤ 48 │
          └────────────────────┘         cabin ─ B ─ exit 41 m ─► ring r 60 (16 m wide)      │
            door A works above            door B works below        8 spokes, 45° apart ──► portal in
                                                                                        the room's tree ring
```

- **Above ground (surface level).** T1 unchanged (mouth, heading, 105 m, `hw` 4.5, gate, lid, cave light).
  R0 becomes the **lift hall**: same centre `C` = T1's end (−712.8, 1528.2), floor radius 25 m
  (`HIDEOUT.cavernHw` 20 → 23, so `cavernR` = 25), ceiling the hill's underside (`'lid'`, as R0). N1, T2a,
  T2b, the lobby, both stubs, their „KEIN ZUTRITT" signs and the lobby lamps are removed. `CAVE` keeps its
  shape (`nodes`, `links`, `stubs`) with one node `hall` and empty `links`/`stubs`, so `caveCuts`, `roomAt`,
  `ringArcs`, `ceilingAt` keep working unchanged in kind.
- **The lift** stands in the hall's centre on T1's axis: cabin interior 8 × 22 m (`hw` 4, `hd` 11), axis
  `th = H`. Door **A** at `C − f·hd` faces the tunnel, door **B** at `C + f·hd` faces away. Doors 6 m wide,
  5 m high, panels rise into the lintel. Around the cabin a concrete shaft house 8 m high (side walls, end
  walls with the door openings). The cabin deck has today's dark steel and yellow edge strips. **Above, only
  door A works** (B's end is a solid wall); **below, only door B works** (A's end is a solid wall). That is
  exactly the drive-through the decision describes: in through A, out through B below, back in through B,
  out through A above.
- **Below (new level `'ring'`, y = −600).** The cabin sits at the same x/z (the ride only changes y, as
  today). From door B a straight **exit** (10 m wide, ceiling 7 m) runs along `f` from the cabin end (11 m) to
  the ring's inner edge (52 m). The **ring**: centre line radius 60 m, 16 m wide (52..68), ceiling 9 m,
  concrete floor, emissive ceiling light strips, no point lights. **Eight spokes** leave the ring's outer wall
  at angles `H + 22.5° + k·45°` (k = 0..7, so the exit lands between spokes 7 and 0 and the player sees the
  ring, not a spoke, straight ahead), each 10 m wide, ceiling 7 m, 100 m long (s = 0 at r 68, s = 100 at
  r 168).
- **Rooms (levels `'eiffel'`, `'room1'` … `'room7'`, y = −600).** Room k is today's Eiffel room as a
  **template**: the 500 × 500 m lawn, double tree ring, edge colliders, gravel path from the portal to the
  95 m loop, the loop, the clouds, the room sky look. The square is rotated so that its near edge is
  perpendicular to spoke k and passes through the spoke's end `P_k` (r 168); centre = `P_k + u_k·250`. The
  **portal** stands in the tree ring at `P_k`: a concrete face with a 10 × 7 m opening; the edge collider strip
  and both tree rows have a 12 m gap there. The template takes an `object`: `EIFFEL` for slot 0, `null` for
  slots 1–7. With an object the room has today's tower, feet colliders, placeholder/GLB and `towerView`;
  without it, just the lawn and paths. The Eiffel tower itself stays unrotated (the feet are world-axis
  boxes, `EIFFEL.feet`), so the room is taken over 1:1; only the lift house is replaced by the portal.
- **Dark stretch and level switch.** Both levels draw the overlapping part of the spoke: the ring level
  s 0..70 (black end cap at 70), the room level s 30..100 (black cap at 30). Between s 40 and 60 the tunnel
  lining is black (fading back to concrete over 10 m each side), so nothing switches in view. Switching is
  by position with hysteresis: on `'ring'` in spoke k at s ≥ 52 → room k; on room k at s ≤ 48 → `'ring'`.
  The car keeps x, y, z and its speed; no teleport, no race flag. The chase camera (≤ ~15 m behind) always
  stays inside the drawn overlap.
- **One room loaded at a time (#308).** The ring level and the pure layouts (ground, colliders, ceilings)
  of all eight rooms are registered on the first ride down (cheap, no meshes). A room's meshes are built
  when the car enters its spoke (s > 0 on the ring level), and the previously built room's meshes are
  disposed then (the loaded Eiffel GLB is kept in memory and re-attached).
- **Signs.** Each room has `{ id, name, object }` in `ROOMS`. A spoke mouth gets a name sign (over the
  opening, facing into the ring) **only when the room has an object**; at the start only spoke 0 carries
  „La Tour Eiffel". Proper names, the same in de and en, not run through `tr()`.
- **Clearance.** Everything fits an 18 m articulated bus (2.55 m × 3.3 m): T1 9 m wide / 12 m ceiling, gate
  opening 9 × 5 m, doors 6 × 5 m, cabin 8 × 22 m, exit and spokes 10 m wide / 7 m, ring 16 m / 9 m, portal
  10 × 7 m. A pure test (`underground.test.mjs`) pins these numbers from the module constants.

### Lift behaviour

- **Door.** A door opens when the car is within 15 m of it (or in the cabin) on the level where the cabin
  is, and the lift is idle; it closes again when the car is farther. Opening and closing take
  `LIFT_TIMES.open` / `close` (1 s). A door counts as passable from 90 % open; its collider is skipped then.
- **Ride.** Unchanged in kind: the vehicle stands in the cabin (its whole length inside: centre within
  `hd − halfLength`) at < 0.5 m/s for 1 s → the door shuts (1 s) → descent/ascent (6 s) with the floor
  indicator and the hum; the level switches at the midpoint → the arrival door (the working door of the new
  level, which is the one in front of a car that drove in forwards) opens (1 s). Disarmed until the car
  leaves the cabin. During the descent the shaft-scroll texture (`CAB`, now a box on the cabin's inner
  faces) is shown.
- **Cabin position.** The lift knows on which level the cabin is (`'top'`, `'bottom'`). Whenever the game puts
  the car on a level without a ride (J, beam, autopilot, Testhub, a ride aborted by a jump), the cabin is put
  on that level too, so the car is never stranded at a shut door.

### Rules below

| What | Behaviour |
|---|---|
| Find | „Versteck gefunden!" / „Hideout found!" + jingle when door B opens below for the first time (today's `done`/`down` hook, unchanged text) |
| **R** in a room | Back at the room's portal (20 m into the lawn, facing the room's centre) |
| **R** in the ring or a spoke on the ring level | Back at the lift exit in the ring (the exit's ring end, facing out along `f`) |
| **R** on the surface after a ride up | In front of door A in the hall, facing the tunnel |
| **F** | Refused in the lift, in the ring level and under the hill (`hideoutNoSky`); rooms keep today's helicopter (sky, soft wall 25 m inside the tree ring, ceiling) in each room's own rotated frame |
| **J**, beam, Testhub, autopilot | Back to the surface (level reset first), cabin placed `'top'` |
| Race | Riding the lift counts like a jump (unchanged); the spoke switch does not |
| Testhub `hideout.tower` | Builds the ring + Eiffel room, places the car at the Eiffel room's `towerView`, cabin `'bottom'` |

### Modules (pure, no three.js/DOM, `node --test`)

- **`hideout.js`** (surface): `HIDEOUT.cavernHw = 23`; `CAVE = { nodes: { hall: { c: R0, r: 23, ceiling: 'lid' } },
  links: [], stubs: [] }`; `CAVE_LAMPS = { hall: … }` (two lamps on T1's axis 16 m either side of the centre,
  clear of the cabin); `LIFT = { c: C, th: H, hw: 4, hd: 11, door: { hw: 3, h: 5 }, height: 8, near: 15 }`;
  `onLiftPlatform(x, z, pad, l)` unchanged; new `inCabin(x, z, halfLen, l)` (the whole vehicle inside), `liftDoor(level, l)` → `{ x, z, th }` (A for `'top'`, B for `'bottom'`), `nearLiftDoor(x, z, level, l)`,
  `liftColliders(level, floorY, l)` (shaft-house walls, the closed end wall, the door panel flagged
  `liftDoor: level`; all `secret: true`). Removed: `sightBlocked`/`inCaveAir` (the lift is meant to be seen
  from the gate now) and the lobby/N1/T2 specifics; the generic link/stub helpers stay (empty lists).
- **`lift.js`**: `createLift` gains `cabin`, `door`, `doorAt(level)`, `place(level)`; `step(dt, input)` takes
  `{ onPlatform, near, level, speed, dir }` (`near`/`level` default to `onPlatform`/the cabin's level, so old
  callers keep working). `gate`, `floor()`, `abort()`, `setTimes`, `shaftScrollDelta` unchanged.
- **`underground.js`** (new): `BELOW_Y = −600`, `RING`, `EXIT`, `SPOKE`, `spokeFrame(k)`, `spokeAt(x, z)`,
  `belowLevelAt(current, x, z, roomIds)`, `ringColliders()`, `ringCeilingAt(x, z)`, `ringSpawn()`,
  `spokeSigns(rooms)`.
- **`rooms.js`** (`git mv room-eiffel.js rooms.js`): `ROOM_Y` (= `BELOW_Y`), `ROOM_HALF`, `ROOMS`,
  `roomLayout(k, room)`, `eiffelRoom()` (= `roomLayout(0)`), `isRoomLevel(id)`, `flyAllowed`, `ROOM_FLY`,
  `roomFlyCeiling`, `roomFlyAlt`, `roomFlyClamp(x, y, z, room)` (clamps in the room's own frame).
- **`levels.js`**: `ceilingAt(x, z)` of the current level (`null` when the level has none), for the camera.

### `index.html`

- `hideoutBuild`: T1 walls, the hall's ring wall (one opening, towards T1), gravel on T1 and the hall, the
  hall's four lamp posts and two lights, the shaft house + cabin + door A panel (`liftBuild(level, y, group)`
  shared with the ring level). The lobby, N1, T2, stubs, `lobbyBuild`, `liftGateMesh`/`placeGate`/`LIFT_GATE`
  and `roomHouse` go.
- Collisions: `collide()` and the camera's wall test skip an OBB with `liftDoor` while
  `LIFT_RIDE.doorAt(o.liftDoor) ≥ 0.9`.
- `stepLift`: passes `near`, `level` (`'top'` on the surface, `'bottom'` on the ring level, no lift in rooms)
  and the vehicle half length; animates the door panels from `doorAt`; `CAB` (a back-faced box on the cabin's
  inner faces) shows only while descending.
- `liftSwitch`: down → `ringBuild()` (first time), `LEVELS.set('ring')`, `P.safe = ringSpawn()`;
  up → surface, `P.safe` in front of door A facing the tunnel.
- New `ringBuild()` (meshes + register `'ring'` and all eight room levels from `roomLayout`), `ensureRoom(k)`
  (build room k's meshes, dispose the previous room's), the spoke switch in the frame loop
  (`belowLevelAt`), the level look (`'ring'` → a dim cave look without sun; rooms → today's `ROOM_LOOK`),
  `flyZone()` → `'ring'` on the ring level, `underCeiling` below uses `LEVELS.ceilingAt`.
- `roomBuild()` becomes `roomMeshes(layout)`: lawn, paths, trees, clouds, the portal (face + spoke tunnel
  s 30..100 with its dark lining and cap), and — only with an object — the tower placeholder/GLB.
- Test hooks: `__mm.hideout()` (rooms `{ hall }`, `lift` with both doors), `__mm.lift()` (+ `cabin`, `door`),
  new `__mm.below()` (`{ level, spoke, built, signs }`).

## Testing

- **Node** (`node --test prototype/tests/*.test.mjs`): `hideout.test.mjs` (hall disc 25 m, two cuts, lift
  in the hall on T1's axis, doors, colliders, clearance), `lift.test.mjs` (door proximity, cabin level,
  `place`, arrival door, old tests stay green), `underground.test.mjs` (spokes 45° apart and offset from the
  exit, `spokeAt`, switch hysteresis, ring closed except exit and spokes, only the Eiffel spoke signed),
  `rooms.test.mjs` (the ported Eiffel tests on the rotated room, the portal opening, the empty rooms),
  `room-fly.test.mjs` (rotated clamp, the ring refuses F), `levels.test.mjs` (`ceilingAt`).
- **Playwright** `prototype/tests/test_hideout.py` (a deliberate, specified rewrite of the R0/N1/lobby tests):
  drive T1 into the hall → door A opens near, no find; stop in the cabin → ride → `'ring'`, find toast;
  drive out of the exit, along spoke 0 → level `'eiffel'`, portal, drive under the tower, back → `'ring'`,
  into the cabin from B → up → door A open, surface; R in ring / room; F refused on the ring level, the
  room helicopter tests in the rotated Eiffel room; only spoke 0 signed; one room built at a time.
  `test_lobby_hidden_from_the_mouth` is removed (the lift is visible from the gate by design). Run only this
  file and the affected node tests (the full browser suite takes ~2 h).

## Acceptance criteria

- [ ] Behind the gate a straight tunnel (T1) leads into a round lift hall of 25 m radius at T1's end; R0, N1,
      T2a, T2b, the lobby and both stubs are gone.
- [ ] The freight lift (cabin 8 × 22 m, doors 6 × 5 m) stands in the hall on T1's axis; its door towards the
      tunnel opens when a vehicle comes within ~15 m and the cabin is on that level, and closes when it leaves.
- [ ] Standing in the cabin for 1 s starts the ride: door shuts → ride with floor indicator → the door in front
      of the car opens; down it is the ring-side door, up the tunnel-side door; nobody has to turn.
- [ ] Below, a short exit leads from the lift to a tunnel ring (r ≈ 60 m, 16 m wide) with 8 spokes 45° apart,
      10 m wide, ~100 m long.
- [ ] Each spoke ends, after a dark stretch where the level switches unseen, in a tunnel portal in the tree ring
      of its own room level; only one room's meshes are loaded at a time.
- [ ] The Eiffel room is today's room (tower, feet, paths, trees, sky) with the lift house replaced by the portal;
      the other seven rooms are the same without an object.
- [ ] Only the Eiffel spoke carries a name sign („La Tour Eiffel", same in de/en); empty rooms' spokes have none.
- [ ] Gate, tunnels, lift, ring, spokes and portals fit an 18 m articulated bus (2.55 m wide, 3.3 m high).
- [ ] „Versteck gefunden!" appears when the door opens below for the first time; R puts the car at the current
      room's portal, or at the lift exit in the ring; F is refused in the ring level and the lift.
- [ ] J / Testhub / autopilot from below return to the surface; `hideout.tower` lands in the Eiffel room.
- [ ] Node tests and `test_hideout.py` pass; the page loads with an empty console.

## Assumptions

- **A1** [high] The lift hall replaces R0 at the same centre (T1's end), floor radius 25 m via `cavernHw` 23,
  ceiling the hill's underside. Rejected: a new hall position (a longer or bent tunnel). The decision says
  "straight tunnel"; T1 is straight (`hideout.js:9`) and R0's rock depth is ample (ridge 100–167 m over a 70.6 m
  floor, cave spec line 18).
- **A2** [high] Each level has one working door: A (towards the tunnel) above, B (towards the exit) below; the
  other end is a wall. Rejected: both doors working on both levels. The decision's sequence („out at the
  front below, back in at the front on the way up, out towards the exit above") only ever uses A above and B
  below; a second working door would open onto rock (below) or the hall's back wall (above).
- **A3** [med] The cabin is put on the car's level on every non-ride placement (J, Testhub, abort) instead of an
  empty "call" ride. Rejected: a call mechanism with a ride without the car. Same player-visible result, one
  state less; the only ways below are the lift and the Testhub (`index.html:2930`).
- **A4** [high] The ring and all rooms are at y = −600 (`ROOM_Y`), each its own level; rooms overlap in plan
  but never coexist. Rejected: different depths per room. Only one level is ever active
  (`levels.js:5-13`), and equal depths make the spoke switch a pure level swap with no y jump.
- **A5** [med] Spokes at `H + 22.5° + k·45°`; spoke 0 (the first clockwise in +x/+z terms from the exit) is the
  Eiffel room. Rejected: a spoke straight on the exit's axis (the player would drive out of the lift straight
  into a spoke, missing the ring). The issue fixes 45° spacing, not the phase.
- **A6** [high] Dark stretch s 40–60 of 100, switch at s 52 (in) / 48 (out), ring draws s 0–70, room s 30–100.
  Rejected: a teleport. „like the lift does today" — the lift swaps levels without moving x/z
  (`index.html:2163-2167`).
- **A7** [med] Signs hang over the spoke mouth on the ring side (where the player chooses a spoke). Rejected: a
  sign at the room portal (seen only after the choice). The decision says "each spoke portal carries the
  room's name"; the ring side is where it informs.
- **A8** [med] **F** stays refused in the ring level, the lift and the tunnels, and stays allowed in the rooms
  as today. Rejected: refusing F in the rooms too. The decision says F "stays refused below"; today the
  Eiffel room allows it (`room-eiffel.js:50`, `room-fly.test.mjs:10`), and "stays" reads as "unchanged".
- **A9** [med] `room-eiffel.js` is renamed to `rooms.js` (git mv) because it now holds the template and the room
  table. Rejected: keeping the old name for a module of eight rooms. Only `index.html:361` and two tests import it.
- **A10** [high] The ring is lit by its look (hemisphere) and emissive ceiling strips, no point lights.
  Rejected: point lights along the ring (eight or more per-fragment lights cost every frame). The cave already
  limits itself to a few point lights (`hideout.js:34-44`).
- **A11** [high] All eight room levels are registered from their pure layouts on the first ride; only meshes are
  built per room (on entering its spoke) and the previous room's are disposed. Rejected: building all eight
  room groups up front (eight times today's ~1000 trees and clouds) — against #308.
- **A12** [med] The find toast's text stays unchanged (it mentions the Eiffel Tower, which is still the only
  object). Rejected: new text. The decision only moves the moment („when the door opens below").
- **A13** [high] Empty rooms keep both gravel paths (portal → centre and the 95 m loop) and have no tower view in
  the Testhub. Rejected: lawn only. "Same as the Eiffel room (lawn, tree ring, gravel paths, sky)".

## Consequences

- The lift hall is visible straight down the tunnel from the gate (the lift doors at the end of T1). The #201
  rule "the tower is not visible from the entrance" still holds, since the tower is far below; the
  `sightBlocked` helper and its tests go.
- The path from the gate to the tower gets longer: 105 m T1 + ~14 m hall + ride + 41 m exit + ~20 m of ring +
  100 m spoke + ~170 m to the tower, about 30 s plus the 8 s ride.
- The R0 floor sinks by 0.15 m (`floorAt` levels from `length − cavernR`, 80 m instead of 83 m); the cut floor
  stays step-free.
- The surface forest, map and helicopter over the Hübel see a smaller roofed footprint (only T1 and the hall),
  so trees return over the former N1/T2/lobby area and the minimap shows the plain hill there.
- `index.html` is also changed by open PR#350 (on foot, #202, `liftOnPlatform`, `roomFlyClamp(..., ROOM.layout)`)
  and the planned #346 start screen. Whoever lands second rebases on `main`; `ROOM.layout` keeps meaning
  "the current room's layout" so the on-foot clamp keeps compiling, but on the ring level it must not clamp
  to a room square.
- Each first visit of a room costs one build (trees, clouds, `renderer.compile`) while the car is still in the
  bright part of the spoke, ~50 m before the switch.
