# Drone chase camera — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #93

## Goal

The issue (split off from #24): „Neuer Kameramodus: Verfolgungsmodus Drohne" — a drone-style chase camera.

Success: **C** cycles through a fifth view, **Drone**, after the bumper view. The camera floats high behind and above the car (18 m back, 12 m up at rest), follows it lazily — it lags behind on acceleration and in bends and catches up again — and hovers with a slight sway, like a camera drone keeping station. It looks down at the car and the road just ahead of it. The car and its shadow are shown. Holding **B** (#65) swings it round in front of the car like the other chase views. Nothing else changes: the HUD, the minimap, the compass, the existing four views, the helicopter camera.

## Starting point (verified 2026-10-03 on `main` @ `ccdcca0`)

- Camera views: `CAM_VIEWS` (`prototype/index.html:1082`): chase, near, cockpit (`eye: true`), bumper (`eye: true`). `camView` is the index; `cycleCamera()` (`:1086`) steps it on **C** with a toast `tr('camera', tr(nameKey))`. **C** only works with the start overlay hidden and not while flying (`keydown`, `:964`).
- `stepCamera(dt)` (`:1089-1094`), once per frame from `loop` (`:1224`). Three branches: `flyCamera` while `FLY.on` (#10, `:1088`: a fixed heli chase cam 35 m back / 22 m up from `HELI.camDist/camH`, lerp rate 3, looking 20 m ahead and 8 m down); the eye views (placed directly); and the chase branch for every view without `eye`:
  - target `P − b·dist` at `P.y + h`, with `dist = vc.dist + speed·0.09`, `h = vc.h + speed·0.03` from `VEH.camera[v.k]` (`:905`: chase `{dist: 9, h: 3.4}`, near `{dist: 6, h: 2.4}`, world metres);
  - the building pull-in: walks `t` from 1 down to 0.35 and tests the point `P − b·dist·t` against the `OBB_GRID` **rectangles** (`o.hw/o.hd` + 0.8 m, `P.y + h·t < o.h`); on a hit `dist *= t − 0.1`, `h += 1.2`. #36 keeps the camera on the rectangles (its A5), so this stays as it is;
  - ground clamp `target.y ≥ groundH + 1.2`;
  - `camPos.lerp(target, 1 − e^(−6·dt))`, or `camPos.copy(target)` when the look-back state changed (`snap`);
  - `camera.lookAt(P + b·6, P.y + 1.2)`.
  - `b = f·s`, where `s = −1` while **B** is held and the overlay is hidden (#65, `CAM.back`, `:1085`).
- `car.visible = !v.eye && !HUD.carHidden && !FLY.on` (`:1091`); `flames.visible` and `blob.visible` also read `CAM_VIEWS[camView].eye` (`:1072`, `:1074`). A view without `eye` is treated as a chase view everywhere.
- The loop clamps `dt` to 0.05 s and skips `stepCamera` entirely while paused (#83, `:1223`).
- Keys in use: `+`/`=`/`-` and the mouse wheel over the minimap are the map zoom (`:964`, `:1182`); Ctrl is the handbrake; B, C, F, G, H, J, K, M, N, Q, R, T, V, Tab, F1, F3, Esc, P taken.
- Pure modules with `node --test`: `heli.js`, `pause.js`, `debug.js`, `landmarks.js`, `world.js`, `strings.js` (`prototype/tests/*.test.mjs`). `heli.test.mjs` pins the agreed constants with a `deepEqual`.
- Browser tests (pytest + Playwright, `prototype/tests/test_*.py`): `test_smoke.py:94` `test_camera_cycles_with_c` presses C four times and expects `[1, 2, 3, 0]` with the four toasts. `test_look_back.py` reaches cockpit/bumper with 2 and 3 presses. `test_vehicles.py:121` pins the cockpit `d`. The car-true-size plan (#69, on `main`) reaches chase/near by press count too.
- Test hook: `window.__mm.cam()` → `{ view, d, back, look }` (`:1054`); `__mm.camView` mirrors the index.
- i18n: UI text through `tr()`; `prototype/strings.js` has `camChase/camNear/camCockpit/camBumper` and `keyCamera` in `en` (`:65-68`, `:93`) and `de` (`:179-182`, `:206`). `strings.test.mjs` enforces equal keys and no `ß`. The F1 help has two static copies of the C line (`index.html:126`, `:192`, both `data-i18n="keyCamera"`).
- Open neighbours: #92 (rear-view mirror, enriched in parallel), #69 (real-size car: chase/near offsets ÷ 1.3), #2 (night), #36 (collision from the drawn footprint).

## Decisions

| Topic | Decision |
|---|---|
| What the drone is | A **fifth chase view**, not a flight mode and not a free camera: the car stays the thing you drive. `CAM_VIEWS` gets `{ nameKey: 'camDrone', k: 'drone', drone: true }`; no `eye`, so car, shadow and nitro flames are shown as in the chase views. |
| Place in the C cycle | **Appended after bumper**: chase · near · cockpit · bumper · drone. The existing indices 0–3 do not move. |
| Height and distance | `VEH.camera.drone = { dist: 18, h: 12 }` (world metres, like chase and near): twice the chase distance, well above every house roof, well below the helicopter (35 / 22). The speed terms stay the chase ones (`+ speed·0.09`, `+ speed·0.03`). |
| Adjustable? | **No.** Fixed values. The wheel and `+`/`-` are the minimap zoom, Ctrl is the handbrake, and no free key is worth a one-view tweak. A playtest tunes the two numbers. |
| Lag | Position lerp rate **2.5** (chase 6, heli 3): the drone falls behind when the car pulls away and swings wide in bends. The **aim point** lags too: the camera looks at a smoothed point (`CAM.aim`, rate 4) that follows `P + b·4` at `P.y + 1`, so the car drifts off-centre and is re-centred, the way a gimbal tracks. |
| Sway | A small deterministic hover: side `0.5·sin(2π·0.33·t)` m along the car's right vector and up `0.3·sin(2π·0.21·t)` m, with `t` the camera's own clock `CAM.t += dt` (frozen while paused, no `rnd()`). Added to the target before the lerp. Chase and near get **no** sway. |
| Building pull-in | The existing rectangle test runs unchanged for the drone (the same branch). At 12 m up it only fires at tall boxes (halls, the LANDI tower, the DSM chimney); then it pulls in and climbs, as the chase cam does. No ring-aware test (#36 A5). |
| Ground | The same clamp, `groundH + 1.2`. |
| Look back (#65) | Works by reuse: `b = f·s` puts the drone in front of the car, high, looking back past it; the `snap` on change applies to position and aim. |
| Helicopter (#10) | Untouched: `FLY.on` takes `flyCamera`, and C is dead while flying. Landing keeps whatever `camView` was. |
| Rear-view mirror (#92) | No mirror in the drone view. #92's spec (`docs/superpowers/specs/2026-10-03-rear-view-mirror-design.md`, on `main`) shows the mirror in the **cockpit view only** (`camView` 2) — appending the drone at index 4 keeps that index, and the drone is a non-`eye` view with no flag of its own. |
| Night (#2), pause (#83) | No change. Night is lighting only. Paused, `stepCamera` is skipped, so position, aim and sway freeze with the scene. |
| Real-size car (#69) | `drone` is **not** divided by 1.3. #69 brings chase/near closer so the car keeps its on-screen size; the drone frames the road around the car, not the car. #69's plan names chase and near explicitly and leaves other rows alone. |
| HUD / look | **No drone frame or overlay.** No view has one today (cockpit and bumper have no dashboard; `#hud` is identical in every view), and the game follows Midtown Madness, which had none. |
| Strings | `camDrone` (`Drone` / `Drohne`); `keyCamera` becomes `camera: chase · near · cockpit · bumper · drone` / `Kamera: Verfolger · nah · Cockpit · Stossstange · Drohne`; both static help copies updated to the new `en` text. |
| Module | New pure `prototype/camera.js`: `DRONE` constants and `droneSway(t)`, unit-tested with `node --test`, like `heli.js`. The view list and `stepCamera` stay in `index.html`. |
| Test hook | `__mm.cam()` unchanged (`view, d, back, look` suffice). |
| Existing tests | `test_camera_cycles_with_c` changes on purpose: five presses, `[1, 2, 3, 4, 0]`, five toasts. Nothing else changes. |

## Implementation sketch

`camera.js`:

```js
export const DRONE = { rate: 2.5, aimRate: 4, aimAhead: 4, aimUp: 1, swaySide: 0.5, swayUp: 0.3, swaySideHz: 0.33, swayUpHz: 0.21 };
export function droneSway(t, cfg = DRONE) { return { side: Math.sin(2 * Math.PI * cfg.swaySideHz * t) * cfg.swaySide, up: Math.sin(2 * Math.PI * cfg.swayUpHz * t) * cfg.swayUp }; }
```

In `stepCamera`'s chase branch, after the ground clamp: `const drone = !!v.drone; if (drone) { CAM.t += dt; const sw = droneSway(CAM.t); target.x -= fz * sw.side; target.z += fx * sw.side; target.y += sw.up; }` then the aim point `aim = (P.x + bx·A, P.y + U, P.z + bz·A)` with `A, U` = `DRONE.aimAhead, DRONE.aimUp` for the drone and `6, 1.2` otherwise; `if (snap || (drone && !CAM.aiming)) CAM.aim.copy(aim); else if (drone) CAM.aim.lerp(aim, 1 − e^(−DRONE.aimRate·dt)); CAM.aiming = drone;` the position lerp uses rate `drone ? DRONE.rate : 6`; `camera.lookAt(drone ? CAM.aim : aim)`. `CAM` becomes `{ back: false, t: 0, aim: new THREE.Vector3(), aiming: false }`. For the four existing views every number is as today.

## Testing

- `prototype/tests/camera.test.mjs`: `DRONE` pinned with `deepEqual`; `droneSway` is bounded by the amplitudes, zero at `t = 0`, periodic, and not constant.
- `prototype/tests/test_drone.py` (hand layout, `open_hand` as in `test_look_back.py`): four C presses reach view 4 with the toast `Camera: Drone`; the camera **arrives** at 18 m back / 12 m up (±1.5, the sway is inside that) and keeps the car visible; after arrival the lateral offset sampled over 20 frames moves by more than 0.05 m and less than 1.2 m (the sway); holding B puts it in front (`AHEAD > 10`) looking back, and releasing it brings it back; the F1 help (de) lists „Drohne".
- `test_smoke.py::test_camera_cycles_with_c` updated to five views.

**Animated camera:** the drone lerps slowly and never stands still (sway), so every check **polls arrival with a tolerance** (`wait_for_function(…, timeout=120000)`), never stillness and never a fixed sleep. Headless draws under 1 fps with `dt` clamped to 0.05 s, so the sway clock advances about 0.05 s per frame; 20 frames are one second of sway.

## Out of scope

- Adjustable height or distance, mouse orbit, a free camera.
- A drone model, rotor sound or HUD frame.
- Changes to the chase, near, cockpit, bumper or helicopter cameras.
- The rear-view mirror (#92) and the real-size car (#69).
