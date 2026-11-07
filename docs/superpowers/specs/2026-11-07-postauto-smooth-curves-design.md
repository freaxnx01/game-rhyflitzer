# Postauto: smooth, wide curves (#710): design

**Issue:** #710 (playtest feedback on line 133, #500): the Postauto drives bends angular, following the polyline corners. It should swing out onto a smooth path like a 12 m bus.

## Measured (route 11533940, line 133, 554 points, 12 021 m)

- `busPose` today = lane offset of the raw polyline (`rightOf(route.pts, ...)`, `postauto.js:104-108`) and heading from a +-3 m chord.
- Worst corner (s 5913, a 180 degree turnaround at a stop): 2.43 rad/m = **0.41 m radius**. Ordinary junction corners (s 10225, 11536, 8921; 93-96 degrees in the polyline): **1.5-2.8 m radius**, the heading turns 100-124 degrees over **8-9.5 m** of road.
- **210 m** of the route is tighter than a 12 m radius, 102 m tighter than 8 m. 83 of 553 segments are shorter than 5 m, so many corners are clusters of vertices.
- A 12.2 m x 2.55 m bus (`bus.js:8`) has a centre-line turn radius of roughly 10 m at a junction.
- Prototype (moving average of the centre line over +-10 m, stop zones excluded): the same three corners get **9.4-10.1 m** radius with at most **3.8 m** deviation from the polyline anywhere; the only remaining spot below 8 m is the turnaround at the stop (0.25 m of it).

## Design

A pure, precomputed **driving line** per route in `postauto.js`:

- `route.drive = { step: 1, pts }`: the centre line resampled every 1 m of original arc length `s`, each point the mean of the original polyline over `s - H .. s + H` (box filter, `PA.smoothHalf = 10` m, 1 m samples). A box filter turns a 90 degree corner into a bend of about `H` metres radius, and works for vertex clusters and roundabout rings without special cases.
- **Stop zones keep the original line.** A weight `w = smoothstep((d - 8) / 12)` with `d` = distance in `s` to the nearest stop, route start or end blends original (`w = 0`) to smoothed (`w = 1`). Stops therefore land exactly where the timetable says (same `s`, same position within 0.1 m), and the kerb pull-in (`busOffset`) is unchanged.
- **`s` stays the original arc length.** Everything else (timetable, joints, signals, `targetSpeed`, `trackRoute`, `obstacleGap`) is untouched. On the smoothed line the bus covers slightly less ground per `s`, a few percent in a bend only.
- `busPose` and `obstacleGap` read the lane point from the driving line: position = `drive(s)` + offset metres right of the driving line's local direction (+-1 m); heading from the +-3 m chord of that offset path, as today. With a bend radius of at least 8 m and a lane offset of at most 2 m the offset path has no cusp.
- `index.html` needs no change (`busPose(route, s)` keeps its signature).

## Not in scope

- The autopilot (`route.js`) and ambient traffic keep their polylines.
- Speed in bends (`targetSpeed`, junction 30 km/h) is unchanged.
- The 180 degree turnaround at a stop (s 5913) stays a cusp: the bus reaches the stop and reverses direction as before.

## Assumptions

- **A1** [high] The smoothing lives in `postauto.js` as a pure precomputed line; `route.js` is not touched. Rejected: smoothing in `route.js` `rightOf`, which would change the autopilot (#678) and traffic. `postauto.js:104-108` is the only place the bus pose is built.
- **A2** [high] Box-filter (moving average) of the centre line instead of corner arcs or Catmull-Rom. Rejected: Catmull-Rom passes through every vertex, so a 25 m + 4.4 m corner keeps its radius of about 2 m; arcs clamp to half the shorter segment, which clusters of short segments (83 of 553 are under 5 m) defeat. Measured above.
- **A3** [high] `s` stays the original polyline arc length, so the timetable, stops and joints need no change; the speed along the ground differs by a few percent in a bend only.
- **A4** [med] `PA.smoothHalf = 10` m gives about a 10 m radius for a 90 degree turn (measured 9.4-10.1 m) and a corner cut of up to 3.8 m from the polyline. A 12 m bus's real centre-line radius is about 10 m, so this is "a bit generous, visibly swinging", not a tuned value.
- **A5** [med] The smoothed line cuts a corner by up to 3.8 m, which can put the bus's inner side over a kerb or onto the opposite lane in a tight junction. There are no kerbs or opposing traffic for buses in the game (spec A0b: kinematic, drawn on the lane line), so this is accepted.
- **A6** [med] Stops and the route ends are exempt from smoothing within 8 m (full strength from 20 m). A stop right after a corner gets a slightly shorter run-up of smooth line.
- **A7** [med] The 180 degree turnaround at the stop at s 5913 is left as it is (a cusp at the stop), as the bus stands there anyway.
- **A8** [med] The check is `node --test` on synthetic routes only (L corner, vertex cluster, stop beside a corner); no Playwright test, since `index.html` is unchanged and the pose maths is pure.

## Consequences

- The Postauto's outer swing in bends makes the 12 m bus take more road width in junctions; the player's car parked on the inside of a corner is touched sooner by the bus collider.
- `busPose` and `obstacleGap` are somewhat more costly (drive point lookup by index, no list scan); precompute is about 12 000 points x 21 samples per route once at load, a few ms.
- The speed along the ground in a bend is slightly lower than the kinematic `v`, a few percent.

## Acceptance

- On an L-shaped route (legs 100 m) the smallest radius of the bus path is at least 8 m (before: under 1 m) and the path deviates at most 4.5 m from the polyline.
- On a corner made of a 25 m leg, a 4.4 m leg and a second 45 degree turn the radius is also at least 8 m.
- A stop beside a corner: `busPose` at the stop `s` is within 0.1 m of the old pose, and a bus still arrives and stands there.
- Straight stretches are unchanged (pose within 1e-6 m).
- `node --test tests/` passes.
