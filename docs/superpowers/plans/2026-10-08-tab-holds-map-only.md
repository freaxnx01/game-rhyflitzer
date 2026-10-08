# Tab Holds Only the Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holding Tab shows the big map and never moves the browser focus.

**Architecture:** One line in the global `keydown` handler (`prototype/index.html:1144`): `preventDefault()` for Tab before the `e.repeat` early return.

**Tech Stack:** Vanilla JS, pytest + Playwright (Chromium, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-08-tab-holds-map-only-design.md` (issue #129).

## Global Constraints

- Buildless static game: no new packages (CLAUDE.md).
- The J/O dialog branch (`jumpKey`) and `pauseKey` stay untouched and keep running before the new line.
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 <python> -m pytest …`. Commit and push before long verification.

## Review Focus

1. **Auto-repeat is the bug, not the first press.** Expected: the final `['Space', …, 'Tab']` array already prevents the first keydown; the fix covers repeats. Pinned by Task 1's double `keyboard.down("Tab")`.
2. **Pause menu keeps Tab focus movement.** Expected: `test_pause.py` (Tab moves focus to `pauserestart`) still passes.
3. **Typing in the J dialog.** Expected: unaffected, `jumpKey` returns first. Pinned by the second test.

---

### Task 1: Prevent Tab's default on auto-repeat

**Files:**
- Modify: `prototype/index.html:1144` (keydown handler), `CHANGELOG.md` (`## [Unreleased]` → `### Fixed`, create the subsection if missing), `test-todo.md` (append a section)
- Test: `prototype/tests/test_full_map.py` (append)

**Interfaces:**
- Consumes: `open_hand`, `wait_frames`, `mm` from `prototype/tests/test_full_map.py`; `window.__mm.map()`.

- [ ] **Step 1: Write the failing tests.** Append to `prototype/tests/test_full_map.py`:

```python
def test_held_tab_does_not_move_the_focus(server):
    """#129: auto-repeat keydowns of a held Tab were not prevented, so the browser tabbed through the buttons."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("() => document.activeElement && document.activeElement.blur()")
        page.keyboard.down("Tab")
        page.keyboard.down("Tab")   # second down = auto-repeat keydown (repeat: true)
        page.keyboard.down("Tab")
        page.wait_for_function("() => window.__mm.map().full === true", timeout=120000)
        wait_frames(page)
        focus = page.evaluate("() => document.activeElement.tagName")
        page.keyboard.up("Tab")
        page.wait_for_function("() => window.__mm.map().full === false", timeout=120000)
        b.close()
    assert focus == "BODY"


def test_tab_in_the_jump_dialog_keeps_typing_working(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=120000)
        page.keyboard.type("sis")
        page.keyboard.press("Tab")
        page.keyboard.type("x")
        value = page.evaluate("() => document.querySelector('#jumpq').value")
        b.close()
    assert value.startswith("sis")
```

- [ ] **Step 2: Run the first test, expect FAIL** (focus is a BUTTON/A, not BODY): `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python -m pytest prototype/tests/test_full_map.py -k "held_tab or jump_dialog" -x`. The second test should already pass (it pins existing behaviour).

- [ ] **Step 3: Implement.** In the keydown handler at `prototype/index.html:1144`, directly after `if (pauseKey(e)) return;` and before `if (e.repeat) return;`, insert:

```js
if (e.code === 'Tab') e.preventDefault();   // a held Tab auto-repeats; those keydowns used to reach the browser's focus navigation (#129)
```

- [ ] **Step 4: Run both new tests and the neighbours, expect PASS:** `… -m pytest prototype/tests/test_full_map.py prototype/tests/test_pause.py`.

- [ ] **Step 5: Docs.** CHANGELOG under `## [Unreleased]` → `### Fixed`: „Holding **Tab** now shows only the big map. The browser no longer jumps through the buttons on the page while you hold the key." (write it in English as the file is). Append to `test-todo.md` a section `## Tab holds only the map (#129)` with: `[ ]` hold Tab for several seconds while driving: only the big map shows, no button/link gets a focus ring; `[ ]` J, type a search, Tab: typing still works.

- [ ] **Step 6: Commit** `fix(prototype): held Tab no longer moves the browser focus (#129)`, push, then run the full `prototype/tests/test_full_map.py` and `test_pause.py` once more.
