# Hermetic gallery in browser tests: no production API call, no CORS console error (#348)

Status: enriched 2026-10-19 (headless `/enrich`, no human gate). Goal set by the maintainer: a green, trustworthy test
gate (`tests.yml`, required check `tests`) so AI merges can proceed unattended. The console checks stay strict.

## Today (evidence, reproduced on `main` at 6c61185, 2026-10-19)

- Every game page calls the deployed API for the curated world list on boot: `showGallery()` runs unconditionally
  (`prototype/index.html:3381-3404`) and fetches `galleryUrl(worldHost(location.href))` (`prototype/gallery.js:8`,
  `prototype/worlds.js:83` `WORLD_HOST = 'https://rhyflitzer-api.freaxnx01.ch'`). `?worldhost=` only redirects it on a
  localhost page to a localhost target (`prototype/worlds.js:99-104`).
- The API allows only the Pages origin (`CORS_ORIGINS=https://github.freaxnx01.ch`, `service/README.md:31`;
  `service/tests/test_app_jobs.py:84-88`). A test page on `http://127.0.0.1:<port>` is blocked and Chromium logs
  `Access to fetch at 'https://rhyflitzer-api.freaxnx01.ch/api/gallery' from origin 'http://127.0.0.1:…' has been
  blocked by CORS policy …` as a console **error** whose location is the test page, so the own-page filters keep it.
- The game already swallows the failure: `loadGallery` catches and returns `[]` (`prototype/gallery.js:33-39`). The
  console line is written by the browser itself, which page JavaScript cannot suppress.
- Three files listen to the console: `test_smoke.py`, `test_holzbruecke.py`, `test_world.py` (only `test_world.py:270`,
  which filters for one specific message, so it is not affected).
  - `test_smoke.py::test_hand_traced_fallback` and `::test_osm_layout` were fixed after the issue was drafted, by a
    per-test stub `page.route("**/api/gallery", …404…)` (`prototype/tests/test_smoke.py:19`, PR#340). Reproduced: both
    **pass** on `main` (2 passed, 50 s).
  - `test_holzbruecke.py::test_no_console_errors` has no stub (`prototype/tests/test_holzbruecke.py:41-56`).
    Reproduced: it **fails** on `main`, and the only message is the gallery CORS error above.
- The tests depend on the network: every unstubbed page makes a real request to the production API, from CI runners
  too. With the homelab GPU runners (#369) the page origin is a LAN address, not localhost
  (`prototype/tests/gpu_browser.py:42-45`), so any game-side "skip on localhost" would not apply there.
- PR selection (`prototype/tests/select_tests.py`) runs only the files a diff touches, plus three smoke tests that do
  not check the console (`select_tests.py:19-21`). That is why the red console test surfaces only on PRs that touch
  the Holzbrücke (`test-map.json:27`), e.g. #353.

## #353 overlap

#353 lists `test_holzbruecke.py::test_no_console_errors` as "console errors (cause not investigated)". The cause is
this gallery CORS error: on `main` it is the test's only message. **This fix covers that row of #353**; #353's other
rows (start-button click, underpass) are untouched.

## Decision

Of the three directions in the issue:

1. **API allows `localhost` origins** — rejected. It changes the deployed service's configuration (external to this
   repo's CI), loosens the production CORS policy, and leaves CI dependent on the live API being up. It would also
   not cover the GPU runners, whose page origin is a LAN address.
2. **Tests intercept the gallery call** — **chosen**, made the default for every browser test instead of a per-test
   stub, so a new test file cannot reintroduce the failure.
3. **Game handles a failed gallery silently** — not possible: it already does (`gallery.js:33-39`); the console line
   comes from the browser's CORS check, not from game code.

### Design

- New helper module `prototype/tests/hermetic_api.py`, a sibling of `gpu_browser.py` and `visual_runs.py`:
  - `GALLERY = "https://rhyflitzer-api.freaxnx01.ch/api/gallery"`, the production gallery URL.
  - `answer_empty_gallery(route)`: fulfils `200`, `application/json`, body `[]`, header
    `Access-Control-Allow-Origin: *` — an empty gallery, which the game already handles (`#worldsempty` shown).
  - `with_gallery_route(target)`: registers `GALLERY` on a `BrowserContext` and returns it.
  - `hermetic_new_context(original)` / `hermetic_new_page(original)`: wrappers for `Browser.new_context` and
    `Browser.new_page` that route the returned context (`page.context` for `new_page`).
- `conftest.py` installs both wrappers in `pytest_configure` and restores them in `pytest_unconfigure`, the same
  pattern as the existing `BrowserType.launch` hooks (`conftest.py:23-46`).
- The route is a **context** route. Playwright gives page routes precedence over context routes, so a test's own
  `page.route("**/api/gallery", …)` still wins: `test_gallery.py:20` and `test_smoke.py:19` keep working unchanged.
- Only the exact production gallery URL is routed. `?worldhost=` targets (localhost fixture hosts) and every other
  URL are untouched, so `test_world.py` and `test_gallery.py` behave as before.
- `select_tests.py` lists `hermetic_api.py` under `TOOLING`, next to `gpu_browser.py`.
- No game code changes. No console filter or assertion changes.

### Tests

- `prototype/tests/test_hermetic_api.py`:
  - Pure (no browser): the wrappers route the context they return; `answer_empty_gallery` fulfils 200 `[]` with the
    CORS header; `GALLERY` matches `WORLD_HOST` in `prototype/worlds.js` (drift guard).
  - One Playwright test that reproduces the `test_holzbruecke.py` view: a page with **no** gallery route of its own
    loads `index.html`; `window.__mm.gallery == []` and no own-page console error/warning or page error appears,
    with the same own-page filter as `test_holzbruecke.py:55`. It fails on `main` with the CORS message.

## Acceptance criteria

- `test_holzbruecke.py::test_no_console_errors`, `test_smoke.py::test_hand_traced_fallback` and
  `test_smoke.py::test_osm_layout` pass locally on the branch.
- No console check is loosened: no filter, assertion or expected-message list in any test changes.
- A browser page opened by any test without its own gallery route gets `[]` for the production gallery URL and no
  request to the production API leaves the browser.
- A test's own `page.route` for `**/api/gallery` still takes precedence (`test_gallery.py` passes).
- `hermetic_api.py` is listed in `select_tests.py` `TOOLING`.
- The PR's `tests` check is green.

## Out of scope

- The API's CORS configuration (`service/`), the game's gallery code.
- #353's other failures; the per-test stub in `test_smoke.py:19` (redundant afterwards, left alone so the PR does not
  select the whole slow `test_smoke.py`).
- #303 / PR#370 (shared browser). Its `BrowserProxy` calls the real `Browser.new_context` / `new_page`, so the class
  level wrappers apply through it; expect a one-line merge conflict on `select_tests.py` `TOOLING` and in
  `conftest.py`'s configure/unconfigure if both land.
