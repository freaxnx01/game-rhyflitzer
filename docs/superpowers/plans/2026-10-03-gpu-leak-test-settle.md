# Plan: settle before the baseline in `test_rebuilds_free_gpu_memory` (#64)

**Goal:** make the GPU leak test independent of load by taking `first` only after the follow camera has
arrived and no lazy first-draw uploads are pending. Spec:
`docs/superpowers/specs/2026-10-03-gpu-leak-test-settle-design.md`.

**Global constraints:** test-only change in `prototype/tests/test_vehicles.py`. Do not touch the three
assertions of the test. Do not touch `prototype/index.html`. No new files. Run browser tests in the
foreground, never in the background. Run pytest as
`pipeline/.venv/bin/python -m pytest` from the repo root (path of the main checkout:
`/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python`).

## Task 1: `wait_settled` and its use

**Files:** modify `prototype/tests/test_vehicles.py` (helper after `wait_frames`, line ~48; test at
line ~153).

**Interface:** `wait_settled(page, rounds=40, eps=0.01)` returns nothing; raises `AssertionError` with both
last samples if the scene did not settle within `rounds` rounds.

- [ ] **Step 1: reproduce (the failing test is the spec).** Run the test as is; expect FAIL on `textures`
  or `geometries` under a cold start (it failed deterministically for the enrichment).

  `pipeline/.venv/bin/python -m pytest prototype/tests/test_vehicles.py::test_rebuilds_free_gpu_memory -x -q`

- [ ] **Step 2: add the helper** after `wait_frames`:

```python
def wait_settled(page, rounds=40, eps=0.01):
    """Wait until the scene has stopped uploading: three.js uploads a mesh the first time it is drawn, and the follow
    camera eases from its spawn pose into the chase pose over ~30 frames, so static world meshes keep entering the
    frustum (#64). Settled = two consecutive samples with equal GPU counts and a camera offset that moved < eps
    (arrival, not stillness: the exponential ease never reaches zero)."""
    sample = "() => ({ gpu: window.__mm.gpu(), d: window.__mm.cam().d })"
    prev = page.evaluate(sample)
    for _ in range(rounds):
        wait_frames(page, 5)
        cur = page.evaluate(sample)
        if cur["gpu"] == prev["gpu"] and max(abs(a - b) for a, b in zip(cur["d"], prev["d"])) < eps:
            return
        prev = cur
    raise AssertionError(f"scene did not settle in {rounds} rounds of 5 frames: {prev} -> {cur}")
```

- [ ] **Step 3: use it** in the test, between the first rebuild and the baseline:

```python
        use_vehicle(page, ""); wait_frames(page)
        wait_settled(page)
        first = page.evaluate("() => window.__mm.gpu()")
```

  The `for` loop, `last`, and the three assertions stay byte-for-byte as they are.

- [ ] **Step 4: verify.** Run the test in isolation 3 times, one at a time, in the foreground; expect PASS
  each time. Then run the whole `prototype/tests` suite in the foreground with a generous timeout; expect no
  new failures.

- [ ] **Step 5: prove the check still bites.** Temporarily comment out the `m.map?.dispose()` call in
  `freeCar` (`prototype/index.html:936`), run the test, expect FAIL on textures (plate texture leaks), then
  `git checkout prototype/index.html`. Do not commit this.

- [ ] **Step 6: commit** `test(prototype): settle the scene before the GPU leak baseline (#64)`, body: why
  (lazy first-draw uploads while the follow camera eases in, not a leak), `Closes #64`. No CHANGELOG entry:
  nothing changes for players.
