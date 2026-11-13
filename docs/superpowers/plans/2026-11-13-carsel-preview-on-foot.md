# Car-selection preview on foot stands on the ground (#903) - Implementation Plan

**Goal:** on foot, the car selection's stage (preview car + turntable camera) uses the parked car's pose `FOOT.car`, not the walker's `P`, so the preview never floats and the car stays on the ground after the selection closes.
**Spec:** `docs/superpowers/specs/2026-11-13-carsel-preview-on-foot-design.md`
**Files:** modify `carselect.js`, `index.html` (`stepTurntable` ~5695, `showcaseCar` ~5999, `openCarSel` ~6000, the `./carselect.js` import ~967), `tests/carselect.test.mjs`, `tests/test_on_foot.py`, `CHANGELOG.md`.

## Global constraints

- Measured cause: `showcaseCar` sets `car.position` to `P` = the walker (hover y 28.81 vs ground 16.81, 12.0 m up); nothing moves the mesh back on close.
- Browser tests: only `tests/test_on_foot.py -k carsel`, foreground, never `run_in_background`, with `PW_CDP_ENDPOINT=http://192.168.1.120:9223`. Not the full suite.
- Commit and push the branch before running the browser test.
- No new keys, no new hooks needed (`__mm.foot()`, `__mm.carPose()`, `__mm.ground()`, `__mm.carsel()`, `__mm.pause()`, `__mm.footSim()` exist).

## Task 1: pure helper `stagePose` (TDD)

**Files:** `tests/carselect.test.mjs`, `carselect.js`

- [ ] Add `stagePose` to the test's import list from `'../carselect.js'` and append:

```js
test('stagePose_OnFootWithParkedCar_ReturnsTheParkedPoseNotTheWalker', () => {
  const walker = { x: 1810, y: 28.8, z: 608, th: 0.3, vx: 1 }, parked = { x: 1810, y: 16.8, z: 610, th: 0 };
  assert.deepEqual(stagePose(parked, walker), { x: 1810, y: 16.8, z: 610, th: 0 });
});

test('stagePose_NoParkedCar_ReturnsThePlayerPose', () => {
  const p = { x: 5, y: 2, z: -3, th: 1.2, vx: 9 };
  assert.deepEqual(stagePose(null, p), { x: 5, y: 2, z: -3, th: 1.2 });
});
```

- [ ] Run `node --test tests/carselect.test.mjs` -> fails (`stagePose` not exported).
- [ ] In `carselect.js`, after `lookShift` (~line 146), add:

```js
// #903: the stage frames the car where the car is -- on foot that is the parked pose, not the walker in P
export function stagePose(parked, p) { const s = parked ?? p; return { x: s.x, y: s.y, z: s.z, th: s.th }; }
```

- [ ] `node --test tests/carselect.test.mjs` -> green. Commit `fix(carsel): add stagePose for the preview stage (#903)`.

## Task 2: use it in the stage glue

**Files:** `index.html`

- [ ] Add `stagePose` to the `import { ... } from './carselect.js'` line (~967).
- [ ] Add next to `showcaseCar` a one-liner: `const stageAt = () => stagePose(FOOT.on ? FOOT.car : null, P);   // #903: on foot P is the walker`
- [ ] `showcaseCar` (~5999): replace `car.position.set(P.x, P.y, P.z); car.rotation.set(0, -P.th, 0);` with `const s = stageAt(); car.position.set(s.x, s.y, s.z); car.rotation.set(0, -s.th, 0);`
- [ ] `openCarSel` (~6000): spin start `angle: P.th - 0.6` -> `angle: stageAt().th - 0.6`.
- [ ] `stepTurntable` (~5695): take `const s = stageAt();` at the start and replace every `P.x`, `P.y`, `P.z` in it with `s.x`, `s.y`, `s.z` (camera position, `cy`, `lookAt`). Nothing else changes.
- [ ] `stageAt` is defined with `const` at script top level; make sure it is declared before first call at runtime (function bodies only call it, so placement next to `showcaseCar` is fine; `FOOT` is declared at ~4887).
- [ ] `node --test tests/carselect.test.mjs tests/foot.test.mjs` -> green. Commit `fix(carsel): stage the parked car on foot, not the walker (#903)`.

## Task 3: browser regression test

**Files:** `tests/test_on_foot.py` (append; reuses `open_hand`, `ROAD`, `foot`, `press_z`)

```python
def test_carsel_on_foot_hovering_keeps_the_preview_car_on_the_ground(server):
    """#903: Z, F, climb, pause, change vehicle: the preview car stands at the parked pose on the ground, also after Drive on."""
    pose = "() => window.__mm.carPose().pos"
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        page.wait_for_function(f"() => Math.abs(window.__mm.foot().carMesh.x - {x}) < 0.01", timeout=60000)
        press_z(page)
        page.keyboard.press("f")
        page.wait_for_timeout(200)
        page.evaluate("() => window.__mm.footSim(2, ['Space'])")
        up = foot(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        page.evaluate("() => document.querySelector('#pausevehicle').click()")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=120000)
        page.wait_for_timeout(1000)
        shown = page.evaluate(pose)
        ground = page.evaluate(f"() => window.__mm.ground({shown[0]}, {shown[2]}, -Infinity)")
        page.evaluate("() => document.querySelector('#csrace').click()")
        page.wait_for_function("() => !window.__mm.carsel().open && !window.__mm.pause().on", timeout=120000)
        after = page.evaluate(pose)
        b.close()
    car = up["car"]
    assert up["hover"] is True and up["y"] - car["y"] > 5, up                  # really hovering high above the car
    assert abs(shown[0] - car["x"]) < 0.01 and abs(shown[2] - car["z"]) < 0.01, (shown, car)
    assert abs(shown[1] - car["y"]) < 0.01 and abs(shown[1] - ground) < 0.1, (shown, ground)
    assert abs(after[1] - car["y"]) < 0.01 and abs(after[2] - car["z"]) < 0.01, (after, car)
    assert errors == []
```

- [ ] Before Task 2 this test fails on `shown` (y 28.81 vs 16.80, measured). After Task 2 it passes.
- [ ] Commit, push the branch, then run in the foreground: `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest -q tests/test_on_foot.py -k carsel`.
- [ ] Also run `tests/test_carselect.py -k "turntable or back_in_a_vehicle_change or rollover"` once (the in-car stage must be unchanged).

## Task 4: changelog

- [ ] Under `## [Unreleased]` -> `### Fixed` (create the heading if missing), player voice, German, timestamp like the other entries:
  `- \`2026-11-13 HH:MM\` **Fahrzeug wechseln zu Fuss**: bist Du ausgestiegen und geschwebt, schwebten die Autos in der Vorschau mit Dir in der Luft. Jetzt steht die Vorschau am geparkten Platz auf dem Boden, und das gewählte Auto wartet dort, bis Du wieder einsteigst.`
- [ ] Commit `docs(changelog): carsel preview on foot (#903)`.
