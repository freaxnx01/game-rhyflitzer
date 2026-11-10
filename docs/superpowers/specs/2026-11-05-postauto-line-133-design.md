# Postautos drive line 133 by the timetable (#500)

## Goal

Yellow Postautos drive **line 133 Frick – Eiken – Sisseln – Stein-Säckingen** through the world by the real weekday timetable: they appear at the first stop shortly before departure, drive the OSM route in the right lane, slow down at junctions, signal like Swiss buses, stop at every stop until the departure time, and disappear at the last stop. The LED display at the front shows **line number and destination**. The bus waits for the player and is a solid obstacle. The About dialog credits opentransportdata.swiss.

This is the first traffic stage (before #364). Data comes from #682; lane offset from #678; roundabout blinker rule from #680.

## Today

- `bus.js` holds the player's regional bus (#473): size `BUS` (12.2 × 2.55 × 3.05 m), colours, capsule collision. `assets/bus.glb` (#478, 621 KB) is loaded by `loadVehicleModel('bus')` (`index.html:2838`) into `GLTF_CARS.bus.scene`; `buildGltfVehicle` (`index.html:2864`) clones it, but writes the player's globals (`BLINK`, `GLTF_LAMPS`, flames), so it cannot build a second bus. The primitives builder `buildBus` (`index.html:2781`) has the same global side effects (`BLINK`, `LOCAL_LAMPS`, `flames`, `buildWheels`). The player bus's LED is a fixed `textTex('Sisseln', ...)` plane on the primitives only (`index.html:2801`); the glTF bus has no LED.
- `route.js` is pure: `buildGraph` (`:98`), `cumulative`/`pointAt` (`:36-50`), `turnAt`, `routeSignals` (`:224`), `blinkerAt` (`:238`), `trackRoute` (`:244`), `targetSpeed` (`:265`, road class speed, bridges, curves, stop at the end). A route is `{ pts, cum, road (per segment), len, joints: [{ s, deg }] }` (`:182`). The autopilot builds the graph lazily: `autoGraph()` (`index.html:3698`).
- #678 (planned) adds `laneOffset(road)`, `rightOf(pts, cum, s, off)` and `routeLaneOffset(route, s)` to `route.js`, explicitly for reuse by #500. #680 (planned) makes `routeSignals` signal right at every roundabout exit, from the previous exit.
- #682 (planned) adds `busRoutes` to `data/world_hochrhein.json` (`{ id, line, name, from, to, pts, len, cut, stops: [{ uic, name, s, x, z, rot }] }`, stops at the kerb right of travel) and `data/timetable_hochrhein.json` (`MMT1`: `trips: [{ line, route, to, fromOutside, toOutside, calls: [[uic, arr, dep], ...] }]`, seconds after midnight). Line 133: 2 routes, 11 stops each, 14 weekday trips (7 per direction).
- `layoutFromWorld` (`world.js:117`) copies known keys only; `busRoutes` would be dropped.
- Region files are listed in `regions.js` (`REGIONS.hochrhein.world`, `.terrain`, `.backdrop`).
- `busStop(x, z, name, faceDeg)` (`index.html:1958`) draws a pole with a yellow name board and a shelter; used only by the hand-traced fallback world (`index.html:2282`).
- Collisions: `collide(r)` (`index.html:4401`) pushes the car out of the colliders in `OBB_GRID` with `colliderPush` (`world.js:920`, OBB `{ x, z, hw, hd, c, s }`), with crash sound and damage; `low` colliders with `h` (absolute top) are passable from above. `collideFoot` (`index.html:3904`) does the same for the walker.
- The frame loop (`index.html:5222`) steps the world (`stepFerris()` uses the wall clock) and is frozen while paused.
- The About credits list data sources under `aboutData` (`index.html:600-601`), links in `about.js` `ABOUT_LINKS`.

## Design

### 1. Data in the game

- `regions.js`: `REGIONS.hochrhein.timetable = './data/timetable_hochrhein.json'`. No key, no buses (Ehrendingen, generated worlds).
- `layoutFromWorld` passes `busRoutes: w.busRoutes || []`.
- After the world is built, the game fetches the timetable **once, in the background** (not a loading stage). A file that is missing or not `format: 'MMT1'` means no buses, with a `console.warn`. Logged before and after, per the logging rule.

### 2. `postauto.js` (new, pure, `node --test`)

**Clock.** `zurichSeconds(date)` = seconds since local midnight in `Europe/Zurich` (`Intl.DateTimeFormat`, one cached formatter). The weekday timetable is used every day. `parsePatime('HH:MM')` reads the `?patime=` URL override (tests, testers): the clock then starts at that time and runs in real time.

**Routes.** `busRoute(br, roads, graph)` turns one `busRoutes` entry into a route.js route plus stops:
- `road[i]`: the routable world road nearest to segment `i`'s midpoint (grid query, 2 m), else the previous segment's road (a stub `{ cls: 'unclassified', w: 0, pts: [] }` at the start).
- `joints`: every main-graph node with 3+ edges within 2 m of the route, as `{ s, deg }`, sorted.
- `signals = routeSignals(route)` (roundabout exits per #680).
- `stops`: the #682 stops plus `kerb` = their distance from the centre line; `stopS: Map(uic → s)`.

**Where the bus is.** The bus centre is at progress `s`, drawn at `rightOf(pts, cum, s, busOffset(route, s))`, heading from the points 3 m behind and ahead. `busOffset` is `routeLaneOffset` (#678), and near a stop it moves out to the kerb: offset `kerb - BUS.width/2 - 0.3`, blended in over the 25 m before the stop and out over the 15 m after it (smoothstep), never less than the lane offset.

**Schedule.** Each trip's calls become `{ s, arr, dep }` via `stopS`; a trip with a call not on its route is dropped and counted.
- Window: from `dep(first) - 90 s` (`fromOutside`: from when it would enter at `s = 0` at 12 m/s) to `arr(last) + 60 s` (`toOutside`: until it reaches the route end). A trip whose times pass midnight is tested with `now` and `now + 86400`.
- `placeTrip(trip, route, now)` puts a bus where the timetable says it is: standing at a stop between `arr` and `dep`, between stops linearly in time from `dep(k)` to `arr(k+1)`, at the first stop before departure, at the last stop during the layover. Used when a trip's window opens and after every clock jump.

**Driving** (`stepBus(b, now, dt, gap)`, kinematic, no car physics):
- Target speed = min of `targetSpeed(route, s)` (class speed, bridges, curves), `PA.topKmh` (60), `PA.junctionKmh` (30) from 10 m before to 5 m after every joint with 3+ roads (braked to at `PA.brake` 2 m/s²), a stop at the next call (`PA.brake`), and a stop `gap` metres ahead for the player (`PA.hardBrake` 5 m/s²).
- Speed approaches the target with at most `PA.accel` 1.2 m/s² up and `PA.hardBrake` down. Closer than 0.5 m to the stop and slower than 1 m/s: the bus snaps to the stop.
- At a stop it stands until `max(dep, arrival + PA.minDwell 10 s)`; at the last stop until `arrival + 60 s`, then it is gone. A late bus leaves after the minimum dwell; an early one waits for `dep`.
- `toOutside`: after the last call it drives to the route end and is gone; `fromOutside`: it starts at `s = 0` driving.
- Blinker: `left` for 4 s after leaving a stop (pulling out), `right` in the last 25 m before a stop (pulling in), else `blinkerAt(route.signals, s)`.

**The player** (`obstacleGap(route, s, px, pz, pr)`): the player's progress on the route (`trackRoute`) between 0 and 40 m ahead of the bus centre and within `BUS.width/2 + pr + 0.5` m of the bus's lane line → the gap to stop in, `ahead - BUS.length/2 - pr - 2`. The bus stops and waits as long as the player stays there; it never leaves its lane. Players more than 3 m above or below the bus are ignored (helicopter, bridge above).

**Fleet** (`syncFleet(buses, trips, routes, now)`, once per second): starts a bus for every trip whose window contains `now` and that has none, drops buses that are `done`, at most `PA.maxBuses` (8). When the clock moved by more than 5 s more than the frame time (tab hidden, pause, `?patime`), every bus is placed again from the timetable.

**Collider** (`busCollider(x, z, th, y)`): an OBB `{ x, z, hw: BUS.length/2, hd: BUS.width/2, c: cos th, s: sin th, low: true, h: y + BUS.height, postauto: true }`.

**LED** (`ledText(trip)`): `{ line: '133', dest: trip.to }` (the GTFS name, e.g. "Stein-Säckingen, Bahnhof").

### 3. In `index.html`

- **Mesh.** When the first trip's window opens the game asks `loadVehicleModel('bus')` (the same cache the player's bus uses). A Postauto is a group with `GLTF_CARS.bus.scene.clone(true)` (shared geometry and materials, #323), an LED plane at the front (1.9 × 0.24 m, at the model's front face 0.32 m below the roof, from its bounding box) with a per-trip canvas texture (line number in a box on the left, destination shrunk to fit), and own orange blinker boxes at `VEHICLES.bus.blinkers` spots in two groups (left/right) that belong to this bus only. If the model fails to load, there are no Postautos (logged).
- **Stops.** Every `busRoutes` stop gets `busStop(x, z, name, stopFaceDeg(rot))` (board facing the road, shelter behind it, away from the road). `stopFaceDeg(rot) = (π - rot) · 180/π` turns the stop's local `-z` to the right of travel.
- **Loop.** `stepPostauto(dt)` next to `stepFerris()`: clock, `syncFleet` once per second, `stepBus` per bus with the player's gap, pose and height (`groundH` at the front and rear axle → pitch), blinkers flash at the player's blinker rate. The group is hidden below the surface (`!LEVELS.isSurface()`); the buses keep running.
- **Collisions.** `collide()` and `collideFoot()` also test the active Postautos' colliders: the player bounces off like off a wall; the bus does not move.
- **Debug hook.** `window.__mm.postauto()` → `{ ready, clock, buses: [{ line, to, phase, k, s, v, x, z, th, blinker, led }] }`.
- **About.** Under *Data*: "Timetable: opentransportdata.swiss" (`aboutTimetable`, en/de), link `ABOUT_LINKS.otd = 'https://opentransportdata.swiss/'`.

## Assumptions

- **A0a** [confirmed] Clock: "Echte CH-Uhrzeit, immer Werktag: Uhrzeit Europe/Zurich, aber stets der Werktagsfahrplan" (Maintainer, 2026-11-05).
- **A0b** [confirmed] Bus and player: "Bus bremst, ist festes Hindernis: Der Bus hält vor dem Spieler an und wartet; rammt der Spieler, prallt er ab, der Bus bleibt auf seiner Spur. Kein Bus-Unfall, kein Fahrplan-Chaos" (Maintainer, 2026-11-05).
- **A0c** [confirmed] Timetable source: "Pipeline-JSON im Repo" (Maintainer, 2026-11-05), produced by #682 (`data/timetable_hochrhein.json`, `busRoutes` in the world file).
- **A0d** [confirmed] Driving a line yourself: "Später, eigenes Issue" - that is #683, out of scope.
- **A0e** [confirmed] First line: "Line 133 Frick–Eiken–Sisseln–Stein-Säckingen" (Maintainer, 2026-11-05). Frick Bahnhof is inside the map (#682 probe), so the whole line runs, 14 weekday trips, 11 stops.
- **A0f** [confirmed] Order: "Postauto ist die erste Verkehrsstufe, vor #364" (Maintainer, 2026-11-05). First wave: no traffic lights (#363), slow down at junctions, stop at stops (issue comment 2026-11-05).
- **A1** [high] Buses are kinematic: progress `s` along the route, placed on the lane line, not driven through `stepCar`. Rejected: car physics with the autopilot (`autoStep`), which can go `off-route` or `stuck` (`route.js:285-297`) and could be pushed by the player, against A0b ("bleibt auf seiner Spur"). Evidence: the ferris wheel is already a wall-clock driven, physics-free mover (`index.html:3272`).
- **A2** [high] The bus is a route.js route built from `busRoutes[].pts`, so `targetSpeed`, `routeSignals`, `blinkerAt`, `trackRoute` and #678's `routeLaneOffset` work unchanged. Rejected: A* over the road graph between stops (`findRoute`), which ignores the real line's path and its one-way pieces.
- **A3** [high] Time comes from the wall clock each frame, not from summed frame times; a jump of more than 5 s re-places all buses from the timetable. Rejected: a game clock that pauses with the game, which would let buses drift off the timetable (A0a: real Swiss time).
- **A4** [med] Junction rule: 30 km/h from 10 m before to 5 m after every route point where 3+ roads meet; curves and roundabouts are slowed further by `targetSpeed`'s curve rule. Rejected: a stop at every junction (no right-of-way rules yet, #363/#364). The number is tuning.
- **A5** [med] Dwell: at least 10 s at every stop, leave at `max(dep, arrival + 10 s)`; 90 s at the first stop before departure, 60 s at the last stop, then the bus vanishes. Rejected: buses that stay at the terminus or drive into a depot (no depot data). Every call is a real stop (the GTFS has no request-stop flag in #682's format).
- **A6** [med] Pulling in to the stop: the bus moves to the kerb (stop's kerb distance - half the bus width - 0.3 m) over 25 m before and back over 15 m after; blinker right while pulling in, left for 4 s when pulling out. Rejected: stopping in the lane (looks like a breakdown). The pull-out signal is Swiss practice for buses leaving a stop; the numbers are tuning.
- **A7** [med] Player detection: a 40 m corridor in the bus's lane, bus width + player radius + 0.5 m; the bus stops 2 m before the player with up to 5 m/s². Rejected: the bus also stopping for other buses (headways of 1 h on line 133, no bus-to-bus conflict) and for the player beside it.
- **A8** [med] Postautos need `assets/bus.glb`; when it fails to load there are none. Rejected: a second primitives builder that copies `buildBus` without its global side effects (`index.html:2781-2819`), duplicated code for a rare failure.
- **A9** [med] The LED sits on the model's front face, 0.32 m below the roof, measured from the glTF bounding box; the implementer checks it once on a screenshot. Rejected: editing `bus.glb` in Blender to add a display mesh (asset work, not needed for a lit plane). The player's own bus LED stays "Sisseln" (#683 may change it).
- **A10** [med] The 22 stops are drawn with the existing `busStop` (board + shelter). Rejected: new stop models (design work, can follow). The shelter stands up to 2 m behind the kerb and may touch a building or fence at a few stops.
- **A11** [med] `?patime=HH:MM` sets the clock for tests and testers; no in-game time UI. Rejected: a debug-only hook without a URL, which a tester cannot use from a link.
- **A12** [high] In-game credit for opentransportdata.swiss in the About dialog's *Data* list, as #682 A11 assigns to this issue (terms clause 5.1: cite the URL as source).
- **A13** [high] No Playwright or dry run during enrichment; the plan's pure tests are `node --test`, the implementer runs only the new Playwright file `tests/test_postauto.py` (targeted test rule).

## Consequences

- At most 2 to 4 Postautos run at once on line 133 (trips take about 25 min, departures roughly hourly per direction), well under `maxBuses`. Each is a clone sharing the bus model's geometry; the frame cost is a few draw calls per bus (#550).
- Before about 06:00 and in the evening there are no buses (no trips then). On weekends the weekday table runs anyway (A0a).
- A bus appears and vanishes at Frick Bahnhof and Stein-Säckingen Bahnhof; a player standing there sees it pop in and out.
- The bus's wheels do not turn and its lamps follow the player bus's lamp materials (shared materials).
- The player's autopilot does not see buses; it bumps into a waiting bus like into a wall.
- A player parked in the bus's lane holds the bus until they move; it then runs late and catches up by shortening dwells to 10 s.
- `data/world_hochrhein.json` and the timetable file must exist with `busRoutes` (from #682); without them the game runs exactly as today.

## Out of scope

Driving a line yourself (#683), lines 134, 143 and N95, traffic lights (#363), general traffic (#364), bus-to-bus and bus-to-traffic rules, the player bus's LED text, departure boards at stops, a time-of-day UI.

## Dependencies

**Lands after #682, #678 and #680** (and so after #679, which #678 and #682 build on):
- #682: `busRoutes` in the world file and `data/timetable_hochrhein.json`. Without the data files nothing can be seen.
- #678: `rightOf`, `routeLaneOffset` in `route.js`.
- #680: right blinker at roundabout exits from `routeSignals`; before it, Postautos would blink left on every roundabout exit.

## Acceptance Criteria

- [ ] `zurichSeconds` returns Europe/Zurich local time (CET and CEST verified with fixed UTC dates); `parsePatime('07:30')` is 27000, invalid strings give `null`.
- [ ] `busRoute` gives each segment the nearest routable road, finds junction joints (3+ edges) on the route, keeps `routeSignals`, and maps every stop's uic to its `s` and kerb distance.
- [ ] `busOffset` equals `routeLaneOffset` away from stops and reaches the kerb offset at a stop, blending smoothly.
- [ ] `placeTrip` returns null outside a trip's window, a standing bus at a stop between `arr` and `dep`, a driving bus between stops at the time-interpolated `s`, and handles `fromOutside`/`toOutside` and trips past midnight.
- [ ] `stepBus` brakes to a stop at the next call, stands until `max(dep, arrival + 10 s)`, slows to 30 km/h at junctions, signals right before a stop, left after leaving it, and ends 60 s after the last arrival.
- [ ] `obstacleGap` returns a gap for a player in the lane ahead, `null` beside the lane, behind the bus or more than 40 m ahead; a bus with a player ahead stops before him and drives on once he leaves.
- [ ] `syncFleet` starts buses for open windows, drops finished ones, caps at 8, and re-places everything after a clock jump.
- [ ] In the game (`?patime=` during a trip of line 133): a Postauto from `bus.glb` drives the route, the LED shows "133" and the destination, the bus stands at a stop, the player bounces off it, and `window.__mm.postauto()` reports it.
- [ ] Each stop of `busRoutes` shows a stop sign at the kerb, board facing the road.
- [ ] Without a timetable file (Ehrendingen, or 404) the game loads without errors and without buses.
- [ ] The About dialog lists "Timetable: opentransportdata.swiss" (en/de) with a link.
- [ ] `node --test tests/postauto.test.mjs tests/route.test.mjs tests/regions.test.mjs tests/about.test.mjs` and `tests/test_postauto.py` pass; `CHANGELOG.md` has a player-facing entry.
