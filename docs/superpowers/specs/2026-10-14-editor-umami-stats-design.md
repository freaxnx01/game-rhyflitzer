# Region editor: Umami stats with coarse geo (#197)

## Goal

Make visible **where players build their worlds**: which Gemeinden are framed and built in the region editor (`editor/`), using the self-hosted Umami at `stats.freaxnx01.ch` (same website id as `game-tschau-sepp`, shared by all `github.freaxnx01.ch` games). Privacy first: cookieless, no precise location, no user text, silent no-op when blocked.

## Precedent (mirrored, not reinvented)

`game-tschau-sepp` (tschau-sepp#44, commit 6b978e0): a deferred `g.js` tag with `data-website-id` + `data-domains="github.freaxnx01.ch"`, a tiny `analytics.js` wrapper whose calls never throw and do nothing when `window.umami` is missing, and a Datenschutz/Privacy README section. This spec does the same for the editor, as an ES module in keeping with `editor/*.js`.

## Design

### Script tag (`editor/index.html`)

```html
<script defer src="https://stats.freaxnx01.ch/g.js" data-website-id="35f395c0-a1ba-4706-ad56-7c95fcc0169f"
        data-domains="github.freaxnx01.ch" data-auto-track="false" data-do-not-track="true"></script>
```

- `data-auto-track="false"`: the editor rewrites its URL to `?bbox=<exact LV95 frame>` on every commit (`editor/editor.js` `commit()`, `history.replaceState`). Umami's auto-tracking hooks `pushState`/`replaceState` and records the URL **with its query string**, which would leak the exact frame (1 m precision) on every drag. So the page sends **one** manual pageview with the path only.
- `data-do-not-track="true"`: browsers that send DNT are not counted.
- `data-domains`: local and dev runs stay out of the stats.

### Module `editor/analytics.js` (pure, node-testable)

- `track(name, data)`: calls `globalThis.umami.track` inside try/catch; no-op if missing.
- `trackPageview()`: `umami.track((props) => ({ ...props, url: location.pathname }))` (query and hash dropped).
- `frameData(rect, gemeinden)`: the only payload shape ever sent.
- `createPreviewReporter({ send, delayMs, max, setTimer, clearTimer })`: debounce + dedup for the preview event.

### Data fields (all events)

| Field | Value | Why coarse enough |
|---|---|---|
| `gemeinden` | up to 4 Gemeinde names from `/api/preview` `gemeinden` (fallback: the identify name), joined `, `, max 200 chars | Public administrative names, the point of the feature |
| `lat`, `lon` | frame centre in WGS84 rounded to 0.05 degrees (about 4 x 5.5 km cell) | Mappable, but never the frame itself |
| `w_km`, `h_km` | frame size (already a multiple of 0.25 km, 1 to 4) | Not identifying |

Never sent: `bbox` / LV95 values, the world id (a share link would map it to a person), the Altcha solution, IP, any typed text (the editor has none), the job id.

### Events

| Event | When | Extra fields |
|---|---|---|
| (pageview) | once on load, path only | |
| `editor-frame` | the frame was **settled for 3 s**, is inside Switzerland and the preview answered. Once per distinct `gemeinden` set per page view, at most 10 per page view | |
| `editor-build-start` | the build service accepted the POST (not on button press: refused attempts are not starts) | `cached` (true when the world already existed) |
| `editor-build-done` | the job reached done | `seconds` (rounded to 5), `race` (`yes`/`no`/`unknown`) |
| `editor-build-failed` | any failure shown to the player | `reason` (the page's own error key, e.g. `errTooComplex`, `errRateLimit`) |

Why not an event per preview: every drag ends in a preview request after 400 ms; sending those would flood Umami and measure dragging, not intent. The 3 s settle plus per-Gemeinde dedup records "looked at this area" once.

### Privacy notice

The main game (`prototype/`, root `index.html`) has no analytics and no privacy notice (a grep for umami/datenschutz finds only the editor's ALTCHA note and the CHANGELOG), so this adds the first one, scoped to the editor:

- A short text under the licence line in the editor panel (de + en, `privacy` key) and a link `privacyLink` to the README anchor.
- A `## Datenschutz / Privacy` section in `README.md` (de + en, same facts as the tschau-sepp one: Umami, self-hosted in Germany, no cookies, no IP stored, blocked script changes nothing, plus what the editor counts).

German text uses real umlauts, `ss` for ß, and capitalised Du/Dein where addressed.

## Tests

- Node (`prototype/tests/editor-analytics.test.mjs`): payload shape and rounding, truncation, never contains LV95, `track` is a no-op without `umami` and swallows throws, the reporter's settle/dedup/cap with injected timers; `parsePreview` keeps `gemeinden`.
- One Playwright file (`prototype/tests/test_editor.py`), `window.umami` stubbed by an init script, the real `g.js` route fulfilled with an empty script (the tests never reach the real Umami): pageview URL has no query; settle event once; build start/done/failed fields; no event contains the bbox digits; privacy text in en and de.

## Assumptions

- **A1** [high] Same Umami website id as the other games. Rejected: a separate website. The task and tschau-sepp share `35f395c0-...`; `data-domains` already scopes it to `github.freaxnx01.ch`.
- **A2** [high] Manual pageview, `data-auto-track="false"`. Rejected: leaving auto-track on and relying on `data-exclude-search`. `editor/editor.js` `commit()` rewrites the URL to `?bbox=` per commit and Umami hooks `replaceState`; manual is the only variant that provably cannot leak it.
- **A3** [med] Umami v2 callback form `umami.track((props) => ({ ...props, url }))` is supported by the deployed `g.js` (Umami's documented v2 API; tschau-sepp uses v2 `track(name, data)`). If not, the pageview is skipped and only events flow; the module swallows the error either way.
- **A4** [med] Geo = Gemeinde names + frame centre rounded to 0.05 degrees. Rejected: exact centre (too fine), Gemeinde only (not mappable), canton (the preview does not return it, `editor/api.js` `parsePreview`). Umami also derives country/region from the IP itself, which the README says.
- **A5** [med] `editor-frame` is reported after a 3 s settle, once per Gemeinde set, max 10 per page view. Rejected: per preview (flood), build events only (loses explored-but-not-built areas). The numbers 3 s and 10 are guesses.
- **A6** [med] `editor-build-start` fires on an accepted POST, and `reason` is the editor's error key. Rejected: firing on button press (counts refusals and human-check failures as starts).
- **A7** [med] Honour Do-Not-Track. Rejected: ignoring it like tschau-sepp; a few visitors are lost, the cost is nil.
- **A8** [low] Privacy text on the editor page and in the README (not a separate privacy page). **Flag:** loading a script from `stats.freaxnx01.ch` on a public page is a privacy decision. The claims "no cookies, no IP address stored" mirror tschau-sepp's README and rely on Umami's documented behaviour; the owner should confirm them for this instance before dispatch.
- **A9** [high] The main game and the shared hub are out of scope (no analytics added there; `?world=` plays are not counted).

## Consequences

- Every editor visit loads one script from `stats.freaxnx01.ch` (blocked or down: nothing changes). The CHANGELOG says so.
- Umami's event-data view lists `gemeinden` as text values; its top-N list is the "where do players build" answer. Plotting on a map needs a separate step (lat/lon are numbers in the data).
- `parsePreview` gains a `gemeinden` field; its deepEqual assertions in `editor-api.test.mjs` change.
- The Playwright `open_page` helper routes `stats.freaxnx01.ch` and stubs `window.umami` for every editor test.
