# #88 i18n toggle test flaky - plan

Spec: `docs/superpowers/specs/2026-10-03-i18n-toggle-test-flaky-design.md`. Test-only change, one file:
`prototype/tests/test_i18n.py`. No production code.

## Task 1: give the navigations the same budget as the READY waits

**Files:** modify `prototype/tests/test_i18n.py`

- [ ] Step 1: reproduce (the failing test is the existing one). Foreground, capped:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <main-checkout>/pipeline/.venv/bin/python -m pytest prototype/tests/test_i18n.py::test_toggle_switches_live_and_persists -q`
  Expect intermittently `Page.reload: Timeout 30000ms exceeded`.
- [ ] Step 2: in `test_toggle_switches_live_and_persists` change
  `page.reload(); page.wait_for_function(READY, timeout=240000)` to
  `page.reload(timeout=240000); page.wait_for_function(READY, timeout=240000)`.
- [ ] Step 3: in `open_page` change `page.goto(f"{server}/prototype/index.html")` to
  `page.goto(f"{server}/prototype/index.html", timeout=240000)`.
- [ ] Step 4: do not touch any assert. Run the test alone 3 times and the full file 3 times (foreground, capped);
  all must pass. If it still fails, STOP and report the assertion (3-attempt rule).
- [ ] Step 5: commit `test(prototype): give reload and goto the 240 s budget under SwiftShader (#88)`,
  PR with `Closes #88`.
