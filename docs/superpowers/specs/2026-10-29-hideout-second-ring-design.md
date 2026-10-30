# Second underground ring below the hideout (#489)

Status: enriched 2026-10-29. Follows ring 1 (#361, spec `2026-10-18-hideout-star-rooms-design.md`) and the
6c stair-hall lift keypad (#411). Ring 2 is the maintainer's own ring; its first object, the Enterprise
NCC-1701-D (642 m), is #491 and **not** part of this issue.

## Goal

The freight lift in the Hübel gets a keypad with three stops: **Oben** (surface), **Ring 1**, **Ring 2**. Ring 2
lies below ring 1: the same tunnel ring with eight coloured spokes, but in a cool steel-grey "space station"
look with bluish light and a big **"2"** facing you as the cabin door opens. Each spoke leads to an empty star
room of **1000 × 1000 m** (ring 1: 500 × 500), enterable by car, on foot only up to the spoke cap as in ring 1,
and by helicopter inside the room. Ring 1 stays exactly as it is.

**Success criterion:** standing in the cabin with no choice still rides to ring 1 (and from ring 1 up to the
surface); picking Ring 2 on the keypad (click/tap or key <kbd>2</kbd>) rides there, by car or on foot; driving
into any ring-2 spoke switches into its 1000 m room and back; `node --test prototype/tests/*.test.mjs` and two
targeted Playwright tests pass; the console stays empty.

## Non-goals

- The Enterprise (#491) or any other object, name or spoke sign in a ring-2 room. Ring-2 rooms stay empty.
- Any change to ring 1: its look, depth, rooms, room order, lift default, tests.
- A Testhub target, J-list entry or minimap view for ring 2.
- A different room look for ring-2 rooms (they keep the meadow look of ring 1; #491 may change its own room).
- Persisting the level across reloads (nothing below is persisted today; only `mm.hideout` "found").
- A "1" sign in ring 1, lift sounds per stop, a call button outside the cabin.

## Binding decisions (maintainer)

1. **Lift control.** The freight lift gets a keypad like the 6c stair-hall lift (#411: `keypadLabel` in
   `stairhall.js`, `setLiftPad` / `relabelLiftPad` in `index.html`) with three stops Oben / Ring 1 / Ring 2.
   Default unchanged: a car (or a walker) standing in the cabin for 1 s without a choice rides to Ring 1 (from
   the surface). Ring 2 is reached by picking it — mouse click/tap **and** number keys. Works by car and on
   foot. German labels as the game already uses (`GG_LANG` + per-module label tables).
2. **Rooms.** 8 star rooms on ring 2, each 1000 × 1000 m, same shape as ring 1 (ring + 8 coloured spokes).
   Rooms are separate levels (`isRoomLevel`, `belowLevelAt`), so large rooms never collide with each other.
3. **Look.** "Space station" on ring 2: cool steel grey, bluish light in the tunnel ring, a large "2" at the
   lift exit. Spokes keep their colours. Ring 1 unchanged.

## Today (evidence)

- `prototype/underground.js`: `BELOW_Y = -600`; `RING`, `EXIT`, `SPOKE` (8 spokes, 100 m, switch at 52/48 m);
  `belowLevelAt(current, x, z, roomIds)` hard-codes `'ring'`; `ringColliders()` and `ringCeilingAt()` use
  `BELOW_Y`; `ringColliders()` ends with `liftColliders('bottom', BELOW_Y)` whose door panel carries
  `{ liftDoor: 'bottom' }` — `collide()` in `index.html` lets the car through a panel only while
  `LIFT_RIDE.doorAt(o.liftDoor) >= 0.9`, so ring 2 needs its own door id.
- `prototype/rooms.js`: `ROOM_Y = BELOW_Y`, `ROOM_HALF = 250`; `ROOMS` (8, ids `eiffel`, `atomium`, `room2`…`room7`),
  `NEXT_ROOMS = [7, 2, 6, 3, 5, 4]`, `isRoomLevel`; `roomLayout(k, room)` uses `ROOM_Y`/`ROOM_HALF` throughout;
  `ROOM_FLY = { wall: ROOM_HALF - 25, ceiling: 420 }`, `roomFlyClamp/roomFlyAlt/roomFlyCeiling` assume `ROOM_Y`.
- `prototype/lift.js`: `createLift` is a two-level machine (`cabin` `'top' | 'bottom'`, flips at the ride's
  midpoint), `LIFT_TIMES = { dwell 1, close 1, ride 6, open 1, floors 12 }`; `towerlift.js` reuses it.
- `prototype/index.html`: `stepLift` (level `'top'`/`'bottom'`, car only: `onPlatform = !FOOT.on && …`),
  `liftSwitch(dir)`, `ringBuild()` (one ring, `RING_L = { built, group }`, registers `'ring'` and all room
  levels), `ensureRoom(k)`, `stepSpokes`, `setBelowLook('surface'|'ring'|'room')` with `RING_LOOK`/`ROOM_LOOK`,
  `levelFloorY`, `heliGround`, `camTail` and `belowRoof` use `BELOW_Y`/`'ring'`; `LIFT_DOORS`/`LIFT_DECKS`
  keyed `top`/`bottom`; `footSolids` ignores lift doors (a walker has never ridden the freight lift).
- Keys (grep of every `prototype/*.js` incl. `pause.js`, and `index.html`): `Digit1` = hazard lights
  (`index.html` keydown, help row `data-cmd="Digit1"`; blocked on foot `foot.js FOOT_BLOCKED` and in the loco
  `train.js TRAIN_BLOCKED`). `Digit0`, `Digit2`, `Numpad0–2` are bound only by the 6c pad's `liftPadKey`, which
  is active only while that pad is open (`INT.pad && FOOT.on`). `pause.js`: Escape, P, X, arrows, Tab, Ctrl+D/F3
  only. No other module reads digits (`helpfilter.js` only renders `Digit*` codes as labels).

## Design

### Depth and lift ride (author's calls)

- **Ring 2 at `BELOW2_Y = -1200`** (author's call). Ring-1 rooms span `-600 … -180` (fly ceiling 420 m); ring-2
  rooms span `-1200 … -780`, leaving 180 m of rock under ring 1's floor. Only the active level is drawn, so the
  gap is about sanity of the numbers (fog, heli floor, camera), not occlusion.
- **Lift stops and depth in indicator floors** (author's call): `top 0`, `bottom 12` (ring 1, the existing id),
  `ring2 24`. A trip's ride time is `ride × |Δfloors| / 12`: surface ↔ ring 1 6 s (unchanged), ring 1 ↔ ring 2
  6 s, surface ↔ ring 2 12 s. The indicator counts −1 … −24 (ring 1 → ring 2: −13 … −24).
- **Defaults** (author's call for ring 2): surface → ring 1 (binding), ring 1 → surface (unchanged), ring 2 →
  surface ("standing still below takes you up", like ring 1).
- **Choosing** (author's call): a choice is accepted while the lift is idle with the player in the cabin on the
  cabin's level — while rolling in, during the 1 s dwell, or any time after an arrival (an arrival disarms the
  dwell, a choice does not need arming). A choice starts the ride as soon as the player stands still, without
  the dwell. Choosing the stop the cabin is at is refused (button disabled). Once the gate starts closing the
  pad is read-only (the chosen stop lit, all buttons disabled), so the hum length is right. Leaving the
  platform drops the choice. Missed the window? You arrive at ring 1 and pick Ring 2 there.
- `createLift` is generalised (author's call) instead of a second machine: an optional `depth` map (default
  `{ top: 0, bottom: floors }`, so `towerlift.js` and the existing tests are untouched), an optional `to` in
  `step`, `call(stop)`, `chosen`, `target`; events carry `to` and `start` carries `ride`.

### Keypad (author's calls inside decision 1)

- A second pad element `#freightpad` (the 6c pad's styling, a single column of three 96 px buttons, top to
  bottom like a real panel), title `liftPadTitle` ("Lift" in both languages, reused). Labels from a pure
  `freightPadLabel(stop, lang)`: de **Oben / Ring 1 / Ring 2**, en **Top / Ring 1 / Ring 2**; re-labelled on
  `gg-langchange` like `relabelLiftPad`.
- **Keys <kbd>0</kbd> / <kbd>1</kbd> / <kbd>2</kbd>** (top row and numpad) pick Oben / Ring 1 / Ring 2,
  consumed only while `#freightpad` is shown, right after `liftPadKey` in the keydown chain. While the pad is
  shown, <kbd>1</kbd> means Ring 1 instead of the hazard lights (same scoping as the 6c pad taking
  <kbd>D</kbd>); outside the cabin nothing changes. <kbd>0</kbd> and <kbd>2</kbd> are otherwise free.
- Shown whenever the player (car or walker) is in the cabin on the cabin's level; buttons from a pure
  `freightPadView(lift)`. Opening it on foot releases the pointer lock (`releaseFootLock`), as the 6c pad does.

### On foot (author's calls inside decision 1)

- The walker triggers the cabin like the car (`inCabin(x, z, 0)`, on the floor, speed below 0.5), with the same
  default and keypad. During the ride the walker's input is locked (as the car's) and <kbd>Z</kbd> does nothing.
- **The parked car comes along**: at the level switch it is parked where a car would arrive (ring: the exit's
  ring end, `ringSpawn()`; surface: 6 m outside door A), so <kbd>Z</kbd> back to the car always works on the
  walker's level.
- An open lift door no longer blocks the walker (`footSolids` skips a panel whose door is open, as `collide`
  already does for the car) — without this a walker could not leave the cabin.

### Rings and rooms (author's calls)

- **One `RINGS` table in `rooms.js`** instead of a second set of functions: `{ id, stop, y, half, rooms }` for
  `ring` (`bottom`, −600, 250, `ROOMS`) and `ring2` (`ring2`, −1200, 500, `ROOMS2`). `roomLayout(k, room, ring =
  RINGS[0])` takes the ring for `y` and `half`; every `ROOM_Y`/`ROOM_HALF` inside it becomes the ring's value.
  Ring-1 layouts are identical to today's.
- **Ring-2 room ids `r2room0` … `r2room7`**, all `{ name: null, object: null }`.
- **Fill order `NEXT_ROOMS2 = [0, 7, 1, 6, 2, 5, 3, 4]`**: from the lift outwards, right and left in turn,
  the two rooms behind the lift last (ring 1's rule with nothing taken yet). #491 takes room 0.
- **Fly ceiling for 1000 m rooms: 420 m, wall `half − 25` = 475 m** (each layout carries `fly`). The heli's
  `maxAgl` is 400 m, so a higher ceiling would never be reached; the Enterprise is 137 m tall.
- Helpers in `rooms.js`: `isRoomLevel` (both rings), `isRingLevel`, `ringOf(levelId)`, `ringOfStop(stop)`,
  `liftStopAt(levelId)` (`surface → top`, a ring → its stop, a room → `null`), `belowKind(levelId)`
  (`surface | ring | ring2 | room`), `levelY(levelId)`.
- `underground.js` takes the depth as a parameter: `ringColliders(y, stop)`, `ringCeilingAt(x, z, y)`,
  `spokeSigns(rooms, y)`, `belowLevelAt(current, x, z, roomIds, ringId = 'ring')`; adds `BELOW2_Y`,
  `ringNumberSign(n, y)` and `RING2_STYLE`.
- `index.html`: `ROOM.layouts` becomes the flat list of all 16 layouts (ring-1 rooms keep indices 0–7, so
  `ROOM.states`/`ROOM.models`/`__mm.titanic` etc. are unchanged; ring-2 room k is 8 + k); `RING_L` becomes
  per ring (`RING_L.ring`, `RING_L.ring2`); `ringBuild(g)` builds and registers one ring and its rooms on its
  first ride; one room's meshes at a time across both rings (#308 stays).

### Look (author's calls inside decision 3)

- `RING2_STYLE` (pure, `underground.js`): concrete tinted steel grey `#a9b6c8`, light strips `#cfe4ff`, fog
  `#0a0f16`, hemisphere `#d2e4ff` / `#5f6b7c`. `RING2_LOOK` in `index.html` is `RING_LOOK` with those colours;
  `setBelowLook` gets the kind `'ring2'`; the spoke fade (`SPOKE_DARK`) is shared.
- The yellow edge lines, the lift deck and shaft and the spoke colour bands stay as in ring 1.
- **The "2"**: a 6 × 6 m plate (pale `2` on dark blue-grey) on the ring's outer wall straight ahead of the
  exit (`ringNumberSign(2, y)`: on `LIFT.th`, 0.1 m in front of the wall, between spokes 7 and 0), facing the
  lift, so it fills the view as door B opens.
- Ring-2 rooms use `ROOM_LOOK` (meadow, sky) like ring 1 (non-goal: own look).

### Save / teleport / Testhub / respawn

- **Save:** nothing new; `mm.hideout` stays the only key; a first ride to either ring finds the hideout.
- **J, beam, autopilot, race restart:** `leaveBelow()` already ends any level on the surface and places the
  cabin at `top` — works for ring 2 unchanged.
- **R:** keeps the level; `P.safe` is set to `ringSpawn()` on arrival in ring 2 and to the room's spawn on
  entering a ring-2 room (generalised `stepSpokes`).
- **Testhub:** unchanged (`ringBuild()` defaults to ring 1); no ring-2 target (non-goal).

## Constraints

- Buildless; no new dependency, no new file except tests; `const`/`let`; pure logic in `lift.js`,
  `underground.js`, `rooms.js` with `node --test`; `index.html` only wires.
- Open PRs PR#514 (Ferris wheel) and PR#516 (Ferris ride) edit `rooms.js` and `index.html` and land first:
  edits are anchored by identifiers, not line numbers.
- Ring 1 regression: every existing node test passes unchanged; the existing hideout Playwright tests are not
  rerun (targeted tests only), the ring-1 path is covered by the new test's default ride.

## Acceptance criteria

- [ ] Standing in the cabin on the surface for 1 s without a choice rides to ring 1 in 1 + 6 + 1 s, as today;
      from ring 1 it rides to the surface; from ring 2 it rides to the surface.
- [ ] In the cabin a keypad shows three buttons, top to bottom **Oben / Ring 1 / Ring 2** (German) or
      **Top / Ring 1 / Ring 2** (English), re-labelled when the language toggles; the current stop's button
      is disabled.
- [ ] Clicking **Ring 2**, or pressing <kbd>2</kbd> / <kbd>Numpad2</kbd>, while the lift is idle rides to
      ring 2 without waiting for the dwell; <kbd>0</kbd> and <kbd>1</kbd> pick Oben and Ring 1 the same way.
- [ ] After arriving in ring 1, the player can stay in the cabin and pick Ring 2 (no driving out first).
- [ ] The ride surface ↔ ring 2 takes 12 s of travel, ring 1 ↔ ring 2 6 s; the indicator counts to −24.
- [ ] <kbd>1</kbd> toggles the hazard lights everywhere except while the freight keypad is shown.
- [ ] A walker in the cabin rides the same way (default and keypad); the parked car arrives with them, parked
      at the exit (ring) or outside door A (surface); the walker can leave the cabin through the open door.
- [ ] Ring 2 lies at y = −1200: car y ≈ −1200 on arrival, cabin door B opens, the hideout counts as found.
- [ ] Ring 2's tunnel ring is steel grey with bluish light and fog (`RING2_STYLE`: blue channel above red),
      a "2" plate faces the lift exit on the outer wall; spoke colours as in ring 1.
- [ ] Driving into any ring-2 spoke past 52 m switches to room `r2roomK`; back before 48 m switches to `ring2`.
- [ ] A ring-2 room is a 1000 × 1000 m meadow (half 500) with no object, its portal at the spoke end, free to
      drive from the spawn to its centre and corners; the helicopter is clamped 475 m from the centre and
      420 m above the floor.
- [ ] R in ring 2 puts the car at the exit's ring end; in a ring-2 room at that room's portal; J ends on the
      surface.
- [ ] Ring 1 is unchanged: same depth, rooms, look, signs, default; all existing node tests pass unchanged.
- [ ] `node --test prototype/tests/*.test.mjs` passes; `pytest prototype/tests/test_hideout.py -k ring2`
      passes; the console stays empty.
- [ ] `CHANGELOG.md` has a player-facing entry under `[Unreleased]` → `### Added`.
