# Debug jump to every hideout room in ring 1 and ring 2 (#591)

Status: the maintainer asked for enrichment on 2026-10-31. The two open choices were left unanswered, so the builder
took the recommended options (below, "Decided calls").

## Why

Every Thursday a new object goes into a hideout room. Checking one today means a drive: down the lift, round the
ring, through a spoke. Ring 2 adds a lift-pad stop on top of that. The Testhub (`?dev=1`) has exactly one room
target, `hideout.tower`, the Eiffel room (`testhub-targets.js` `hideoutSpots`, `index.html` `testhubGo`, which hard-codes
`ensureRoom(0)` / `LEVELS.set('eiffel')`). The maintainer wants to jump to any room by name: the Atomium, Titanic,
Riesenrad, Enterprise, and every later object such as the Vasa. That includes rings nobody has visited in this
browser yet.

## Goals

1. **One target list built from `RINGS`** (`rooms.js`), so a new object shows up without editing the list:
   - **Two ring targets**, one per ring, at the lift exit (`ringSpawn()`, `underground.js`):
     `hideout.ring1` "Hideout: Ring 1" and `hideout.ring2` "Hideout: Ring 2".
   - **Sixteen room targets**, eight per ring.
     - The id is `hideout.r<n>.<room id>`, for example `hideout.r1.atomium`, `hideout.r1.room3`, `hideout.r2.r2room0`.
     - The label of a room with an object is its name: "Hideout: Ring 1 · Atomium". An empty room is labelled
       "Hideout: Ring 1 · Room 3 (empty)".
     - The pose is the layout's `towerView` for a room with an object: 150 m back from the centre, facing it, as
       `hideout.tower` does today. An empty room has no `towerView` and uses `spawn` (20 m in from the portal).
   - `hideout.gate` and `hideout.tower` stay **unchanged**: same ids, labels and poses. Existing tests and playtest
     links use them.
2. **One jump function for any ring or room.** `testhubGo`'s room branch is generalised from the Eiffel to any level id:
   - build that ring (`ringBuild(g)`);
   - for a room, build its meshes (`ensureRoom(flat index)`) and start its model download if it has not started
     (`loadModel(k)`, which `loadEiffel` already wraps for room 0);
   - `placeOnRoad` (race flagged, toast, as every jump does);
   - `LIFT_RIDE.place(g.stop)`, `LEVELS.set(id)`, `P.safe`, `resetCar()`, and the camera behind the car.

   Ring 2 works even when ring 2 was never visited.
3. **Testhub:** all new targets are registered next to the existing ones, through the same `buildTargets`.
4. **Ctrl+D debug panel:** when the hideout exists (`HIDE`, i.e. the real Hochrhein world), the panel gets a
   **"Hideout" row**:
   - a `<select>` holding the same 18 targets, in the same order: ring 1, its rooms 0–7, ring 2, its rooms 0–7;
   - a **"Go"** button ("Hin" in German) that jumps to the selected target.

   Clicks on the row must not copy the panel (`stopPropagation`, like `#debuglinks` and `#knockreset`). The button
   and the select blur after use, so gameplay keys don't re-trigger them. Without `HIDE` the row is hidden.
5. **Normal play is unchanged.** Nothing new shows without `?dev=1` (Testhub) or Ctrl+D (panel). `HIDE.found` is
   **not** set by a debug jump.

## Non-goals

- No change to the J dialog (it is for players).
- No new keyboard shortcut.
- No per-object pose inside a room, for example "beside the fries figure". The room view is enough.
- No "found" or unlock state.

## Constraints

- **Pure logic in `testhub-targets.js`:** `roomTargets(ctx)`, with no DOM and no three.js, unit-tested with
  `node --test tests/testhub-targets.test.mjs`. `index.html` passes plain data built from `RINGS` and `ROOM.layouts`.
- **Strings in `strings.js`** in `en` and `de`: the row label and the button. Room names are the data names; the
  word "Ring", "Room" and "(empty)" in labels stay English, like every other Testhub label (`'Hideout: …'`).
- Keys: no new key binding, so no key collision check is needed.

## Decided calls (the builder's, flagged for the maintainer)

- **Both surfaces, the panel and the Testhub, from one list.** This was the recommended option, and there was no answer.
- **Rings and all rooms, empty ones included.** Also recommended, with no answer. An empty room is a useful target
  when its next object is being built, for example room 3 for the Vasa (#421).
- The panel uses a `<select>` plus a button rather than 18 buttons, to keep the panel short on phones.

## Tests

- **`tests/testhub-targets.test.mjs`:**
  - `roomTargets` gives 2 + 16 targets with the ids above;
  - the labels for an object room and an empty room;
  - a pose from `towerView` or from `spawn`;
  - every id matches `TARGET_ID_RE`;
  - `buildTargets` includes them, and `hideout.tower` is unchanged.
- **`tests/test_testhub.py`, a new test:**
  - `hideout.r2.r2room0` puts the car in the Enterprise room (`level.id == 'r2room0'`, y ≈ −1200);
  - `hideout.r1.atomium` puts it in the Atomium room (y ≈ −600);
  - `hideout.ring2` puts it on ring 2 (`level.id == 'ring2'`);
  - no console errors.
- **`tests/test_debug.py`** (or the existing debug-panel test file): with Ctrl+D open, the select has 18 options;
  choosing the Ferris wheel and pressing Go puts the car in `room6`.
