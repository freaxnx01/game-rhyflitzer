# Bus stops, PostAuto routes and the weekday timetable (#682)

## Goal

The pipeline gives the PostAuto lines of #500 their data: the **route** of each chosen line and its **stops at the kerb** go into the world file (`busRoutes`, from OSM), and the **weekday timetable** of those lines goes into a small separate JSON (`data/timetable_hochrhein.json`, from the Swiss GTFS on opentransportdata.swiss). First line: **133 Frick – Eiken – Sisseln – Stein AG**. Pipeline and data only; no game code reads the new data in this issue (#500 is the consumer).

## Today

- `pipeline/osm_read.py:92-140` reads nodes, ways and areas in one pass; it reads **no relations**. `world_boundaries.py:21-45` already reads relations in a separate pass (relation pass, then a node+way pass for the members) - the pattern this issue reuses.
- The world file roads carry the OSM way id (`world_roads.py`, key `id`), so a route's member ways can be checked against the world's roads.
- `anchors.json` holds the hand-made, region-specific inputs (`roads`, `exclude_buildings`, ...; `anchors.py:94-110` has one small accessor per key).
- `osm.build_world` (`pipeline/osm.py:93-181`) assembles the MMW1 dict; `world.js:119` copies known keys only, so a new optional key is inert for the game.
- Nothing in the repo touches GTFS yet.

### Measured (data probes, 2026-11-05)

OSM extract `pipeline/cache/osm/hochrhein.osm.pbf` (2026-10-10):

- Line 133 is two `route=bus` relations, operator PAG, network TNW, PTv2: **11533940** "Bus 133: Frick → Eiken → Stein-Säckingen" (141 member ways) and **11533941** "Bus 133: Stein-Säckingen → Eiken → Frick" (147 ways). All member ways are present in the extract and **all 288 are roads of the current `data/world_hochrhein.json`** (0 missing).
- Their stops (role `stop`, all with `uic_ref`): Frick Bahnhof 8500583, Eiken Ost 8581951, Poststrasse 8581843, Industriezone Rütti 8582522, DSM 8572418, Syngenta 8572419, Novartis 8572420, Kreuzstrasse 8511260, Rüchligstrasse 8511259, Bahnhofstrasse 8583811, Stein-Säckingen Bahnhof 8572748 - 11 per direction, each direction with its own stop node on its own side of the road.
- **Every stop of line 133, Frick Bahnhof included (47.5070 N), lies inside the map** (`geo.DEFAULT_BBOX` reaches south to 47.500 since #47). The whole line is in the map.
- Each direction passes 4 closed roundabout ways (`junction=roundabout`, first node = last node, e.g. 57850117, 672824132), entered and left at intermediate nodes; 87 of 141 member ways are listed against their drawing direction.
- 279 bus-stop nodes in the extract overall.

GTFS `gtfs_fp2026_20261104.zip` (feed version 20261104, valid 2025-12-14 to 2026-12-12; 291 MB zipped, `stop_times.txt` 3.7 GB, 42.4 M rows):

- Line 133 of **PostAuto AG** (agency 801) is `route_id` **96-155-3-j26-1**, `route_short_name` "133". "50.133" is the timetable-field (Kursbuch) number, not the GTFS name. A second PostAuto "133" exists in Neuchâtel (96-736-j26-1, Le Landeron - Enges), so short name + agency is not unique; the stops disambiguate.
- GTFS stop sequence of 96-155-3 matches OSM exactly: Frick, Bahnhof > Eiken, Ost > Eiken, Poststrasse > Eiken, Industriezone Rütti > Sisseln AG, DSM > Sisseln AG, Syngenta > Stein AG, Novartis > Stein AG, Kreuzstrasse > Stein AG, Rüchligstrasse > Stein AG, Bahnhofstrasse > Stein-Säckingen, Bahnhof (and reverse).
- Trips active in the week of 2026-11-09 (calendar + calendar_dates): 133 = **14 per weekday (7 per direction), 0 on Saturday and Sunday**, identical sets Monday to Friday. For comparison 134: 56/weekday, 143: 83 (84 on Friday), N95: 0 on Monday to Thursday, 1 on Friday and Saturday.
- The feed splits most services into single-weekday calendars (`0000100` and the like) with up to 255 `calendar_dates` exceptions each, so `calendar.txt`'s Monday-Friday flags alone miss most trips: of the 6,914 trips of all routes named 133/134/143/N95, only 1,014 carry a full Monday-Friday pattern. "Active on a date" must evaluate both files.
- GTFS stop ids are SLOIDs: quay `ch:1:sloid:72418:0:780957`, parent `Parentch:1:sloid:72418`. The SLOID number plus 8500000 is the OSM `uic_ref` (72418 → 8572418, 583 → 8500583, 11260 → 8511260; checked on all 11 stops).
- The probe streamed the whole zip (routes, stops, trips, calendar, calendar_dates, stop_times) **under `MemoryMax=2G`** on the agent box without hitting the cap.

Terms of use (https://opentransportdata.swiss/en/terms-of-use/, read 2026-11-05): file-based data needs no registration and no access code; data may be processed, analysed and published; clause 5.1: "The URL opentransportdata.swiss must be cited as the source for raw data"; clause 5.3: processed data is published under the user's own name; clause 5.2: "ODMCH data must be updated regularly and at the same frequency as the underlying raw data" (the GTFS dataset updates twice a week).

## Design

### 1. Routes and stops in the world file (`pipeline/world_bus.py`, OSM only)

- **Selection.** `anchors.json` gets `"bus": {"lines": ["133"]}`. `world_bus.read` takes every `type=route` + `route=bus` relation whose `ref` is in that list (a separate relation pass, then one node+way pass for the member ways' node ids and locations and the stop nodes' tags). No `bus` key → no `busRoutes` key at all, so Ehrendingen and generated worlds are byte-for-byte unchanged.
- **Assembly.** Member ways with the empty role, in relation order, are chained node by node: each way is oriented so it starts at the previous way's last node; a closed way (roundabout) is ridden as the arc **in its drawing direction** from the entry node to the first node where the next way attaches. A way that does not attach starts a new piece (logged as a gap); the longest piece is kept.
- **Clip.** The assembled line is clipped to the map; of several parts the longest is kept, in travel direction. `cut: [start, end]` says whether the route continues beyond the map at either end (both `false` for 133).
- **Stops.** The relation's `stop`/`stop_entry_only`/`stop_exit_only` nodes, plus `platform*` nodes whose `uic_ref` has no stop node in that relation, deduplicated by `uic_ref`, in relation order. Each is projected onto the clipped line (dropped if more than 30 m off it) and placed **at the kerb on the right-hand side of travel**: `w/2 + 0.5 m` from the centre line, `w` being the width of the nearest world road. A stop without `uic_ref` is dropped and counted (it could not be linked to the timetable).
- **Format** (new optional MMW1 key, rounded like the rest of the file):

```
"busRoutes": [{ "id": 11533940, "line": "133", "name": "Bus 133: Frick → Eiken → Stein-Säckingen",
                "from": "Frick, Bahnhof", "to": "Stein-Säckingen, Bahnhof",
                "pts": [[x, z], ...], "len": 9876.5, "cut": [false, false],
                "stops": [{ "uic": "8500583", "name": "Frick Bahnhof", "s": 12.3, "x": .., "z": .., "rot": .. }] }]
```

  `pts` is in travel direction; `s` is metres along `pts`; `rot = atan2(dz, dx)` of the travel direction (the props convention).

### 2. The weekday timetable (`pipeline/timetable.py`, GTFS)

- **Input.** The GTFS zip, downloaded by hand from the dataset page (https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020, one zip per publication) into `pipeline/cache/gtfs/` (gitignored via `pipeline/.gitignore` `cache/`), plus the built world file for the stops.
- **Streaming.** Every table is read row by row with `csv.reader` straight from the zip; only the chosen lines' trips and their in-map calls are kept. Runs on the agent box under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- **Lines.** Agency `PostAuto AG`, `route_short_name` in the world's `busRoutes` lines; a trip is kept only if at least two of its calls are at stops of the world's routes (this drops the Neuchâtel 133).
- **Weekday.** `--date` (a Monday to Friday; recommended: a Tuesday outside the holidays) picks the services active on that day from `calendar.txt` + `calendar_dates.txt`. The tool also evaluates Monday to Friday of that week and logs every line whose trip set differs from `--date`'s (it does not fail).
- **Linking.** GTFS stop → UIC via the SLOID rule (`ch:1:sloid:N` → `8500000 + N`, from the parent station or the stop id). Each trip is assigned to the world route of its line whose stop sequence contains the trip's in-map calls in order; a trip that fits none is dropped and counted.
- **Format** (`data/timetable_hochrhein.json`, format `MMT1`):

```
{ "format": "MMT1", "source": "opentransportdata.swiss",
  "terms": "https://opentransportdata.swiss/en/terms-of-use/",
  "feed": { "file": "gtfs_fp2026_20261104.zip", "version": "20261104", "from": "2025-12-14", "to": "2026-12-12" },
  "day": "2026-11-10", "service": "weekday",
  "stops": { "8500583": "Frick, Bahnhof", ... },
  "trips": [{ "line": "133", "route": 11533940, "to": "Stein-Säckingen, Bahnhof",
              "fromOutside": false, "toOutside": false,
              "calls": [["8500583", 21120, 21120], ...] }] }
```

  Times are seconds after midnight of the service day (may exceed 86400 after midnight); `calls` hold only stops in the map; `fromOutside`/`toOutside` say the trip begins/ends at a stop beyond the map. Trips are sorted by their first departure.

### 3. Attribution and docs

- `data/README.md` gets a row for `timetable_hochrhein.json` (source opentransportdata.swiss, terms link, feed version) and the world row mentions the bus routes (OSM). `CREDITS.md` gets the opentransportdata.swiss line. `docs/11-pipeline-osm.md` documents `busRoutes`, the `bus` anchors key and the timetable command.

## Assumptions

- **A0a** [confirmed] Timetable source and form: "Pipeline-JSON im Repo: GTFS einmal pro Fahrplanjahr in der Pipeline zuschneiden, kleines JSON committen; statisch, offline, kein CORS, kein API-Key" (Maintainer, 2026-11-05).
- **A0b** [confirmed] Clock: "Echte CH-Uhrzeit (Europe/Zurich), aber immer der Werktagsfahrplan" - the JSON holds only the Monday-Friday trips.
- **A0c** [confirmed] First line: "50.133 Frick–Eiken–Sisseln–Stein AG, nur der Abschnitt in der Karte; später 50.134, 143, N95" (Maintainer, 2026-11-05; #500 comments). Verified against the GTFS (96-155-3-j26-1) and OSM (relations 11533940/11533941), see *Measured*.
- **A1** [high] The section in the map is the **whole line**: Frick Bahnhof (47.5070 N) is inside `geo.DEFAULT_BBOX` (S 47.500, `pipeline/geo.py:15`), so for 133 no bus enters or leaves at the map edge. Rejected: cutting at a hand-picked point near Eiken because the #500 comment says Frick lies outside; the map has reached Frick since #47. Clipping stays in the code for 134/143.
- **A2** [high] Routes and stops go into the world file (OSM, ODbL), the timetable into its own file (GTFS). Rejected: the timetable inside the world file - it would make every world rebuild need the 291 MB GTFS and mix two licences in one file (`data/README.md:7`).
- **A3** [high] OSM and GTFS are linked by UIC number (`uic_ref` ↔ SLOID + 8500000). Rejected: matching by name (OSM "DSM" vs GTFS "Sisseln AG, DSM") or by distance. Measured on all 11 stops.
- **A4** [high] Lines are chosen by `ref` / `route_short_name` in `anchors.json`, not by OSM relation ids or GTFS route ids. Rejected: hard-coded ids; the GTFS route id carries the timetable year (`j26`) and changes every year.
- **A5** [high] Stop names: the world file keeps the OSM `name`, the timetable carries the GTFS names (with the locality, e.g. "Sisseln AG, DSM") for the LED display. Rejected: writing GTFS names into the world file, which would make the world build depend on GTFS.
- **A6** [high] The GTFS step runs on the agent box under the 2 GB cap, not on odroid-plus-pve: the full streaming probe stayed under `MemoryMax=2G`. If a later feed hits the cap (exit 137), move the step to odroid-plus-pve; never raise the cap.
- **A7** [med] "Weekday" = the services active on one reference date (`--date`, a Tuesday), with a logged Monday-Friday comparison. Rejected: `calendar.txt` Monday-Friday flags (they miss most trips, see *Measured*), and the union of Monday to Friday (a Friday-only late trip would run every day; 143 differs on Friday by one trip).
- **A8** [med] Stops are per route direction, at the kerb on the right of travel, `w/2 + 0.5 m` off the centre line. Rejected: a top-level, deduplicated `busStops` list - the two directions stop on opposite sides at different nodes (e.g. Eiken Ost 7835504017 vs 983964648), and #500 needs the side.
- **A9** [med] A route that falls into several pieces (gap in the relation, or leaving and re-entering the map) keeps only its longest piece; the build logs it. Rejected: multi-piece routes, which no planned line needs (133 is one piece).
- **A10** [confirmed] (Maintainer, 2026-11-06: "Jahr + CI-Refresh als Folge-Issue") Refresh **once per timetable year** as confirmed in A0a, although clause 5.2 of the terms asks processed data to be updated "at the same frequency as the underlying raw data" (the GTFS updates twice a week). The file carries the feed version and validity so its age is visible. Rejected: a scheduled refresh job (contradicts A0a). The scheduled CI refresh that satisfies 5.2 is the follow-up #684.
- **A11** [med] Attribution in this issue: `"source": "opentransportdata.swiss"` in the JSON, `data/README.md` and `CREDITS.md`. The in-game credit (about screen) comes with #500, the first feature that loads the file. Rejected: about-screen text now for data nothing shows yet.
- **A12** [med] The GTFS zip is downloaded by hand (the dataset page lists one zip per publication under a random resource id); no download command. Rejected: scripting the CKAN API for a once-a-year step.
- **A13** [confirmed] (Maintainer, 2026-11-06: "Agent liefert Code, ich baue lokal": a local session with the caches rebuilds the data and pushes it to the same PR) The implementing agent ships code and tests. The data files (`data/world_hochrhein.json` rebuild, new `data/timetable_hochrhein.json`) need `pipeline/cache/osm/hochrhein.osm.pbf`, the swisstopo/LWB caches and the GTFS zip, which the CI runner does not have; when they are missing, the PR says so and the maintainer runs the two commands from the plan's last task. Rejected: a hand-written JSON (`data/README.md:3` forbids it). Same rule as #679 A8.

## Consequences

- **Sequencing with #679** (oneway/lanes, plan `docs/superpowers/plans/2026-11-05-road-oneway-lanes.md`): both edit `docs/11-pipeline-osm.md` and both regenerate `data/world_hochrhein.json`. No code dependency (this issue reads road `id` and `w` only), but implementing them in parallel produces a conflict in the generated world file; implement this one after #679 is merged, then rebuild once.
- **#500 consumer contract:** #500 reads `busRoutes[].pts/stops` and `timetable.trips[].route/calls`, matched by `route` = relation id and `uic`. #500 also owns the in-game credit line (A11) and the Europe/Zurich clock.
- N95 has **no weekday trips** (only Friday and Saturday nights), so under the confirmed weekday clock (A0b) it would never run; adding it later needs a different day rule.
- `data/world_hochrhein.json` grows by an estimated 60 KB (two routes of ~1,500 points plus 22 stops); the timetable file is about 6 KB (14 trips × 11 calls).
- The rebuild also picks up every pipeline change merged since the last build; the golden tests show such drift.
- When the next timetable year starts (2026-12-13), the committed file still describes the 2026 timetable until someone reruns the cut.

## Acceptance Criteria

- [ ] `anchors.json` has `"bus": {"lines": ["133"]}`; `anchors.bus_lines(spec)` returns `["133"]`, and `[]` without the key.
- [ ] `world_bus.chain` orients ways by shared end nodes, rides a closed roundabout from its entry node to the next way's attachment in drawing direction, and splits at a way that does not attach (unit tests on a fixture).
- [ ] `world_bus.build` clips to the map (longest part, travel direction, `cut` flags), places each stop with `uic_ref` at the kerb on the right of travel (`w/2 + 0.5` m), drops stops without `uic_ref` or more than 30 m off the line, and sorts stops by `s`.
- [ ] `osm.build_world` emits `busRoutes` only when the anchors have a `bus` key; the Ehrendingen golden test and all existing pipeline tests stay green.
- [ ] Golden (skips without the extract): line 133 gives exactly relations 11533940 and 11533941, one piece each, `cut` `[false, false]`, 11 stops each from uic 8500583 to 8572748 (reverse for 11533941), every stop `w/2 + 0.5 ± 0.2` m right of the line, length between 7 and 14 km.
- [ ] `timetable.py` (tested on a synthetic GTFS zip): keeps only the agency's trips of the world's lines with ≥ 2 in-map calls, evaluates `calendar.txt` + `calendar_dates.txt` for `--date`, refuses a Saturday/Sunday `--date`, maps SLOID → UIC, assigns each trip to the matching route, sets `fromOutside`/`toOutside`, writes seconds after midnight, sorts by first departure, and logs differing Monday-Friday sets.
- [ ] `data/timetable_hochrhein.json` and the rebuilt `data/world_hochrhein.json` are committed (or the PR states which cache was missing, A13); when present, a data test asserts 14 trips for line 133, 7 per route, 11 calls each, nondecreasing times, every call's uic among its route's stops.
- [ ] `docs/11-pipeline-osm.md`, `data/README.md` and `CREDITS.md` document the new key, the timetable file, its source and the opentransportdata.swiss attribution.
- [ ] `cd pipeline && python -m pytest` passes.
