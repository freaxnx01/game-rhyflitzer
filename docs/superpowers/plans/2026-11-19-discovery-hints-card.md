# Discovery hints, part b (card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The in-game hint card: tappable, × and "no more hints", ~20 s, never over an overlay.

**Architecture:** New `#hintcard`, separate from `#toast`. Logic stays in `hints.js` (part a); `index.html` gathers the frame's facts, calls `pickHint`, renders, and routes the tap through `pressKey` (index.html:4663) or a click on `touchSel`.

**Spec:** `docs/superpowers/specs/2026-11-19-discovery-hints-design.md` (#1090). **Needs** part a (`…-discovery-hints-core.md`) merged.

## Global Constraints

- Buildless; no new deps. Uses part a's `hints.js` exports and glue (`HINTS_S`, `saveHintStore()`, `setHintsOn(on)`, `__mm.hints`) as is.
- Touch = the existing `TUT_COARSE` (index.html:6051).
- New strings en + de: `hintTapCap` "Tap"/"Tippen", `hintOff` "no more hints"/"keine Hinweise mehr", `hintCloseAria` "Close hint"/"Hinweis schliessen". The hint texts themselves came with part a.
- One German CHANGELOG entry under `[Unreleased]` › `Added`, stamp `TZ=Europe/Zurich date '+%F %H:%M'`, 1–3 bold words.
- Targeted tests only (`pytest tests/test_hints.py -x`, foreground). Commit and push before running them.

## Review Focus

Overlay opens over a card (hide, freeze timer); the tap opens a dialog (card already ended); key pressed instead of tap (acted); switched off while shown; phone card covering buttons or `#map`. All in `tests/test_hints.py`.

---

### Task 1: The card and its glue

**Files:**
- Modify: `index.html` (markup by `#toast` :499; glue after `stepKeybar` :5245; `stepHints(dt)` after `stepKeybar()` in `frame()` :8308; `hintEvent(sess, 'footOut')` in `getOut()` :5333), `strings.js`, `CHANGELOG.md`
- Create: `tests/test_hints.py`

**Interfaces (Produces, in `index.html`):**
```js
const HINT_CARD = { hint: null, t: 0, sess: newHintSession(), near: [], nearT: 0 };
function hintsBlocked()        // any of: PAUSE.on, #overlay, CARSEL, SETTINGS, WORLDS, ABOUT, TTV, BORDERINFO, netOpen(),
                               // #jump, #help, #result shown, keys.Tab (full map), R.state === 'ready'
function hintNear()            // -> id[] from HINT_SPOTS, recomputed every 0.25 s into HINT_CARD.near
function stepHints(dt)         // tick, hide/time out the card, or pick and show the next one
function showHint(hint)
function endHint(how)          // 'acted'|'closed'|'timeout': hintStoreAfter + saveHintStore + hintSessionAfter; hide
function tapHint()             // endHint('acted') FIRST, then pressKey(cmd) or $(sel).click(); no action -> endHint('closed')
window.__mm.hintsStep = (secs, extra = {}) => { /* adds extra.cruiseS to the session, runs stepHints(secs), returns __mm.hints() */ };
window.__mm.hintsSeen = (ids) => { /* marks ids { shown: 1, seen: true } in HINTS_S.store, saveHintStore() */ };
// __mm.hints() gains: card: HINT_CARD.hint?.id ?? null, t: HINT_CARD.t
```

`stepHints(dt)`:
1. `HINT_CARD.sess = hintTick(sess, dt, { cruising: R.mode === 'cruise' && !NET.race && !hintsBlocked(), near })`.
2. Card up and (`!HINTS_S.on`) → hide it, `hint = null`, no store change (the off switch is not "seen").
3. Card up and `hintsBlocked()` → `#hintcard` hidden, timer frozen. Otherwise `t += dt`; `t >= HINT_CFG.stayS` → `endHint('timeout')`.
4. No card, `HINTS_S.on`, not blocked → `pickHint(HINTS_S.store, sess, ctx)` with `ctx = { mode: R.mode, multiplayer: !!NET.race, coarse: TUT_COARSE, region: REGION.generated ? null : REGION.id, hideoutFound: !!HIDE?.found, near: HINT_CARD.near, playTime: HINTS_S.play }`.

`HINT_SPOTS` (id → predicate; radii are defaults, builder may tune):
- `loco`: `FOOT.on && !TRAIN.on && TRAIN.mesh` within 20 m of `TRAIN.mesh.position`
- `postauto`: `!!stopNear()` (index.html:7618) · `depot`: within `DEPOT.near` of `DEPOT.x/z` (depot.js:9)
- `pontoon`: `!FOOT.on && !FLY.on && atRhineBank(pontoonEnv(), P.x, P.z)`
- `plattform`: `PLAT` and within 40 m of `PLAT.frame.x/z` · `holz`: `onBridge(P.x, P.z, P.y)?.b.kind === 'wood'`
- `crash`: `inYard(P.x, P.z, 15)` · `ostriches`: `inPaddock(P.x, P.z, 30)`
- `bodenacker`: `HUD.enter?.entry.id === 'bodenackerstrasse-6c'`
- `ferris`: `rideNow().do === 'board'` · `freight`: `!$('freightpad').hidden`

Acted by key: one `addEventListener('keydown', e => { if (HINT_CARD.hint?.keys.includes(e.code)) endHint('acted'); })`, registered **before** the main keydown chain (index.html:4655) so a key that opens a dialog still counts. `endHint` returns at once when no card is up.

Markup: `#hintcard[hidden][role=status]` > `.hc-icon`, `.hc-text`, `kbd.hc-key`, `button.hc-close` (×), `button.hc-off`. Whole card clickable (`tapHint`); `.hc-close` → `endHint('closed')`; `.hc-off` → `setHintsOn(false)`, hide, `renderSettings()`; both `stopPropagation()`. On touch `.hc-key` shows `tr('hintTapCap')`; a statement shows no key. Desktop: top centre below `#keybar`; touch: above the touch buttons. Looks like `#keybar`. Re-render on `gg-langchange`.

- [ ] **Step 1: Write the failing tests** `tests/test_hints.py`:

```python
"""#1090: the discovery hint card. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 240000
HINTS = "() => window.__mm.hints()"


def cruise(p, server, touch=False):
    b = p.chromium.launch(args=ARGS)
    view = {"width": 390, "height": 844} if touch else {"width": 1280, "height": 720}
    page = b.new_context(viewport=view, has_touch=touch, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    for r in ("**/data/terrain_*.mmh", "**/data/world_hochrhein.json"):
        page.route(r, lambda x: x.fulfill(status=404, body=""))
    page.add_init_script("localStorage.setItem('mm.tutorialDone', '1')")
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hintsStep && document.querySelector('#worldstatus')?.textContent", timeout=T)
    (page.tap if touch else page.click)("#cruisebtn", timeout=T)
    page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
    return b, page, errors


def first_card(page):
    return page.evaluate("() => window.__mm.hintsStep(0.1, { cruiseS: 1000 })")


def test_heli_card_shows_with_its_key_and_times_out_unseen(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        h = first_card(page)
        key = page.inner_text("#hintcard .hc-key"); shown = page.is_visible("#hintcard")
        page.keyboard.press("Escape")                                  # pause: card hides, timer frozen
        paused = page.evaluate("() => [window.__mm.hintsStep(30), document.getElementById('hintcard').hidden]")
        page.keyboard.press("Escape")
        out = page.evaluate("() => window.__mm.hintsStep(21)")
        b.close()
    assert h["card"] == "heli" and shown and key == "F", h
    assert paused[0]["card"] == "heli" and paused[1] is True, paused
    assert out["card"] is None and out["store"]["heli"] == {"shown": 1, "seen": False}, out
    assert errors == []


def test_tap_runs_the_action_and_marks_it_seen(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        page.evaluate("() => window.__mm.hintsSeen(['heli'])")
        h = first_card(page)
        page.click("#hintcard .hc-text")
        after = page.evaluate("() => [window.__mm.hints(), !document.getElementById('jump').hidden, document.getElementById('hintcard').hidden]")
        b.close()
    assert h["card"] == "jumpTo", h
    assert after[0]["card"] is None and after[0]["store"]["jumpTo"]["seen"] is True, after
    assert after[1] is True and after[2] is True, after                # J's jump list is open, the card is not over it
    assert errors == []


def test_close_marks_seen_and_the_key_counts_as_acted(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        first_card(page); page.click("#hintcard .hc-close")
        closed = page.evaluate(HINTS)
        h = page.evaluate("() => window.__mm.hintsStep(200)")         # past the 2-3 min pace
        page.keyboard.press("KeyJ")
        keyed = page.evaluate(HINTS)
        b.close()
    assert closed["card"] is None and closed["store"]["heli"]["seen"] is True, closed
    assert h["card"] == "jumpTo" and keyed["store"]["jumpTo"]["seen"] is True, (h, keyed)
    assert errors == []


def test_no_more_hints_switches_them_off(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server)
        first_card(page); page.click("#hintcard .hc-off")
        off = page.evaluate("() => [window.__mm.hints(), localStorage.getItem('mm.hintsOn')]")
        again = page.evaluate("() => window.__mm.hintsStep(300)")
        b.close()
    assert off[0]["on"] is False and off[1] == "0" and off[0]["card"] is None and "heli" not in off[0]["store"], off
    assert again["card"] is None
    assert errors == []


def test_phone_skips_heli_says_tap_and_covers_no_button(server):
    with sync_playwright() as p:
        b, page, errors = cruise(p, server, touch=True)
        h = first_card(page)
        cap = page.inner_text("#hintcard .hc-key")
        boxes = page.evaluate("""() => Object.fromEntries(['#hintcard', '#tE', '#tMenu', '#radiobtn', '#pausebtn', '#map']
            .map(s => [s, document.querySelector(s)]).filter(([, e]) => e && getComputedStyle(e).display !== 'none' && e.offsetWidth)
            .map(([s, e]) => { const r = e.getBoundingClientRect(); return [s, [r.left, r.top, r.right, r.bottom]]; }))""")
        b.close()
    assert h["card"] == "jumpTo" and cap == "Tap", (h, cap)
    c = boxes.pop("#hintcard")
    for k, o in boxes.items():
        assert c[2] <= o[0] or o[2] <= c[0] or c[3] <= o[1] or o[3] <= c[1], (k, c, o)
    assert errors == []
```

- [ ] **Step 2:** `pytest tests/test_hints.py -x` → FAIL. **Step 3:** implement.
- [ ] **Step 4:** CHANGELOG, e.g. „Ab und zu ein **Hinweis**, was das Spiel noch kann; ein **Tipp** darauf führt es aus, × schliesst ihn. Abschalten unter **Einstellungen › Anzeige**.“
- [ ] **Step 5:** Commit `feat(hints): the discovery hint card (#1090)` and push the branch.
- [ ] **Step 6:** `pytest tests/test_hints.py -x` and `pytest tests/test_settings.py -k hints -x` (foreground) → PASS. Fix the implementation, never the tests; commit and push again.
