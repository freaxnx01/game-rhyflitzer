# Red browser tests on main (#353) Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-19-red-tests-on-main-design.md`. Out of scope, do not touch:
> `test_holzbruecke.py::test_no_console_errors` (#348), `test_hideout.py` (#345), `test_on_foot.py` (#365),
> `test_smoke.py::test_grass_and_fields_stay_below_the_road` (#290). The three `test_underpass.py` failures wait for a
> maintainer decision (spec §Underpass) and are **not** in this plan.

**Goal:** the in-scope red tests pass on `main` under the CI toolchain (Playwright 1.63, host in UTC), on both the
hosted (SwiftShader) and the GPU runners, without loosening one assertion.

**Architecture:** two game fixes (the build-time tooltip reads the `Last-Modified` header instead of the zone-less
`document.lastModified`; the phone-portrait debug panel moves below the toast) and eight test fixes: five stale
literals/premises the game changed on purpose (#47, #189, #273, #346, #350/pontoon), and three tests that read state
before the frame or the 250 ms tick that writes it.

## Global Constraints

- Never loosen an assertion. A changed expected value must trace to a deliberate game change named in the spec. A
  wait waits for the **same** expected value the assertion checks.
- Reproduce like CI: `pip install "playwright==1.63.0"` (the pin in `.github/workflows/tests.yml:26`), host
  `TZ=UTC`. Playwright 1.48 hides the build-time bug.
- Browser runs in the foreground, never `run_in_background`. Cap memory:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`; on exit 137 run fewer tests, do not
  raise the cap. Never run against the homelab GPU browser (concurrent sessions hang it): no `PW_CDP_ENDPOINT`.
- Buildless stack: no `package.json`, no new dependencies. Conventional Commits; PR title
  `fix(tests): make the red browser tests on main green (#353)`. No CHANGELOG entry (nothing a player sees changes).
- No IPs or hostnames of the homelab in code, docs, PR text or issue comments.

## File Structure

- Modify `prototype/index.html`: the `game-nav-buildtime` block (~line 3524-3570) and one CSS rule (line 57)
- Modify `prototype/tests/test_build_time.py`, `test_full_map.py`, `test_debug.py`, `test_blitz.py`,
  `test_navi.py`, `test_autopilot.py`, `test_beam.py`, `test_pause.py`, `test_vehicles.py`

---

### Task 1: build-time tooltip reads the `Last-Modified` header

**Files:** `prototype/index.html`, `prototype/tests/test_build_time.py`

**Interfaces:** `window.__buildTimeReady` -> `true` once `built` is final (header read, or the fallback kept).

- [ ] **Step 1: reproduce the failure.**
  `TZ=UTC python -m pytest prototype/tests/test_build_time.py -q` with Playwright 1.63. Expect 5 failed, e.g.
  `'Build: 11.10.2026, 06:59 (vor 3 Stunden 35 Minuten)' != 'Build: 11.10.2026, 08:59 (vor 1 Stunde 35 Minuten)'`.

- [ ] **Step 2: make the test wait until the game has settled the build time.** In `open_page`, after
  `page.wait_for_selector("#version-badge a", ...)`:

```python
    page.wait_for_function("() => window.__buildTimeReady === true", timeout=240000)   # #353: built from the header
```

  Run again: still 5 failed (now also a timeout until Step 3 exists, which is expected).

- [ ] **Step 3: implement.** In the `game-nav-buildtime` script replace

```js
  var d = document;
  var built = new Date(d.lastModified);
  if (isNaN(built)) return;
```

  with

```js
  var d = document;
  var built = new Date(d.lastModified);
  if (isNaN(built)) return;
  // #353: document.lastModified has no zone. Chromium writes it in the host's zone but new Date() reads it in the page's,
  // so under an emulated zone the time shifts. The response header is absolute GMT: prefer it, keep the fallback.
  function ready() { window.__buildTimeReady = true; }
  try {
    fetch(location.href, { method: "HEAD", cache: "no-store" }).then(function (r) {
      var h = r.headers.get("last-modified"), t = h ? new Date(h) : null;
      if (t && !isNaN(t)) built = t;
    }).catch(function () { }).then(ready);
  } catch (e) { ready(); }
```

- [ ] **Step 4: run** `TZ=UTC python -m pytest prototype/tests/test_build_time.py -q` (6 passed), then the same with
  `TZ=Europe/Zurich` (6 passed).

- [ ] **Step 5: commit** `fix(ui): build-time tooltip reads the Last-Modified header (#353)`.

### Task 2: full map — the start screen hides the minimap since #346

**Files:** `prototype/tests/test_full_map.py`

- [ ] **Step 1: confirm the failure.** `python -m pytest "prototype/tests/test_full_map.py::test_tab_does_nothing_on_the_start_screen"`:
  `TypeError: 'NoneType' object is not subscriptable` (`#map` has no box).

- [ ] **Step 2: update the test** (same intent: Tab does nothing on the start screen):

```python
def test_tab_does_nothing_on_the_start_screen(server):
    """#346 hides the minimap behind the start screen: holding Tab neither goes full nor shows it."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.keyboard.down("Tab"); wait_frames(page)
        held = mm(page)
        br_full = page.evaluate("() => document.getElementById('br').classList.contains('full')")
        map_hidden = page.locator("#map").is_hidden()
        page.keyboard.up("Tab")
        b.close()
    assert held["full"] is False and br_full is False and map_hidden is True
```

- [ ] **Step 3: run** the whole file: all pass.
- [ ] **Step 4: commit** `test(map): Tab on the start screen with the minimap hidden (#353)`.

### Task 3: debug panel — the region extent after #47

**Files:** `prototype/tests/test_debug.py`

- [ ] **Step 1: confirm** `test_panel_shows_world_map_extent` fails with `'map 9.47 × 7.95 km · 75.3 km²'` in the lines.
- [ ] **Step 2: update the golden value** (line ~184):

```python
    assert "map 9.47 × 7.95 km · 75.3 km²" in lines, lines   # #47 moved the south edge to Flugplatz Schupfart
```

- [ ] **Step 3: run** the test: pass.
- [ ] **Step 4: commit** `test(debug): world extent of the region after #47 (#353)`.

### Task 4: Blitz — wait for the HUD's best line

**Files:** `prototype/tests/test_blitz.py`

- [ ] **Step 1: confirm** `test_finishing_gives_a_rank_and_saves_the_best_time_left` fails with `'Best left —'`.
- [ ] **Step 2: replace** `assert "Best left 01:15" in text(page, "#best")` with

```python
        # hud() writes #best once per frame; a headless page draws only while something polls rAF
        page.wait_for_function("() => document.getElementById('best').textContent.includes('Best left 01:15')", timeout=T)
```

- [ ] **Step 3: run** the whole file: all pass.
- [ ] **Step 4: commit** `test(blitz): wait for the frame that writes the best time (#353)`.

### Task 5: Navi — the race flags gained `walked` and `pontoon`

**Files:** `prototype/tests/test_navi.py`

- [ ] **Step 1: confirm** `test_the_navi_does_not_touch_the_race_the_car_or_the_turn_signals` fails on the flags dict.
- [ ] **Step 2: update the literal** (line ~228):

```python
        assert before == {"flags": {"jumped": False, "flown": False, "walked": False, "auto": False, "pontoon": False, "swapped": False},
                          "blinker": None, "keys": []}
```

- [ ] **Step 3: run** the test: pass.
- [ ] **Step 4: commit** `test(navi): untouched race flags include walked and pontoon (#353)`.

### Task 6: Autopilot — wait for the 250 ms line refresh

**Files:** `prototype/tests/test_autopilot.py`

- [ ] **Step 1:** this one passes on a slow SwiftShader host and fails on the GPU runner (3 frames < 250 ms). It is
  timing, so no local red step; the code reading proves it: `hud()` refreshes `#autoline` only after 250 ms
  (`prototype/index.html`, `HUD.waterT`).
- [ ] **Step 2: replace** `assert page.text_content("#autoline") == ""` (after `KeyO`) with

```python
        page.wait_for_function("() => document.getElementById('autoline').textContent === ''", timeout=120000)   # refreshed every 250 ms
```

  and the earlier `assert page.text_content("#autoline").startswith("AUTOPILOT → Fridolinsmünster")` with

```python
        page.wait_for_function("() => document.getElementById('autoline').textContent.startsWith('AUTOPILOT → Fridolinsmünster')", timeout=120000)
```

- [ ] **Step 3: run** the test: pass.
- [ ] **Step 4: commit** `test(autopilot): wait for the throttled route line (#353)`.

### Task 7: Beam — a settled camera and a point below the horizon

**Files:** `prototype/tests/test_beam.py`

- [ ] **Step 1: confirm** both beam tests time out after 120 s on `wait_for_function("() => window.__mm.beam() !== null")`.
  Probe: `beamPick(1000, 200)` is `None` (sky).
- [ ] **Step 2: add the helper and the point** under `car()`:

```python
GROUND = (1000, 420)   # lower right: terrain about 10 m from the start, below the horizon of the settled chase camera


def settle_camera(page):
    """The chase camera eases in from its first-frame pose; a pick before it settles depends on the frame rate."""
    page.wait_for_function("""() => { const c = window.__mm.cam().d, p = window.__camPrev; window.__camPrev = c;
      return !!p && Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) < 1e-3; }""", timeout=T, polling="raf")
```

- [ ] **Step 3: use them.** In both tests replace `wait_frames(page)` after `page.click("#startbtn")` with
  `settle_camera(page)`, use `GROUND` instead of `(1000, 200)` everywhere (`beamPick`, `mouse.click`, `dblclick`,
  `touchscreen.tap`), and assert the pick right after taking it so a sky point fails fast:

```python
        pick = page.evaluate(f"() => window.__mm.beamPick({GROUND[0]}, {GROUND[1]})")
        assert pick is not None, "GROUND is not on the terrain any more"
```

  Keep every other assertion unchanged (`kind == "terrain"`, `< 0.5` m, heading, `jumped`, toast `Beamed!`).
- [ ] **Step 4: run** the whole file: all pass. If `kind` is not `terrain` at `GROUND`, pick another lower-right
  point that is terrain and ≥ 5 m from the car, and say which in the PR.
- [ ] **Step 5: commit** `test(beam): pick a ground point under a settled camera (#353)`.

### Task 8: Pause — Tab lands on Change vehicle since #189

**Files:** `prototype/tests/test_pause.py`

- [ ] **Step 1: confirm** `test_p_pauses_and_game_keys_are_silent` fails with `{'focus': 'pausevehicle'} != {'focus': 'pauserestart'}`.
- [ ] **Step 2: update the literal** (line ~96):

```python
    assert silent == {"keys": [], "jump": False, "help": False, "view": view, "focus": "pausevehicle"}   # Tab moved the focus (#189: Change vehicle follows Resume)
```

- [ ] **Step 3: run** the whole file: all pass.
- [ ] **Step 4: commit** `test(pause): Tab from Resume lands on Change vehicle (#353)`.

### Task 9: Toast — the phone-portrait debug panel below the toast

**Files:** `prototype/index.html` (CSS line 57), test unchanged: `prototype/tests/test_toast.py`

- [ ] **Step 1: confirm** `test_key_toast_is_centred_below_the_checkpoint_block[touch-phone]` fails:
  `overlaps(toast [.., 245.3, .., 311.1], debug [16, 310, 414.5, 416.9])`.
- [ ] **Step 2: implement.** In `prototype/index.html` line 57 change

```css
@media (pointer:coarse) and (orientation:portrait){#debug{top:calc(310px + env(safe-area-inset-top,0px))}}
```

  to

```css
@media (pointer:coarse) and (orientation:portrait){#debug{top:calc(324px + env(safe-area-inset-top,0px))}}   /* #353: below the toast (its slot sits under four 18 px HUD lines) */
```

- [ ] **Step 3: run** the whole `test_toast.py` and `test_debug.py`: all pass (the debug tests that check the panel
  on a phone must still find it on screen).
- [ ] **Step 4: commit** `fix(ui): debug panel below the toast on a phone in portrait (#353)`.

### Task 10: Vehicles — re-record the golden trace after #273

**Files:** `prototype/tests/test_vehicles.py`

- [ ] **Step 1: confirm** `test_golden_trace_of_the_compact_car` fails on `gas`:
  `[1803.9693258088223, -292.2, 31.468011729494155]` vs the recorded `[1803.968653733491, -292.2, 31.468025543467167]`.
- [ ] **Step 2: record.** On the branch (no game change touches the car), print the test's own `GOLDEN_JS` result
  once, e.g. a throwaway `python -c` that opens the page like `open_hand` and prints `page.evaluate(GOLDEN_JS)`.
  Do not commit the script.
- [ ] **Step 3: update** every changed value in `GOLDEN` with the printed numbers (full precision) and add under the
  existing #69 comment:

```python
# all seven re-recorded for #353: #273 (a6eb4a5, wheels on the drawn road at joints and junction discs) moved the
# ground under the hand Bahnhofstrasse by a hair, 0.67 mm over the gas run (found by git bisect).
```

  Keep `abs=1e-6`.
- [ ] **Step 4: run** the whole `test_vehicles.py` twice: all pass both times (deterministic).
- [ ] **Step 5: commit** `test(vehicles): re-record the golden trace after #273 (#353)`.

### Task 11: full-suite verification

- [ ] **Step 1:** push the branch, open the PR, then dispatch one full hosted run on it:
  `gh workflow run tests.yml --ref <branch> -f all=true -f hosted=true`.
- [ ] **Step 2:** in the PR body, list every failing test of that run. Allowed: only the out-of-scope ones
  (#348, #345, #365, #290) and the three blocked underpass tests (spec §Underpass), each with its issue. Also
  confirm `test_smoke.py::test_camera_cycles_with_c`, `test_drone.py`, `test_look_back.py` pass (the `#startbtn`
  case, fixed by #346). Any other red test is a finding: report it in the PR, do not fix it here.
  If the run is cut off by the 30-minute timeout (#345), say which shards and re-run those files locally.
