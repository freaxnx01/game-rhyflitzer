# Midtown Madness: traffic control, traffic lights and pedestrians

Research spike for #358, written 2026-10-18. The deliverable is this note; no game code, no
change under `prototype/` or `pipeline/`.

**Why:** before Basel and Zürich get built, we want our own traffic, lights and pedestrians to
start from a design that is known to work in an open-city racer at 1999–2000 hardware budgets,
instead of being invented from scratch.

## Sources and method

| Source | What it gives | What it cannot give |
|---|---|---|
| [AI Madness: Using AI to Bring Open-City Racing to Life](https://www.gamedeveloper.com/programming/ai-madness-using-ai-to-bring-open-city-racing-to-life) — Gamasutra/Game Developer, 24 January 2001, by Angel Studios' AI programmer Joe Adzima (the page byline spells it "Azdima"); covers Midtown Madness 2 (PC) and Midnight Club (PS2) | The architecture and the rules in the author's own words, plus a handful of concrete numbers | It is a prose article: no phase timings for the lights, no densities per road class, no tuning tables |
| [0x1F9F1/Open1560](https://github.com/0x1F9F1/Open1560) (GPL-3.0), `code/midtown/mmai/` — partial re-implementation of **Midtown Madness 1**, build 1560 | The real class and field structure with the original names, which pins down *what state* each object holds | Most AI bodies are still the original machine code (`ARTS_IMPORT`). `aiTrafficLightSet` carries a 24-byte opaque field blob and `aiPedestrian` a 172-byte one, so **phase timing and pedestrian tuning are not readable there** |

Two things to keep straight: the article describes **MM2 / Midnight Club**, Open1560 mirrors
**MM1 build 1560**. Where they disagree (the intersection-control enum, see below) both are
recorded rather than merged.

**Clean room.** Everything below is a description in our own words of concepts and of data-layout
facts. No code, no data and no assets from Midtown Madness or from Open1560 are in this repo, and
nothing is copied from the GPL source. Claims are marked **[A]** (from the article), **[O]**
(from Open1560's declarations), or **[?]** (our inference, to be treated as a guess).

---

## 1. Data model

### The AI map

A city is three kinds of component **[A]**: **roads** (line segments between intersections),
**intersections** (a 2D area where roads meet) and **open areas**, which have no roads at all and
are navigated by **shortcuts** laid over the top for the opponents' benefit. The AI map is a
separate structure from the visible city, produced by the same in-house City Tool that generates
the city itself, then converted by a second tool (GenBAI) into a binary the engine maps straight
into its structures **[A]**.

One global map object owns the whole thing **[O]**: an array of paths, an array of intersections,
and the entity arrays for ambient cars, opponents, police and pedestrians.

### A road ("path")

Everything a road carries, from the declarations **[O]** and the article **[A]**:

- **geometry per vertex**, all lists the same length **[A]**: the centre line, the left and right
  boundaries, and an orientation frame (an x direction, a z direction and a normal) per vertex. At
  least four vertices per road **[A]**. Plus lane vertices, sub-section directions and
  cumulative offsets **[O]**.
- **lanes**: up to **four** lanes per road — per-lane vehicle counts and a per-lane head pointer
  into the vehicle list, five lane widths and ten lane lengths **[O]**. Lanes are explicit vertex
  lists, not an offset computed at runtime **[A]**.
- **sidewalks**: a sidewalk definition per road, with a count of them **[O]**; the pedestrians
  walk an offset from the sidewalk centre **[A]**.
- **a pointer to the oncoming road** — the same stretch of tarmac in the other direction is its
  own path object **[O]**.
- **the two intersections it runs between**, named *source* and *sink* **[O]**, so a road is
  directed.
- **`RoadLength` and `SpeedLimit`** **[O]**; the speed limit is per road and overridable per race
  **[A]**.
- **flags**: blocked, always-blocked, ped-blocked, divided, **flat**, alley, has-bridge **[O]**.
  "Flat" is a performance flag: a car on a flat road skips the ground probing (see §2).
- **the traffic control for this approach**, plus the light that governs it: an intersection type,
  a stop-light index, a 32-character stop-light name and **two** stop-light positions **[O]**;
  separate always-go / always-stop overrides exist as both methods and flags **[O]**.

### Intersections

An intersection holds its incoming (*sink*) and outgoing (*source*) path arrays **separately**, a
list of path ids, **one float direction per path**, its own id, its position, and a pointer to one
traffic-light set **[O]**. It can build a "road map" of itself at init **[O]**, and the article
names what that is for: the connected roads are **sorted clockwise** at initialisation, which
turns turn selection into index arithmetic — from the current road's index, **+1 is the road to
the left, +2 straight on, −1 to the right** **[A]**. The intersection object also does obstacle
management and stop-sign control **[A]**.

**Traffic control per approach.** The article lists four types **[A]**: `NoStop` (go through
immediately), `AllwaysStop` (never approved — a dead end for traffic), `TrafficLight` (approved
while this direction is green) and `StopSign` (the vehicle that has waited longest is approved).
MM1's enum is slightly different **[O]**: stop, traffic light, yield — *marked unused* — and
continue. So the "longest wait wins" queue discipline lives behind the `stop` type, and
give-way was declared but never used.

### Traffic lights and phases

- One **traffic-light set** per intersection, constructed with its intersection and run as a
  scene node with its own `Update` and `Reset` **[O]**.
- The visible lights are **scenery instances** — a non-colliding prop class whose init takes a
  name, **two positions** and a part name **[O]**, which matches the two stop-light positions on
  each approach. So an approach's red/green is read off the path, and the mast is just a prop that
  draws the matching state.
- The set's own fields are an opaque blob **[O]**: **the phase program is not recoverable from
  Open1560** — no green/amber/red durations, no all-red clearance, no indication of how a 3-arm or
  5-arm junction is staged.
- The vehicle manager holds a **static signal clock** alongside a static float clock **[O]**.
  A single global counter driving every light set, with each set offset against it, is the obvious
  reading — but it is **[?]**, not established.
- Debug-wise the whole city's lights can be forced **all green** or **all red** from the dev
  widget bank **[O]**. Cheap, and worth copying.

### Ambient vehicles

An ambient car is a spline-driven vehicle **[O]** carrying:

- a **rail state** object: current path and next path, current/next/target lane, distance along the
  road, sub-section index and distance, turn distance, resume distance, front/back bumper and left/
  right side distances, an enter-intersection flag, a wait counter, a rail type, a target velocity,
  an acceleration factor, an **amount by which it exceeds the limit**, a car-reaction distance, a
  separation distance, an intersection-reaction distance and a lane-randomness value **[O]**;
- **per-lane next and previous pointers (four of each)** **[O]** — the article describes keeping
  only a pointer to the next car ahead in the same lane as the compromise that makes collision
  checks cheap **[A]**; the declarations show it is actually a doubly linked list per lane, and
  that during a lane change a car is linked into **two** lanes at once so it sees both **[A]**;
- **reaction tick counters** (current and total) **[O]** — a modelled reaction delay the article
  never mentions, resettable per road;
- a state and a previous state, a current speed, and a tries counter **[O]** (the article: a car
  that keeps crashing while regaining its rail gives up after a bounded number of tries **[A]**).

### Pedestrians

A pedestrian is a plain object (not a physics entity) attached to a road's ped list **[O]**, with
its own update, its voice audio, and a private method set that spells out the behaviour: wander,
pick the next road segment, solve the target point, solve the road segment, solve position,
compute a curve; then detect/avoid for each threat class — player collision, player forward
collision, player anticipation, other pedestrians, props, obstacles — plus a time-to-collision
helper and separate voice banks for roaming and for racing **[O]**. All of its *fields* are hidden
**[O]**, so no distances or durations come from there.

The article adds the state machine **[A]**: **Wander → PreCrossStreet → WaitToCrossStreet →
CrossStreet**. MM1's method list shows `Wander` only; whether build 1560 had the crossing states
at all is open.

### Goals

Behaviour is a set of small **goal** objects, each with the same four-method shape **[O]**:
`Init`, `Reset`, `Context` ("does this goal apply right now"), `Priority` ("does it win over the
others") and `Update` (act). The set **[O]**: random drive, stop, avoid player, backup, regain
rail, collision, follow waypoints, chase. Separately, a small **stuck detector** holds a state, an
impacted flag, a time threshold, a position threshold, a movement threshold (both also cached
squared) and a rotation amount **[O]**; the article's cure is to shift into reverse, realign with
the road target and resume **[A]**.

The one goal that is fully re-implemented is **stop** **[O]**: it zeroes steering and throttle,
applies full brakes, and additionally bleeds about 5 % off the car's linear momentum per update —
i.e. a stopped ambient is held in place by a cheat, not by the physics alone.

### Race-level data

Two files per race **[A]**: a **city** file with the defaults for the whole map and a **race** file
with overrides. The race data object holds a density, a speed limit, a list of exceptions, and the
police and opponent lists **[O]**; an opponent entry is a model, a path file and a maximum
throttle, a cop entry a model, a position, a rotation, a type and behaviour flags **[O]**. The
designer could therefore re-tune traffic density and speed limits per event without touching the
city **[A]**.

---

## 2. Per-frame flow

### Who updates what

One AI map node is the single entry point per frame **[O]**. Within it:

1. **Light sets** run as scene nodes with their own update **[O]**, so the phase state for the
   frame is settled before anyone asks whether they may enter.
2. **Roads update their own occupants**: a road has an `UpdateAmbients` and an
   `UpdatePedestrians` **[O]**. The map keeps two separate lists of *active* roads, one for
   ambients and one for pedestrians **[O]**. So the iteration is per road, not over one global
   entity array — which is what makes the "next car ahead in my lane" rule consistent: cars are
   walked in lane order along their own road.
3. **Each entity class is its own pass**, timed separately: the stat counters are per category —
   total, pedestrians, ambients, opponents, police — next to counts of pedestrians, ambients and
   **active roads** **[O]**. They budgeted AI time per class and watched the road count.
4. The map keeps an **update group and an update count** **[O]** — round-robin amortisation of
   expensive work across frames is the natural reading **[?]**.
5. While the game is paused the AI's paused-update does nothing **[O]**: the city freezes.

### Populating and depopulating (the bubble)

Simulating a whole city is impossible, so a **bubble** is defined per cull room: the list of road
components visible from that room, precomputed offline **[A]**. On entering a new room, the old
and new vertex lists are diffed into new / obsolete / unchanged roads; cars on obsolete roads go
back into a pool, and new roads are filled to a **density = total vehicle length ÷ total road
length**, defaulting per road type and overridable per race **[A]**.

At the bubble's edge **[A]**: on a two-way road the car is teleported to the start of the opposite
direction; at the end of a one-way road it returns to the pool. Pedestrians have their own, much
smaller bubble, are handed out **one per road, round robin**, until the pool is empty, start with a
random distance along the road and a random side, and simply turn around at the bubble edge **[A]**.

### How an ambient car drives

- **Position comes from a spline, not from physics.** A Hermite curve between consecutive lane
  vertices positions and orients the car; crossing to the next sub-segment computes a new curve
  **[A]**. Splines are also used for lane changes and for recovery routes back onto the rail **[A]**.
- **Speed**: the road's speed limit plus a per-car random offset that can be positive or negative
  **[A]** (stored as the "exceeds limit" amount **[O]**). Accelerate at a random 5–8 m/s²;
  decelerate at whatever rate reaches the target speed in one second, from
  `(v² − v₀²) / 2(x − x₀)` **[A]**.
- **Car ahead**: only the next car in the same lane is tested. Too close → match its speed; far
  enough again → resume **[A]**. The admitted cost is multi-car pile-ups, which they papered over
  by holding cars at the intersections *before* a crash scene **[A]**.
- **Lane changes** on long enough roads, to balance occupancy; triggered typically at 25 % of the
  road length, executed as a spline; afterwards the car re-picks which road it will turn onto,
  because its new lane may not allow the old choice **[A]**.
- **Orientation over uneven ground**: three downward probes at the front-left, front-right and
  rear-left corners, from which the orientation frame is computed. Two shortcuts: a road marked
  flat uses the rail's y values instead, and distant cars use the rail's orientation vectors
  outright, accepting small pops **[A]**. The spline vehicle has a y-only
  position-and-orientation solve alongside the full one **[O]**, which is exactly that shortcut.
- **Picking the next road** is by lane **[A]**, and the lane→turn mapping is one of the few pieces
  of logic Open1560 actually re-implements **[O]**: one lane → random outgoing road; two lanes →
  lane 0 goes left or straight, lane 1 right or straight; three lanes → left / straight / right by
  lane; four lanes → freeway variants. On a one-way road the choice is random; merging onto a
  freeway always goes right; **U-turns never**, because the spline through one looks wrong **[A]**.

### Crossing an intersection: four approvals

A car at the end of a road needs **all four** **[A]**:

1. **Traffic control** for its own approach — the type above decides (immediately, never, on
   green, or longest-wait-first).
2. **The accident manager** — no accident in the intersection or on the road beyond it.
3. **Capacity** — the road beyond must fit the car's whole length with nothing left sticking into
   the intersection. (The declarations have exactly this: a road-capacity query taking the vehicle
   and a lane, and a count of vehicles past a given distance **[O]**.)
4. **No one else crossing right now** — needed because the stop-sign queue can approve a car while
   cars already waved through by a light are still clearing.

Gate 4 is the interesting one: it is what stops a formally-correct right-of-way model from
deadlocking or T-boning itself.

### Collisions and the two physics modes

An ambient runs on **partial** physics while on its rail and switches to **full** physics on
impact with the player, a dynamic object or a static one **[A]**. A vehicle manager owns that
transition; a collision manager owns the impact itself; once the car comes to rest the manager puts
it back on partial physics, it plots a spline back to the rail and — notably — **runs that recovery
with obstacle detection off**, colliding with whatever is in the way; a fresh collision sends it
back round the loop for a bounded number of tries, after which it is abandoned where it lies until
repopulation reclaims it **[A]**. The fully-simulated slots are a fixed pool: **32** vehicle types
and **32** active vehicles **[O]**, each active one a physics entity with four cheap wheels, damage
and particle effects **[O]**.

An **obstacle-avoidance grid** bounds collision queries: buckets are delimited by the road
vertices, cars move between buckets as they drive, and an intersection is a bucket of its own
**[A]**.

### How pedestrians behave

- **Wandering**: a 2D spline along the sidewalk (y comes from probing the polygon underfoot), with
  the target point taken **3 m ahead** on the path; each frame the ped turns a little toward the
  target and moves forward and sideways at the animation's own rate; a new spline is computed at
  each sidewalk vertex **[A]**. Animations are skeleton-based, authored at 30 fps, with all
  translation stripped out and re-applied from a per-animation table **[A]**.
- **Crossing**: at the end of a street, follow the sidewalk on or cross — and if crossing, decide
  *which* street. Hence the four states **[A]**.
- **Threat from the player**: the side distance is the dot product of the car's forward vector with
  (ped − car); under half the car's width means a hit is coming. Then time-to-collision picks a
  zone: in the **far** zone the ped turns to face the car and either shakes or runs; in the **near**
  zone it probes **10 m** perpendicular to the sidewalk for a wall, runs to it and flattens itself
  against it, or — no wall — dives left or right at the last moment, opposite the car's rotational
  momentum, with a superhuman speed boost when the car is very fast **[A]**.
- **Other pedestrians and props**: only peds in the same obstacle-grid cell are tested, by
  comparing offsets from the sidewalk centre line ± the ped radius. On an imminent overlap the
  lower-id ped stops and the other steers aside, preferring left while that stays inside the
  sidewalk, else right, else turning around **[A]**.
- **Design decision worth noting**: the player **cannot** run pedestrians over, and gets no points
  for trying **[A]**.

---

## 3. Mapping to Rhyflitzer

### What we already have

| MM concept | Rhyflitzer today |
|---|---|
| AI map road graph | `prototype/route.js` — `buildGraph` over the world file's roads, shared-vertex nodes, `joinTouchingEnds` for T-junctions without a shared node, largest component only, A\*, `CLASS_KMH` per OSM class, `isRoundabout` |
| Road geometry | `roads[]` in the MMW1 world file: centre line `pts`, a width `w`, class `cls`, marking `mark`, bridge + layer (`docs/11-pipeline-osm.md`) |
| Intersections | `junctions[[x, z, r]]` — position and a radius, and **nothing else** |
| Fixed-step simulation | already the house pattern (accumulator + `requestAnimationFrame`, pause on `visibilitychange`) |
| Instanced props | `world_props.py` exports seven kinds, the prototype draws one `InstancedMesh` per kind |
| Dev toggles | `prototype/debug.js` and the F3 row |
| The route code is shared | `pipeline/route_matrix.mjs` imports `prototype/route.js` unchanged, so the pipeline and the game agree on "drivable" |

The important consequence: **we should not build a second road graph.** `route.js` is the aiMap
equivalent and it is already the one both sides trust. Traffic wants lanes hung off that graph,
not a parallel structure.

### What OSM gives us for Basel and Zürich

Derivable, in rough order of reliability in Swiss cities:

- **`highway=traffic_signals` nodes** — which junctions are signalled. `pipeline/osm_read.py:28`
  **already keeps these** as named nodes (they were added for anchors), and the world file never
  exports them. Cheapest possible start.
- **`oneway=yes`** — currently **not read anywhere** in the pipeline. Required before lanes mean
  anything: a two-way residential street and a one-way city street are the same object to us today.
- **`lanes`, `lanes:forward`, `lanes:backward`** — `pipeline/world_roads.py:63` reads `lanes` only
  to decide a centre marking and then throws it away.
- **`maxspeed`** — a real speed limit per road, replacing `CLASS_KMH`'s per-class guess.
- **`turn:lanes`** — which movements a lane permits; well mapped on big Swiss junctions, patchy
  elsewhere. The clockwise-index trick is the fallback where it is missing.
- **`junction=roundabout`** — `route.js` currently *infers* roundabouts geometrically (a closed
  routable ring 15–45 m across); the tag is more reliable and would also catch the big ones.
- **`highway=crossing`** with `crossing=traffic_signals` / `marked` / `unmarked`, and
  `crossing:markings` — where pedestrians cross and whether a signal governs it.
- **Sidewalks**, two ways round: separate `footway=sidewalk` ways (common in Zürich and Basel
  centre) or a `sidewalk=left|right|both` tag on the carriageway (common everywhere else). Both
  need handling; neither is complete.
- **`highway=give_way` / `highway=stop`** — the non-signalled control types. Swiss practice tends
  to signs and right-of-way rules rather than 4-way stops, so our `stop`-equivalent will be rarer
  than MM's Chicago.
- **`traffic_signals:direction`** — which approach a signal node governs, when mapped.

What we would have to **generate**:

- **Lane geometry.** OSM has one centre line; MM had explicit per-lane vertex lists. We would
  offset the centre line per lane in the pipeline (we already offset for cycle-lane markings and
  for parking bays, so the machinery exists) and export the lane rails, because computing them in
  the browser per frame is the thing MM deliberately avoided.
- **Sorted approaches per junction.** The clockwise sort is the single most valuable derived
  structure, and it is cheap: per junction, take the heading of each incident road end, sort, done.
  It also needs the directed source/sink split, which `junctions[]` has no notion of.
- **Phase programs.** OSM carries **no** signal timing at all — not phases, not stages, not
  offsets, not which approaches are paired. Swiss signal programs are municipal data, not in OSM.
  Every phase we show is invented by us, so make it a tunable table, not a constant.
- **Stop-line positions.** Derivable from the junction radius plus the approach heading; not mapped.
- **Sidewalk continuity.** Sidewalk ways in OSM are fragmentary at junctions; a ped-walkable graph
  has to be stitched (and, where only a `sidewalk=*` tag exists, synthesised as an offset from the
  carriageway).
- **Light masts.** Positions and models; an eighth prop kind, except that unlike the current seven
  it needs a heading *and* a link to the approach it governs.
- **Oncoming-road pairing.** MM had a pointer from each directed road to its opposite. For us that
  is one derived field per road piece.

Two Basel/Zürich specifics neither source covers:

- **Trams.** Both cities run trams in the carriageway with their own signals; `world_rail.py:31`
  keeps `railway=rail` only, so tram track in the street is currently invisible to us, and a tram
  sharing a signalled junction is a traffic-control case MM never had.
- **Scale.** The frame limit today is 1–4 km per side (`pipeline/frame.py`), i.e. a slice of either
  city, not the whole thing. That is good news for the bubble: a radius around the car is probably
  enough and we may not need MM's precomputed per-cull-room road lists at all.

### Design transfers worth taking as-is

1. **Cars on rails, physics only on impact.** Two modes with a fixed pool of fully-simulated slots
   (MM: 32). Our car physics already exists in `prototype/vehicle.js` / `impact.js`.
2. **One "next car ahead in my lane" link**, not an all-pairs check.
3. **The four approval gates** — especially gate 4, which is the one that is not obvious.
4. **Approval-based control, not simulated driver intent.** A car asks the intersection for
   permission; the intersection owns the answer. It makes a red light a property of the approach,
   so a signal with no phase data still behaves.
5. **Force-all-green / force-all-red debug switches**, in the F3 row.
6. **Per-road flat flag** to skip ground probing — we already know per road whether it is a bridge
   and we have the terrain patch machinery; a flat flag is the same kind of cheap win.
7. **Density as length-over-length**, defaulting per road class, overridable per region.

### One thing to be careful about

Adding fields to a generated world changes `region.PIPELINE_VERSION`, and the world id is a hash
over the frame **and** that version (`docs/11-pipeline-osm.md`) — so every existing
`?world=<id>` link changes. Any pipeline export for traffic should be bundled into **one** version
bump, not three.

---

## 4. Proposed follow-up issues

Three, in this order. The order is deliberate: lights first, because they are the smallest piece
that forces the junction data model to exist, and they are independently playable (the player
stops at a red in an otherwise empty town).

**1. `feat(pipeline): junction approaches, lanes and signals in the world file`**
Export what any of the rest needs: `oneway`, `lanes` (and forward/backward), `maxspeed`,
`junction=roundabout`, per-junction **sorted approach list** with directed source/sink roads, the
`highway=traffic_signals` / `give_way` / `stop` nodes attached to their junction and approach, and
the per-lane rails. First task in it: **measure the tag coverage on a real Basel and Zürich
extract** (Geofabrik + osmium, per `docs/11`, not the public Overpass API) — the numbers below are
exactly what this spike could not get, see §5. Ends with a debug overlay in the prototype (draw
lanes, approach order, control type) and no gameplay change. One `PIPELINE_VERSION` bump.

**2. `feat(traffic): traffic lights at signalled junctions`**
A light-set object per signalled junction, a global phase clock with a per-junction offset, a
tunable phase table (we invent the timings — see §3), red/green per approach, stop lines, mast
props, and force-all-green/red in the F3 row. Playable alone.

**3. `feat(traffic): ambient traffic on the lane rails`**
Kinematic cars on the exported lane rails: per-car speed offset around the limit, the single
next-car-ahead link, the four approval gates against issue 2's lights, lane-based turn selection
with the clockwise-index fallback, a population radius around the player, and the switch to full
physics on impact with a capped slot pool.

**4. (deferred) `feat(peds): pedestrians on the sidewalks`**
Explicitly *after* the three above, because the sidewalk graph is the weakest OSM input and the
behaviour (threat zones, wall-hug, dive) is the part the sources document least. It also needs a
product decision the sources make for us: in MM the player cannot hit a pedestrian at all. For a
Swiss village game that question should go to the maintainer before any code.

---

## 5. Open questions

### Only a look at the binary could answer

1. **The traffic-light phase program.** Green / amber / red durations, all-red clearance time,
   whether one global clock drives every set with per-intersection offsets or each set runs its own
   state, how opposing approaches are paired, and how a 3-arm or 5-arm junction is staged.
   (`aiTrafficLightSet`'s fields are a 24-byte blob; the article is silent.)
2. **Whether MM models amber at all**, and whether MM2's London lights differ from Chicago's.
3. **Default ambient densities per road class**, and the distribution of the per-car
   over/under-the-limit offset.
4. **The reaction-tick model**: how many ticks, what sets and resets them. The field exists; the
   article never mentions reaction delay.
5. **Default distances**: car-reaction, separation, intersection-reaction, turn and resume
   distances.
6. **The stuck detector's thresholds** (time, position, movement, rotation amount).
7. **Pedestrian tuning**: the far/near threat-zone boundaries, the dive-speed boost multiplier, how
   long a ped waits before crossing, and whether MM1 build 1560 had the crossing states at all.
8. **How a left turn across oncoming traffic is gated.** A private "any vehicles coming this way"
   check exists in the random-drive goal, but its body is machine code.

### Our judgement on the Ghidra question

**None of the above justifies a disassembly pass**, and the #358 rules already put it out of scope
for this issue. Every open item is a *tuning constant*, and every one of them would have to be
re-tuned for a Swiss small town anyway (30 km/h zones, roundabouts instead of 4-way stops, tram
signals, far lower densities). The *architecture* — which is the part worth copying — is fully
described by the article and pinned down by Open1560's structure.

Legally the limit points the same way: Swiss URG Art. 21 permits decompilation only to obtain
interoperability information. "Learn how their lights were timed" is not interoperability, so the
exception would not cover it even on the maintainer's own MM1 copy.

### Open for us, answerable without any binary

- Coverage of `lanes`, `oneway`, `turn:lanes`, `sidewalk`, `crossing` and `traffic_signals` in
  Basel and Zürich. **This spike could not measure it:** Overpass was unreachable from the CI
  runner (406/500/timeouts across four instances), and the repo holds no city extract. It is task 1
  of follow-up issue 1 and should be measured the house way, on a Geofabrik extract with osmium.
- How many cars we can afford. MM's budget was a 1999 CPU and a fixed 32-slot physics pool; ours is
  a browser with instanced meshes and Rapier, which is a different shape of limit entirely.
- Whether the simulation needs to be deterministic. It does if traffic ever shows up in a P2P or
  replay context; it does not for single-player free driving. Cheaper to decide now than later.
