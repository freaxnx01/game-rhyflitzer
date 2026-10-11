# Abandon dialog fit Implementation Plan (#223)

**Goal:** The abandon dialog title fits its panel on desktop and phone, and its buttons are unambiguous. Spec: `docs/superpowers/specs/2026-10-11-abandon-dialog-fit-design.md`.

## Global Constraints

- Buildless; no packages. Locate code by anchors, not line numbers.
- In `prototype/index.html` never put a `//` comment mid-line in a one-line statement.
- Tests: `node --test prototype/tests/*.test.mjs` plus ONE Playwright file, foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_pause.py -q -p no:cacheprovider -k abandon` (never the full suite).
- CHANGELOG hand-written, player-facing, timestamped `` `YYYY-MM-DD HH:MM` `` (Zurich time) under `[Unreleased]` / `### Fixed`; never `git cliff -o`.

---

### Task 1: Wording (node first)

**Files:** Modify `prototype/strings.js`, `prototype/tests/strings.test.mjs`.

- [ ] **Step 1: failing test.** In `strings.test.mjs`, the block asserting `abandonCancel` / `abandonOk`: change expected values to `en`: `Keep driving` / `Abandon run`; `de`: `Weiterspielen` / `Lauf verwerfen`. Add `assert.equal(translate('de','abandonHint'),'Esc: weiterspielen')` and the en `'Esc: keep driving'`.
- [ ] **Step 2:** `node --test prototype/tests/strings.test.mjs` -> FAIL.
- [ ] **Step 3:** In `strings.js` (en and de blocks, keys `abandonCancel`, `abandonOk`, `abandonHint`) set the new texts. Also update the `data-i18n` fallback text in `index.html` (`#abandoncancel`, `#abandonok`, `abandonHint` small) to the English wording.
- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` -> PASS. Commit `fix(ui): say what the abandon buttons do (#223)`.

### Task 2: Title fits (Playwright)

**Files:** Modify `prototype/index.html`, `prototype/tests/test_pause.py`.

- [ ] **Step 1: failing test.** In `test_pause.py` add `test_abandon_title_fits_desktop(server)`: same flow as the existing abandon test (`open_page(p, server)`, `drive`, Esc, tap `#pausemenu`, wait `pause().confirm`) but with `page.add_init_script("localStorage.setItem('gg-lang','de')")` registered before `open_page` navigates (create context via `open_page`'s browser, or call `page.evaluate("ggSetLang('de')")` after open). Evaluate for `#abandontitle`: `scrollWidth <= clientWidth`, `getBoundingClientRect().right <= panel.right`, line count `height / lineHeight <= 2`. Assert all three at 1280x720. In the existing phone test update expected button texts to `["Weiterspielen", "Lauf verwerfen"]`.
- [ ] **Step 2:** run the pytest command above -> new test FAILS (title 72 px overflows).
- [ ] **Step 3:** In `index.html`, directly after the `#pause .btn,#abandon .btn{...}` rule add `#abandon h1{font-size:clamp(26px,9vw,44px);overflow-wrap:anywhere}`.
- [ ] **Step 4:** pytest command -> PASS (phone test still passes). Run `node --test prototype/tests/*.test.mjs` -> PASS.
- [ ] **Step 5:** CHANGELOG entry: „Die Rückfrage „Diesen Lauf abbrechen?" passt jetzt in ihr Fenster, und die Knöpfe heissen „Weiterspielen" und „Lauf verwerfen", damit klar ist, was sie tun." Commit `fix(ui): fit the abandon dialog title and name its buttons (#223)`.
