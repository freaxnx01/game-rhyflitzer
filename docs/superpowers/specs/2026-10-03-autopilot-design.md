# Autopilot to a destination — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #18

## Goal

From the playtest on 2026-10-02: an autopilot that drives the car to a destination, picked like the **J** jump menu.

Success: during a game, **O** opens a "Drive to" list. It shows the J landmarks and every named street on the road network, and works like the J dialog (search, place chips, ↑↓ Enter). Picking an entry finds a route on the road graph with A* and the car drives there by itself. It steers along the route, slows down for bends, bridges and the destination, and sets the turn signals before it turns at a junction. The remaining route shows on the minimap (and on the big Tab map once #77 lands). A HUD line names the destination and the distance left. The player takes back control with any steering, gas or brake key, a touch drive button, or **O** again. On arrival the car stops and a toast says so. A run that used the autopilot is not counted, like a jump.

## Starting point (verified 2026-10-03 on `main` @ `7fcda19`)

- **Roads:** the OSM world (`data/world_hochrhein.json`, tracked, format `MMW1`) has 2616 roads `{ id, n, cls, w, mark, bridge, layer, pts }` and 2309 `junctions` `[x, z, r]` (`prototype/index.html:723` draws them as discs). `layoutFromWorld` (`prototype/world.js:66`) passes them through and `index.html:363` sets `ROADS = L.roads`. There is **no one-way data** in the file (no road has a `oneway` key).
- **Graph evidence (dry run on this file, 2026-10-03):** a node at every road end and at every vertex that two roads share gives 2959 nodes, but only 76 % of them are in one connected network. 416 road ends touch another road's centre line within 1 m without a shared vertex (T-junctions). Joining a road end to a road it touches within 1.5 m raises the largest network to **96.6 %** (2855 of 2958 nodes), and 474 of 487 street names reach it. The rest are isolated service and residential stubs. A* on it takes about 1–6 ms. The kinematic simulation of `stepCar`'s drive model followed every route it was given, from the start to Smile-Kreisel, Hallenbad, Fridolinsmünster (5.4 km, over the Fridolinsbrücke), Kirche Stein, DSM-Kamin and Bahnhof Stein-Säckingen, and to a street, and stopped at the destination. It stayed within 5.4 m of the route the whole way.
- **Hand layout** (no world file): the hand roads do not share vertices; their crossings are computed segment by segment (`index.html:724`). There is no usable graph.
- **J dialog (#41):** `#jump` (`index.html:130`), `JUMP` state, `jumpRows` / `renderJump` / `openJump` / `pickJump` / `jumpKey` (`index.html:1041-1058`), entries from `landmarkEntries` (`prototype/landmarks.js`) as `{ n, g, x, z }`. `filterLandmarks` matches name and place. `jumpTo` puts the car on the nearest jumpable road (`index.html:949`); `jumpable` excludes bridges and motorways (`index.html:947`).
- **Car input:** `stepCar` (`index.html:993`) reads `keys` / `touch` into `nitro, gas, brake, steer, hb` on one line. `steer` is multiplied into the turn rate, so a value between −1 and 1 works. Steering only acts at speed (`sf = clamp(speed / 6, 0, 1) …`). `test_vehicles.py::test_golden_trace_of_the_compact_car` pins `stepCar` to 1e-6.
- **Turn signals (#20):** `HUD.blinker` = `'left' | 'right' | null`, toggled by **Q** / **E** (`index.html:915`), drawn in the HUD and on the car by `hud()`.
- **Race:** `R` (`index.html:1030`), `startRace` / `finish` / `resultHtml` (`index.html:1035-1039`). A jump sets `R.jumped` (`placeOnRoad`, `index.html:948`), and then `finish` records no best time and `resultHtml` says `notCountedJump`.
- **Minimap:** `drawMap` (`index.html:1101`) draws the pre-rendered map and then the checkpoints, the finish and the car through `mapPt(v, x, z)`. #77's spec turns the same canvas into the big Tab map (`docs/superpowers/specs/2026-10-03-tab-full-map-design.md`).
- **Keys** (`index.html:915`, specs): T, C, R, H, Enter, M, F1, `?`, Esc, F3, Tab, V, G, K, Q, E, `+`, `=`, `-`, J, N, B, driving W A S D, arrows, Space, Ctrl. Claimed by open work: **F** + Shift (#10), **L** (#2), **P** + Esc (#83). `grep -c KeyO prototype/index.html` → 0.
- **Places:** `VILLAGES` (`world.js:179`), eight village-sign centres, upper case.
- **Tests:** `node --test prototype/tests/*.test.mjs` for pure modules. pytest + Playwright in `prototype/tests/test_*.py`, with `needs_world` skips for world-file tests (`test_jump.py`).

## Decisions

| Topic | Decision |
|---|---|
| Route search | **A\*** on an undirected road graph (user decision 2026-10-03). Nodes: road ends and vertices shared by two roads. A road end within **1.5 m** of another road's centre line joins it there. It never joins onto the middle of a bridge span. Edges are the stretches between nodes. Only the **largest connected network** is used. |
| Routable roads | Every class except `footway`, `path`, `steps`, `cycleway` and `pedestrian`. Motorways, links and bridges are in (the Fridolinsbrücke is the only road across the Rhine). |
| Traffic rules | **None** (user decision): no lanes, no right of way, no one-way streets (the data has none). The car drives the road's centre line. |
| Destinations | The **J landmarks** plus **streets** (user decision). A street entry is one street name next to its nearest village sign (`VILLAGES`, shown as "Bad Säckingen", not "BAD SÄCKINGEN"). Every stretch of that street is a goal, and the route ends in the middle of the nearest stretch. A landmark's goal is the nearest point of the network within 400 m. House numbers: later. |
| Key | **O** opens the "Drive to" dialog, only with the start overlay hidden (like J). **O** while the autopilot drives turns it off. |
| Dialog | The **J dialog in a second mode** (`JUMP.mode = 'drive'`): title "Drive to", rows = landmarks then streets (`street · <place>` in the right column), chips = every place in list order, no "Random spot", **O** / Esc closes it. Enter or a click starts the autopilot. |
| Take back control | Any of W A S D, the arrows, Space, Ctrl, N, a touch drive button, or **O** ends the autopilot at once ("Autopilot off — you drive"). The key also does its normal job. **R**, **J**, a map double-click, Start / Retry and the finish end it silently (they all go through `resetCar` or `finish`). Other keys (C, B, V, G, H, M, T, Tab, F3, `+`/`-`, K, Q/E) leave it running. While it drives it owns the turn signals, so Q / E are overridden. |
| Steering | Pure pursuit: aim at the route point 7–25 m ahead (7 m + 0.6 s × speed), steer = clamp(2.5 × heading error, −1, 1). If that point is behind the car (> 90°), it creeps at 4 m/s and turns round. |
| Speed | The lowest of: the road class (motorway/trunk 100, primary/secondary 60, tertiary/unclassified 50, residential/service 30, living street 20 km/h, other 30), **30 km/h on a bridge and 20 m before and after it** (#78: the Fridolinsbrücke deck still launches a fast car), a bend limit (√(3.5 m/s² × 16 m / turn over 16 m)), and a stop at the destination. Every limit ahead is reached at 4 m/s² of braking. Gas below the target − 0.5 m/s, brake above the target + 1.5 m/s, never nitro or handbrake. |
| Turn signals | At a junction with 3+ roads where the route turns by 30° or more, the signal for that side is on from 50 m before to 10 m after the junction (user decision: blinkers at turns). Bends without a junction get none. |
| Arrival | Less than 8 m left and below 2 m/s, or less than 2 m left: the autopilot ends, the signal goes off, toast "Arrived: <name>". |
| Off route | Pushed more than 20 m off the route (a crash), it plans again from where the car is. If the car is more than 30 m from the network, or no route exists: "No route from here", autopilot off. |
| Stuck | Slower than 1 m/s for 4 s: "Autopilot stuck — you drive", autopilot off. There is no automatic reversing. |
| Race | Engaging it in `armed` / `racing` sets `R.auto` (user decision). `finish` records no best time, and the result says "with the autopilot, not counted". `startRace` clears it. Checkpoints passed on the way still count for the run. |
| Minimap | The remaining route as a cyan line (`#3ddcff`, dark outline) from the car to the destination, with a cyan dot at the end, drawn in `drawMap` under the checkpoints. The big Tab map (#77) is the same canvas, so it shows the route with no extra code. |
| HUD | A cyan line under the road name: `AUTOPILOT → <name> · 2.4 km`. Empty when off. |
| Hand layout | **O** only toasts "Autopilot needs the OSM world". |
| Touch | No button to open the dialog (J is keyboard-only too). Touch drive buttons take back control. |
| Pure logic | New module `prototype/route.js` (no DOM, no three.js): `buildGraph`, `snapToGraph`, `findRoute`, `turnAt`, `routeSignals`, `blinkerAt`, `trackRoute`, `steerToward`, `targetSpeed`, `autoStep`, `placeName`, `streetEntries`, `placeChips`, `TAKE_OVER_KEYS`, `AUTO`, `CLASS_KMH`. Tested with `node --test`. `index.html` keeps the glue (`AUTOP` state). The graph is built on the first **O** (≈ 0.1 s). |
| `stepCar` | Only its input line changes: when the autopilot is on, gas / brake / steer come from it and nitro and handbrake are 0. With the autopilot off, every input is read exactly as before, and the golden trace stays unchanged. |
| Strings | New keys (en / de): `keyAuto`, `driveTitle`, `driveHint`, `streetIn`, `autoOn`, `autoOff`, `autoArrived`, `autoStuck`, `autoNoRoute`, `autoNoWorld`, `autoLine`, `notCountedAuto`. |
| Test hooks | `__mm.auto()` → `{ on, dest, len, left, signals, blinker, last }`; `__mm.autoSim(secs)` steps the car and race at 1/60 s while the autopilot is on and reports `{ on, last, x, z, blinkers, maxKmh, secs }`; `__mm.raceFlags()` gains `auto`. |

## Interactions with planned features

- **Helicopter #10 (merged on `main` @ `3ddb51c` while this spec was written):** taking off (`takeOff`) ends the autopilot. **O** does nothing while flying. The landing does not resume it.
- **Pause #83 (spec on `main`):** the pause skips the whole step block, so the autopilot freezes with the car and continues on resume. The pause ignores game keys, **O** included. No extra code.
- **Look back #65 (merged):** **B** moves only the camera. The autopilot keeps driving.
- **Tab #77 (spec on `main`):** the full map is the minimap canvas, so it shows the route. Until #77 lands, Tab still runs the game ×3, and the autopilot works at ×3 too (it runs inside every `stepCar` call).
- **Bridges #78 (open):** bridges are routable at 30 km/h. Once #78 levels the deck, `AUTO.bridgeKmh` can be raised.
- **J dialog #86 (open):** holding **O** may flicker the dialog the same way. #86's fix in the shared `jumpKey` covers both.

## Assumptions

- **A1** [high] [confirmed] A\* route search on the road graph built from `ROADS`, and steering along the route. Destinations are the J landmarks plus street names, house numbers later. No traffic rules; turn signals at turns. In a race the autopilot marks the run as not counted, like a jump. Decided by the user on 2026-10-03.
- **A2** [med] Key **O** opens a second mode of the J dialog. Rejected: Z ("Ziel") — the game reads `e.code`, and `KeyZ` is the key labelled Y on Swiss and German keyboards. Rejected: a "drive there" action inside the J dialog (Shift+Enter is hidden, and J means "teleport"). Free letters were I, O, U, X, Y, Z (`grep -c KeyO` → 0; F, L, P are claimed by #10, #2, #83).
- **A3** [med] Any steering, gas, brake, handbrake or nitro key, any touch drive button, or **O** takes back control, and the key acts normally at once. Rejected: only O / Esc (a player who grabs the wheel expects it to work); a hold-to-cancel delay. Q / E do not cancel (turn signals are not driving).
- **A4** [med] Road graph from shared vertices **plus** joining road ends that touch a road within 1.5 m, largest network only. Evidence: the dry run above (76 % → 96.6 %). Rejected: using `junctions` as the only nodes (2309 discs, but 2274 of them already sit on road ends, and they miss the T-junctions); a larger join radius (it could join roads that only pass close by).
- **A5** [med] Streets are grouped by name and nearest village sign. The route ends in the middle of the nearest stretch. Rejected: the true Gemeinde (the world file has boundary lines, not polygons: `boundaries[].names` holds two names); one entry per OSM way (565 entries already).
- **A6** [med] Speed policy: class caps, 30 km/h on and near bridges, bend and stop limits, no nitro. Rejected: full speed everywhere (the car leaves the road in bends and launches off the Fridolinsbrücke ends, #78); one flat speed (slow on the Hauptstrasse, too fast in the Bodenackerstrasse).
- **A7** [med] Stuck for 4 s ends the autopilot with a message. Rejected: automatic reversing (#36: cars get stuck next to buildings for reasons the autopilot cannot see; a manual R / take-over is clearer).
- **A8** [med] The route is a cyan line on the minimap. The HUD gets one text line, and there is no 3D route ribbon. Rejected: a 3D line on the road (more GPU objects, and the turn signals and the minimap already show the way).
- **A9** [high] The autopilot is off in the hand layout. Evidence: the hand roads cross without shared vertices (`index.html:724`).
- **A10** [high] New UI text goes through `tr()` with en and de entries (`strings.test.mjs` enforces equal keys and no `ß`).

## Consequences

- The car drives on the centre line, through oncoming lanes and round roundabouts in either direction (there is no traffic and there are no rules).
- Driving from Sisseln to the Fridolinsmünster (5.4 km) takes about 7 minutes at these speeds. The race timer keeps running.
- The 3.4 % of nodes outside the main network (isolated service and residential stubs) cannot be destinations, and from there "No route from here" shows until the car is within 30 m of the network.
- Some street names exist in two places ("Hauptstrasse · Sisseln" and "Hauptstraße · Sisseln" both show, because OSM spells it both ways on the two sides of the Rhine).
- The autopilot does not avoid buildings, trees or props, so a tight bend can scrape a wall. Damage counts as usual.
- Q / E pressed while the autopilot drives do nothing visible: the autopilot sets the signals every step.

## Out of scope

House-number destinations (needs `addr:*`, #12 / #71), traffic rules and lanes, other traffic, a 3D route ribbon, voice / sound for turns, a touch button for the dialog, automatic reversing, routing in the hand layout.
