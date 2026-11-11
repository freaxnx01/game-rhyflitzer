# Radio tests autoplay over CDP (#856) Implementation Plan

**Goal:** the autoplay-dependent radio tests pass or skip clearly on the GPU browser (`PW_CDP_ENDPOINT`) and stay unchanged on the local/CI browser.

**Global constraints:** only `tests/test_radio.py` changes. No new files, no packages. Do not rewrite existing tests; #845 appends two tests at the end of the same file (append-only there), so keep your edits to the header, `open_game`, and `test_menu_music_starts_during_loading`. Run only targeted checks, foreground, never `run_in_background`; do not run the full suite.

## Task 1: over_cdp helper, gesture in open_game, skip the load-start test

**Files:** `tests/test_radio.py`

- [ ] **Step 1: imports and helper.** Replace the import block:

```python
from pathlib import Path

from playwright.sync_api import sync_playwright
```
with
```python
from pathlib import Path

import pytest
from conftest import GPU
from playwright.sync_api import sync_playwright
```
and add after `T = 120000`:

```python
def over_cdp():
    """#856: with PW_CDP_ENDPOINT the browser is connected over CDP, so the launch flags in ARGS (autoplay policy) never apply."""
    return GPU["endpoint"] is not None
```
If `from conftest import GPU` fails to import under the repo's pytest config, use `sys.modules["conftest"].GPU` at call time instead (keep the helper's contract).

- [ ] **Step 2: gesture in open_game.** In `open_game`, after the `page.wait_for_function(...)` line and before `return b, page, errors, music`, add:

```python
    if over_cdp():
        page.keyboard.press("Shift")   # #856: no autoplay flag over CDP; one user activation lets the radio play
```

- [ ] **Step 3: skip the load-start test.** First line of the body of `test_menu_music_starts_during_loading`:

```python
    if over_cdp():
        pytest.skip("#856: asserts the menu track is fetched at load start, before any gesture; needs the autoplay launch flag, which a CDP-connected browser ignores")
```

- [ ] **Step 4: update the module docstring.** Add the line: `#856: over CDP (PW_CDP_ENDPOINT) the launch flag does not apply: open_game presses Shift once, the load-start test is skipped.`

- [ ] **Step 5: verify (no browser run of the full file).**
  - `python3 -m pytest tests/test_radio.py --collect-only -q` lists all tests, no import error (also with `PW_CDP_ENDPOINT` unset).
  - Local browser, one test only: `python3 -m pytest tests/test_radio.py -k "menu_music_starts_during_loading" -q` passes (behaviour unchanged locally).
  - On the GPU browser (`direnv exec . python3 -m pytest tests/test_radio.py -k "keys_drive or blocked_autoplay or pause_pauses or menu_music_starts" -q`): the load-start test reports SKIPPED with the reason, the other three pass. If `test_keys_drive_the_radio_and_show_the_display` still fails over CDP, STOP and report the failure text; do not iterate (cause was not measured at enrich time, assumption A2). If `blocked_autoplay` fails over CDP, add the same `over_cdp()` skip to it (A3).
  - Re-run `test_pause_pauses_and_resumes_the_radio` three times on the GPU browser; if it ever fails, report it (the stub is already used, so the failure is new information).

- [ ] **Step 6: commit** `test(radio): autoplay tests work over CDP: gesture in open_game, skip the load-start test (#856)`. Add a `[Unreleased]` line to `CHANGELOG.md` only if the repo's convention covers test-only changes (it does not for tests: skip).

## Acceptance mapping
- Autoplay tests get a gesture or skip with a reason on CDP: Steps 2 and 3.
- Blocked-path test keeps working on both: unchanged, Step 5 checks it.
- Pause test and the live stream: already stubbed; Step 5 repeats it.
