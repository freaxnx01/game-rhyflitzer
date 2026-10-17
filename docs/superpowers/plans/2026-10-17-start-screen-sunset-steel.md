# Start screen "Sunset Steel" (#346) Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-17-start-screen-sunset-steel-design.md`. Design: `docs/design/start-screen/wireframe.md` and `flow.md` (approved, do not re-open). Buildless game (stack: browser-game): node tests for the pure helpers, ONE new Playwright file, targeted existing files.

**Goal:** rebuild `#overlay` as the full-bleed "Sunset Steel" start screen (tags, logo + edition plate, sticker, one mode-text slot, steel bar with 4 + 4 buttons, footer), move region/worlds/file controls into a new `#worlds` dialog, and keep every existing id, handler and test contract working.

**Architecture:** markup + CSS + handlers in `prototype/index.html`; strings in `prototype/strings.js`; pure helpers in a new `prototype/startscreen.js` (node-tested); one new Playwright file `prototype/tests/test_start_screen.py`; surgical edits to the existing tests whose assertions encode the old layout.

**Global constraints:**

- Surgical edits only. Do not touch `#carsel`, `#pause`, `#abandon`, `#help`, `#jump`, the HUD, or the game loop beyond the lines named here.
- Keep every existing element id. Before renaming or deleting anything, `grep -n "<id>" prototype/tests/*.py prototype/index.html prototype/*.js`.
- Run Playwright **in the foreground**, **one file per call**, never the whole suite, always through the memory cap:
  `direnv exec /home/freax/repos/github/freaxnx01/public systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/<file> -x -q` (timeout 600000).
- Commit and push the branch **before** the first Playwright run.
- Do not run concurrently with #202 (also edits `index.html` and `strings.js`).
- No framework, no bundler, no new dependency. `textContent` for every world/region name (they are data).

## Files

- Create: `prototype/startscreen.js`, `prototype/tests/startscreen.test.mjs`, `prototype/tests/test_start_screen.py`
- Modify: `prototype/index.html` (markup lines 262–306, CSS lines 81–109 + new rules, JS at 2143, 2569, 2592–2604, 2637, 2691–2744, 2928–2943)
- Modify: `prototype/strings.js` (19 new keys in `en` and `de`, `en.retry`)
- Modify: `prototype/tests/test-map.json` (one entry), `prototype/tests/test_carselect.py`, `test_region.py`, `test_gallery.py`, `test_world.py`, `test_blitz.py`, `test_hunt.py`, `test_i18n.py`, `test_xss.py`
- Modify: `CHANGELOG.md` (player-facing entries under `[Unreleased]`)

## Task 1: pure helpers (TDD, node)

- [ ] Step 1: write `prototype/tests/startscreen.test.mjs`:

```js
// #346: pure helpers of the start screen and the Worlds dialog. No DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, lastModeFrom, modeTextKey, editionText, worldsKeyAction, bestKeyFor } from '../startscreen.js';

const key = (code) => ({ code, repeat: false });

test('MODES are the three race modes in bar order', () => {
  assert.deepEqual(MODES, ['trial', 'blitz', 'hunt']);
});

test('lastModeFrom: a stored mode wins, junk falls back to trial, a raceless world is always hunt', () => {
  assert.equal(lastModeFrom('blitz', false), 'blitz');
  assert.equal(lastModeFrom(null, false), 'trial');
  assert.equal(lastModeFrom('<img onerror=1>', false), 'trial');
  assert.equal(lastModeFrom('blitz', true), 'hunt');
});

test('modeTextKey: trial uses the region intro, blitz and hunt their own intro', () => {
  const strings = { intro: 'introEhrendingen' };
  assert.equal(modeTextKey('trial', strings), 'introEhrendingen');
  assert.equal(modeTextKey('blitz', strings), 'blitzIntro');
  assert.equal(modeTextKey('hunt', strings), 'huntIntro');
});

test('editionText: built-in regions get the Edition suffix, generated worlds their plain name', () => {
  const tr = (k, n) => (k === 'edition' ? `${n} Edition` : k);
  assert.equal(editionText({ name: 'Hochrhein' }, tr), 'Hochrhein Edition');
  assert.equal(editionText({ name: 'Testdorf', generated: true }, tr), 'Testdorf');
});

test('worldsKeyAction: Esc backs out, arrows move rows only while on a row, Tab/Enter/Space pass, game keys are ignored', () => {
  assert.equal(worldsKeyAction(key('Escape'), true), 'back');
  assert.equal(worldsKeyAction(key('ArrowDown'), true), 'next');
  assert.equal(worldsKeyAction(key('ArrowUp'), true), 'prev');
  assert.equal(worldsKeyAction(key('ArrowDown'), false), 'ignore');
  for (const c of ['Tab', 'Enter', 'NumpadEnter', 'Space']) assert.equal(worldsKeyAction(key(c), true), 'pass');
  for (const c of ['KeyT', 'KeyC', 'KeyJ', 'F1', 'KeyR']) assert.equal(worldsKeyAction(key(c), true), 'ignore');
});

test('bestKeyFor: regions use their bestKey, worlds the generated key', () => {
  const regions = { hochrhein: { bestKey: 'mm.best2' }, ehrendingen: { bestKey: 'mm.best2.ehrendingen' } };
  assert.equal(bestKeyFor({ kind: 'region', id: 'ehrendingen' }, regions), 'mm.best2.ehrendingen');
  assert.equal(bestKeyFor({ kind: 'world', id: 'abc123' }, regions), 'mm.best2.world.abc123');
});
```

- [ ] Step 2: `node --test prototype/tests/startscreen.test.mjs` — expected: fails (module missing).
- [ ] Step 3: write `prototype/startscreen.js`:

```js
// startscreen.js (#346): pure helpers of the start screen and the Worlds dialog. No DOM, no three.js, so node --test imports it.

export const MODES = ['trial', 'blitz', 'hunt'];

// the mode the slot shows when nothing is focused: the last played one (localStorage mm.lastMode), validated
export function lastModeFrom(stored, raceless) {
  if (raceless) return 'hunt';
  return MODES.includes(stored) ? stored : 'trial';
}

export function modeTextKey(mode, regionStrings) {
  if (mode === 'blitz') return 'blitzIntro';
  if (mode === 'hunt') return 'huntIntro';
  return regionStrings.intro;
}

// "Hochrhein Edition" for the two built-in regions; a generated world has an arbitrary name and gets it plain
export function editionText(region, tr) {
  return region.generated ? region.name : tr('edition', region.name);
}

// like carselKeyAction (carselect.js): the dialog owns the keyboard while it is open
export function worldsKeyAction(e, onRow) {
  if (e.code === 'Escape') return 'back';
  if (onRow && e.code === 'ArrowDown') return 'next';
  if (onRow && e.code === 'ArrowUp') return 'prev';
  if (e.code === 'Tab' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') return 'pass';
  return 'ignore';
}

// the localStorage key of a selection's best time, as regions.js derives it (generatedRegion: mm.best2.world.<id>)
export function bestKeyFor(sel, regions) {
  return sel.kind === 'region' ? regions[sel.id].bestKey : `mm.best2.world.${sel.id}`;
}
```

- [ ] Step 4: `node --test prototype/tests/startscreen.test.mjs` — expected: 6 pass.
- [ ] Step 5: add to `prototype/tests/test-map.json`: `"prototype/startscreen.js": ["test_start_screen.py"],` (keep it valid JSON; `node --test prototype/tests/*.test.mjs` includes the select_tests self-check? No — `python3 -m pytest prototype/tests/test_select_tests.py -q` is the pure check for the map; run it).

## Task 2: strings

- [ ] Step 1: in `prototype/strings.js`, `en` block (near `sub`/`region` at lines 10–11 and the hunt/blitz keys), add:

```js
  edition: (n) => `${n} Edition`,
  worldBtn: (n) => `World: ${n} ▸`,
  carTag: (n) => `Car: ${n}`,
  huntIntro: 'Five presents hide somewhere in the world, somewhere new every time. Follow the arrow, find them all, beat your time.',
  stickerHochrhein: 'Bridge is for pedestrians. We checked. Still jumping.',
  stickerEhrendingen: 'Wanderweg is for hikers. We checked. Still drifting.',
  worldsTitle: 'Worlds',
  worldsSub: 'Choose where to drive',
  driveHere: 'Drive here ›',
  filesTitle: 'Files',
  worldsEmpty: 'No worlds built yet. Worlds you build keep 30 days after the last drive.',
  wpBest: (t) => `Best: ${t}`,
  wpSource: (n) => `${n} · OpenStreetMap + swisstopo`,
  removeAsk: 'Really remove?',
  removeYes: 'Yes',
  removeNo: 'No',
  tutorial: 'Tutorial',
  whatsNew: "What's new",
  credits: 'Credits',
```

  and change `retry: 'Retry'` to `retry: 'Again'` (en only).

- [ ] Step 2: `de` block, same keys:

```js
  edition: (n) => `${n}-Edition`,
  worldBtn: (n) => `Welt: ${n} ▸`,
  carTag: (n) => `Auto: ${n}`,
  huntIntro: 'Fünf Geschenke verstecken sich irgendwo in der Welt, jedes Mal woanders. Folge dem Pfeil, finde alle, schlag Deine Zeit.',
  stickerHochrhein: 'Die Brücke ist für Fussgänger. Haben wir geprüft. Springen trotzdem.',
  stickerEhrendingen: 'Der Wanderweg ist für Wanderer. Haben wir geprüft. Driften trotzdem.',
  worldsTitle: 'Welten',
  worldsSub: 'Wähle, wo Du fährst',
  driveHere: 'Hier fahren ›',
  filesTitle: 'Dateien',
  worldsEmpty: 'Noch keine Welten gebaut. Gebaute Welten bleiben 30 Tage nach der letzten Fahrt erhalten.',
  wpBest: (t) => `Bestzeit: ${t}`,
  wpSource: (n) => `${n} · OpenStreetMap + swisstopo`,
  removeAsk: 'Wirklich entfernen?',
  removeYes: 'Ja',
  removeNo: 'Nein',
  tutorial: 'Tutorial',
  whatsNew: 'Neu',
  credits: 'Credits',
```

- [ ] Step 3: `node --test prototype/tests/strings.test.mjs` — expected: pass (same keys, same arity, no ß).

## Task 3: the failing browser test

- [ ] Step 1: create `prototype/tests/test_start_screen.py`. It boots like `test_region.py` (copy `ARGS`, the terrain 404 route and the `READY` wait from there; do not import across test files):

```python
"""#346: the Sunset Steel start screen and the Worlds dialog. One file, fast: no race is driven except via finishNow."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
T = 240000
BAR = ["startbtn", "blitzbtn", "huntbtn", "carbtn"]
SECONDARY = ["worldbtn", "stylebtn2", "tutorialbtn", "newsbtn"]


def boot(p, viewport=(1280, 720), touch=False, lang="en-US"):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, has_touch=touch, locale=lang)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto("http://localhost:8000/prototype/index.html")   # replace with the `server` fixture URL as the other files do
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def ids(page, sel):
    return page.evaluate(f"() => [...document.querySelectorAll('{sel}')].map(e => e.id)")


def test_bar_order_focus_order_and_enter_starts(server):
    with sync_playwright() as p:
        b, page, errors = boot(p)
        bar = ids(page, "#overlay .bar .row:not(.secondary) > button")
        secondary = ids(page, "#overlay .bar .row.secondary > button")
        hidden = page.evaluate("() => ['tutorialbtn', 'newsbtn', 'creditsbtn'].map(i => document.getElementById(i).hidden)")
        first = page.evaluate("() => document.activeElement.id")
        order = []
        for _ in range(6):
            page.keyboard.press("Tab")
            order.append(page.evaluate("() => document.activeElement.id"))
        page.focus("#startbtn")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        b.close()
    assert bar == BAR and secondary == SECONDARY and hidden == [True, True, True]
    assert first == "startbtn"
    assert order[:5] == ["blitzbtn", "huntbtn", "carbtn", "worldbtn", "stylebtn2"] and order[5] not in BAR + SECONDARY   # 6th Tab leaves the bar (nav)
    assert errors == []


def test_mode_text_follows_focus_and_remembers_the_last_mode(server):
    with sync_playwright() as p:
        b, page, errors = boot(p)
        trial = page.text_content("#ovtext")
        page.hover("#blitzbtn"); blitz = page.text_content("#ovtext")
        page.mouse.move(5, 5); back = page.text_content("#ovtext")
        page.focus("#huntbtn"); hunt = page.text_content("#ovtext")
        page.focus("#carbtn"); after_car = page.text_content("#ovtext")
        live = page.get_attribute("#ovtext", "aria-live")
        page.click("#blitzbtn", no_wait_after=True)
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        stored = page.evaluate("() => localStorage.getItem('mm.lastMode')")
        page.reload(); page.wait_for_function(READY, timeout=T)
        page.evaluate("() => document.activeElement.blur()")
        default = page.evaluate("() => window.__mm.startScreen()")
        b.close()
    assert "90 seconds" in blitz and back == trial and "presents" in hunt and after_car == hunt   # 4 CAR leaves the text alone
    assert live == "polite" and stored == "blitz" and default["mode"] == "blitz" and "90 seconds" in default["text"]
    assert errors == []


def test_result_view_sits_in_the_slot_and_start_reads_again(server):
    with sync_playwright() as p:
        b, page, errors = boot(p)
        page.click("#startbtn"); page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        got = page.evaluate("""() => ({
            inSlot: !!document.querySelector('#overlay .slot #result') && !document.querySelector('#result').hidden,
            start: document.querySelector('#startbtn').textContent, blitz: document.querySelector('#blitzbtn').textContent,
            hud: getComputedStyle(document.getElementById('tl')).display })""")
        b.close()
    assert got["inSlot"] and got["start"] == "Again" and got["blitz"] == "Blitz" and got["hud"] == "none"
    assert errors == []


def test_worlds_dialog_selects_then_drives_and_esc_returns_focus(server):
    with sync_playwright() as p:
        b, page, errors = boot(p)
        page.click("#worldbtn")
        opened = page.evaluate("""() => ({ dialog: !document.querySelector('#worlds').hidden, overlay: document.querySelector('#overlay').hidden,
            role: document.querySelector('#worlds').getAttribute('role'), modal: document.querySelector('#worlds').getAttribute('aria-modal'),
            pressed: document.querySelector('#region-hochrhein').getAttribute('aria-pressed'), name: document.querySelector('#wpname').textContent,
            tabs: ['region-hochrhein', 'region-ehrendingen'].map(i => document.getElementById(i).tabIndex) })""")
        page.focus("#region-hochrhein"); page.keyboard.press("ArrowDown")
        moved = page.evaluate("""() => ({ focus: document.activeElement.id, sel: window.__mm.startScreen().sel,
            pressed: [document.querySelector('#region-hochrhein').getAttribute('aria-pressed'), document.querySelector('#region-ehrendingen').getAttribute('aria-pressed')],
            name: document.querySelector('#wpname').textContent, url: location.search })""")
        page.keyboard.press("Escape")
        closed = page.evaluate("() => ({ dialog: document.querySelector('#worlds').hidden, overlay: document.querySelector('#overlay').hidden, focus: document.activeElement.id })")
        page.click("#worldbtn"); page.click("#region-ehrendingen")
        page.click("#drivebtn", no_wait_after=True)
        page.wait_for_function("() => location.search.includes('region=ehrendingen')", timeout=T)
        b.close()
    assert opened == {"dialog": True, "overlay": True, "role": "dialog", "modal": "true", "pressed": "true", "name": "Hochrhein", "tabs": [0, -1]}
    assert moved["focus"] == "region-ehrendingen" and moved["sel"] == {"kind": "region", "id": "ehrendingen"} and moved["pressed"] == ["false", "true"]
    assert moved["name"] == "Ehrendingen" and moved["url"] == ""   # selecting never reloads
    assert closed == {"dialog": True, "overlay": False, "focus": "worldbtn"}
    assert errors == []


def test_phone_layout_and_screenshots(server, tmp_path):
    with sync_playwright() as p:
        b, page, errors = boot(p, viewport=(390, 844), touch=True)
        got = page.evaluate("""() => { const r = (i) => document.getElementById(i).getBoundingClientRect();
            const s = r('startbtn'), bl = r('blitzbtn'), h = r('huntbtn'), w = r('worldbtn'), bar = document.querySelector('#overlay .bar').getBoundingClientRect();
            return { sameRow: Math.abs(s.top - bl.top) < 2, below: h.top > s.bottom, worldFull: w.width > innerWidth * 0.8,
                     barInside: bar.bottom <= innerHeight + 1, noHScroll: document.documentElement.scrollWidth <= innerWidth,
                     sticker: getComputedStyle(document.getElementById('sticker')).display, focus: document.activeElement.id,
                     sticky: getComputedStyle(document.querySelector('#overlay .bar')).position }; }""")
        page.screenshot(path=str(tmp_path / "start-390x844.png"))
        b.close()
        b2, page2, errors2 = boot(p)
        shot = tmp_path / "start-1280x720.png"
        page2.screenshot(path=str(shot))
        desk = page2.evaluate("""() => { const bar = document.querySelector('#overlay .bar').getBoundingClientRect(), logo = document.querySelector('#overlay h1').getBoundingClientRect();
            return { barInside: bar.bottom <= innerHeight + 1, logoInside: logo.left >= 0 && logo.right <= innerWidth, sticker: getComputedStyle(document.getElementById('sticker')).display,
                     edition: document.getElementById('edition').textContent, car: document.getElementById('cartagname').textContent.length > 0 }; }""")
        b2.close()
    print("screenshots:", tmp_path)
    assert got["sameRow"] and got["below"] and got["worldFull"] and got["barInside"] and got["noHScroll"] and got["sticky"] == "sticky"
    assert got["sticker"] == "none" and got["focus"] == "body"          # touch: nothing focused, the slot shows the last mode
    assert desk["barInside"] and desk["logoInside"] and desk["sticker"] != "none" and desk["edition"] == "Hochrhein Edition" and desk["car"]
    assert errors == [] and errors2 == []
```

  Use the `server` fixture exactly as `test_region.py` does (`page.goto(f"{server}/prototype/index.html")`); the literal URL above is a placeholder. `window.__mm.finishNow` already exists (used by `test_heli.py`/`test_hunt.py`); check its name with `grep -n "finishNow" prototype/index.html` and adjust if its signature needs a mode.

- [ ] Step 2: commit (`test(ui): start screen Sunset Steel browser test (#346)`), push the branch, run the new file once — expected: fails on `#worldbtn` / `.bar` not found.

## Task 4: markup

- [ ] Step 1: in `prototype/index.html`, replace lines 262–306 (`<div id="overlay">` … `</div>` closing the panel and the overlay) with the start-screen markup from spec §1 verbatim (`<div class="start">` … including `#cartag`, `#edition`, `#sticker`, the slot with `#worldgone` (copy its current inner markup unchanged), `#result`, `#ovtext aria-live="polite"` with the text `Building the world…`, the bar with `disabled` on `#startbtn/#blitzbtn/#huntbtn`, the secondary row, the footer with `#blurb`, `#creditsbtn`, `.status > #mmhstatus`). Drop `#blitzhint`, the `.regionrow`, `#worldsrow` and `.terrainrow` blocks from here — they move in the next step.
- [ ] Step 2: directly after `#overlay`'s closing `</div>` (before the `<!-- #7 car selection` comment), insert the `#worlds` dialog markup from spec §2 verbatim. The `.terrainrow` contents are the old lines 296–304 unchanged plus the `#worldforgetask` span; `#region-*` buttons keep their ids and `aria-pressed`; `#worldsrow` keeps `#worldslabel`, `#worldsbtns`, `#buildworld` as its last `button, a` (add `#worldsempty` *before* `#buildworld`).
- [ ] Step 3: `grep -c 'id="blitzhint"' prototype/index.html` → 0; `for i in startbtn blitzbtn huntbtn carbtn stylebtn2 region-hochrhein region-ehrendingen region-world worldsbtns buildworld worldsdesc mmhfile mmhclear worldfile worlddl worldforget mmhstatus worldfilestatus blurb ovtext result worldgone buildagain drivehere worldgonetitle worldgonetext; do grep -c "id=\"$i\"" prototype/index.html; done` → every line prints 1.

## Task 5: CSS

- [ ] Step 1: line 81–83: keep `#overlay{position:fixed;inset:0;…}` but replace its `display:flex;align-items:center;justify-content:center;background:radial-gradient(…)` with `display:block;z-index:10;padding:0;` and the sunset backdrop from spec §6. Keep `#overlay[hidden]{display:none}`. Leave `.panel`, `.panel h1`, `.panel .sub`, `.panel p` (lines 83–86) in place — `#pause`/`#abandon` still use them.
- [ ] Step 2: replace the overlay-specific rules at lines 94–109 (`.terrainrow`, `.regionrow`, `#buildworld`, `#worldsdesc`, `.btn.small`, `#worldgone…`, `#mmhstatus…`, `#result…`) by the following block (the rules that other dialogs use — `.row`, `.btn`, `.btn.primary`, `.btn:active`, `.btn:focus-visible`, `.btn[hidden]`, `.btn.small:focus-within` — stay as they are):

```css
:root{--burnt:#c24a00}
.start{min-height:100%;display:flex;flex-direction:column;color:var(--cream)}
.tags{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:24px 32px 0}
.start .sub,.tag{padding:6px 14px;background:rgba(20,23,29,.75);border:2px solid #4a515e;font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--steel-l)}
.tag i{display:inline-block;width:10px;height:10px;margin-right:8px;background:var(--sun);box-shadow:0 0 8px var(--sun);vertical-align:1px}
.logo{display:flex;flex-direction:column;align-items:center;gap:14px;padding:28px 16px 0;text-align:center}
.start h1{margin:0;font-family:Bungee,sans-serif;font-weight:400;font-size:clamp(56px,11vw,150px);line-height:.9;letter-spacing:-2px;color:var(--sun);transform:skewX(-9deg);-webkit-text-stroke:3px var(--charcoal);text-shadow:4px 4px 0 var(--signal),8px 8px 0 var(--burnt),12px 12px 0 #6b2400,16px 16px 0 var(--charcoal),0 0 60px rgba(255,122,26,.55)}
.edition{display:flex;align-items:center;gap:14px}
.edition i{height:4px;width:120px;background:linear-gradient(90deg,rgba(255,198,26,0),var(--sun))}.edition i:last-child{background:linear-gradient(90deg,var(--sun),rgba(255,198,26,0))}
.edition span{padding:6px 20px;background:linear-gradient(#3a3f4b,#1c1f26);border:3px solid;border-color:#8d96a3 #2a2e38 #2a2e38 #8d96a3;font-size:22px;font-weight:800;font-style:italic;letter-spacing:3px;text-transform:uppercase;color:var(--sun)}
.mid{flex:1;position:relative;display:flex;align-items:flex-end;padding:24px 32px}
.slot{max-width:560px;padding:12px 16px;background:rgba(20,23,29,.78);border:3px solid;border-color:#4a515e var(--ink) var(--ink) #4a515e}
.slot p{margin:0;font-size:19px;font-weight:600;line-height:1.35}
#sticker{position:absolute;right:10%;bottom:30%;max-width:260px;padding:12px 18px;transform:rotate(-7deg);background:var(--sun);border:5px solid var(--charcoal);box-shadow:8px 8px 0 var(--charcoal);color:var(--charcoal);font-size:20px;font-weight:800;font-style:italic;line-height:1.05;text-transform:uppercase;text-align:center}#sticker[hidden]{display:none}
.bar{padding:18px 32px 14px;background:linear-gradient(#66707e,#3a404b 40%,#23272f);border-top:5px solid #9ea7b3;box-shadow:0 -12px 30px rgba(0,0,0,.5)}
.bar .row{justify-content:center;gap:16px}.bar .row.secondary{margin-top:12px;gap:10px}
.bar .row:not(.secondary) .btn{min-width:180px}
.btn:hover:not(:disabled){background:linear-gradient(#ffe27a,#ffc61a 45%,#ff9a1a);border-color:#fff2b8 #a04a00 #a04a00 #fff2b8}
.btn:disabled{cursor:default;color:#2a2e38;background:#5f6673;border-color:#737b88 #3a404b #3a404b #737b88;box-shadow:none}
.foot{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;padding:8px 32px calc(64px + env(safe-area-inset-bottom,0px))}
.foot p{margin:0}#blurb{font-size:14px;color:var(--steel-l)}.foot .status{flex-basis:100%;font-size:13px;color:var(--steel-l)}
.link{background:none;border:0;padding:0;font:inherit;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--sun);text-decoration:underline;cursor:pointer}.link[hidden]{display:none}
#worldgone{padding:0 0 8px;border:0;border-bottom:3px solid #a04a00;margin:0 0 8px}#worldgone[hidden]{display:none}#worldgone h2{margin:0 0 4px;font-size:22px;color:var(--sun)}#worldgone p{margin:4px 0 8px;font-size:16px}#worldgone .row{display:flex;flex-wrap:wrap;gap:10px}#worldgone a.btn{display:inline-flex;align-items:center;text-decoration:none}#worldgone a.btn[hidden],#worldgone [hidden]{display:none}
#mmhstatus,#worldstatus,#worldfilestatus,#wpworld,#wpterrain{font-size:inherit;font-weight:600;color:var(--steel-l)}
#mmhstatus.real,#worldstatus.real{color:var(--go)}
#result{font-size:48px;font-weight:800;font-style:italic;color:var(--sun);line-height:1;margin-bottom:8px}#result[hidden]{display:none}
#result small{display:block;font-size:18px;color:var(--steel-l);font-style:normal;letter-spacing:2px;text-transform:uppercase}
.btn.small{height:40px;padding:0 14px;font-size:17px;display:inline-flex;align-items:center;box-shadow:3px 3px 0 var(--ink)}
/* #346 Worlds dialog: RaceSetup vocabulary — sunken list well, raised preview, steel footer */
#worlds{position:fixed;inset:0;z-index:12;display:flex;flex-direction:column;gap:14px;padding:16px 24px 0;box-sizing:border-box;overflow:auto;background:radial-gradient(ellipse at center,rgba(28,31,38,.7),rgba(10,8,20,.95));color:var(--cream)}#worlds[hidden]{display:none}
.ws-head{display:flex;align-items:baseline;gap:16px}.ws-head h1{margin:0;font-family:Bungee,sans-serif;font-weight:400;font-size:clamp(28px,5vw,48px);color:var(--sun);transform:skewX(-8deg)}.ws-sub{flex:1;font-size:18px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--steel-l)}
.ws-body{display:flex;gap:18px;flex:1;min-height:0}
.ws-list{flex:0 0 min(380px,40%);padding:12px;background:var(--ink);border:3px solid;border-color:#0b0d12 #4a515e #4a515e #0b0d12;display:flex;flex-direction:column;gap:14px}
.regionrow{display:flex;flex-direction:column;gap:4px}.ws-label{font-size:14px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--steel)}
.ws-row{height:48px;padding:0 14px;text-align:left;font:800 italic 20px/1 inherit;font-family:inherit;letter-spacing:1px;text-transform:uppercase;color:var(--cream);background:#1c1f26;border:0;border-left:4px solid transparent;cursor:pointer}
.ws-row:hover{background:#2a2e38}.ws-row[aria-pressed="true"]{color:var(--sun);border-left-color:var(--sun);background:#23272f}.ws-row:focus-visible{outline:3px solid var(--sun);outline-offset:-3px}.ws-row[hidden]{display:none}
.ws-empty{margin:4px 0;padding:10px;border:2px dashed #4a515e;font-size:14px;color:var(--steel-l)}.ws-empty[hidden]{display:none}
#buildworld{text-decoration:none;align-self:flex-start;margin-top:6px}
.ws-preview{flex:1;padding:16px 18px;background:linear-gradient(#3a404b,#23272f);border:5px solid;border-color:var(--steel-l) var(--ink) var(--ink) var(--steel-l);box-shadow:8px 8px 0 var(--ink);display:flex;flex-direction:column;gap:8px}
.ws-name{font-size:40px;font-weight:800;font-style:italic;letter-spacing:1px;text-transform:uppercase;color:var(--sun);line-height:1}
#worldsdesc{margin:0;font-size:16px;font-weight:600;min-height:1.2em}.ws-line{margin:0;font-size:15px}.ws-line:empty{display:none}
.ws-files{margin-top:auto;padding:10px 12px;background:var(--ink);border:3px solid;border-color:#0b0d12 #4a515e #4a515e #0b0d12}.ws-files summary{cursor:pointer;font-size:14px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--steel)}
.terrainrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding-top:10px}#worldforgetask{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:600}#worldforgetask[hidden]{display:none}
.ws-foot{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 -24px;padding:14px 24px calc(14px + env(safe-area-inset-bottom,0px));background:linear-gradient(#66707e,#3a404b 40%,#23272f);border-top:5px solid #9ea7b3;box-shadow:0 -12px 30px rgba(0,0,0,.5)}
.ws-source{font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--steel-l)}
body:has(#overlay:not([hidden])) :is(#tl,#tr,#tc,#bl,#br,#stylebtn,#pausebtn,#touch),body:has(#worlds:not([hidden])) :is(#hud,#touch){display:none}
@media (max-width:600px){
  .tags{padding:10px 12px 0}.start .sub,.tag{font-size:11px;padding:4px 8px;letter-spacing:1px}
  .logo{padding-top:14px;gap:8px}.start h1{font-size:56px;letter-spacing:-1px;text-shadow:3px 3px 0 var(--signal),6px 6px 0 var(--burnt),9px 9px 0 var(--charcoal)}
  .edition i{width:28px}.edition span{font-size:15px;padding:4px 10px}
  .mid{padding:12px 12px 10px}.slot{padding:8px 10px}.slot p{font-size:15px}#sticker{display:none}
  .bar{position:sticky;bottom:0;padding:10px 12px}
  .bar .row:not(.secondary){display:grid;grid-template-columns:1fr 1fr;gap:8px}.bar .row:not(.secondary) .btn{min-width:0;height:48px;padding:0 8px;font-size:20px}
  .bar .row.secondary{gap:8px}#worldbtn{flex-basis:100%}.bar .row.secondary .btn{flex:1;padding:0 8px;font-size:15px}
  .foot{padding:8px 12px calc(16px + env(safe-area-inset-bottom,0px))}#blurb{font-size:13px}
  #worlds{padding:12px 16px 0;gap:10px}.ws-body{flex-direction:column;flex:none}.ws-list{flex:none}.ws-preview{box-shadow:none;padding:10px 12px}.ws-name{font-size:26px}#worldsdesc{display:none}
  .ws-foot{margin:0 -16px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px))}.ws-source{display:none}.ws-foot .btn{flex:1}
}
```

  Note the last `body:has(...)` rule replaces nothing — `#game-nav`'s own rules at 2956–2957 stay. `#carsel`'s hide rule at line 161 stays.

- [ ] Step 3: delete the old rules this block supersedes so nothing is defined twice: old `.terrainrow` (94), `.regionrow` + `.regionrow .btn[aria-pressed]` (96–97), `#buildworld` (99), `#worldsdesc` (100), `.btn.small` (101), `#worldgone…` (104), `#mmhstatus…` (105–106), `#result…` (108–109). Keep `.btn[hidden]` (102) and `.btn.small:focus-within,label.btn:focus-visible` (103). Also drop `.regionrow .btn[aria-pressed="true"]{outline…}` — the pressed look is now `.ws-row[aria-pressed="true"]`.

## Task 6: JavaScript

All edits in `prototype/index.html`'s module script unless stated. Add the import near line 369: `import { MODES, lastModeFrom, modeTextKey, editionText, worldsKeyAction, bestKeyFor } from './startscreen.js';`.

- [ ] Step 1 — **Tab fix** (line 2143): change `if (e.code === 'Tab') e.preventDefault();` to `if (e.code === 'Tab' && $('overlay').hidden && !WORLDS.on) e.preventDefault();` and insert `if (WORLDS.on) { worldsKey(e); return; }` right after `if (CARSEL.on) { carselKey(e); return; }`. (`WORLDS` is a `const` declared later in the module; the handler runs after load, so the reference is fine — same as `CARSEL`.)

- [ ] Step 2 — **last mode** (line 2569, `startRace`): after `R.mode = mode;` add `try { localStorage.setItem('mm.lastMode', mode); } catch (e) { } SHOWN.mode = mode;`.

- [ ] Step 3 — **start-screen state and renderers**, directly after `renderOverlay()` (line 2592) replace the block 2592–2596 with:

```js
const SHOWN = { mode: lastModeFrom((() => { try { return localStorage.getItem('mm.lastMode'); } catch (e) { return null; } })(), RACELESS) };   // #346: the mode the slot shows when nothing is focused
const MODE_BTN = { startbtn: 'trial', blitzbtn: 'blitz', huntbtn: 'hunt' };
const focusedMode = () => MODE_BTN[document.activeElement && document.activeElement.id] ?? null;
function modeText(mode) { const done = R.state === 'finished' && mode === R.mode; return tr(done ? (R.timeUp ? 'blitzTimeUpText' : mode === 'blitz' ? 'blitzFinishedText' : mode === 'hunt' ? 'huntFinishedText' : REGION.strings.finished) : modeTextKey(mode, REGION.strings)); }
function showModeText(mode) { $('ovtext').textContent = modeText(mode); }
function revertModeText() { showModeText(focusedMode() ?? SHOWN.mode); }
// the overlay doubles as the start and the result screen, so its texts depend on the race state
function renderOverlay() { const done = R.state === 'finished', blitz = R.mode === 'blitz', hunt = R.mode === 'hunt'; if (done) SHOWN.mode = R.mode; revertModeText(); $('startbtn').textContent = tr(done && !blitz && !hunt ? 'retry' : 'start'); $('blitzbtn').textContent = tr(done && blitz ? 'retry' : 'blitz'); $('blitzbtn').title = tr('blitzIntro'); $('huntbtn').textContent = tr(done && hunt ? 'retry' : 'hunt'); if (done) $('result').innerHTML = resultHtml(R.last); for (const id of Object.keys(MODE_BTN)) $(id).disabled = !!WORLD_GONE; }
function renderStartScreen() { $('edition').textContent = editionText(REGION, tr); $('worldbtn').textContent = tr('worldBtn', REGION.name); $('cartagname').textContent = tr('carTag', vehicleText(tr, CHOICE.id, 'name')); const sticker = REGION.generated ? null : REGION.id === 'ehrendingen' ? 'stickerEhrendingen' : 'stickerHochrhein'; $('sticker').hidden = !sticker; $('sticker').textContent = sticker ? tr(sticker) : ''; }
const firstModeButton = () => Object.keys(MODE_BTN).map($).find(b => !b.hidden) || $('carbtn');
function focusStart() { if (WORLD_GONE) { $('worldbtn').focus(); return; } firstModeButton().focus(); }
if (RACELESS) for (const id of ['startbtn', 'blitzbtn']) $(id).hidden = true;
for (const id of Object.keys(MODE_BTN)) { const b = $(id); b.addEventListener('focus', () => showModeText(MODE_BTN[id])); b.addEventListener('mouseenter', () => showModeText(MODE_BTN[id])); b.addEventListener('blur', revertModeText); b.addEventListener('mouseleave', revertModeText); }
$('startbtn').onclick = () => { SFX.start(); startRace(); };
$('blitzbtn').onclick = () => { SFX.start(); startRace('blitz'); };
$('huntbtn').onclick = () => { SFX.start(); startRace('hunt'); };
window.__mm.startScreen = () => ({ mode: SHOWN.mode, text: $('ovtext').textContent, worldsOpen: WORLDS.on, sel: WORLDS.sel, focus: document.activeElement ? document.activeElement.id : '' });
```

  Then remove the old `if (RACELESS) for (const id of ['startbtn', 'blitzbtn', 'blitzhint'])` line (2593) — it is replaced above without `blitzhint`.

- [ ] Step 4 — **region buttons → selection** (lines 2598–2600): replace the `for (const id of Object.keys(REGIONS))` loop and the `region-world` line with:

```js
if (REGION.generated) { const w = $('region-world'); w.hidden = false; w.textContent = REGION.name; }   // textContent, never innerHTML: the name is data
// #346 Worlds dialog: rows select, DRIVE HERE reloads (flow 1b). The loaded world starts selected.
const CURRENT_SEL = GEN ? { kind: 'world', id: WORLD_ID } : { kind: 'region', id: REGION.id };
const WORLDS = { on: false, sel: { ...CURRENT_SEL } };
const sameSel = (a, b) => a.kind === b.kind && a.id === b.id;
const rowFor = (sel) => sel.kind === 'region' ? $('region-' + sel.id) : $('worldsbtns').querySelector(`[data-world-id="${sel.id}"]`);
const rowSel = (b) => b.dataset.worldId ? { kind: 'world', id: b.dataset.worldId } : { kind: 'region', id: b.id.slice('region-'.length) };
const rows = () => [...$('worlds').querySelectorAll('.ws-row:not([hidden])')];
function selName(sel) { return sel.kind === 'region' ? (REGIONS[sel.id] ? REGIONS[sel.id].name : REGION.name) : (GALLERY.get(sel.id) || { title: sel.id }).title; }
function renderWorldsList() { for (const b of rows()) { const on = sameSel(rowSel(b), WORLDS.sel); b.setAttribute('aria-pressed', String(on)); b.tabIndex = on ? 0 : -1; } }
function renderWorldsPreview() { const sel = WORLDS.sel, current = sameSel(sel, CURRENT_SEL), name = selName(sel); $('wpname').textContent = name; $('worldsdesc').textContent = sel.kind === 'world' ? (GALLERY.get(sel.id) || { description: '' }).description : tr(REGIONS[sel.id] ? REGIONS[sel.id].strings.intro : REGION.strings.intro); $('wpworld').textContent = current ? $('worldstatus').textContent : ''; $('wpterrain').textContent = current ? $('mmhstatus').textContent : ''; let best = null; try { best = localStorage.getItem(bestKeyFor(sel, REGIONS)); } catch (e) { } $('wpbest').textContent = tr('wpBest', best === null ? '—' : fmt(+best).replace(/<[^>]+>/g, '')); $('wpsource').textContent = (current && !L) ? name : tr('wpSource', name); }
function selectRow(sel) { WORLDS.sel = { ...sel }; renderWorldsList(); renderWorldsPreview(); }
function openWorlds() { WORLDS.on = true; closeHelp(); $('wpfiles').open = !matchMedia('(max-width:600px)').matches; selectRow(WORLDS.sel); $('overlay').hidden = true; $('worlds').hidden = false; rowFor(WORLDS.sel)?.focus(); }
function closeWorlds() { WORLDS.on = false; $('worlds').hidden = true; $('overlay').hidden = false; $('worldbtn').focus(); }
function driveSelection() { const sel = WORLDS.sel; if (sameSel(sel, CURRENT_SEL)) { closeWorlds(); return; } location.search = sel.kind === 'region' ? regionSearch(location.search, sel.id) : worldSearch(location.search, sel.id); }
function worldsKey(e) { const onRow = document.activeElement && document.activeElement.classList.contains('ws-row'); const act = worldsKeyAction(e, onRow); if (act === 'pass') return; e.preventDefault(); if (act === 'back') closeWorlds(); else if (act === 'next' || act === 'prev') { const ids = rows().map(b => b.id || b.dataset.worldId), cur = document.activeElement.id || document.activeElement.dataset.worldId, next = nextFocus(ids, cur, act === 'next' ? 1 : -1), b = rows().find(x => (x.id || x.dataset.worldId) === next); selectRow(rowSel(b)); b.focus(); } }
for (const id of Object.keys(REGIONS)) $('region-' + id).onclick = () => selectRow({ kind: 'region', id });
$('worldbtn').onclick = openWorlds; $('worldsback').onclick = closeWorlds; $('drivebtn').onclick = driveSelection;
```

  `nextFocus` is already imported from `./pause.js` (line 369). `GALLERY` is a `Map` filled in Step 7. Gallery rows carry `data-world-id` but no `id`, hence the `id || dataset.worldId` pairs. `fmt` is the existing time formatter used by `resultHtml()`.

- [ ] Step 5 — **dialog focus returns**: in `closeCarSel()` (2604) nothing changes. In `toMainMenu()` (2637) replace `$('startbtn').focus();` with `focusStart();`. At the end of the module's start-up (after `rerenderAll();` at 2745) add: `renderStartScreen(); if (!matchMedia('(pointer:coarse)').matches) focusStart();` and add `renderStartScreen` to `rerenderAll()` (names change with the language) — put it in the list after `renderOverlay`.

- [ ] Step 6 — **status lines and remove confirmation** (2691–2727): in `renderStatus()` add `if (WORLDS.on) renderWorldsPreview();` as the last statement (the preview copies the two status lines). Replace `$('worldforget').onclick = …` (2727) with:

```js
$('worldforget').onclick = () => { $('worldforget').hidden = true; $('worldforgetask').hidden = false; $('worldforgetyes').focus(); };
$('worldforgetno').onclick = () => { $('worldforgetask').hidden = true; $('worldforget').hidden = false; $('worldforget').focus(); };
$('worldforgetyes').onclick = async () => { await idbSet(savedKey(WORLD_ID), null); location.reload(); };
```

  `renderWorldGone()` (2729) itself does not change: `renderOverlay()` (Step 3) already derives `disabled` from `WORLD_GONE`, and `rerenderAll()` runs both. Only `$('drivehere').onclick` (2741), which ends with `renderWorldGone();`, gets `renderOverlay(); focusStart();` appended so the mode buttons re-enable and focus returns after "Drive Hochrhein instead".

- [ ] Step 7 — **gallery rows** (2928–2943, `showGallery()`): declare `const GALLERY = new Map();` before the function; inside, after `const worlds = await loadGallery(...)`, add `for (const w of worlds) GALLERY.set(w.id, w);` and `$('worldsempty').hidden = worlds.length > 0;` **before** the `if (!worlds.length) return;` line. For each row: `b.className = 'ws-row';` instead of `'btn small'`, keep `b.dataset.worldId`, keep `aria-pressed`, keep `say`/`onmouseenter`/`onfocus`/`onmouseleave`/`onblur`, and change `b.onclick` to `() => selectRow({ kind: 'world', id: w.id });`. After the loop call `renderWorldsList();`. The `onmouseleave`/`onblur` handlers that blank `#worldsdesc` should restore the selection's description instead: `b.onmouseleave = () => { renderWorldsPreview(); }; b.onblur = b.onmouseleave;` — `test_gallery.py` only asserts the hover text, never the blank.

- [ ] Step 8 — **car tag follows the car picker**: in `renderCarSel()` (the function that sets `#csname`), or more simply in `closeCarSel()` (2604), add `renderStartScreen();` so the tag shows the car chosen in the picker. `CHOICE` is the live choice (`index.html:1910`); confirm with `grep -n "CHOICE.id = " prototype/index.html` which function commits a pick and that `closeCarSel()` runs after it.

- [ ] Step 9: `node --test prototype/tests/*.test.mjs` passes; open `prototype/index.html` via `python3 -m http.server` in Playwright (`page.goto`, read `errors`) — zero page errors. Commit `feat(ui): Sunset Steel start screen and Worlds dialog (#346)`, push.

- [ ] Step 10: run `prototype/tests/test_start_screen.py` (foreground, capped). Expected: all 5 pass. If `test_bar_order_focus_order_and_enter_starts` fails on the 6th Tab, the nav link order is the reason — assert only `order[:5]`.

## Task 7: adapt the existing tests that encode the old layout

Each edit keeps the test's intent; none is deleted or weakened. Add this helper to each file that needs the dialog (`test_region.py`, `test_gallery.py`, `test_world.py`, `test_xss.py`):

```python
def open_worlds(page):
    page.click("#worldbtn")
    page.wait_for_function("() => !document.querySelector('#worlds').hidden", timeout=30000)
```

- [ ] `test_carselect.py:59`: `assert page.evaluate("() => [...document.querySelector('#overlay .bar .row').children].map(b => b.id)") == ["startbtn", "blitzbtn", "huntbtn", "carbtn"]` and add `assert page.evaluate("() => [...document.querySelector('#overlay .row.secondary').children].map(b => b.id).slice(0, 2)") == ["worldbtn", "stylebtn2"]`.
- [ ] `test_region.py:30-39`: call `open_worlds(page)` before line 30; after `page.click("#region-ehrendingen")` add `page.click("#drivebtn", no_wait_after=True)` (the existing wait for the reload stays). Lines 91–96: replace the three selectors with `'#worldbtn', '#stylebtn2', '#gg-lang-toggle'` in both the evaluate and the expected list (the docstring: "the fixed #game-nav footer must not sit on the start screen's buttons").
- [ ] `test_gallery.py`: `open_worlds(page)` after each `boot(...)` in the tests that touch `#worldsbtns`, `#worldsdesc`, `#buildworld`, `#worldsrow` (lines 32–50, 59–61, 66–74); at line 37 after the row click add `page.click("#drivebtn", no_wait_after=True)`. Line 61 (`page.is_visible("#startbtn")`) is read **before** `open_worlds` (the overlay hides while the dialog is open).
- [ ] `test_world.py`: line 81 → `assert page.text_content("#edition") == "Testdorf"`, then `open_worlds(page)` and the existing `#region-world` / `#region-hochrhein aria-pressed` assertions; line 83 (`is_visible("#startbtn")`) moves **before** `open_worlds` and `page.keyboard.press("Escape")` follows the dialog checks so the `startbtn` click at line 85 finds the overlay. Line 116: `open_worlds(page)` before `page.click("#worlddl")`. Line 131: `open_worlds(page)` first. Lines 176–178: `open_worlds(page)` before `is_visible("#worldforget")`; after `page.click("#worldforget")` add `page.click("#worldforgetyes")` inside the same `expect_navigation`/wait. Line 98: unchanged (`is_visible("#blitzhint")` is `False` for a missing element) — but delete `and not page.is_visible("#blitzhint")` since the element no longer exists (dead assertion).
- [ ] `test_blitz.py:36`: `page.hover("#blitzbtn"); assert "90 seconds" in text(page, "#ovtext")`. Line 73: `"Retry"` → `"Again"`.
- [ ] `test_hunt.py:79`: `"Retry"` → `"Again"`.
- [ ] `test_i18n.py:199`: `en[1] == "Again"`.
- [ ] `test_xss.py`: where it reads `#region-world` (line ~218), add `assert page.text_content("#edition") == PAYLOAD` on the start screen, then `open_worlds(page)` before the existing `#region-world` read; keep the `#overlay img` count (line 221) and add `#worlds img` to that selector list.
- [ ] Run, one file per call, in this order (stop on the first failure and fix the implementation, not the test, unless the failure is one of the planned edits above): `test_start_screen.py`, `test_carselect.py`, `test_region.py`, `test_gallery.py`, `test_world.py`, `test_blitz.py`, `test_hunt.py`, `test_i18n.py`, `test_xss.py`, `test_pause.py`, `test_help_filter.py`, `test_smoke.py::test_bundled_terrain_loads_without_upload`.

## Task 8: changelog, screenshots, finish

- [ ] Step 1: `CHANGELOG.md` under `## [Unreleased]` / `### Changed`, player voice, dated `YYYY-MM-DD HH:MM` Zurich like the existing lines:
  - **Start screen** in the new "Sunset Steel" look: big logo, edition plate, one line that tells you what the focused mode does, and a steel bar with Start · Blitz · Surprise hunt · Choose car.
  - **Worlds** has its own screen (the World button): pick a region or a built world, see its preview and best time, then Drive here. Loading terrain and world files lives there too.
  - After a race, the button of the mode you just played reads **Again**.
- [ ] Step 2: look at the two screenshots `test_phone_layout_and_screenshots` wrote (path printed with `-s`): logo not clipped, bar fully visible, no horizontal scroll, `#game-nav` not over the blurb at 1280×720. Attach both to the PR description.
- [ ] Step 3: commit (`feat(ui): Sunset Steel start screen and Worlds dialog`, body `Closes #346`, note #351 as the follow-up for the live sunset), push, open the PR to `main` with the Testing section listing exactly which test files ran.
