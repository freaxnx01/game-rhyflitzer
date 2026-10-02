# V hides the car's shadow too — design

Status: approved (headless `/enrich --quick`) 2026-10-02 · Issue #37

## Goal

**V** (car toggle, #20) hides the car but leaves its dark ground disc on the road. After the fix, **V** hides the car **and** its shadow, and pressing it again brings both back. The shadow keeps hiding as it does today in water, in the air (> 6 m above ground) and in the eye cameras.

## Cause

The fake shadow is `blob` (`prototype/index.html:789`), a `CircleGeometry` added straight to the scene, not a child of `car`. Its visibility is recomputed every simulation step at the end of `stepCar` (`prototype/index.html:899`):

```js
blob.visible = wl === null && (P.y - gh2) < 6 && !CAM_VIEWS[camView].eye;
```

The **V** handler (`prototype/index.html:815`) only sets `HUD.carHidden` and `car.visible`; nothing reads `HUD.carHidden` for the blob.

## Design

Add `!HUD.carHidden` to that one condition:

```js
blob.visible = wl === null && (P.y - gh2) < 6 && !CAM_VIEWS[camView].eye && !HUD.carHidden;
```

`stepCar` runs every frame once the game is started (`loop`, `prototype/index.html:966`), so the blob follows the toggle on the next frame. The real shadow-map shadow (`castShadow` on the car's meshes) already disappears with `car.visible = false`, since three.js does not render invisible objects into the shadow map.

**Test hook:** `window.__mm.hud()` (`prototype/index.html:856`) gains `shadowVisible: blob.visible`, next to the existing `carVisible`, so the browser smoke test can check it.

**Test:** extend `test_hud_bundle` (`prototype/tests/test_smoke.py:364`), which already presses **V** twice and asserts `carVisible`. After each **V** press, wait a few frames (`page.wait_for_timeout(200)`) and read `shadowVisible`; assert it is `False` after the first press and `True` after the second. The car is on a road, dry and grounded at that point in the test, and the default camera is not an eye view (`car_on is True` proves it), so the other three conditions are all true.

**CHANGELOG:** one line under `[Unreleased]` → `### Fixed`, player voice.

## Out of scope

- Moving `blob` under `car` (it must stay flat on the ground while the car tilts and jumps).
- Changing the water / air / eye-camera rules.
