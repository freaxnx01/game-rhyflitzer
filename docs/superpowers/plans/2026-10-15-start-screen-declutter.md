# Start screen declutter (#224) Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-15-start-screen-declutter-design.md`. Buildless game (stack: browser-game), TDD with a Playwright test.

**Goal:** remove the keyboard instruction grid from the start panel and the three strings only it used.

**Architecture:** delete one markup block in `prototype/index.html`, three entries per language in `prototype/strings.js`, add one test. No new files.

**Global constraints:** surgical edit; do not touch `#help` or its `.keys` CSS; no credits button/markup (that is #267); run Playwright in the foreground, one file only (`test_help_filter.py`), never the full suite; commit and push the branch before running Playwright.

## Files

- Modify: `prototype/index.html` (delete the `<div class="keys">` block inside `#overlay .panel`, the one directly after `<div id="result" hidden></div>`, 14 lines incl. wrapper)
- Modify: `prototype/strings.js` (delete `keyHornMute`, `keyNitroJump`, `keyAllKeys` in `en` and `de`)
- Modify: `prototype/tests/test_help_filter.py` (new test)
- Modify: `CHANGELOG.md` (one player-facing line under `[Unreleased]` / `Changed`, with date and Zurich time)
- No change: `prototype/tests/test-map.json` (selection is already covered: `strings.js` -> `test_i18n.py`, edited test file -> itself, game file -> smoke trio)

## Task 1: failing test

- [ ] Step 1: in `prototype/tests/test_help_filter.py`, add a test that opens the page without clicking Start. `open_page` clicks `#startbtn`, so add a keyword `start=True` to it?  Do not add a flag argument (clean code): instead extract the page setup into `open_start_screen(p, server, locale)` returning `(b, page, errors)` and let `open_page` call it and then click. Then:

```python
def test_start_screen_has_no_key_list_but_f1_opens_help(server):
    """#224: the keys live in F1, not on the crowded start panel."""
    with sync_playwright() as p:
        b, page, errors = open_start_screen(p, server)
        panel_keys = page.locator("#overlay .keys").count()
        page.keyboard.press("F1")
        page.wait_for_function("() => !document.querySelector('#help').hidden", timeout=T)
        rows = help_rows(page)
        b.close()
    assert panel_keys == 0
    assert rows["kbdCount"] > 10
    assert errors == []
```

- [ ] Step 2: run `python -m pytest prototype/tests/test_help_filter.py -k start_screen -x` (foreground, timeout 600000). Expected: FAIL on `panel_keys == 0` (it is 1).

## Task 2: remove the block and orphan strings

- [ ] Step 1: delete the whole `<div class="keys">...</div>` block (12 `<kbd>` rows) from the start panel in `prototype/index.html`. Do not touch the one inside `<div id="help">`.
- [ ] Step 2: delete the three keys from `en` and `de` in `prototype/strings.js` (`keyHornMute`, `keyNitroJump`, `keyAllKeys`).
- [ ] Step 3: `grep -rn "keyHornMute\|keyNitroJump\|keyAllKeys" prototype` prints nothing.
- [ ] Step 4: `node --test prototype/tests/strings.test.mjs prototype/tests/helpfilter.test.mjs` passes.
- [ ] Step 5: re-run the new test, then `test_help_filter.py` whole, then `test_i18n.py` (foreground). Expected: pass.

## Task 3: changelog and finish

- [ ] Step 1: add under `## [Unreleased]` / `### Changed` in `CHANGELOG.md`, in the player voice and the file's dated format: `YYYY-MM-DD HH:MM` (Zurich) **Start screen** is tidier: the list of keys is gone from it. Press F1 (or ?) any time to see all keys.
- [ ] Step 2: manual check in a browser at 1280x720 and a 390 px wide viewport (Playwright screenshot is enough): panel fits without scrolling at 1280x720, F1 opens help, console empty.
- [ ] Step 3: commit `feat(ui): drop the key list from the start screen`, body `Closes #224`; PR to `main`.
