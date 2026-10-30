# About Dialog in Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The About dialog (#509) keeps the dedication fixed on top and splits the rest into four accessible tabs (People · The game · Credits · How it is built) with the footer always visible; "How it is built" lists every agent and LLM; Kiscsi's role names the Holzbrücke, the Robidogs, the flying poo piles and "many other ideas …".

**Architecture:** Same static `#about` dialog in `prototype/index.html`. The tab rules (order, arrow/Home/End navigation) are pure in `prototype/about.js` (node-testable); the page wires them (`selectAboutTab`, click, key). Texts in `prototype/strings.js` (en + de).

**Tech Stack:** Vanilla JS ES modules, buildless; `node --test`; Python Playwright (one new file).

**Spec:** `docs/superpowers/specs/2026-10-30-about-tabs-design.md`

## Global Constraints

- Buildless: no new dependency, bundler or `package.json`.
- Every text in `prototype/strings.js` in **both** `en` and `de`, same key set (`prototype/tests/strings.test.mjs`).
- German: capitalised Du/Dir/Dein, real umlauts, `ss` not `ß`.
- Keep `ABOUT_LINKS` (same 13 ids), the entry points (`#aboutbtn`, `#pauseabout`, command search `action:about`) and `Escape` / Back behaviour (`aboutKeyAction` → `'back'`, `closeAbout`, `aboutReturn`).
- `window.__mm.about()` keeps returning exactly `{ open, from }` (existing tests deep-equal it); the tab is exposed by a new `window.__mm.aboutTab()`.
- Game keys must still not reach the game while About is open (arrow keys included).
- No framework, no `eval`. Playwright runs in the foreground, only `test_about_tabs.py` and `test_about.py`, never the full suite; commit and push before running them.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added`, in the file's existing style (English, `YYYY-MM-DD HH:MM` Zurich time prefix).

## Review Focus

- Accessibility: `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`/`aria-labelledby`, roving `tabindex`, inactive panels `hidden` — pinned in Task 4.
- The footer and the tab row stay inside the viewport on every tab, also at 375 px width, and the dialog never scrolls sideways — pinned in Task 4.
- Arrow keys on a focused tab switch tabs but never reach the game (`keysDown()` stays empty) — pinned in Task 4.
- Opening About again (also via Back from the pause menu) starts on the first tab — pinned in Task 4.
- The agent list matches `.github/workflows/agent.yml` (GLM 5.3 implements, Sonnet reviews); if the workflow models changed since this plan, update the strings, not the plan's intent.

---

### Task 1: `about.js` — tab order and tab keys

**Files:**
- Modify: `prototype/about.js`
- Test: `prototype/tests/about.test.mjs`

**Interfaces:**
- Produces: `ABOUT_TABS` (frozen `['people','game','credits','built']`), `aboutTabIndex(code, current) → number | null`, `aboutKeyAction` additionally returns `'tab'` for `ArrowLeft`, `ArrowRight`, `Home`, `End`.

- [ ] **Step 1: Write the failing tests** — change the import line of `prototype/tests/about.test.mjs` to
  `import { ABOUT_LINKS, ABOUT_TABS, aboutKeyAction, aboutReturn, aboutTabIndex } from '../about.js';`
  and append:

```js
test('ABOUT_TABS: the four tabs in order, frozen', () => {
  assert.deepEqual([...ABOUT_TABS], ['people', 'game', 'credits', 'built']);
  assert.ok(Object.isFrozen(ABOUT_TABS));
});

test('aboutTabIndex: arrows wrap, Home/End jump, other keys give null', () => {
  assert.equal(aboutTabIndex('ArrowRight', 0), 1);
  assert.equal(aboutTabIndex('ArrowRight', 3), 0);
  assert.equal(aboutTabIndex('ArrowLeft', 1), 0);
  assert.equal(aboutTabIndex('ArrowLeft', 0), 3);
  assert.equal(aboutTabIndex('Home', 2), 0);
  assert.equal(aboutTabIndex('End', 1), 3);
  for (const code of ['ArrowUp', 'ArrowDown', 'KeyW', 'Tab']) assert.equal(aboutTabIndex(code, 1), null, code);
});

test('aboutKeyAction: the tab keys are claimed as tab, the other game keys stay ignored', () => {
  for (const code of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.equal(aboutKeyAction({ code }), 'tab', code);
  for (const code of ['ArrowUp', 'ArrowDown', 'KeyW']) assert.equal(aboutKeyAction({ code }), 'ignore', code);
  assert.equal(aboutKeyAction({ code: 'Escape' }), 'back');
});
```

- [ ] **Step 2: Run, see it fail:** `node --test prototype/tests/about.test.mjs` → import error / failures.

- [ ] **Step 3: Implement** — in `prototype/about.js` replace the `PASS` / `aboutKeyAction` block with:

```js
const PASS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space']);
const TAB_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

// #564: the tabs under the fixed dedication; ids match #abouttab-<id> / #aboutpanel-<id> in index.html
export const ABOUT_TABS = Object.freeze(['people', 'game', 'credits', 'built']);

// the tab a navigation key leads to from `current` (arrows wrap, Home/End jump), null for any other key
export function aboutTabIndex(code, current) {
  const n = ABOUT_TABS.length;
  if (code === 'ArrowRight') return (current + 1) % n;
  if (code === 'ArrowLeft') return (current - 1 + n) % n;
  if (code === 'Home') return 0;
  if (code === 'End') return n - 1;
  return null;
}

// like worldsKeyAction (startscreen.js): the dialog owns the keyboard while it is open
export function aboutKeyAction(e) {
  if (e.code === 'Escape') return 'back';
  if (TAB_KEYS.has(e.code)) return 'tab';
  return PASS.has(e.code) ? 'pass' : 'ignore';
}
```

- [ ] **Step 4: Run, see it pass:** `node --test prototype/tests/about.test.mjs`.
- [ ] **Step 5: Commit:** `feat(ui): about tab rules (#564)`.

---

### Task 2: Strings — Kiscsi's ideas, tab label, agents and LLMs

**Files:**
- Modify: `prototype/strings.js` (en block ~262-279, de block ~674-691)
- Test: `prototype/tests/strings.test.mjs`

- [ ] **Step 1: Write the failing tests** — append to `prototype/tests/strings.test.mjs`:

```js
test('About (#564): Kiscsi\'s ideas name the bridge, Robidogs and flying poo piles, then "and many more"', () => {
  assert.match(translate('en', 'aboutRoleKiscsi'), /Holzbrücke.*Robidogs.*poo piles.*many other ideas …$/);
  assert.match(translate('de', 'aboutRoleKiscsi'), /Holzbrücke.*Robidogs.*Häufchen.*viele andere Ideen mehr …$/);
});

test('About (#564): every agent and LLM of the pipeline is listed in both languages', () => {
  const rows = ['Impl', 'Review', 'Design', 'Local', 'Early', 'Helper', 'Mockup'];
  for (const lang of ['en', 'de']) {
    for (const r of rows) {
      assert.ok(translate(lang, `aboutAg${r}Role`).length > 0, `${lang} ${r}Role`);
      assert.ok(translate(lang, `aboutAg${r}`).length > 0, `${lang} ${r}`);
    }
    const all = rows.map((r) => translate(lang, `aboutAg${r}`)).join(' | ');
    for (const needle of ['OpenCode', 'GLM 5.3', 'Claude Code', 'Sonnet', 'Fable', 'Opus', 'Haiku', 'Claude Design']) assert.ok(all.includes(needle), `${lang}: ${needle}`);
  }
});

test('About (#564): the tab labels exist in both languages', () => {
  assert.equal(translate('en', 'aboutTabPeople'), 'People');
  assert.equal(translate('de', 'aboutTabPeople'), 'Leute');
  assert.equal(translate('de', 'aboutBuiltTitle'), 'So ist es gebaut');
});
```

- [ ] **Step 2: Run, see it fail:** `node --test prototype/tests/strings.test.mjs`.

- [ ] **Step 3: Implement** — in the **en** block: replace `aboutRoleKiscsi` and `aboutBuilt`, and after `aboutBuiltTitle` / before `aboutRules` add the new keys:

```js
  aboutRoleKiscsi: 'Ideas: racing over the Holzbrücke, the Robidogs, flying poo piles and many other ideas …',
  aboutTabPeople: 'People',
  aboutBuilt: 'Map Madness is built with AI coding agents: every change starts as a GitHub issue, gets a spec and a plan, is implemented test-first by an agent pipeline and reviewed before it ships. Who does what:',
  aboutAgImplRole: 'Implementation', aboutAgImpl: 'OpenCode with GLM 5.3 (z.ai, via OpenRouter)',
  aboutAgReviewRole: 'Review and re-review', aboutAgReview: 'Claude Code with Claude Sonnet',
  aboutAgDesignRole: 'Design and graphics', aboutAgDesign: 'Claude Code with Claude Fable',
  aboutAgLocalRole: 'Specs, plans, tests', aboutAgLocal: 'Claude Code with Claude Opus, in local sessions',
  aboutAgEarlyRole: 'Implementation until 10 Oct 2026', aboutAgEarly: 'Claude Code with Claude Opus',
  aboutAgHelperRole: 'Small helper tasks', aboutAgHelper: 'Claude Code with Claude Haiku',
  aboutAgMockupRole: 'UI mockups', aboutAgMockup: 'Claude Design',
```

  In the **de** block: replace `aboutRoleKiscsi`, `aboutBuiltTitle`, `aboutBuilt` and add:

```js
  aboutRoleKiscsi: 'Ideen: Holzbrücke, Robidogs, fliegende Häufchen und viele andere Ideen mehr …',
  aboutTabPeople: 'Leute',
  aboutBuiltTitle: 'So ist es gebaut',
  aboutBuilt: 'Map Madness entsteht mit KI-Agenten: Jede Änderung beginnt als GitHub-Issue, bekommt eine Spec und einen Plan, wird von einer Agenten-Pipeline testgetrieben umgesetzt und vor dem Einspielen geprüft. Wer was macht:',
  aboutAgImplRole: 'Umsetzung', aboutAgImpl: 'OpenCode mit GLM 5.3 (z.ai, über OpenRouter)',
  aboutAgReviewRole: 'Prüfung und erneute Prüfung', aboutAgReview: 'Claude Code mit Claude Sonnet',
  aboutAgDesignRole: 'Design und Grafik', aboutAgDesign: 'Claude Code mit Claude Fable',
  aboutAgLocalRole: 'Specs, Pläne, Tests', aboutAgLocal: 'Claude Code mit Claude Opus, in lokalen Sitzungen',
  aboutAgEarlyRole: 'Umsetzung bis 10. Okt. 2026', aboutAgEarly: 'Claude Code mit Claude Opus',
  aboutAgHelperRole: 'Kleine Hilfsaufgaben', aboutAgHelper: 'Claude Code mit Claude Haiku',
  aboutAgMockupRole: 'UI-Mockups', aboutAgMockup: 'Claude Design',
```

  Delete the old duplicate keys so each key appears once per block (`aboutBuiltTitle` in en stays as is).

- [ ] **Step 4: Run, see it pass:** `node --test prototype/tests/strings.test.mjs`.
- [ ] **Step 5: Commit:** `feat(ui): about texts for tabs, agents and Kiscsi's ideas (#564)`.

---

### Task 3: Markup, CSS and wiring in `prototype/index.html`

**Files:**
- Modify: `prototype/index.html` (CSS ~lines 166-181 and the phone rule ~line 190; markup ~467-512; script ~594 import and ~4157-4165)

**Interfaces:**
- Consumes: `ABOUT_TABS`, `aboutTabIndex`, `aboutKeyAction` (Task 1), strings (Task 2).
- Produces: `#aboutpanels` (scroll area), `#abouttab-<id>`, `#aboutpanel-<id>`, `window.__mm.aboutTab()` → active tab id.

- [ ] **Step 1: CSS** — in the `/* #509 About … */` block make these changes:
  - `#about{…overflow-y:auto;overflow-x:hidden;…}` → `overflow:hidden` (the panel area scrolls instead).
  - `.ab-dedication{padding:20px;…}` → `padding:14px 20px`; `#aboutdedication{margin:0 0 16px;…}` → `margin:0`.
  - Add after `.ab-sec p{…}`:

```css
.ab-tabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:5px solid var(--steel-l)}
.ab-tabs [role=tab]{flex:1 1 0;min-width:max-content;min-height:44px;padding:0 14px;font:inherit;font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;color:var(--steel-l);background:#23272f;border:3px solid;border-color:var(--steel) var(--ink) transparent var(--steel)}
.ab-tabs [role=tab][aria-selected=true]{color:var(--ink);background:var(--steel-l)}
.ab-tabs [role=tab]:focus-visible{outline:3px solid var(--sun);outline-offset:-3px}
.ab-panels{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden}
.ab-panel[hidden]{display:none}
.ab-foot{margin:0;padding-top:10px;border-top:3px solid var(--steel)}
```
  - Remove the old `.ab-foot{color:var(--steel-l)}` line's duplicate by merging: keep `color:var(--steel-l)` in the new rule.
  - Phone rule: `#about{padding:12px 16px 16px;gap:12px}` stays; add `.ab-tabs [role=tab]{flex-basis:40%;padding:0 8px;letter-spacing:1px}`.

- [ ] **Step 2: Markup** — replace everything inside `<div id="about" …>` after the `.ws-head` block (from `<section class="ab-dedication">` to the closing `</div>` of `#about`) with:

```html
  <section class="ab-dedication">
    <p id="aboutdedication" data-i18n="aboutDedication">This game is dedicated to Juliska</p>
  </section>
  <div class="ab-tabs" role="tablist" aria-labelledby="abouttitle">
    <button id="abouttab-people" type="button" role="tab" aria-selected="true" aria-controls="aboutpanel-people" data-i18n="aboutTabPeople">People</button>
    <button id="abouttab-game" type="button" role="tab" aria-selected="false" tabindex="-1" aria-controls="aboutpanel-game" data-i18n="aboutGameTitle">The game</button>
    <button id="abouttab-credits" type="button" role="tab" aria-selected="false" tabindex="-1" aria-controls="aboutpanel-credits" data-i18n="aboutCredits">Credits</button>
    <button id="abouttab-built" type="button" role="tab" aria-selected="false" tabindex="-1" aria-controls="aboutpanel-built" data-i18n="aboutBuiltTitle">How it is built</button>
  </div>
  <div id="aboutpanels" class="ab-panels">
    <section id="aboutpanel-people" class="ab-sec ab-panel" role="tabpanel" aria-labelledby="abouttab-people">
      <dl class="ab-people">
        <dt>Tschosi "forwardare"<br>Ätti aka L.A. Brace</dt><dd data-i18n="aboutRoleTschosi"></dd>
        <dt>Kiscsi</dt><dd data-i18n="aboutRoleKiscsi"></dd>
      </dl>
    </section>
    <section id="aboutpanel-game" class="ab-sec ab-panel" role="tabpanel" aria-labelledby="abouttab-game" hidden>
      <p data-i18n="aboutGame"></p>
      <p><a data-link="midtown" data-i18n="aboutInspired"></a></p>
    </section>
    <section id="aboutpanel-credits" class="ab-sec ab-panel" role="tabpanel" aria-labelledby="abouttab-credits" hidden>
      <!-- the existing <dl class="ab-credits"> … </dl> block, moved here unchanged -->
    </section>
    <section id="aboutpanel-built" class="ab-sec ab-panel" role="tabpanel" aria-labelledby="abouttab-built" hidden>
      <p data-i18n="aboutBuilt"></p>
      <dl class="ab-credits ab-agents">
        <dt data-i18n="aboutAgImplRole"></dt><dd data-i18n="aboutAgImpl"></dd>
        <dt data-i18n="aboutAgReviewRole"></dt><dd data-i18n="aboutAgReview"></dd>
        <dt data-i18n="aboutAgDesignRole"></dt><dd data-i18n="aboutAgDesign"></dd>
        <dt data-i18n="aboutAgLocalRole"></dt><dd data-i18n="aboutAgLocal"></dd>
        <dt data-i18n="aboutAgEarlyRole"></dt><dd data-i18n="aboutAgEarly"></dd>
        <dt data-i18n="aboutAgHelperRole"></dt><dd data-i18n="aboutAgHelper"></dd>
        <dt data-i18n="aboutAgMockupRole"></dt><dd data-i18n="aboutAgMockup"></dd>
      </dl>
      <p><span data-i18n="aboutRules"></span> <a data-link="aiInstructions">ai-instructions</a> · <span data-i18n="aboutWorkflow"></span> <a data-link="agentWorkflow">agent-workflow</a></p>
    </section>
  </div>
  <p class="ab-foot"><a data-link="source" data-i18n="aboutSource"></a> · <a data-link="glossary" data-i18n="aboutGlossary"></a> · <span id="aboutversion"></span></p>
```
  Move the full existing `<dl class="ab-credits">…</dl>` (models, data, Plattform, libraries, fonts) into `#aboutpanel-credits` byte for byte; the `<h2>` headings of the old sections are dropped. Update the comment above `#about` to mention #564 (tabs).

- [ ] **Step 3: Wiring** — line ~594: `import { ABOUT_LINKS, ABOUT_TABS, aboutKeyAction, aboutReturn, aboutTabIndex } from './about.js';   // #509, #564`. Replace the About block (lines ~4157-4165) so that it reads:

```js
const ABOUT = { on: false, from: 'start', tab: 0 };
for (const a of document.querySelectorAll('#about a[data-link]')) { a.href = ABOUT_LINKS[a.dataset.link]; a.target = '_blank'; a.rel = 'noopener'; }
$('aboutversion').textContent = `v${window.GAME_VERSION}`;
const aboutTabs = () => [...document.querySelectorAll('#about [role=tab]')];
// #564: show tab i (aria-selected, roving tabindex, only its panel visible); focus = move the keyboard focus onto it
function selectAboutTab(i, focus) { ABOUT.tab = i; aboutTabs().forEach((t, j) => { t.setAttribute('aria-selected', String(j === i)); t.tabIndex = j === i ? 0 : -1; $(t.getAttribute('aria-controls')).hidden = j !== i; }); $('aboutpanels').scrollTop = 0; if (focus) aboutTabs()[i].focus(); }
aboutTabs().forEach((t, j) => { t.onclick = () => selectAboutTab(j, false); });
function openAbout(from) { ABOUT.on = true; ABOUT.from = from; for (const k in keys) keys[k] = false; closeHelp(); $(from === 'pause' ? 'pause' : 'overlay').hidden = true; $('about').hidden = false; selectAboutTab(0, false); $('aboutback').focus(); }
```
  Keep `closeAbout` and `showAbout` as they are. Replace `aboutKey` and the exports line:

```js
function aboutKey(e) {
  const action = aboutKeyAction(e);
  if (action === 'back') { e.preventDefault(); if (!e.repeat) closeAbout(); return; }
  if (action !== 'tab') return;   // 'pass': native Tab / Enter / Space; 'ignore': no game key while About is open
  const at = aboutTabs().indexOf(document.activeElement);
  if (at < 0) return;             // arrows outside the tab row do nothing (the game must not see them either: we returned from the keydown chain)
  e.preventDefault(); selectAboutTab(aboutTabIndex(e.code, at), true);
}
$('aboutbtn').onclick = () => openAbout('start'); $('aboutback').onclick = closeAbout;
window.__mm.about = () => ({ open: ABOUT.on, from: ABOUT.from });
window.__mm.aboutTab = () => ABOUT_TABS[ABOUT.tab];
```

- [ ] **Step 4: Quick static check (no browser):** `node --check` is not possible for inline module; instead `node --test prototype/tests/*.test.mjs` for the touched modules (`about`, `strings`) and `python3 -c "import html.parser,sys; html.parser.HTMLParser().feed(open('prototype/index.html').read())"` to catch broken markup. Check `grep -c 'role="tabpanel"' prototype/index.html` prints 4.
- [ ] **Step 5: Commit and push the branch:** `feat(ui): about dialog in tabs (#564)`.

---

### Task 4: Playwright — `test_about_tabs.py` and the adjusted `test_about.py`

**Files:**
- Create: `prototype/tests/test_about_tabs.py`
- Modify: `prototype/tests/test_about.py` (`test_german_texts`)

- [ ] **Step 1: Write the tests** (they fail until Task 3 is in; Task 3 is already committed, so this is the verification of the whole feature). `prototype/tests/test_about_tabs.py`:

```python
"""#564: the About dialog in tabs -- roles, keyboard, touch, footer always visible, Kiscsi's ideas, the agent list.
Slow (Playwright): run in the foreground, only this file and test_about.py."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
IDS = ["people", "game", "credits", "built"]


def boot(p, server, locale="en-US", viewport=(1280, 720), touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale=locale, has_touch=touch)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def shown(page):
    return page.evaluate("() => [...document.querySelectorAll('#about [role=tabpanel]')].filter(p => !p.hidden).map(p => p.id)")


def test_tab_roles_and_first_tab_active_on_open(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        info = page.evaluate("""() => ({
          list: document.querySelector('#about [role=tablist]') !== null,
          tabs: [...document.querySelectorAll('#about [role=tab]')].map(t => [t.id, t.getAttribute('aria-selected'), t.tabIndex, t.getAttribute('aria-controls'), t.textContent.trim()]),
          labelled: [...document.querySelectorAll('#about [role=tabpanel]')].map(p => [p.id, p.getAttribute('aria-labelledby')]),
          dedicationAboveTabs: !!(document.querySelector('#aboutdedication').compareDocumentPosition(document.querySelector('#about [role=tablist]')) & Node.DOCUMENT_POSITION_FOLLOWING),
          tab: window.__mm.aboutTab() })""")
        open_panels = shown(page)
        b.close()
    assert info["list"] and info["dedicationAboveTabs"]
    assert info["tabs"] == [
        ["abouttab-people", "true", 0, "aboutpanel-people", "People"],
        ["abouttab-game", "false", -1, "aboutpanel-game", "The game"],
        ["abouttab-credits", "false", -1, "aboutpanel-credits", "Credits"],
        ["abouttab-built", "false", -1, "aboutpanel-built", "How it is built"]], info["tabs"]
    assert info["labelled"] == [[f"aboutpanel-{i}", f"abouttab-{i}"] for i in IDS], info["labelled"]
    assert info["tab"] == "people" and open_panels == ["aboutpanel-people"], (info, open_panels)
    assert errors == []


def test_arrow_keys_home_end_and_the_game_never_sees_them(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        page.focus("#abouttab-people")
        seen = []
        for key in ["ArrowRight", "ArrowRight", "End", "ArrowRight", "ArrowLeft", "Home"]:
            page.keyboard.press(key)
            seen.append((page.evaluate("() => window.__mm.aboutTab()"), page.evaluate("() => document.activeElement.id")))
        page.keyboard.press("ArrowRight")
        page.keyboard.press("KeyW")
        held = page.evaluate("() => window.__mm.keysDown()")
        b.close()
    assert seen == [("game", "abouttab-game"), ("credits", "abouttab-credits"), ("built", "abouttab-built"),
                    ("people", "abouttab-people"), ("built", "abouttab-built"), ("people", "abouttab-people")], seen
    assert held == [], held
    assert errors == []


def test_click_and_tap_select_a_tab_and_show_only_its_panel(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, touch=True)
        page.tap("#aboutbtn")
        page.tap("#abouttab-credits")
        after_tap = (page.evaluate("() => window.__mm.aboutTab()"), shown(page))
        page.click("#abouttab-built")
        after_click = (page.evaluate("() => window.__mm.aboutTab()"), shown(page))
        b.close()
    assert after_tap == ("credits", ["aboutpanel-credits"]), after_tap
    assert after_click == ("built", ["aboutpanel-built"]), after_click


def test_escape_still_goes_back_and_reopening_starts_on_the_first_tab(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        page.click("#abouttab-built")
        page.keyboard.press("Escape")
        closed = page.evaluate("() => ({ about: window.__mm.about(), overlay: !document.getElementById('overlay').hidden, focus: document.activeElement.id })")
        page.click("#aboutbtn")
        again = (page.evaluate("() => window.__mm.aboutTab()"), shown(page))
        b.close()
    assert closed == {"about": {"open": False, "from": "start"}, "overlay": True, "focus": "aboutbtn"}, closed
    assert again == ("people", ["aboutpanel-people"]), again


def test_footer_and_tabs_stay_in_view_on_every_tab_desktop_and_phone(server):
    with sync_playwright() as p:
        for viewport in [(1280, 720), (375, 740)]:
            b, page, errors = boot(p, server, viewport=viewport)
            page.click("#aboutbtn")
            for i in IDS:
                page.click(f"#abouttab-{i}")
                r = page.evaluate("""() => { const q = s => document.querySelector(s).getBoundingClientRect();
                  return { foot: [q('.ab-foot').top, q('.ab-foot').bottom], tabs: [q('[role=tablist]').top, q('[role=tablist]').bottom], vh: innerHeight,
                           side: [document.getElementById('about').scrollWidth, document.getElementById('about').clientWidth, document.documentElement.scrollWidth, innerWidth] }; }""")
                assert 0 <= r["tabs"][0] and r["tabs"][1] <= r["foot"][0] and r["foot"][1] <= r["vh"] + 1, (viewport, i, r)
                assert r["side"][0] <= r["side"][1] and r["side"][2] <= r["side"][3], (viewport, i, r)
            b.close()


def test_kiscsis_ideas_and_the_agent_list(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        people = page.inner_text("#aboutpanel-people")
        page.click("#abouttab-built")
        built = page.inner_text("#aboutpanel-built")
        b.close()
    for word in ["Holzbrücke", "Robidogs", "poo piles", "many other ideas …"]:
        assert word in people, (word, people)
    for word in ["OpenCode", "GLM 5.3", "Claude Sonnet", "Claude Fable", "Claude Opus", "Claude Haiku", "Claude Design"]:
        assert word in built, (word, built)


def test_german_tabs_and_ideas(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, locale="de-CH")
        page.click("#aboutbtn")
        labels = page.evaluate("() => [...document.querySelectorAll('#about [role=tab]')].map(t => t.textContent.trim())")
        people = page.inner_text("#aboutpanel-people")
        b.close()
    assert labels == ["Leute", "Das Spiel", "Credits", "So ist es gebaut"], labels
    assert "Robidogs" in people and "fliegende Häufchen" in people and "viele andere Ideen mehr …" in people, people
```

- [ ] **Step 2: Adjust `test_about.py::test_german_texts`** — the `h2` headings are gone. Replace the `headers = …` line with
  `headers = page.evaluate("() => [...document.querySelectorAll('#about [role=tab]')].map(t => t.dataset.i18n + ':' + t.textContent.trim())")`
  and the last assertion with `assert "aboutCredits:Credits" in headers, headers`.

- [ ] **Step 3: Commit and push** (before running): `test(ui): about tabs (#564)`.
- [ ] **Step 4: Run in the foreground, only these files:** `python3 -m pytest prototype/tests/test_about_tabs.py prototype/tests/test_about.py -x -q` (generous `timeout`, never `run_in_background`). Expected: all pass. If a test fails 3 times, stop and report.

---

### Task 5: Changelog and final check

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1:** Add as the first bullet under `## [Unreleased]` → `### Added` (get the time with `TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`):

```
- `<date time>` The **About** page is now split into **four tabs**: **People**, **The game**, **Credits** and **How it is built**, so everything fits without scrolling through one long page. The dedication to Juliska stays on top and the links to the source code and glossary stay at the bottom. Switch tabs by tapping them or with the <kbd>←</kbd> <kbd>→</kbd> keys. **How it is built** now names every agent and model that works on the game: OpenCode with GLM, and Claude Code with Sonnet, Fable, Opus and Haiku, plus Claude Design for the mockups. **Kiscsi**'s ideas are credited in full: the Holzbrücke, the Robidogs, the flying poo piles — and many other ideas …
```

- [ ] **Step 2: Final check:** `node --test prototype/tests/about.test.mjs prototype/tests/strings.test.mjs prototype/tests/pause.test.mjs prototype/tests/helpfilter.test.mjs` all green (the `Playwright` run of Task 4 already covered the page). Do **not** run the full suite.
- [ ] **Step 3: Commit:** `docs: changelog for the About tabs (#564)`; open the PR with `Closes #564`.
