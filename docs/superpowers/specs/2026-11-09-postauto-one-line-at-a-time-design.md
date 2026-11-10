# Only one PostAuto line at a time? (#796) — design

## Verdict: by design, not a bug

The game places buses exactly where the weekday timetable says. Line 133 is a commuter line that runs only in the morning and afternoon peaks; outside them line 143 is the only line with trips inside the map. Whenever both lines have a trip inside the map window, both are on the road.

## Evidence (measured with a pure node script, real `world_hochrhein.json` + `timetable_hochrhein.json`, day 2026-11-10 "weekday", `syncFleet([], …)` every 5 minutes, 288 steps)

Timetable data: 97 trips in the map, 133 = 14 (routes 11533940 / 11533941, 7 per direction), 143 = 83 (routes 9093371 / 11533937). `fleetRuns` makes 63 runs: 133 = 2 runs (7 chained legs each), 143 = 61 runs (1-2 legs).

133 trips (first departure to last arrival): towards Stein-Säckingen 06:22, 07:22, 08:22, 14:43, 15:43, 16:43, 17:43; towards Frick 05:52, 06:52, 07:52, 08:52, 15:09, 16:09, 17:09. Nothing from 09:18 to 14:43 and nothing after 18:08.

Maximum buses at once per hour (game = buses placed by `syncFleet`, timetable = trips whose `tripWindow` covers the time):

| Hour | game 133 / 143 | timetable 133 / 143 | 5-min steps (of 12) with both lines, game / timetable |
|---|---|---|---|
| 00-04 | 0 / 0 | 0 / 0 | 0 / 0 |
| 05 | 1 / 1 | 1 / 2 | 1 / 1 |
| 06 | 1 / 3 | 1 / 3 | 12 / 10 |
| 07 | 1 / 3 | 1 / 3 | 12 / 10 |
| 08 | 1 / 3 | 1 / 3 | 11 / 8 |
| 09 | 1 / 2 | 1 / 2 | 4 / 3 |
| 10-13 | 0 / 2-3 | 0 / 2-3 | 0 / 0 |
| 14 | 1 / 2 | 1 / 2 | 3 / 2 |
| 15 | 1 / 2 | 1 / 2 | 12 / 10 |
| 16 | 1 / 3 | 1 / 3 | 12 / 11 |
| 17 | 1 / 3 | 1 / 3 | 12 / 11 |
| 18 | 1 / 3 | 1 / 3 | 2 / 2 |
| 19-23 | 0 / 1-3 | 0 / 1-3 | 0 / 0 |

Day total: both lines on the road in 81 of 288 steps in the game, 68 by the bare timetable (the game keeps a bus 90 s before departure and 60 s after arrival). Peak of all buses at once: 4, far below `PA.maxBuses` (8); no step has more than 8 open runs.

Spot checks (`syncFleet`): 07:00 = 133 to Frick, 143 to Laufenburg (standing), 143 to Stein-Säckingen; 12:00 = only 143 to Laufenburg.

## Ruled out

- `linkTrips` chaining across lines: it requires `t.line === a.line` (`postauto.js:175`), and the chained runs are single-line.
- `maxBuses` cut: `postauto.js:335` never triggers (peak 4 of 8).
- Window cut: `tripWindow` (`postauto.js:156-162`) matches the timetable plus the 90 s / 60 s margins.
- Shared stop blocking: `syncFleet` keys runs by `tripKey` (`route:firstDeparture`, `postauto.js:147`); a shared Stein-Säckingen stop blocks nothing.

## Consequences

- To a player testing between about 09:20 and 14:40 or after 18:10 on a weekday, or at any time on a weekend (the timetable is the weekday one every day, `postauto.js:21`), only line 143 is visible. That is what the timetable says: 133 has no trips in the map then.
- Line 134 (56 trips per weekday) is in the feed but not in the game (`docs/superpowers/specs/2026-11-05-bus-routes-timetable-design.md:29`). Adding it is the only way to get more simultaneous lines; that is a pipeline/data change and a separate decision, not part of this issue.

## Scope

In: pin the measured behaviour with a node test so a later change cannot silently drop a line. Out: any change to `postauto.js`; new lines (line 134, others).

## Assumptions

- **A1** [high] By design, no code fix. Rejected: raising `maxBuses` or a per-line cap; `postauto.js:335` is never reached with more than 4 buses.
- **A2** [high] The checked-in weekday timetable is correct for 133. Rejected: a data bug; the 14 trips match the pipeline spec's count (`docs/superpowers/specs/2026-11-05-bus-routes-timetable-design.md:29`).
- **A3** [med] Add one characterization test on the real data (two lines at 07:00, one at 12:00). Rejected: no test at all; the acceptance criterion asks for a test, and it guards the finding.
- **A4** [low] Whether the maintainer wants more simultaneous lines (line 134 or another) is open. Rejected: deciding it here; it adds a bus line, a pipeline run and a data commit.
