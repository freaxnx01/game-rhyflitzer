# Postauto Umlauf at the terminus (#763): design

**Issue:** #763. **Builds on:** the fleet model `postauto.js` (#500), the destination display `busdisplay.js` (#713),
the F3 list (#707), the map markers (#711) and the fleet clock `paclock.js` (#726). **Needed by:** #767 (line 143,
also ends at Stein-Säckingen Bf).

## Goal

At a terminus the bus that arrives runs the line's next trip from there, as in real life: it turns, the display
switches to the new destination, and no second bus is placed on the same stand. Without a matching next trip
nothing changes.

## What is there today (measured)

- Every trip is its own bus. `tripWindow` (`postauto.js:156`) opens a trip `spawnBefore` (90 s) before its first
  departure and closes it `layover` (60 s) after its last arrival (`postauto.js:11`, `:159-160`); `placeTrip` stands
  a new bus on the first stop (`postauto.js:180`), the arriving one stands on the last (`postauto.js:187`, `arrive`
  `postauto.js:207-211`).
- `data/timetable_hochrhein.json` has 14 trips, all line 133, two routes (11533941 Stein-Säckingen to Frick, 11533940
  Frick to Stein-Säckingen). Pairs "arrives at a terminus, the same line leaves from the same uic within 15 min":
  12 of 14 trips have one: Frick 240 s (06:18/06:22, 07:18/07:22, 08:18/08:22) and 480 s (15:35/15:43, 16:35/16:43,
  17:35/17:43); Stein-Säckingen 300 s (06:47/06:52, 07:47/07:52, 08:47/08:52) and 60 s (15:08/15:09, 16:08/16:09,
  17:08/17:09). The two trips without one are the first (05:52) and the last (18:08).
- On the timetable alone the windows overlap only for the 60 s pairs (arrival + 60 s is after departure - 90 s).
  The 240 s pair at Frick overlaps in play because the simulated bus arrives late (braking, 10 s minimum dwell, junction
  speed): the arriving bus then stands its own 60 s while the next bus is already placed (playtest 08:21, issue).
  Both are one cause: two buses per terminus visit.

## Design

### 1. Pure linking in `postauto.js`

`PA.turnMax: 900` (15 min, the limit the issue suggests).

`linkTrips(trips, cfg) -> Map<tripKey, trip>`: for each trip `a` with `!a.toOutside`, in ascending last-arrival
order, the next trip is the not yet claimed trip `b` with the **same `line`**, `!b.fromOutside`,
`b.calls[0][0] === a.calls[a.calls.length-1][0]` (same uic), and `0 <= dep(b) - arr(a) <= cfg.turnMax`, earliest
departure first, one predecessor per trip. Only same-line trips chain: #767 adds line 143 data and gets its own
Umläufe without a line list anywhere. Times are compared in the timetable's own service-day numbers (a trip past
midnight is > 86400 throughout), no modular wrap.

`fleetRuns(trips, routes, cfg) -> [{ key, legs: [{ trip, route, calls, win }], win }]`: a **run** is the chain of
trips one bus drives. `key` is the first trip's `tripKey`. Trips whose route is unknown or whose `tripCalls` is null
never link (a link needs both ends valid). Leg windows are contiguous and half-open, split at the timetable
arrival: leg 0 keeps its own `from`; a later leg starts at its predecessor's last arrival; a leg before the last
ends at its own last arrival; the last leg keeps its own `to`. `run.win` is first `from` to last `to`. So a run is
one window with no layover gap and no second window opening on the same stand, and `syncFleet` can never place a
second bus there. Memoised per `trips` array and `routes` map (WeakMap), as `syncFleet` runs every second.

### 2. The bus drives its run

`placeTrip(trip, route, now, cfg, win)` takes an optional window override; nothing else changes in it (a placement
past a linked leg's last arrival falls into the next leg's window, where `t < calls[0].arr` or the first dwell
stands the bus on the new route's first stop until its departure). `placeRun(run, now, cfg)` returns the placement
of the leg whose window holds `now`, with `key = run.key`, `legs`, `leg` index and `win = run.win`. A clock jump (F3
"Setzen", ?patime, `POSTAUTO.forceSync`) calls `syncFleet([], ...)`, which places each run again at the right leg: the
Umlauf needs no state beyond the bus, so jumps and time-lapse (sub-stepping) cannot desynchronise it.

**Turn manoeuvre (simplest acceptable):** in `arrive`, when the stop is the last one of a leg that has a next leg,
`turn(b, t, cfg)` re-poses the bus while standing: `trip`, `route`, `calls` become the next leg's, `k = 0`, `s` = the
next route's first stop, `v = 0`, `phase 'stand'`, `until = max(next first departure, t + minDwell)` (a late bus keeps
the 10 s minimum dwell and leaves late), `leftAt` reset. No animation. The pose jumps to the other kerb at the
same stop (other route, other direction). `standStep` then departs as for any first stop.

`syncFleet` works on runs: `have` holds run keys, so a run is one bus for `maxBuses` and for "no second bus for the
same trip"; a finished bus stays hidden until `run.win` closes.

### 3. Continuity and display

The bus keeps `key` through the turn, so the F3 row (matched by `key`, `index.html:5661`), the map marker
(`busmarks.js:9`), the engine voice (`postautofx.js`), the mesh (`POSTAUTO.meshes`, `index.html:4147`) and the follow
camera (`POSTAUTO.follow`) carry on without a gap. The F3 row text updates itself (it reads `b.trip.to`, `b.k`,
`b.calls.length` each tick): `k/n` goes from n/n to 1/n and the destination changes.

The mesh was built once per key from the first trip (`buildPostautoMesh(b.trip)`, `index.html:4148`). `drawPostauto`
compares `ledText(b.trip)` with `g.userData.led` and repaints the display in place when they differ: free the old
texture (`m.map.dispose()`), assign a new `displayTexture(text)` to the same cloned materials, update `userData.led`.
Front, side and rear are one material each, so all three change together.

### 4. Tests

- `tests/postauto.test.mjs` (pure): `linkTrips` (same line only, limit, uic, earliest-first, one predecessor, outside
  flags), `fleetRuns` windows, turn on arrival (same key, destination, k reset, no second bus), placement and clock
  jump into the next leg, and a fixture whose windows overlap on `main` (arrival + layover after next departure -
  spawnBefore).
- A **timetable-wide node test**: the real `data/timetable_hochrhein.json` on synthetic straight routes, the fleet
  simulated at 1 s from 05:30 to 18:30 with `syncFleet`/`stepBus`, and at every step no two buses stand at the same
  terminus uic. Also with time-lapse step sizes (`fleetSteps`, factor 60).
- One Playwright file `tests/test_postauto_umlauf.py` (foreground): `?patime=08:15&pasp=10`, the bus arriving at
  Frick keeps its `key` while `to` flips to Stein-Säckingen, and no two standing buses are within 8 m.

## Out of scope

Real turn animation or a reversing manoeuvre; line 143 data and routes (#767); changing `layover`/`spawnBefore`
for unlinked trips; Umlauf across midnight.

## Assumptions

- **A1** [high] [confirmed] Maintainer: "Umlauf: gleicher Bus fährt weiter". When a bus arrives at a terminus and the
  line's next trip starts there within a turnaround limit, the same bus runs that trip; it turns, the destination
  display (busdisplay.js, #713) switches, no second bus is spawned. Without a matching trip, behaviour stays as today.
- **A2** [high] [confirmed] Must stay correct with clock jumps and time-lapse (paclock.js, #726: setTime/setFactor,
  POSTAUTO.forceSync, sub-stepping) and keep the F3 list (#707) and map markers (#711) continuous. Met by a stateless
  run model re-placed by `syncFleet([], ...)` and a stable bus `key`.
- **A3** [high] [confirmed] Another issue, #767 (line 143), lands after this one and also ends at Stein-Säckingen Bf:
  design the Umlauf per line (only same-line trips chain), so 143 can reuse it. `linkTrips` compares `trip.line`.
- **A4** [high] Turnaround limit `PA.turnMax = 900` s (15 min). Rejected: shorter (e.g. 10 min). The issue suggests
  15 min and the real gaps are 60-480 s (timetable data, listed above); the limit only separates the Umlauf from a
  long break.
- **A5** [high] Link key: same `line`, same last/first uic, successor `!fromOutside`, predecessor `!toOutside`,
  earliest departure, one predecessor per trip. Rejected: also requiring the same route id (the return trip is the
  other route by construction: 11533941 to 11533940).
- **A6** [med] The bus keeps the `tripKey` of its first trip as `key` for the whole run (on this data the run
  05:52 to 18:08 has one gap, 08:52 to 15:08 is not linked). Rejected: a new key per leg, which would restart F3
  rows, markers, meshes and follow at every turn (breaks A2).
- **A7** [med] Turn manoeuvre: instant re-pose onto the next route's first stop at arrival, no animation; display
  and F3 row switch at arrival. Rejected: switching only shortly before departure (needs a second timer and a
  visual "arrived" state for 1-8 min). The pose may jump a few metres to the other kerb.
- **A8** [med] A late bus keeps `minDwell` (10 s) and leaves late; it never skips the trip and no second bus is
  placed to keep the timetable. `postauto.js:210` already does this for intermediate stops.
- **A9** [med] No Umlauf across midnight: times compare numerically in the service day. The timetable has no such
  pair (last arrival 18:08), so wrap logic would be untested speculation.
- **A10** [med] The display is repainted in place on the existing cloned materials (dispose the old texture, assign
  the new). Rejected: rebuilding the mesh per leg, which would drop wheel spin and blinker state.
- **A11** [high] Trips without a successor keep today's window, layover and behaviour exactly; `placeTrip` without a
  window argument is unchanged.

## Consequences

- Fewer buses on the map at once: the bus standing at a terminus for 1-8 min is the one that departs. The
  two-bus overlap disappears; `maxBuses` counts one bus per run.
- A bus now stands 1-8 min at the terminus (until the next departure) instead of 60 s and disappearing.
- The F3 row of a bus changes direction and `k/n` at the terminus (11/11, then 1/11) on the same row; "Follow"
  stays on the same bus.
- A clock jump to just after an arrival places the bus standing at the start of the next trip (new destination),
  not at the end of the finished one.
