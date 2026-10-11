# F1 help filter Implementation Plan (#249)

**Goal:** Typing in a search field at the top of the F1 help filters the key list, accent- and case-insensitively, without any game key firing. Spec: `docs/superpowers/specs/2026-10-11-help-filter-design.md`.

## Global Constraints

- Buildless; no packages. Locate code by anchors (`id="help"`, the global `addEventListener('keydown'`, `function openJump`), never line numbers: `main` changes fast, and PR #281 plus the #216 / #105 pipeline runs also touch `prototype/index.html`. Keep the diff to the help markup, one new function block next to the jump functions, and the first branch of the keydown handler.
- In `index.html` never put a `//` comment mid-line in a one-line statement.
- Key handling: before editing, `grep -n "'help'\|F1\|helpOpen" prototype/*.js prototype/index.html` (all files incl. `pause.js` and `pauseKeyAction`'s `helpOpen` state). `pauseKeyAction` returns `'pass'` for Escape while help is open; with `helpKey` as the first branch that case no longer reaches it, which is fine.
- Tests: `node --test prototype/tests/*.test.mjs` plus ONE Playwright file, foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_help_filter.py -q -p no:cacheprovider` (hand layout, no world). Never the full suite.
- CHANGELOG hand-written, timestamped `` `YYYY-MM-DD HH:MM` `` (Zurich) under `[Unreleased]` / `### Added`; never `git cliff -o`.

---

### Task 1: `filterHelpRows` (node first)

**Files:** Create `prototype/helpfilter.js`, `prototype/tests/helpfilter.test.mjs`.

- [ ] **Step 1: failing test.** `helpfilter.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHelpRows } from '../helpfilter.js';

const rows = [
  { keys: 'M', text: 'Ton aus' },
  { keys: 'F3', text: 'debug: coordinates' },
  { keys: 'Esc · P', text: 'Pause: weiter' },
];

test('filterHelpRows_PartialText_KeepsMatchingRows', () => {
  assert.deepEqual(filterHelpRows(rows, 'ton').map(r => r.keys), ['M']);
});
test('filterHelpRows_KeyLabel_Matches', () => {
  assert.deepEqual(filterHelpRows(rows, 'f3').map(r => r.keys), ['F3']);
});
test('filterHelpRows_AccentsAndCase_AreFolded', () => {
  assert.equal(filterHelpRows([{ keys: 'X', text: 'Fahrzeug wählen' }], 'WAHLEN').length, 1);
});
test('filterHelpRows_EmptyOrBlank_ReturnsAll', () => {
  assert.equal(filterHelpRows(rows, '').length, 3);
  assert.equal(filterHelpRows(rows, '   ').length, 3);
});
test('filterHelpRows_NoMatch_ReturnsEmpty', () => {
  assert.deepEqual(filterHelpRows(rows, 'zzz'), []);
});
```

- [ ] **Step 2:** `node --test prototype/tests/helpfilter.test.mjs` -> FAIL (no module).
- [ ] **Step 3:** `helpfilter.js`: `import { foldText } from './landmarks.js'; export function filterHelpRows(rows, query) { const q = foldText(query.trim()); return q ? rows.filter(r => foldText(`${r.keys} ${r.text}`).includes(q)) : rows; }`
- [ ] **Step 4:** node test -> PASS. Commit `feat(ui): filterHelpRows for the F1 help (#249)`.

### Task 2: Strings

**Files:** Modify `prototype/strings.js`, `prototype/tests/strings.test.mjs`.

- [ ] **Step 1: failing test.** In `strings.test.mjs` add `helpSearch` and `helpNone` to a `translate('de', k) !== k` loop like the existing `for (const k of ['pauseHint', ...])` line, and assert `translate('en','helpSearch') === 'Search keys'`, `translate('de','helpSearch') === 'Tasten suchen'`.
- [ ] **Step 2:** node strings test -> FAIL.
- [ ] **Step 3:** Add to both language blocks next to `helpTitle`: en `helpSearch: 'Search keys'`, `helpNone: 'No key matches'`; de `helpSearch: 'Tasten suchen'`, `helpNone: 'Keine Taste passt'`.
- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` -> PASS. Commit `feat(ui): help search strings (#249)`.

### Task 3: Wire the field (Playwright)

**Files:** Modify `prototype/index.html`; create `prototype/tests/test_help_filter.py` (copy the `open_page` / `server` pattern from `test_pause.py`: world and terrain routes blocked, `locale="de-CH"` for the German test).

- [ ] **Step 1: failing test.** `test_help_filter.py`:
  1. `test_f1_focuses_the_search_and_typing_filters`: open page, start, `F1`; assert `document.activeElement.id == 'helpq'`; type `ton`; the visible rows (`#help .keys kbd` not `[hidden]`) number 1 and its `span` text contains "Ton" (DE locale: "Ton aus") / "mute" (EN).
  2. `test_typing_in_the_help_fires_no_game_key`: type `tonjoin`; assert `window.__mm.keysDown()` is empty, `#jump` and `#overlay` stay hidden, `window.__mm.hud().help` is true.
  3. `test_no_match_shows_the_hint_and_escape_closes`: type `zzzz`; `#helpnone` visible, zero visible rows; Escape: `hud().help` false and, reopening with F1, the field is empty and all rows visible.
  4. `test_question_mark_is_typed_not_toggling`: with help open type `?`; help stays open.
- [ ] **Step 2:** run the pytest command -> FAIL.
- [ ] **Step 3:** (a) markup: after the `helpTitle` div in `#help` add `<input id="helpq" type="search" autocomplete="off" spellcheck="false" aria-label="Search keys" placeholder="Search keys" data-i18n-aria="helpSearch" data-i18n-placeholder="helpSearch">` and, after `div.keys`, `<div id="helpnone" hidden data-i18n="helpNone">No key matches</div>`; style `#helpq` like `#jumpq` and `#helpnone` like the other small steel-light text. (b) `import { filterHelpRows } from './helpfilter.js'` beside the `filterLandmarks` import. (c) next to the jump functions add `openHelp`, `closeHelp`, `renderHelp` (reads `.keys` children in pairs into `{ keys, text }` with `row.index`, sets `hidden` on both nodes by membership in `filterHelpRows(...)`, toggles `#helpnone`), `helpKey(e)` as specified in the spec, an `input` listener on `#helpq` calling `renderHelp`, and call `renderHelp` from the existing `gg-langchange` listener path. (d) Replace the inline `if (e.code === 'F1' || (e.key === '?')) { ...toggle... }` branch with: closed help opens via `openHelp()`, and add as the very first statement of the global keydown handler `if (!$('help').hidden) { helpKey(e); return; }`; the `Escape` line that hides help is replaced by `closeHelp` through `helpKey`. Keep `openPause` / `openCarSel`'s `$('help').hidden = true` but route them through `closeHelp()`.
- [ ] **Step 4:** pytest command -> PASS; `node --test prototype/tests/*.test.mjs` -> PASS. Also confirm the existing help assertions: `python -m pytest prototype/tests/test_smoke.py -q -k help` if such a test exists (only that selection).
- [ ] **Step 5:** CHANGELOG entry: "The **F1** key list has a search field now: it is focused as soon as the help opens, and typing „ton" shows only „Ton aus" (M). It finds keys by their label or their description, ignoring capitals and umlauts. Esc closes the help." Commit `feat(ui): filter the F1 help by typing (#249)`.
