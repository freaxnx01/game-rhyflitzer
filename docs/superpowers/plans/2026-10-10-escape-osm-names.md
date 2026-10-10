# Escape OSM names before innerHTML (#176) Implementation Plan

**Goal:** Data-derived text (OSM names, vehicle ids) can never run script through `innerHTML`.

**Architecture:** One pure `esc()` module, applied at the interpolation points that carry data; `toast()` becomes text-only and a new `toastHtml()` serves our own markup. `strings.js` is untouched. Spec: `docs/superpowers/specs/2026-10-10-escape-osm-names-design.md` (sink audit, assumptions).

## Global Constraints

- **Never put a `//` comment in the middle of a one-line statement in `prototype/index.html`** (much of the file is one statement per line; a trailing `//` swallows the rest of the line). Use `/* ... */` or a comment on its own line.
- Buildless: no package.json, no framework, no new dependency. `escape.js` is a plain ES module like `carselect.js`.
- Do not escape the result of `tr()`; escape the data arguments. Do not touch `applyStaticStrings`, `resultHtml`, `$('time').innerHTML`, stat bars (trusted).
- Tests: node tests via `node --test prototype/tests/escape.test.mjs`. Playwright is slow: run it in the foreground only (never `run_in_background`), frame-light (small viewport 480x270, `wait_frames` style polling, no long loops), only the affected files, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_xss.py prototype/tests/test_toast.py prototype/tests/test_hunt.py prototype/tests/test_jump.py -x`. Not the full ~2 h suite.
- Commit and push the branch before the Playwright run.

### Task 1: `esc()` module with node test (TDD)

**Files:** create `prototype/escape.js`, `prototype/tests/escape.test.mjs`.

- [ ] **Step 1: Write the failing test** `prototype/tests/escape.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../escape.js';

test('esc: escapes & < > " and apostrophe', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});
test('esc: & goes first, so nothing is double escaped', () => {
  assert.equal(esc('&lt;'), '&amp;lt;');
});
test('esc: plain text, umlauts and slashes pass unchanged', () => {
  assert.equal(esc('Bad Säckingen / Rheinfelden (Baden)'), 'Bad Säckingen / Rheinfelden (Baden)');
});
test('esc: numbers become strings, null and undefined become empty', () => {
  assert.equal(esc(42), '42'); assert.equal(esc(null), ''); assert.equal(esc(undefined), '');
});
```

- [ ] **Step 2:** `node --test prototype/tests/escape.test.mjs` fails (module missing).
- [ ] **Step 3: Implement** `prototype/escape.js` (pure, no DOM):

```js
// escape.js (#176): HTML-escape data-derived text (OSM names, vehicle ids) before it goes into innerHTML, in text and in quoted attributes.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
```

- [ ] **Step 4:** the node test passes. Commit `fix(ui): add esc() helper for data-derived HTML text (#176)`.

### Task 2: Escape the J/O list, chips and garage tiles

**Files:** modify `prototype/index.html` (import near line 329-336; `renderJump` ~1769-1770; `renderCarSel` ~1729-1730).

- [ ] **Step 1:** add `import { esc } from './escape.js';` beside the other module imports.
- [ ] **Step 2:** `renderJump` list row: `${esc(r.n)}<span>${r.street ? tr('streetIn', esc(r.g)) : esc(r.g)}</span>` (`esc(null)` is empty, matching the old `|| ''`). Chips: `data-g="${esc(g)}"` and the label `${g === 'All' ? tr('chipAll') : esc(g)}`. Keep the `JUMP.g === g` comparison on the raw value (the click handler reads `dataset.g`, which the browser decodes back to the raw name).
- [ ] **Step 3:** garage tiles: `data-id="${esc(id)}" aria-label="${esc(vehicleText(tr, id, 'name'))}" title="${esc(vehicleText(tr, id, 'name'))}"`. Swatches: `data-paint="${esc(p.id)}" aria-label="${esc(tr(p.nameKey))}" title="${esc(tr(p.nameKey))}"`. Leave `style="background:${p.hex}"` and the stat bars alone.
- [ ] **Step 4:** confirm the selectors that read `dataset.id` / `dataset.paint` / `dataset.g` and the focus re-find (~1731, `querySelector('[data-id="..."]')`) still work with a name containing `"`; if the re-find builds a selector string from the raw id, switch it to `CSS.escape`.
- [ ] **Step 5:** quick manual check in the browser (Task 4 formalises it). Commit `fix(ui): escape names in J list, chips and garage tiles (#176)`.

### Task 3: `toast()` text default, `toastHtml()` for own markup

**Files:** modify `prototype/index.html` (definition ~1686 and the call sites).

- [ ] **Step 1:** replace the definition with a shared setter and two entry points: `toast(text, secs)` sets `textContent`; `toastHtml(html, secs)` sets `innerHTML`; both add `show` and set `toastT` (keep the default `secs = TOAST_S.info`). Keep it multi-line or `/* */` commented, see Global Constraints.
- [ ] **Step 2:** find every toast whose string contains markup: list the `strings.js` keys used with `toast(` (`grep -n "toast(" prototype/index.html`) and check each key's value in both `en` and `de` for `<`. Known: `presentToast` (`<br>` + `small()` span, ~1700). Check `fishes`, `underwaterHint` (~1626-1628), `camera`, `photoSaved`, `copied`. Switch exactly those call sites to `toastHtml`. All others, including `toast(name)` in `placeOnRoad`, `naviOn`, `naviArrived`, `AUTO_TOASTS` with `dest.n`, stay on `toast`.
- [ ] **Step 3:** also scan `prototype/*.js` for a `toast` caller (none expected). Commit `fix(ui): toast() renders text, toastHtml() for own markup (#176)`.

### Task 4: Playwright test with a poisoned world

**Files:** create `prototype/tests/test_xss.py`; model it on `test_boundaries.py` (`open_page`, `page.route` serving a modified `world_hochrhein.json`, `needs_world` skip) and `test_toast.py` (`start_hand`, swiftshader args, small viewport).

- [ ] **Step 1:** `PAYLOAD = '<img src=x onerror="window.__xss=1">'`. Load `data/world_hochrhein.json`, in a copy replace one landmark name (anchors / landmark entries), one street name, one Gemeinde name (the `names` lists / entries the J chips and `placeChips` use) and one water name with `PAYLOAD + ' & Co'`, serve it via `page.route`. Block the `.mmh` as the other tests do.
- [ ] **Step 2 (J list, chips):** press J, assert `window.__xss` is `undefined`, the list contains an `li` whose `textContent` includes the payload text and `#jumplist img` count is 0; same for `#jumpchips`. Click the poisoned chip and assert the list filters to its rows (round trip of `data-g`). Repeat for O (drive: street rows, `streetIn`) and I (navi).
- [ ] **Step 3 (toasts):** teleport via the J list to the poisoned landmark (toast name), start navi to it (`naviOn`), assert `#toast` shows the payload as text, `#toast img` count 0, `__xss` undefined.
- [ ] **Step 4 (result screen):** finish or force the result with the hand-world helper used by `test_blitz.py` / `test_hunt.py`, assert `#result img` count 0 and `__xss` undefined (own strings only, regression guard).
- [ ] **Step 5 (garage):** open car select, `window.__mm.registerVehicle(PAYLOAD, <copy of an existing def>)` (the `VEHICLES` def shape in `carselect.test.mjs` / `test_carselect.py`), assert `#csgarage img` count 0, a tile's `aria-label` equals the payload string, `__xss` undefined.
- [ ] **Step 6:** poll `window.__xss === undefined` after a few frames wait (use the `wait_frames` helper), not a long sleep. Also add one assertion that `presentToast` still has a `<br>`: reuse the existing `test_hunt.py` coverage, just run it. Commit `test(ui): poisoned-world XSS test (#176)`.

### Task 5: Changelog, verify, finish

**Files:** modify `CHANGELOG.md`.

- [ ] **Step 1:** under `## [Unreleased]` add `### Fixed` (create if absent) with: `- Place and street names with special characters (such as & or quotes) now show exactly as written in the list, the chips and the messages.`
- [ ] **Step 2:** `node --test prototype/tests/*.test.mjs`, then the foreground capped Playwright command from Global Constraints. All green; if a test fails three times, stop and report.
- [ ] **Step 3:** open a PR `fix(ui): escape OSM names before innerHTML (#176)` with `Closes #176`.
