# Phone HUD overlaps (#776) Implementation Plan

**Goal:** On a 390x844 touch phone, in cruise and in the time trial, nothing in the driving HUD overlaps the map, the
speedometer or another plate; the footer and the style button are not shown while driving.

**Architecture:** CSS only, in `index.html`. Spec: `docs/superpowers/specs/2026-11-09-phone-hud-overlaps-design.md`.

## Global Constraints

- Anchor every edit on the **code text** quoted below, not on line numbers: PR#774 (#735, car radio) edits `index.html` too and adds
  `#radiobtn` / `#radiopanel` near `#pausebtn`. Do not move or cover them; keep the right column under `#pausebtn` free.
- Do NOT do #773's work (no new settings panel, no moving the style button into pause). Do not touch markup or JS.
- No framework, bundler or package.json. Not a dc-tool game, so `index.html` is edited directly.
- Run the Playwright file in the **foreground**, never `run_in_background`; commit and push the branch **before** running it.
  Run only this one file (not the ~2 h suite):
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_phone_hud.py -x -q`
- Touch phone context: `has_touch=True`, **no** `is_mobile` (no viewport meta, see `tests/test_pause.py` `open_page`).

## Task 1: Failing Playwright test

**Files:** create `tests/test_phone_hud.py`.

- [ ] **Step 1: Write the failing test.** Follow `tests/test_pause.py` (`ARGS`, `READY`, `MMH_ROUTE` blocked, `T`) and the rect helper style of
  `tests/test_navi.py` (`RECTS_JS`). Full file:

```python
"""#776: on a 390x844 touch phone nothing in the driving HUD overlaps the map, the speedometer or another plate,
in cruise and in the time trial; the footer and the style button are not shown while driving.
Slow (Playwright): run in the foreground."""
from itertools import combinations

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 120000

# every HUD box that can be on screen while driving; invisible ones (display:none, hidden, zero size) are skipped
RECTS_JS = """() => {
  const box = (name, e) => {
    if (!e || e.hidden) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0 ? [name, b.left, b.top, b.right, b.bottom] : null;
  };
  const byId = id => document.getElementById(id);
  const out = ['tl', 'tr', 'compass', 'bl', 'br', 'pausebtn', 'stylebtn', 'game-nav', 'radiobtn', 'radiopanel']
    .map(id => box(id, byId(id)));
  for (const c of byId('tc').children) if (c.id !== 'toast' && c.id !== 'blink') out.push(box('tc>' + (c.id || c.tagName), c));
  for (const b of byId('touch').querySelectorAll('button')) out.push(box('touch>' + b.id, b));
  return out.filter(Boolean);
}"""


def open_phone(p, server):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, locale="de-CH")
    page = ctx.new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page


def intersect(a, b):
    return a[1] < b[3] and b[1] < a[3] and a[2] < b[4] and b[2] < a[4]


def overlaps(page):
    boxes = page.evaluate(RECTS_JS)
    return [(a[0], b[0]) for a, b in combinations(boxes, 2) if intersect(a, b)], {x[0] for x in boxes}


def start(page, button):
    page.click(button)
    page.wait_for_function("() => ['armed', 'racing'].includes(window.__mm.pause().state)", timeout=T)
    page.wait_for_function("() => window.__mm.pause().frame >= 5", timeout=T)


def test_cruise_phone_hud_nothing_overlaps(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        start(page, "#cruisebtn")
        hits, shown = overlaps(page)
        assert hits == []
        assert "game-nav" not in shown and "stylebtn" not in shown
        b.close()


def test_time_trial_phone_hud_nothing_overlaps(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        start(page, "#startbtn")
        hits, shown = overlaps(page)
        assert hits == []
        assert {"tl", "tr", "tc>arrow", "tc>dist", "tc>cpname"} <= shown     # the trial header really is on screen
        assert "game-nav" not in shown and "stylebtn" not in shown
        b.close()


def test_time_trial_phone_hud_long_names_still_clear(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        start(page, "#startbtn")
        page.evaluate("""() => { document.getElementById('cpname').textContent = 'CHECKPOINT 5 · BAHNHOF BAD SÄCKINGEN';
          document.getElementById('modetext').textContent = 'ZEITFAHREN · HOCHRHEIN'; document.getElementById('best').textContent = 'Bestzeit 12:34.5';
          document.getElementById('dist').textContent = '12.8 km'; }""")
        hits, _ = overlaps(page)
        assert hits == []
        b.close()


def test_start_screen_keeps_footer_hidden_and_desktop_unchanged(server):
    with sync_playwright() as p:
        b, page = open_phone(p, server)
        assert page.evaluate("() => getComputedStyle(document.getElementById('game-nav')).display") == "none"   # start dialog: already so
        b.close()
```

  Check the hook names (`window.__mm.pause().state` / `.frame`) against `pause.js` / `tests/test_pause.py` (`wait_frames`) before relying on them; if
  `state` is `'armed'` only after the first frame, keep the second wait. The fixture `server` comes from `tests/conftest.py`.
- [ ] **Step 2: Run it and expect red** (foreground, capped, see Global Constraints): the cruise test fails on `game-nav`/`stylebtn`
  overlapping `br`/`bl`, the trial tests on `tl` vs `tc>arrow`/`tr`. If a pair outside the issue's three (for instance `touch>...` vs `bl`) is
  reported, stop and report it instead of "fixing" the test.
- [ ] **Step 3: Commit** `test(hud): phone HUD overlap check at 390x844 (#776)`; push the branch.

## Task 2: CSS fixes

**Files:** modify `index.html` (CSS only).

- [ ] **Step 1: Footer.** In the `<style>` block directly above `<nav id="game-nav"`, after the line starting
  `@media (max-width: 600px) { body:has(#overlay:not([hidden])) #game-nav,` add:

```css
  /* #776: on a phone the footer is for dialogs only; while driving it lies over the minimap and the speedometer */
  @media (max-width: 600px) { body:not(:has(:is(#overlay,#worlds,#about,#carsel,#pause,#abandon):not([hidden]))) #game-nav { display: none !important; } }
```

  Leave the existing rule as it is.
- [ ] **Step 2: Style button.** Right after the line `#stylebtn b{color:var(--sun)}` add:

```css
@media (pointer:coarse){#stylebtn{display:none}}   /* #776: T is a key; on a phone the button lay over the minimap and the speedo (#773 moves it into pause) */
```

- [ ] **Step 3: Time-trial header.** Right after the line starting
  `@media (max-width:900px){#speedo{width:130px;height:130px}#map{width:240px;height:120px}` add:

```css
/* #776: on a phone the two plates share the width between the gutters, and the arrow row sits under them */
@media (max-width:600px){
  #tl{min-width:0;max-width:calc(100vw - 32px - 8px - 140px)}
  #tl .mode{font-size:13px;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tr{min-width:0;max-width:140px}#best{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tc{top:calc(124px + var(--mirror-drop,0px) + env(safe-area-inset-top,0px))}
  #cpname{max-width:calc(100vw - 132px);text-align:center}
}
```

  The `#tc{...}` base rule is earlier in the file, so this later same-specificity rule wins. If the test still reports `tc>*` vs `tl`/`tr`
  (a taller plate than 110 px), raise the 124 px; if `tr` vs `tl`, adjust the 140 px pair (A6) so both formulas still add to 358 px minus 8.
- [ ] **Step 2b: Run `tests/test_phone_hud.py`** (foreground, capped) until green. Then run `tests/test_navi.py -k desktop` only if the
  diff touched `#navi` (it does not; skip otherwise).
- [ ] **Step 3: Commit** `fix(hud): footer, style button and arrow no longer overlap on phones (#776)`.

## Task 3: CHANGELOG

**Files:** modify `CHANGELOG.md`.

- [ ] **Step 1:** Under `## [Unreleased]` > `### Fixed`, add as the **first** entry (newest first; run `TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'` for the stamp),
  with a blank line before and after, in this player voice:

```markdown
- `YYYY-MM-DD HH:MM` On a **phone**, the **footer** ("More Games…", "Source", "Feedback", language), the **style button** and the **arrow with the distance** no longer lie over the **map**, the **speedometer** and the **time-trial plate**. While driving the footer is hidden; the style button is hidden on touch for now (the T key still works).
```

  Do not regenerate the file with git-cliff. Match the existing blank-line style between entries in `### Fixed`.
- [ ] **Step 2: Commit** `docs(changelog): phone HUD overlaps (#776)`.

## Self-review

- Spec coverage: footer (T2.1), style button (T2.2), arrow/distance row and plate overlap (T2.3), Playwright bounding-box check in cruise and time trial (T1), CHANGELOG (T3). No node test: the change is pure CSS, and a node test would only grep the CSS text.
- Out of scope, do not touch: #773 (declutter), `#radiobtn` (#735), landscape phones, `#debug`, `#navi`.
