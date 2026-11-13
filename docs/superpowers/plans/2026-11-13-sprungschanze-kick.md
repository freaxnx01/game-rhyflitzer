# Sprungschanze kick (#969) Implementation Plan

**Goal:** the Sprungschanze throws the car up: from the J run-up (hatchback, 31.3 m/s at the lip) the apex is ~2.0 m
above the lip (today 0.06 m) and the car touches down ~34 m past the lip (today 19.4 m).

**Architecture:** a ramp-specific kick at the lip. Two pure helpers in `vehicle.js` (`crossesLip`, `rampKick`,
constant `RAMP_KICK`) and one line in `stepCar` (`index.html`). Spec: `docs/superpowers/specs/2026-11-13-sprungschanze-kick-design.md`.

**Global constraints:**
- Do not touch `KERB`, `launchVy`, `isKerb`, `isEdge` (#902: kerbs must never launch). The kick is keyed to `RAMP` only.
- No new key, no new mesh, no change to `RAMP` geometry or `groundH`.
- Playwright in the foreground only, GPU browser: `PW_CDP_ENDPOINT=http://192.168.1.120:9223`. Run only the targeted tests below, not the full suite.
- CHANGELOG: add a player-facing line under `[Unreleased]` (German, like the existing entries).

## Task 1: Pure helpers (TDD)

**Files:** Modify `vehicle.js` (after `isEdge`), `tests/vehicle.test.mjs`.

- [ ] **Step 1: Write the failing tests** — extend the import in `tests/vehicle.test.mjs` with `RAMP_KICK, crossesLip, rampKick` and append:

```js
const RAMP = { x0: 397.3, x1: 422.7, z0: 152.4, z1: 188, h: 3.4 };

test('crossesLip_FromRampPastHighEdge_True', () => {
  assert.equal(crossesLip(RAMP, 422.3, 170, 422.8, 170), true);
});

test('crossesLip_StaysOnRamp_False', () => {
  assert.equal(crossesLip(RAMP, 410, 170, 410.5, 170), false);
});

test('crossesLip_AlreadyPastLip_False', () => {
  assert.equal(crossesLip(RAMP, 423, 170, 423.5, 170), false);
});

test('crossesLip_LeavesOverSideEdge_False', () => {
  assert.equal(crossesLip(RAMP, 422.5, 187.9, 422.9, 188.3), false);
});

test('crossesLip_BackwardsOverLowEdge_False', () => {
  assert.equal(crossesLip(RAMP, 397.5, 170, 397.0, 170), false);
});

test('rampKick_RunUpSpeed_ApexAbout2mAboveLip', () => {
  const vy = rampKick(31.3);
  assert.ok(Math.abs(vy - 31.3 * RAMP_KICK) < 1e-9);
  assert.ok(vy * vy / (2 * 22) > 1.8);   // gravity 22 (index.html stepCar)
});

test('rampKick_ReverseOrStill_Zero', () => {
  assert.equal(rampKick(-10), 0);
  assert.equal(rampKick(0), 0);
});
```

- [ ] **Step 2: Run, expect FAIL** (`crossesLip` not exported): `node --test tests/vehicle.test.mjs`

- [ ] **Step 3: Implement** in `vehicle.js`:

```js
// #969: the Sprungschanze throws the car up. Leaving the ramp over its high edge (x1; the ramp rises along +x) a
// grounded car gets at least RAMP_KICK x its speed along the rise as vertical speed: ~16.7 deg, apex ~2 m above the
// lip at the J run-up's 31 m/s. Keyed to the ramp's footprint, so no kerb or crest can trigger it (#902).
export const RAMP_KICK = 0.30;

export function crossesLip(ramp, ax, az, bx, bz) {
  const onRamp = ax >= ramp.x0 && ax <= ramp.x1 && az >= ramp.z0 && az <= ramp.z1;
  return onRamp && bx > ramp.x1 && bz >= ramp.z0 && bz <= ramp.z1;
}

export function rampKick(vx, kick = RAMP_KICK) {
  return Math.max(0, vx * kick);
}
```

- [ ] **Step 4: Run, expect PASS:** `node --test tests/vehicle.test.mjs` (all old tests stay green).

- [ ] **Step 5: Commit** `feat(jump): ramp kick helpers for the Sprungschanze lip (#969)`

## Task 2: Kick in stepCar

**Files:** Modify `index.html` (import ~line 1020, `stepCar` ~line 5622).

- [ ] **Step 1: Import:** `import { stepSamples, isKerb, isEdge, launchVy, crossesLip, rampKick } from './vehicle.js';   // #902, #969`

- [ ] **Step 2: Kick:** directly after the line `const gh2 = groundH(P.x, P.z, P.y), wl = waterLevelAt(P.x, P.z, P.y);` in `stepCar` insert:

```js
  if (RAMP && !air && crossesLip(RAMP, P.x - P.vx * dt, P.z - P.vz * dt, P.x, P.z)) P.vy = Math.max(P.vy, rampKick(P.vx));   // #969: the Sprungschanze throws the car up at its lip; `air` is the frame-start flag, so only a car driving on the ramp
```

`P.x - P.vx * dt` is the frame-start position (P.x was advanced by `P.vx * dt` just above). The air branch on the next line applies gravity as usual.

- [ ] **Step 3: Commit and push the branch** (before verification): `feat(jump): the Sprungschanze throws the car up (#969)`

## Task 3: Measure it in the run-up test

**Files:** Modify `tests/test_jump.py`, `test_sprungschanze_run_up_launches_the_car` (~line 469-488).

- [ ] **Step 1: Extend the test.** Sample `y` too, measure the lip height, assert apex and flight length:

```python
@needs_world
def test_sprungschanze_run_up_launches_the_car(server):
    """#80 / #931 / #969: from the J run-up the car flies off the Sprungschanze. Measured as the jump itself: apex above
    the lip (#969: 0.06 m before the kick, ~2.0 m with it), peak clearance, touchdown past the lip (~34 m)."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "sprung")
        th = page.evaluate("() => window.__mm.heading()")
        r = ramp(page)
        lip = page.evaluate(f"() => window.__mm.ground({r['x1']} - 0.01, {c['z']}, 1e4)")
        samples = page.evaluate(f"() => [...Array(121)].map((_, i) => window.__mm.sim({c['x']}, {c['z']}, {th}, 0, 2 + i / 30))"
                                ".map(e => ({ x: e.x, y: e.y, z: e.z, clear: e.y - window.__mm.ground(e.x, e.z, -Infinity) }))")
        b.close()
    past = [s for s in samples if s["x"] > r["x1"]]
    assert past, "the car did not get over the ramp"
    down = next((s for s in past if s["clear"] < 0.05), past[-1])
    assert r["z0"] < down["z"] < r["z1"], "the car left the ramp sideways"
    top = max(s["clear"] for s in samples)
    assert top > 2.5, f"the car rose only {top:.2f} m over the ground"
    apex = max(s["y"] for s in past) - lip
    assert apex > 1.6, f"the apex is only {apex:.2f} m above the lip: the ramp did not throw the car up"
    assert down["x"] - r["x1"] > 25, f"the car touched down {down['x'] - r['x1']:.1f} m past the lip: the ramp did not launch it"
```

- [ ] **Step 2: Run (foreground):**

```bash
PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest -q tests/test_jump.py -k sprungschanze
```

Expected: PASS; the run-up test reports apex ~2.0, touchdown ~34 m. On `main` (without Task 2) the apex assert fails with ~0.06 m.

- [ ] **Step 3: Kerb regression check (targeted):**

```bash
PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest -q tests/test_plattform_field.py tests/test_vehicles.py -k "golden or field"
```

Expected: PASS unchanged (neither touches the ramp).

- [ ] **Step 4: CHANGELOG** under `[Unreleased]` / `Changed`, in the existing entry format (`` `YYYY-MM-DD HH:MM` **Label**: text``): **Sprungschanze**: „Die Sprungschanze wirft das Auto jetzt richtig in die Luft: rund 2 m über die Kante hinaus statt nur darüber abzukippen."

- [ ] **Step 5: Commit and push** `test(jump): the Sprungschanze run-up measures the apex above the lip (#969)`
