# Autopilot blinks when leaving a roundabout, not when entering (#231)

## Reproduction (measured, no browser)
`node` script over `data/world_hochrhein.json` with `buildGraph` / `snapToGraph` / `findRoute` / `routeSignals` from `prototype/route.js`: routes through the mapped roundabouts (e.g. way 57850117, 20 m across, ring between route s = 110 and 125 m) give signals `[98 left, 125 right, 167 left]`. `routeSignals` blinks 50 m before **every** joint with `deg >= 3` and a heading change of 30 degrees or more (`AUTO.turnAngle`, window `signalBefore` 50 / `signalAfter` 10 in `blinkerAt`), so the blinker comes on at the entry joint (s = 98, window 48..108), another one fires at each arm joint passed on the ring and one at the exit; way 89434684 gives `[71 left, 88 left]` for one ring. The car signals while entering and the signal at the exit is not distinct from the rest.

## Prerequisite is already met
The issue assumes the pipeline must export `junction=roundabout`. It need not: the world file already holds each roundabout as a **closed way** (first point == last point). 19 closed loops under 80 m across exist in `world_hochrhein.json`, the primary-class ones 20-28 m. `prototype/index.html` already detects the Smile-Kreisel the same way (`r.pts.length > 4` and endpoints within 0.5 m, in the `at('smileKreisel')` branch). So: a pure `isRoundabout(road)` in `route.js`, no pipeline change; #207 (roundabout instructions) can reuse it.

## Design
1. `export const isRoundabout = (r) => ...` in `prototype/route.js`: routable class, more than 4 points, closed (ends within 0.5 m), bounding box 15 to 45 m across. (Excludes the 76 m service loop and the pedestrian plaza in the data.)
2. `routeSignals(route)` walks `route.road` (per-segment road objects, already produced by `assemble`) to find runs of segments on a roundabout ring `[sIn, sOut]`. Inside a run (inclusive of the entry joint) no junction signal is emitted. When the route continues after `sOut`, one exit signal is emitted: `{ s: sOut, side, from: sOut - AUTO.roundaboutSignalBefore (15), to: sOut + AUTO.signalAfter }`. A run that begins at the route start or ends at the route end (start or destination inside the ring) emits nothing.
3. `side` follows the ring travel: the sign of the summed heading change over the run (same sign convention as `turnAt`, > 0 right). Clockwise ring (Swiss right-hand traffic) gives `right`.
4. `blinkerAt(signals, s)` uses `sg.from ?? sg.s - AUTO.signalBefore` and `sg.to ?? sg.s + AUTO.signalAfter`; ordinary junction signals are unchanged.
5. Exposed through the existing `window.__mm.auto()` field for the browser test.

## Assumptions
- **A1** [high] Detect rings geometrically in `route.js`; no pipeline export now. Rejected: waiting for `junction=roundabout`; the closed ways are already in `data/world_hochrhein.json` and `index.html` relies on the same shape.
- **A2** [med] Exit blinker window 15 m before the exit point to 10 m after. Rejected: the 50 m junction window; it would still cover the ring (rings are 60-90 m around).
- **A3** [med] Diameter filter 15-45 m. Evidence: measured 20-28 m for the primary roundabouts, 76 m for a service loop.
- **A4** [high] Ring direction is whatever the router picked (the graph is undirected, no one-way data, `buildGraph` comment); the exit side follows it. Counter-clockwise driving is a routing issue, out of scope.

## [needs maintainer]
- Should the autopilot also blink on the **entry** (many drivers do not; Swiss rule: signal when leaving)? Default: no, exit only, as the issue asks.
- Is the geometric detector acceptable instead of the pipeline export (shared with #207)? Default: yes; the export can follow later and `isRoundabout` can read a `roundabout` flag first.
