# Installable app: manifest, icons, fullscreen, reload control (#1076)

Status: enriched 2026-11-18 (quick mode). Decided by the maintainer the same day: installable, `display: fullscreen`,
**no offline caching and no service worker** (the world data is far too large to cache).

## Goal

On Android/Chrome, rhyflitzer.ch currently offers only "Verknüpfung anlegen" (a shortcut), because the site has no web
app manifest: `index.html:4` links a 32×32 `favicon.png` and nothing else. After this change Chrome offers
**"App installieren"**, the home-screen icon is the Rhyflitzer "R", the app starts fullscreen without a browser bar,
has its own entry in the app switcher, and iOS "Zum Home-Bildschirm" gets a proper `apple-touch-icon`.

Because the fullscreen app has no browser bar, it also needs a **way to reload the page** (precedent:
game-barrel-shooter #46, which added a `⟳` reload button to its `#game-nav` and a `.hint-reload` button in the touch
help with the comment "the fullscreen home-screen app has no browser bar to reload from").

**Success criterion:** `manifest.webmanifest` is linked from `index.html`, parses, and lists icons that exist with the
declared pixel sizes; Chrome DevTools → Application → Manifest shows no error and the install option appears on an
Android phone; inside the installed app a **Reload** button is visible on the start screen and in the pause menu, and
tapping it reloads the page; on the ordinary website nothing changes visibly; `node --test` and the targeted Playwright
tests pass; the page loads with an empty console.

## Out of scope

- Offline play, a caching service worker, `beforeinstallprompt` handling, an in-game "Install" button, push, badges.
- Changing `editor.html` (it is reachable from the app via the Worlds dialog but is not part of the app's own flow).
- Screenshots / `description` in the manifest (nice for the richer install sheet, not needed for installability).
- A second version source: the manifest carries no version.
- Hub card or screenshot changes in `freaxnx01.github.io`.

## Today (evidence)

- `index.html:4` favicon only; `:5` title "Rhyflitzer – Map Madness"; `:6` Google Fonts Bungee + Barlow Condensed.
- `index.html:8` `--charcoal:#1c1f26`, `--sun:#ffc61a`, `--signal:#ff7a1a`, `--burnt:#c24a00`; `:9` body background
  charcoal; `:159` `#overlay` gradient purple → orange over it; `:181` `.start h1` Bungee, sun, skew −9°, stacked
  shadow signal/burnt/#6b2400/charcoal.
- `index.html:8397-8410` `#game-nav` (version badge, links, fullscreen toggle at `:8440-8456`); `:8379-8381` on
  phones (≤ 600 px) the nav is hidden whenever the start screen, a dialog or the pause menu is open, and while driving
  it is hidden at every width (#776). So the nav is **not** a usable home for a phone reload button.
- `index.html:634-640` the start screen's `.row.secondary` (Worlds, Style, About, Settings, Music) is visible at every
  width; `tests/test_start_screen.py:11,35,46` asserts its exact button order.
- `index.html:908-925` the pause menu; `:923` `#pausetutorial` is a button that lives **outside** `PAUSE_BUTTONS`
  (`pause.js:5`) and is shown/hidden on its own (`index.html:7389-7391`, `PAUSE_ALL`); `:7404` button wiring.
- `strings.js:472-474` / `:1279-1281` en/de `aboutBtn`, `settingsBtn`; `data-i18n` attributes are applied by the
  page's own i18n pass (`index.html:464` etc.).
- Tests: `node --test tests/*.test.mjs` (`.github/workflows/tests.yml:56`); Playwright via `pytest`, `server`
  fixture in `tests/conftest.py:100`, `start_ready()` at `:26`; boot pattern `tests/test_start_screen.py:15-25`.
- `rhyflitzer.ch` is GitHub Pages behind Cloudflare (`CNAME`, `server: cloudflare`).

## Design

### `manifest.webmanifest` (repo root)

```json
{
  "id": "/",
  "name": "Rhyflitzer",
  "short_name": "Rhyflitzer",
  "start_url": "/",
  "scope": "/",
  "display": "fullscreen",
  "background_color": "#1c1f26",
  "theme_color": "#1c1f26",
  "lang": "de",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

No `orientation` (A3), no `prefer_related_applications`, no service worker (A1).

### `index.html` head

After the favicon line: `<link rel="manifest" href="manifest.webmanifest">`, `<meta name="theme-color"
content="#1c1f26">`, `<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon-180.png">`.

### Icons (already on `main`, made by hand, not by the pipeline)

`assets/icons/`: `icon-192.png`, `icon-512.png` (any), `icon-512-maskable.png` (R inside the 80 % safe circle,
full-bleed gradient), `apple-touch-icon-180.png`. Source: `render-icons.py` (Pillow) + `Bungee-Regular.ttf`
(SIL OFL, `Bungee-OFL.txt`). Look: Bungee "R" in sun yellow, skewed like `.start h1`, stacked shadow
signal/burnt/brown/charcoal, warm glow, on the start screen's purple-to-orange sunset.

### Reload control

- Detection, one inline `<script>` right after the new link tags at the top of `index.html` (the file has no explicit
  `<head>`/`<body>` tags; `document.documentElement` exists at that point): if
  `matchMedia('(display-mode: fullscreen)')` or `('(display-mode: standalone)')` matches, or `navigator.standalone`
  is `true` (iOS), add class `installed` to `document.documentElement`.
- CSS: `html:not(.installed) #reloadbtn, html:not(.installed) #pausereload { display: none }`.
- Start screen: `<button id="reloadbtn" class="btn small" type="button" data-i18n="reloadBtn"
  style="text-transform:none">Reload</button>` as the **last** button of `.row.secondary`.
- Pause menu: `<button id="pausereload" class="btn" type="button" data-i18n="reloadBtn">Reload</button>` after
  `#pausemenu`, before `#pausetutorial`. It stays outside `PAUSE_BUTTONS`, like `#pausetutorial` (A5).
- Both: `onclick = () => location.reload()` in the wiring line `index.html:7404` (pause) and next to the other start
  buttons for `#reloadbtn`.
- Strings: `reloadBtn: 'Reload'` (en) / `'Neu laden'` (de) next to `settingsBtn`.

### Tests

- `tests/pwa.test.mjs` (node): `index.html` contains the manifest link, the theme-color meta and the apple-touch-icon
  link; the manifest parses, `display === 'fullscreen'`, `start_url === '/'`, three icons; every icon file exists and
  its PNG IHDR width/height equal the declared `sizes`; the apple-touch-icon is 180×180; `strings.js` has
  `reloadBtn` in en and de; no `serviceWorker` registration in `index.html`.
- `tests/test_pwa.py` (Playwright, one file): boot like `test_start_screen.boot`; `#reloadbtn` is **not** visible;
  add `installed` to `documentElement`; it is visible, its text is "Reload"; click it and wait for the page to boot
  again; `performance.getEntriesByType('navigation')[0].type === 'reload'`; `#pausereload` exists in the DOM.
- `tests/test_start_screen.py:11` `SECONDARY` gets `"reloadbtn"` appended (the selector `> button` includes hidden
  buttons).

### Verification after deploy (manual, maintainer)

`curl -sI https://rhyflitzer.ch/manifest.webmanifest` → `content-type: application/manifest+json` (A6); Chrome
DevTools → Application → Manifest without errors; Android: Chrome menu shows "App installieren"; the installed app
starts fullscreen and shows the Reload button on the start screen and in the pause menu.

## Assumptions

- **A1** [high] No service worker at all. Chrome removed the service-worker/`fetch()`-handler requirement for
  installing from the menu in Chrome 108 on mobile and 112 on desktop
  (https://developer.chrome.com/blog/update-install-criteria); the current criteria list a manifest with
  `name`/`short_name`, 192 + 512 icons, `start_url`, `display` and HTTPS, no service worker
  (https://web.dev/articles/install-criteria). The "Verknüpfung anlegen"-only symptom is exactly the missing manifest.
  Rejected: a pass-through SW with an empty fetch handler; it only mattered for the automatic install banner, and the
  Chrome post says such empty handlers hurt page performance.
- **A2** [high] `display: fullscreen` (maintainer decision). Browsers without fullscreen support fall back to
  `standalone` per spec.
- **A3** [med] No `orientation` key: the game has portrait layouts on phones (`index.html:102`, #785 moved the touch
  HUD down in portrait), so locking landscape would fight them. Rejected: `"orientation": "landscape"`.
- **A4** [high] `theme_color` and `background_color` both `--charcoal` `#1c1f26` (`index.html:8-9`): the body colour
  under the start screen gradient, so the splash matches the first frame. Rejected: a gradient mid-tone (not a CSS
  colour the page uses anywhere).
- **A5** [med] The pause-menu Reload button stays outside `PAUSE_BUTTONS` (keyboard focus ring), mirroring
  `#pausetutorial` (`pause.js:5,9-10`, `index.html:7389`); the installed app on a phone has no keyboard, and
  `nextFocus` would otherwise land on a hidden button on desktop. Rejected: extending `pauseButtonsFor` with an
  installed flag (a flag argument for a touch-only case).
- **A6** [high] GitHub Pages serves `.webmanifest` as `application/manifest+json` (mime-db has had the mapping since
  2017); Chrome parses the manifest regardless of MIME type anyway. The plan has the maintainer `curl -sI` it once
  after deploy rather than adding build tooling.
- **A7** [med] Reload lives in the start screen's `.row.secondary` and in the pause menu only, not in `#game-nav`:
  on phones the nav is hidden on every screen where a reload is useful (`index.html:8379-8381`). Rejected: a `⟳` in
  `#game-nav` like barrel-shooter (would be invisible exactly where it is needed).
- **A8** [med] `id` and `start_url` are `/` without a `?source=pwa` marker: analytics already excludes the query
  (`data-exclude-search`, `index.html:8386`), and `?world=`/`?region=` parsing must not meet an unknown parameter.
- **A9** [low] Detection class on `<html>` (`html.installed`) set by an inline script, with the buttons hidden by CSS
  rather than the `hidden` attribute, so the Playwright test can flip the class (Playwright cannot emulate
  `display-mode`). Rejected: `?installed=1` query switch.
- **A10** [low] German label "Neu laden". Rejected: "Seite neu laden" (too long for the small secondary button).

## Consequences

- The `.row.secondary` order test (`test_start_screen.py`) now expects six ids; the sixth button is invisible on the
  website.
- iOS Safari ignores `display: fullscreen` and runs the app `standalone` (status bar visible); the reload button shows
  there too via `navigator.standalone`.
- The automatic install banner (`beforeinstallprompt`) may not fire without a fetch handler; users install via the
  Chrome menu, which is what the report asked for.
- Players who installed the old shortcut keep it; it still opens the site in the browser until they install the app.
- `editor.html` is inside `scope: "/"`, so opening the editor from the installed app stays fullscreen (no browser
  bar there either); it has its own Back link, so no reload control is added there.
- Three PNGs (≈ 130 KB) and the Bungee TTF (119 KB) are added to the repo; only the icons are fetched, and only on
  install/first visit (the TTF is a build source, never loaded by the page).
