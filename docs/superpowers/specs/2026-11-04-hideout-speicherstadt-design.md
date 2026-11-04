# Hamburg Speicherstadt in star room 5 (#666)

Status: enriched 2026-11-04. Deadline from the issue: **live on the site Tuesday 2026-11-10 15:15** (demo),
merge by Monday evening 2026-11-09. Scope is cut to what one unattended pipeline run ships reliably. Follows the
Artemis II room (#488, PR#490, `docs/superpowers/specs/2026-10-26-hideout-artemis-room-design.md`), the Ferris
wheel (#513) and the Vasa (#421); object list and rules in #420.

## Goal

Star room 5 of the hideout (the third room on the left from the lift; the next free room in `NEXT_ROOMS`, which
is `[7, 2, 6, 3, 5, 4]` with 7, 2, 6 and 3 taken) holds **a part of Hamburg's Speicherstadt**: a straight **Fleet
(canal)** 120 m long and 12 m wide with **three red-brick warehouses on each side**, five storeys high under
gabled roofs, and **two bridges** to drive across. All of it is life size and built from simple shapes.

**Success criterion:** driving into spoke 5 builds the room with the canal along the room's forward axis (seen
end-on from the portal), the six warehouses on its banks and the two bridges; the car drives along both
quays, across both bridges and round the canal's ends on gravel; the warehouses, the canal kerbs and the bridge
parapets are solid, the quays, alleys and bridge decks are free, the car cannot drive into the water; the
helicopter flies round the block and over the roofs; no file is fetched (the whole thing is procedural); the
spoke stays unsigned; `node --test` and one targeted Playwright test pass; the page loads with an empty console.

## Out of scope

- A downloaded model of real Speicherstadt buildings (see A1: procedural now; a model can replace the meshes later
  behind the same layout).
- Entering a warehouse on foot (#412), interiors, the Wasserschloss, the Elbphilharmonie, the St. Annen bridge, boats,
  tides, lamps, sound, people.
- Lettering of any kind (company names, the real "SPEICHERSTADT" signs): unbranded (#420 rule).
- A spoke sign or room name shown to the player (#420 surprise rule: `signed: false`).
- Testhub target, hub screenshot, F1 credit line (nothing third-party to credit).
- The other free room (4, the rally hall) and the weekly queue in #420.

## Today (evidence)

- `rooms.js:27` `ROOMS[5]` is `{ id: 'room5', name: null, object: null }`; `:34` `NEXT_ROOMS = [7, 2, 6, 3, 5, 4]`
  (the fill *order*, taken rooms stay in it; the comment above it already says "5 is next"). The queue row in #420
  names room 5, so it matches `NEXT_ROOMS`: no mismatch.
- `rooms.js:82-153` `roomLayout(k)`: centre-relative `loc(a, b)` in the room frame `f` (into the room) / `v`
  (across); `:118-120` the Artemis placement is called from `room.object.capsule` and its colliders pushed; `:142-143`
  the gravel `paths` (portal -> 95 m loop end, the loop) and the extra ring pushed for Artemis; `:151` the layout
  returns the placement next to `ferris`. A Speicherstadt placement is wired the same way.
- `rooms.js:68-80` `RIM = { h: 0.6, hd: 0.5 }`, `WATER_LIFT = 0.12` and `rimColliders`: the kerb round
  the Titanic's basin is a row of `low` boxes the car cannot cross; the Fleet's kerbs are built the same way
  (`speicher.js` cannot import `rooms.js`, it would be circular, so it carries its own copy of these numbers).
- `artemis.js:57-81` `artemisPlacement(room, cfg)` returning `{ ..., colliders }` with `low: true` boxes; `:62-68`
  the helper `box`. `artemismesh.js:9-26` `partsGroup`: one merged mesh per colour, `userData.role`.
- `index.html:2994` `ROOM` state (`artemis`, `ferris` slots); `:3163` `ensureRoom` dispose resets them; `:3183`
  `roomMeshes` calls `roomArtemis` / `roomFerris`; `:3198-3202` `roomBasin` draws water and kerbs; `:3220-3226`
  `roomArtemis`; `:3422` the `__mm.artemis` debug hook. An object without `url` is purely procedural (`ensureRoom`
  loads a model only when `object.url` is set).
- `index.html:4339` `collide`: `if (o.low && P.y >= o.h - 0.2) continue;` -- a `low` collider stops the car on the floor and
  lets the helicopter pass above its top `h`.
- `tests/rooms.test.mjs:27` `for (const r of ROOMS.slice(4, 6)) { assert.equal(r.object, null); ... }` fixes "rooms 4
  and 5 are empty" and must become `[ROOMS[4]]`; `:65`, `:78`, `:89` use `rooms[4]` / `rooms[5]` for the tree and
  two-path checks (`:78` reads trees only and is unaffected; `:89` uses `rooms[4]`, which stays empty).
  `tests/rooms.test.mjs:8-13` helpers `CAR_R`, `rooms`, `inside`, `blocked`, `toWorld`, `toLocal`, `reach`.
- `tests/test_hideout.py:932` `into_room(page, k, room_id)`; `:1189` the Artemis room test is the model for the one
  Playwright test here (`__mm.pushAt` probes along the room frame via `__mm.spoke(k, 0).th`).
- `.github/workflows/agent.yml`: the pipeline implements on the default model; `model:fable` is a per-issue label
  (memory rule 2026-10-11: no Fable for big implementations).
- Real dimensions (Hamburg Speicherstadt, built 1883-1927, UNESCO World Heritage since 2015): warehouses of five to
  seven storeys, about 24-30 m to the ridge, red brick with gables, hoist bays and slender turrets, standing on oak
  piles straight at the Fleet; the Fleete are about 10-20 m wide. The numbers below are a representative block,
  not one specific building (A2).

## Model source (decision: procedural)

Candidates considered 2026-11-04:

| Source | What | Licence | Why not |
|---|---|---|---|
| Sketchfab / TurboSquid Speicherstadt models | detailed buildings | mostly CC BY, some paid | downloads need an account the pipeline has not got; textures usually carry real company signs; poly counts need a decimation pass |
| Hamburg open city model (LoD2) | all buildings as blocks | open-data licence with attribution | CityGML conversion tooling is missing; roof shapes only, no brick or windows; far too large for one room |
| OpenStreetMap footprints | building outlines | ODbL | share-alike attribution for a derived dataset; footprints alone give no look |

**Recommendation: build it procedurally in three.js** (boxes, triangular prisms, a flat water slab), as the Artemis
stack (#488) was built. It is the only path one unattended run can finish before Monday evening: no download, no
licence file, no logo stripping, nothing to credit; the look (red brick, dark roofs, light window bands) is fully
under control. A GLB can replace the meshes later behind the same pure layout.

## Design

### Where things stand (room frame: `a` from the centre towards the far edge, `b` across; 0,0 = room centre)

```
                    far edge
     ┌──────────────────────────────────────┐
     │          95 m gravel loop            │
     │   ┌────┐  ┌────┐  ┌────┐   b = +36   │
     │   │ W  │  │ W  │  │ W  │   warehouses (front b = +16)
     │   └────┘  └────┘  └────┘             │
     │  ═════╪═══════════╪═════  quay b = +11 (gravel, hw 3)
     │  ░░░░░░░░░ Fleet ░░░░░░░░  b = ±6, a = -60..60, bridges at a = ±20
     │  ═════╪═══════════╪═════  quay b = -11
     │   ┌────┐  ┌────┐  ┌────┐             │
     │   │ W  │  │ W  │  │ W  │             │
     │   └────┘  └────┘  └────┘             │
     └─────────────────┬────────────────────┘
                    portal (a = -250), path portal -> loop, connector loop -> quay end
```

- **Fleet.** A water slab 120 m (`a` -60..60) × 12 m (`b` ±6) at `WATER_LIFT` (0.12) over the lawn, a light
  grey-blue Phong material. Each bank has a low kerb (`RIM`: 0.6 m high, 1.0 m wide), split at the bridges; each
  end has a kerb cap. The kerbs are `low` colliders: the car cannot drive into the water, the helicopter flies over.
- **Bridges.** Two, at `a = ±20`, 10 m wide (in the 10 m alleys between the warehouses), a deck 16 m long
  (`b` ±8) 0.3 m over the lawn, grey; a brick-coloured parapet either side (visual, 1.0 m high) which is also a
  thin `low` collider (0.25 m thick, 16 m long) so the car stays on the deck. The decks themselves have no collider.
- **Warehouses.** Six blocks, three per bank, centred at `a = -40, 0, 40`, each 30 m long (`a`), 20 m deep (`b` 16 ..
  36 from the centre line), 24 m to the eaves with a 6 m gabled roof (ridge 30 m, ridge along `a`, gables facing the
  alleys). Body red brick, roof dark slate, five rows of dark window bands on the canal face, one protruding hoist
  bay (4 × 2 m, from 12 m up to 27 m, trim colour) at the block centre. 10 m alleys separate the blocks. No lettering.
  Each block is one `low` collider, solid to its ridge + 2 m.
- **Paths.** The existing portal -> loop path and the 95 m loop stay (`paths[0]`, `paths[1]`); two new entries:
  the **quay ring** (`paths[2]`): a closed rectangle `a` ±66, `b` ±11, `hw` 3 (along both quays and across the canal's
  two ends), and a **connector** (`paths[3]`) from the loop's end (`a` -95, `b` 0) to the quay ring (`a` -66, `b` 0), `hw` 3.
  Everything stays inside the loop's inner edge (91 m): the farthest warehouse corner is at 65.7 m.
- **Lazy build.** As every room: the meshes are built in `ensureRoom(5)` on entering spoke 5 and disposed when another
  room is built (`disposeGroup`). No fetch (`object.url` absent). `__mm.speicher().built === 5` while built.
- **Helicopter.** Nothing changes: `ROOM_FLY` (wall 225 m, ceiling 420 m) already clears a 32 m roof; the `low`
  colliders let it over.
- **Sign.** `ROOMS[5] = { id: 'room5', name: 'Speicherstadt', object: SPEICHER, signed: false }`; `spokeSigns` stays empty.
- **Credits.** Nothing third-party: no `CREDITS.md`, README, licence or F1 line.

### Modules

- **`speicher.js`** (new, pure, no three.js/DOM; `node --test tests/speicher.test.mjs`): the descriptor `SPEICHER`
  (all numbers above), `warehouseParts(cfg)` (boxes and prisms with colours, in the object's own frame: `x` along
  `f`, `z` along `v`, `y` = 0 at the floor), `speicherPlacement(room, cfg)` returning `{ origin, water, bridges,
  quay, connector, colliders }`.
- **`speichermesh.js`** (new, three.js, not unit-tested, like `artemismesh.js`): `buildSpeicher(cfg)`,
  `speicherTriangles(group)`.
- **`rooms.js`**: the `ROOMS[5]` entry, the placement call, its colliders and two extra `paths`.
- **`index.html`**: `roomSpeicher(group, R)` next to `roomArtemis`, the `ROOM.speicher` slot, the `__mm.speicher` hook.

## Acceptance criteria

- [ ] `ROOMS[5]` is `{ id: 'room5', name: 'Speicherstadt', object: SPEICHER, signed: false }`; `NEXT_ROOMS` is still
      `[7, 2, 6, 3, 5, 4]`; `spokeSigns(ROOMS)` is still empty.
- [ ] `SPEICHER.h` is 30; `warehouseParts` yields six brick bodies (24 m to the eaves) with six gabled roofs ending at
      exactly 30 m, five window bands and one hoist bay per block, nothing above 30 m, and nothing inside the canal or
      the quay lanes (footprints at least 14 m from the centre line).
- [ ] The blocks are 30 m long with 10 m alleys between them, the canal is 120 × 12 m, the bridges sit in the alleys.
- [ ] `roomLayout(5)` has 18 colliders, all `low: true`: 6 warehouses (solid to ≥ 32 m over the floor), 8 kerbs
      (6 bank segments with 11 m gaps at the bridges, 2 end caps; 0.6 m high), 4 parapets (2 per bridge).
- [ ] `roomLayout(5).paths` has four entries; every sampled point of the quay ring and the connector is free for a car;
      a flood fill from the spawn reaches both bridge decks and both quays but not the water (`a` 0, `b` 0).
- [ ] Entering spoke 5 builds the room (`__mm.speicher().built === 5`, `tris` between 300 and 20 000,
      `counts.speicher === 1`, no `.glb` request); `__mm.pushAt` at a warehouse, a kerb and a parapet pushes, on the quay,
      in the alley and on the bridge deck it does not; the page keeps an empty console.
- [ ] The warehouses are red brick under dark roofs; nothing reads as lettering, a logo or a flag.
- [ ] Leaving for another room and coming back rebuilds it (no leak: `disposeGroup` frees it like every room).
- [ ] CHANGELOG `[Unreleased]` → `### Added` has one timestamped, player-facing entry (English), saying the buildings are
      built in the game, not a downloaded model.
- [ ] `node --test tests/*.test.mjs` is green; `pytest tests/test_hideout.py -k speicher` is green; no other Playwright
      file is run.

## Assumptions

- **A1** [high] **Procedural geometry, no downloaded model, nothing third-party.** Rejected: Sketchfab / TurboSquid
  models (account needed, signs in the textures, decimation pass), the Hamburg LoD2 city model (conversion tooling
  missing, roofs only), OpenStreetMap footprints (share-alike, no look). The issue allows simple shapes explicitly.
- **A2** [high] **A representative block, not a copy of real buildings:** six identical-style warehouses, 30 × 20 m,
  five storeys, 24 m to the eaves, ridge 30 m, a straight 120 × 12 m Fleet. Rejected: modelling a named stretch
  (Holländischbrandfleet, Wandrahmsfleet) with its bends and turrets (scope; no reference data in the pipeline).
- **A3** [med] **The canal runs along the room's forward axis**, so the player sees it end-on from the portal and the
  `towerView` (150 m in front of the centre, looking in) shows the whole block. Rejected: across the room (hides the
  canal behind the nearest warehouse row from the portal).
- **A4** [med] **Kerbs and parapets as thin `low` boxes** (`RIM`-like) instead of the Titanic's basin machinery;
  the Titanic's `shipBasin` is a stadium shape tied to a hull. Rejected: reusing `shipBasin` (its geometry is round-ended,
  the Fleet is straight), `feet` colliders (world-axis squares with one height).
- **A5** [med] **Parapets are colliders, decks are not**, so a car on a deck cannot slip into the water and the decks
  need no extra height logic (the floor stays flat at `y`). Rejected: raising the deck with a ramp (the car's ground
  height is `groundAt: () => Y`, a flat floor).
- **A6** [high] `NEXT_ROOMS` stays `[7, 2, 6, 3, 5, 4]` (fill order, taken rooms stay in it); only its comment changes.
- **A7** [high] The spoke stays unsigned (`signed: false`); the room name `'Speicherstadt'` is for the console line and
  the debug hooks only.
- **A8** [med] **No new strings, no credit line, no `CREDITS.md` change.**
- **A9** [med] **Mesh task is the graphics task.** In a local run it goes to Fable as a short pass; in the pipeline the
  issue's model label decides and the task is sized for the default model (numbers from the pure module; the mesh
  file is boxes and prisms). Rejected: labelling the issue `model:fable` (memory rule 2026-10-11).
- **A10** [med] **Triangle budget 300-20 000** for the Playwright assertion: ~60 boxes/prisms at 12 or 8 triangles
  (about 1 000), plus kerbs, decks and the water slab. The bound is wide on purpose.
- **A11** [med] **CHANGELOG timestamp is the time of the PR's last commit** in Swiss local time; the maintainer can
  touch it up on merge. Rejected: the demo time 2026-11-10 15:15.

## Consequences

- Room 5 becomes the fifth taken room; `NEXT_ROOMS` has only room 4 (the rally hall, 2026-11-17) left. The
  `ROOMS.slice(4, 6)` emptiness check in `tests/rooms.test.mjs` shrinks to room 4.
- A second procedural room object shape (`warehouseParts`, boxes and prisms) beside the cylinders and cones of
  `artemis.js`; later rooms (the rally hall) can copy it.
- `index.html` grows by one `roomSpeicher` function and one debug hook; `rooms.js` by one placement block and two paths.
- No effect on the surface world, the lift, ring 2 or any other room (`roomLayout(k).speicher` is `null` elsewhere).
- Mixed colliders: 18 `low` boxes in one room; negligible for `collide`.
