# Space Shuttle on its launch pad in the Artemis II room (#622)

Status: enriched 2026-11-18. Deadline from #420: **live on the site Tuesday 2026-11-24 15:15** (demo), merge by
Monday evening 2026-11-23. Follows the Artemis II room (#488, PR#490) and the Shuttle's pad in ring 2 (#811).
This is an **addition** to a room that already holds an object, not the next free room: `NEXT_ROOMS` is
`[7, 2, 6, 3, 5, 4]`, rooms 7, 2, 6, 3 and 5 are taken, the next free one would be 4; the queue row (#420, "2
(addition)") is the maintainer's explicit choice, so `NEXT_ROOMS` stays untouched.

## Goal

The Artemis II room (ring 1, star room 2) also holds a **Space Shuttle stack on its launch pad**, life size:
orbiter, orange external tank and two boosters (56.1 m over the platform's deck), on the mobile launcher
platform over the hardstand with the flame trench, the service tower (≈ 100 m with the mast), the swung-back
service structure and the water tower. The Artemis II stack and the Orion capsule **move aside** to make room;
both stay solid and reachable on foot (#412).

**Success criterion:** driving into spoke 2 builds a room in which, seen from the portal, the Artemis II stack
with its capsule stands on one side (right, `b = +100`) and the Shuttle pad on the other (left, `b = −110`);
the car drives on gravel to a ring round the Artemis mount, to a ring round the capsule, and **through the
flame trench under the rocket**; the hardstand, tower, service structure, water tower, platform, tank,
boosters, orbiter and the Artemis mount, core, boosters and capsule are solid; the helicopter flies round and
over both; no file is fetched (all geometry is procedural, reused from #811 and #488); the spoke stays unsigned;
`node --test` and one targeted Playwright test pass; the page loads with an empty console.

## Out of scope

- A new Shuttle model, a flight orbiter with tiles or a payload bay, a different livery: the pad of #811 is
  reused as is (see A1). No NASA logos, flags or lettering (none exist in `shuttle.js`).
- Changing ring 2 room 7 (the Enterprise pad stays), `shuttle.js`, `shuttlemesh.js`, `artemis.js` and
  `artemismesh.js` (they are reused unchanged; the placement offsets live in `rooms.js`).
- Entering the capsule on foot (#412), exhaust, lights, sound, a countdown.
- A spoke sign or a room name shown to the player (#420 surprise rule: `signed: false`).
- Hub screenshot, testhub target, credits (nothing third-party is added).
- The second ring's objects (#489) and the rest of the queue in #420.

## Today (evidence)

- `rooms.js:25` `ROOMS[2]` is `{ id: 'room2', name: 'Artemis II', object: ARTEMIS, signed: false }`; `:37`
  `NEXT_ROOMS = [7, 2, 6, 3, 5, 4]`.
- `rooms.js:149` the fries figure (`room.figure`) is the existing pattern for a **second thing beside the
  room's object**; `:152` `artemisPlacement({ centre, frame, portal, y }, room.object)` places the stack on
  the room centre and the capsule at `capsule.at` relative to **the `centre` it is given**; `:158`
  `shuttlePlacement({ centre, frame, y }, room.object)` places the pad on the `centre` it is given and returns
  `{ stack, colliders }` (11 colliders, `bridge` over the trench) — both functions are offset-agnostic, so
  passing a shifted centre moves them with no change to `artemis.js` / `shuttle.js`.
- `rooms.js:158` the shuttle branch fires only for `room.object.orbiter`, i.e. only when the room's *object*
  is the shuttle (ring 2 room 7, `rooms.js:42`); room 2's object stays `ARTEMIS`, so a new slot is needed.
- `rooms.js:179-182` the default gravel is the straight path to `end = centre − f·95` plus a **95 m loop round
  the room centre**, and the Artemis ring is pushed on top. With both objects moved off the centre that loop
  would run through the Artemis mount (`b = 100 ± 12`) and across the hardstand (`b = −187 … −33`), so room 2
  needs its own gravel set.
- `shuttle.js:40-56` `SHUTTLE`: hardstand 119 × 99 m, trench 17.7 m wide along the stack's `z`, water tower at
  `(85, −70)` in the stack's frame, tower at `(−31.5, 6)`, service structure at `(−30, −29)`, stack turned
  `turn = π/4` from the room axis (`stackFrame`, `shuttle.js:95-98`). The pad's bounding radius is ≈ 77 m round
  its centre (water tower ≈ 117 m, on the far side from the portal after the turn: room frame `(+110, +11)`
  from the pad centre).
- `shuttle.js:100-119` `shuttlePlacement`: all colliders `low: true`; platform, tank, boosters, orbiter
  `bridge` over the trench (`y0` over the floor), so a car on the floor passes under the rocket.
- `artemis.js:83-92` `artemisPlacement` returns `{ rocket, capsule, ring, colliders }` (5 colliders, capsule at
  `(−50, +45)` from the stack, hatch to the portal, 11 m ring).
- `index.html:3813` the `ROOM` state has `artemis` and `shuttle` slots; `:3983` both reset when a room is
  disposed; `:4003` `roomMeshes` calls `roomArtemis` / `roomShuttle` when `R.artemis` / `R.shuttle` is set —
  room 2 will set both; `:4040-4046` `roomArtemis` puts slab, deck and rocket at **`R.centre`** (`cx, cz`) —
  must follow `A.rocket` instead; the capsule already follows `A.capsule`; `:4110-4113` `roomShuttle` builds
  `buildShuttle(SHUTTLE)` at `S.stack` on `R.y` — usable as is; `:4379-4385` `__mm.artemis()` / `__mm.shuttle()`
  hooks (the latter also reports `look`, `grid`, `dome`, `lawn`).
- `tests/rooms.test.mjs:242-267` three room-2 tests assume the stack on the centre and the 95 m loop
  (`paths[1]`, `paths.length === 3`, `[95, 0]`, `[0, -95]` free); `:402` asserts `R.shuttle === null` in every
  room except ring 2 room 7. All three change, plus `:246` (`tower` equals the rocket's position).
- `tests/test_hideout.py:1211-1236` the Artemis browser test pushes at `(0, 0)`, `(0, 11)`, `(0, 30)` and the
  capsule ring at `(−50, 56)` in the room frame; `:1544-1575` the ring-2 shuttle test (unchanged).
- `ROOM_FLY` (`rooms.js:202`, wall 225 m, ceiling 420 m) clears both objects; colliders are `low`, so the
  helicopter passes over their tops (`index.html` `collide`, as for #488).

## Model source (decision: reuse the procedural pad of #811)

No download, no licence file, nothing to credit: `SHUTTLE` / `buildShuttle` already build the whole pad from
cylinders, cones and extruded outlines, unbranded (the maintainer's licence rule in #420 is met by construction).
The same numbers now appear in two rooms (ring 1 room 2 and ring 2 room 7); that is explicit in the request
("a Space Shuttle on its launch pad"). A licensed GLB is not needed and an account-bound Sketchfab download
would not be reachable by the pipeline anyway (same finding as #488).

## Design

Room frame: `a` from the centre towards the far edge, `b` across, `(0, 0)` the room centre; the portal is at
`a = −250`; the room is 500 × 500 m, trees at 238 / 244 m.

```
                          far edge  (a = +250)
   b = +250 ┌─────────────────────────────────────┐
            │            Orion ○ (−50, 145)       │
            │         ring 11 m                   │
            │       ╭───────╮                     │
            │      │  ▲ SLS  │  Artemis ring r 45 │   Artemis stack at (0, +100)
            │       ╰───────╯                     │
            │                                     │
 portal ────┼─ entry ──● junction (−95, 0)        │
 (a=−250)   │            ╲                        │
            │       trench ╲ mouth (−62, −68)     │
            │        ┌──────╲───┐   water tower   │
            │        │ pad ⟍ ▮ │   (≈ +90, −99)  │   Shuttle pad centre (−20, −110),
            │        └───────⟍──┘                 │   stack turned 45°
   b = −250 └─────────────────────────────────────┘
```

- **Where things stand** (room frame, new data on the room, `ROOMS[2]`):
  `spots: { artemis: [0, 100], second: [-20, -110] }` and `second: SHUTTLE` (the Atomium's `figure` pattern).
  `roomLayout` computes `loc(...spot)` and passes it as the `centre` of `artemisPlacement` and
  `shuttlePlacement`. A room without `spots` is unchanged (both functions get `centre`).
  `layout.tower` and `layout.centre` stay the room centre (hooks and `towerView` depend on them; the view at
  `a = −150` sees both objects).
- **Clearances** (hand-computed, the tests pin them): the Shuttle's hardstand (radius ≈ 77 m) spans
  `b ≈ −187 … −33`; the Artemis slab (40 m) spans `b = 80 … 120`; the gap between them is > 110 m. The pad
  stays 50 m inside the trees (`b = −187` against `−238`) and the water tower (`a ≈ 90`) inside the far wall.
  The capsule is at `(−50, 145)`, its 11 m ring (outer edge 14 m) 4 m clear of the Artemis ring's outer edge
  (`45 + 4 = 49 m` round `(0, 100)`; centre distance 67 m).
- **Gravel for room 2** (replaces the 95 m loop, which no longer fits; `hw` 4 unless stated; 5 paths in this
  order):
  1. the entry: `at(10, 0)` → `(−95, 0)` (unchanged);
  2. the trench way: `(−95, 0)` → `(−62.4, −67.6)` (the trench's near mouth, 10 m before the hardstand) →
     `(22.4, −152.4)` (the far mouth, through the trench under the rocket; the trench is 17.7 m wide);
  3. the Artemis ring: a 33-point circle of radius 45 round `(0, 100)`;
  4. the way to it: `(−95, 0)` → `(−45, 100)` (the ring's near point);
  5. the capsule ring: the existing 33-point ring `artemis.ring` (radius 11, `hw` 3).
- **Colliders:** Artemis' 5 and the Shuttle's 11, all `low`; the Shuttle's `bridge` decks let the car pass under
  the rocket. The car must stay free on all five paths and on the lawn between the mounts.
- **Meshes** (`index.html`): `roomArtemis` places slab, deck and rocket at `A.rocket.x / .z` instead of
  `R.centre`; `roomMeshes` also calls `roomShuttle` for room 2 (`R.shuttle` is set for ring 1 now).
  `__mm.artemis()` and `__mm.shuttle()` both answer in room 2. Both reset in the room disposal as today.
- **Lazy build / no fetch:** built in `ensureRoom(2)` on entering the spoke, disposed with the group; no `url`.
- **Sign / credits:** `signed: false`; no `CREDITS.md`, README or strings change.

### Modules

No new file. Changed: `rooms.js` (`ROOMS[2]`, `roomLayout`), `index.html` (`roomArtemis`, `roomMeshes`),
`tests/rooms.test.mjs`, `tests/test_hideout.py`, `CHANGELOG.md`.

## Acceptance criteria

- [ ] `ROOMS[2]` is `{ id: 'room2', name: 'Artemis II', object: ARTEMIS, signed: false, second: SHUTTLE, spots: { artemis: [0, 100], second: [-20, -110] } }`; `NEXT_ROOMS` is still `[7, 2, 6, 3, 5, 4]`; `spokeSigns(ROOMS)` is still empty.
- [ ] `roomLayout(2).artemis.rocket` is at room-frame `(0, 100)`, the capsule at `(−50, 145)`; `roomLayout(2).shuttle.stack` is at `(−20, −110)` turned `π/4` from the room axis; `roomLayout(2).centre` and `.tower` are still the room centre; every other ring-1 room has `shuttle === null`, ring 2 room 7 still builds its pad at its centre.
- [ ] The Artemis mount, core, boosters and capsule are solid (all `low`); the Shuttle's hardstand, tower, service structure, water tower, platform, tank, boosters, fuselage and wings are solid; the flame trench along the pad's `z` axis is free for a car on the floor right under the rocket; the old room centre and the lawn between the two mounts are free.
- [ ] `roomLayout(2).paths` has the five paths above (entry, trench way, Artemis ring, way to it, capsule ring), no point of any of them is blocked for a car, and a flood fill from the spawn reaches both trench mouths, the trench centre, all round the Artemis mount and all round the capsule.
- [ ] Entering spoke 2 builds both (`__mm.artemis().built === 2` with `colliders === 5` and `__mm.shuttle().built === 2` with `colliders === 11`, `look === 'meadow'`, `lawn === true`, no `.glb` request, `counts.artemis === 1`); `__mm.pushAt` pushes at the Artemis core, the hardstand and the capsule and does not push in the trench or beside the Artemis mount; the page keeps an empty console.
- [ ] Leaving for another room and coming back rebuilds both (no leak: `disposeGroup`).
- [ ] No sign, no logos, flags or lettering on either stack; no new file, dependency or credit line.
- [ ] CHANGELOG `[Unreleased]` → `### Added` has one timestamped, player-facing entry.
- [ ] `node --test tests/*.test.mjs` is green; `pytest tests/test_hideout.py -k "artemis_room"` is green; no other Playwright file is run.

## Assumptions

- **A1** [high] **Reuse the #811 pad unchanged** (same `SHUTTLE` numbers, same `buildShuttle`, Enterprise in launch position, unbranded) for the ring-1 room. Rejected: a new flight-orbiter model with tiles and payload bay (scope, a graphics project of its own); a downloaded GLB (account-bound, licence work, not needed).
- **A2** [high] **No change to `shuttle.js` / `artemis.js` / meshes**; the placement functions already take the centre they are given, so the offsets live on the room (`spots`). Rejected: adding an `at` to each descriptor (would break the ring-2 shuttle test and the artemis tests that pass a room centre).
- **A3** [med] **Positions: Artemis at `(0, +100)`, pad at `(−20, −110)`.** The Shuttle is the bigger object (hardstand 119 × 99 m, water tower 117 m out) and gets the side with more room to the trees; the stack turned 45° keeps the orbiter three-quarter to the portal as in ring 2. Clearances computed by hand above, pinned by the tests. Rejected: the pad on the centre and Artemis aside (the 95 m loop and the capsule stay awkward, the pad's tower is 100 m tall and would hide the Orion capsule from the portal); both on the far side (the portal view would be one jumble).
- **A4** [med] **The 95 m loop is dropped in room 2** and replaced by the five paths above (trench way, Artemis ring r 45, capsule ring). Rejected: keeping the loop (it crosses the Artemis mount and the hardstand, so its points would not be drivable); a loop round both objects (≈ 500 m of gravel for nothing).
- **A5** [med] **The car may drive through the flame trench** (as in ring 2: `bridge` over `y0`), with gravel leading to both mouths. Rejected: a fence across the mouths (the trench is the best part of the pad, #811 criterion).
- **A6** [high] **`NEXT_ROOMS` stays `[7, 2, 6, 3, 5, 4]`**: this is an addition to a taken room, not a new room (#420 row "2 (addition)"); the next free room is 4, untouched. Mismatch noted here, as the routine requires.
- **A7** [high] **The spoke stays unsigned** (`signed: false`, #420 surprise rule); the room name stays `'Artemis II'`.
- **A8** [med] **Triangle budget**: `__mm.artemis().tris` stays 1 000–20 000 (as #488) and `__mm.shuttle().tris` 3 000–60 000 (as #811); the two together are ≈ 25 000–40 000 triangles on a 500 m lawn, no budget issue for one room. Rejected: a combined lower bound (a look change would fail the test).
- **A9** [med] **CHANGELOG timestamp is the time the entry is written** in Swiss local time (`TZ=Europe/Zurich date '+%F %H:%M'`); the maintainer can touch it up on merge.
- **A10** [med] **Camera / `towerView` unchanged** at `a = −150` on the room axis: both stacks are in view from there (the Shuttle ≈ 56 m, Artemis 98 m, each ≈ 150–200 m away across). Rejected: a second view point (the debug hook only has one).

## Consequences

- Room 2 becomes the first ring-1 room with two placed objects; the default gravel loop does not apply to it
  (`room.spots` switches it off); the Ferris wheel, Atomium, Vasa and Rally hall rooms are untouched.
- `rooms.test.mjs` room-2 tests and one shuttle test change (the new assertions are the specified behaviour);
  the Artemis browser test moves its probes by the new offset and also checks the pad.
- The Shuttle exists in two rooms (ring 2 room 7 and here); a later change to `SHUTTLE` shows in both.
- #420's row becomes "live" after the merge (the maintainer edits the issue, not this PR); #412 (enter the
  capsule on foot) still gets a free capsule on its stand, now at `(−50, 145)`.
- Helicopter and walker see no change: all colliders are `low`.
