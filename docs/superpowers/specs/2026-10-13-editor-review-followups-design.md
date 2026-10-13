# Region editor: review follow-ups from PR#310 — design

Issue: #316. Builds on `docs/superpowers/specs/2026-10-10-region-editor-page-design.md` (#169, merged with PR#310) and changes only what the review of that PR listed. No new feature, no API change.

## Goal

Close the small defects found by reading PR#310. Every finding was re-read against `main` (`10d503d`) before it went into this spec; all of them are real, one is reduced in scope (finding 6), and one extra defect was noticed and parked (see Out of scope).

## What was checked on `main`

| # | Finding | Verdict |
|---|---|---|
| 1 | Frame moved outside Switzerland keeps the old name, the free-driving note and a scheduled preview | Real. `editor/editor.js:111-116` `commit()` only calls `schedulePreview()` when inside; the else branch leaves `S.name`/`S.race`/`S.exists`, the 400 ms `previewTimer` and `previewSeq` untouched, so the timer fires and an in-flight preview still passes the `seq !== previewSeq` guard (`:107`) and renders. |
| 2 | Corner dragged past the opposite one: frame lands away from the pointer when the clamp applies | Real. `editor/frame.js:44-48` `end()` passes `OPPOSITE[drag.corner]` to `clampRect`, but `move()` already re-orders the rect with `orient` (`:42`, `:49`). After a flip the fixed corner is on the other side, so `clampRect` keeps the dragged edge. Only visible when a side is over 4 km or under 1 km (otherwise `clampRect` returns the rect unchanged). The keyboard path cannot flip (a 250 m step on a side of at least 1 km). |
| 3 | `expired` has no sentence | Real. `editor/api.js:65-71` `failKey` returns `errBuildFailed` for `expired`; `applyJob` (`editor.js:149`) passes `job.reason || job.status`, and `parseJob` sets `reason` from `json.error`, which is `null` on an expired job. The existing tests pin the generic text (`prototype/tests/editor-api.test.mjs:73`, `test_editor.py` last row of the error table). |
| 4 | Size text not through `Intl.NumberFormat` | Real, cosmetic. `editor/editor.js:42` passes raw numbers to `t('sizeKm', w, h)`; a de-DE browser gets `2.5`, not `2,5`. |
| 5 | `#dlbtn` (`role="button"`, an `<a>`) answers Enter, not Space | Real. `editor/index.html:29`; no key handler in `editor.js`. |
| 6 | `editor.html` meta refresh drops `?bbox=` | Real but reduced. `editor.html:3` is a static refresh to `editor/`; with no JavaScript the query cannot be carried (static host), and the editor itself needs JavaScript, so a no-JS visitor gets a dead page either way. The one fixable part: the refresh is not gated on `<noscript>`, so with JavaScript on it can race `location.replace` (line 4) and drop the query. Wrapping it in `<noscript>` removes the race. |
| 7 | Missing browser tests: "Connection lost, retrying…" after three misses; hidden tab | Real. No test in `test_editor.py` reads `#lost` positive; the only visibility test dispatches a synthetic event with `document.hidden === false`. The page spec says "3 misses in a row" (spec line 97) and says nothing about a hidden tab; the test pins what the code does (`editor.js:204`: a hidden tab does nothing, a visible one polls at once). |

## Design

1. **Outside Switzerland.** `commit()` gets an else branch (state `edit`, not inside): `cancelPreview()` clears `previewTimer`, bumps `previewSeq`, and sets `S.name = null` (renders the existing "—"), `S.race = null`, `S.exists = false`. No new string.
2. **Flip.** A pure helper `fixedCornerAfterResize(rect0, corner, rect)` in `geo.js` returns the corner letter (`nw|ne|se|sw`) of the re-ordered `rect` that holds the point that was opposite to the dragged corner in `rect0`. `end()` uses it instead of `OPPOSITE`. Tie (zero width or height after re-ordering): the old default `OPPOSITE[corner]`.
3. **Expired.** New key `errExpired`. `failKey('expired')` returns it. English: "This world has expired. Build it again." German: "Diese Welt ist abgelaufen. Bau sie noch einmal." The fail card already has "Change the frame" to go back.
4. **Number format.** `strings.js` gets `numberLocale(lang, navLang)` and `formatKm(value, lang, navLang)`. The region comes from `navigator.language` when it has the page language and a region; otherwise `de` becomes `de-CH`, `en` stays `en`. `renderEdit` formats `w` and `h` before `t('sizeKm', …)`; the string itself is unchanged.
5. **Space on the download link.** `keydown` on `#dlbtn` for Space calls `preventDefault()` (no page scroll); `keyup` for Space triggers `click()`, the way a native button activates.
6. **Root stub.** In `editor.html` the meta refresh moves into `<noscript>`.
7. **Tests.** See the plan; every finding gets a test that fails on today's `main`.

## Out of scope (parked, not done)

- After the connection comes back, `#lost` stays visible while the job is still queued/building (`editor.js:150 and :163` sets `S.misses = 0` but never hides `#lost`; only `backToEdit` does, `:194`). Found while reading for finding 7. One hop from this issue; park as its own fix.
- Carrying `?bbox=` without JavaScript is impossible on a static host and is not attempted.

## Files

`editor/editor.js`, `editor/frame.js`, `editor/geo.js`, `editor/api.js`, `editor/strings.js`, `editor.html`, `CHANGELOG.md` (one entry); tests `prototype/tests/editor-geo.test.mjs`, `editor-api.test.mjs`, `editor-strings.test.mjs`, `test_editor.py`. Not touched: `prototype/index.html`, `prototype/strings.js`, `prototype/gallery.js`, `service/**`, `scripts/gallery.py` (another run, #170, edits those).
