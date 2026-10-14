# Editor: "Connection lost" recovery — implementation plan (#320)

**Goal:** `#lost` hides on the first successful poll after it was shown.

**Architecture:** one `show('lost', false)` in `poll()`'s success path (`editor/editor.js`), covered by one new Playwright test.

**Global constraints**

- Touch only `editor/editor.js`, `prototype/tests/test_editor.py`, `CHANGELOG.md`.
- Targeted tests only: run the one new test plus the neighbouring `test_connection_lost_appears_after_three_misses_not_two`; no full suite. No node test is needed (no pure function changes).
- Run verification in the foreground.

---

## Task 1 — failing test first

**Files:** `prototype/tests/test_editor.py` (add after `test_connection_lost_appears_after_three_misses_not_two`, line ~446).

- [ ] Add:

```python
def test_connection_lost_disappears_when_a_poll_succeeds_again(server):
    api = Api(script=[(500, {}), (500, {}), (500, {}), (200, job("building", "terrain"))])   # three misses, then the connection is back
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn")
        page.wait_for_function("() => !document.querySelector('#lost').hidden", timeout=30000)
        page.wait_for_function("() => document.querySelector('#lost').hidden", timeout=30000)   # the first good poll hides it
        state = page.evaluate("() => window.__ed.state()")
        b.close()
    assert errs == [] and state == "building"
```

- [ ] Check the `step` value `"terrain"` is a valid `STEPS` entry in `editor/api.js`; use another valid building step if not.
- [ ] Run: `cd prototype/tests && python -m pytest test_editor.py -k "connection_lost" -x` — the new test fails (timeout waiting for hidden), the old one passes.

## Task 2 — the fix

**Files:** `editor/editor.js`, in `poll()`.

- [ ] Change `S.misses = 0; applyJob(job, t0);` to `S.misses = 0; show('lost', false); applyJob(job, t0);`.
- [ ] Run the same `-k "connection_lost"` command: both pass.

## Task 3 — changelog

**Files:** `CHANGELOG.md`, under `## [Unreleased]` → `### Fixed`, newest first.

- [ ] Timestamp: `TZ=Europe/Zurich date '+%F %H:%M'`. Entry:

```markdown
- `<timestamp>` In the **region editor**, "**Connection lost**, retrying…" now goes away as soon as the connection is back, instead of staying while your world is still building.
```

## Task 4 — commit

- [ ] `fix(editor): hide "Connection lost" when polling recovers` with `Closes #320`, via PR per repo rules.
