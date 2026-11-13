# Car-selection preview on foot stands on the ground (#903) - Design

## Problem

Get out (Z), hover (F), pause, "Fahrzeug wechseln": the preview car floats in the air.

## Measured cause (GPU browser, hand layout, ROAD = (1810, 610), 2026-11-13)

| moment | walker y (P.y) | ground | parked FOOT.car | car mesh |
|---|---|---|---|---|
| after Z | 16.81 | 16.81 | (1810, 16.80, 610) | (1810, 16.80, 610) |
| after F + 2 s Space | 28.81 | 16.81 | unchanged | unchanged |
| car selection open | 28.81 | 16.81 | unchanged | **(1810, 28.81, 608.00)** |
| after "Drive on" | 28.81 | 16.81 | unchanged | **(1810, 28.81, 608.00)**, stays |

On foot, `P` is the **walker**, not the car (`getOut`, `index.html:5034`). The stage code reads `P` unconditionally:

- `showcaseCar()` (`index.html:5999`) does `car.position.set(P.x, P.y, P.z)`: the mesh jumps to the walker, 12.0 m above the ground (and 2 m beside the parked spot).
- `openCarSel()` (`index.html:6000`) seeds the spin angle from `P.th`; `stepTurntable()` (`index.html:5695`) orbits the camera around `P` and looks at `P.y + 0.8*scale`.
- Nothing puts the mesh back when the selection closes: on foot no step writes `car.position` (only `parkCarAt` during rides and `stepCar` after getting in), so after Drive on / cancel the car keeps floating at the walker's spot while its collider (`parked()`, from `FOOT.car`) stays on the ground.

Even walking (no hover) the preview car jumps to the walker's spot; hover only makes it visible as floating.

## Design

The stage shows the car where the car is: on foot that is the parked pose `FOOT.car`, otherwise `P`.

- New pure helper in `carselect.js`: `stagePose(parked, p)` returns `{ x, y, z, th }` of `parked` when it is set, else of `p`.
- `showcaseCar`, `openCarSel` (spin start angle) and `stepTurntable` (orbit centre, look height, look target) use `stagePose(FOOT.on ? FOOT.car : null, P)`.
- Because the mesh is never moved off the parked pose, closing the selection (Drive on or cancel) leaves it on the ground with no extra code; getting in (`getIn`, `index.html:5041`) then starts the chosen car at `FOOT.car.y` = ground.

Rejected: snapping the mesh to `groundH` under the walker (moves the car away from its collider and parked spot); restoring the mesh on close (fixes the after-state but the preview still floats).

## Acceptance

- Preview after Z+F+hover: car mesh at `FOOT.car` (x, y, z within 0.01), |mesh y - ground| < 0.1.
- After Drive on with another car: mesh still at `FOOT.car`; Z gets in and the car's y is the ground.
- In the car (not on foot) the preview is unchanged (stage at `P`).
- `node --test tests/carselect.test.mjs` green; the new browser test green.

## Out of scope (discovery)

- In the loco (`TRAIN.on`) `P` is synced to the train (`syncTrainP`) while the car stays parked at `TRAIN.car`; a vehicle change from the pause there likely has the same pattern. Not measured; park as its own issue if it reproduces.
