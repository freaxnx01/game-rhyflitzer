# Smooth walking, turning and camera on foot (#895)

## Goal

A recorded walk (`§`, #749) looks jerky: the arrow keys turn at the full `WALKER.turnRate` the instant they go down and stop
dead (`foot.js:23`), walking starts and stops without any ramp, and the eye is rigidly bolted to the body, mouse look included
(`footCamera`, `index.html:5032`; `footLook`, `foot.js:69`). Maintainer decision: **always smooth**, play and recording alike,
no switch.

## Design

All in `foot.js` as pure functions (no DOM, no three.js), wired in `index.html` with a few lines.

### Frame-rate independent easing

```js
export const smoothK = (dt, tau) => (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
// v eases from v0 to target; avg is the exact mean value over dt (so a distance integrates exactly, whatever the dt split)
export function easeTo(v0, target, dt, tau) {
  if (!(tau > 0) || !(dt > 0)) return { v: target, avg: target };
  const k = smoothK(dt, tau);
  return { v: v0 + (target - v0) * k, avg: target + (v0 - target) * (k * tau / dt) };
}
```

Constants added to `WALKER`: `walkTau: 0.10` (95 % of the speed after 0.3 s, both ways: start and brake), `turnTau: 0.12`
(keys turn: angular velocity ramps to `turnRate`).

### `stepFoot`

The state `s` gains three optional smoothed values (missing = 0, so old callers and tests still work): `lf`, `ls` (speed along
and across the heading, m/s) and `tw` (turn rate, rad/s). Per step:

- turn: `tw` eases to `input.turn * turnRate`; `th += tw.avg * dt`
- move: the normalised target `(fwd, side) * speed` (speed = walk/hover, times nitro) is eased per local axis, then rotated by the new `th` with the averaged values; `vx`/`vz` in the result are the averaged world velocity
- the result carries `lf`, `ls`, `tw`; height, jump, hover climb, gravity stay exactly as they are (vertical motion is **not** smoothed)

Smoothing the local-frame velocity (not the world velocity) keeps a turn while walking on a clean arc instead of a slide.
The touch stick feeds the same axes and is eased too.

### Camera

New pure `easeLook(view, th, pitch, dt, ease = LOOK_EASE)` with `LOOK_EASE = { tau: 0.04, snap: 1.2 }`: the view yaw/pitch follow the
body's by `smoothK`, yaw by the shortest angle; `view == null` or a gap over `snap` rad snaps (teleport, enter foot).
`footCamera` keeps `FOOT.view`, feeds it to `footView` instead of `P.th`/`FOOT.pitch`. Movement keeps using the body's undamped
`P.th`, so aiming and walking stay exact; only the picture trails by about 40 ms.

### Wiring (`index.html`)

- `stepOnFoot` (5016): pass `lf, ls, tw` from `FOOT.mv` into `stepFoot`, store them back from the result
- `FOOT.mv = null` reset wherever the walker is set down or stops dead: `endFoot`, `window.__mm.place`, `setFootY`, `platHopGo`, `leaveBuilding`, the `LIFT_RIDE.busy` early return and the wheel ride (`P.vx = P.vz = 0` sites)
- `FOOT.view = null` at the same sites (next camera frame snaps)
- debug hook `__mm.footLook` also sets `FOOT.view = null` so screenshot scripts (`scripts/shots.py:263`) see the pitch at once

## Tests (node, `tests/foot.test.mjs`)

New: `easeTo` exactness (distance identical for 60 x 1/60 and 30 x 1/30 and 1 x 1), reaching 95 % after 3 tau, no overshoot;
`stepFoot` walking ramps (speed at 0.05 s below walk, at 0.5 s within 1 % of walk), stops within ~0.3 s after input release and
does not move afterwards; turn ramps and the same total heading for dt 1/60 vs 1/30 (tolerance 1e-3); `easeLook` follows, wraps,
snaps; hover/nitro targets ramp too.

Changed (the spec changes the behaviour they pinned, none is weakened, each keeps its number):

- `WalkForward_MovesAtWalkSpeedAlongHeading`, `ForwardPlusSidestep_IsNotFaster`, `WalkWithNitro_IsTwiceAsFast`, `HoverWithNitro...`, `Hover...fast.x`: pinned instant full speed from rest. They now run a 1 s lead-in and measure the settled speed / the following distance; the assertions (4.5 m/s, 2x with nitro, hypot not faster) stay.
- `TurnKeys_ChangeHeading`: pinned `th == turnRate` after 1 s. Now: after a lead-in the settled rate equals `turnRate`, and the lost angle after 1 s equals the analytic `turnRate * turnTau * (1 - e^(-1/turnTau))`.
- `walkways.test.mjs` ramp walk (`s.x > 6.5` in 1.5 s): loses about 0.45 m at the start; the check stays, the walk gets 0.2 s more.
- Browser tests walking by distance (`tests/test_on_foot.py`: back/forth 59-62, hover into the wall 96-104, nitro 164-166; `test_depot.py:154`; `test_plattform_car.py:57`; `test_plattform_stair.py:115,131`; `test_enter_6c.py` timed walks): each loses up to `walk * walkTau` (0.45 m, hover 1.1 m) per start. Raise the hold time by `walkTau` where an assertion is a distance; do not loosen thresholds. These are only to be run when the change touches them (targeted browser tests), nobody runs the full suite.

## Assumptions

- **A1** [high] Smoothing lives in pure `foot.js`, state carried by the caller (`FOOT.mv`), like `easeEye` (`foot.js:79`). Rejected: a stateful class; `stepFoot` is called with a fresh object each frame (`index.html:5020`).
- **A2** [med] Vertical motion (jump, hover climb/sink) stays instant; the issue lists walking, turning and camera only, and the hover/jump tests pin exact heights (`tests/foot.test.mjs:67`).
- **A3** [med] The touch stick is eased with the same constants (it shares the axes, `foot.js:13-20`); analog input is already smoother, the extra 0.1 s is hardly felt.
- **A4** [low] Tuning values `walkTau 0.10`, `turnTau 0.12`, `LOOK_EASE.tau 0.04`: chosen from the issue's "about 0.3 s" and "no felt lag", not playtested. Constants, one line each to retune.
- **A5** [low] Start and brake use the same tau. Rejected: a faster brake; a brisker stop might feel crisper but doubles the knobs.
- **A6** [med] Movement uses the undamped body heading, only the picture is damped. Rejected: damping `P.th` itself, which would make mouse aim lag behind the crosshair-based beam/E interactions.

## Consequences

- Short glide (~0.1 s) after releasing a key, also against a wall: collision pushes the position, the eased speed decays on its own.
- Timed browser tests and screenshot scripts that walk a fixed time cover about 0.45 m less per start (see Tests).
- Recorded footage of the walk gets the same smoothing as play, by decision; no new setting.
- Camera yaw trails the mouse by about 40 ms; a fast flick finishes its picture one to three frames later.
