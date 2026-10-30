# About Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An „Über Map Madness“ / „About Map Madness“ dialog with the dedication, the people, the game info, all credits and how the game is built, opened from the start screen, the pause menu and the command search; the model credits leave the command search.

**Architecture:** A static `#about` dialog in `prototype/index.html`, framed like the Worlds dialog (`#worlds`), its texts in `prototype/strings.js` (en/de, applied by the existing `data-i18n` loop), its links and keyboard rules in a new pure module `prototype/about.js`. The command search learns a second kind of command, `action:<name>`, in `prototype/helpfilter.js`; the pause menu gets one more button in `prototype/pause.js`.

**Tech Stack:** Vanilla JS ES modules, buildless; `node --test` for pure modules; Python Playwright for the page.

**Spec:** `docs/superpowers/specs/2026-10-29-about-screen-design.md`

## Global Constraints

- Buildless: no new dependency, no bundler, no `package.json`.
- Every user-facing text in `prototype/strings.js` in **both** `en` and `de`; `STRINGS.en` and `STRINGS.de` must keep the same key set (`prototype/tests/strings.test.mjs`).
- German: capitalised Du/Dir/Dein, real umlauts, `ss` not `ß`.
- Names are not translated: `Tschosi "forwardare"` / `Ätti aka L.A. Brace` (line break between them), `Kiscsi`, `Juliska`.
- Dedication **before** the people, people before the game info.
- Every external link: `https://` only, `target="_blank"`, `rel="noopener"`.
- The Wikipedia screenshot of Midtown Madness is **never** copied or embedded; only the article is linked.
- The start screen's source line (`#blurb`) stays as it is (ODbL attribution).
- Playwright tests run in the foreground; commit and push before running them.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added`.

## Review Focus

- Opening About from the command search **during a race** must pause the race (the clock must not run behind the dialog) and Back must land in the pause menu — pinned in Task 5.
- Game keys while About is open must not reach the game (W must not set a held key) — pinned in Task 4.
- At phone width (375 px) the dialog must not scroll sideways — pinned in Task 4.
- Escape in About opened from the pause menu must return to the pause menu, not resume the race — pinned in Task 5.
- A new `credit*` string added later must show up in About, not get lost — pinned in Task 4 (count of `credit*` keys vs. elements).

---

### Task 1: `about.js` — links, key rules, return target

**Files:**
- Create: `prototype/about.js`
- Test: `prototype/tests/about.test.mjs`

**Interfaces:**
- Produces: `ABOUT_LINKS` (frozen object, id → https URL), `aboutKeyAction(e: {code}) → 'back' | 'pass' | 'ignore'`, `aboutReturn(inRun: boolean) → 'pause' | 'start'`.

- [ ] **Step 1: Write the failing test**

```js
// prototype/tests/about.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT_LINKS, aboutKeyAction, aboutReturn } from '../about.js';

test('ABOUT_LINKS: every link https, the agreed set, frozen', () => {
  assert.deepEqual(Object.keys(ABOUT_LINKS).sort(), ['agentWorkflow', 'aiInstructions', 'altcha', 'crashcat', 'fonts', 'glossary', 'leaflet', 'midtown', 'osm', 'plattform', 'source', 'swisstopo', 'threejs']);
  for (const [id, url] of Object.entries(ABOUT_LINKS)) assert.match(url, /^https:\/\/[^\s]+$/, id);
  assert.equal(ABOUT_LINKS.plattform, 'https://www.plattform-sisslerfeld.com/');
  assert.equal(ABOUT_LINKS.midtown, 'https://en.wikipedia.org/wiki/Midtown_Madness');
  assert.equal(ABOUT_LINKS.aiInstructions, 'https://github.com/freaxnx01/ai-instructions');
  assert.equal(ABOUT_LINKS.agentWorkflow, 'https://github.com/freaxnx01/agent-workflow');
  assert.ok(Object.isFrozen(ABOUT_LINKS));
});

test('aboutKeyAction: Esc goes back, focus keys pass, game keys are ignored', () => {
  assert.equal(aboutKeyAction({ code: 'Escape' }), 'back');
  for (const code of ['Tab', 'Enter', 'NumpadEnter', 'Space']) assert.equal(aboutKeyAction({ code }), 'pass', code);
  for (const code of ['KeyW', 'KeyJ', 'KeyP', 'ArrowUp', 'KeyZ']) assert.equal(aboutKeyAction({ code }), 'ignore', code);
});

test('aboutReturn: over the paused game during a run, else the start screen', () => {
  assert.equal(aboutReturn(true), 'pause');
  assert.equal(aboutReturn(false), 'start');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/about.test.mjs`
Expected: FAIL with `Cannot find module '…/prototype/about.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// prototype/about.js
// about.js (#509): the About dialog's links and keyboard rules. Pure: no DOM, so node --test imports it.

export const ABOUT_LINKS = Object.freeze({
  midtown: 'https://en.wikipedia.org/wiki/Midtown_Madness',   // the article only: its screenshot is not free, never copy it
  osm: 'https://www.openstreetmap.org/copyright',
  swisstopo: 'https://www.swisstopo.admin.ch',
  plattform: 'https://www.plattform-sisslerfeld.com/',
  threejs: 'https://threejs.org',
  crashcat: 'https://github.com/isaac-mason/crashcat',
  leaflet: 'https://leafletjs.com',
  altcha: 'https://altcha.org',
  fonts: 'https://fonts.google.com',
  aiInstructions: 'https://github.com/freaxnx01/ai-instructions',
  agentWorkflow: 'https://github.com/freaxnx01/agent-workflow',
  source: 'https://github.com/freaxnx01/game-rhyflitzer',
  glossary: 'https://github.com/freaxnx01/game-rhyflitzer/blob/main/docs/12-project-glossary.md',
});

const PASS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space']);

// like worldsKeyAction (startscreen.js): the dialog owns the keyboard while it is open
export function aboutKeyAction(e) {
  if (e.code === 'Escape') return 'back';
  return PASS.has(e.code) ? 'pass' : 'ignore';
}

// where Back leads: in a run the dialog sits over the paused game, otherwise over the start screen
export const aboutReturn = (inRun) => (inRun ? 'pause' : 'start');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/about.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add prototype/about.js prototype/tests/about.test.mjs
git commit -m "feat(ui): About dialog links and key rules (#509)"
```

### Task 2: command search learns `action:<name>`

**Files:**
- Modify: `prototype/helpfilter.js` (`parseCommand`, new `commandAction`)
- Test: `prototype/tests/helpfilter.test.mjs`

**Interfaces:**
- Produces: `parseCommand('action:about') → { kind: 'action', name: 'about' }`, `commandAction(cmd: string) → string | null`; `commandEventInit('action:about') → null` (unchanged behaviour for non-`run` kinds).

- [ ] **Step 1: Write the failing test** (append to `prototype/tests/helpfilter.test.mjs`; add `commandAction` to its import from `'../helpfilter.js'`)

```js
test('#509: action:<name> is a command of its own kind, with nothing to dispatch', () => {
  assert.deepEqual(parseCommand('action:about'), { kind: 'action', name: 'about' });
  assert.equal(commandAction('action:about'), 'about');
  assert.equal(commandAction('KeyJ'), null);
  assert.equal(commandAction('none'), null);
  assert.equal(commandAction(undefined), null);
  assert.equal(commandEventInit('action:about'), null);
  assert.equal(isHoldCommand('action:about'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/helpfilter.test.mjs`
Expected: FAIL — `commandAction` is not exported (SyntaxError on import)

- [ ] **Step 3: Write minimal implementation** in `prototype/helpfilter.js`

Replace the first line of `parseCommand`'s body and add `commandAction` below `isHoldCommand`:

```js
export function parseCommand(cmd) {
  if (!cmd || cmd === 'none') return { kind: 'none' };
  if (cmd === 'hold') return { kind: 'hold' };
  if (cmd.startsWith('action:')) return { kind: 'action', name: cmd.slice(7) };   // #509: runs a game function, no key press
  const ctrlKey = cmd.startsWith('ctrl+');
  const [code, explicitKey] = (ctrlKey ? cmd.slice(5) : cmd).split('|');
  return { kind: 'run', code, key: explicitKey ?? keyForCode(code), ctrlKey };
}
```

```js
// #509: the action a row runs instead of a key press, or null
export function commandAction(cmd) {
  const c = parseCommand(cmd);
  return c.kind === 'action' ? c.name : null;
}
```

Also extend the comment above `parseCommand`: `… "[ctrl+]Code[|key]" (the key press that runs it), or "action:<name>" (#509: a game function, e.g. the About dialog).`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/helpfilter.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prototype/helpfilter.js prototype/tests/helpfilter.test.mjs
git commit -m "feat(help): commands that run an action instead of a key (#509)"
```

### Task 3: pause menu gets an About button (order only)

**Files:**
- Modify: `prototype/pause.js:5`
- Test: `prototype/tests/pause.test.mjs:56`

**Interfaces:**
- Produces: `PAUSE_BUTTONS = ['pauseresume', 'pausevehicle', 'pauseabout', 'pauserestart', 'pausemenu']` (the markup comes in Task 5).

- [ ] **Step 1: Write the failing test** — change the existing assertion in `prototype/tests/pause.test.mjs`:

```js
  assert.deepEqual(PAUSE_BUTTONS, ['pauseresume', 'pausevehicle', 'pauseabout', 'pauserestart', 'pausemenu']);   // #509: About after Change vehicle
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/pause.test.mjs`
Expected: FAIL (deepEqual: missing `'pauseabout'`)

- [ ] **Step 3: Write minimal implementation** — `prototype/pause.js`:

```js
export const PAUSE_BUTTONS = ['pauseresume', 'pausevehicle', 'pauseabout', 'pauserestart', 'pausemenu'];
```

- [ ] **Step 4: Run tests**

Run: `node --test prototype/tests/pause.test.mjs`
Expected: PASS (check the other `nextFocus` assertions still hold; if one walks past `pausevehicle`, its expected neighbour is now `pauseabout` — that is the new order the spec asks for)

- [ ] **Step 5: Commit**

```bash
git add prototype/pause.js prototype/tests/pause.test.mjs
git commit -m "feat(pause): About button in the pause menu order (#509)"
```

### Task 4: the About dialog from the start screen

**Files:**
- Modify: `prototype/strings.js` (new keys in `en` and `de`, after `creditPlattform` in each)
- Modify: `prototype/index.html` (markup after the `#worlds` dialog; CSS next to the `#worlds` rules; `#aboutbtn` in `.bar .row.secondary`; the `credit*` `<small>` lines move out of `#help`; JS next to `openWorlds`/`closeWorlds`; keydown chain; hooks; import)
- Modify: `prototype/tests/test_start_screen.py` (`SECONDARY`)
- Create: `prototype/tests/test_about.py`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `ABOUT_LINKS`, `aboutKeyAction`, `aboutReturn` (Task 1).
- Produces: `openAbout(from: 'start' | 'pause')`, `closeAbout()`, `showAbout()` (opens from wherever the player is), `window.__mm.about() → { open: boolean, from: 'start' | 'pause' }`.

- [ ] **Step 1: Write the failing test**

```python
# prototype/tests/test_about.py
"""#509: the About dialog -- dedication, people, the game, credits, how it is built. Hand-traced layout (world and
terrain blocked): fast and deterministic. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"


def boot(p, server, locale="en-US", viewport=(1280, 720)):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale=locale)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def test_about_opens_from_the_start_screen_and_esc_returns(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        assert page.inner_text("#aboutbtn") == "About"
        page.click("#aboutbtn")
        state = page.evaluate("() => window.__mm.about()")
        visible = page.is_visible("#about") and not page.is_visible("#overlay")
        title = page.inner_text("#abouttitle")
        dedication = page.inner_text("#aboutdedication")
        people = page.inner_text("#about .ab-people")
        order = page.evaluate("() => !!(document.querySelector('#aboutdedication').compareDocumentPosition(document.querySelector('#about .ab-people')) & Node.DOCUMENT_POSITION_FOLLOWING)")
        page.keyboard.press("KeyW")
        held = page.evaluate("() => window.__mm.keysDown()")
        page.keyboard.press("Escape")
        after = page.evaluate("() => ({ about: window.__mm.about(), overlay: !document.getElementById('overlay').hidden, focus: document.activeElement.id })")
        b.close()
    assert state == {"open": True, "from": "start"}, state
    assert visible
    assert title == "About Map Madness"
    assert dedication == "This game is dedicated to Juliska"
    assert 'Tschosi "forwardare"' in people and "Ätti aka L.A. Brace" in people and "Tester" in people and "Kiscsi" in people, people
    assert order, "the dedication comes before the people"
    assert held == [], held                                             # game keys never reach the game behind the dialog
    assert after == {"about": {"open": False, "from": "start"}, "overlay": True, "focus": "aboutbtn"}, after
    assert errors == []


def test_links_point_to_the_listed_sites_and_open_in_a_new_tab(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        links = page.evaluate("() => [...document.querySelectorAll('#about a')].map(a => ({ id: a.dataset.link, href: a.href, target: a.target, rel: a.rel }))")
        listed = page.evaluate("async () => (await import('/prototype/about.js')).ABOUT_LINKS")
        b.close()
    assert {l["id"] for l in links} == set(listed), links                # every listed link is shown, nothing else
    for l in links:
        assert l["href"] == listed[l["id"]] and l["target"] == "_blank" and "noopener" in l["rel"].split(), l
    assert any(l["href"] == "https://www.plattform-sisslerfeld.com/" for l in links)


def test_every_credit_moved_from_the_help_to_about(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        keys = page.evaluate("async () => Object.keys((await import('/prototype/strings.js')).STRINGS.en).filter(k => /^credit[A-Z]/.test(k))")
        in_help = page.evaluate("() => document.querySelectorAll('#help [data-i18n^=\"credit\"]').length")
        in_about = page.evaluate("() => [...document.querySelectorAll('#about [data-i18n^=\"credit\"]')].map(e => e.dataset.i18n)")
        b.close()
    assert in_help == 0
    assert sorted(in_about) == sorted(keys), (in_about, keys)


def test_german_texts(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, locale="de-CH")
        btn = page.inner_text("#aboutbtn")
        page.click("#aboutbtn")
        title, dedication = page.inner_text("#abouttitle"), page.inner_text("#aboutdedication")
        b.close()
    assert btn == "Über" and title == "Über Map Madness" and dedication == "Dieses Spiel ist Juliska gewidmet"


def test_phone_width_never_scrolls_sideways(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, viewport=(375, 740))
        page.click("#aboutbtn")
        wide = page.evaluate("() => { const a = document.getElementById('about'); return [a.scrollWidth, a.clientWidth, document.documentElement.scrollWidth, innerWidth]; }")
        b.close()
    assert wide[0] <= wide[1] and wide[2] <= wide[3], wide
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest prototype/tests/test_about.py -x -q`
Expected: FAIL — `#aboutbtn` not found (`page.inner_text` timeout)

- [ ] **Step 3: Strings** — in `prototype/strings.js`, after `creditPlattform` in `en`:

```js
  // ---- #509 About ----
  aboutBtn: 'About',
  aboutTitle: 'About Map Madness',
  aboutDedication: 'This game is dedicated to Juliska',
  aboutRoleTschosi: 'Tester · Ehrendingen and the Wanderweg on the horizon',
  aboutRoleKiscsi: 'Idea: race over the Holzbrücke by car',
  aboutGameTitle: 'The game',
  aboutGame: 'Open-world arcade racer on real geodata: checkpoint race through Sisseln, Stein and Bad Säckingen on the Hochrhein — the pedestrian-only wooden bridge is fair game. Early prototype.',
  aboutInspired: 'Inspired by Midtown Madness',
  aboutModels: '3D models',
  aboutData: 'Data',
  aboutOsm: '© OpenStreetMap contributors, ODbL',
  aboutSwisstopo: 'Terrain swissALTI3D, building heights swissSURFACE3D, Swiss border swissBOUNDARIES3D, Holzbrücke reference swissBUILDINGS3D © swisstopo',
  aboutLibs: 'Libraries',
  aboutEditorLibs: 'in the region editor:',
  aboutFonts: 'Fonts',
  aboutFontsText: 'Bungee and Barlow Condensed (SIL Open Font License, Google Fonts)',
  aboutBuiltTitle: 'How it is built',
  aboutBuilt: 'Map Madness is built with AI coding agents (Claude Code): every change starts as a GitHub issue, gets a spec and a plan, is implemented test-first by an agent pipeline and reviewed before it ships.',
  aboutRules: 'Agent rules:',
  aboutWorkflow: 'Workflow:',
  aboutSource: 'Source code',
  aboutGlossary: 'Glossary',
  keyAbout: 'About Map Madness: dedication, credits, how it is built',
```

and after `creditPlattform` in `de`:

```js
  // ---- #509 Über ----
  aboutBtn: 'Über',
  aboutTitle: 'Über Map Madness',
  aboutDedication: 'Dieses Spiel ist Juliska gewidmet',
  aboutRoleTschosi: 'Tester · Ehrendingen und der Wanderweg am Horizont',
  aboutRoleKiscsi: 'Idee: mit dem Auto über die Holzbrücke düsen',
  aboutGameTitle: 'Das Spiel',
  aboutGame: 'Open-World-Arcade-Racer auf echten Geodaten: Checkpoint-Rennen durch Sisseln, Stein und Bad Säckingen am Hochrhein, und die Holzbrücke für Fussgänger ist freigegeben. Früher Prototyp.',
  aboutInspired: 'Inspiriert von Midtown Madness',
  aboutModels: '3D-Modelle',
  aboutData: 'Daten',
  aboutOsm: '© OpenStreetMap-Mitwirkende, ODbL',
  aboutSwisstopo: 'Gelände swissALTI3D, Gebäudehöhen swissSURFACE3D, Landesgrenze swissBOUNDARIES3D, Massstab Holzbrücke swissBUILDINGS3D © swisstopo',
  aboutLibs: 'Bibliotheken',
  aboutEditorLibs: 'im Region-Editor:',
  aboutFonts: 'Schriften',
  aboutFontsText: 'Bungee und Barlow Condensed (SIL Open Font License, Google Fonts)',
  aboutBuiltTitle: 'So entsteht das Spiel',
  aboutBuilt: 'Map Madness entsteht mit KI-Agenten (Claude Code): Jede Änderung beginnt als GitHub-Issue, bekommt eine Spec und einen Plan, wird von einer Agenten-Pipeline testgetrieben umgesetzt und vor dem Einspielen geprüft.',
  aboutRules: 'Regeln für die Agenten:',
  aboutWorkflow: 'Ablauf:',
  aboutSource: 'Quellcode',
  aboutGlossary: 'Glossar',
  keyAbout: 'Über Map Madness: Widmung, Credits, so entsteht das Spiel',
```

Run `node --test prototype/tests/strings.test.mjs` — PASS (same key sets).

- [ ] **Step 4: Markup** — in `prototype/index.html`:

(a) In `.bar .row.secondary`, after `#stylebtn2`:

```html
        <button id="aboutbtn" class="btn small" type="button" data-i18n="aboutBtn">About</button>
```

(b) Delete every `<small data-i18n="credit…" …></small>` line at the end of `#help` (`creditEiffel` … `creditPlattform`); keep the closing `</div>` of `#help` on the `#helpnone` line's block, i.e. `#help` now ends with `<div id="helpnone" hidden data-i18n="helpNone">No command matches</div></div>`.

(c) Right after the closing `</div>` of `#worlds`:

```html
<!-- #509 About: dedication, people, the game, credits, how it is built. Framed like #worlds; opened from the start screen,
     the pause menu (#pauseabout) and the command search (action:about). Links get href/target/rel from ABOUT_LINKS. -->
<div id="about" hidden role="dialog" aria-modal="true" aria-labelledby="abouttitle">
  <div class="ws-head">
    <h1 id="abouttitle" data-i18n="aboutTitle">About Map Madness</h1>
    <span class="ws-sub"></span>
    <button id="aboutback" class="btn" type="button" data-i18n="carselBack">‹ Back</button>
  </div>
  <section class="ab-dedication">
    <p id="aboutdedication" data-i18n="aboutDedication">This game is dedicated to Juliska</p>
    <dl class="ab-people">
      <dt>Tschosi "forwardare"<br>Ätti aka L.A. Brace</dt><dd data-i18n="aboutRoleTschosi"></dd>
      <dt>Kiscsi</dt><dd data-i18n="aboutRoleKiscsi"></dd>
    </dl>
  </section>
  <section class="ab-sec">
    <h2 data-i18n="aboutGameTitle">The game</h2>
    <p data-i18n="aboutGame"></p>
    <p><a data-link="midtown" data-i18n="aboutInspired"></a></p>
  </section>
  <section class="ab-sec">
    <h2>Credits</h2>
    <dl class="ab-credits">
      <dt data-i18n="aboutModels"></dt>
      <dd>
        <small data-i18n="creditEiffel"></small><small data-i18n="creditAtomium"></small><small data-i18n="creditTitanic"></small>
        <small data-i18n="creditHatchback"></small><small data-i18n="creditMini"></small><small data-i18n="creditBus"></small>
        <small data-i18n="creditModelT"></small><small data-i18n="creditRally"></small><small data-i18n="creditBeetle"></small>
        <small data-i18n="creditNewBeetle"></small>
      </dd>
      <dt data-i18n="aboutData"></dt>
      <dd><a data-link="osm" data-i18n="aboutOsm"></a><br><a data-link="swisstopo" data-i18n="aboutSwisstopo"></a></dd>
      <dt>Plattform Sisslerfeld</dt>
      <dd><a data-link="plattform" data-i18n="creditPlattform"></a></dd>
      <dt data-i18n="aboutLibs"></dt>
      <dd><a data-link="threejs">three.js</a> (MIT) · <a data-link="crashcat">crashcat · mathcat</a> (MIT) · <span data-i18n="aboutEditorLibs"></span> <a data-link="leaflet">Leaflet</a> (BSD-2-Clause) · <a data-link="altcha">ALTCHA</a> (MIT)</dd>
      <dt data-i18n="aboutFonts"></dt>
      <dd><a data-link="fonts" data-i18n="aboutFontsText"></a></dd>
    </dl>
  </section>
  <section class="ab-sec">
    <h2 data-i18n="aboutBuiltTitle"></h2>
    <p data-i18n="aboutBuilt"></p>
    <p><span data-i18n="aboutRules"></span> <a data-link="aiInstructions">ai-instructions</a> · <span data-i18n="aboutWorkflow"></span> <a data-link="agentWorkflow">agent-workflow</a></p>
    <p class="ab-foot"><a data-link="source" data-i18n="aboutSource"></a> · <a data-link="glossary" data-i18n="aboutGlossary"></a> · <span id="aboutversion"></span></p>
  </section>
</div>
```

If `#help` has gained further `credit*` lines by the time this runs, move those too: the test counts every `credit[A-Z]…` key of `STRINGS.en`.

(d) CSS, right after the `.ws-source{…}` rule:

```css
/* #509 About: the Worlds dialog's frame, one scrolling column */
#about{position:fixed;inset:0;z-index:12;display:flex;flex-direction:column;gap:16px;padding:16px 24px 24px;box-sizing:border-box;overflow-y:auto;overflow-x:hidden;background:var(--ink);color:#f5efe0}
#about[hidden]{display:none}
.ab-dedication{padding:20px;text-align:center;background:linear-gradient(#3a404b,#23272f);border:5px solid;border-color:var(--steel-l) var(--ink) var(--ink) var(--steel-l)}
#aboutdedication{margin:0 0 16px;font-family:Bungee,sans-serif;font-size:clamp(22px,4vw,36px);line-height:1.2;color:var(--sun)}
.ab-people,.ab-credits{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 16px;margin:0;text-align:left}
.ab-people{max-width:720px;margin:0 auto}
.ab-people dt{font-size:20px;font-weight:800;font-style:italic;color:var(--sun)}
.ab-people dd,.ab-credits dd{margin:0;font-size:16px;overflow-wrap:anywhere}
.ab-credits dt{font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--steel-l)}
.ab-credits small{display:block;font-size:15px}
.ab-sec h2{margin:0 0 8px;font-size:14px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--steel)}
.ab-sec p{margin:0 0 6px;font-size:16px;overflow-wrap:anywhere}
#about a{color:#8fd8e8}
.ab-foot{color:var(--steel-l)}
```

In the existing `@media (max-width:600px){ … }` block of the same stylesheet add:

```css
  #about{padding:12px 16px 16px;gap:12px}.ab-people,.ab-credits{grid-template-columns:minmax(0,1fr)}
```

Extend the two HUD-hiding rules (`body:has(#worlds:not([hidden])) :is(#tl,…)` and `…#tc>:not(#toast)`) with the same selectors for `#about`:

```css
body:has(#about:not([hidden])) :is(#tl,#tr,#bl,#br,#compass,#stylebtn,#pausebtn,#touch),
body:has(#about:not([hidden])) #tc>:not(#toast){display:none}
```

and in the `#game-nav` phone rule (`@media (max-width: 600px) { body:has(#overlay:not([hidden])) #game-nav, body:has(#worlds:not([hidden])) #game-nav, …`) add `body:has(#about:not([hidden])) #game-nav,` to the selector list.

- [ ] **Step 5: JS** — in `prototype/index.html`:

(a) Import, next to the other module imports:

```js
import { ABOUT_LINKS, aboutKeyAction, aboutReturn } from './about.js';   // #509
```

(b) Right after `function closeWorlds() { … }`:

```js
// #509: the About dialog -- over the start screen (Back returns there) or over the paused game (Back returns to the pause menu)
const ABOUT = { on: false, from: 'start' };
for (const a of document.querySelectorAll('#about a[data-link]')) { a.href = ABOUT_LINKS[a.dataset.link]; a.target = '_blank'; a.rel = 'noopener'; }
$('aboutversion').textContent = `v${window.GAME_VERSION}`;
function openAbout(from) { ABOUT.on = true; ABOUT.from = from; for (const k in keys) keys[k] = false; closeHelp(); $(from === 'pause' ? 'pause' : 'overlay').hidden = true; $('about').hidden = false; $('about').scrollTop = 0; $('aboutback').focus(); }
function closeAbout() { if (!ABOUT.on) return; ABOUT.on = false; $('about').hidden = true; const back = ABOUT.from === 'pause'; $(back ? 'pause' : 'overlay').hidden = false; $(back ? 'pauseabout' : 'aboutbtn').focus(); }
function showAbout() { if (aboutReturn(inRun()) === 'pause') { openPause(); openAbout('pause'); } else openAbout('start'); }   // from the command search: a run is paused first
function aboutKey(e) { if (aboutKeyAction(e) === 'back') { e.preventDefault(); if (!e.repeat) closeAbout(); } }   // 'pass': native Tab / Enter / Space; 'ignore': no game key while About is open
$('aboutbtn').onclick = () => openAbout('start'); $('aboutback').onclick = closeAbout;
window.__mm.about = () => ({ open: ABOUT.on, from: ABOUT.from });
```

(c) In the `keydown` listener, right after `if (WORLDS.on) { worldsKey(e); return; }`:

```js
if (ABOUT.on) { aboutKey(e); return; }
```

- [ ] **Step 6: Start-screen test** — in `prototype/tests/test_start_screen.py`:

```python
SECONDARY = ["worldbtn", "stylebtn2", "aboutbtn"]
```

- [ ] **Step 7: Run tests**

Run: `node --test prototype/tests/*.test.mjs` — all pass.
Commit and push first, then run: `python3 -m pytest prototype/tests/test_about.py prototype/tests/test_start_screen.py prototype/tests/test_help_filter.py prototype/tests/test_credits.py -q`
Expected: PASS (`test_credits.py` still finds every `data-i18n="credit…"` attribute in `index.html`, now inside `#about`)

- [ ] **Step 8: CHANGELOG** — under `## [Unreleased]` → `### Added`:

```markdown
- `YYYY-MM-DD HH:MM` **About Map Madness**: a new **About** button on the start screen opens a page with the **dedication** („This game is dedicated to Juliska“), the people who helped (tester **Tschosi "forwardare" Ätti aka L.A. Brace**, and **Kiscsi**, whose idea it was to race over the Holzbrücke), what the game is, every **credit** (3D models, OpenStreetMap and swisstopo data, the Verein Plattform Sisslerfeld, libraries, fonts) and **how the game is built** with AI coding agents, with links. The model credits are no longer at the bottom of the command search.
```

(use the commit's local date and time)

- [ ] **Step 9: Commit**

```bash
git add prototype/about.js prototype/strings.js prototype/index.html prototype/tests/test_about.py prototype/tests/test_start_screen.py CHANGELOG.md
git commit -m "feat(ui): About Map Madness from the start screen (#509)"
```

### Task 5: About from the pause menu and the command search

**Files:**
- Modify: `prototype/index.html` (`#pauseabout` button, its handler, the help row, `runHelpRow`)
- Test: `prototype/tests/test_about.py` (append)

**Interfaces:**
- Consumes: `openAbout`, `closeAbout`, `showAbout`, `window.__mm.about()` (Task 4); `commandAction` (Task 2); `PAUSE_BUTTONS` with `'pauseabout'` (Task 3).

- [ ] **Step 1: Write the failing tests** (append to `prototype/tests/test_about.py`)

```python
def start_race(page):
    page.click("#startbtn")
    page.wait_for_function("() => window.__mm.pause().state === 'armed' || window.__mm.pause().state === 'racing'", timeout=120000)


def test_pause_menu_opens_about_and_back_returns_to_the_pause_menu(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_race(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=60000)
        order = page.evaluate("() => [...document.querySelectorAll('#pause .col > button')].map(e => e.id)")
        page.click("#pauseabout")
        opened = page.evaluate("() => ({ about: window.__mm.about(), pause: !document.getElementById('pause').hidden })")
        page.keyboard.press("Escape")
        after = page.evaluate("() => ({ about: window.__mm.about().open, pauseShown: !document.getElementById('pause').hidden, paused: window.__mm.pause().on, focus: document.activeElement.id })")
        b.close()
    assert order == ["pauseresume", "pausevehicle", "pauseabout", "pauserestart", "pausemenu"], order
    assert opened == {"about": {"open": True, "from": "pause"}, "pause": False}, opened
    assert after == {"about": False, "pauseShown": True, "paused": True, "focus": "pauseabout"}, after   # Esc goes back, it does not resume
    assert errors == []


def test_command_search_opens_about_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.keyboard.press("Control+KeyP")
        page.wait_for_function("() => !document.getElementById('help').hidden", timeout=60000)
        page.fill("#helpq", "about")
        page.keyboard.press("Enter")
        state = page.evaluate("() => ({ about: window.__mm.about(), help: !document.getElementById('help').hidden })")
        b.close()
    assert state == {"about": {"open": True, "from": "start"}, "help": False}, state


def test_command_search_during_a_race_pauses_first(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_race(page)
        page.keyboard.press("Control+KeyP")
        page.wait_for_function("() => !document.getElementById('help').hidden", timeout=60000)
        page.fill("#helpq", "about")
        page.keyboard.press("Enter")
        state = page.evaluate("() => ({ about: window.__mm.about(), paused: window.__mm.pause().on })")
        page.click("#aboutback")
        back = page.evaluate("() => ({ pauseShown: !document.getElementById('pause').hidden, paused: window.__mm.pause().on })")
        b.close()
    assert state == {"about": {"open": True, "from": "pause"}, "paused": True}, state   # the clock never runs behind the dialog
    assert back == {"pauseShown": True, "paused": True}, back
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest prototype/tests/test_about.py -k "pause_menu or command_search" -q`
Expected: FAIL — `#pauseabout` not found; the help has no row matching „about“

- [ ] **Step 3: Implementation** — in `prototype/index.html`:

(a) `#pause` markup, after `#pausevehicle`:

```html
      <button id="pauseabout" class="btn" type="button" data-i18n="aboutBtn">About</button>
```

(b) Next to the other pause handlers (`$('pausebtn').onclick = …`):

```js
$('pauseabout').onclick = () => openAbout('pause');   // #509
```

(c) The help row, right before the `F1 · ?` row in `#help`:

```html
      <kbd data-cmd="action:about">ⓘ</kbd><span data-i18n="keyAbout">About Map Madness: dedication, credits, how it is built</span>
```

(d) `runHelpRow` runs actions:

```js
const HELP_ACTIONS = { about: () => showAbout() };   // #509: command-search rows that run a game function (data-cmd="action:<name>")
function runHelpRow(index) {   // #190: close the help, then press the row's key as the player would — the normal handler applies its own rules
  const row = helpRows().find(r => r.index === index); if (!row) return;
  const action = commandAction(row.kbd.dataset.cmd);
  if (action) { closeHelp(); HELP_ACTIONS[action]?.(); return; }
  const init = commandEventInit(row.kbd.dataset.cmd);
  if (!init) return;
  closeHelp(); dispatchEvent(new KeyboardEvent('keydown', init)); dispatchEvent(new KeyboardEvent('keyup', init));
}
```

and add `commandAction` to the existing `import { filterHelpRows, isHoldCommand, commandEventInit, moveSelection } from './helpfilter.js';`.

- [ ] **Step 4: Run tests**

Run: `node --test prototype/tests/*.test.mjs` — all pass.
Commit and push first, then: `python3 -m pytest prototype/tests/test_about.py prototype/tests/test_pause.py prototype/tests/test_help_filter.py -q`
Expected: PASS once `prototype/tests/test_pause.py` knows the new button. Two places there list the pause buttons literally and must follow the spec's new order (`pauseabout` right after `pausevehicle`):
  - the focus walk around line 137 (`assert seen == ["pauseresume", "pausevehicle", "pauserestart", "pausemenu", …]`): re-derive the expected list from the keys that test presses, with five buttons instead of four;
  - the layout probe around line 247 (`buttons: ['pauseresume', 'pausevehicle', 'pauserestart', 'pausemenu'].map(…)`): add `'pauseabout'` after `'pausevehicle'`.
  Include `prototype/tests/test_pause.py` in this task's commit.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_about.py prototype/tests/test_pause.py
git commit -m "feat(ui): About from the pause menu and the command search (#509)"
```

The PR body says `Closes #509` and `Closes #267` (#267 asked for the same credits screen; its two names are in the dialog).
