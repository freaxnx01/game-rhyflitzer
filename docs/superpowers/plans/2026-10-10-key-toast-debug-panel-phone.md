# Key toast vs debug panel on phones (#178) — implementation plan

**Goal:** on a coarse-pointer portrait screen, the F3/`?debug` panel stays out of the toast band. One CSS line in `prototype/index.html` plus one new test.

**Spec:** `docs/superpowers/specs/2026-10-10-key-toast-debug-panel-phone-design.md` (root cause: `@media (pointer:coarse){#debug{...top:calc(120px ...)}}` makes the grown panel reach y 227, the toast starts at 225).

## Global constraints

- No `//` comment in the middle of a one-line statement in `prototype/index.html`. The CSS here has no comments inside the line; the explanatory comment goes on its own line as `/* ... */`.
- Never loosen an assertion, never raise a timeout. Frame-bound waits are not needed in these tests (hand layout, element rects only).
- Playwright in the **foreground**, capped, output to a file (give the call 600000 ms):
  `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_toast.py -q > /tmp/out.txt 2>&1`
  If `pipeline/.venv` is missing in your checkout use `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python` from your checkout's `pipeline` directory.
- Only the targeted test files below, not the whole browser suite.
- Commit `fix(ui): keep the debug panel out of the toast band on phones (#178)`; PR body `Closes #178`.

### Task 1: The failing regression test first

**Files:** Modify `prototype/tests/test_toast.py` (append at the end of the file).

- [ ] **Step 1: Append this test.**

```python
STEER_JS = """() => { const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect();
  return b.width ? [b.left, b.top, b.right, b.bottom] : null; };
  return { vw: innerWidth, vh: innerHeight, debug: r('debug'), tl: r('tl'), steer: ['tL', 'tR', 'tG', 'tB', 'tH'].map(r) }; }"""


def test_debug_panel_clears_the_hud_on_a_phone(server):
    """#178: the open panel (legend + map links) must not sit on the checkpoint block or the steering circles."""
    with sync_playwright() as p:
        b, page = start_hand(p, server, "?debug", **VIEWS["touch-phone"])
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=120000)
        page.evaluate("() => document.getElementById('debughelp').click()")
        page.wait_for_function("() => window.__mm.debug().legend", timeout=120000)
        r = page.evaluate(STEER_JS)
        b.close()
    d = r["debug"]
    assert d and d[0] >= 0 and d[1] >= 0 and d[2] <= r["vw"] and d[3] <= r["vh"], r
    assert not overlaps(d, r["tl"]), r
    for s in r["steer"]:
        assert s and not overlaps(d, s), (s, r)
```

- [ ] **Step 2: Run it** (`... -k test_debug_panel_clears_the_hud_on_a_phone`). It probably **passes already on `main`** (the top-anchored panel is far above the steering circles): that is fine, it guards the new bottom anchor in Task 2 against the circles and `#tl`. The red test of this issue is the existing `[touch-phone]` toast test (run it first: `-k "key_toast_is_centred and touch-phone"`, expect the 2 px overlap failure). If a steering rect in the failure output is `None`, the circles are not shown (no `pointer:coarse`) and the test proves nothing: stop and report.

### Task 2: The CSS

**Files:** Modify `prototype/index.html`.

- [ ] **Step 1: Locate by content.** Find the line that starts `@media (pointer:coarse){#debug{padding-right:48px}#debughelp{width:36px;height:36px;line-height:32px}#debuglegend{max-height:calc(100vh - 400px)}}` (about line 54). Insert these **two lines directly after it**:

```css
/* #178: on a portrait phone the panel hangs above the steering circles (their top edge is 314px up); a top anchor ran into the toast band */
@media (pointer:coarse) and (orientation:portrait){#debug{top:auto;bottom:calc(330px + env(safe-area-inset-bottom,0px))}#debuglegend{max-height:max(120px,calc(100vh - 610px))}}
```

It must come **after** the existing `@media (pointer:coarse){#debug{bottom:auto;top:calc(120px ...)}}` rule at line 47 and the legend rule above (same specificity, later wins). Do not edit those existing rules.

- [ ] **Step 2: Run** `test_toast.py` completely. Expected: all pass, including `[touch-phone]` and the new test. If the new test fails on `#tl` (panel top above `#tl` bottom) increase the `610px` by 20 px steps; if it fails on a steering circle, increase `330px` by 10 px. Do not change the test.

### Task 3: Neighbouring suites, commit

- [ ] **Step 1:** run `test_debug.py -k "tap_on_the_question or legend_open"` and `test_navi.py` (same command shape). Expected: pass as on `main`.
- [ ] **Step 2:** commit both files, push, open the PR.
