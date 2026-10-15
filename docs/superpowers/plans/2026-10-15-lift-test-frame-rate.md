# Lift shaft pattern test: frame-rate independent recording -- implementation plan (#317)

**Goal:** `test_lift_shaft_pattern_rises_riding_down_and_sinks_riding_up` passes at ~1 fps (SwiftShader) and at ~60 fps.

**Architecture:** change the stop condition of the `RECORD_RIDE` JS string in `prototype/tests/test_hideout.py`.

**Global constraints**

- Touch only `prototype/tests/test_hideout.py`. No game code, no CHANGELOG entry (test-only).
- Run verification in the foreground, one Playwright file, only the affected test.

## Task 1 -- record until the ride has run and returned to idle

**Files:** modify `prototype/tests/test_hideout.py` (`RECORD_RIDE`, around line 701).

The test itself is the failing test: at 60 fps it fails with `AssertionError: (0, 0)`. Do not edit its assertions.

- [ ] Step 1: replace `RECORD_RIDE` with

```python
RECORD_RIDE = """async () => {
  const rows = []; const t0 = performance.now(); let rode = false;
  while (performance.now() - t0 < 200000) {
    await new Promise(r => requestAnimationFrame(r));
    const l = window.__mm.lift(); if (l.phase !== 'idle') rode = true; else if (rode) break;
    rows.push({ phase: l.phase, scroll: l.scroll, indicator: l.indicator });
  }
  return rows;
}"""
```

- [ ] Step 2: run only the affected test, in the foreground:
  `cd prototype/tests && python -m pytest test_hideout.py -k lift_shaft_pattern -x` (SwiftShader). Expected: pass.
- [ ] Step 3: commit `fix(test): record the lift ride until it has run and is idle again` with `Closes #317`.
