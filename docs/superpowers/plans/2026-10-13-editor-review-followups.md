# Region editor review follow-ups (#316) Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-13-editor-review-followups-design.md`. Work test-first. Never change a test to make it green.

**Goal:** Fix the seven items from the review of PR#310 in the region editor page, each with a test that fails on today's `main`.

**Architecture:** Plain ES modules in `editor/`, no build. Pure logic goes in `geo.js` / `api.js` / `strings.js` (tested with `node --test`); DOM wiring in `editor.js` / `frame.js` (tested with Playwright in `prototype/tests/test_editor.py`).

**Tech Stack:** vanilla JS, `node --test`, Playwright (Python).

## Global Constraints

- Touch only: `editor/editor.js`, `editor/frame.js`, `editor/geo.js`, `editor/api.js`, `editor/strings.js`, `editor.html`, `CHANGELOG.md`, `prototype/tests/editor-geo.test.mjs`, `prototype/tests/editor-api.test.mjs`, `prototype/tests/editor-strings.test.mjs`, `prototype/tests/test_editor.py`. Another run (#170) edits `prototype/index.html`, `prototype/strings.js`, `prototype/gallery.js`, `service/**`, `scripts/gallery.py`: do not touch them.
- Every new sentence exists in `en` and `de` in `editor/strings.js` (German: real umlauts, capitalised Du/Dein/Dir). `editor-strings.test.mjs` checks key parity and forbids markup and `ß`.
- Render with `textContent` only. No `var`. Small functions, guard clauses.
- Run only `node --test prototype/tests/editor-*.test.mjs` and the new/changed Playwright tests by name (`pytest prototype/tests/test_editor.py -k "<name>"`), in the foreground, never `run_in_background`. Do not run the whole Playwright suite.
- Out of scope: `#lost` staying visible after a recovered connection (parked, see spec).
- `CHANGELOG.md`: add one line under `## [Unreleased]` → `### Fixed`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, written for the player, 1–3 bold keywords. Do this last; the file is also edited by other runs, so `git fetch origin && git rebase origin/main` first and keep their lines.

## Task 1: no stale name, note or preview outside Switzerland (finding 1)

**Files:** `editor/editor.js` (`commit`), `prototype/tests/test_editor.py`.

**Interfaces:** new `cancelPreview()` next to `schedulePreview()`; no export.

- [ ] **Step 1: Write the failing test.** In `test_editor.py`, give `Api` a counter: `self.previews = 0` in `__init__` and `self.previews += 1` in the `"/api/preview" in url` branch. Add (the `OUTLINE` hole is `2650000..2653000 / 1250000..1254000`; the default stub preview says `raceOk: False`, so `#warn` shows once the preview landed):

```python
HOLE = [2650250, 1250250, 2652250, 1252250]


def test_a_frame_moved_outside_switzerland_drops_name_note_and_pending_preview(server):
    api = Api()
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.wait_for_function("() => document.querySelector('#name').textContent.includes('Ehrendingen') && !document.querySelector('#warn').hidden", timeout=20000)
        page.evaluate("(r) => window.__ed.setRect(r)", HOLE)
        now = page.evaluate("() => ({ name: document.querySelector('#name').textContent, warn: document.querySelector('#warn').hidden, pv: window.__ed.preview() })")
        before = api.previews
        page.evaluate("([a, h]) => { window.__ed.setRect(a); window.__ed.setRect(h); }", [[2667250, 1259750, 2669250, 1261750], HOLE])   # inside, then outside within 400 ms
        page.wait_for_timeout(1200)   # a leaked timer would have fired its preview by now
        after = api.previews
        b.close()
    assert errs == []
    assert now == {"name": "—", "warn": True, "pv": {"name": None, "race": None, "exists": False}}
    assert after == before
```

Expected: fails on `main` (name stays "Ehrendingen…", warn visible, `after == before + 1`).

- [ ] **Step 2: Implement.** In `editor.js`:

```js
function cancelPreview() {   // outside Switzerland: nothing to name, nothing to ask the service
  clearTimeout(previewTimer); previewSeq++; S.name = null; S.race = null; S.exists = false;
}

function commit(rect) {
  S.rect = rect; frame.setRect(rect); S.inside = S.outline ? rectInside(rect, S.outline) : null;
  history.replaceState(null, '', `?bbox=${formatBbox(rect)}`);
  if (S.state === 'edit') { if (S.inside) schedulePreview(); else cancelPreview(); }
  render();
}
```

`S.name = null` renders the existing "—" (`t('nameNone')`); `previewSeq++` also discards an answer already in flight.

- [ ] **Step 3:** run the test, expect pass. Commit `fix(editor): drop name, note and pending preview when the frame leaves Switzerland`.

## Task 2: corner dragged past the opposite one (finding 2)

**Files:** `editor/geo.js`, `editor/frame.js` (`end`), `prototype/tests/editor-geo.test.mjs`, `prototype/tests/test_editor.py`.

**Interfaces:** `fixedCornerAfterResize(rect0, corner, rect) -> 'nw'|'ne'|'se'|'sw'`, exported from `geo.js`. `rect0` = rect at drag start, `corner` = dragged corner, `rect` = the re-ordered rect (min/max) before snapping.

- [ ] **Step 1: Write the failing node test** (add the import to the existing import line):

```js
test('fixedCornerAfterResize: the corner opposite the dragged one, also after the rect flipped', () => {
  assert.equal(fixedCornerAfterResize(EHR, 'se', EHR), 'nw');   // no flip: the old OPPOSITE table
  assert.equal(fixedCornerAfterResize(EHR, 'nw', EHR), 'se');
  const flipped = [2660000, 1259750, 2667000, 1261750];   // se dragged 9 km west past the west edge, re-ordered
  assert.equal(fixedCornerAfterResize(EHR, 'se', flipped), 'ne');   // the fixed (old nw) point is now the east edge
  const both = [2669000, 1257750, 2671000, 1259750];      // nw dragged past the south-east corner on both axes, re-ordered
  assert.equal(fixedCornerAfterResize(EHR, 'nw', both), 'nw');   // the fixed (old se) point is now its north-west corner
  assert.equal(fixedCornerAfterResize(EHR, 'ne', [2667000, 1259750, 2667000, 1261750]), 'sw');   // zero width: tie falls back to the old default
});

test('flipped drag over 4 km keeps the fixed corner where it was', () => {
  const flipped = [2660000, 1259750, 2667000, 1261750];
  const fixed = fixedCornerAfterResize(EHR, 'se', flipped);
  assert.deepEqual(clampRect(snapRect(flipped), fixed), [2663000, 1259750, 2667000, 1261750]);   // east edge 2667000 stays; today's 'nw' gives 2660000..2664000
});
```

Expected: fails (function missing).

- [ ] **Step 2: Implement** in `geo.js`. Reuse `clampRect`'s letter convention (`nw`/`sw` = fixed corner on the west side; `sw`/`se` = on the south side):

```js
const OPPOSITE = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

export function fixedCornerAfterResize(rect0, corner, rect) {
  const west = corner === 'nw' || corner === 'sw', north = corner === 'nw' || corner === 'ne';
  const fixedE = west ? rect0[2] : rect0[0], fixedN = north ? rect0[1] : rect0[3];
  const fixedIsWest = fixedE === rect[0] && fixedE !== rect[2], fixedIsEast = fixedE === rect[2] && fixedE !== rect[0];
  const fixedIsSouth = fixedN === rect[1] && fixedN !== rect[3], fixedIsNorth = fixedN === rect[3] && fixedN !== rect[1];
  const [defaultNs, defaultEw] = OPPOSITE[corner];
  const ns = fixedIsNorth ? 'n' : fixedIsSouth ? 's' : defaultNs, ew = fixedIsEast ? 'e' : fixedIsWest ? 'w' : defaultEw;
  return ns + ew;
}
```

Adjust the tie-break details until the test above passes; the contract is the test, not this body. In `frame.js` import it and replace the `OPPOSITE` table and its use:

```js
function end() {
  if (!drag) return;
  const fixed = drag.corner ? fixedCornerAfterResize(drag.rect0, drag.corner, rect) : 'sw'; drag = null;
  commit(clampRect(snapRect(rect), fixed));
}
```

Remove the now unused `OPPOSITE` from `frame.js`.

- [ ] **Step 3: Playwright test** (hand-checked arithmetic only; it is not run in this plan's authoring). Add to `test_editor.py`: start at `EHR`, drag the `se` handle far west and slightly up-left so the rect flips and exceeds 4 km (as the existing `ne` drag does with `hx + 600`, here `hx - 600`), then assert the committed rect keeps the old north-west point (`EHR[0]`, `EHR[3]`) as its north-east corner: `r[2] == EHR[0]`, `r[3] == EHR[3]`, `r[2] - r[0] == 4000`.
- [ ] **Step 4:** run `node --test prototype/tests/editor-geo.test.mjs` and the new Playwright test by name; pass. Commit `fix(editor): keep the fixed corner when a resize drag flips the frame`.

## Task 3: a sentence for an expired job (finding 3)

**Files:** `editor/api.js` (`failKey`), `editor/strings.js`, `prototype/tests/editor-api.test.mjs`, `editor-strings.test.mjs`, `test_editor.py`.

- [ ] **Step 1: Write the failing tests.**
  - `editor-api.test.mjs:73`: take `'expired'` out of the `errBuildFailed` list and add `assert.equal(failKey('expired'), 'errExpired');`.
  - `editor-strings.test.mjs`: add `'errExpired'` to the "every error key … has a string" list.
  - `test_editor.py`: the last row of the error table (`job("expired")`) now expects `"This world has expired. Build it again."`.
- [ ] **Step 2: Implement.** `api.js`: first line of `failKey` after the frame codes: `if (reason === 'expired') return 'errExpired';`. `strings.js`: `en.errExpired: 'This world has expired. Build it again.'`, `de.errExpired: 'Diese Welt ist abgelaufen. Bau sie noch einmal.'` (next to `errBuildFailed`).
- [ ] **Step 3:** `node --test prototype/tests/editor-*.test.mjs`; run the error-table Playwright test with `-k "every_error_has_a_sentence"`. Commit `fix(editor): say when an expired world is gone`.

## Task 4: number format and Space on the download link (findings 4, 5)

**Files:** `editor/strings.js`, `editor/editor.js`, `prototype/tests/editor-strings.test.mjs`, `test_editor.py`.

**Interfaces:** `numberLocale(lang, navLang) -> string`, `formatKm(value, lang, navLang) -> string`, both exported from `strings.js`.

- [ ] **Step 1: Write the failing node test:**

```js
test('formatKm: the region of the browser decides, de without a region is de-CH, a broken tag falls back', () => {
  assert.equal(formatKm(2.5, 'de', 'de-DE'), '2,5');
  assert.equal(formatKm(2.5, 'de', 'de-CH'), '2.5');
  assert.equal(formatKm(2.5, 'de', 'en-US'), '2.5');   // page language de, browser en: de-CH
  assert.equal(formatKm(2.5, 'en', 'en-GB'), '2.5');
  assert.equal(formatKm(3, 'en', ''), '3');
  assert.equal(formatKm(2.25, 'en', 'x_@@'), '2.25');   // invalid tag: no throw
  assert.equal(numberLocale('de', 'de'), 'de-CH'); assert.equal(numberLocale('en', undefined), 'en');
});
```

- [ ] **Step 2: Implement** in `strings.js`:

```js
export function numberLocale(lang, navLang = '') {   // regional formatting follows the OS region, not the UI language; de without a region is de-CH
  const tag = String(navLang || '');
  return tag.toLowerCase().startsWith(lang) && tag.includes('-') ? tag : lang === 'de' ? 'de-CH' : 'en';
}

export function formatKm(value, lang, navLang) {
  const options = { maximumFractionDigits: 2 };
  try { return new Intl.NumberFormat(numberLocale(lang, navLang), options).format(value); }
  catch (e) { return new Intl.NumberFormat(lang === 'de' ? 'de-CH' : 'en', options).format(value); }
}
```

In `editor.js` `renderEdit`: `const fmt = (v) => formatKm(v, window.GG_LANG, navigator.language); setText('size', t('sizeKm', fmt(w), fmt(h)));` and import `formatKm`. The `sizeKm` strings stay as they are, so `translate('en', 'sizeKm', 2.5, 3)` still gives `2.5 × 3 km`.

- [ ] **Step 3: Space key.** In `editor.js` next to the `dlbtn` click listener:

```js
$('dlbtn').addEventListener('keydown', (e) => { if (e.key === ' ') e.preventDefault(); });   // no page scroll; a button acts on keyup
$('dlbtn').addEventListener('keyup', (e) => { if (e.key === ' ') e.currentTarget.click(); });
```

Playwright test (build to done as in `test_download_packs_the_three_files_into_a_zip`, then `page.focus("#dlbtn")`, `page.keyboard.press("Space")` inside `page.expect_download()`), expect the same zip file name as the click test. Add a second Playwright check, in a context with `locale="de-DE"` and `lang="de"`, that a 2.5 km wide frame (`[2667000, 1259750, 2669500, 1261750]`) shows `2,5 × 2 km`. `open_page` hard-codes `locale="en-US"`: add a `locale=None` parameter that defaults to it.
- [ ] **Step 4:** run the node tests and both Playwright tests by name. Commit `fix(editor): format the size by region and let Space press the download link`.

## Task 5: root stub only redirects without JavaScript (finding 6)

**Files:** `editor.html`, `prototype/tests/test_editor.py`.

- [ ] **Step 1: Write the failing test** (no browser; reads the file):

```python
def test_root_editor_html_meta_refresh_only_without_javascript():
    html = (ROOT / "editor.html").read_text(encoding="utf-8")
    assert re.search(r"<noscript>\s*<meta http-equiv=\"refresh\"[^>]*url=editor/\"\s*>\s*</noscript>", html)
    assert html.count("http-equiv") == 1 and 'location.replace("editor/" + location.search + location.hash)' in html
```

- [ ] **Step 2: Implement.** `editor.html` becomes:

```html
<!doctype html>
<meta charset="utf-8">
<title>Region editor</title>
<noscript><meta http-equiv="refresh" content="0; url=editor/"></noscript>
<script>location.replace("editor/" + location.search + location.hash);</script>
```

- [ ] **Step 3:** run that test and `-k "root_editor_html"` (the existing redirect test). Commit `fix(editor): gate the root stub's meta refresh on noscript`.

## Task 6: browser tests for the lost connection and the hidden tab (finding 7)

**Files:** `prototype/tests/test_editor.py` only.

- [ ] **Step 1: Three misses.** `api = Api(script=[(500, {})])` (the last answer repeats, so every poll misses). Build; wait for `window.__ed.state() === 'queued'`. Poll the Python counter (`page.wait_for_timeout(250)` steps, up to 20 s) until `api.gets == 2` and assert `#lost` is hidden; then until `api.gets == 3` and `page.wait_for_function("() => !document.querySelector('#lost').hidden")`, and assert its text is `Connection lost, retrying…`.
- [ ] **Step 2: Hidden tab.** Build to `queued` with `Api(script=[(200, job("queued", position=1))])`. `page.evaluate("() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })")`, record `g = api.gets`, dispatch `visibilitychange`, wait 600 ms, assert `api.gets == g` (a hidden tab does not poll). Then redefine `hidden` as `false`, dispatch the event, `page.wait_for_function` is not available for a Python counter: poll `api.gets > g` for up to 3 s and assert it grew within 1 s of the event (the page polls at once, not after the 2 s delay).
- [ ] **Step 3:** run both by name, foreground. Commit `test(editor): connection-lost sentence and the hidden tab`.

## Task 7: changelog, push

- [ ] `git fetch origin && git rebase origin/main`, add the CHANGELOG line (for the player: the region editor keeps the right name, takes the right corner when a frame is pulled inside out, says when a world has expired, sizes follow the language region, Space downloads), run `node --test prototype/tests/editor-*.test.mjs` once more, then open a PR as usual (all changes go through a PR).
