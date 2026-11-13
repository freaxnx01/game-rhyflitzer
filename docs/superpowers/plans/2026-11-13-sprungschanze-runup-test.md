# Sprungschanze run-up test (#931) Implementation Plan

**Goal:** `test_sprungschanze_run_up_launches_the_car` measures the jump (peak clearance and flight length past the
lip) instead of the clearance at one instant, so it no longer depends on the default car's acceleration.

**Architecture:** test-only change in `tests/test_jump.py`. No game code changes: the game did not regress
(spec: the default car became the quicker hatchback in #830, 706dce7, and simply lands at the old 4 s sample).

**Global constraints:** never lower a threshold to match a regression; do not touch `index.html`, `vehicle.js`,
`carselect.js`. Playwright in the foreground only. Use the GPU browser: `PW_CDP_ENDPOINT=http://192.168.1.120:9223`.

## Task 1: Rewrite the run-up test

**Files:** Modify `tests/test_jump.py` (function `test_sprungschanze_run_up_launches_the_car`, ~line 469-482).

- [ ] **Step 1: Replace the test body**

```python
@needs_world
def test_sprungschanze_run_up_launches_the_car(server):
    """#80 / #931: from the J run-up the car flies off the Sprungschanze. Measured as the jump itself (peak clearance,
    flight length past the lip), not the clearance at one instant: that tied the test to the default car's acceleration
    (#830 hatchback: peak 3.47 m, touchdown ~19 m past the lip at ~4.0 s)."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "sprung")
        th = page.evaluate("() => window.__mm.heading()")
        r = ramp(page)
        samples = page.evaluate(f"() => [...Array(121)].map((_, i) => window.__mm.sim({c['x']}, {c['z']}, {th}, 0, 2 + i / 30))"
                                ".map(e => ({ x: e.x, z: e.z, clear: e.y - window.__mm.ground(e.x, e.z, -Infinity) }))")
        b.close()
    past = [s for s in samples if s["x"] > r["x1"]]
    assert past, "the car did not get over the ramp"
    down = next((s for s in past if s["clear"] < 0.05), past[-1])
    assert r["z0"] < down["z"] < r["z1"], "the car left the ramp sideways"
    top = max(s["clear"] for s in samples)
    assert top > 2.5, f"the car rose only {top:.2f} m over the ground"
    assert down["x"] - r["x1"] > 10, f"the car touched down {down['x'] - r['x1']:.1f} m past the lip: the ramp did not launch it"
```

Notes: only the first string literal is an f-string; the `.map(...)` continuation is a plain string, so its JS braces stay single. `next(..., past[-1])` treats a car
still airborne at 6 s as a long flight (passes).

- [ ] **Step 2: Run it**

```bash
PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest -q "tests/test_jump.py::test_sprungschanze_run_up_launches_the_car"
```

Expected: PASS (measured: peak ~3.47 m, touchdown ~19 m past x1).

- [ ] **Step 3: Sanity of the asserts (reasoning, no probe):** without a ramp the car never leaves the ground, so `top` stays ~0 and touchdown is 0 m past x1: both asserts fail. Do not commit probes.

- [ ] **Step 4: Run the other Sprungschanze tests (targeted, not the full suite)**

```bash
PW_CDP_ENDPOINT=http://192.168.1.120:9223 python -m pytest -q tests/test_jump.py -k sprungschanze
```

Expected: all pass or skip (the measured-terrain ones need `data/terrain_hochrhein.mmh`).

- [ ] **Step 5: Commit**

```bash
git add tests/test_jump.py
git commit -m "test(jump): measure the Sprungschanze jump, not one instant (#931)"
```

## Task 2: Changelog

Test-only, no player-facing change: **no CHANGELOG entry** (the changelog is player-facing prose).

## Done when

- [ ] `test_sprungschanze_run_up_launches_the_car` passes on the GPU browser.
- [ ] No game file changed; `git diff --stat origin/main` lists only `tests/test_jump.py`.
