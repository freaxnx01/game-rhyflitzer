# Smooth eye height on steps (#592)

## Problem
`walkStep` (`prototype/foot.js:21-40`) snaps `y` to the floor of each tread, so `P.y` jumps by the full rise
(0.16 m on the Plattform spiral, about 8 jumps/s at walking pace). `footCamera` (`prototype/index.html:3780`) puts
the eye at `P.y + WALKER.eye` unsmoothed, so the view judders on every stair (Plattform, 6c, hideout).

## Design
Smooth **only the camera's eye height**; `P.y` and all physics stay exact.

A pure helper in `prototype/foot.js` (no three.js, no DOM):

`easeEye(prev, y, steady, dt, cfg = WALKER, ease = EYE_EASE) -> { y, off }`

- `prev` = `{ y, off }` from the last frame, or `null`. `y` = the walker's physics height this frame.
- The camera eye is `y + off + WALKER.eye`.
- `steady` false (see below) -> result is `{ y, off: 0 }`.
- `dy = y - prev.y`. If `|dy| > WALKER.stepUp` it is not a step (teleport, storey change): `{ y, off: 0 }`.
- If `|dy| >= EYE_EASE.minStep` (a tread snap): `off = prev.off - dy`, so the eye stays where it was this frame.
  Smaller `dy` (slopes, ramps) is already smooth: `off = prev.off`.
- Then decay: `off *= exp(-dt / EYE_EASE.tau)`; clamp `|off| <= stepUp`.
- `EYE_EASE = { tau: 0.05, minStep: 0.05 }` -> about 95 % eased out in 0.15 s, matching the issue's 0.1-0.15 s.

Wiring (`prototype/index.html`): `FOOT.eye = null` in the `FOOT` object; `footCamera(dt)` computes
`steady = !FOOT.hover && FOOT.vy === 0 && !LIFT_RIDE.busy`, `FOOT.eye = easeEye(FOOT.eye, P.y, steady, dt)`, and passes
`P.y + FOOT.eye.off` instead of `P.y` to `footView`. `stepCamera(dt)` passes `dt`. `FOOT.eye = null` in `endFoot()`,
`window.__mm.place`, `window.__mm.setFootY` and wherever on-foot starts.

## No-lag cases
- Teleports (`place`, `setFootY`, exiting the car, start of foot mode): state reset, or `|dy| > stepUp`.
- Lifts: `LIFT_RIDE.busy` is not steady, so the eye follows exactly.
- Jumps, falls, hover: `vy !== 0` / `hover` is not steady, so no offset.
- Stepping down a tread: symmetric (negative `dy`).

## Rejected
- Lerping the camera position in `footCamera`: also lags horizontal motion and teleports.
- Smoothing in `walkStep` / `P.y`: changes physics, risks `test_plattform_stair.py`.

## Acceptance
As in the issue. Unit tests in `prototype/tests/foot.test.mjs` cover the helper; `test_plattform_stair.py` unchanged.
No further Playwright runs needed.
