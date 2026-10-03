# B to look back — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #65

## Goal

The issue: "B: zurückschauen". B is a free key. The issue leaves one point open: hold B or toggle it.

Success: while the player **holds B**, the camera looks backwards in every camera view. Releasing B returns to the normal view at once. In the chase views, the camera moves in front of the car and looks back past it, so the car is in the picture and the road behind it is visible. In the cockpit and bumper views, the camera looks out of the rear of the car. The F1 help lists B in English and German. The minimap, the compass and the rest of the HUD do not change.

## Starting point (verified 2026-10-03 on `main` @ `a898a46`)

- Camera views: `CAM_VIEWS` (`prototype/index.html:988`): chase, near, cockpit (`eye: true`), bumper (`eye: true`). `cycleCamera()` (`:991`) steps `camView` on **C** and shows a toast `tr('camera', …)`.
- `stepCamera(dt)` (`:992-996`) runs once per frame from `loop` (`:1104`). With `fx, fz` = the car's forward vector:
  - Eye views: the camera sits at `vehEye(k)` (car-model metres × `VEH.scale`; x forward, y up, side + = right) and looks 40 m ahead. It is placed directly every frame (no smoothing).
  - Chase views: the target is `P − f·dist` at height `h` (from `VEH.camera[k]`, plus a speed term). A building test (`OBB_GRID`) pulls the camera in when a wall is in the way. `camPos.lerp(target, 1 − e^(−6·dt))` smooths the move, and the camera looks at `P + f·6`.
  - `car.visible = !v.eye && !HUD.carHidden`: the car is hidden in the eye views.
- Per-vehicle offsets: `VEHICLES.compact.camera` (`:834`): chase `{dist: 9, h: 3.4}`, near `{dist: 6, h: 2.4}`, cockpit eye `[-0.25, 1.22, -0.38]`, bumper eye `[2.35, 0.55, 0]`.
- Keys: the `keydown` listener (`:889`) writes `keys[e.code] = true` for every key (it skips `e.repeat`). `keyup` clears the key, and `blur` clears all keys. `openJump()` (`:1019`) clears all keys too. Held keys are read where they are needed: **N** nitro and **Space** gas in `stepCar` (`:966`), **Tab** ×3 speed in `loop` (`:1104`). C, T, V, G, Q, E and K are one-shot toggles in the listener. `KeyB` appears nowhere in `prototype/` yet. (`touch.b` is the brake *touch button*, not the key.)
- **C** only works while the start overlay is hidden (`$('overlay').hidden`, `:889`).
- Minimap: always north-up (`<b>N ↑</b>`, `:152`), centred on `P.x/P.z` (`mapView`, `:1058`). Compass: `bearing()` from `P.th` (`:1072`). Neither reads the camera.
- Test hook: `window.__mm.cam()` → `{ view, d }`, where `d` is the camera position minus the car position (`:960`). `test_table_cockpit_eye_is_used` (`prototype/tests/test_vehicles.py:121`) pins the cockpit `d` at START heading π: `[0.325, 1.586, 0.494]`.
- F1 help: `#help` lines with `data-i18n` keys (`:110-129`). Strings live in `prototype/strings.js` (`en` and `de`, same keys; `strings.test.mjs` enforces this).
- #24 ("Neue Kamera- und Jump-Features") lists "B = Blick zurück". #65 covers that bullet. #24's other bullets stay open: "Rückspiegel möglich?" (a rear-view mirror), a drone chase camera, and more jump spots.
- #10 (helicopter mode) is being enriched in parallel and leaves B to #65.

## Decisions

| Topic | Decision |
|---|---|
| Hold or toggle | **Hold.** Look back while B is down and return when it is released. It follows N (nitro) and Tab (×3), which are both held. |
| State | Each frame, `stepCamera` reads `keys.KeyB && $('overlay').hidden`. There is no extra flag in the `keydown` listener; `keyup`, `blur` and `openJump` already clear the key. |
| Chase, near | Flip the forward vector used by the camera (`fx, fz → −fx, −fz`). The camera then sits **in front** of the car at the same distance and height. It looks at a point 6 m **behind** the car, past the car. The building pull-in test runs on the flipped side. |
| Switching | When the look-back state changes, the chase camera **snaps** to its new target instead of lerping. A lerp would swing the camera through the car for about half a second. While B stays down, the normal smoothing runs as usual. |
| Cockpit, bumper | Mirror the eye's forward offset (`ex → −ex`, height and side unchanged) and look 40 m backwards. The cockpit eye stays at the driver's head, moved 0.65 m (×1.3) back, like turning round. The bumper eye becomes a **rear-bumper** camera. |
| Car model | Same rules as now: shown in the chase views (seen from the front when looking back), hidden in the eye views. |
| C while B is held | C still cycles the view, and the new view also looks back while B stays down. |
| Start overlay | B does nothing while the start/result overlay is open, just like C. |
| Minimap, compass, HUD | **Unchanged.** The minimap stays north-up and centred on the car. The compass shows the car's heading, not the view direction. There is no "rear view" marker and no toast. Whether you are looking back is clear from the picture, and a toast on every glance would cover the screen. |
| Help | One new F1 line after the C line: `<kbd>B</kbd>` + `keyLookBack` (`look back (hold)` / `zurückschauen (halten)`). The short key list on the start overlay is not changed. |
| Touch | No touch button. The touch bar only has the driving controls (`index.html:162-168`). |
| Test hook | `__mm.cam()` gains `back` (bool) and `look` (the camera's unit world direction `[x, y, z]`). The existing keys stay. |
| #24 | #65 replaces #24's "B = Blick zurück" bullet. The rear-view mirror, the drone camera and the jump spots stay in #24. |

## Implementation sketch

In `stepCamera`, the car's true forward vector `fx, fz` and right vector `rx = −fz, rz = fx` stay as they are, and a sign `s` is added:

```js
const back = !!keys.KeyB && $('overlay').hidden, snap = back !== CAM.back; CAM.back = back; const s = back ? -1 : 1;
```

- Eye views: the position uses `ex * s` (forward offset mirrored, side `es` on the true right vector, so the driver stays on the left). The look-at point is `P + f·40·s + r·es`.
- Chase views: the branch uses `bx = fx * s, bz = fz * s` everywhere it now uses `fx, fz` (the target, the building test and the look-at point). The lerp becomes `if (snap) camPos.copy(target); else camPos.lerp(…)`.

`CAM = { back: false }` sits next to `camView`. `$` is defined later in the file (`:1001`), but `stepCamera` only runs from `loop`, after the whole script has loaded.

## Testing

TDD in a new `prototype/tests/test_look_back.py`, in the style of `test_vehicles.py`: hand layout (`open_hand`), Start clicked, car at START heading π, so forward = −x.

- Chase: `d · forward > 0` while B is held, `< 0` after release. `look · forward < 0` while held.
- Cockpit (C×2) and bumper (C×3): `d` matches the mirrored eye exactly (cockpit `[-0.325, 1.586, 0.494]`, bumper `[3.055, 0.715, 0]`), and `look · forward < 0`. After release, `d` is back to the normal eye.
- Overlay open: holding B keeps `back` false.
- F1 help (de): "zurückschauen (halten)" is shown.

**Animated camera:** the chase camera is smoothed and a headless renderer draws at under 1 fps. So every assertion **polls the end state** with `wait_for_function(…, timeout=120000)`, for example "back is true **and** d·forward > 1". It never uses a fixed wait or waits for the camera to stop moving.

## Out of scope

- A rear-view mirror (#24).
- A drone camera (#24) and the helicopter mode (#10).
- Free look with the mouse, and looking left/right.
- A touch button.
- Changes to the minimap, the compass or the HUD.
