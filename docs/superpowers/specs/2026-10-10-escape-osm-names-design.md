# Escape OSM names before innerHTML (#176)

Quick-mode enrich. Sinks verified against `origin/main` (5f94846, 2026-10-10).

## Problem

World files carry third-party OSM text (landmark, street, Gemeinde, water names). Several render paths
interpolate it into `innerHTML`. A name such as `<img src=x onerror="window.__xss=1">` runs script. Low today
(we build the worlds), real once the region editor / world upload (#166 to #169, #167) lets any file in. The
origin's `localStorage` is shared by every `game-*` repo.

## Sink audit (`prototype/index.html`, current lines)

| Line | Sink | Data | Verdict |
|---|---|---|---|
| 355 | `el.innerHTML = tr(el.dataset.i18n)` | static keys, no args | trusted, keep (strings carry markup on purpose, `strings.js:4`) |
| 1686 | `toast(html)` `innerHTML` | caller-dependent | split, see below |
| 1461 | `placeOnRoad` `toast(name)` | landmark / street name | **untrusted** |
| 1479 | `stopAuto` `toast(tr(AUTO_TOASTS[why], AUTOP.dest.n))` | destination name | **untrusted** |
| 1503, 1510 | `toast(tr('naviOn' / 'naviArrived', dest.n))` | destination name | **untrusted** |
| 1913 | `toast(tr('regionMissing', REGION_FALLBACK))` | `REGION.name`, own constant (`?region=` is whitelisted by `regionFromQuery`) | trusted |
| other `toast(tr(key))` | own strings, `camera` arg is `tr(nameKey)` | trusted |
| 1626/1628/1700 | `fishes`, `underwaterHint`, `presentToast` (has `<br>` + span, own `surpriseLine`) | own markup | trusted, needs the HTML variant |
| 1712 `resultHtml` | own strings, numbers via `fmt`, `notes()` / `penalties()` own strings | trusted |
| 1890 | `$('time').innerHTML = fmt(...)` | numbers | trusted |
| 1728 | car-select stat bars | own strings, numbers | trusted |
| 1729 | paint swatches (attributes `aria-label`, `title`, `data-paint`, `style`) | `PAINTS` constants | trusted (escape attributes anyway, same helper) |
| 1730 | garage tiles (`data-id`, `aria-label`, `title`) | vehicle ids, `vehicleText` falls back to the raw id; reachable from `__mm.registerVehicle` and future glTF vehicles | **untrusted** |
| 1769 | J/O list `<li>${r.n}<span>${r.g}</span>` and `tr('streetIn', r.g)` | landmark / street / Gemeinde names | **untrusted** |
| 1770 | chips `data-g="${g}"` and text | Gemeinde / place names | **untrusted** (attribute and text) |

No `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval`, `new Function` anywhere in `prototype/`.
Everything else that shows names (`roadname`, `watername`, `autoline`, labels) already uses `textContent`.
The issue's line numbers (~1514 etc.) are stale; the table above is current.

## Design

1. **`prototype/escape.js`**: pure module `export function esc(value)`: `String(value ?? '')` with `& < > " '`
   replaced by `&amp; &lt; &gt; &quot; &#39;`. Safe for text and quoted attribute values. `& ` first so no double escaping.
2. **J list and chips**: wrap `r.n`, `r.g`, `g` in `esc()`. `tr('streetIn', r.g)` returns own text around `r.g`:
   escape the *argument* (`tr('streetIn', esc(r.g))`), never the result, so any markup in the template survives.
   `data-g` / `data-id` round-trip through the browser's attribute decoding, so reading `dataset.g` still yields the raw name.
3. **Garage tiles**: `esc()` on `id` and the `vehicleText` results in all three attributes. Swatches: `esc()` on
   `p.id`, `tr(p.nameKey)` for uniformity (cheap, no behaviour change).
4. **Toasts**: `toast(text, secs)` becomes the default and sets `textContent`; new `toastHtml(html, secs)` keeps
   `innerHTML` for our own markup. Only calls whose string contains markup move to `toastHtml`: determine them by
   checking which `strings.js` values used with `toast` contain `<` (known: `presentToast`; verify `fishes`,
   `underwaterHint`, any other). Data-carrying toasts (`placeOnRoad`, `naviOn`, `naviArrived`, `AUTO_TOASTS` with
   `dest.n`) stay on `toast` and become safe by construction. Rationale: a text default makes the *forgotten* call safe.
5. **Left alone on purpose**: `applyStaticStrings` (356), result screen, `time`, stat bars. Trusted; adding
   `esc()` would double-escape markup in `strings.js`.

## Assumptions

- **A1** [high] One `esc()` helper in a new `prototype/escape.js`, imported by `index.html` as a module import like the others.
  Rejected: escaping inside `translate()`. `strings.js` values mix own markup (`<br>`, `small()` spans) with data arguments,
  so a blanket escape of the result would break `presentToast`; escaping data at the call site keeps the templates intact.
  Evidence: `strings.js:4`, `strings.js:83`.
- **A2** [high] Escape at the interpolation (`esc()`), not rebuild with DOM nodes.
  Rejected: DOM-node rewrite of the list renderers. More lines for the same result, and `renderJump` / `renderCarSel`
  re-render whole lists with `innerHTML` and re-find focus by data attribute (`index.html:1731`), which a rewrite would disturb.
- **A3** [med] `toast()` defaults to text, `toastHtml()` is the explicit own-markup variant (the issue's wording).
  Rejected: keep `toast(html)` and escape at each data call site: one forgotten site is a hole.
- **A4** [high] Trusted sinks (355, 1712, 1728, 1890) stay unescaped. Evidence: inputs are `strings.js` constants and numbers only
  (`index.html:1708-1710`, `1728`).
- **A5** [med] Playwright poisons the world by fetching `data/world_hochrhein.json`, renaming a landmark, a street, a Gemeinde and
  a water body in a copy, and serving it through `page.route`, as `test_boundaries.py:25` does. Skipped when the file is absent
  (`needs_world`). Rejected: a hand-built minimal world, which would need every required world field.
- **A6** [high] No one-way door: no data, credential, cost or public-interface change (`toast` is internal, `window.__mm` unchanged).

## Consequences

- A name that legitimately contains `&`, `<` or `"` now shows literally instead of as markup. Intended. Real OSM names with `&` render correctly (before they got lucky with the HTML parser).
- Search/filter (`filterLandmarks`) works on raw names, unchanged.
- Any future `toast` call that needs bold or a line break must use `toastHtml`.
- `index.html` gains one import line.

## Acceptance criteria

- `esc()` escapes `& < > " '`, passes numbers, `null`, `undefined`; node-tested.
- Poisoned names do not set `window.__xss` in the J list, O/I list, chips, toasts, result screen and car-select garage; the payload appears as visible text in the list and toast.
- `presentToast` still renders its `<br>` and span (no regression test_hunt).
- Names with `&` display correctly in the list and chips, and a chip click still filters.
- CHANGELOG `[Unreleased]` / Fixed line.
