# Rally hall in star room 5 (#859)

Status: enriched 2026-11-11. Deadline from the issue: **live on the site Tuesday 2026-11-17 15:15** (demo), merge by
Monday evening 2026-11-16. Scope is cut to what one unattended pipeline run ships reliably. Follows the Artemis II room
(#488, PR#490, `docs/superpowers/specs/2026-10-26-hideout-artemis-room-design.md`), the Space Shuttle room (#811) and
the Ferris wheel (#513); object list and rules in #420.

## Goal

Star room 5 of the hideout (the third room on the left from the lift; the next free room in `NEXT_ROOMS`, which is
`[7, 2, 6, 3, 5, 4]` with 7, 2, 6 and 3 taken) holds a **rally hall**: an open-fronted showroom hall, 72 m wide, 40 m
deep and 14.8 m high, with **three rally cars life size on podiums**: the **Toyota GR Yaris Rally1** of Elfyn Evans, the
**Hyundai i20 N Rally1** of Thierry Neuville and the **Subaru Impreza WRC** of Colin McRae (1990s). The cars are built
from boxes and cylinders in plain single-colour paint: no logos, sponsor liveries, badges or lettering (#420 licence rule).

**Success criterion:** driving into spoke 5 builds the room with the hall in the centre and the three cars on their
podiums, noses to the open front; the car drives along a gravel apron into the hall, round the podiums and out; the
walls, the front posts, the podiums and the cars are solid, the floor between them is free; the roof is a deck the
car drives under and the helicopter cannot fly through; no file is fetched; the spoke stays unsigned; `node --test`
and one targeted Playwright test pass; the page loads with an empty console.

## Out of scope

- A downloaded GLB of any of the cars (see A1: procedural now; a model can replace the meshes later behind the same
  layout).
- Driving the rally cars (they are exhibits; "maybe drivable later" in #420 is a separate issue), entering them on
  foot, interiors (#412).
- Real liveries, sponsor logos, manufacturer badges, number plates, lettering on the hall (A4).
- Spot lights, sound, a service park, other rally cars; the Speicherstadt redo (#666) and the other free rooms.
- A spoke sign or a room name shown to the player (#420 surprise rule: `signed: false`).
- Testhub target, hub screenshot, F1 credit line (nothing third-party to credit).

## Today (evidence)

- `rooms.js:22-31` `ROOMS`: rooms 4 and 5 are `{ id, name: null, object: null }`; every room with an object carries
  `signed: false`. `:35` `NEXT_ROOMS = [7, 2, 6, 3, 5, 4]` (the fill *order*, taken rooms stay in it; the comment at
  `:32-34` says "5 is next"). The queue in #420 lists room 4 for this demo; the next free room by `NEXT_ROOMS` is 5
  (the Speicherstadt #666 was pulled again in PR#727), so this spec follows `NEXT_ROOMS` (A2).
- `rooms.js:108-189` `roomLayout(k)`: room frame `f` (into the room) / `v` (across), `loc(a, b)` centre-relative
  (`:113`); `:150-151` the Artemis placement is selected by `room.object.capsule` and its colliders pushed; `:156-157`
  the Shuttle the same by `room.object.orbiter`; `:174-177` the gravel: portal → 95 m loop end, the 95 m loop, then
  `paths.push(...)` for an object's own ring; `:185` the layout returns the placements (`artemis`, `ferris`,
  `shuttle`, ...); `:188` `towerView` exists whenever `room.object` is set.
- `artemis.js:1-81`: the pattern for a pure procedural object: a descriptor (`ARTEMIS`, numbers only), `*Parts()`
  returning primitives, `artemisPlacement(room, cfg)` returning world positions, the gravel ring and `low: true`
  colliders (`box()` at `:62`), so the car stops on the floor and the helicopter passes over each top.
  `artemismesh.js:9-26` merges one mesh per colour (`userData.role`), `:38-41` `artemisTriangles(group)`.
- `shuttle.js` / `rooms.js` `bridge` colliders (`{ bridge: true, y0 }`, `rooms.test.mjs:10`): a deck the car on the
  floor drives under while a flying object is stopped at `y0` — the way a roof works here.
- `index.html:3422` `ROOM` state (one slot per object: `figure`, `artemis`, `shuttle`, ...); `:3589-3598` `ensureRoom(k)`
  resets the slots (`:3591`), builds `roomMeshes`, counts `__mm.counts[R.object.key]`, and loads a model only when
  `R.object.url` is set — an object without `url` is purely procedural; `:3600-3611` `roomMeshes` calls
  `roomArtemis(group, R)` & co. when the layout carries them; `:3648-3655` `roomArtemis` is the template (oriented
  boxes via `orientedBox` at `:3445`, `rocket.rotation.y = -th`, `ROOM.artemis` for the debug hook); `:3929`
  `__mm.artemis` hook.
- `tests/rooms.test.mjs:27` fixes "rooms 4 and 5 have no object" (`ROOMS.slice(4, 6)`) — must change (room 5 gets an
  object); rooms 0, 3 and 4 are the template fixtures elsewhere (`:65, :89`), room 5 only in the trees test (`:78`,
  unaffected). `tests/test_hideout.py:1040` uses empty room 4 (unaffected); `:1192-1218` the Artemis room test and
  `into_room(page, k, room_id)` at `:932` are the template for the browser test.
- `rally.js` (the vehicle table's "Rhy Rally" i20 WRC look-alike, `assets/rally.glb`, 3D Warehouse General Model
  License) is a *drivable vehicle*, not a room object; the new files therefore use the name `rallyhall` throughout.
- `.github/workflows/agent.yml:23`: the pipeline implements on the default model; `model:fable` is a per-issue label.
- Real dimensions (manufacturer / FIA data, rounded; "about"): Rally1 cars (Yaris, i20 N) about 4.1 m long, 1.88 m wide
  (FIA maximum 1.875 m + arches), 1.40 m high, wheelbase about 2.6 m, 18-in rally wheels of about 0.33 m radius; the
  Impreza WRC (1997 – 2000, 555 / S4 – S6 look) about 4.34 m long, 1.77 m wide, 1.42 m high, wheelbase 2.52 m.

## Model source (decision: procedural)

| Source | Why not |
|---|---|
| Sketchfab / TurboSquid / CGTrader car models | Downloads need a logged-in account the pipeline has not got (the maintainer fetched the bus, Mini and Mazda by hand). Rally models nearly all carry the real sponsor liveries (Toyota Gazoo, Hyundai Motorsport, 555 / Subaru, Red Bull ...) — against the "no logos, no liveries" rule; stripping textures is a Blender job. |
| `assets/rally.glb` (own "Rhy Rally", i20 WRC 2013) | Already licence-clean and unbranded, but it is one car, the wrong generation for Neuville's Rally1, and the room loader (`object.url`) fetches one model per room. Using it for one car and boxes for two would mix looks. |
| NASA/Wikimedia-style open sources | Nothing fitting for rally cars. |

**Recommendation: build the hall and all three cars procedurally in three.js** (boxes and cylinders, about 1–3k
triangles), exactly as the Artemis room was. No download, no licence file, nothing to credit, and the look is under
control. A GLB can replace the meshes later behind the same layout.

## Design

### Where things stand (room frame: `a` from the centre towards the far edge, `b` across; 0,0 = room centre)

```
                    far edge (a = +250)
      ┌───────────────────────────────────┐
      │         95 m gravel loop          │
      │     ╭─────────────────────╮       │
      │    │ ┌───────back wall───┐ │      │   hall 72 x 40 m, centre (0, 0); back wall at a = +20
      │    │ │  ◯ car   ◯ car  ◯ car│ │   │   podiums at a = +4, b = -22 / 0 / +22 (r 4.5 m, 0.5 m high)
      │    │ │ Neuville Evans McRae  │ │   │   noses to the open front
      │    │ └┐                    ┌┘ │    │   front posts at the corners; roof 4 m past the front
      │     ╰──────── apron ───────╯      │   gravel apron from the loop (a = -95) to the roof edge (a = -24)
      │  path portal → loop ──────        │
      └────────────┐ ┌────────────────────┘
                 portal (a = -250)
```

- **Hall.** Floor slab 72 × 40 m, 0.15 m over the lawn (flat box, no collider). Back wall (a = +19.7) and two side walls
  (b = ±35.7), 0.6 m thick, solid to the roof top 14.8 m, light grey; on the back wall's inside a **dark glass band**
  (y 3 – 9). The **front (a = −20) is open**; two 1 m square posts stand at its corners (b = ±35.5). The **roof** is
  a flat slab 14.0 – 14.8 m, 72 m wide, 44 m deep (4 m canopy past the front), mid grey. No signs, no lettering.
  Colliders (all `low: true`): back wall, two side walls, two posts (solid to 14.8 m), and the roof as a
  `bridge: true` deck from `y0` = 14.0 over the floor to 14.8 (the car drives under, the helicopter cannot fly through
  the roof; flown over above 14.8 m it is free).
- **Cars** (each in its own frame: +x nose, y up with the tyres at y = 0, z across), from `carParts(car)`:
  lower body box (0.14 – 0.64 m, full length and width), cabin box (0.64 m to the car's height, 0.48 of the length,
  0.78 of the width, a little aft), a dark window band on it, a front splitter, a rear wing (plane at the top, two
  uprights), four wheels (cylinders across the car, dark tyre, silver rim). Plain paint per car (A4):
  Evans **red**, Neuville **light blue**, McRae **deep blue**. Sizes in `RALLYHALL.cars` (see Evidence).
- **Podiums.** Round, r 4.5 m, 0.5 m high, white-grey, one per car at a = +4, b = −22 / 0 / +22 (Neuville, Evans,
  McRae from the left of the portal view). The cars stand on top, turned about 30° (outer cars) so all noses look
  at the open front. Each podium + car is one collider: square, `hw` 3.0 centred on the podium, `low: true`, solid to
  0.5 + car height + 0.6 (A5).
- **Paths.** The existing portal → loop path and the 95 m loop stay; the **apron** is a third gravel strip, `hw` 5,
  from the loop's near point (a = −95) straight to the roof edge (a = −24); the floor slab continues it into the hall.
- **Lazy build.** As every room: meshes are built in `ensureRoom(5)` on entering spoke 5 and disposed when another room
  is built (`disposeGroup`). No fetch (`object.url` absent). `__mm.counts.rallyhall = 1` while built.
- **Sign / credits.** `ROOMS[5] = { id: 'room5', name: 'Rally hall', object: RALLYHALL, signed: false }`; `spokeSigns`
  stays empty. Nothing third-party: no `CREDITS.md`, README or licence change. The CHANGELOG entry says the hall and
  cars are built from simple shapes.

### Modules

- **`rallyhall.js`** (new, pure, no three.js/DOM; `node --test tests/rallyhall.test.mjs`): `RALLYHALL` descriptor
  (`key: 'rallyhall'`, `h: 14.8`, `hall`, `podium`, `apron`, `cars`, `colours`), `carParts(car, cfg)` → `[{ kind: 'box',
  x, y, z, sx, sy, sz, colour } | { kind: 'wheel', x, y, z, r, w, colour }]` in the car's frame, `carExtent(parts)`,
  `rallyhallPlacement(room, cfg)` → `{ hall: { x, z, th }, cars: [{ id, x, z, th }], apron: [[x, z], [x, z]], colliders }`.
- **`rallyhallmesh.js`** (new, three.js, not unit-tested — like `artemismesh.js`): `buildCar(car, cfg)`, `buildHall(cfg)`
  → `THREE.Group`s in the hall's frame (x along `f`, z along `v`, y = 0 on the floor), one merged
  `MeshLambertMaterial` mesh per colour, `userData.role = 'rallyhall'`; `rallyhallTriangles(group)`.
- **`rooms.js`**: import; `ROOMS[5]`; in `roomLayout`, after the shuttle lines: `const rallyhall = room.object &&
  room.object.cars ? rallyhallPlacement(...) : null;` colliders pushed, the apron appended to `paths`, `rallyhall`
  returned; the `NEXT_ROOMS` comment updated (5 taken, 4 last).
- **`index.html`**: imports; `ROOM.rallyhall` slot (declared and reset with the others); `roomMeshes` calls
  `roomRallyhall(group, R)` which places `buildHall` at the centre turned by `−th`; `window.__mm.rallyhall` →
  `{ built, hall, cars, h, tris, colliders }`.
- **Tests**: `tests/rallyhall.test.mjs` (new), `tests/rooms.test.mjs` (one test rewritten, two added),
  `tests/test_hideout.py` (one new browser test, run alone).

## Acceptance criteria

- [ ] `ROOMS[5]` is `{ id: 'room5', name: 'Rally hall', object: RALLYHALL, signed: false }`; `NEXT_ROOMS` is still
      `[7, 2, 6, 3, 5, 4]`; `spokeSigns(ROOMS)` is still empty; room 4 stays empty.
- [ ] `RALLYHALL.cars` has three cars (`neuville`, `evans`, `mccrae`), each 4.0 – 4.4 m long, 1.75 – 1.9 m wide, 1.35 –
      1.45 m high; `carParts(car)` has extents equal to the car's `len` / `wid` / `hgt` (±0.05 m), four wheels with the
      car's `wheelR` standing on y = 0 at ±`wheelbase`/2, a rear wing, nothing under 0.05 m except the wheels, and only
      the car's paint plus the four neutral colours (glass, dark, tyre, rim) — no other colour.
- [ ] `rallyhallPlacement` puts the hall at the room centre and the cars at (a, b) = (+4, −22), (+4, 0), (+4, +22),
      noses towards the portal side (`cos` of the heading relative to `f` < 0); it returns 9 colliders (back wall, 2 side
      walls, 2 posts, the roof, 3 podium+car squares), all `low: true`; the walls and posts solid to ≥ 14.8 m over the
      floor, the roof a `bridge` with `y0` = 14.0 over the floor, each car square solid to ≥ 2.4 m.
- [ ] `roomLayout(5)` blocks the car at the back wall, a side wall, a front post and a podium, and leaves the hall
      floor between the podiums, under the roof at the front, the apron and the 95 m loop free; `paths` has three
      entries (portal → loop, the loop, the apron from a = −95 to a = −24); a flood fill from the spawn reaches the
      hall floor on both sides of every podium.
- [ ] Entering spoke 5 builds the room (`__mm.rallyhall().built === 5`, `tris` between 500 and 30 000,
      `counts.rallyhall === 1`, no `.glb` request); `__mm.pushAt` at the back wall and at a podium pushes, at the hall's
      centre floor and on the apron it does not; the page keeps an empty console.
- [ ] The cars are plain red / light blue / deep blue; nothing in the room reads as lettering, a logo, a badge or a
      sponsor livery.
- [ ] Leaving for another room and coming back rebuilds it (no leak: `disposeGroup` frees it like every room).
- [ ] CHANGELOG `[Unreleased]` → `### Added` has one timestamped, player-facing entry (English), saying the hall and
      the three cars are built from simple shapes in the game, not a downloaded model.
- [ ] `node --test tests/*.test.mjs` is green; `pytest tests/test_hideout.py -k rallyhall` is green; no other
      Playwright file is run.

## Assumptions

- **A1** [high] **Procedural geometry, no downloaded model.** Rejected: Sketchfab / marketplace rally models (account
  needed; real sponsor liveries in the textures, against the unbranded rule), `assets/rally.glb` (one car, wrong
  generation, one-model room loader). The issue allows simple shapes explicitly. A model can replace the meshes later;
  `rallyhall.js` stays the collider/placement source then.
- **A2** [med] **Room 5, not the queue's room 4.** `NEXT_ROOMS` (the fill order, #420 rule "it takes the next room in
  `NEXT_ROOMS`") makes 5 the next free room; the Speicherstadt (#666, queued for 2026-11-10 in room 5) was pulled again
  (PR#727) and has no live implementation. Rejected: room 4 as the queue says (breaks the fill order: 4 is the room
  straight behind the lift and last on purpose). Consequence: the Speicherstadt redo takes room 4 instead; the
  maintainer should adjust the queue.
- **A3** [med] **An open-fronted 72 × 40 × 14.8 m hall with three podiums**, in the room centre, inside the 95 m loop.
  Rejected: a closed hall with a door (the car could not drive in without a door mechanic), a bare lawn with three
  podiums (no "hall"), a hall as large as the Atomium room's tower (scope).
- **A4** [med] **Unbranded plain paint: red, light blue, deep blue**, no sponsor livery, badge, number or lettering,
  generic box shapes (not copies of any manufacturer's design details). Rejected: the real liveries (trademarks, the
  #420 rule), white cars (vanish against the hall's light grey).
- **A5** [med] **One square `low` collider per podium + car** (`hw` 3.0), like the Artemis capsule — the car stops on the
  floor, the helicopter / hovering walker pass over. Rejected: per-car oriented boxes (the 30° turn would need rotated
  colliders for no gameplay gain), no collider on the cars (the car would drive through them).
- **A6** [med] **The roof is a `bridge` collider** (car drives under, helicopter stopped from y0 = 14.0 up to 14.8).
  Rejected: no roof collider (the helicopter would fly through a visible roof), a full-height solid roof (the car
  could not drive in).
- **A7** [high] `NEXT_ROOMS` stays `[7, 2, 6, 3, 5, 4]` (fill order; taken rooms stay in it); only its comment changes.
- **A8** [high] The spoke stays unsigned (`signed: false`); the name `'Rally hall'` is for the console line and the debug
  hooks only (#420 surprise rule).
- **A9** [med] **Real dimensions are rounded "about" figures** (Rally1 about 4.1 × 1.88 × 1.40 m; Impreza WRC about
  4.34 × 1.77 × 1.42 m); the tests bound them in ranges, not exact values. Rejected: exact homologation numbers
  (not needed for a look, and they differ by year and source).
- **A10** [med] **No new strings, no credit line, no `CREDITS.md` change** — nothing third-party is used. Rejected: an
  F1 line "built from simple shapes" (noise beside the real credits).
- **A11** [med] **Mesh task as a short graphics pass.** Plan Task 4 is the graphics task; every number comes from
  `rallyhall.js` and the file is boxes and cylinders, so the default pipeline model can do it. Rejected: labelling the
  whole issue `model:fable` (no Fable for big implementations).
- **A12** [med] **Triangle budget 500 – 30 000** for the Playwright assertion (about 12 boxes + 4 wheels per car,
  ≈ 100 triangles each car with 16-segment wheels, plus the hall). Wide on purpose. Rejected: a tight bound (a look
  choice must not fail the test).
- **A13** [med] **CHANGELOG timestamp is the time the entry is written** in Swiss local time
  (`TZ=Europe/Zurich date '+%F %H:%M'`); the maintainer can touch it up on merge. Rejected: the demo time 15:15.
- **A14** [med] The Playwright test fetches nothing and asserts **no `.glb` request** in room 5, pinning the procedural
  choice. Rejected: waiting for a load.

## Consequences

- Room 5 becomes the second room with an object without a model file; `ensureRoom` and `loadModel` are untouched
  (the `object.url` guard covers it). `towerView` and `__mm.below().object` work as for the others.
- `rooms.test.mjs` loses room 5 as an "empty room" fixture; room 4 stays the empty fixture in the browser test.
- #420's queue says room 4 for this row and room 5 for the Speicherstadt (#666); after the merge the maintainer
  swaps them (the Speicherstadt redo must then use `ROOMS[4]`). This PR does not edit #420.
- #412 (enter on foot) gets an open hall with podiums to walk round and `rallyhallPlacement` to read the cars' spots from.
- If a licensed model is wanted later, it replaces `buildCar` only; colliders, paths and tests stay.
