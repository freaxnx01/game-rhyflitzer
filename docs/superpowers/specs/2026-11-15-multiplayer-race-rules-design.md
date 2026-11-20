# Multiplayer part 4: race rules (countdown, host-checked checkpoints, position, result, rematch), design

**Status:** quick-mode enrichment of #837, 2026-11-15. Assumptions and consequences are in the #837 issue body.
Epic spec: `2026-11-10-multiplayer-race-design.md` (section *netrace*). Builds on #835 (`2026-11-12-multiplayer-see-each-other-design.md`): the pose stream, the host clock and the session.
This addendum only settles what the epic spec leaves open.

**Split:** #837 ships in four sub-issues, each with its own plan of at most 10k characters, in this order:

- **part a, race rules (pure):** `netrace.js` race state, grid and standings; the race messages in `netcodec.js`. Plan: `docs/superpowers/plans/2026-11-15-mp-race-rules-pure.md`.
- **part b, race start:** the *Race* button, the race grid, the 3-2-1 countdown, cars held until `T0`. Plan: `docs/superpowers/plans/2026-11-15-mp-race-start.md`.
- **part c, checkpoints and position:** guests report passes, the host checks them, the board, the HUD position and gap. Plan: `docs/superpowers/plans/2026-11-15-mp-race-checkpoints.md`.
- **part d, finish and result:** the host-checked finish, DNF, the result screen, rematch and back to the lobby. Plan: `docs/superpowers/plans/2026-11-15-mp-race-result.md`.

## Facts on main

- The trial passes a checkpoint when the car is within **7 m** of the nearest open one, in **any order**, and the finish once all are done (`index.html` `stepRace`, the `bd < 7` checks). `CPS`, `FINISH`, `START` are the region's points.
- `startRace('trial')` resets the checkpoints, pips, `R.t` and `R.state = 'armed'`; the clock starts on the first movement.
- The cruise session (`netStartSession`) calls `startRace('cruise')`, places the car with `gridPose` (column, 8 m back, ±1.5 m) and starts the 20 Hz pose sender; guests ping the host only from the session start.
- The host keeps each guest's last poses (≤ 1 s, `NETCARS.get(id).track.poses`), in host-clock ms.
- `stepCar` already has an early "hold" line for the lift ride (`LIFT_RIDE.busy`).
- `finish()` writes the single-player best and opens the result overlay.

## Design

### Lobby and start

- The host's lobby gets a second start button, **"Start race" / "Rennen starten"** (`#mprace`), next to *Drive together*, with the same enable rule (`canStart`).
- Click: the host picks `T0 = performance.now() + 4000` (its own clock is the host clock) and broadcasts `{ type: 'start', mode: 'race', t0, now }`.
- A guest converts with its clock offset. Guests now ping from the moment their hello goes out, so the offset is known in the lobby. If it is still `null`, the guest takes `offset = now − performance.now()` once (latency ignored).
- Every device runs `startRace('trial')` under a race flag `NET.race = { t0, … }` and spawns on the **race grid** (`raceGrid`, below). The cruise column stays for *Drive together*.

### Race grid

- Two abreast, **4 m apart** (±2 m from the centre line), rows **8 m** apart, row 0 on `START`, slot = lobby id: 0 front left, 1 front right, 2 and 3 the second row.
- A row of four side by side (the epic's literal wording) would be 12 m wide and leave the road, which is why #835 chose a column.

### Countdown

- Until `T0` the own car is held (the lift-ride pattern in `stepCar`: velocity zero, no input).
- Big toasts show 3, 2, 1 in the last three seconds and **"Go!" / "Los!"** at `T0`. Then `R.state = 'racing'` and `R.t` counts from 0.
- *Restart* in the pause menu is hidden while a network race runs; *Main menu* leaves as in cruise.

### Checkpoints (host-checked)

- Order: **any order**, as in the trial; the finish needs all checkpoints.
- A client that passes checkpoint `i` marks it locally, as now, and sends `cp { i, t }`, where `t` = ms since `T0` on the host clock. The host handles its own passes the same way, without a message.
- The host accepts the pass if:
  - the racer is still running;
  - `i` is a real checkpoint the racer has not passed yet;
  - one of the racer's buffered poses (last second) lies within **7 + 15 m** of the checkpoint. The host's own pass is trusted.
- The stored time is `max(previous pass time, t)`.
- Refused: the host replies `cpno { i }`. The client reopens checkpoint `i` (pillar, ring, pip, `R.done`), so a pass that the host missed can be driven again.
- After every accepted pass, the host broadcasts a `board`.

### Board, position and gap

- `board { over, rows: [{ id, name, times, st }] }`. `times` holds the pass times in pass order (the finish is the last one when `st = 'fin'`), and `st` is `run`, `fin` or `dnf`.
- Every device ranks the rows with the same pure `standings(rows)`, so the order is identical everywhere:
  1. finished, by finish time;
  2. running, by more passes, then by the earlier last pass;
  3. DNF, by more passes.
  
  A tie goes to the lower id.
- **Gap**, for position > 1: own last pass time − the car ahead's time at the same pass count. The leader shows the negative gap of the second. There is no gap (`—`) before the first pass.
- **HUD:** one line `#netpos` in the time plate: `P 1/3 · −2.4 s` / `Platz 1/3 · −2,4 s`, only during a network race.

### Finish, DNF and result

- A client's finish sends `finish { t }`. The host checks it like a checkpoint: all checkpoints passed and a pose within 22 m of `FINISH`. The client shows "Finished! Waiting for the others" / "Im Ziel! Warte auf die anderen" and keeps driving.
- `finish()` (the single-player best and result) is **not** called in a network race.
- **DNF:**
  - 60 s after the first accepted finish, everyone still running;
  - a guest who drops (bye, peer state, which already removes them from the lobby).
- **Over:** when no racer is running. The host broadcasts `board` with `over: true`. Every device shows the result in the lobby dialog: rank, name, time or DNF, and the gap to the winner.
- **After the race (host buttons):**
  - **Rematch** (`#mprematch`): needs ≥ 2 players still there. It sends a fresh `start` race with a new `T0`, with the same lobby and cars.
  - **Back to lobby** (`#mpback`): sends `{ type: 'back' }`. Every device ends the session (`netEndSession`, the link stays) and opens the lobby. The host clears all ready flags, and invites work again.
- Guests see "Waiting for the host" in place of the buttons.

### Messages (all reliable, validated in `parseMessage`)

| type | from | fields |
|---|---|---|
| `start` | host | `mode: 'race'`, `t0`, `now` (finite ms) |
| `cp` | guest | `i` integer 0..15, `t` 0..3 600 000 |
| `finish` | guest | `t` 0..3 600 000 |
| `cpno` | host | `i` integer −1..15 (−1 = the finish) |
| `board` | host | `over` boolean; `rows` 1..4, ids unique 0..3, `name` clean, `times` ≤ 17 finite non-decreasing 0..3 600 000, `st` ∈ run/fin/dnf |
| `back` | host | none |

- The host ignores `cp`/`finish` that arrive outside a race, and guests ignore `cpno`/`board`/`back` outside one.
- A guest never handles a `board` it did not get from the host: there is only one peer.

## Testing

- **node:**
  - `tests/netrace.test.mjs`: grid, accept/refuse rules, time clamp, DNF timeout and drop, over, standings order and ties, gaps.
  - `tests/netcodec.test.mjs`: every new message, valid and refused.
- **Browser** (one file per part, `?netice=none`, built on `test_multiplayer_cruise.py`):
  - b, `test_multiplayer_race_start.py`: cars held during the countdown, both released after it.
  - c, `test_multiplayer_race_cp.py`: a guest pass shows on the host's board; a far-away `cp` is refused and reopened.
  - d, `test_multiplayer_race_result.py`: a scripted race ends with the same ranking on both pages; rematch and back.

## Out of scope

- a fixed checkpoint order
- lap races
- spectators
- a mid-race join
- host migration
- a race best time or leaderboard
