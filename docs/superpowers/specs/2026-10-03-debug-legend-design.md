# Debug panel labels and legend — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #74. The shape of the UI (a short label per line, a `?` button toggling a legend, DE + EN, touch-friendly) was decided by the user on 2026-10-03.

## Goal

The #39 debug panel (**F3** / `?debug`) shows raw values a tester cannot read, e.g. `bldg 222128103 · 2.5 m +3.2 dsm`. Every line of the panel gets a short translated label, and a `?` button in the panel opens a legend that explains each value.

Success: with debug on, every panel line has a visible label to its left (`car`, `Swiss`, `GPS`, `nearest` / `Auto`, `Schweiz`, `GPS`, `nächstes`). Tapping or clicking `?` shows the legend below the lines; tapping it again hides it. Neither the `?` button nor the legend copies the panel. Switching EN/DE changes labels and legend without a reload. The copied text is unchanged.

## Starting point (verified 2026-10-03 on `main` @ `13a4ef7`)

- `prototype/debug.js` (pure, no DOM): `positionLines(pos, y, bearing)` returns `x … z … y …  <deg>°`, then `LV95 <E> / <N>` (or `LV95 —`), then `WGS84 <lat>, <lon>` (`debug.js:37-41`). `buildingLines(label)` returns `bldg <id> · <text>` or `bldg —` (`debug.js:42`). `heightText(b)` builds `<h> m +<rh> <src>`, `src = b.hsrc || 'osm'` (`debug.js:29-32`). `copyText(lines)` joins with ` | ` (`debug.js:43`).
- `prototype/index.html`:
  - CSS `#debug` at `:34-36`: `position:fixed`, `white-space:pre`, `pointer-events:auto`, `cursor:copy`; top left under `@media (pointer:coarse)`.
  - Markup `<div id="debug" hidden title="Click to copy"></div>` (`:157`).
  - `DEBUG` registry, `debugSection(fn)`, `debugLayer(layer)` (`:1108-1111`); `debugTick()` writes `$('debug').textContent = DEBUG.lines.join('\n')` every 250 ms (`:1113`); a click anywhere on `#debug` runs `copyDebug` (`:1114-1115`); sections for position and building (`:1126-1127`); test hook `window.__mm.debug()` (`:1128`).
  - `tr()` and `applyStaticStrings()` (`:211-220`) handle `data-i18n` (innerHTML), `data-i18n-aria`, `data-i18n-placeholder`; `rerenderAll()` runs it again on `gg-langchange` (`:1075-1076`).
  - `keydown` (`:915`): `?` (and F1) already toggles the F1 help. No new key here.
- Heights, from the pipeline: a measured height is swissSURFACE3D (swisstopo's digital surface model, DSM) minus swissALTI3D (the terrain model) (`pipeline/building_heights.py:1`). `MIN_H = 2.5` clips the eaves of a **DSM-measured** building (`pipeline/building_heights.py:22`, `:97`); `hsrc = "dsm"` is set only there (`:99`). Otherwise the height comes from OSM: `height` tag, `building:levels`, or a per-type default (`pipeline/world_buildings.py:25-35`); `hsrc` is absent and the panel shows `osm`. In `data/world_hochrhein.json`: 1693 `dsm`, 199 without `hsrc`; OSM heights go as low as 1.6 m, so "2.5 m is the minimum" holds for `dsm` only.
- The panel's building line is the label **nearest** the car (`DEBUG_H.shown[0]`, sorted by distance by `pickLabels`), not strictly the one in front (`index.html:1123`, `:1127`; the #70 spec keeps this).
- Verified in Chromium (Playwright probe, 2026-10-03): `innerText` does **not** include CSS `::before` generated content, and hidden children are excluded. So labels drawn with `::before { content: attr(data-label) }` leave `page.inner_text("#debug")` starting with `x `.
- Tests: `prototype/tests/debug.test.mjs` (node:test), `prototype/tests/test_debug.py` (Playwright), `prototype/tests/strings.test.mjs` (en/de key parity, no `ß`).

## Related work

- **#63 map links** (spec `2026-10-03-map-links-design.md`, not merged): splits `#debug` into `<div id="debugtext">` + `<div id="debuglinks">` and makes `debugTick` write `#debugtext`; adds `data-i18n-title` to `applyStaticStrings`; changes `keyDebug`. This design uses the **same** `#debugtext` element. Whichever lands second keeps one `#debugtext`; `#debuglinks` sits between `#debugtext` and the `?` button. This issue does not touch `keyDebug` and does not need `data-i18n-title`.
- **#70 height-label clamp** (spec `2026-10-03-debug-label-clamp-design.md`, not merged): moves the 3D height sprites, not the panel. No functional overlap. Both append to `debug.js`, `debug.test.mjs`, `test_debug.py` and add fields to the `__mm.debug()` hook line — a textual merge, nothing more. The legend's wording ("the same text floats above each roof") stays true with the clamp.

## Decisions

| Topic | Decision |
|---|---|
| Line labels | Presentation only. Each line is rendered as `<div data-label="<label>">value</div>` inside `#debugtext`; CSS draws the label with `::before{content:attr(data-label)}` in a fixed-width, dimmer column. `DEBUG.lines`, `copyText` and the copied text are unchanged (language-neutral bug reports). |
| Which label | Pure `lineLabelKey(line)` in `debug.js` maps the line's prefix to a string key: `x ` → `dbgLabCar`, `LV95` → `dbgLabLv95`, `WGS84` → `dbgLabWgs84`, `bldg` → `dbgLabBldg`; anything else → `null` (empty label). Sections keep returning plain strings; the `debugSection` API is unchanged. |
| Label texts | en: `car`, `Swiss`, `GPS`, `nearest`. de: `Auto`, `Schweiz`, `GPS`, `nächstes`. |
| `?` button | `<button id="debughelp" type="button" aria-expanded="false" aria-controls="debuglegend" data-i18n-aria="dbgLegendBtn">?</button>` absolutely placed in the panel's top-right corner; 22 px, 36 px under `pointer:coarse`. Click/tap toggles `#debuglegend`, updates `aria-expanded`, calls `stopPropagation()` (no copy) and `blur()` (Enter is the horn). No hover tooltip, no keyboard shortcut. |
| Legend | `<div id="debuglegend" hidden data-i18n="dbgLegend">` inside `#debug`, after `#debugtext` (and after `#debuglinks` if #63 is in). Content is one translated HTML string (`<b>`/`<br>`), rendered by `applyStaticStrings`, so language changes apply via `rerenderAll`. `white-space:normal`, `max-width:min(380px, calc(100vw - 72px))`, `cursor:auto`. Clicks inside it `stopPropagation()`. |
| Legend content | car: x east, z south (metres, game frame), y height in metres, heading in degrees (0 = north, clockwise). Swiss: LV95 E / N in metres (EPSG:2056). GPS: WGS84 latitude, longitude in degrees. nearest: `bldg <OSM id> · <h> m +<rh> <src>` — the building nearest the car: `h` wall height up to the eaves, `+rh` roof height on top (only when measured), `src` = `dsm` = height measured from swisstopo’s digital surface model (swissSURFACE3D) minus the terrain model (de: „digitales Oberflächenmodell (DSM)“), `osm` = OpenStreetMap height tag, levels or a default for the building type; 2.5 m is the lowest wall height a measured (`dsm`) building gets. The same text floats above each roof within 60 m. Last line: click the panel to copy all lines. |
| Legend state | Not persisted; kept in the DOM (`hidden`). Survives F3 off/on within the session. |
| Test hook | `__mm.debug()` gains `labels` (the `data-label` of each `#debugtext` line, in order) and `legend` (`true` when the legend is shown). |
| Strings | New keys in `prototype/strings.js`, en and de: `dbgLabCar`, `dbgLabLv95`, `dbgLabWgs84`, `dbgLabBldg`, `dbgLegendBtn`, `dbgLegend`. Swiss spelling, no `ß`. |

## Acceptance criteria

- With debug on (hand layout and world layout), every line in `#debugtext` has a non-empty label, and `__mm.debug().labels` has one entry per line in `__mm.debug().lines`.
- `page.inner_text("#debug")` still starts with `x `; the copied text is unchanged (existing `test_debug.py` and `debug.test.mjs` tests stay green unchanged).
- A click on `?` shows the legend, a second click hides it; `aria-expanded` follows; the panel is **not** copied by either click or by a click inside the legend; the button is not focused afterwards.
- A **tap** on `?` in a touch context (`has_touch`) shows the legend.
- The legend (en) mentions eaves, roof, `dsm` as "digital surface model" (swissSURFACE3D) minus the terrain model, `osm`, `2.5 m`, east/south, heading, `LV95`, `WGS84`; the de legend says the same in German (Traufe, Dach, „digitales Oberflächenmodell (DSM)“, Geländemodell, Norden …).
- After `ggSetLang('de')` the labels read `Auto`/`Schweiz`/…, the legend is German and the button's `aria-label` is German — without reload.
- `lineLabelKey` maps the four prefixes and returns `null` for anything else (node test).

## Out of scope

- The panel's `title="Click to copy"` (untranslated hover text) — the legend's last line covers touch users.
- Changing the value formats or the copy format.
- The F1 `keyDebug` line (left to #63, which already edits it).
- A keyboard shortcut for the legend (`?` already opens F1 help).

## Assumptions (quick mode)

- **A0** [high] `[confirmed]` Short label per line, `?` toggles a legend, everything via `tr()` in DE and EN, no hover-only tooltips — the user's decision of 2026-10-03.
- **A7** [high] `[confirmed]` `dsm` is explained as the **digital surface model (DSM)**: "height measured from swisstopo’s digital surface model (swissSURFACE3D) minus the terrain model"; de "digitales Oberflächenmodell (DSM)" — the user's wording of 2026-10-03. Matches `pipeline/building_heights.py:1` (swissSURFACE3D minus swissALTI3D).
- **A1** [med] Labels are drawn with CSS `::before` from `data-label`, not part of the line text. Rejected: prefixing the line strings — it makes the copied bug-report text language-dependent and changes the formats that `test_debug.py` pins (`text.startswith("x ")`, `"LV95 —"`, `f"bldg {id} · {t}"`). Probe 2026-10-03: `innerText` ignores `::before`.
- **A2** [med] Label words `car` / `Swiss` / `GPS` / `nearest` (de `Auto` / `Schweiz` / `GPS` / `nächstes`). Rejected: repeating `LV95`/`WGS84` (already in the value) and `building` (the value already says `bldg`). `nearest` matches what the line really is (`index.html:1123`, `:1127`).
- **A3** [med] Labels chosen by line prefix in a pure `lineLabelKey`. Rejected: changing `debugSection` to return `{ label, text }` — touches #63's and #70's code paths for no user-visible gain.
- **A4** [high] The `?` button and the legend live inside `#debug` and stop click propagation. Rejected: a separate element outside the panel (two positions to maintain for desktop and `pointer:coarse`).
- **A5** [high] Legend text states 2.5 m as the minimum for measured (`dsm`) walls only. Rejected: the issue's wording "2.5 m is the minimum wall height" for all buildings — OSM-derived heights go down to 1.6 m (`data/world_hochrhein.json`, `pipeline/world_buildings.py:25-35`).
- **A6** [high] Legend state not persisted. Debug mode itself is not persisted (#39).

## Consequences

- The panel gets ~9 characters wider (label column) and 36 px of right padding for the button; on phones it still sits top left.
- `debugTick` now builds up to 4 `<div>`s every 250 ms instead of setting one text node — negligible.
- With the legend open, the panel covers more of the top-left (touch) or bottom-left (desktop) screen; the tester closes it with `?` or F3.
- Screen readers read the `::before` labels; `innerText`-based tools (and the existing tests) do not see them.

## Testing

- Node (`debug.test.mjs`, appended): `lineLabelKey` for each prefix, `LV95 —`, `bldg —`, and unknown/empty → `null`; the en and de `dbgLegend` strings contain the required terms (`translate` from `strings.js`).
- Playwright (`test_debug.py`, appended): labels on every line + `inner_text` unchanged (hand layout); with the world file, four lines, four labels; `?` click toggles the legend without copying and without keeping focus; tap in a `has_touch` page; `ggSetLang('de')` switches labels, legend and `aria-label`.
- Manual (`test-todo.md`): phone, `?debug`, tap `?` — legend readable, does not cover the steering buttons; tap the panel text still copies.
