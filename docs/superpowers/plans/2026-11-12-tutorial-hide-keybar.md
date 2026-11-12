# Hide the key bar during the tutorial (#912) - Implementation Plan

**Goal:** the key bar is hidden while `R.mode === 'tutorial'`, unchanged elsewhere; the Settings switch is not overwritten.
**Spec:** `docs/superpowers/specs/2026-11-12-tutorial-hide-keybar-design.md`
**Files:** modify `index.html` (`stepKeybar`, ~line 4934), `tests/test_keybar.py`, `CHANGELOG.md`. No change in `controls.js`, `tutorial.js`, `hudfade.js`.

## Global constraints

- Browser tests: only the affected files, foreground, never `run_in_background`: `tests/test_keybar.py`, `tests/test_hud_fade.py -k key_bar`. Not the full suite.
- Commit and push the branch before running the browser tests.

## Task 1: failing test

**Files:** `tests/test_keybar.py` (append; reuses `open_hand`, `BAR`)

- [ ] Add, after the last test, a test that opens the tutorial and checks the bar. Start the tutorial by clicking `#tutorialbtn` (see `tests/test_tutorial.py:30-32`).

```python
def test_bar_is_hidden_in_the_tutorial_and_back_in_the_next_mode(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server, start=None)
        page.click("#tutorialbtn")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=240000)
        tut = page.evaluate(BAR)
        stored = page.evaluate("() => localStorage.getItem('mm.keybar')")
        b.close()
    assert tut["on"] is True and tut["shown"] is False, tut          # setting kept, bar hidden
    assert stored in (None, "1"), stored                              # the tutorial wrote nothing
    assert errors == []
```

- [ ] Cross-mode default is already covered by `test_bar_follows_the_context_and_the_language` (cruise shows the bar); no second test needed.
- [ ] Run: `python3 -m pytest tests/test_keybar.py -k tutorial -x` (foreground, `timeout` 600000). Expected: FAIL (`shown` is True).

## Task 2: implement

**Files:** `index.html`

- [ ] In `stepKeybar()` change the signature and the hidden line:

```js
function stepKeybar() {
  const ctx = controlContext(), act = contextAction(), tut = R.mode === 'tutorial', sig = `${KEYBAR.on}|${tut}|${ctx}|${act}|${window.GG_LANG}`;
  ...
  KEYBAR.sig = sig; $('keybar').hidden = !KEYBAR.on || tut;   // #912: the tutorial hint names the keys; the setting (KEYBAR.on) stays the user's
```

Leave the rest of the function and `toggleKeybar` as they are. Add a short `#912` note in the existing comment above `KEYBAR` is not required.

- [ ] Run: `python3 -m pytest tests/test_keybar.py tests/test_hud_fade.py -k "bar" -x`. Expected: PASS (the old ghost test uses cruise, unaffected).

## Task 3: changelog and commit

**Files:** `CHANGELOG.md`

- [ ] Timestamp: `TZ=Europe/Zurich date '+%F %H:%M'`. Insert as the first line under `### Changed` of `[Unreleased]` (newest first, never `git cliff -o`):

```markdown
- `<timestamp>` In the **tutorial** the **key bar** at the top is gone: the hint already names the keys of each step. Afterwards, and in every other mode, it works as before, and the **Key bar** switch in Settings keeps your choice. <kbd>F1</kbd> still lists all keys.
```

- [ ] Commit: `feat(tutorial): hide the key bar while the tutorial hint names the keys (#912)`; open PR; Closes #912.

## Verify

`tests/test_keybar.py` and the key-bar test in `tests/test_hud_fade.py` pass; manual: tutorial shows no bar, cruise shows it, Settings switch value unchanged after the tutorial.
