# Key caps as key graphics (#700) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show keys as key graphics: the key bar's `WASD` as four caps in a row, and the tutorial banner's keys as caps (the WASD and arrow keys as a cross).

**Architecture:** A new pure module `keycaps.js` turns a cap token (`'WASD'`, `'Arrows'`, `'Shift'`, `'Z'` …) into `<kbd>` HTML. `controls.js` and `tutorial.js` stay as they are (they keep handing out `cap: 'WASD'`). `index.html` renders the key bar and the tutorial banner through `keycaps.js`.

**Tech Stack:** Vanilla JS ES modules, `node --test`, pytest + Playwright (buildless browser game).

**Spec:** `docs/superpowers/specs/2026-11-07-keycaps-graphics-design.md`

## Global Constraints

- Buildless: no package, no bundler, no framework. New module = plain ES module at the repo root next to `controls.js`.
- Every label that goes into `innerHTML` goes through `esc` from `./escape.js`.
- No flag arguments: `capsRow` and `capsCross` are two functions, not one with a layout parameter.
- Strings: `en` and `de` must have exactly the same keys (`tests/strings.test.mjs` checks this). German is Swiss spelling, address is `Du`.
- Tests: run **only** the targeted files listed per task, never the full Playwright suite (~2 h). Run Playwright in the foreground, never in the background.
- Commit and push the branch before running the Playwright verification.
- CHANGELOG: one hand-written, player-facing entry under `## [Unreleased]` → `### Changed`, in English, starting with a `` `YYYY-MM-DD HH:MM` `` timestamp like the existing entries. Never regenerate the file with git-cliff.

## Review Focus

- **Hint text with characters that need escaping** (`„Plattform“`, `&`, `<` in a translation): the banner must show them literally, not break the markup. Pinned in Task 1 (escape test) and Task 3 (the banner escapes both text halves).
- **Hints without a `how` slot** (`tutStepCheckpoints` ignores its first argument): the banner must show the text alone, with no stray key graphic. Pinned in Task 3 (the checkpoints hint has 0 `kbd`).
- **Banner rewritten every frame** (the aria-live region would re-announce): the write must happen only when the HTML changes, and again after the banner was cleared on a restart. Pinned in Task 3 (`dataset.html` guard plus a check that the node stays the same across frames).
- **Phone / touch:** the hint uses `[label]` / `☰ → label` and must stay text, with no `kbd`. Pinned in Task 3 (the phone test asserts 0 `kbd`).
- **Language switch mid-step:** the "or"/"oder" between the clusters follows the language. The banner is re-rendered by the existing `gg-langchange` path, and the changed text changes the HTML, so the `dataset.html` guard lets it through. Pinned by `tutOr` in both languages (Task 2) and the English " or " assert (Task 3).

---

### Task 1: `keycaps.js`, the pure cap renderer

**Files:**
- Create: `keycaps.js`
- Test: `tests/keycaps.test.mjs`

**Interfaces:**
- Consumes: `esc(value)` from `./escape.js`
- Produces:
  - `capKeys(cap: string): string[]`
  - `capsRow(cap: string): string` (HTML)
  - `capsCross(cap: string): string` (HTML)

- [ ] **Step 1: Write the failing test** — create `tests/keycaps.test.mjs`:

```js
// #700: key caps as key graphics -- a cap token as <kbd> HTML
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capKeys, capsRow, capsCross } from '../keycaps.js';

test('capKeys_Clusters_SplitIntoFourKeys', () => {
  assert.deepEqual(capKeys('WASD'), ['W', 'A', 'S', 'D']);
  assert.deepEqual(capKeys('Arrows'), ['↑', '←', '↓', '→']);
});

test('capKeys_SingleKey_IsOneKey', () => {
  assert.deepEqual(capKeys('Shift'), ['Shift']);
  assert.deepEqual(capKeys('Z'), ['Z']);
});

test('capsRow_Wasd_IsFourKbdInARow', () => {
  assert.equal(capsRow('WASD'), '<span class="caps"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>');
});

test('capsRow_SingleKey_IsOneKbd', () => {
  assert.equal(capsRow('F1'), '<span class="caps"><kbd>F1</kbd></span>');
});

test('capsCross_Arrows_IsACrossOfFourKbd', () => {
  assert.equal(capsCross('Arrows'), '<span class="caps cross"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span>');
});

test('capsCross_SingleKey_FallsBackToTheRow', () => {
  assert.equal(capsCross('Space'), capsRow('Space'));
});

test('capsRow_MarkupInTheLabel_IsEscaped', () => {
  assert.equal(capsRow('<b>&'), '<span class="caps"><kbd>&lt;b&gt;&amp;</kbd></span>');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/keycaps.test.mjs`
Expected: FAIL with `Cannot find module` / `ERR_MODULE_NOT_FOUND` for `keycaps.js`

- [ ] **Step 3: Write the implementation** — create `keycaps.js`:

```js
// keycaps.js (#700): a key bar / tutorial cap token as <kbd> key graphics, so "WASD" reads as four keys, not a word.
// Pure: no DOM, no three.js (node --test imports it). The labels are escaped: a cap is data from controls.js.
import { esc } from './escape.js';

// a cluster is drawn as its four keys, in keyboard order: the top key first, then the row below it from left to right
const CLUSTERS = { WASD: ['W', 'A', 'S', 'D'], Arrows: ['↑', '←', '↓', '→'] };

const kbd = (label) => `<kbd>${esc(label)}</kbd>`;

export function capKeys(cap) {
  return CLUSTERS[cap] ?? [cap];
}

export function capsRow(cap) {
  return `<span class="caps">${capKeys(cap).map(kbd).join('')}</span>`;
}

// the cluster as it sits on the keyboard: the first key on top in the middle column, the other three below (CSS: .caps.cross)
export function capsCross(cap) {
  const keys = capKeys(cap);
  if (keys.length !== 4) return capsRow(cap);
  return `<span class="caps cross">${keys.map(kbd).join('')}</span>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/keycaps.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add keycaps.js tests/keycaps.test.mjs
git commit -m "feat(ui): add keycaps.js, cap tokens as kbd key graphics (#700)"
```

---

### Task 2: Strings `tutOr` in, `tutKey` out

**Files:**
- Modify: `strings.js` (`en` block: the line `  tutKey: (cap) => cap,` ~181; `de` block: the same line ~773)
- Test: `tests/strings.test.mjs` (the test `'tutorial texts exist in both languages, …(#534)'` ~226)

**Interfaces:**
- Produces: string key `tutOr` (`en: 'or'`, `de: 'oder'`). `tutKey` no longer exists.

- [ ] **Step 1: Write the failing test** — in `tests/strings.test.mjs`, inside the test `'tutorial texts exist in both languages, name the input and address the player as Du (#534)'`, after the line `  assert.equal(translate('en', 'tutMenu', 'Photo'), '☰ → Photo');` add:

```js
  assert.equal(translate('en', 'tutOr'), 'or');   // #700: between the WASD and the arrow-key cross
  assert.equal(translate('de', 'tutOr'), 'oder');
  assert.ok(!('tutKey' in STRINGS.en) && !('tutKey' in STRINGS.de), 'tutKey has no caller since #700');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/strings.test.mjs`
Expected: FAIL on `translate('en', 'tutOr')` (`translate` returns the key or undefined, not `'or'`)

- [ ] **Step 3: Implement** — in `strings.js`, `en` block: replace `  tutKey: (cap) => cap,` with `  tutOr: 'or',`. `de` block: replace `  tutKey: (cap) => cap,` with `  tutOr: 'oder',`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/strings.test.mjs`
Expected: PASS (including `'English and German have exactly the same keys'`)

- [ ] **Step 5: Commit**

```bash
git add strings.js tests/strings.test.mjs
git commit -m "feat(tutorial): add tutOr, drop the unused tutKey (#700)"
```

(`index.html`'s `howText` still calls `tr('tutKey', …)` until Task 3 replaces it. Do Task 3 next, in the same branch.)

---

### Task 3: Key bar and tutorial banner render through `keycaps.js`

**Files:**
- Modify: `index.html`
  - ~741: the `import … from './controls.js'` line (add the keycaps import after it)
  - ~25: the `#tuthint{…}` CSS rule (add the cap CSS after it)
  - ~4053: `$('keybar').innerHTML = …`
  - ~4895–4896: `const howText = …` and `function renderTutorialHint() …`
- Modify: `CHANGELOG.md` (`## [Unreleased]`)
- Test: `tests/test_tutorial.py`, `tests/test_keybar.py`

**Interfaces:**
- Consumes: `capsRow(cap)`, `capsCross(cap)` from `./keycaps.js` (Task 1). `tr('tutOr')` (Task 2). `esc` (already imported, `index.html:723`).
- Produces: `#keybar` entries with one `<kbd>` per key. `#tuthint` with `<kbd>` caps, and `#tuthint.dataset.html` holding the last written HTML.

- [ ] **Step 1: Write the failing tests**

`tests/test_tutorial.py`, in `test_the_tutorial_runs_through_every_step_and_marks_itself_done`:

a) Add a helper next to `def hint(page):` (~46):

```python
def caps(page):
    """#700: the keys in the banner as key graphics -- one <kbd> per key."""
    return page.evaluate("() => [...document.querySelectorAll('#tuthint kbd')].map(k => k.textContent)")
```

b) Replace `        hints = {"drive": hint(page)}` with:

```python
        hints = {"drive": hint(page)}
        kbds = {"drive": caps(page)}
        node = page.evaluate("() => { window.__tutNode = document.querySelector('#tuthint').firstChild; return true; }")
        page.wait_for_timeout(500)
        kept = page.evaluate("() => document.querySelector('#tuthint').firstChild === window.__tutNode")   # not rewritten while the hint stays the same
```

c) After `        hints["checkpoints"] = hint(page)` add `        kbds["checkpoints"] = caps(page)`. After `        hints["nitro"] = hint(page)` add `        kbds["nitro"] = caps(page)`. After `        hints["climb"] = hint(page)` add `        kbds["climb"] = caps(page)`.

d) After the line `    assert "Shift" in hints["nitro"] and "J" in hints["jump"] and "WASD" in hints["climb"], hints` add:

```python
    assert kbds["drive"] == ["W", "A", "S", "D", "↑", "←", "↓", "→"] and " or " in hints["drive"], (kbds, hints)   # #700: the two crosses
    assert kbds["climb"] == kbds["drive"] and kbds["nitro"] == ["Shift"] and kbds["checkpoints"] == [], kbds
    assert node and kept, "the banner was rewritten on an unchanged hint"
```

(`hint()` reads `textContent`, which joins the caps to `WASD↑←↓→`, so the existing `"WASD" in hints[...]` asserts keep passing.)

e) In the phone test (the one asserting `got["hint"].startswith("Fahr los mit ")`), extend the evaluate dict with `kbd: document.querySelectorAll('#tuthint kbd').length,` and add `    assert got["kbd"] == 0, got   # touch hints stay text (#700)` after the existing hint assert.

`tests/test_keybar.py`, in `test_bar_follows_the_context_and_the_language`, after the `car = page.evaluate(BAR)` line add:

```python
        car_kbd = page.evaluate("() => [...document.querySelector('#keybar span').querySelectorAll('kbd')].map(k => k.textContent)")
```

and after `    assert car["shown"] and car["text"] == "WASD fahrenShift NitroZ aussteigenJ springenC KameraF1 alle Tasten", car` add:

```python
    assert car_kbd == ["W", "A", "S", "D"], car_kbd   # #700: four caps, not one "WASD"
```

- [ ] **Step 2: Commit the tests, push, then run them to verify they fail**

```bash
git add tests/test_tutorial.py tests/test_keybar.py
git commit -m "test(tutorial): keys in the banner and the key bar as kbd caps (#700)"
git push -u origin HEAD
```

Run (foreground, generous timeout): `python3 -m pytest tests/test_keybar.py::test_bar_follows_the_context_and_the_language tests/test_tutorial.py -x -q`
Expected: FAIL: `car_kbd == ['WASD']`, and `kbds["drive"] == []`

- [ ] **Step 3: Implement in `index.html`**

a) After the line `import { actionFor, contextKeyAction, barEntries, menuEntries, contextLabel, KEYBAR_KEY, keybarOnFrom } from './controls.js';   // #535` add:

```js
import { capsRow, capsCross } from './keycaps.js';   // #700
```

b) Key bar, `~4053`: replace

```js
  $('keybar').innerHTML = barEntries(ctx, act).map(x => `<span${x.highlight ? ' class="ctx"' : ''}><kbd>${x.cap}</kbd> ${tr(x.label)}</span>`).join('');
```

with

```js
  $('keybar').innerHTML = barEntries(ctx, act).map(x => `<span${x.highlight ? ' class="ctx"' : ''}>${capsRow(x.cap)} ${tr(x.label)}</span>`).join('');   // #700: one cap per key
```

c) Banner, `~4895–4896`: replace the two lines `const howText = …` and `function renderTutorialHint() { … }   // written only on a change` with:

```js
// #700: the keys as key graphics -- the move keys as the WASD cross "or" the arrow cross, any other key as one cap; touch stays text
const HOW_MARK = '\u0001';
const howHtml = (how) => how.via !== 'key' ? esc(tr(how.via === 'button' ? 'tutButton' : 'tutMenu', tr(how.label)))
  : how.cap === 'WASD' ? `${capsCross('WASD')} ${esc(tr('tutOr'))} ${capsCross('Arrows')}` : capsRow(how.cap);
function tutorialHintHtml(h) { const parts = tr(h.key, HOW_MARK, h.n, h.of).split(HOW_MARK); return parts.length > 1 && h.how ? esc(parts[0]) + howHtml(h.how) + esc(parts.slice(1).join('')) : esc(parts.join('')); }
function renderTutorialHint() { const el = $('tuthint'), html = tutorialHintHtml(tutorialHint(TUT_RUN.st, FOOT.on, TUT_COARSE, tutOnTop())); if (el.dataset.html === html && el.textContent !== '') return; el.dataset.html = html; el.innerHTML = html; }   // written only on a change (aria-live); a cleared banner is written again
```

d) CSS: after the `#tuthint{…}#tuthint:empty{display:none}   /* #534: … */` line (~25) add:

```css
#tuthint kbd,#keybar kbd{display:inline-block;min-width:1.1em;text-align:center}#tuthint kbd{font:inherit;font-weight:800;color:var(--sun);border:2px solid var(--steel);padding:0 5px;line-height:1.2}
.caps{display:inline-flex;gap:2px;vertical-align:baseline}.caps.cross{display:inline-grid;grid-template-columns:repeat(3,auto);gap:2px;vertical-align:middle}.caps.cross kbd:first-child{grid-column:2}   /* #700: W / ↑ on top, the other three below */
```

e) `CHANGELOG.md`: under `## [Unreleased]`, add a `### Changed` section if there is none (after `### Added` and its entries), and in it, with the current local time:

```markdown
- `YYYY-MM-DD HH:MM` The **keys now look like keys**: in the tutorial, the hint shows the movement keys as the **W A S D** cluster the way it sits on the keyboard, "or" the **arrow keys** next to it, and every other key (<kbd>Shift</kbd>, <kbd>Z</kbd>, <kbd>J</kbd>, <kbd>X</kbd>) as its own key cap. The key bar at the bottom shows <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> as four keys instead of one "WASD", which a tester had read as a word to type.
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

```bash
node --test tests/keycaps.test.mjs tests/strings.test.mjs tests/controls.test.mjs tests/tutorial.test.mjs
python3 -m pytest tests/test_keybar.py tests/test_tutorial.py -q
```

Expected: all PASS, page console empty (`errors == []` in both Playwright files)

- [ ] **Step 5: Commit and push**

```bash
git add index.html CHANGELOG.md
git commit -m "feat(tutorial): show keys as key caps in the banner and the key bar (#700)"
git push
```
