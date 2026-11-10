# Swiss-style Postauto stops (#712): design

**Issue:** #712. **Builds on:** #500 / PR#696 (`busStop`, `index.html:1994`; stops from `data/world_hochrhein.json` `busRoutes[].stops`).

## Goal

Every Postauto stop looks like a Swiss stop (Haltestellentafel on a pole, timetable frame, yellow zigzag on the
asphalt) and nothing of it stands where the standing bus or the road is: pole and shelter are beyond the kerb on the
side away from the road, with a measured clearance to the bus at every stop in the world data.

## What is wrong today (measured)

Every number below comes from `data/world_hochrhein.json` run through `busRoute`/`busPose` (`postauto.js:74-101`)
with the group geometry of `busStop` (`index.html:1994`): pole at the stop point, shelter roof 4 × 1.8 m at local
z = −1.2 (so from −0.3 to −2.1), glass back wall at z = −2.05, group yaw `stopFaceDeg(st.rot)`.

- **The stop point sits 0.5 m beyond the asphalt edge** (`pipeline/world_bus.py:20,193`: `w/2 + KERB`, `KERB = 0.5`).
  The standing bus pulls in to `kerb − BUS.width/2 − kerbGap` (`postauto.js:91`, `kerbGap: 0.3`, `postauto.js:12`),
  so on a straight road the **pole is 0.30 m from the bus flank** and the shelter roof's near edge 0.6 m. That is
  the "half on the carriageway" look: a 1.2 m board and a 4 m roof hang right over the bus's side.
- **At bends the bus body sweeps through the stop.** `busPose` takes its heading from the chord s − 3 … s + 3
  (`postauto.js:98`), the body is 12.2 m long (`bus.js`). Where the route turns at the stop the body stands across
  the kerb line. Signed clearance of the stop parts to the standing-bus rectangle (negative = inside the bus):

  | stop (route) | pole | roof corners | bus heading vs route tangent |
  |---|---|---|---|
  | Industriezone Rütti (11533941) | **−0.68** | −0.26 … +1.65 | −1.74 vs −0.31 rad |
  | Industriezone Rütti (11533940) | **−0.21** | −1.07 … +2.33 | −1.88 vs −0.31 rad |
  | Stein-Säckingen Bahnhof (both) | +0.16 / +0.22 | **−0.37 / −0.32** … | 2.70 vs 3.11 rad |
  | Frick Bahnhof (both) | +0.17 / +0.21 | **−0.18 / −0.07** … | 0.17 vs −0.15 rad |
  | all other 14 stops | +0.30 | +0.51 … +2.46 | straight |

  Industriezone Rütti lies in the Sisslerfeld between Sisseln and Eiken: that is the screenshot. Both directions share
  one stop point there (`x: 1965.8, z: 834.1, rot: 0.0` in both routes) because both routes run the same way through
  the loop.
- **Also inside a road:** the Novartis stop (11533940, `x: −739.9, z: −3.5`) lies 1.42 m from the centre line of a
  4 m service road (half-width 2.0), so the pole and the whole shelter are on that side road's asphalt
  (pole −0.58, back wall −1.38 m inside the edge). Industriezone Rütti's roof corner is −0.18 m inside Hardstrasse.
- **The sign is not Swiss:** a 1.2 × 0.5 m landscape yellow board with only the stop name
  (`textTex(name, 512, 214, '#f5c400', '#111111', …)`), no operator mark, no line plate, no timetable, no marking
  on the road.

## What a Swiss Postauto stop looks like (sources)

- The stop itself has **no federal road sign**: the SSV's "Bushaltestelle" (5.46) is only a signpost symbol
  (SSV 741.21 Anhang 2, Art. 49). The stop is marked by the operator's **Haltestellentafel** on a pole or stele,
  with **Linientafeln** (line plates) and a **Fahrplantafel** (timetable frame) at eye height; the pole stands
  where it is visible from the kerb (Nationaler Branchenstandard Kundeninformation öV Schweiz, BS-KI V7,
  ch. 4.4.3.2.1 "Haltestellentafeln: Standort, Form und Anbringung", tp-info.ch).
- On the asphalt a **yellow zigzag line** along the kerb marks the stop: SSV Art. 79a Abs. 3
  "Zickzacklinien (gelb; 6.21) kennzeichnen Haltestellen des öffentlichen Linienverkehrs".
- The real PostAuto Haltestellentafel (user photo of the stop "Wilen", Menzingen) hangs in a **bent steel tube
  frame**, an inverted U of two vertical round tubes joined by a rounded top bar; one leg runs on down as the pole.
  The plate is **landscape**, in horizontal bands: a Postgelb header band (posthorn at the left, the PostAuto logo
  with the red cross at the right), a white band with the stop name large and bold and the municipality smaller
  below it, then one yellow row per line and direction ("133  Frick, Bahnhof"), thin white separators between rows.
  Postgelb for all of it (PostAuto press: "Alle Postautos und Haltestellen erscheinen in Postgelb").

Nothing of the Post's branding is copied: no "PostAuto" wordmark, no posthorn, no cross (A5). The header carries
a plain black bus pictogram drawn procedurally; text uses the game's own font (Barlow Condensed). The game stays
non-commercial and keeps third-party things unbranded.

## Design

### 1. Pure placement module `busstop.js` (node --test)

No DOM, no three.js. Exports:

- `STOP` constants: `poleOut: 0.6` (pole this far beyond the stop point, away from the road), `clear: 0.5` (minimum
  distance of pole and shelter to every standing bus and of the shelter to any road's asphalt edge),
  `poleRoad: 0.2` (the pole's own minimum to an asphalt edge), `push: 0.25`, `maxPush: 2`, `shift: 1`,
  `maxShift: 12`, `shelter: { w: 4, d: 1.8, front: 0.3, back: 2.1 }` (roof from `front` to `back` behind the pole,
  back wall at `back − 0.05`), `zigzag: { len: 16, w: 0.5 }`.
- `rectClearance(px, pz, pose, size)`: signed distance of a point from a rectangle `size = { length, width }`
  centred at `pose = { x, z, th }` along `th`; negative inside.
- `roadEdgeDist(x, z, roads)`: min over road segments of (distance to the segment − `w/2`); negative on asphalt.
- `stopLayout(stop, poses, roads, bus = BUS, cfg = STOP)` →
  `{ x, z, yaw, pole: [x, z], shelter: { x, z, corners } | null, shift, pushed }`:
  - `yaw = stop.rot`: the stop stays parallel to its road (`rot` is the route tangent at the stop,
    `pipeline/world_bus.py:195`). `u = (cos rot, sin rot)` runs along the kerb, `n = (−u.z, u.x)` points away from
    the road (right of travel, the same convention as `rightOf`, `route.js:61`).
  - `poses` are the standing-bus poses of every route that calls at this point (`busPose(route, st.s)`); the two
    routes share one point at Industriezone Rütti and at Stein-Säckingen Bahnhof.
  - Candidates in order: shift along the kerb `0, +1, −1, +2, −2 … ±maxShift` m, and for each shift the push
    `0, 0.25 … maxPush` m further out. Pole = stop + `u · shift` + `n · (poleOut + push)`; shelter centre = pole +
    `n · (front + back) / 2`, its 4 m side along `u`.
  - The first candidate wins where the pole and all four roof corners have `rectClearance ≥ clear` to every pose,
    the corners have `roadEdgeDist ≥ 0` and the pole `roadEdgeDist ≥ poleRoad`. If none does, the last candidate's
    pole is kept and `shelter = null` (sign only).
  - Measured over `world_hochrhein.json` (20 distinct stop points for 22 route stops): 16 take `shift 0, push 0`
    (pole 0.9 m from the bus flank, roof 1.2 m); Frick Bahnhof push 0.25; Stein-Säckingen Bahnhof push 0.5;
    Industriezone Rütti shift −3 m, push 0.5 (roof corner 0.55 m from both buses, 0.03 m off the asphalt);
    Novartis (route 11533940) shift +6 m, push 2 m, which carries it past the 4 m service road it stands in today.
    Every stop keeps its shelter; the node test asserts this over the real data file, so a future world build
    that breaks it fails `node --test`.
- `zigzagLine(route, s, roadW, cfg)` → polyline of `[x, z]` from `s − len/2` to `s + len/2` (clamped to the route),
  at `rightOf(pts, cum, q, roadW/2 − zigzag.w/2)` (`route.js:61`) every 2 m: the yellow line along the kerb.
- `stopFaceDeg` in `postauto.js` stays (tested), but `busStop` no longer uses it.

### 2. Stop graphics (`index.html`)

`busStop(layout, name, line)` draws from a layout, in the `signs` group (the board faces the road: the group's
`rotation.y = −layout.yaw`, the same sign convention as the bus mesh, `index.html:3933`; local +z is `n`, away
from the road, local +x along `u`):

- **Frame and pole** (grey `#9aa0a8`, tube radius 0.04): an inverted U, as on the real sign. The pole leg stands at
  `layout.pole` and runs 0 to 2.9 m; the second leg stands 1.0 m further along the kerb (local −x) and runs 2.15 to
  2.9 m; a top bar joins them at 2.9 m, with a sphere at each top corner for the rounding.
- **Haltestellentafel** hanging inside the U, centre 0.5 m beside the pole (local x −0.5), y 2.5 m: a landscape plane
  0.9 × 0.55 m (canvas 512 × 312 via `makeTex`), horizontal bands top to bottom: (1) a Postgelb `#ffcc00` header band
  (62 px) with a black bus pictogram at the left (procedural canvas: rounded body, window cut-outs, two wheels) and
  the right side plain, no wordmark; (2) a white band with the stop name large and bold in black (Barlow
  Condensed 700, shrunk to fit, two lines for long names like "Stein-Säckingen / Bahnhof"); (3) one Postgelb row
  per line and direction ("133  Frick, Bahnhof": number, then destination, black), 60 px each (at most 3, shrunk to
  fit), thin white separators between rows. The white band takes the height the rows leave. Double-sided; faces the
  road (`yaw`), its long side along the bus.
- **Rows** come from `stopRows` (`busstop.js`): one row per route that calls at the point and does not end there,
  destination = the route's `to` ("Frick, Bahnhof", "Stein-Säckingen, Bahnhof"). So Frick Bahnhof shows one row
  (to Stein-Säckingen), Rütti and the other shared points show what the routes through them show. The municipality is
  not drawn (A10).
- **Fahrplantafel** at 1.6 m: 0.42 × 0.6 m frame (dark `#2b2f36` box 0.03 m deep) with a white sheet carrying a
  yellow header strip and 8 grey text lines (procedural, no real times). Facing the road.
- **Shelter** (only when `layout.shelter`): the existing roof and glass back wall (`index.html:1994` sizes),
  positioned at `layout.shelter`, plus two 0.06 m glass side panes; same materials as today.
- **Zigzag** on the asphalt: `ribbonGeo(zigzagLine(...), zigzag.w / 2, 0.05, 2, true)` with a 64 × 128 canvas
  texture (yellow `#f5c400` zigzag stroke, alpha), `MeshBasicMaterial` transparent, `polygonOffset` like the street
  names (`index.html:2000`); added to `decals`.
- The hand-placed Sisseln stop `busStop(...V(812, 722), 'Breitenacher', 180)` (`index.html:2318`) has no route:
  it gets a layout from a synthetic pose (`{ x, z, th }` from its face angle) with `roads = ROADS` and no zigzag.
  It is 6 m from the asphalt today and stays where it is.

### 3. Build order (`index.html`)

Routes are needed for `busPose`, so `busRoute(br, ROADS, autoGraph())` moves out of `loadPostauto`
(`index.html:3874`) into a synchronous `buildBusStops()` right where the stops are drawn today (`index.html:5538`):
it fills `POSTAUTO.routes`, then draws every stop. `loadPostauto` keeps fetching the timetable and no longer builds
routes. `buildGraph` over the 3673 roads costs 129 ms in node and is cached in `AUTOP.graph` for the autopilot.

### 4. Debug hook

`window.__mm.busStops()` returns `[{ uic, name, route, x, z, yaw, pole, shelter, pushed, rows }]` for the Playwright
test (`rows`: `[{ line, dest }]`, the sign's rows).

## Assumptions

- **A1** [confirmed] The shelter overlapping the carriageway is part of #712. Answer: "Ja, in #712" (the whole stop:
  sign, shelter beside the kerb, no overlap with the bus).
- **A2** [high] Placement is computed at load time in JS from the standing-bus pose, not by changing
  `pipeline/world_bus.py` and regenerating `world_hochrhein.json`. Rejected: moving `KERB` in the pipeline. The
  bends (Rütti, Stein-Säckingen, Frick) overlap because of the bus body's heading, which only `busPose`
  (`postauto.js:96`) knows; a data fix would also need a new world build and the data file is published as is.
- **A3** [high] At a bend the stop slides along the kerb (up to 12 m) to where the bus body is not, and stays
  parallel to its road (`st.rot`). Rejected: turning the shelter to the bus heading and pushing it straight out —
  measured at Industriezone Rütti that walks it 4 m into the next road of the industrial zone (roof corner 1.8 m on
  asphalt) and still fails. Rejected: dropping the shelter at bends (every stop keeps one with the slide).
- **A4** [med] Clearance 0.5 m to the bus and to any asphalt edge, pole 0.6 m beyond the stop point (1.1 m beyond
  the asphalt edge on a straight road). Rejected: raising `PA.kerbGap` so the bus stands further from the kerb —
  that changes the bus, which looks right already.
- **A10** [med] The municipality (Gemeinde) line under the stop name is omitted. The world data has no municipality
  per stop: `stops[]` carry `uic`, `name` ("Frick Bahnhof"), `s`, `x`, `z`, `rot`, and the name has no separate
  place field. Rejected: guessing it from the name or from OSM boundaries (a data build, out of scope).
- **A11** [med] The pole is the clear-checked point. The plate hangs 0.5 m beside it and the second leg 1.0 m
  (along the kerb), at 2.15 m and higher, so at a bend a corner of the plate may reach closer than 0.5 m to the bus
  roof. Not checked in `stopLayout`; the sign is 0.6 m or more beyond the stop point, as far out as the pole.
- **A9** [high] One stop is drawn per distinct point (`uic`, `x`, `z`), checked against the standing poses of every
  route that calls there. Rejected: one per route stop, which draws two poles on the same spot at Rütti and
  Stein-Säckingen today (`index.html:5538` loops both routes).
- **A5** [confirmed] The sign has the real sign's shape and colour but no brand. Answer: "Neutral: gelb + Bus-Piktogramm".
  Postgelb `#ffcc00` landscape plate in an inverted-U steel frame, stop-name band, one row per line and direction,
  timetable frame, yellow zigzag on the road (SSV 6.21), but **no "PostAuto" wordmark, no posthorn, no cross**: a
  simple black procedural bus pictogram in the header instead. Reason: the game keeps third-party things unbranded.
  Rejected: the "PostAuto" wordmark in the game's font.
- **A6** [med] The yellow zigzag is part of the stop (16 m along the kerb, 0.5 m wide). Rejected: sign and shelter
  only — the zigzag is the most recognisable Swiss stop marking and costs one decal per stop.
- **A7** [high] If no candidate within ±12 m along the kerb and 2 m of push is clear, the stop keeps the sign and
  drops the shelter (`shelter: null`). No stop in the current data takes that path; the node test over the data
  file proves it.
- **A8** [high] Routes are built synchronously at world build (129 ms), so the stops do not wait for the timetable
  fetch and still appear when the timetable is missing. Rejected: drawing stops inside `loadPostauto` after the fetch.

## Consequences

- Industriezone Rütti's pole stands 3 m before the bus's stand point and Novartis's (towards Stein) 6 m past it
  and 2 m further from the road; passengers "wait" a few metres from where the door opens. The zigzag stays
  centred on the stand point `s`, so it still frames the bus.
- Houses along OSM roads are placed from `r.w/2 + 2.5` m (`index.html:1470`); a shelter pushed 2 m may stand close
  to a building front at Novartis (industrial zone: flat buildings). Not addressed.
- `AUTOP.graph` is built at world build instead of at the first autopilot use (+129 ms before the first frame).
- `tests/postauto.test.mjs` keeps its `stopFaceDeg` assertion; a new `tests/busstop.test.mjs` reads the real world
  file, so it fails when a future world build places a stop on a bend the layout cannot clear.

## Out of scope

- A collision box for the pole or the shelter (the player drives through them today, as before).
- Changing the bus's stand position or heading at bends (`busPose` chord).
- The municipality line on the sign (A10).
