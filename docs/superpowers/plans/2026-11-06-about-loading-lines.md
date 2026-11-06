# The loading-screen lines in About (#695): implementation plan

**Goal:** About gets a fifth tab "While loading" / "Beim Laden" listing the 13 loading lines in stage order, with the counts shown
while loading, following the language toggle.

**Spec:** [docs/superpowers/specs/2026-11-06-about-loading-lines-design.md](../specs/2026-11-06-about-loading-lines-design.md)

**Global constraints:**
- Buildless: no new dependency, no bundler. `loading.js` and `about.js` stay pure (no DOM).
- Tests: node (`node --test tests/loading.test.mjs tests/about.test.mjs`, then the full `node --test tests/`), and Playwright
  **only** `tests/test_about_tabs.py` (foreground, generous timeout). Do not run the whole Playwright suite.
- Commit and push after each task.
- CHANGELOG entry under `[Unreleased]` → `### Added`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.

### Task 1: `loadLines` in loading.js

**Files:** `loading.js`, `tests/loading.test.mjs`

- [ ] **Write the failing test** (append to `tests/loading.test.mjs`, extend its import with `loadLines`):

```js
test('loadLines_AllStagesInOrder_WithAndWithoutCounts', () => {
  const t = (key, args) => translate('de', key, args);
  const counts = { roads: { roads: "1'234" }, props: { robidogs: '83', lamps: '1952' } };
  const lines = loadLines(t, counts);
  assert.equal(lines.length, LOAD_STAGES.length);
  assert.deepEqual(lines, LOAD_STAGES.map(s => translate('de', `load_${s}`, counts[s] || {})));
  assert.match(lines[LOAD_STAGES.indexOf('roads')], /1'234 Strassen/);
  assert.match(lines[LOAD_STAGES.indexOf('props')], /83 Robidogs/);
  assert.equal(lines[LOAD_STAGES.indexOf('houses')], 'Häuser aufstellen, Geranien giessen …');
  for (const l of lines) assert.doesNotMatch(l, /undefined|^load_/);
});

test('loadLines_NoCountsAtAll_GivesTheLinesWithoutNumbers', () => {
  const lines = loadLines((key, args) => translate('en', key, args), {});
  assert.equal(lines[0], 'Fetching the map from OpenStreetMap …');
  assert.equal(lines[LOAD_STAGES.indexOf('roads')], 'Paving the roads, still warm …');
});
```

- [ ] Run `node --test tests/loading.test.mjs`: fails (`loadLines` not exported).
- [ ] **Implement** in `loading.js` after `loadProgress`:

```js
// #695: every stage's line as the loading screen showed it, for About; counts[stage] = the formatted counts loadStage used
export function loadLines(t, counts) {
  return LOAD_STAGES.map((s) => t(`load_${s}`, counts[s] || {}));
}
```

- [ ] Run the test again: passes. Commit `feat(about): loadLines gives the loading screen's lines in stage order (#695)`, push.

### Task 2: the fifth tab in about.js

**Files:** `about.js`, `tests/about.test.mjs`

- [ ] **Update the tests first** (the spec adds a tab; the old expectations describe four):
  - `ABOUT_TABS` test: `['people', 'game', 'credits', 'built', 'loading']`, title "the five tabs in order, frozen".
  - `aboutTabIndex` test: `ArrowRight` from 4 → 0, `ArrowLeft` from 0 → 4, `End` from 1 → 4; the other cases stay.
- [ ] Run `node --test tests/about.test.mjs`: fails.
- [ ] **Implement:** `export const ABOUT_TABS = Object.freeze(['people', 'game', 'credits', 'built', 'loading']);` and update its
  comment to mention #695.
- [ ] Run: passes. Commit `feat(about): a fifth About tab for the loading lines (#695)`, push.

### Task 3: strings

**Files:** `strings.js`, `tests/strings.test.mjs` (only if it checks key parity between en and de; then it covers the new keys)

- [ ] Add next to `aboutBuiltTitle` in **en**:

```js
  aboutTabLoading: 'While loading',
  aboutLoadingIntro: 'What the loading screen says while the world is built, to read in peace:',
```

  and in **de**:

```js
  aboutTabLoading: 'Beim Laden',
  aboutLoadingIntro: 'Das steht beim Laden, während die Welt gebaut wird, hier zum Nachlesen:',
```

- [ ] `node --test tests/`: all green. Commit `feat(about): strings for the loading tab (#695)`, push.

### Task 4: tab, panel and rendering in index.html

**Files:** `index.html`, `tests/test_about_tabs.py`

- [ ] **Write the failing Playwright test first.** In `tests/test_about_tabs.py`:
  - `IDS = ["people", "game", "credits", "built", "loading"]`.
  - In `test_tab_roles_and_first_tab_active_on_open`, append
    `["abouttab-loading", "false", -1, "aboutpanel-loading", "While loading"]` to the expected tabs.
  - In `test_arrow_keys_home_end_and_the_game_never_sees_them`, the `End` press now lands on `loading`; expected `seen`:
    `[("game","abouttab-game"), ("credits","abouttab-credits"), ("loading","abouttab-loading"), ("people","abouttab-people"),
    ("loading","abouttab-loading"), ("people","abouttab-people")]`.
  - In `test_german_tabs_and_ideas`, expected labels end with `"Beim Laden"`.
  - New test:

```python
def test_loading_tab_lists_every_loading_line_and_follows_the_language(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        page.click("#abouttab-loading")
        en = page.evaluate("() => [...document.querySelectorAll('#aboutloadlist li')].map(li => li.textContent)")
        visible = page.is_visible("#aboutloadlist")
        page.evaluate("() => window.ggSetLang('de')")
        de = page.evaluate("() => [...document.querySelectorAll('#aboutloadlist li')].map(li => li.textContent)")
        tab = page.inner_text("#abouttab-loading")
        b.close()
    assert visible
    assert len(en) == 13 and en[0] == "Fetching the map from OpenStreetMap …" and en[-1] == "Hanging up the sun, warming up the engine …", en
    assert len(de) == 13 and de[0] == "Karte bei OpenStreetMap abholen …" and de[2] == "Rhein einfüllen, Wiesen mähen …", de
    assert tab == "Beim Laden", tab
    assert not any("undefined" in l or l.startswith("load_") for l in en + de), (en, de)
    assert errors == []
```

  (The test boots the hand layout — the world JSON is routed to 404 — so the lines carry no numbers; the node test in Task 1 covers
  the numbers.)
- [ ] Run `python -m pytest tests/test_about_tabs.py -x` in the foreground: the new and changed assertions fail.
- [ ] **Implement in `index.html`:**
  - Tab row, after `#abouttab-built`:

```html
    <button id="abouttab-loading" type="button" role="tab" aria-selected="false" tabindex="-1" aria-controls="aboutpanel-loading" data-i18n="aboutTabLoading">While loading</button>
```

  - Panel, after `#aboutpanel-built`:

```html
    <section id="aboutpanel-loading" class="ab-sec ab-panel" role="tabpanel" aria-labelledby="abouttab-loading" hidden>
      <p data-i18n="aboutLoadingIntro"></p>
      <ol id="aboutloadlist" class="ab-load"></ol>
    </section>
```

  - CSS next to `.ab-sec p`:

```css
.ab-load{margin:0;padding-left:28px;text-align:left;font-size:16px;line-height:1.5}
.ab-load li{overflow-wrap:anywhere}
```

  - Import: `import { loadLines, loadProgress, numberLocale } from './loading.js';`
  - Keep the counts: next to `LOAD_LOG`, `const LOAD_COUNTS = {};   // #695: the formatted counts each stage showed, for About`;
    in `loadStage`, after computing `shown`: `LOAD_COUNTS[stage] = shown;`
  - Rendering, in the About section after `selectAboutTab`:

```js
// #695: the loading screen's lines, with the counts it showed, to read later (children read slower than the world builds)
function renderAboutLoading() { $('aboutloadlist').replaceChildren(...loadLines((k, a) => tr(k, a), LOAD_COUNTS).map((line) => Object.assign(document.createElement('li'), { textContent: line }))); }
```

  - Call `renderAboutLoading()` at the end of `openAbout(from)`, and add it to the existing
    `addEventListener('gg-langchange', …)` handler that calls `rerenderAll()` (so the list follows the toggle while About is open).
- [ ] Run `python -m pytest tests/test_about_tabs.py` in the foreground: all pass. Run `node --test tests/`: all pass.
- [ ] CHANGELOG under `[Unreleased]` → `### Added`, newest first:
  ``- `<TZ=Europe/Zurich date '+%F %H:%M'>` **Über** has a new tab **Beim Laden**: all the loading-screen lines to read in peace, with the numbers of houses, roads and Robidogs from the last build.``
- [ ] Commit `feat(about): the loading lines in a Beim Laden tab (#695)`, push.
