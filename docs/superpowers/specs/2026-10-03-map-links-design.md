# Map links from the car's position (OSM, Google Maps, Street View) — design

Status: approved in headless `/enrich` (quick mode, no human gate) 2026-10-03 · Issue #63

## Goal

The issue asks to open OpenStreetMap, Google Maps or Google Street View at the car's current position, each in a new browser tab. The issue points at #39: its debug mode already converts the car's position to WGS84 (lat/lon), and the URLs can be built from that.

Success: with the debug panel on (**F3** or `?debug`), the panel shows a row of three buttons, `OSM · Maps · Street View`. Clicking one opens that service in a new tab, centred on the car. Street View looks the way the car is pointing. Clicking a button does not copy the panel. Without a world origin (hand-traced layout) the row is hidden.

## Starting point (verified 2026-10-03 on `main` @ `6dd7131`)

- #39 (debug mode) and #9 (i18n) are both merged.
- `prototype/debug.js` is the pure module of #39. It has `gameToLv95`, `lv95ToWgs84`, `debugPosition(origin, x, z)` → `{ x, z, E, N, lat, lon }` (all four `null` without an origin), `positionLines`, `copyText` (`debug.js:11-26`). Unit tests: `prototype/tests/debug.test.mjs`.
- The panel is `<div id="debug" hidden title="Click to copy">` (`index.html:156`), CSS at `index.html:34-36` (`white-space:pre`, `pointer-events:auto`, `cursor:copy`, top left on touch screens).
- `debugTick()` writes `$('debug').textContent = DEBUG.lines.join('\n')` every 250 ms (`index.html:1082`). Writing `textContent` replaces every child, so anything else put into `#debug` would be wiped on the next tick.
- A click anywhere on `#debug` runs `copyDebug` (`index.html:1083-1084`).
- `bearing()` is the compass bearing in degrees, 0 = north, clockwise, in `[0, 360)` (`index.html:1072`). The panel's position line already shows it.
- `window.__mm.debug()` is the test hook (`index.html:1097`).
- Strings go through `tr()` from `prototype/strings.js` (`index.html:205-219`). `applyStaticStrings` handles `data-i18n`, `data-i18n-aria` and `data-i18n-placeholder`, not `title`.
- Keys: the `keydown` listener (`index.html:889`) uses T, C, R, H, Enter, M, F1, `?`, Esc, F3, Tab, V, G, K, Q, E, `+`, `=`, `-`, J; driving uses W A S D, arrows, Space, Ctrl, N. B is claimed by #24/#65. Enter (horn) is not `preventDefault()`'d, so a focused button would be clicked again by Enter.

## Decisions

| Topic | Decision |
|---|---|
| Where | A link row inside the #39 debug panel, below the text lines. Not a HUD element of its own, not a new debug section (sections are text lines). |
| Key | None. The links are mouse/touch targets in the panel. |
| Element split | `#debug` gets two children: `<div id="debugtext">` (what `debugTick` writes) and `<div id="debuglinks" hidden>` with three `<button type="button" data-map="osm|maps|street">`. |
| Labels | `OSM`, `Maps`, `Street View` — service names, not translated. Each button has a translated `title` via a new `data-i18n-title` attribute (one line added to `applyStaticStrings`). |
| Opening | `window.open(url, '_blank', 'noopener')`, with the URL computed **at click time** from `debugPosition(L.origin, P.x, P.z)` and `bearing()` — not from the 250 ms panel snapshot. |
| Copy | The row's click handler calls `e.stopPropagation()`, so no click in the row copies the panel. |
| Focus | The button is `blur()`ed after the click, so Enter (horn) or Space cannot re-trigger it. |
| No origin | The row stays hidden when `L && L.origin` is falsy. `mapUrls` returns `null` then, and the click does nothing. |
| URLs | Documented, key-free forms, 6 decimals (≈ 0.1 m), zoom 18: |
| | OSM: `https://www.openstreetmap.org/?mlat=<lat>&mlon=<lon>#map=18/<lat>/<lon>` |
| | Maps: `https://www.google.com/maps/@?api=1&map_action=map&center=<lat>,<lon>&zoom=18` |
| | Street View: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=<lat>,<lon>&heading=<h>&pitch=0&fov=90`, `h` = `Math.round(bearing)` folded into `0..359` |
| Pure helpers | In `prototype/debug.js`: `osmUrl(lat, lon)`, `googleMapsUrl(lat, lon)`, `streetViewUrl(lat, lon, heading)`, `mapUrls(pos, heading)` → `{ osm, maps, street }` or `null`. Unit-tested with `node --test`. |
| Test hook | `__mm.debug()` gains `links: mapUrls(pos, bearing())`. |
| Help | The F1 `keyDebug` line (en/de) mentions the map links. |

## Assumptions

- **A1** [med] Lives in the #39 debug panel and depends on #39 (merged). Rejected: an always-visible HUD button. The issue's own context is #39's WGS84 conversion, and the panel is the tester's tool for "where am I" (`index.html:1077-1098`).
- **A2** [med] No keyboard shortcut. Rejected: a key per service (three more keys in a crowded map, `index.html:889`) or one key cycling a chooser. A new tab needs a user gesture anyway, and the panel is already a click target.
- **A3** [med] Zoom 18 for OSM and Google Maps. Rejected: 17 or 19. 18 shows a street with its house numbers, which matches the debug panel's scale (labels within 60 m).
- **A4** [high] Street View heading = the compass bearing the panel shows (`bearing()`, `index.html:1072`), pitch 0, fov 90. Rejected: the camera's view direction, which differs only in the free camera views and would surprise when the panel says something else.
- **A5** [high] `window.open(url, '_blank', 'noopener')` with buttons, as asked. Rejected: `<a target="_blank">` with a refreshed `href` — it would carry a position up to 250 ms old.
- **A6** [high] Strings via `tr()` (#9 is merged). Service names stay untranslated; titles and the help line are translated.

## Consequences

- Clicking a button moves focus to the new tab, so the game window gets `blur` and the existing handler releases all held keys (`index.html:889`). The car coasts, as it does on any tab switch.
- Street View has no panorama for every road. Google then shows the nearest panorama within its own search radius, or none — in the German part (Bad Säckingen) coverage is thinner than on the Swiss side.
- `#debug`'s text now lives in `#debugtext`. `page.inner_text("#debug")` still starts with `x ` (existing `test_debug.py` stays unchanged), and the copy text is unchanged.
- Off-road positions (in the Rhine, in a field) open fine in OSM/Maps; Street View falls back as above.

## Out of scope

- map.geo.admin.ch / swisstopo links (LV95). Easy to add later as a fourth button with the same helper pattern.
- Links in the copied text.
- A link outside debug mode.

## Testing

- Node (`prototype/tests/debug.test.mjs`): exact URL strings for each helper, 6-decimal rounding, heading folding (`359.6 → 0`, `-0.4 → 0`, `90.5 → 91`), `mapUrls` → `null` without lat/lon.
- Playwright (`prototype/tests/test_debug.py`, appended):
  - with the world file and `?debug`: `window.open` stubbed; a click on each button records `[url, '_blank', 'noopener']`, the URL equals `__mm.debug().links[kind]`, the Street View URL has `heading=<round(bearing)>`, and the panel was not copied;
  - hand layout (`block_world`): `#debuglinks` is hidden.
- Manual (test-todo): the three tabs open at the car's spot in a real browser.
