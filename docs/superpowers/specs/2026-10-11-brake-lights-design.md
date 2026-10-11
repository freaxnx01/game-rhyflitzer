# Brake lights (#230) — design

Depends on #270 (`lampState`, `LIGHTS`, `applyLamps`; the `braking` input and the `LAMP.tail.brake` level are already defined and unit-tested there). Shared light setup: `2026-10-11-car-lights-switch-design.md`.

## Behaviour

- The tail lenses shine brighter red (`LAMP.tail.brake`, 2.4) while the car is braking, then drop back to the rear-light level (lights on) or the idle level (lights off).
- Braking = in `stepCar`, the `brake` input (S / Down / touch ▼ / autopilot) or handbrake while the car moves forward faster than 0.5 m/s, i.e. exactly the `if (brake) { if (vf > 0.5) vf -= D.brake * dt; ...}` branch. Standing still or reversing with S gives no brake light (no reverse lamps in scope). Not while airborne or flying.

## How it combines with #270/#271

Same two tail materials (`carMats.lampTail`, DeLorean `tl`). `lampState` priority is brake > rear light (L) > idle, so a brake pulse is visible with lights on or off. Hazard/blinkers use the separate amber boxes and never touch the tail lenses.

## Assumptions

- **A1** [high] Set `LIGHTS.braking` from `stepCar`, not from raw key state, so autopilot and touch brake count (`brake` variable in `stepCar` already merges them).
- **A2** [high] One brightness level, no fade. Rejected: eased fade; 2-frame flicker is invisible and a pure function is simpler.
- **A3** [med] Handbrake lights the brakes too. Rejected: key-S-only; a drift stop with dark lights looks wrong.

## Needs maintainer

- **[needs maintainer]** Brake light on handbrake. Default: yes.
- **[needs maintainer]** Also light the brakes when coasting to a stop with no key held? Default: no (only deliberate braking).

## Consequences

- `LIGHTS.braking` is written every physics step; `applyLamps` runs per frame, no extra cost.
