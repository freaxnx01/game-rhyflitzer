# Navi: Enter confirms Implementation Plan (#206)

**Goal:** The J / O / I dialog hints name Enter as the confirm key and no longer present the opening key as part of the flow. Spec: `docs/superpowers/specs/2026-10-11-navi-enter-confirms-design.md`.

## Global Constraints

- Buildless; no packages. Locate code by anchors (`jumpKey`, `JUMP_CLOSE_KEYS`, `naviHint` / `driveHint` / `jumpHint`), not line numbers. `main` moves fast; #249 (filter by typing in the F1 help) and #190 reuse this dialog's wording, so touch only these three hint keys.
- Key handling is unchanged. Before finishing, `grep -n "KeyI\|KeyJ\|KeyO" prototype/*.js prototype/index.html` (all files, incl. `pause.js`) to confirm nothing else uses the hint text.
- Tests: `node --test prototype/tests/*.test.mjs` plus ONE Playwright file, foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_navi.py -q -p no:cacheprovider -k "dialog or hint or german"` (never the full suite).
- CHANGELOG hand-written, timestamped `` `YYYY-MM-DD HH:MM` `` (Zurich) under `[Unreleased]` / `### Changed`; never `git cliff -o`.

---

### Task 1: Hint strings (node first)

**Files:** Modify `prototype/strings.js`, `prototype/tests/strings.test.mjs`.

- [ ] **Step 1: failing test.** In `strings.test.mjs` add:

```js
test('jumpHints_AllModes_NameEnterAsConfirm', () => {
  for (const k of ['jumpHint', 'driveHint', 'naviHint']) {
    assert.match(translate('en', k), /Enter confirms/, k);
    assert.match(translate('de', k), /Enter bestätigt/, k);
    assert.doesNotMatch(translate('en', k), /\b[JOI] \/ Esc/, k);
  }
});
```

- [ ] **Step 2:** `node --test prototype/tests/strings.test.mjs` -> FAIL.
- [ ] **Step 3:** In `strings.js` set, en: `'type to search · ↑↓ choose · Enter confirms · Esc closes'`; de: `'tippen zum Suchen · ↑↓ wählen · Enter bestätigt · Esc schliesst'` for `jumpHint`, `driveHint`, `naviHint`.
- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` -> PASS. Commit `fix(navi): hints name Enter as the confirm key (#206)`.

### Task 2: Browser assertions

**Files:** Modify `prototype/tests/test_navi.py`.

- [ ] **Step 1:** Update the four assertions on `#jumphint` (anchors: `"I / Esc closes"`, `"I / Esc schliesst"`, `"J / Esc closes"`, `"O / Esc closes"`) to `"Enter confirms"` / `"Enter bestätigt"`. Add to `test_i_opens_the_navigate_dialog_and_enter_starts_the_navi`, after `pick_dest`: `assert not page.is_visible("#jump")` and `assert navi(page)["on"]` (confirmed by Enter alone, no second I).
- [ ] **Step 2:** run the pytest command -> PASS.
- [ ] **Step 3:** CHANGELOG entry: "The hint under the <kbd>I</kbd>, <kbd>J</kbd> and <kbd>O</kbd> search now says what to press: **Enter** confirms the highlighted place, Esc closes. (Enter always did; the old hint only mentioned the opening key.)" Commit `docs(changelog): navi hint (#206)`.
