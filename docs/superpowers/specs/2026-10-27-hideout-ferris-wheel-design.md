# Ferris wheel in star room 6 (hideout object list, #420)

Status: enriched 2026-10-27 (early run for the Thursday **2026-11-05** slot). Deadline: **live on the site
Thursday 2026-11-05 15:15** (demo); **merge not before Wednesday 2026-11-04** (the object must not go live before
the demo). Follows the Atomium (#355), Titanic (#422), fries figure (#451) and Artemis II (#488, PR#490) rooms;
object list and rules in #420. Scope is cut to what one unattended pipeline run ships reliably.

## Goal

Star room 6 of the Hübel hideout (the second room on the left from the lift; `NEXT_ROOMS` after the Titanic's 7
and Artemis II's 2) holds a **classic big Ferris wheel, life size**: a 100 m wheel (rim radius 50 m) turning on a
hub 59 m over the floor, held by two A-frames, 32 hanging gondolas, 112 m to the top of the rim and its
gondolas. It turns slowly; the gondolas stay upright.

**Success criterion:** driving into spoke 6 builds the room with the wheel in the centre, turning, its plane
facing the portal; the car drives round it on the 95 m gravel loop and under its rim; the four A-frame feet are
solid, the lawn between them is free; the helicopter flies round and over it; no file is fetched (the whole
thing is procedural geometry); the spoke stays unsigned; `node --test` and one targeted Playwright test pass;
the page loads with an empty console.

## Out of scope

- A downloaded GLB of a real wheel (see A1).
- Riding in a gondola, a boarding platform, queue barriers, lights, sound (entering on foot: #412).
- Real-wheel branding: no London Eye, Riesenrad or Hamburg Dom names, logos or colour schemes (#420: unbranded).
- A spoke sign or a room name shown to the player (#420 surprise rule: `signed: false`).
- Testhub target, hub screenshot, credit line (nothing third-party is used).
- The other free rooms (3, 5, 4) and the rest of the weekly queue in #420.

## Today (evidence)

- `prototype/rooms.js:17-26` `ROOMS`: room 6 is `{ id: 'room6', name: null, object: null }`; rooms with an
  object carry `signed: false`. `:31` `NEXT_ROOMS = [7, 2, 6, 3, 5, 4]` with the comment at `:28-30` ("7 and 2
  are taken; 6 is next") — the queue row (room 6) and `NEXT_ROOMS` agree, no mismatch.
- `prototype/rooms.js:63-127` `roomLayout(k)`: centre-relative `loc(a, b)` in the room frame `f` (into the
  room) / `v` (across); `:99-101` the Artemis stack is placed through `artemisPlacement({ centre, frame, portal,
  y }, room.object)` when `room.object.capsule` is set and its colliders pushed — the hook this object copies;
  `:112-118` the 95 m gravel loop and the path portal → loop; `:126` the returned layout carries `artemis` next
  to `figure`; `:124` `towerView` 150 m in front of the centre exists whenever `room.object` is set.
- `prototype/rooms.js:137` `ROOM_FLY = { wall: ROOM_HALF - 25, ceiling: 420 }` — the helicopter ceiling is 420 m over
  the floor, the 112 m wheel fits; the tree rows stand 6 and 12 m inside the 250 m half width.
- `prototype/artemis.js` (pure descriptor + `artemisPlacement`), `prototype/artemismesh.js` (three.js, one merged
  mesh per colour, `userData.role`), `prototype/tests/artemis.test.mjs`: the pattern for a procedural object
  without `url`; `prototype/index.html:2816` `ensureRoom` only loads a model when `R.object.url` is set, so an
  object without `url` is purely procedural.
- `prototype/index.html:517-518` the Artemis imports, `:2655` the `ROOM` state (`artemis` slot), `:2827`
  `roomMeshes`, `:2862` `roomFigure` (the placement-to-meshes example), `:2954` `__mm.artemis` (the debug hook
  the Playwright test reads), `:4392` the frame loop `loop(now)` (where the wheel's turn is stepped).
- `prototype/index.html:3768` `collide`: a `low` collider stops the car on the floor but lets the helicopter pass
  once above its top `h` (`index.html:3768` `collide`).
- `prototype/tests/rooms.test.mjs:20-25` fixes "rooms 3..6 have no object"; `:190` `const artemis = rooms[2]`
  starts the Artemis block. `prototype/tests/test_hideout.py:1098` the Artemis room test, `:872` `into_room`,
  `:99` `ride`, `:22` `open_page`.
- `prototype/tests/underground.test.mjs:7` lists the room ids; unchanged (ids stay).
- Real dimensions: large observation wheels run 100–165 m (Singapore Flyer 165 m, London Eye 135 m, the
  historic Vienna Riesenrad 64.75 m). Picked: **100 m wheel, 112 m overall** (see A2).

## Model source (decision: procedural)

| Source | Licence | Why not |
|---|---|---|
| Sketchfab / Poly Pizza Ferris-wheel models | mostly CC BY | Sketchfab downloads need an account the pipeline has not got; most models are low-poly cartoon scale, branded real wheels (London Eye) carry trademarks; no way to fetch and check a licence-clean model unattended |
| Wikimedia Commons 3D | varies | few usable glTF, mostly real-wheel scans with branding |

**Recommendation: build it procedurally in three.js** (a torus rim, spokes, hub, two A-frames of cylinders, 32
gondolas as small boxes + roofs), about 4–7k triangles, like the Artemis stack. No download, no licence file,
nothing to credit, the look under our control (white wheel, coloured gondolas, no lettering). A GLB can replace
the meshes later behind the same layout.

## Design

### Where things stand (room frame: `a` from the centre towards the far edge, `b` across; 0,0 = centre)

```
                 far edge
      ┌───────────────────────────┐
      │        95 m gravel loop   │
      │      ╭─────────────────╮  │
      │     │   ◯ wheel, plane  │ │     plane = (b, up), axle along a (the portal sees it face-on)
      │     │  ╱╲╱╲  A-frames   │ │     feet at a = ±8, b = ±30 (4 colliders); rim 9 m over the lawn
      │      ╰───────┬─────────╯  │
      │  path portal → loop ──────│
      └────────────┐ ┌────────────┘
                 portal (a = −250)
```

- **Wheel.** Rim radius 50 m (a 100 m wheel), hub 59 m over the floor, so the rim is 9 m off the ground at its
  lowest and the rim top is 109 m; gondolas (2 m high) hang 2 m outside the rim on pivots, their roofs reaching 112 m. 32 gondolas
  every 2π/32; a rim ring, 16 spoke pairs hub → rim, a hub drum, an axle. White rim and spokes, gondolas in six
  muted colours repeating, dark steel for the frames. Nothing on it reads as lettering or a logo.
- **Support.** Two A-frames at `a = ±8` (axle along `a`): each two legs from the feet at `b = ±30` on the lawn up
  to the axle ends at `(b 0, y 59)`; a foot is a 10 × 10 m concrete block 0.6 m high (visual only).
- **Colliders** (all `low: true`, in the room frame): four squares `hw 5` at `(a ±8, b ±30)`, solid to
  `room.y + hub height + 2` (61 m). The car is stopped on the floor by a foot and drives between them and under
  the rim (6 m clearance below the lowest gondola); the helicopter / hovering walker pass over each top. The
  rim and gondolas have no collider (9 m above the lawn at the lowest point).
- **Turn.** `wheelAngle(t) = (t · 0.01) mod 2π` (one turn in about 10 min; the real wheels need 30 — this one is
  quick enough to *see* in a demo). The rotating group takes the angle about the axle (local x), each gondola
  counter-rotates by the same angle so it hangs upright. Time comes from the frame loop (`dt` is clamped there,
  `index.html:4392`), the turn is purely visual.
- **Paths.** The existing portal → loop path and 95 m loop; no extra path (the wheel's footprint is inside
  ±40 m, well within the loop). `roomLayout(6).paths.length === 2`.
- **Pad.** None. A gravel boarding strip is #412's job.
- **Lazy loading.** Nothing to load; the meshes are built the first time the spoke is entered, like every room
  (`ensureRoom`, `disposeGroup` frees them on leaving).

## Acceptance criteria

- [ ] `ROOMS[6]` is `{ id: 'room6', name: 'Ferris wheel', object: FERRIS, signed: false }`; `NEXT_ROOMS` is
      still `[7, 2, 6, 3, 5, 4]`; `spokeSigns(ROOMS)` is still empty (no sign in the ring).
- [ ] `FERRIS.rim` is 50 m, `FERRIS.hub.y` 59 m, `FERRIS.h` 112 m (rim top + gondola roof); 32 gondolas
      `gondolaAngles(FERRIS)` evenly spaced; lowest gondola bottom ≥ 5 m over the floor.
- [ ] `wheelAngle(t)` is 0 at t = 0, grows linearly at 0.01 rad/s and wraps at 2π.
- [ ] `ferrisPlacement` puts the wheel at the room centre turned to the room frame (axle along `f`) and returns
      four `low: true` colliders at `(f ±8, v ±30)`, `hw` 5, solid from the floor to ≥ 61 m over it.
- [ ] `roomLayout(6)` has the wheel at the centre; the car is blocked at each foot and free at the room centre
      (under the wheel), at the 95 m loop and at the portal path; a flood fill from the spawn reaches both sides
      of the wheel; `roomLayout(6).paths.length === 2`; every other room has `ferris === null`.
- [ ] Entering spoke 6 builds the room with the wheel (`__mm.ferris().built === 6`, `tris` between 1 500 and
      30 000, `counts.ferris === 1`, `gondolas === 32`, no `.glb` request); `__mm.pushAt` at a foot pushes, at
      the centre and 30 m beside the wheel it does not; the page keeps an empty console.
- [ ] The wheel turns: `__mm.ferris().angle` has grown after ~1 s in the room, and the gondolas' own rotation is
      the negative of the wheel's (they hang upright).
- [ ] Nothing on the wheel reads as a flag, a logo or lettering.
- [ ] Leaving for another room and coming back rebuilds it (no leak: `disposeGroup` frees it like every room).
- [ ] CHANGELOG `[Unreleased]` → `### Added` has one timestamped, player-facing entry (English), saying the wheel
      is built from simple shapes in the game, not a downloaded model.
- [ ] `node --test prototype/tests/*.test.mjs` is green; `pytest prototype/tests/test_hideout.py -k ferris` is
      green on the GPU browser; no other Playwright file is run.

## Assumptions

- **A1** [high] **Procedural geometry, no downloaded model.** Rejected: Sketchfab / Poly Pizza wheels (account
  needed for download; licence and trademark of real wheels cannot be checked unattended), a Wikimedia scan
  (branded). The issue text allows simple shapes explicitly; a model can replace the meshes later, `ferris.js`
  stays the collider/placement source.
- **A2** [high] **Life size = 100 m wheel, 112 m overall, hub 59 m.** Fits the 500 × 500 m room (footprint
  ±40 m, wheel plane ±55 m, inside the 95 m loop), the helicopter ceiling (420 m) and the tallest-object
  precedent (Eiffel 330 m). Rejected: London Eye / Singapore Flyer size (135–165 m: still fits, but the wheel
  would dwarf the 95 m loop it should read inside, and bigger means more mesh); the Vienna Riesenrad (64.75 m:
  too small to be a "big" Ferris wheel next to a 98 m rocket and a 330 m tower).
- **A3** [med] **Colliders are four `low: true` foot squares in the room frame** (`hw` 5 at `(±8, ±30)`), solid
  to 61 m, like the Artemis mount: the car stops on the floor, flyers pass over the tops. The rim and gondolas
  have none (6 m clearance). Rejected: a collider under the whole wheel (the car should drive under the rim, the
  issue asks for "a path to drive round it"); `feet` (`rooms.js:83`: world-axis squares with one height, the
  frames lie along the room's cross axis).
- **A4** [med] **The wheel turns at 0.01 rad/s, gondolas counter-rotated** (visual only, from the frame loop).
  Rejected: static wheel (the issue allows it, but a turning wheel is what the demo is about); a physical
  gondola-vs-car interaction (no collider there anyway); real speed (0.0035 rad/s: invisible in a demo).
- **A5** [med] **32 gondolas, six muted colours, white rim.** Rejected: 36/40 gondolas (more triangles, no
  visible gain); the London Eye's capsules (trademarked shape/colour scheme).
- **A6** [high] `NEXT_ROOMS` stays `[7, 2, 6, 3, 5, 4]` (the fill order; taken rooms are its prefix, test
  `rooms.test.mjs:28-35`); only its comment changes. The queue row and `NEXT_ROOMS` agree: room 6 is next.
- **A7** [high] The spoke stays unsigned (`signed: false`); the room name `'Ferris wheel'` is for the console
  line and the debug hooks only (#420 surprise rule).
- **A8** [med] **No new strings, no credit line, no `CREDITS.md` change** — nothing third-party is used.
- **A9** [med] **Triangle budget 1 500–30 000** for the Playwright assertion: torus rim (~1.5k), spokes (~1k),
  frames (~1k), 32 gondolas × ~50 (~1.6k), plus hub parts, about 5k. The bound is wide on purpose so a look
  choice (more radial segments) never turns into a test failure. Rejected: a tight bound.
- **A10** [med] **The CHANGELOG timestamp is the time of the PR's last commit** in Swiss local time. Rejected:
  writing the demo time (it is not when the change goes live).
- **A11** [med] **The object must not go live before the demo:** the agent opens the PR and stops; the
  maintainer merges **not before Wednesday 2026-11-04**. Rejected: auto-merge (the pipeline never merges).
- **A12** [med] The Playwright test asserts no `.glb` request and a changing `angle` rather than a screenshot
  diff, and leaves one screenshot for the maintainer's look.

## Consequences

- Room 6 becomes the second procedural object; `ensureRoom` and `loadModel` are untouched.
- `rooms.test.mjs` loses room 6 as an "empty room" (`slice(3, 7)` → `slice(3, 6)`); no other test used room 6
  as its fixture (checked: `rooms.test.mjs:63, 76, 87` use rooms 0, 3, 4, 5).
- The frame loop gets one more per-frame step (`stepFerris(dt)`, a no-op unless the Ferris room is built).
- #420's table row for room 6 becomes "live" after the merge (the maintainer edits the issue; not this PR).
- #412 (enter on foot) gets gondolas at known angles (`gondolaAngles`) and clear space under the rim.
- If a licensed model is wanted later, it replaces `buildWheel` only; colliders, placement and tests stay.
