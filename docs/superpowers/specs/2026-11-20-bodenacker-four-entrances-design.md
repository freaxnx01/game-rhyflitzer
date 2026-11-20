# Bodenackerstrasse 6: all four entrances enterable (#1099)

## Why

The block Bodenackerstrasse 6 in Sisseln has four glass entrances (6a–6d). Only one (internally `6c`, #411) can be
entered; the other three are closed glass. The maintainer wants every entrance to lead into the same experience as 6c
today: a stair hall with a lift from the EG up to the roof.

## Goals

- Each of the four porches has a door that opens on <kbd>E</kbd>, a stair hall behind it, a lift (keypad EG, 1–9, Dach),
  a window per storey and a roof door, exactly like 6c today (`stairhall.js`, `towerlift.js`).
- The roof is one deck for the whole block with four tower holes; from the roof the walker can go down any of the four
  roof doors.
- The player sees one place: "Bodenackerstrasse 6" in the jump list (one row), the hint, and the floor display
  `6 · EG` / `6 · 5. OG` / `6 · Dach` — no house letter anywhere visible.

## Non-goals

- No flats, no different interiors per house, no new graphics beyond the existing hall built four times.
- No touch-specific changes (the lift pad already works by tap).

## Anti-goals

- Frame rate near the block must not drop noticeably: at most **one** interior group is built at a time.
- 6c must keep working exactly as today (its existing Playwright test stays green, only extended where noted).

## Decisions

1. **One enterable, four entrances.** `enterables.js` keeps the single entry `bodenackerstrasse-6c` (id unchanged: tests,
   stats and the hint key on it). The runtime fills `entrances` with all four porches; each entrance carries its
   `house`. `ENTER_HANDLERS` opens the door of `entrance.house`.
2. **Per-house state.** `INT` gets `INT.halls` — one record per house `{ house, hall, lift, cabin, door, housing meshes,
   roof door }` — and `INT.cur`, the record the walker is in or nearest to. Fields that describe "where the walker is"
   (`indoors`, `area`, `floor`, `onRoof`, `bodyOff`, `pad`, `prompt`) stay single and refer to `INT.cur`.
   `INT.hall` / `INT.lift` / `INT.cabin` remain as aliases of the current record so the lift pad, `LIFT_RIDE` and the
   debug hooks keep working unchanged.
3. **One EG for the block.** All four halls use the block's base level (today: the terrain at 6c's door, #445). Under
   every porch the terrain pads (`terrainPads`, #477) lower the ground below the EG slab, as they do for 6c today.
4. **Roof deck once.** `hallRoofSlab` is replaced by a block-level function that pushes one deck with all four tower
   holes and the edge rails once (today each call pushes the whole ring).
5. **Façade and housing.** The façade gets a doorway behind every porch (chain `bodenackerDoorway`); the merged
   roof-housing boxes for 6a/6b/6d go away, each tower gets its own housing like 6c.
6. **Building the interior.** The interior group (stairs, lift panels, cabin, lamps) is built for one house at a time: the
   house whose tower/porch the walker is in, else the one with the nearest entrance within 40 m; disposed when another
   house takes over or beyond 55 m (today's thresholds). The always-present parts (housing, door leaf, door plug) exist
   for all four.
7. **Debug hooks.** `__mm.interior(house?)`, `__mm.interiorSim(…, house?)` etc. take an optional house and default to
   `INT.cur` (falling back to 6c), so existing tests run unchanged.

## Left to the builder

- Exact shape of the per-house record and the selection of `INT.cur` on the shared roof (nearest tower is fine).
- Whether walkway sets for the four halls are merged into `WALKS` at load (they must exist before the merge at
  `index.html` ~5232) — they must, since `WALKS` is built once.
- Material sharing between interior builds (no material of a still-used group may be disposed).

## Acceptance

See the issue's acceptance criteria; the Playwright test enters 6a, 6b and 6d through their doors and rides one lift to
the roof.
