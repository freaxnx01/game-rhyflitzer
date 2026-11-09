# Vehicle depot at the DSM car park (#553) — design

## Intent

Every vehicle of the game stands on a car park next to the DSM bus stop in Sisseln. You drive (or walk) up to one, press
**E**, and drive on in it. It is the in-world counterpart of **Choose car**: you see the whole fleet at once, life-size, and
swap without a menu. The maintainer asked for it on 2026-10-29 and wants it "bald".

## Decisions (maintainer, 2026-11-09)

- **Place:** the OSM car park `118856561` at the DSM bus stop (ring `[[868.5,-92.1],[899.3,-92.1],[899.3,-124.0],[766.0,-122.1],[765.3,-91.7]]`,
  a 134 × 32 m strip running east–west). Probe 2026-11-09: no props, buildings or roads inside it.
- **Boarding:** drive up or walk up, press **E**. E is already the context key on foot (`foot.js:93`, `controls.js:82`); in the car
  E is unbound today (`controls.js` `CAR` list).
- **The old vehicle:** every vehicle has a fixed **home slot**. The slot of the vehicle you are driving stays empty; when you
  board another one, the old vehicle goes back to its own home slot. The depot is always complete and in order. (The first
  choice, "it takes the freed slot", was dropped: a 12 m bus does not fit a Mini's gap.)
- **Paint:** parked vehicles stand in their **factory paint** (the paint `galleryPaint` / Choose car's photo uses). After
  boarding, the player's chosen paint applies exactly as when picking the vehicle in Choose car (`selectVehicle`).

## Goals

1. All vehicles of `VEHICLES` except the one being driven stand in the depot, grouped by type (#493's `VEHICLE_TYPES` order:
   everyday, sport, utility, screen), strongest first inside a type (`galleryOrder`).
2. Within reach, a prompt names the vehicle: "E: get in — Rhy Hyper" / "E: Einsteigen — Rhy Hyper". E swaps.
3. Parked vehicles are solid: the car and the walker collide with them.
4. The depot is findable: a **Fahrzeug-Depot / Vehicle depot** row in the J list (Hochrhein only).
5. de and en texts.

## Non-goals

- No depot in other worlds (Ehrendingen, generated worlds) or in the hand layout.
- No persistence: the depot is rebuilt as on page load after a reload.
- No new vehicles, no change to Choose car, no animated doors or getting-in animation.
- Not the performance work of #550.

## Anti-goals

- Swapping must never leave the player in a state Choose car cannot (half-built car, wrong collider, lost lamps or chair):
  boarding goes through the same `selectVehicle` / `setVehicle` path as Choose car.
- Building parked vehicles must not touch the driven car's state (`car`, `carMats`, `GLTF_LAMPS`, `LOCAL_LAMPS`,
  `car.userData`, `CAR_SIZE`, paint). `buildCar` (`index.html:3141`) writes all of these; a parked mesh needs its own group and
  its own (cloned) materials, or a later `applyPaint` repaints the parked copies.
- No stall when you arrive: models load one after another, as the gallery does (`loadGalleryModels`, `index.html:5341`),
  and a vehicle whose model is not loaded yet shows its fallback (`gltf.fallback`) until it is.

## Layout

A pure function lays the slots out from the vehicle table, so a test can pin it:

- The strip is a rectangle along +x: centre `(832.3, -107.5)`, usable length 130 m, depth 30 m (0.5–1 m inside the ring).
- A vehicle's footprint comes from its `collision` entry (pure data, known before any model loads): width `2r`, length `2r`
  for a circle and `2(hl + r)` for a capsule. A slot is the footprint plus a 1.2 m gap beside it.
- Two rows, each vehicle **nose to the middle of the strip**, its rear 0.5 m inside the edge, so you drive out forwards:
  - **south row** (backs onto the south edge): the long vehicles (footprint length > 7 m: bus, trucks), filled from the
    **east** end;
  - **north row** (backs onto the north edge): every other vehicle, filled from the **west** end.
  - The two rows never overlap in x, so every vehicle has the full 30 m depth in front of it. Measured 2026-11-09: the
    longest footprint is 12.6 m (bus), and a 6 m aisle between two facing rows would leave only 12 m — hence no facing rows.
- Order inside a row: the types in `VEHICLE_TYPES` order, each sorted by `galleryOrder`; vehicles without a known type last.
- Every slot is a home slot `{ id, x, z, th, w, l }` in the same pose convention as `FOOT.car` (`x, z, th`), so `parkedBox`
  (`foot.js:79`) and `carReach` (`foot.js:83`) work on it unchanged.
- 21 vehicles today need about 76 m of row in total. If the rows would overlap in x, or a footprint is longer than the
  depth, the layout throws (fail fast) instead of stacking cars on top of each other.

## Showing the vehicles

- The depot exists once a Hochrhein world is loaded (`L` set and the region is Hochrhein).
- Parked meshes are built when the player first comes within 400 m of the strip's centre, then kept. They are shown
  within 300 m and hidden beyond (no LOD boxes: from 300 m the strip is a few pixels).
- glTF models load sequentially from that moment; a slot shows the fallback model until its glTF is ready, then swaps in place.
- Each parked vehicle adds one solid to `OBB_GRID` via `addSolid` (`index.html:1520`) with its slot's footprint; the driven
  vehicle's slot solid is `off` (the same `off` flag `footSolids` already honours, `index.html:4376`).

## Boarding

- **In the car:** within 4 m of a parked vehicle's box (`carReach`) and slower than 2 m/s, the HUD shows the prompt; E boards.
- **On foot:** within `WALKER.enterReach` (2.5 m) of a parked vehicle's box, the context key shows "get in"; E boards.
  Priority on foot: ride > lift > leave > enter door > **board** — the depot is outdoors, so it only competes with doors.
- Boarding vehicle X:
  1. the old vehicle's slot solid turns on and its mesh shows again (it is "back home");
  2. if on foot, the walk ends (`endFoot`), the car you left behind is gone (it is the old vehicle, now at home);
  3. `selectVehicle(X)` (paint, chair, glTF loading as in Choose car), then the player stands in X's slot pose at speed 0;
  4. X's slot turns `off` and its parked mesh hides;
  5. during a run (`R.state` racing or armed), `R.swapped = true`, exactly like the pause-menu swap (`applyVehicleSwap`,
     `index.html:5275`);
  6. a toast names the new vehicle.
- E in the car does nothing anywhere else (no new behaviour off the depot).

## Findability

- J list: an entry "Fahrzeug-Depot" (de) / "Vehicle depot" (en) at the strip's centre, landing at the west end of the strip, mid-depth, facing east,
  shown only where the depot exists. Gemeinde: Eiken, like the DSM-Kamin (`landmarks.js:24`).
- The key bar shows E with the "get in" label whenever the prompt is up (`barEntries`, `controls.js:62`).

## Test hook

`window.__mm.depot()` → `{ on, slots: [{ id, x, z, th, w, l, shown, solid, model, paint }], near: id | null }` where `model` is
`'gltf' | 'fallback' | null` (not built yet). The tests drive with the existing `sim` / `step` / `jump` hooks.

## Left to the builder

- How the parked mesh is built without touching the driven car (own group via `MODELS[def.model]` with the globals saved and
  restored, or a clone of a stage build with deep-cloned materials) — whichever keeps the anti-goal above.
- The prompt's exact HUD element (reuse the door prompt `HUD.enter` styling).
- The exact landing pose for J.

## Consequences

- The OSM bay lines of lot `118856561` stay drawn under the cars; the cars ignore them (bays are 2.5 m wide, a bus is not).
- Each parked glTF vehicle is another draw-call bundle near Sisseln; #550 should measure the frame rate there.
- Driving into the depot at speed hits 20 solids: a crash there behaves like any other obstacle crash.
