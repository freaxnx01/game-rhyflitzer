# Game: Umami stats for vehicle, mode and activity (#538)

## Goal

Make visible **whether and how visitors come and where they get stuck** in the main game (marketing, possible mention in the Neue Fricktaler Zeitung). Today only the region editor counts (`editor/analytics.js`, self-hosted Umami at `stats.freaxnx01.ch`, #197); the game sends nothing. The maintainer's addendum (2026-10-29) asks for detailed bookkeeping, at least: the **chosen vehicle** (at start, on every change, incl. `?vehicle=`) and the **game mode** plus switches between modes.

Privacy as in the editor: no cookies, no exact coordinates, Do-Not-Track respected, and the game never breaks when the script is blocked.

## Precedent (mirrored, not reinvented)

`editor/analytics.js` + the tag in `editor/index.html:57` (spec `2026-10-14-editor-umami-stats-design.md`): a deferred `g.js` tag, `data-auto-track="false"`, a wrapper whose calls never throw and do nothing without `window.umami`, and a `Datenschutz / Privacy` section in `README.md:65-69`. The game gets the same shape as a root ES module `analytics.js` (the game lives at the repo root since PR#589, live at `https://rhyflitzer.freaxnx01.ch`, `CNAME:1`). `editor/analytics.js` is left untouched.

## Design

### Script tag (`index.html`, next to the other classic scripts at the end of `<body>`)

```html
<script defer src="https://stats.freaxnx01.ch/g.js" data-website-id="35f395c0-a1ba-4706-ad56-7c95fcc0169f"
        data-domains="rhyflitzer.freaxnx01.ch,github.freaxnx01.ch" data-auto-track="false"
        data-exclude-search="true" data-exclude-hash="true" data-do-not-track="true"></script>
```

- Same website id and domain list as the editor tag (`editor/index.html:58`), so the host `rhyflitzer.freaxnx01.ch` is already in `data-domains`. Local and dev runs (`localhost`, the CI server) stay out of the stats.
- `data-auto-track="false"`: the game URL can carry `?world=<id>` (a share link maps to a person's world), `?region=`, `?vehicle=`, `?dev=`. One manual pageview sends the path only (plus a whitelist of campaign tags, see below). `data-exclude-search` is the belt to that braces.
- `data-do-not-track="true"`: browsers that send DNT are not counted.

### Script load order: events queue until Umami exists

The game is one deferred module (`index.html:592`); `g.js` is a deferred classic script placed after it, so `window.umami` does not exist yet when the module first runs. Moving `g.js` before the module would make a slow stats server delay the game (deferred scripts run in order). Instead `analytics.js` keeps a **small queue** (max 50 entries): events sent before `umami` exists wait; `settle()` (called on `window` `load`, or at once when the page is already `complete`) flushes them in order if `umami` is there and drops them if not (blocked or offline), and from then on a missing `umami` is a plain no-op. The pageview goes through the same queue.

### Module `analytics.js` (root, pure, node-testable; no DOM, no three.js)

- `createTracker({ getUmami, maxQueue })` returns `{ track, settle }`; the module exports a default instance as `track` / `settle`. `track(nameOrFn, data)` accepts Umami's callback form for the pageview. Every call is in try/catch.
- `pageUrl(location)`: `pathname` plus only `utm_source`, `utm_medium`, `utm_campaign` (each cut to 60 characters). A link from the newspaper such as `?utm_source=nfz` therefore shows up in Umami's campaign report; Umami itself records the **referrer** from `document.referrer` and device class and browser from the user agent, so no custom event is needed for "desktop vs. mobile" or "referrer".
- `pageviewProps(props)`: `{ ...props, url: pageUrl(location) }`.
- `createChangeReporter({ send, name, initial, settleMs = 2000, max = 200, shape })`: a **settle-and-dedup** reporter driven by the caller's clock (`update(value, nowMs)`, `flush()`), no timers. A value that holds for `settleMs` and differs from the last sent one is sent once as `send(name, shape(value, previous))`; a flicker back to the last sent value cancels the pending one; `max` bounds the events per page view.
- Pure shapers, the only payload shapes ever sent: `vehicleData`, `activityOf`, `activityData`, `modeData`, `modeEndData`, `jumpData`, `regionId`, `vehicleSource`, `roundSeconds`.

### Events

| Event | When | Data |
|---|---|---|
| (pageview) | once on load, path (+ utm tags) only | |
| `game-ready` | once, when the world is built and the loop starts (the start screen is up). Visits minus `game-ready` = people who left while loading | `region`, `lang`, `vehicle`, `vehicle_source` (`query` / `stored` / `default`), `mode` (the mode the start screen shows), `touch` (`yes`/`no`, coarse pointer) |
| `vehicle` | the chosen vehicle changed and **held for 2 s** (car select and the pause-menu swap both change `CHOICE.id`; browsing through the garage is not one event per car) | `vehicle`, `previous` |
| `mode-start` | `startRace(mode)` is called: the player starts (or restarts) a mode | `mode`, `previous` (the mode of the last start in this page view, `none` at first), `region`, `vehicle` |
| `mode-end` | a race ends (`finish`, `endHunt`, `timeUp`) or is abandoned to the main menu | `mode`, `outcome` (`finished` / `timeup` / `abandoned`), `seconds` (rounded to 5) |
| `activity` | how the player moves changed and held for 2 s: `car`, `foot`, `heli`, `train`, `hideout` (any level other than the surface), `building` (indoors in a house) | `activity`, `from`, and `place` (the house id) for `building` |
| `jump` | every J-jump / beam / navi arrival goes through `placeOnRoad(..., name)` | `target` (the label of the destination, cut to 60 characters) |
| `lang` | the player toggles DE/EN (`gg-langchange`) | `lang` |

**Mode tracking is generic over `MODES`** (`startscreen.js:4`). `mode` is whatever `startRace` receives; `modeData` accepts it when `MODES.includes(mode)` and records `unknown` otherwise. The new Cruising mode (#551) becomes the default and needs **no** analytics change as soon as it is in `MODES`. Its `mode-end` is always `abandoned` (no clock, no finish), which is correct.

**Activity is sampled, not hooked.** A single `setInterval` (1 s) in `index.html` reads `TRAIN.on`, `LEVELS.id`, `INT.indoors` / `INT.house`, `FOOT.on`, `FLY.on` and `CHOICE.id` and feeds the two reporters. The pause menu freezes the render loop (`index.html:4728`) but not the interval, so a vehicle swap made in the pause menu is seen too. No `getOut` / `takeOff` / `boardTrain` / `enter` function is edited, which keeps the diff small and conflict-free against the many open PRs that touch those one-line functions.

Why not an event per vehicle pick or per frame: the garage has 20+ cars and the player cycles with the arrow keys; a settle of 2 s records "looked at and stayed on" once.

### Data policy (all events)

Only ids of **public, fixed things** are sent: vehicle id, mode id, region id, house id, landmark label, language, times rounded to 5 s. Never sent: any x / z / LV95 / lat / lon, the query string (so no `?world=` id, no `?dev`), the **world id** (a generated world is reported as region `world`), typed text, the best time, localStorage content, a user id. No cookies and no localStorage written by the analytics.

### Privacy notice (de + en)

- `strings.js`: new key `aboutPrivacy` in `en` and `de` (same keys in both, `tests/strings.test.mjs` checks it), shown as a paragraph in the About dialog's "The game" tab (`index.html:504-507`) with a link to the README section (`ABOUT_LINKS.privacy` in `about.js`, wired like the other `data-link`s). The notice states: counted anonymously with Umami on a server in Germany, no cookies, no personal data, which things are counted, Do-Not-Track is respected, and that nothing changes when the script is blocked.
- `README.md` `## Datenschutz / Privacy` (de + en) is extended from "editor only" to "the game and the editor" and lists what the game counts.
- No consent banner: cookieless, no personal data stored, same basis as the editor and `game-tschau-sepp`.

German text uses real umlauts, `ss` for ß and capitalised Du/Dein where addressed.

## Tests

- Node `tests/analytics.test.mjs` (CI runs `node --test tests/*.test.mjs`, `.github/workflows/tests.yml:54`): tracker queue / settle / no-op / swallow throws; `pageUrl` drops everything but the three utm keys and truncates; the shapers (mode accepts a mode added to the list and maps others to `unknown`, `regionId` hides the world id, `roundSeconds`, `activityOf` precedence, `vehicleSource`); the change reporter (settle, dedup, flicker, `max`, `flush`).
- One Playwright file `tests/test_analytics.py`, `window.umami` stubbed by an init script (pattern: `tests/test_editor.py:78`), the real `g.js` route fulfilled with an empty script: the pageview URL has no query, `game-ready` fires once with the `?vehicle=` source, `mode-start` carries the mode, a car swap emits `vehicle`, no event contains the world id when `?world=` is open. Add `"analytics.js": ["test_analytics.py"]` to `tests/test-map.json`.

## Assumptions

- **A1** [med] Same Umami website id as the editor and the other games. Rejected: a separate "Rhyflitzer" website. `editor/index.html:58` already counts `rhyflitzer.freaxnx01.ch` under `35f395c0-...`; the dashboard filters by hostname and path (`/` vs `/editor/`). If the maintainer prefers a separate website, only the `data-website-id` attribute in two tags changes (see the manual Umami steps).
- **A2** [high] Manual pageview with path (+ utm tags), `data-auto-track="false"`. Rejected: leaving auto-track on. `?world=<id>` and `?vehicle=` are in the game URL and Umami hooks `pushState`/`replaceState`; the editor made the same call (`editor/analytics.js:20`).
- **A3** [high] Events queue until `umami` exists, then flush on `load`. Rejected: moving the tag before the module (a slow stats host would delay the game) and silently dropping early events (the pageview and `game-ready` would be lost on every normal load, because `index.html:592` runs before the deferred tag).
- **A4** [med] A change is an event only after it held for 2 s, max 200 `activity` and 200 `vehicle` events per page view. Rejected: an event per `selectVehicle` call (`index.html:4291`, cycling the garage floods Umami) and per frame. The 2 s and 200 are guesses.
- **A5** [med] "Game mode" = what `startRace(mode)` gets (`index.html:4182`: `trial`, `blitz`, `hunt`, later Cruising), reported as `mode-start` / `mode-end`; "free drive, on foot, helicopter, steam loco, hideout" from the addendum are **activities** inside a mode (`FOOT.on`, `FLY.on`, `TRAIN.on`, `LEVELS.id`), reported as `activity`. Rejected: one merged field, because on foot in a time trial is both at once.
- **A6** [med] The game URL is reduced to the path plus `utm_source` / `utm_medium` / `utm_campaign`. Rejected: path only (the newspaper link could not be told from other visits) and the full query.
- **A7** [med] `building` activity covers only the interior state `INT.indoors` (house `6c`, `index.html:1819`); the other enterables (`ENTER_HANDLERS`, `index.html:3334`) have no interior state yet and are not reported. Rejected: a hook per enterable.
- **A8** [med] `jump.target` is the destination label as shown to the player (`placeOnRoad` `name`, `index.html:3341`), so the same place appears under a DE and an EN label. Rejected: a language-neutral id (the jump list has none).
- **A9** [high] Do-Not-Track is honoured (tag attribute), device class and referrer come from Umami itself. Rejected: custom `device` / `referrer` event data.
- **A10** [med] The privacy notice goes into the About dialog and the README, not onto the start screen. Rejected: a banner (cookieless, no personal data, nothing to consent to).

## Consequences

- The game page loads one more external script (`stats.freaxnx01.ch/g.js`, about 2 KB, deferred); an ad blocker that blocks it changes nothing else.
- Early events (pageview, `game-ready`) wait in the queue until the `load` event; a visitor who closes the tab during loading is counted by neither (pageview is sent on `load`), so "left while loading" is only visible for those who got past `load` but not to `game-ready`.
- `jump.target` splits by UI language (A8).
- A `Datenschutz` mention now exists in the game, not only for the editor; the README claims ("no cookies, no IP stored") rely on the maintainer's Umami configuration and are the same ones the editor already makes.
- The 1 s sampler runs for the life of the page (a few property reads); it is not tied to the render loop.
- Cruising (#551) and any later mode appear in the stats by themselves once added to `MODES`.
