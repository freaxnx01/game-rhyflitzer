# Artemis II rocket and Orion capsule in star room 2 (#488)

Status: enriched 2026-10-26. Deadline from the issue: **live on the site Thursday 2026-10-29 15:15** (demo),
merge by Wednesday evening 2026-10-28. Scope is cut to what one unattended pipeline run (10–25 min of agent
work) ships reliably. Follows the Atomium (#355, `088bf58`), Titanic (#422, PR#424) and fries figure (#451,
`9878528`) rooms; object list and rules in #420.

## Goal

Star room 2 of the Hübel hideout (the third room on the right from the lift, `NEXT_ROOMS` after the Titanic)
holds the **Artemis II launch vehicle**: the SLS Block 1 rocket with the Orion spacecraft on top, **98.1 m
tall, life size, standing upright on a launch mount as on the pad**. Beside it, on its own stand, the **Orion
crew module life size (5.03 m across, 3.3 m tall)**, to drive round today and walk round / into later (#412).

**Success criterion:** driving into spoke 2 builds the room with the rocket on its mount in the centre and the
capsule to one side; the car drives round the rocket on the 95 m gravel loop and round the capsule on its own
gravel ring; the mount, the boosters, the core and the capsule are solid, the lawn between them is free; the
helicopter flies round the rocket and over its top; no file is fetched (the whole thing is procedural
geometry); the spoke stays unsigned; `node --test` and one targeted Playwright test pass; the page loads with
an empty console.

## Out of scope

- A downloaded GLB of the rocket or the capsule (see A1: procedural now; a model can replace the meshes
  later behind the same layout, as the Titanic replaced nothing but kept the template).
- Entering the capsule on foot, a hatch, an interior (#412; this issue only leaves it standing free with a
  stand low enough to walk round).
- A launch tower / crawler / flame trench, exhaust, lights, sound.
- A spoke sign or a room name shown to the player (#420 surprise rule: `signed: false`).
- Testhub target, hub screenshot, F1 credit line (nothing third-party to credit).
- The other free rooms (6, 3, 5, 4) and the weekly queue in #420.

## Today (evidence)

- `prototype/rooms.js:17-26`: `ROOMS` — room 2 is `{ id: 'room2', name: null, object: null }`; rooms with an
  object carry `signed: false`. `:30` `NEXT_ROOMS = [7, 2, 6, 3, 5, 4]` — the Titanic (7) stayed in the list
  after it was taken, the list is the fill *order*, not the free set (the test
  `NEXT_ROOMS_NewObjectsFillFromTheLiftOutwards` in `rooms.test.mjs:28-35` checks taken rooms are its prefix).
- `prototype/rooms.js:63-127` `roomLayout(k)`: portal-relative `at(a, b)` and centre-relative `loc(a, b)` in the
  room frame `f` (into the room) / `v` (across); `:83-86` the object's `feet` → square world-axis colliders
  solid to `footH`; `:96-97` the fries figure is placed through `friesPlacement({ centre, frame, portal, y },
  room.figure)` and its colliders are pushed — the hook a second procedural object copies; `:111-113` the
  gravel loop is a 33-point circle of radius 95 round the centre and the path portal → loop end; `:124`
  `towerView` 150 m in front of the centre exists whenever `room.object` is set.
- `prototype/fries.js:1-30, 58-64`: a pure descriptor (`FRIES`, numbers only) and `friesPlacement(room, cfg)`
  returning `{ x, z, th, colliders }` — one plinth collider `low: true` so the hovering walker / helicopter
  passes over its top. `prototype/friesmesh.js:28-100` `buildFries(cfg)` builds the meshes from those numbers
  (one merged mesh per colour, `userData.role = 'fries'`), `friesTriangles(group)` counts them.
- `prototype/index.html:2647` `ROOM` state (`figure` slot); `:2808-2817` `ensureRoom(k)` — counts
  `__mm.counts[R.object.key]`, and only loads a model when `R.object.url` is set (`:2815`), so an object without
  `url` is purely procedural; `:2819-2826` `roomMeshes` — `if (R.figure) roomFigure(group, R)`; `:2854-2857`
  `roomFigure` places `buildFries` at the figure's spot and fills `ROOM.figure` for the debug hook;
  `:2932-2934` `__mm.atomium` / `__mm.fries` / `__mm.titanic` hooks the Playwright tests read.
- `prototype/index.html:3661` `collide`: `if (o.low && P.y >= o.h - 0.2) continue;` — a `low` collider stops the
  car on the floor but lets the helicopter pass once above its top `h`; that is how a 98 m collider should
  behave (solid up to the nose, flown over above it; `ROOM_FLY.ceiling` 420 in `rooms.js:134` leaves room).
- `prototype/hideout.js:29, 35`: `ATOMIUM` and `TITANIC` descriptors with `key`, `h`, `url`, `loadWithin` — a
  third procedural `key` fits the same shape without `url`.
- `prototype/tests/rooms.test.mjs:19-26` fixes "rooms 2..6 have no object"; `:85-93` checks `paths.length === 2`
  on rooms 0, 2 and 3. Both must be rewritten (room 2 gets an object and a third path).
  `prototype/tests/test_hideout.py:979-1019` Atomium room test (no GLB wait needed here);
  `:1022-1052` Titanic room test with `__mm.pushAt` probes along the room frame via `__mm.spoke(k, 0).th`.
- `.github/workflows/agent.yml:23`: the pipeline implements on `z-ai/glm-5.3` by default; `model:fable` is a
  per-issue label. Memory rule (2026-10-11): no Fable for big implementations, Fable for a short visual pass.
- Real dimensions (NASA SLS / Orion fact sheets): SLS Block 1 with Orion 98.1 m (322 ft); core stage 8.4 m Ø,
  64.6 m long; two five-segment SRBs 3.71 m Ø, 53.9 m long incl. nose cone, centre lines about 6.5 m off the
  core axis; LVSA cone 8.4 → 5 m; ICPS 5 m Ø; Orion ESM + crew module 5.03 m Ø; crew module 3.3 m tall, 32.5°
  side walls; launch abort system to the tip.

## Model source (decision: procedural)

Candidates checked 2026-10-26:

| Source | What | Licence | Size | Why not |
|---|---|---|---|---|
| Sketchfab „NASA SLS Rocket Block 1" by AllThingsSpace (`81bb895c…`) | full stack, detailed | CC BY 4.0 | 274k tris, textures unknown | Sketchfab downloads need a logged-in account; the pipeline agent has no Sketchfab credentials (the bus, Mini and Mazda models were fetched by the maintainer by hand and handed over as files). 274k tris need the decimate + meshopt pass the Titanic got (hours, Blender). Textures likely carry the NASA worm / flag → would have to be stripped. |
| Sketchfab „Orion Spacecraft" by WISEMANmods (`fb89e865…`) | capsule + ESM, 1.3k tris | CC BY 4.0 | tiny | Same download block; also one model would not cover the rocket. |
| Sketchfab „Artemis II – SLS" by RapidReality / 3D_Hero | full stack | CC BY (3D_Hero says "not accurate") | unknown | Same download block; accuracy unknown. |
| NASA 3D Resources (`science.nasa.gov/3d-resources`, `nasa3d.arc.nasa.gov`) | — | NASA media (generally not copyrighted; **insignia excluded**) | — | Search "orion"/"sls" returns nothing fitting (only the 2005 ESAS crew module, 7 KB, wrong design). |
| Canadian Space Agency `Space_Launch_System_SLS_20cm.stl` (credit NASA) | 1:30 print model | not stated | unknown | STL, no colours, print model; licence not stated; would need a conversion step the pipeline has no tooling for. |
| Poly Pizza | only Saturn V models | CC0 / CC BY | small | Wrong rocket. |

**Recommendation: build both objects procedurally in three.js** (cylinders and cones, about 2–3k
triangles), exactly as the fries figure (#451) and the Eiffel placeholder were built. It is the only path
that one unattended run can finish for certain before Wednesday evening: no download, no licence file, no
logo stripping, no decimation, nothing to credit, and the look is fully under control (orange core, white
boosters, no insignia). A GLB can replace the meshes later behind the same pure layout.

## Design

### Where things stand (room frame: `a` from the centre towards the far edge, `b` across; 0,0 = room centre)

```
                 far edge
      ┌───────────────────────────┐
      │        95 m gravel loop   │
      │      ╭─────────────────╮  │
      │     │   ▲ SLS + Orion   │ │      rocket on its launch mount at (0, 0), 98.1 m
      │     │  ┃█┃  core + SRBs │ │      SRBs across the room (b = ±6.5), both seen from the portal
      │     │   ▼   mount 24 m  │ │
      │     │          ○ Orion  │ │      capsule at (−50, +45) on a stand, 11 m gravel ring round it
      │      ╰───────┬─────────╯  │      (the fries stand at b = −52 in the Atomium room: the other side)
      │  path portal → loop ──────│
      └────────────┐ ┌────────────┘
                 portal (a = −250)
```

- **Launch pad.** A square concrete slab 40 × 40 m, 0.15 m over the lawn (a flat box like the gravel strips,
  no collider — the car bumps over it as over gravel). On it the **launch mount**: a dark-grey steel deck
  24 × 24 m, 2 m high, with the rocket standing on it. The mount is one collider (`hw` 12, solid to its top,
  `low: true`): the car cannot drive onto it, a hovering walker / the helicopter passes over 2 m.
- **Rocket** (all heights over the deck top, the stack's own frame, SRBs along `v`):
  - core stage: orange cylinder r 4.2 m from y 2.0 to 66.6 (64.6 m); four engine nozzles (dark grey cones,
    r 1.2, 1.7 m) hanging under it on a 2.2 m square;
  - two SRBs: white cylinders r 1.855 at b = ±6.5, y 0 → 50.2, nose cones to 53.9, dark aft skirts (r 2.6,
    2.2 m) at the bottom; a dark nozzle under each;
  - launch vehicle stage adapter: white cone r 4.2 → 2.5, y 66.6 → 75.5;
  - ICPS: white cylinder r 2.5, y 75.5 → 84.0;
  - Orion service module with its fairing panels: white cylinder r 2.6, y 84.0 → 89.0, a thin dark band
    where the panels meet the crew module;
  - crew module under the LAS ogive: white cone r 2.6 → 0.9, y 89.0 → 94.5;
  - launch abort tower: light-grey cylinder r 0.45, y 94.5 → 98.1, nose cone at the tip;
  - a few dark system-tunnel strips along the core (optional, builder's call) — **no flag, no agency
    insignia, no lettering** of any kind.
  - Colliders (centre-relative, in the room frame, all `low: true`): core square `hw` 4.6 solid to
    y 98.1 + 2; the two SRBs `hw` 2.2 at b = ±6.5 solid to 53.9 + 2; plus the mount. The car never reaches
    the boosters (the mount is in the way) but the helicopter and the hovering walker do.
- **Orion capsule** at (−50, +45) in the room frame, turned so its hatch faces the portal: a truncated cone
  r 2.515 → 0.95, 3.3 m tall, in the silver-grey back-shell colour, a tan-brown heat shield as a shallow
  spherical cap 0.5 m deep under the base, a small docking tunnel (r 0.5, 0.4 m) on top, the hatch outline
  as a dark rounded rectangle on the side facing the portal. It rests on a **display stand**: four dark
  steel posts, 1.0 m high, on a 0.6 m-radius ring under the heat shield's rim — low enough to walk round the
  shield later. One collider: square `hw` 3.0 centred on the capsule, solid to 1.0 + 3.3 + 0.6, `low: true`.
  Round it a gravel **ring** path of radius 11 m, `hw` 3 (33-point circle, same strip builder as the loop).
- **Paths.** The existing portal → loop path and the 95 m loop stay; the capsule ring is a third entry in
  `paths`. The capsule's ring (outer edge at 14 m from a point 67 m off the centre → 81 m) stays inside the
  loop's inner edge (91 m) and 45 m clear of the straight path.
- **Lazy build.** As every room: the meshes are built in `ensureRoom(2)` on entering spoke 2 and disposed when
  another room is built (`disposeGroup` frees their geometries and materials). No fetch at all
  (`object.url` absent → `ensureRoom` skips `loadModel`). `__mm.counts.artemis = 1` while built.
- **Helicopter.** Nothing changes: `ROOM_FLY` (wall 225 m, ceiling 420 m) already clears a 100 m rocket; the
  `low` colliders stop it below their tops and let it over.
- **Sign.** `ROOMS[2] = { id: 'room2', name: 'Artemis II', object: ARTEMIS, signed: false }` — `spokeSigns`
  stays empty, the test `spokeSigns_TheRealRooms_AreKeptAsASurpriseForNow` keeps passing unchanged.
- **Credits.** Nothing third-party: no `CREDITS.md`, README, licence file or F1 line. The CHANGELOG entry says
  the rocket is built from simple shapes.

### Modules

- **`prototype/artemis.js`** (new, pure, no three.js/DOM; `node --test prototype/tests/artemis.test.mjs`):
  `ARTEMIS` descriptor (`key: 'artemis'`, `h: 98.1`, `pad`, `deck`, `core`, `srb`, `lvsa`, `icps`, `esm`, `cm`,
  `las`, `capsule`, `colours`), `rocketParts(cfg)` → the stack as `[{ kind: 'cyl' | 'cone', r0, r1, y0, y1,
  x, z, colour }]` in the rocket's frame (x along `f`, z along `v`), `capsuleParts(cfg)` → the same for the
  capsule and stand in its own frame, `artemisPlacement(room, cfg)` → `{ rocket: { x, z, th }, capsule: { x,
  z, th }, ring: pts, colliders }` in world coordinates.
- **`prototype/artemismesh.js`** (new, three.js, not unit-tested — like `friesmesh.js`): `buildRocket(cfg)`
  and `buildCapsule(cfg)` → `THREE.Group`s standing on y = 0 of their own frame, one merged `MeshLambertMaterial`
  mesh per colour, `userData.role = 'artemis'`; `artemisTriangles(group)`.
- **`prototype/rooms.js`**: import `ARTEMIS`, `artemisPlacement`; `ROOMS[2]` as above; in `roomLayout`, after
  the figure line: `const artemis = room.object && room.object.capsule ? artemisPlacement(...) : null; if
  (artemis) colliders.push(...artemis.colliders);` the ring appended to `paths`; `artemis` returned in the
  layout. `NEXT_ROOMS` unchanged (comment updated: 7 and 2 are taken).
- **`prototype/index.html`**: imports; `ROOM.artemis` slot (reset where `ROOM.figure` is reset); in
  `roomMeshes`: `if (R.artemis) roomArtemis(group, R)` — pad slab, mount box, `buildRocket` at the rocket's
  spot turned by `−th`, `buildCapsule` at the capsule's; `window.__mm.artemis = () => …` → `{ built, rocket,
  capsule, h, tris, colliders }` for the Playwright test.
- **Tests**: `prototype/tests/artemis.test.mjs` (new), `rooms.test.mjs` (two tests rewritten, two added),
  `test_hideout.py` (one new browser test, run alone).

## Acceptance criteria

- [ ] `ROOMS[2]` is `{ id: 'room2', name: 'Artemis II', object: ARTEMIS, signed: false }`; `NEXT_ROOMS` is
      still `[7, 2, 6, 3, 5, 4]`; `spokeSigns(ROOMS)` is still empty (no sign in the ring).
- [ ] `ARTEMIS.h` is 98.1 and `rocketParts(ARTEMIS)` ends exactly at 98.1 m over the deck: core 64.6 m long
      and 8.4 m across, two SRBs 3.71 m across reaching 53.9 m, their axes 6.5 m either side of the core;
      the parts stack without gaps and nothing but the LAS tower is above 94.5 m.
- [ ] `capsuleParts(ARTEMIS)` is a 5.03 m wide, 3.3 m tall truncated cone with a heat shield below and a
      1.0 m stand, standing on y = 0.
- [ ] `roomLayout(2)` has the rocket at the room centre and the capsule at (−50, +45) in the room frame;
      its colliders block the car at the mount's edge, at the core and at the capsule and leave the lawn
      between the mount and the capsule, the 95 m loop and the capsule ring free; all four are `low: true`
      with the core solid to ≥ 98 m over the floor and the capsule to ≥ 4.3 m.
- [ ] `roomLayout(2).paths` has three entries: portal → loop, the 95 m loop, and the capsule's 11 m ring; a
      flood fill from the spawn reaches the far side of the rocket and both sides of the capsule.
- [ ] Entering spoke 2 builds the room with pad, mount, rocket and capsule (`__mm.artemis().built === 2`,
      `tris` between 1 000 and 20 000, `counts.artemis === 1`, no `.glb` request); `__mm.pushAt` at the centre
      and at the capsule pushes, 30 m beside the mount it does not; the page keeps an empty console.
- [ ] The rocket is orange (core) and white (boosters, upper stages) with dark engines; nothing on it reads
      as a flag, an agency insignia or lettering.
- [ ] Leaving for another room and coming back rebuilds it (no leak: `disposeGroup` frees it like every room).
- [ ] CHANGELOG `[Unreleased]` → `### Added` has one timestamped, player-facing entry (English, like the
      Titanic's), saying the shapes are built in the game, not a downloaded model.
- [ ] `node --test prototype/tests/*.test.mjs` is green; `pytest prototype/tests/test_hideout.py -k artemis`
      is green on the GPU browser; no other Playwright file is run.

## Assumptions

- **A1** [high] **Procedural geometry, no downloaded model.** Rejected: the Sketchfab CC BY models above
  (download needs an account the pipeline has not got; 274k tris need the Titanic's decimation pass; NASA
  insignia in the textures would have to be painted out), NASA 3D Resources (no SLS / current Orion model
  listed), the CSA STL (print model, licence not stated, no conversion tooling). The issue allows simple shapes
  explicitly. A model can replace the meshes later; `artemis.js` stays the collider/placement source then.
- **A2** [high] **The rocket stands on a 24 m launch mount 2 m high in the room centre**, the mount being one
  `low` collider. Rejected: the rocket standing straight on the lawn (the SRB nozzles would sit in the grass
  and the car would drive under the core's engines, which have no collider); a mobile launcher with tower
  (scope — a 120 m tower is a second object).
- **A3** [med] **Colliders are `low: true` squares in the room frame** (mount `hw` 12, core `hw` 4.6, SRBs
  `hw` 2.2, capsule `hw` 3.0), like the fries plinth — the car is stopped on the floor, the helicopter and
  hovering walker pass over each top (`index.html:3661`). Rejected: the `feet` mechanism (`rooms.js:83`,
  world-axis squares with one `footH` for all — the SRBs have to lie along the room's cross axis and a
  different height from the core); circular colliders (the OBB code has `circle` only for vehicles).
- **A4** [med] **Capsule at (−50, +45) in the room frame with an 11 m gravel ring**, inside the 95 m loop
  and clear of the straight path; the fries stand at b = −52 in the Atomium room, so the capsule takes the
  other side. Rejected: outside the loop (the loop's outer edge at 99 m leaves only ~130 m to the tree ring
  wall, and the capsule should be in view with the rocket from `towerView`); on the pad (hidden behind the
  mount from the portal, and not walkable round later).
- **A5** [med] **The capsule stands on a 1.0 m display stand** showing the heat shield, the hatch facing the
  portal. Rejected: lying on the lawn on its heat shield (the hatch would be 3 m up, nothing to walk into
  later per #412); a plinth block (hides the shield, blocks the later walk-in).
- **A6** [high] `NEXT_ROOMS` stays `[7, 2, 6, 3, 5, 4]`: it is the fill order, and the Titanic's 7 stayed in
  it (`rooms.js:30`, test `rooms.test.mjs:28-35` relies on taken rooms being the prefix). Only its comment
  changes.
- **A7** [high] The spoke stays unsigned (`signed: false`), the room name is `'Artemis II'` for the console
  line and the debug hooks only (#420 surprise rule, `6c61185`).
- **A8** [med] **No new strings, no credit line, no `CREDITS.md` change** — nothing third-party is used.
  Rejected: an F1 line "built from simple shapes" (noise beside the real credits).
- **A9** [med] **Mesh task on Fable only as a short pass.** The plan marks Task 4 (`artemismesh.js` + the
  room build) as the graphics task. In a local subagent-driven run it goes to Fable (memory rule
  2026-10-01); in the pipeline the issue's model label decides, and the task is sized so the default model
  can do it (numbers come from the pure module, the mesh file is cylinders and cones only). Rejected:
  labelling the whole issue `model:fable` (memory rule 2026-10-11: no Fable for big implementations).
- **A10** [low] **Triangle budget 1 000–20 000** for the Playwright assertion. The stack is ~20 cylinders
  and cones at 24–48 radial segments (≈ 2–4k tris) plus the capsule (≈ 1k). The bound is wide on purpose;
  if the builder uses 64 segments and tunnel strips it still fits. Rejected: a tight bound (it would turn a
  look choice into a test failure).
- **A11** [low] **CHANGELOG timestamp is the time of the PR's last commit** in Swiss local time, as the other
  entries; the maintainer can touch it up on merge. Rejected: writing the demo time 2026-10-29 15:15 (it is
  not when the change goes live).
- **A12** [med] The Playwright test does not wait for any load (nothing is fetched); it asserts that **no
  `.glb` request** happens in room 2, to pin the procedural choice and keep the room's entry instant.

## Consequences

- Room 2 is the first object without a model file: `ensureRoom` and `loadModel` are untouched, the
  `object.url` guard at `index.html:2815` already covers it. `towerView` and `__mm.below().object` work as for
  the others.
- `rooms.test.mjs` loses room 2 as an "empty room" fixture; the plan swaps room 2 for room 4 in the two tests
  that used it (as the Titanic PR moved the empty-room browser test from room 3 to 4).
- #420's table row for room 2 becomes "live" after the merge (the maintainer edits the issue; not this PR).
- #412 (enter on foot) gets a capsule with a free hatch side at 1.0 m over the lawn, a stand to walk round,
  and `artemisPlacement` to read the capsule's spot from.
- If a licensed model is wanted later, it replaces `buildRocket` / `buildCapsule` only; colliders, paths and
  tests stay.
