# Hübel hideout: car lift down to a full-height Eiffel room (#277)

Status: approved design (brainstorm 2026-10-11). Replaces the dark cavern hall of #201/#257.

## Goal

Today the Eiffel Tower stands in a dark cavern whose ceiling cuts it off above the first platform
(playtest 2026-10-11, `docs/ai-notes/feedback/2026-10-11-cave.md`). The maintainer wants it to feel
real: the whole 330 m tower, standing outdoors, reachable through a secret lift.

**Success:** the player drives through the Reservoir gate, rides a lift deep down, the doors open
onto a meadow under a blue sky with clouds, and the whole Eiffel Tower stands there. They drive
around it and under it, and ride the lift back up.

**Out of scope:** further rooms (each its own issue later, e.g. Atomium/Titanic from #248);
leaving the car / first-person hovering (#202, builds on this).

## Decisions

| Topic | Decision |
|---|---|
| First version | Lift + the Eiffel room only; lift and room module ready for more rooms |
| Lift ride | Visible, ~8 s: gate closes, shaft walls slide up, floor indicator −1…−12, hum; doors open below |
| Room look | Open meadow, gravel paths, dense tree ring at the edge, sky with clouds, even daylight; no wall ever visible |

## Above ground

- Gate and tunnel stay as they are (incl. #276 light and #258 label fixes).
- The dark hall is removed. The tunnel ends in a small lit **lift lobby**: concrete, yellow-black
  edge markings, a large freight-lift platform with an open gate.

## The lift

- **Trigger:** the car stands on the platform (inside its footprint, speed < 0.5 m/s) for 1 s. No
  key; driving across without stopping does nothing.
- **Ride, ~8 s total:** gate closes (1 s) → descent (6 s): shaft wall texture slides upward, floor
  indicator counts −1 … −12, hum sound → gate opens (1 s). Car input is locked during the ride; the
  camera stays in its current mode.
- **Switch:** exactly at the midpoint of the descent the level changes (see Levels).
- **Up:** the same lift in reverse, from the lift house in the room back to the lobby.

## The Eiffel room

- Flat lawn, **500 × 500 m**, centred under the hideout's x/z; floor at `ROOM_Y = −600`.
- The existing Eiffel GLB (330 m, 453k triangles, feet ±53 m, `EIFFEL.feet`/`footHw` as today) in
  the centre, full height. The car drives between and under the legs; the legs collide.
- Gravel paths: one from the lift house to the tower, one loop around it.
- Edge: a dense ring of low-poly trees (reusing the forest instancing) that stops the car, without
  gaps. Behind it nothing is visible but sky.
- Sky: the game's existing sky with its own settings — clouds, a steady midday sun, light haze at the
  edge, independent of the surface time of day.
- The lift house stands at the edge, inside the tree ring.

## Rules below

| What | Below |
|---|---|
| Find | „Versteck gefunden!" / „Hideout found!" + jingle when the doors open below for the first time (moved from entering the hall) |
| **F** (helicopter) | Refused, as today |
| **R** | Back to the lift house below |
| **J**, double-click beam, Testhub jumps, autopilot targets | Back to the surface (level reset first) |
| Race | Riding the lift counts like a jump (race flagged, not counted) |
| Minimap, village names, house numbers | Hidden below |
| Testhub | `hideout.gate` unchanged; `hideout.tower` places the car in the room, facing the tower |

## Architecture

- **Coordinates:** the room sits directly under the Hübel at `ROOM_Y = −600`; the car keeps its x/z,
  only y jumps during the ride. Minimap position, debug panel and Testhub `place` need no special
  case. At that depth nothing overlaps terrain, Rhine bed or tunnel.
- **`levels.js`** (pure): `level ∈ {'surface','eiffel'}`; `groundAt(x,z)` and the collider set per
  level; `setLevel()` toggles whole groups' visibility (surface world: terrain, roads, buildings,
  forest, labels; room: its group, sky settings, sun, fog). Every jump resets the level to `surface`
  first, except **R** below.
- **`lift.js`** (pure state machine): `idle → closing → descending → opening → idle`, driven by time;
  emits the switch at the descent midpoint; ride duration overridable by a test hook.
- **`room-eiffel.js`**: builds the room on the first ride (not at game start) and exposes
  `build()`, `show()/hide()`, `colliders`, `groundAt`, `spawn` (lift house exit), `towerView`. A later
  room implements the same interface.
- The old hall code in `hideout.js` (hall disc, floodlights, cave look from #257) is removed; the
  tunnel and lobby stay there.

## Performance

Below, the whole surface world is hidden, so the room should render at least as fast as the old
hall. The plan measures frame time surface vs room and builds the room lazily.

## Testing

- Node: `lift.js` (state order, trigger only when stopped on the platform, switch at the midpoint);
  `levels.js` (ground and colliders per level, jumps reset the level, R below stays below); room
  layout (tower centred, tree ring closed without gaps, the space under the tower drivable).
- Playwright, `test_hideout.py`: the hall tests are replaced (a deliberate, specified change):
  drive through the gate → lift → find toast → room visible → drive under the tower → **F** refused →
  lift up → at the gate; **J** below returns to the surface. Ride duration shortened via the test hook.
- Credits for the Eiffel model (`test_credits.py`) stay unchanged.
