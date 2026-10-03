# Held J Keeps the Jump Dialog Open — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holding **J** opens the jump dialog and it stays open with an empty search field. A fresh J on an empty field still closes it (#86).

**Architecture:** `jumpKey` in `prototype/index.html` runs before the main `keydown` listener's `if (e.repeat) return` and never reads `e.repeat`. Its close branch keeps calling `preventDefault` (so a repeat types nothing) but only calls `closeJump()` when `!e.repeat`. One condition, one line.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-held-j-jump-dialog-design.md`

## Global Constraints

- Change **only** the close branch of `jumpKey` (`prototype/index.html:1086` on `main` @ `9ba2994`). Do not touch the main `keydown` listener (`:929`), `openJump`, `closeJump`, the arrow or Enter branches.
- Keep `e.code === 'KeyJ' && !$('jumpq').value` as an unchanged subexpression: #18 (autopilot) rewrites exactly that text later.
- Do **not** use the issue's suggested `if (e.repeat && e.code === 'KeyJ') return;`. Without `preventDefault`, each repeat types a `j` into the search field (proven headless: `'jj'`).
- `prototype/index.html`: dense one-line style; match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency.
- Existing tests stay unchanged and green, especially `test_j_types_with_text_and_closes_when_empty_esc_closes` (`prototype/tests/test_jump.py:188`).
- Do not touch `data/` or `pipeline/`.
- Commands (from the repo root): Playwright `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q`. These runs are slow (minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`. Node tests: `node --test prototype/tests/*.test.mjs`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- `preventDefault` must still run on a repeated J with an empty field. Otherwise the field fills with `j`s. The new test asserts `#jumpq` is `''`.
- Playwright: a second `page.keyboard.down("KeyJ")` without an `up` fires `keydown` with `repeat: true` in Chromium (verified during enrichment).

## File Structure

- Modify: `prototype/tests/test_jump.py` — one new test after `test_j_types_with_text_and_closes_when_empty_esc_closes` (`:188-206`).
- Modify: `prototype/index.html` — `jumpKey` close branch (`:1086`).
- Modify: `CHANGELOG.md` — `[Unreleased]` → `### Fixed`.
- Modify: `test-todo.md` — one manual check.

---

### Task 1: Held J keeps the dialog open (test first)

**Files:**
- Modify: `prototype/tests/test_jump.py`
- Modify: `prototype/index.html:1086`

- [ ] **Step 1: Write the failing test**

Insert after `test_j_types_with_text_and_closes_when_empty_esc_closes` in `prototype/tests/test_jump.py`:

```python
@needs_world
def test_holding_j_keeps_the_dialog_open(server):
    # #86: a held key auto-repeats. In Chromium a second keyboard.down() without an up() fires
    # keydown with repeat: true, like the OS does after its repeat delay.
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.down("KeyJ")
        assert page.is_visible("#jump")
        page.keyboard.down("KeyJ")               # 1st auto-repeat: used to close the dialog
        assert page.is_visible("#jump"), "a held J closed the dialog"
        page.keyboard.down("KeyJ")               # 2nd auto-repeat
        assert page.is_visible("#jump")
        assert page.input_value("#jumpq") == "", "a held J typed into the search field"
        page.keyboard.up("KeyJ")
        page.keyboard.press("KeyJ")              # a fresh press on the empty field still closes
        assert page.is_hidden("#jump")
        b.close()
```

- [ ] **Step 2: Run the test and see it fail**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q -k holding_j`
Expected: FAIL with `AssertionError: a held J closed the dialog`.

- [ ] **Step 3: Write the minimal fix**

In `prototype/index.html`, `jumpKey`, replace:

```js
  if (e.code === 'Escape' || (e.code === 'KeyJ' && !$('jumpq').value)) { e.preventDefault(); closeJump(); }
```

with:

```js
  if (e.code === 'Escape' || (e.code === 'KeyJ' && !$('jumpq').value)) { e.preventDefault(); if (!e.repeat) closeJump(); }   // a held key never closes it, and types nothing (#86)
```

- [ ] **Step 4: Commit and push**

```bash
git add prototype/tests/test_jump.py prototype/index.html
git commit -m "fix(prototype): holding J keeps the jump dialog open" -m "jumpKey runs before the keydown repeat guard, so the first auto-repeat closed the dialog. Closes only on a fresh press now; a repeat is still swallowed so no j is typed." -m "Refs #86"
git push
```

- [ ] **Step 5: Run the jump tests and see them pass**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_jump.py -q`
Expected: all PASS (the new test and every existing jump test; skips only for a missing world rebuild, as before).

### Task 2: Changelog and manual check

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `test-todo.md`

- [ ] **Step 1: Add the changelog line**

Under `## [Unreleased]` → `### Fixed` in `CHANGELOG.md`, add as the first bullet:

```markdown
- Holding **J** a moment too long no longer opens the jump menu and shuts it again straight away — it stays open, ready for you to type.
```

- [ ] **Step 2: Add the manual check**

Append to `test-todo.md`:

```markdown
## Held J (#86)

- [ ] On a real keyboard, hold **J** for about a second: the jump menu opens and stays open, the search field stays empty. Let go and press **J** once: it closes.
```

- [ ] **Step 3: Commit and push**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(changelog): held J keeps the jump menu open" -m "Refs #86"
git push
```

### Task 3: Full verification

- [ ] **Step 1: Node tests**

Run: `node --test prototype/tests/*.test.mjs`
Expected: all PASS.

- [ ] **Step 2: Full Playwright suite**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q`
Expected: all PASS (foreground, generous timeout; same skips as on `main`).
