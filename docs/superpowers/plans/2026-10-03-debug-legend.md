# Debug Legend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every line of the #39 debug panel (F3 / `?debug`) gets a short translated label, and a `?` button in the panel toggles a translated legend that explains the values (#74).

**Architecture:** A pure `lineLabelKey(line)` in `prototype/debug.js` maps a panel line to a string key by its prefix (node-tested). `prototype/index.html` renders the lines as `<div data-label="…">` inside `#debugtext` and draws the label with CSS `::before`, so `DEBUG.lines`, the copied text and `innerText` stay unchanged. A `?` button and a `#debuglegend` div live inside `#debug`; both stop click propagation so they never copy. All texts are new keys in `prototype/strings.js` (en + de); the legend is a `data-i18n` element, so `rerenderAll` re-translates it on `gg-langchange`.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`, pure ES modules (`node --test`), Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-03-debug-legend-design.md`

## Global Constraints

- **Depends on #39 (debug mode) and #9 (i18n), both merged on `main` @ `13a4ef7`.** Task 0 checks this and stops if either is missing.
- **#63 (map links) may or may not be merged when you start.** It introduces the same `#debugtext` element. Task 0 detects it; Task 2 has a branch for each case. Never create a second `#debugtext`.
- Use Test-Driven Development for every task: write the failing test first, watch it fail, implement minimally to pass, verify green. Never edit an existing test to make it pass.
- `DEBUG.lines`, `copyText`, `positionLines`, `buildingLines`, `heightText` and the `debugSection`/`debugLayer` API stay **unchanged**. Labels are presentation only.
- No new key binding. Do not touch the `keydown` listener (`?` already opens the F1 help).
- No hover-only UI: the legend opens on click/tap of `?`. The button is `blur()`ed after the click (Enter is the horn and would re-click a focused button).
- Strings: new keys in `prototype/strings.js`, in **both** `en` and `de` (`strings.test.mjs` enforces parity), Swiss spelling (no `ß`), real umlauts. Do not change `keyDebug` (#63 edits it).
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. `#debug` has `white-space:pre`: write its children with **no whitespace between tags**. No framework, no bundler, no `package.json`, no new dependency.
- New prototype code must **not** call `rr()` or `rnd()` (the seeded RNG drives house colours and trees).
- Do not touch `data/` or `pipeline/`. Existing tests stay unchanged and green; `debug.test.mjs` and `test_debug.py` only get tests appended, names added to the import, and `open_page` gains a backward-compatible `**page_opts` (Task 3).
- Commands (from the repo root): node tests `node --test prototype/tests/*.test.mjs` (the glob is needed on Node 24). Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_debug.py -q` — slow (several minutes), **foreground only, never `run_in_background`**. Exit 137 = memory cap hit: stop and report. Without `systemd-run --user` (CI runner) run the same command without the prefix. One-time setup if the venv is missing: `cd pipeline && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m playwright install chromium`.
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** the long Playwright runs.

## Review Focus

- `debugTick` must write `#debugtext`, not `#debug`: writing `#debug.textContent` would wipe the `?` button and the legend on the first tick. Pinned by `test_question_button_toggles_the_legend_without_copying`.
- Neither the `?` click nor a click in the legend copies. Pinned by the same test (`__copied` stays `None`).
- `page.inner_text("#debug")` still starts with `x ` — the label must come from `::before`, not from a text node. Pinned by `test_every_panel_line_has_a_label` and the unchanged `test_f3_toggles_the_panel_and_the_hand_layout_has_no_lv95`.
- Language switch re-renders labels (next tick) and legend (`rerenderAll`). Pinned by `test_labels_and_legend_follow_the_language`.

---

## File map

- `prototype/debug.js`: `lineLabelKey` appended after `copyText` (~L43).
- `prototype/tests/debug.test.mjs`: import extended, two tests appended.
- `prototype/strings.js`: six keys in `en` (after `copyFailed`, ~L76) and `de` (after `copyFailed`, ~L173).
- `prototype/index.html`: CSS after the `#debug` rules (~L34-36); `#debug` markup (~L157); `debug.js` import (~L204); `debugTick` (~L1113); listeners after `$('debug').addEventListener('click', copyDebug);` (~L1115); `__mm.debug` hook (~L1128).
- `prototype/tests/test_debug.py`: `open_page` gains `**page_opts`; five tests appended.
- `CHANGELOG.md`, `test-todo.md`.

Line numbers are from `main` @ `13a4ef7`; verify with `grep -n` before editing (other PRs — #63, #70, #10 — may have shifted them).

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1: Check #39 and #9 are on the branch.** Run, from the repo root, each on its own:

```bash
test -f prototype/debug.js && echo debug-module-ok
grep -c "function debugSection" prototype/index.html
grep -c "function applyStaticStrings" prototype/index.html
```

Expected: `debug-module-ok`, `1`, `1`. Otherwise stop and report.

- [ ] **Step 2: Detect #63.**

```bash
grep -c 'id="debugtext"' prototype/index.html
```

`0` → #63 is not merged: Task 2 uses **case A**. `1` → #63 is merged: Task 2 uses **case B**. Note which.

- [ ] **Step 3: Baseline.** `node --test prototype/tests/*.test.mjs` → all pass (52 on `13a4ef7`).

---

### Task 1: `lineLabelKey` and the strings

**Files:**
- Modify: `prototype/debug.js` (append)
- Modify: `prototype/strings.js` (`en` and `de`)
- Test: `prototype/tests/debug.test.mjs` (append)

**Interfaces:**

```js
export function lineLabelKey(line) // -> 'dbgLabCar' | 'dbgLabLv95' | 'dbgLabWgs84' | 'dbgLabBldg' | null
```

- [ ] **Step 1: Write the failing tests.** Add `lineLabelKey` to the existing `import { … } from '../debug.js';` line, add a second import line `import { translate } from '../strings.js';`, and append:

```js
test('lineLabelKey: one label key per panel line, by prefix; null for anything else', () => {
  const p = { x: 1234.54, z: -253.26, E: 2641015.9, N: 1267040.3, lat: 47.552843, lon: 7.983451 };
  const lines = [...positionLines(p, 312.44, 86.6), ...buildingLines({ id: 171822634, t: '22.8 m +1.2 dsm' })];
  assert.deepEqual(lines.map(lineLabelKey), ['dbgLabCar', 'dbgLabLv95', 'dbgLabWgs84', 'dbgLabBldg']);
  const bare = [...positionLines({ x: 1, z: 2, E: null, N: null, lat: null, lon: null }, 0, 0), ...buildingLines(undefined)];
  assert.deepEqual(bare.map(lineLabelKey), ['dbgLabCar', 'dbgLabLv95', 'dbgLabBldg']);
  for (const other of ['', 'xyz', 'LV9', 'something else', 'building 1']) assert.equal(lineLabelKey(other), null, other);
});

test('debug labels and legend exist in English and German and explain every value', () => {
  for (const k of ['dbgLabCar', 'dbgLabLv95', 'dbgLabWgs84', 'dbgLabBldg', 'dbgLegendBtn']) {
    for (const lang of ['en', 'de']) assert.notEqual(translate(lang, k), k, `${lang}.${k}`);
  }
  assert.deepEqual(['dbgLabCar', 'dbgLabLv95', 'dbgLabWgs84', 'dbgLabBldg'].map(k => translate('en', k)), ['car', 'Swiss', 'GPS', 'nearest']);
  assert.deepEqual(['dbgLabCar', 'dbgLabLv95', 'dbgLabWgs84', 'dbgLabBldg'].map(k => translate('de', k)), ['Auto', 'Schweiz', 'GPS', 'nächstes']);
  const en = translate('en', 'dbgLegend'), de = translate('de', 'dbgLegend');
  for (const term of ['east', 'south', 'height', 'heading', 'north', 'LV95', 'WGS84', 'eaves', 'roof', 'dsm', 'digital surface model (swissSURFACE3D) minus the terrain model', 'osm', '2.5 m', 'copy']) assert.ok(en.includes(term), `en: ${term}`);
  for (const term of ['Osten', 'Süden', 'Höhe', 'Kurs', 'Norden', 'LV95', 'WGS84', 'Traufe', 'Dach', 'dsm', 'digitales Oberflächenmodell (DSM)', 'swissSURFACE3D', 'Geländemodell', 'osm', '2.5 m', 'kopiert']) assert.ok(de.includes(term), `de: ${term}`);
});
```

- [ ] **Step 2: Run, watch it fail.** `node --test prototype/tests/*.test.mjs` → the import fails (`lineLabelKey` is not exported).

- [ ] **Step 3: Implement `lineLabelKey`.** Append to `prototype/debug.js`:

```js
// #74: the short label drawn left of each panel line (a strings.js key); the line text itself stays language-neutral
const LINE_LABELS = [['x ', 'dbgLabCar'], ['LV95 ', 'dbgLabLv95'], ['WGS84 ', 'dbgLabWgs84'], ['bldg ', 'dbgLabBldg']];
export function lineLabelKey(line) {
  const hit = LINE_LABELS.find(([prefix]) => line.startsWith(prefix));
  return hit ? hit[1] : null;
}
```

- [ ] **Step 4: Add the strings.** In `prototype/strings.js`, `en`, directly after `copyFailed: 'Copy failed',`:

```js
  dbgLabCar: 'car',
  dbgLabLv95: 'Swiss',
  dbgLabWgs84: 'GPS',
  dbgLabBldg: 'nearest',
  dbgLegendBtn: 'Explain the debug values',
  dbgLegend: '<b>car</b> x east, z south, y height, in metres (game frame) · heading in degrees, 0 = north, clockwise<br><b>Swiss</b> LV95 east / north in metres (EPSG:2056)<br><b>GPS</b> WGS84 latitude, longitude in degrees<br><b>nearest</b> bldg &lt;OSM id&gt; · &lt;h&gt; m +&lt;rh&gt; &lt;source&gt; — the building nearest the car. h = wall height up to the eaves, +rh = roof height on top (only when measured). dsm = height measured from swisstopo’s digital surface model (swissSURFACE3D) minus the terrain model, osm = OpenStreetMap height, levels or a default for the building type. 2.5 m is the lowest wall height a measured (dsm) building gets. The same text floats above each roof within 60 m.<br>Click the panel to copy all lines.',
```

In `de`, directly after `copyFailed: 'Kopieren fehlgeschlagen',`:

```js
  dbgLabCar: 'Auto',
  dbgLabLv95: 'Schweiz',
  dbgLabWgs84: 'GPS',
  dbgLabBldg: 'nächstes',
  dbgLegendBtn: 'Debug-Werte erklären',
  dbgLegend: '<b>Auto</b> x Osten, z Süden, y Höhe, in Metern (Spielkoordinaten) · Kurs in Grad, 0 = Norden, im Uhrzeigersinn<br><b>Schweiz</b> LV95 Ost / Nord in Metern (EPSG:2056)<br><b>GPS</b> WGS84 Breite, Länge in Grad<br><b>nächstes</b> bldg &lt;OSM-ID&gt; · &lt;h&gt; m +&lt;rh&gt; &lt;Quelle&gt; — das Gebäude, das dem Auto am nächsten ist. h = Wandhöhe bis zur Traufe, +rh = Dachhöhe darüber (nur wenn gemessen). dsm = digitales Oberflächenmodell (DSM): Höhe gemessen aus dem Oberflächenmodell von swisstopo (swissSURFACE3D) minus Geländemodell, osm = Höhe, Geschosse oder Standardwert je Gebäudetyp aus OpenStreetMap. 2.5 m ist die kleinste Wandhöhe eines gemessenen (dsm) Gebäudes. Derselbe Text schwebt im Umkreis von 60 m über jedem Dach.<br>Ein Klick aufs Panel kopiert alle Zeilen.',
```

(Match the file's actual quoting and indentation. The values contain no ASCII `'`: `swisstopo’s` uses the typographic apostrophe U+2019. The `dsm` wording — "digital surface model … minus the terrain model" / "digitales Oberflächenmodell (DSM)" — was chosen by the user; keep it verbatim.)

- [ ] **Step 5: Run, watch it pass.** `node --test prototype/tests/*.test.mjs` → all pass, including `strings.test.mjs` (key parity, no `ß`).

- [ ] **Step 6: Commit.**

```bash
git add prototype/debug.js prototype/strings.js prototype/tests/debug.test.mjs
git commit -m "feat(debug): label keys and legend strings for the debug panel (#74)"
```

---

### Task 2: Labelled lines in `#debugtext`

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_debug.py` (append)

**Interfaces:** `__mm.debug()` gains `labels: string[]` (the `data-label` of each `#debugtext` line, in order).

- [ ] **Step 1: Write the failing tests.** Append to `prototype/tests/test_debug.py`:

```python
def test_every_panel_line_has_a_label(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query="?debug")
        page.wait_for_function("() => (window.__mm.debug().labels || []).length > 0", timeout=60000)
        dbg = page.evaluate("() => window.__mm.debug()")
        drawn = page.evaluate("() => [...document.querySelectorAll('#debugtext > div')].map(d => getComputedStyle(d, '::before').content)")
        text = page.inner_text("#debug")
        br.close()
    assert dbg["labels"] == ["car", "Swiss", "nearest"], dbg
    assert len(dbg["labels"]) == len(dbg["lines"])
    assert drawn == ['"car"', '"Swiss"', '"nearest"'], drawn                # drawn by ::before, not a text node
    assert text.startswith("x ") and "LV95 —" in text and "bldg —" in text, text


@needs_world
def test_world_layout_labels_all_four_lines(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, query="?debug")
        page.wait_for_function("() => (window.__mm.debug().labels || []).length === 4", timeout=120000)
        dbg = page.evaluate("() => window.__mm.debug()")
        br.close()
    assert dbg["labels"] == ["car", "Swiss", "GPS", "nearest"], dbg
    assert dbg["lines"][2].startswith("WGS84 "), dbg["lines"]
```

- [ ] **Step 2: Run, watch them fail.** Push the branch first, then run the Playwright command from the Global Constraints with `-k "label"` appended. Expected: both new tests time out on `labels` (undefined); the other tests are not selected.

- [ ] **Step 3: CSS.** In `prototype/index.html`, directly after the line `@media (pointer:coarse){#debug{bottom:auto;top:calc(120px + env(safe-area-inset-top,0px))}}`, add:

```css
#debugtext>div::before{content:attr(data-label);display:inline-block;min-width:9ch;color:#7f9a6a}
```

- [ ] **Step 4: Markup.**
  - **Case A (#63 not merged):** replace `<div id="debug" hidden title="Click to copy"></div>` with `<div id="debug" hidden title="Click to copy"><div id="debugtext"></div></div>`.
  - **Case B (#63 merged):** `#debugtext` already exists; leave the markup.

- [ ] **Step 5: Import.** Add `lineLabelKey` to the `import { debugFromQuery, … } from './debug.js';` line.

- [ ] **Step 6: Render labelled lines.** Add, directly before `function debugTick()`:

```js
// #74: one <div> per panel line; the label is drawn by CSS ::before from data-label, so innerText and the copied text stay the bare values
function debugLineEl(line) { const el = document.createElement('div'); const key = lineLabelKey(line); el.dataset.label = key ? tr(key) : ''; el.textContent = line; return el; }
```

  In `debugTick`, replace the panel write:
  - **Case A:** `$('debug').textContent = DEBUG.lines.join('\n');` → `$('debugtext').replaceChildren(...DEBUG.lines.map(debugLineEl));`
  - **Case B:** `$('debugtext').textContent = DEBUG.lines.join('\n');` → `$('debugtext').replaceChildren(...DEBUG.lines.map(debugLineEl));`

- [ ] **Step 7: Test hook.** In `window.__mm.debug = () => ({ … })`, add before the closing `})`: `, labels: [...document.querySelectorAll('#debugtext > div')].map(d => d.dataset.label)`.

- [ ] **Step 8: Run, watch them pass.** Same `-k "label"` command → 2 passed (1 skipped if the world file is missing).

- [ ] **Step 9: Commit.**

```bash
git add prototype/index.html prototype/tests/test_debug.py
git commit -m "feat(debug): short label left of every debug panel line (#74)"
```

---

### Task 3: The `?` button and the legend (click and tap)

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_debug.py` (`open_page` + append)

**Interfaces:** `__mm.debug()` gains `legend: boolean`. DOM: `#debughelp` (button), `#debuglegend` (div).

- [ ] **Step 1: Let `open_page` take page options.** Backward-compatible; existing calls are unchanged:

```python
def open_page(p, server, block_world=False, query="", **page_opts):
    b = p.chromium.launch(args=ARGS); page = b.new_page(**{"viewport": {"width": 960, "height": 540}, **page_opts})
```

(The rest of the function stays as it is.)

- [ ] **Step 2: Write the failing tests.** Append:

```python
def install_copy_spy(page):
    page.evaluate("() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; }")


def test_question_button_toggles_the_legend_without_copying(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query="?debug")
        page.click("#startbtn")
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
        install_copy_spy(page)
        hidden_at_start = not page.is_visible("#debuglegend")
        page.click("#debughelp")
        page.wait_for_timeout(400)                                           # > one 250 ms debug tick: the tick must not wipe the legend
        shown = page.is_visible("#debuglegend"); expanded = page.get_attribute("#debughelp", "aria-expanded")
        legend = page.text_content("#debuglegend"); hook = page.evaluate("() => window.__mm.debug().legend")
        focused = page.evaluate("() => document.activeElement && document.activeElement.id")
        page.click("#debuglegend")
        page.click("#debughelp")
        hidden_again = not page.is_visible("#debuglegend"); collapsed = page.get_attribute("#debughelp", "aria-expanded")
        page.wait_for_timeout(300)
        copied = page.evaluate("() => window.__copied")
        br.close()
    assert hidden_at_start and shown and expanded == "true" and hook is True
    for term in ["eaves", "roof", "dsm", "digital surface model", "terrain model", "osm", "2.5 m", "east", "south", "heading", "LV95", "WGS84"]:
        assert term in legend, term
    assert focused != "debughelp"
    assert hidden_again and collapsed == "false"
    assert copied is None                                                    # neither the button nor the legend copies


def test_tap_on_the_question_button_opens_the_legend(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query="?debug", viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        page.tap("#startbtn")
        page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
        coarse = page.evaluate("() => matchMedia('(pointer:coarse)').matches")
        box = page.locator("#debughelp").bounding_box()
        page.tap("#debughelp")
        shown = page.is_visible("#debuglegend")
        br.close()
    assert coarse and box["width"] >= 36 and box["height"] >= 36, box       # finger-sized on touch screens
    assert shown
```

- [ ] **Step 3: Run, watch them fail.** Playwright command with `-k "legend"` → both fail (`#debughelp` not found).

- [ ] **Step 4: CSS.** After the `#debugtext>div::before` rule from Task 2, add:

```css
#debug{padding-right:36px}#debughelp{position:absolute;top:4px;right:4px;width:22px;height:22px;padding:0;font:inherit;line-height:18px;color:#b6ff7a;background:#14171d;border:2px solid #3a404b;cursor:pointer}
#debuglegend{max-width:min(380px,calc(100vw - 72px));margin-top:6px;padding-top:6px;border-top:1px solid #3a404b;white-space:normal;font-weight:500;color:#d6e8c8;cursor:auto}
@media (pointer:coarse){#debug{padding-right:48px}#debughelp{width:36px;height:36px;line-height:32px}}
```

- [ ] **Step 5: Markup.** Inside `#debug`, after `<div id="debugtext"></div>` (case B: after `#debuglinks`), with no whitespace between tags:

```html
<button id="debughelp" type="button" aria-expanded="false" aria-controls="debuglegend" aria-label="Explain the debug values" data-i18n-aria="dbgLegendBtn">?</button><div id="debuglegend" hidden data-i18n="dbgLegend"></div>
```

- [ ] **Step 6: Toggle.** Directly after `$('debug').addEventListener('click', copyDebug);` add:

```js
// #74: ? toggles the legend; neither the button nor the legend copies the panel, and the button drops focus (Enter is the horn)
function toggleDebugLegend(e) { e.stopPropagation(); const lg = $('debuglegend'); lg.hidden = !lg.hidden; e.currentTarget.setAttribute('aria-expanded', String(!lg.hidden)); e.currentTarget.blur(); }
$('debughelp').addEventListener('click', toggleDebugLegend);
$('debuglegend').addEventListener('click', e => e.stopPropagation());
```

- [ ] **Step 7: Test hook.** In `window.__mm.debug`, after the `labels` field from Task 2 add: `, legend: !$('debuglegend').hidden`.

- [ ] **Step 8: Run, watch them pass.** `-k "legend"` → 2 passed.

- [ ] **Step 9: Commit.**

```bash
git add prototype/index.html prototype/tests/test_debug.py
git commit -m "feat(debug): ? button in the debug panel toggles a legend (#74)"
```

---

### Task 4: Labels and legend follow the language

**Files:**
- Test: `prototype/tests/test_debug.py` (append)
- Modify: `prototype/index.html` only if the test fails

- [ ] **Step 1: Write the test.** Append:

```python
def test_labels_and_legend_follow_the_language(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True, query="?debug")
        page.wait_for_function("() => (window.__mm.debug().labels || []).length > 0", timeout=60000)
        page.evaluate("() => window.ggSetLang('de')")
        page.wait_for_function("() => window.__mm.debug().labels[0] === 'Auto'", timeout=30000)
        labels = page.evaluate("() => window.__mm.debug().labels")
        legend = page.text_content("#debuglegend")
        aria = page.get_attribute("#debughelp", "aria-label")
        copy = page.evaluate("() => window.__mm.debug().copy")
        page.evaluate("() => window.ggSetLang('en')")                         # gg-lang is shared across the site's games
        br.close()
    assert labels == ["Auto", "Schweiz", "nächstes"], labels
    assert "Traufe" in legend and "Dach" in legend and "2.5 m" in legend and "digitales Oberflächenmodell (DSM)" in legend, legend
    assert aria == "Debug-Werte erklären"
    assert copy.startswith("x ") and " | LV95 —" in copy                      # the copied text stays language-neutral
```

- [ ] **Step 2: Run.** `-k "language"`. Expected: **passes** without code changes — labels are re-translated on the next tick, the legend and `aria-label` by `rerenderAll()` on `gg-langchange` (`index.html` ~L1075-1076). If it fails, the cause is in Task 2/3 code (e.g. the legend missing `data-i18n`), not in this test: fix it there.

- [ ] **Step 3: Commit.**

```bash
git add prototype/tests/test_debug.py
git commit -m "test(debug): debug labels and legend switch with the language (#74)"
```

---

### Task 5: Changelog, test-todo, full suite

**Files:**
- Modify: `CHANGELOG.md`, `test-todo.md`

- [ ] **Step 1: Changelog.** Under `## [Unreleased]` → `### Added` (player-facing, hand-written, never `git cliff -o`), append:

```markdown
- The **F3** debug panel now explains itself: every line has a short label (car, Swiss, GPS, nearest), and the **?** in its corner opens a legend — what x, z, y and the heading mean, LV95 and WGS84, and how to read a building's `22.8 m +3.9 dsm` (wall height to the eaves, roof on top, and whether it was measured from swisstopo's digital surface model or comes from OpenStreetMap). Works with a tap on phones, in German and English.
```

- [ ] **Step 2: test-todo.** Under `## Debug mode (#39)` append:

```markdown
- [ ] #74: F3, then click **?**: the legend opens below the lines and explains every value; click **?** again to close it. Clicking **?** or the legend does not copy; clicking the lines still does. Switch EN/DE: labels and legend change at once.
- [ ] #74 phone: `…/prototype/index.html?debug`, tap **?** — the legend is readable, and the panel still leaves the steering buttons free.
```

- [ ] **Step 3: Full suite.** `node --test prototype/tests/*.test.mjs` → all pass. Push, then the full Playwright debug file (command in Global Constraints, no `-k`) → all pass, including the four pre-existing tests unchanged. Then `test_i18n.py` and `test_smoke.py` the same way.

- [ ] **Step 4: Manual check (Playwright screenshot is fine).** Serve with `python3 -m http.server 8000`, open `/prototype/index.html?debug`, click **?**: the console is empty, the label column aligns, the legend wraps inside the panel and does not run off screen at 960×540 or 390×844.

- [ ] **Step 5: Commit.**

```bash
git add CHANGELOG.md test-todo.md
git commit -m "docs(debug): changelog and playtest notes for the debug legend (#74)"
```
