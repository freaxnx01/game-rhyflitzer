# Curated screenshot gallery with a reproducible shot script (#556)

## Goal

Good, linkable pictures of the game before the article in the Neue Fricktaler Zeitung: a **curated shot list** in the repo (`docs/gallery/shots.json`), a **script** that drives the real game to every shot and writes JPGs in two sizes, and a README section that shows them. One command regenerates every image; a single motif can be retaken (the GPU browser is unstable).

The in-game photo album stays with #508 (Sightseeing). This is a repo gallery for press and README, not a game feature.

## Split of work (decided by the maintainer)

| Part | Who | In the pipeline PR |
|---|---|---|
| `docs/gallery/shots.json`, `scripts/shots.py`, tests, README section | the `ai-implement` pipeline | yes |
| Running the script against the GPU browser, tuning positions, committing the images | maintainer, local session, follow-up PR | **no** |
| GamesHub card image in `freaxnx01.github.io` | maintainer, later | **no** |

The pipeline has no GPU browser and must not produce, fake or commit any gallery image. Its PR must be mergeable without the images.

## Today

- `README.md` section "Screenshots and videos" shows `docs/gallery/plattform-{1-luftbild,2-postauto,3-aussicht}.jpg` (JPG, 32 % wide, linked to full size). They stay untouched.
- `scripts/gallery.py` + `tests/test_gallery.py` are the owner CLI of the **world** gallery (#170, `/api/gallery`). Unrelated; hence the new names `scripts/shots.py`, `docs/gallery/shots.json`, `tests/test_shots.py`.
- Tests reach Chromium through `tests/conftest.py`: SwiftShader args by default, `PW_CDP_ENDPOINT` (`tests/gpu_browser.py`) switches to the GPU browser and makes the test servers listen on the LAN (`gpu_browser.bind_for`). Every context answers the production `/api/gallery` with `[]` (`tests/hermetic_api.py`).
- HUD hide toggle (#305): `body.hud-off` hides `#tl #tc>:not(#toast) #tr #navi #compass #bl #br #stylebtn #pausebtn #debug #touch #game-nav` by `visibility:hidden` (`index.html:14`); `#toast` stays on purpose.
- Hooks on `window.__mm` (all exist): `place(x, z, th)`, `sim(...)`, `plattform()` (`{x, z, facing, base}`), `cam()` (`d` = camera minus car), `camStep(dt, from?)` (one deterministic camera easing step, independent of the frame rate), `camView`, `vehicles()`, `setVehicle(def)`, `setStyle(key)`, `fly()`, `flySim(secs, keys)`, `train()`, `layout`.
- **The game has no time of day and no weather.** The sky is fixed per style (`STYLES.original`, `STYLES.smooth`). "DSM Sisseln at night" from the issue cannot be shot today.
- The renderer caps its pixel ratio per style (`STYLES[k].pixel`: `original` 1.5, `smooth` 2).

## Decisions

| Topic | Decision |
|---|---|
| Files | `docs/gallery/shots.json` (list), `scripts/shots.py` (CLI + pure helpers), `tests/test_shots.py`, README section. No change to `index.html` or any game module. |
| Format | JPG only, quality 90, two sizes per motif: `docs/gallery/<id>-1920.jpg` (1920x1080) and `docs/gallery/<id>-3840.jpg` (3840x2160). No PNG in the repo. The file names cannot clash with the existing `plattform-N-*.jpg`. |
| One boot, two sizes | One browser context per motif, viewport 1920x1080 at device scale factor 2; `page.screenshot(scale="device")` gives 3840x2160, `scale="css"` gives 1920x1080 of the same frame. |
| Quality of 4K | Default `style: "smooth"` (pixel cap 2 = true 4K). A motif that sets `"original"` is upscaled 1.5 to 2 by the renderer; allowed, not default. |
| README thumbnails | The 1920 image shown at 32 % width, linked to the 3840 image (same pattern as the existing Plattform row). No third size. |
| Regenerate all | `python scripts/shots.py` (documented in README, with the memory cap `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ...`). |
| Retake | `python scripts/shots.py --only holzbruecke-aussen dsm-sisseln`. A failed motif is reported, the rest continue, exit code 1, and the last line prints the exact `--only` command to retake the failures. Each motif gets a fresh context, so one dead page does not poison the next. |
| Browser | `PW_CDP_ENDPOINT` set and reachable: `connect_over_cdp` + local server bound to the LAN, exactly like the tests. Otherwise local Chromium with the SwiftShader args from the tests. Reuses `tests/gpu_browser.py` and `tests/hermetic_api.py`; no new dependency (Playwright is already the test dependency). |
| Clean frame | The script adds `body.hud-off` (the #305 class, not the Ctrl+H key, so no toast) plus an injected `<style>` that hides `#toast #debug #game-nav #keybar #arrow #touch #pausebtn` with `!important`, then asserts that none of `HIDDEN_SELECTORS` is visible and `#overlay` is hidden **before** the first screenshot. A visible element fails the motif. |
| Wait for arrival | Never wall-clock stillness under a clamped loop (CLAUDE.md "Animated cameras"). For car motifs: loop `__mm.camStep(0.05)` until one step moves the camera less than 1 mm (the car is static, so that is arrival, and it does not depend on the frame rate), cap 2000 steps, then fail. For heli and loco (the camera follows a moving thing): poll `__mm.cam()` every 500 ms until three consecutive polls differ by less than 5 cm, timeout 120 s. World loaded: `#worldstatus` text, `__mm.layout === 'osm'`, and (when terrain is not blocked) `#mmhstatus.real`. |
| Motion types | `mode`: `car` (place + camera view), `heli` (place, `F`, `flySim` climb), `loco` (place at the station, `Z` twice to board the steam loco, fails loudly if `train().on` stays false). On foot is not supported in this version. |
| Cameras | `camera`: `chase`, `near`, `cockpit`, `bumper` (indexes 0-3 of `CAM_VIEWS`); the script presses `C` until `__mm.camView` matches. `drone` is excluded: its camera orbits, so "arrived" has no meaning. |
| Time and weather | `time` and `weather` are fields of the schema, but the only allowed values are `"day"` and `"clear"` because the game has neither. The night motif is parked until a day/night feature exists; its absence is listed under Assumptions. |
| Positions | World metres (x east, z south). `at` = where the car/heli/loco starts, `look_at` = the point it faces (`th = atan2(dz, dx)`); the chase camera then looks at that sight. Starting values come from `anchors.landmarks` of `data/world_hochrhein.json` plus a hand offset; each motif names its landmark in `near`, and the schema test checks `at` is within 600 m of it. **The numbers are first guesses; the maintainer tunes them in the local run and commits the corrected `shots.json` with the images.** |
| README block | The README section carries `<!-- shots:start -->` ... `<!-- shots:end -->`. `python scripts/shots.py --readme` rewrites exactly that span from `shots.json` (thumbnails + captions). The pipeline PR commits the markers and the command with an empty block (no broken image links); the follow-up PR runs `--readme` once the images exist. |
| Captions | `Rhyflitzer – Map Madness: <title>` (en dash, as in the README playlist line), used as the `alt` text; titles are English with a German `title_de` kept in the JSON for the later GamesHub/press use. |
| Memory | The script is a thin client; the heavy work is in the browser. The README documents the 2 GB cap anyway (user rule for shared hosts). |
| CHANGELOG | No entry. The changelog is player-facing in-game changes; a README gallery is not in the game. |
| GamesHub card | Out of scope. The maintainer picks one finished motif and adds it in `freaxnx01.github.io` (see its `scripts/capture_screenshots.py`). |
| Videos | The same `shots.json` is the shot list for the Screenpresso/MP4 takes (#536); stated in the README section, nothing built. |

## Start list (11 motifs, Hochrhein)

| id | Motif | mode | vehicle | camera |
|---|---|---|---|---|
| `plattform-auto` | Plattform Sisslerfeld with the Postauto in front | car | bus | chase |
| `plattform-dsm` | From the Plattform towards the DSM chimney | car | compact | chase |
| `holzbruecke-aussen` | Holzbrücke Bad Säckingen from the Rhine bank | car | compact | chase |
| `holzbruecke-nah` | Holzbrücke, close, from the Swiss side | car | delorean | near |
| `dsm-sisseln` | DSM Sisseln chimney (day, see Time and weather) | car | compact | chase |
| `dsm-wasserturm` | DSM water tower | car | mini | chase |
| `helikopter-rhein` | Helicopter over the Rhine at the Holzbrücke | heli | compact | chase |
| `dampflok-sisseln` | Steam loco on the tracks at Bahnhof Sisseln | loco | compact | chase |
| `dorfstrasse-hausnummern` | Village street with house-number signs (Bodenackerstrasse, #520) | car | compact | chase |
| `smile-kreisel` | Smile roundabout | car | delorean | near |
| `muenster-stein` | Fridolinsmünster | car | bus | chase |

## Acceptance criteria

Pipeline PR (this plan):

- [ ] `docs/gallery/shots.json` lists 8-12 motifs with id, title, title_de, region, mode, vehicle, position, heading target, camera, style, time, weather; `python -m pytest tests/test_shots.py -k "not smoke"` validates it (unique ids, required fields, valid region, enums, landmark distance).
- [ ] `scripts/shots.py` regenerates all images with one command, supports `--only <id>...`, `--list`, `--readme`, `--size`, `--out`, and reports failed motifs with the retake command.
- [ ] The script hides HUD, `#game-nav`, debug panel, toast and arrow, fails a motif if one is still visible, and waits for camera arrival and a loaded world (no fixed sleep as the arrival test).
- [ ] The README section documents the command, the retake flag and the memory cap, and contains the `shots:start/end` block; the three existing Plattform images are unchanged.
- [ ] Pure helpers (heading, file names, selection, README splice) have unit tests; a hermetic Playwright smoke test shoots one motif at 320x180, asserts both JPG files exist with the right size and that no HUD element was visible.
- [ ] No image and no PNG is added in this PR; `index.html` and the game modules are not changed.

Follow-up, local (maintainer, separate PR, **not** required for the pipeline PR):

- [ ] `docs/gallery/` contains at least 8 motifs as `<id>-1920.jpg` and `<id>-3840.jpg`, positions in `shots.json` tuned.
- [ ] No HUD, footer or debug panel is visible on any image (eyes on the pictures).
- [ ] `python scripts/shots.py --readme` run, README shows the thumbnails.
- [ ] GamesHub card shows a new motif (in `freaxnx01.github.io`).

## Assumptions

- **A1** [high] Two sizes from one DSF-2 context via `scale="device"|"css"`. Rejected: two contexts (double boot, 2x GPU-browser risk) and resizing with Pillow (new dependency).
- **A2** [high] `camStep` as the arrival loop for car motifs. Rejected: sleeping or wall-clock stillness (headless renders under 1 fps and the loop clamps dt). It is the same hook `tests/` uses for the camera (#102).
- **A3** [med] `time`/`weather` accept only `day`/`clear`; the night motif is dropped from the start list. Rejected: faking night by a dark style (no such style) or building a day/night system here (scope). Parked for a decision: if a night look is wanted, it needs its own issue.
- **A4** [med] Positions are first guesses derived from landmarks; the tuning happens in the local run. Rejected: validating drivable positions in the pipeline (needs the game running with a GPU).
- **A5** [med] Loco motif by `Z` twice. `pressZ` gets out, then boards when near the loco (`index.html:3756`). If the loco is not within reach the motif fails loudly and the maintainer moves `at`. Rejected: a new test hook for the loco.
- **A6** [med] `page.screenshot` under SwiftShader can starve (see the `__mm.photoUrl` comment). The smoke test uses a tiny viewport and a 120 s screenshot timeout; the GPU browser is the real target. If the smoke test times out, raise the timeout, do not switch to canvas read-back (it would add Pillow and drop DOM-free framing guarantees).
- **A7** [high] README block starts empty so the pipeline PR has no broken image links.

## Consequences

- One more script and one more test file; both stand alone and touch no game code.
- `shots.json` becomes the shared shot list for stills, GamesHub and video takes.
- When the game gains a day/night or weather system, the enums in `scripts/shots.py` and the motif list grow; nothing else changes.
