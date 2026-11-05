# Autopilot drives in the right lane (#678)

## Problem

`steerToward()` (`route.js:254`) aims at `pointAt(route.pts, route.cum, s + look)`, a point on the OSM centre line.
The autopilot therefore drives in the middle of the road. A route is built from the centre lines of the road graph
(`route.js:139-152`), and `trackRoute` (`route.js:244`) measures progress against the same line.

## Decision

Offset the **steering target**, not the route. The route, the progress tracking, the signals and the speed rules keep
using the centre line; only the look-ahead point moves to the right of the direction of travel.

- New pure helpers in `route.js`, written so Postauto (#500) and traffic (#364) can reuse them without a `route` object:
  - `laneOffset(road)`: metres to the right of the centre line for one road record `{ w, lanes?, oneway?, cls }`.
  - `rightOf(pts, cum, s, off)`: the point on a polyline at `s`, moved `off` metres to the right of the local direction.
  - `routeLaneOffset(route, s)`: the offset at progress `s` on a route, blended across segment changes.
- `laneOffset(road)`:
  - two-way road: `w / (2 * lanes)` (`lanes` defaults to 2, so `w / 4`: the centre of the right lane), capped at `AUTO.laneOffsetMax` (2 m);
  - `oneway`, roundabout (`isRoundabout`), `*_link` class: `0` (no opposite lane to keep away from);
  - missing or invalid `w`: `0`.
- Blending: `routeLaneOffset` averages the per-segment offset over `s - AUTO.laneBlend .. s + AUTO.laneBlend` (8 m each
  side) so the target slides across a junction instead of jumping.
- Direction: heading `th = atan2(dz, dx)`, growing `th` turns right (`route.js:2-3`), so the right-hand normal of a
  direction `(dx, dz)` is `(-dz, dx)`.
- `steerToward` uses the offset look-ahead point. `trackRoute`, `targetSpeed`, `routeSignals`, `autoStep` are unchanged.

## Acceptance criteria

- On a straight two-way road of width 6 the steering target lies 1.5 m to the right of the centre line; a car on the
  right lane centre gets a smaller `steer` than a car on the centre line, which steers right.
- A car heading west gets a target on the north side (right of west), heading east on the south side.
- `lanes` is honoured: 4 lanes on `w = 12` gives 1.5 m; the offset never exceeds 2 m.
- Oneway roads, roundabouts and `*_link` roads get offset 0.
- Across a change of road (two-way to oneway) the offset changes gradually, with no jump.
- Existing route tests stay green; route length, `joints`, signals and `targetSpeed` are unchanged.
- The helpers are exported from `route.js` and have no DOM or three.js dependency.

## Assumptions

- **A1** [confirmed] Dependency on #679: "#678 baut auf #679 auf (oneway und lanes in der Weltdatei); ohne oneway kein Versatz auf Einbahnstrassen/Auffahrten" (Maintainer, 2026-11-05). This work lands after #679.
- **A2** [confirmed] Shared logic: "Der Spurversatz gilt später auch für die Postautos (#500) und den Verkehr (#364); die Logik soll wiederverwendbar in route.js liegen" (Maintainer, 2026-11-05).
- **A3** [med] Field names from #679 are `road.oneway` (boolean) and `road.lanes` (integer, may be absent). #679 is enriched in parallel and its contract was not final when this was written. Rejected: reading raw OSM tags. Evidence: the pipeline already reads `lanes` from OSM tags (`pipeline/world_roads.py:63`). The plan's dependency step re-reads #679's merged contract and adapts the property names in `laneOffset` only.
- **A4** [med] Offset is the centre of the innermost right lane, `w / (2 * lanes)`, capped at 2 m. Rejected: a fixed 1.5 m. Evidence: the issue asks for "etwa eine halbe Spurbreite, abgeleitet aus `w` bzw. `lanes`"; road widths are per road in `r.w` (`world.js:263`).
- **A5** [med] Roundabouts and `*_link` roads get 0 (the issue says "keinen oder einen anderen Versatz"). Rejected: an offset on the ring. Evidence: the ring is detected by `isRoundabout` (`route.js:7-15`) and is one-way; a different offset is tuning for later.
- **A6** [high] Only the steering target moves; progress tracking stays on the centre line. Rejected: building an offset route polyline. Evidence: `trackRoute`, `routeSignals`, `turnAt` and `targetSpeed` all index `route.pts` / `route.cum` (`route.js:193-260`); an offset polyline would change lengths at bends.
- **A7** [high] No reproduction or browser dry run: `steerToward` aims at the centre line (`route.js:254-258`).

## Consequences

- The autopilot sits up to 2 m off the centre line, so on narrow roads closer to the road edge; the `offRoute` limit (20 m) is not affected.
- Left turns now cross the oncoming lane for real; with no traffic collisions this has no gameplay effect yet, but #364 will meet it.
- Autopilot screenshots or tests that assert a car position shift by up to 2 m.

## Out of scope

Postauto (#500) and traffic (#364) use the helpers later. Pipeline fields are #679.
