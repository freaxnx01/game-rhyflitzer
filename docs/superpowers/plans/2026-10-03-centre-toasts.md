# Centre Toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toasts appear horizontally centred directly below the checkpoint block (`#tc`) instead of top right, and stay longer: 4 s for key-press toasts, 5 s for game events (water, checkpoint, Holzbrücke) (#75).

**Architecture:** `<div id="toast">` moves into `#tc` as its last child, in normal flow, so `#tc` centres it and it always sits below `#roadname`. `#tc` gets `z-index:1`. `toast(html, secs = TOAST_S.info)` with `TOAST_S = { info: 4, event: 5 }`; the three event callers pass `TOAST_S.event`. A new hook `__mm.toast()` exposes `{ text, shown, left }` for the tests.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-centre-toasts-design.md`

## Global Constraints

- The element keeps the id `toast` and its text stays in `textContent`: existing tests read it (`test_smoke.py`, `test_boundaries.py`, `test_debug.py`, `test_i18n.py`, `test_jump.py`) and must stay **unchanged and green**.
- No new strings, no help text change. Do not touch `prototype/strings.js`.
- The toast's look stays (yellow gradient, ink border, shadow, −3° tilt, 24 px italic caps, opacity fade). Only position, alignment, `max-width` and duration change.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no new dependency. New code must **not** call `rr()` or `rnd()` (the seeded RNG).
- Do not touch `data/` or `pipeline/`, and do not edit `test-todo.md` in this PR (it is edited on `main` directly after the merge).
- Commands (from the repo root): Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_toast.py -q`. These runs are slow (several minutes). Run them in the **foreground only, never `run_in_background`**. Exit 137 means the memory cap was hit: stop and report. Without `systemd-run --user` (CI runner), run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`. Node tests: `node --test prototype/tests/*.test.mjs`.
- `page.screenshot()` times out under the headless swiftshader renderer at large viewports — measure with `getBoundingClientRect()`, do not screenshot.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- **No overlap by construction:** the toast must be a child of `#tc` in normal flow, not `position:fixed` with a hand-picked `top`. A fixed `top` would pass today's test but break as soon as `#tc` gains a line.
- **Event vs key toasts:** exactly three callers pass `TOAST_S.event` — `fishes` (`stepCar`), `cpToast` and `holzToast` (`stepRace`). Everything else uses the default.
- **Existing toast tests unchanged.**

---

## File map

- `prototype/tests/test_toast.py`: new file (Task 1).
- `prototype/index.html`:
  - `#tc` and `#toast` CSS (L18, L27)
  - markup: `#tc` block (L94-101) and the old `#toast` line (L107)
  - `toast()` (L1031) + new `__mm.toast` hook right after it
  - event callers: water (L1003), `stepRace` checkpoint and Holzbrücke (L1034)
- `CHANGELOG.md`: one line under `[Unreleased] → ### Changed` (Task 4).

---

### Task 1: Failing tests

**Files:**
- Create: `prototype/tests/test_toast.py`

- [ ] **Step 1: Write the failing tests**

```python
"""#75: toasts centred below the checkpoint block, 4 s for key presses, 5 s for game events.
Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

RECTS_JS = """() => { const r = id => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
  const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
  return { vw: innerWidth, vh: innerHeight, toast: r('toast'), roadname: r('roadname'), tl: r('tl'), tr: r('tr'), compass: r('compass'), debug: r('debug') }; }"""

VIEWS = {
    "desktop": dict(viewport={"width": 1280, "height": 720}),
    "narrow-window": dict(viewport={"width": 390, "height": 844}),
    "touch-phone": dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True),
}


def start_hand(p, server, query="", **ctx):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(**({"viewport": {"width": 480, "height": 270}} | ctx)).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


@pytest.mark.parametrize("view", list(VIEWS))
def test_key_toast_is_centred_below_the_checkpoint_block(server, view):
    with sync_playwright() as p:
        b, page = start_hand(p, server, "?debug", **VIEWS[view])
        page.keyboard.press("KeyG")                                         # hand layout: "no data" toast
        page.wait_for_function("() => document.querySelector('#toast').classList.contains('show')", timeout=120000)
        page.wait_for_timeout(300)                                          # let the .2s fade-in finish
        r = page.evaluate(RECTS_JS)
        b.close()
    t = r["toast"]
    assert abs((t[0] + t[2]) / 2 - r["vw"] / 2) <= 2, r                  # horizontally centred
    assert t[1] >= r["roadname"][3], r                                   # below the checkpoint block
    assert t[3] <= r["vh"] / 2, r                                        # upper half: the road ahead stays clear
    for name in ("tl", "tr", "compass", "debug"):
        if r[name]:
            assert not overlaps(t, r[name]), (name, r)


def test_key_toast_lasts_four_seconds(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        page.keyboard.press("KeyG")
        shown = page.evaluate("() => window.__mm.toast()")
        b.close()
    assert shown["shown"]
    assert 3.5 < shown["left"] <= 4.0, shown


def test_water_toast_lasts_five_seconds(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server, locale="de-CH")
        page.evaluate("() => window.__mm.place(863.6, -647.7)")          # middle of the hand-traced Rhine
        page.wait_for_function("() => window.__mm.car().splash > 0.6", timeout=180000)
        shown = page.evaluate("() => window.__mm.toast()")
        b.close()
    assert shown["text"] == "Grüss mir die Fische!"
    assert shown["left"] > 4.2, shown                                    # 5 s minus the ~0.3 s since splash 0.35
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_toast.py -q`
Expected: 5 failures — the layout tests on the centre assertion (the toast is at `right:16px`), the two timing tests on `window.__mm.toast is not a function`.

- [ ] **Step 3: Commit**

```bash
git add prototype/tests/test_toast.py
git commit -m "test(hud): pin centred toast position and 4 s / 5 s durations (#75)"
```

### Task 2: Durations and the test hook

**Files:**
- Modify: `prototype/index.html` (L1031 `toast()`, L1003 water, L1034 `stepRace`)

- [ ] **Step 1: Replace `toast()` and add the hook**

Replace line 1031:

```js
let toastT = 0; function toast(html) { $('toast').innerHTML = html; $('toast').classList.add('show'); toastT = 2.6; }
```

with:

```js
const TOAST_S = { info: 4, event: 5 };   // key presses 4 s, game events (water, checkpoint, Holzbrücke) 5 s (#75)
let toastT = 0; function toast(html, secs = TOAST_S.info) { $('toast').innerHTML = html; $('toast').classList.add('show'); toastT = secs; }
window.__mm.toast = () => ({ text: $('toast').textContent, shown: $('toast').classList.contains('show'), left: toastT });
```

- [ ] **Step 2: Mark the three game events**

- L1003 (water): `P.splash >= 0.35) toast(tr('fishes'))` → `P.splash >= 0.35) toast(tr('fishes'), TOAST_S.event)`. Leave the comment on L1002 (`// toast(tr('fishes')): the Midtown Madness homage…`) alone — a blind replace of `toast(tr('fishes'))` hits it too.
- L1034 (`stepRace`): `toast(tr('cpToast', R.done, best.n))` → `toast(tr('cpToast', R.done, best.n), TOAST_S.event)` and `toast(tr('holzToast'))` → `toast(tr('holzToast'), TOAST_S.event)`

Do not change any other `toast(` call. Check with `grep -n "TOAST_S.event" prototype/index.html` → exactly 3 call sites (plus the definition comment line has none).

- [ ] **Step 3: Run the timing tests**

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_toast.py -q -k "lasts"`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add prototype/index.html
git commit -m "feat(hud): show toasts 4 s, game-event toasts 5 s (#75)"
```

### Task 3: Centre the toast below the checkpoint block

**Files:**
- Modify: `prototype/index.html` (CSS L18 and L27, markup L94-101 and L107)

- [ ] **Step 1: CSS**

L18: append `z-index:1;` to `#tc` (so on a landscape phone the toast is drawn over the minimap corner, not under it):

```css
#tc{position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;z-index:1}
```

L27: replace the fixed top-right placement with in-flow centring; everything from `padding` on stays the same except `text-align`:

```css
#toast{margin-top:10px;max-width:calc(100vw - 48px);box-sizing:border-box;padding:8px 18px;background:linear-gradient(#ffe27a,#ffc61a 50%,#ff9a1a);border:4px solid var(--ink);box-shadow:5px 5px 0 var(--ink);transform:rotate(-3deg);color:var(--ink);font-size:24px;font-weight:800;font-style:italic;text-transform:uppercase;line-height:1.05;text-align:center;opacity:0;transition:opacity .2s}
```

- [ ] **Step 2: Markup**

Delete the line `  <div id="toast">Holzbrücke!</div>` (L107) and add it as the last child of `#tc`, after `#roadname`:

```html
    <div id="roadname"></div>
    <div id="toast">Holzbrücke!</div>
  </div>
```

- [ ] **Step 3: Push, then run the whole new file**

```bash
git add prototype/index.html
git commit -m "feat(hud): show toasts centred below the checkpoint arrow (#75)"
git push -u origin HEAD
```

Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_toast.py -q`
Expected: 5 passed. Reference numbers from the design dry run: desktop toast ≈ `[477, 205, 803, 271]`, 390 px window ≈ `[89, 226, 301, 311]`. (This plan was dry-run during enrichment on `a1f63d6` (line numbers since updated for `3208e94`): 5 red before Tasks 2–3, 5 green after, plus the camera/fishes smoke tests green; ~3 min red, ~6.5 min green.)

### Task 4: Changelog and full suite

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Changelog line**

Append under `## [Unreleased]` → `### Changed` (after the last existing bullet of that section):

```markdown
- Messages like "Grüss mir die Fische!" or "Gemeindegrenzen an" now pop up in the middle, right under the checkpoint arrow, and stay longer — 4 seconds, 5 for things that happen to you on the road — so you can read them while driving.
```

- [ ] **Step 2: Full test suite**

Run: `node --test prototype/tests/*.test.mjs`
Run: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q`
Expected: all green except tests already known flaky on `main` (#64 `test_rebuilds_free_gpu_memory`); re-run a red test against `main` before blaming this change.

- [ ] **Step 3: Commit and push**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): centred, longer toasts (#75)"
git push
```

- [ ] **Step 4: PR body note for the manual check**

Mention in the PR body (for `test-todo.md` after the merge): drive on desktop and on a phone, toggle **G**, **C**, **M**, drive into the Rhine and through a checkpoint; the toast reads well below the arrow and does not hide the road ahead.
