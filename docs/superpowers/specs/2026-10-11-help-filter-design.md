# Filter the F1 help by typing (#249)

## Findings
- `#help` in `prototype/index.html` is a fixed panel with a flat CSS grid: `div.keys` holds `<kbd>` + `<span data-i18n>` sibling pairs, 29 rows. Opened only by the `F1` / `?` branch of the global `keydown` handler (the long line that starts `const keys = {}; addEventListener('keydown'`), closed by the same keys or `Escape`; `openPause` and `openCarSel` hide it.
- **While help is open every game key still works** (the handler only diverts for `$('jump')`, then `CARSEL`, then `pauseKey`). Typing "ton" into a field would therefore toggle the style (T), open the autopilot dialog (O) and fire nitro (N). The J dialog solves this with the first branch of that handler: `if (!$('jump').hidden) { jumpKey(e); return; }`.
- The J list's typing filter is `filterLandmarks(entries, query, gemeinde)` in `prototype/landmarks.js`: `foldText` (accent/case-insensitive) substring on `e.n`. #190 (command search) will want the same filter over the same key rows.
- Example from the issue: DE `keyMute` = "Ton aus" (`prototype/strings.js`); "ton" must keep that row.

## Design
1. `prototype/helpfilter.js`: `filterHelpRows(rows, query)` where a row is `{ keys, text }`; match = `foldText(keys + ' ' + text)` includes the folded, trimmed query; empty query returns all. Reuses `foldText` from `landmarks.js` (same rule as the J list).
2. Markup: an `<input id="helpq" type="search">` under the title (`data-i18n-placeholder="helpSearch"`, `data-i18n-aria`), plus a hidden `<div id="helpnone" data-i18n="helpNone">` line.
3. `openHelp()` / `closeHelp()` replace the inline toggle: open clears keys (like `openJump`), clears the query, shows all rows, focuses the field. `closeHelp` blurs and clears.
4. `helpKey(e)` as the first branch of the global `keydown` (before the jump check): `F1`, `Escape` close; `Tab` is swallowed (focus stays); everything else is left to the field (no `preventDefault`, no game handling). `?` is typed into the field, it does not close the help while open.
5. An `input` listener reads the rows' `kbd`/`span` text, hides non-matching pairs (`hidden` on both nodes, `.keys` grid keeps working) and shows `#helpnone` when nothing matches. A `gg-langchange` listener re-applies the filter (labels change language).

## Assumptions
- **A1** [med] Help autofocuses its field on open (type-to-filter), which makes the help modal for keys while it is open, like the J list. Rejected: leave focus out of the field and focus it with `/`; that keeps drive-while-reading but means typing "ton" first drives the car. Evidence: the keydown routing at the top of the global handler.
- **A2** [high] Filter matches key label and description. Rejected: description only; searching "J" or "F3" should find the key too.
- **A3** [high] New small module `helpfilter.js` for node testing, reusing `foldText`. Rejected: inline in `index.html`; not node-testable, and #190 needs the same filter.
- **A4** [high] Do not build #190 here; its command rows can later reuse `filterHelpRows`.

## [needs maintainer]
- Autofocus vs `/`-to-focus (A1). Default: autofocus, as the J list does.
