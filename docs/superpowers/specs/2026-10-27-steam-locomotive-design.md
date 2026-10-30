# Steam locomotive on the rails (#462): design

**Status:** approved by the maintainer on 2026-10-27 (brainstorming, four sections).
**Issue:** #462. **Context:** the railway with the Sisseln and Stein stations is already in the world (#76, #130), but nothing runs on it.

## Goal

On foot, walk up to a black Swiss-style steam locomotive standing at Bahnhof Sisseln and get in with **Z**. Drive it along the real track network with **W** (steam) and **S** (brake/reverse), choose the next switch with **Q**/**E**, watch the smoke puff from the chimney in time with the wheels, hear it chuff and whistle (**H**), and get out with **Z** again.

## Decisions (from the maintainer)

| Topic | Decision |
|---|---|
| Getting in | The loco stands at Bahnhof Sisseln. On foot, **Z** gets in when the loco is nearer than the car (within reach); **Z** again gets out beside it. Not in "Choose car". |
| Driving | Throttle and brake yourself; no steering, the track guides. Heavy and slow: ~1 m/s², top 80 km/h, long coast, brake ~1.2 m/s², reverse up to 25 km/h. |
| Switches | Straightest branch by default; **Q**/**E** pick left/right for the next diverging switch ahead; HUD arrow shows the choice; resets after the switch. |
| Look | Own low-poly model (no licence questions), Swiss-style: black boiler, red spoked wheels, three coupled driving axles, rods, cab, chimney, coal tender. No SBB logo, no real running number. Designed with Fable. *Reference corrected while planning:* the Eb 3/5 "Habersack" named in the brainstorm is a tank engine without a tender, so the reference is an SBB A 3/5 (a 4-6-0 with a separate tender, driving wheels 1.78 m). |
| Train | Loco + tender only (18.6 m), no coaches. |

## Architecture

A third mode `TRAIN` beside on foot (`FOOT`) and the helicopter (`FLY`). The loco writes its pose into `P` each frame, so the map, compass, camera and HUD keep working as they do for the heli (`stepFly` writes into `P` the same way).

### `prototype/train.js` (pure, no three.js, no DOM)

- `TRAIN_CFG`: `{ snap: 1.5, accel: 1.0, top: 22.2, coast: 0.05, brake: 1.2, reverseMax: 6.94, endBrakeDist: 210, endGap: 2, wheelR: 0.89, chuffsPerRev: 4, idleChuff: 0.6, length: 18.6 }` (SI units; `top` 80 km/h, `reverseMax` 25 km/h; `endBrakeDist` ≥ top²/(2·brake) so the stop before a buffer is never abrupt).
- `buildTrackGraph(polylines, cfg)`: nodes are polyline ends merged within `snap` m; edges are the polylines (with their length and cumulative lengths). Returns `{ nodes, edges }`; each node lists its incident edge ends.
- `pickBranch(graph, node, inHeading, choice)`: from the edges leaving `node` other than the one arrived on, the one whose initial heading is closest to `inHeading` (`choice: 0`), or the leftmost / rightmost by signed turn angle (`choice: -1` / `+1`). When only one continuation exists the choice is ignored; when none exists, `null` (a buffer stop).
- `nextSwitch(graph, pos, dir)`: the next node ahead with two or more continuations, and its distance; used for the HUD arrow and to keep the choice until that node is passed.
- `trainInput(keys)`: `{ throttle: 0|1, brake: 0|1 }` from W/↑ and S/↓.
- `stepTrain(state, input, graph, dt, cfg)`: state `{ edge, s, dir, v, choice }`. `v` is signed along `dir`. Throttle accelerates up to `top`; no input coasts down by `coast`; brake decelerates and, at standstill, reverses up to `reverseMax`. Within `endBrakeDist` of a buffer stop ahead the speed is capped so the loco stops 2 m before the end and an `{ type: 'trackEnd' }` event is returned once. Crossing a node calls `pickBranch` and resets `choice` to 0. Returns `{ state, events }`.
- `poseAt(graph, state)`: `{ x, z, th }` on the edge; the caller adds the height.
- `chuffEmit(acc, v, dt, cfg)`: chuffs (smoke puffs and sound) per second = `|v| / (2π wheelR) · chuffsPerRev`, with an idle trickle when standing; returns `{ acc, n }` like `smokeEmit` in `wreck.js`.

### `prototype/loco.js` (pure numbers) and `prototype/locomesh.js` (three.js)

As `fries.js` / `friesmesh.js`: `loco.js` holds `LOCO` (dimensions 18.6 × 3.0 × 4.3 m, wheel positions and radii, boiler, chimney, cab eye, colours) and the helpers `wheelTurn` and `rodOffset`, node-tested. `locomesh.js` `buildLoco()` returns a `THREE.Group` (loco + tender, origin on the rail top at mid-length, facing +x) with `userData.drivers` / `userData.small` (wheels to spin), `userData.rods` (to move with the crank angle), `userData.chimney` (a local point for the smoke) and `userData.cab` (a local eye point). Built with Fable.

### `prototype/index.html`

- **Graph:** built once from `L.rail` + the bridge decks' points (`L.railBridges[].pts`), or `[RAIL_PTS]` without a world file.
- **Parking:** the loco is parked on the edge nearest to `stationSisseln`, facing along it.
- **Height:** `y` follows the rail ribbon (`max(terrainH, road surface)`, as the ribbon is built), or the deck on a rail bridge, smoothed (no snapping steps).
- **Boarding:** `pressZ` on foot boards the loco when the walker is within `WALKER.enterReach` (2.5 m) of the loco's footprint (an 18 × 3 m box around its pose, like `carReach` measures to the parked car's box) and nearer to it than to the car. `TRAIN.on` is set, the car stays parked (`FOOT.car`), and the walker is hidden. `Z` in the loco puts the walker beside the cab on the ground.
- **Loop:** `stepTrain` runs in the mode branch: `if (FOOT.on) … else if (TRAIN.on) stepTrainMode(dt) else if (FLY.on) …`.
- **Keys in the train:**
  - Q/E pick the switch instead of the blinkers.
  - H whistles.
  - C cycles the train camera.
  - R puts the loco back at Sisseln.
  - F, N, X, the car R, and the blinkers are blocked.
- **Sound:**
  - The car engine is off (`off: true`, PR#480).
  - Chuffs are noise bursts at `chuffEmit`'s rate.
  - The whistle is a two-tone `playHorn` preset.
- **Smoke:**
  - A second puff pool (light grey, 48 sprites).
  - It reuses `smokeAt` with its own config, emitted at the chimney and drifting back.
- **Camera:** `C` toggles chase (behind the tender, about 14 m back and 5 m up) and cab (from `userData.cab`).
- **HUD:**
  - The speed shows km/h.
  - The gear plate reads "Dampf" / "Steam".
  - A switch arrow (← ↑ →) shows the choice for the next switch.
  - The map shows the loco at `P`.
- **Help and i18n:** a help line for the train keys and a toast "Gleisende" / "End of the track", in `de` and `en` (`strings.js`).
- **Debug hook:** `window.__mm.train()` returns the loco's position, heading, speed, edge and choice, the next switch, the smoke puff count, whether it is on, and the distance to the track (`railDist`).

## Error handling

- **No rail data** (no world file): the graph comes from `RAIL_PTS`. A one-edge graph is valid, and its ends are buffer stops.
- **Loco cannot be parked** (no edge within 200 m of `stationSisseln`): no loco is placed, `__mm.train().placed` is false, and Z falls back to the car. This must never throw.
- **Degenerate rail data:** `buildTrackGraph` skips polylines with fewer than 2 distinct points and counts them in `graph.skipped`. It drops duplicate points and never throws, because the world file must not stop the game from loading.

## Testing

- **Node (`prototype/tests/train.test.mjs`), on a synthetic network (a Y switch plus a dead-end siding):**
  - **Graph:** the ends merge within 1.5 m.
  - **`pickBranch`:**
    - With no choice it takes the straightest branch, with −1 the left and with +1 the right.
    - Approaching from the converging side there is no choice.
    - A dead end returns null.
  - **`stepTrain`:**
    - Acceleration to `top`, coasting, braking, and reverse capped at `reverseMax`.
    - It stops 2 m before the end, with one `trackEnd` event.
    - The choice resets after the switch.
  - **`chuffEmit`:** the rate scales with speed, and there is a trickle at standstill.
  - **`trainInput`:** maps the keys.
- **Playwright (`prototype/tests/test_train.py`), on the real network:**
  - The loco stands at Bahnhof Sisseln within 0.5 m of the track.
  - Z from foot boards it.
  - W for 10 s moves it more than 20 m while it stays within 0.5 m of the track.
  - Q before a known diverging switch takes the left branch.
  - Smoke puffs > 0 under steam.
  - The car engine level is 0.
  - H plays the whistle.
  - Z gets out beside the loco, and R returns it to Sisseln.
  - `pageerror` stays empty.
- **CHANGELOG:** an `[Unreleased] → Added` entry in the player's voice.

## Out of scope (YAGNI)

- **Rolling stock:** coaches.
- **Traffic:** collision between the loco and cars or the walker, and level crossings with barriers.
- **Automation:** a timetable or autopilot.
- **Menu:** the loco in "Choose car".
- **Track repair:** the rail ribbon dipping into the Sissle valley where there is no bridge (TODO.md:59). The loco follows the ribbon there too, and that is accepted.

## Consequences

- Q and E change meaning while you drive the loco (switch instead of blinker); the help says so.
- The rail network has about 56 junctions and several disconnected sidings; the loco can only reach the main component (about 40 km), and dead ends inside it are buffer stops.
