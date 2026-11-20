# MP race: hide checkpoints and the arrow after the own finish (#1120)

Spec: `docs/superpowers/specs/2026-11-20-mp-finish-markers-design.md`. Single file `index.html` plus one new test file. Buildless, no new dependency. Other MP fixes touch `netStartSession` (#1114), `cloneStageVehicle`/`buildNetCar`/`stepNetCars` (#1116, #1108) and lift/netsync (#1109): do not edit those. Keep every edit local to the named functions (index.html is long single-line code; use exact-string edits).

**Cause (measured):** `finish()` opens `#overlay`, which hides the HUD by CSS (`index.html:303`); `netRaceFinish()` (`:6389`) must not open it, and `stepRace` (`:6283`) re-sets `R.target` to the finish every frame in state `finished`, so the arrow, `#dist`, `#cpname`, the pillars (`cpObjs[i].g`), `finishG` and the minimap squares stay.

Run tests in the foreground, only the new file, under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 env PW_CDP_ENDPOINT= python3 -m pytest tests/test_multiplayer_race_finish.py -x -q`. Never the full suite.

### Task 1: Failing test and the hook fields

**Files:** modify `index.html` (the `window.__mm.netRace = ...` line), create `tests/test_multiplayer_race_finish.py`.

1. In the `window.__mm.netRace` hook object add four fields (keep the existing ones):
   `state: R.state, cpVisible: cpObjs.map((c) => c.g.visible), finishVisible: finishG.visible, arrowShown: getComputedStyle($('arrow')).display !== 'none'`.
2. Create the test file. It reuses the fixtures, like `test_multiplayer_race_cp.py`:

```python
"""#1120: after the own finish in a multiplayer race the checkpoints, the finish gate and the arrow go away
(the single-player finish hides them behind its result overlay); a finish the host refuses brings them back.
Slow (Playwright, two heavy pages): run in the foreground."""
from test_multiplayer_cruise import pair_fixture  # noqa: F401  (fixture)
from test_multiplayer_lobby import T
from test_multiplayer_race_cp import start_race

NET_RACE = "() => window.__mm.netRace()"


def test_own_finish_hides_checkpoints_arrow_and_gate(pair):
    host, guest, errors = pair
    start_race(host, guest)
    host.wait_for_function("() => window.__mm.netRace().state === 'racing' || window.__mm.netRace().state === 'armed'", timeout=T)
    cps = host.evaluate(NET_RACE)["cps"]
    for i, (x, z) in enumerate(cps):   # the host's own passes are trusted: drive each checkpoint through the real stepRace
        host.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
        host.wait_for_function("(i) => window.__mm.netRace().done[i]", arg=i, timeout=T)
    before = host.evaluate(NET_RACE)
    assert before["arrowShown"] and before["finishVisible"] and all(before["cpVisible"])
    fx, fz = before["finish"]
    host.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [fx, fz])
    host.wait_for_function("() => window.__mm.netRace().state === 'finished'", timeout=T)
    after = host.evaluate(NET_RACE)
    assert after["cpVisible"] == [False] * len(cps)
    assert after["finishVisible"] is False
    assert after["arrowShown"] is False
    assert errors == []


def test_a_refused_finish_brings_markers_and_arrow_back(pair):
    """The guest is nowhere near the finish and has no host-booked passes: the host answers cpno -1 (netReopenCp(-1))."""
    host, guest, errors = pair
    start_race(host, guest)
    cps = guest.evaluate(NET_RACE)["cps"]
    for i in range(len(cps)):
        guest.evaluate("(i) => window.__mm.netMarkCpDone(i)", i)
    fx, fz = guest.evaluate(NET_RACE)["finish"]
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [fx, fz])
    guest.wait_for_function("() => window.__mm.netRace().cpno === -1 || window.__mm.netRace().state === 'racing'", timeout=T)
    guest.wait_for_function("() => window.__mm.netRace().state === 'racing' && window.__mm.netRace().arrowShown", timeout=T)
    back = guest.evaluate(NET_RACE)
    assert back["finishVisible"] is True
    assert all(back["cpVisible"])
    assert errors == []
```

3. Run: expect `test_own_finish_hides_checkpoints_arrow_and_gate` to FAIL on `after["cpVisible"]` (pillars still visible). Never edit a test to turn it green.

verify: the failure message names the visible pillars, not a timeout or hook error. (If a page does not start in this environment, the existing `test_multiplayer_race_cp.py` fails identically; then rely on Task 3 step 3.)

### Task 2: The fix in `index.html`

**Files:** modify `index.html`: `stepRace`, `netRaceFinish`, `netReopenCp`, `netEndSession`, `drawMap`, one CSS rule, one new function.

1. CSS: directly after the `body.cruise ... {display:none}` rule block at the line of `body.cruise #tl .cps:not(#knockrow),...` (about `:129`) add a new line:
   `body.mpdone #arrow,body.mpdone #dist,body.mpdone #cpname{display:none}   /* #1120: the own MP finish -- nothing left to point at */`
2. Add next to `netRaceFinish` (before its `// #837 part d` comment):

```js
// #1120: the own finish in a network race hides what the single-player result overlay hides behind it: the pillars, the gate, the arrow, the map squares.
function setNetFinished(on) {
  document.body.classList.toggle('mpdone', on);
  if (!on) return;
  for (const c of cpObjs) c.g.visible = false;
  finishG.visible = false;
}
```

3. `netRaceFinish`: after `toastBig(tr('mpRaceFinished'));` add `setNetFinished(true);`.
4. `stepRace`: directly after the early-return block for `cruise`/`delivery`/`hunt`/`view`/`tutorial` and before the `if (R.state === 'armed' && Math.hypot(...` statement insert
   `if (NET.race && R.state === 'finished') { R.target = null; return; }   /* #1120: a finished network racer has nothing to point at */`.
   The text to anchor on: `if (R.mode === 'tutorial') { stepTutorial(dt); return; } if (R.state === 'armed'`.
5. `netReopenCp`: in the `i === -1` branch change the body to
   `{ if (R.state === 'finished') { R.state = 'racing'; setNetFinished(false); for (const c of cpObjs) c.g.visible = true; finishG.visible = true; } return; }` (keep the existing `#837 part d` comment).
6. `netEndSession`: after `NET.race = null;` add `document.body.classList.remove('mpdone');` (a rematch or back-to-lobby goes through it; `startRace` already resets `g.visible` and `finishG`).
7. `drawMap`: add near it `const raceMarks = () => hasCheckpoints(R.mode) && !document.body.classList.contains('mpdone');` and replace exactly the two `hasCheckpoints(R.mode)` calls that draw the checkpoint circles (`CPS.forEach((c, i) => {`) and the finish square (`const [fx, fy] = mapPt(v, FINISH.x, FINISH.z)`) with `raceMarks()`. The `else if (R.mode === 'hunt'` branch stays.

verify: `node --check` is not applicable (inline module); load the page once headless and confirm an empty console, then Task 3.

### Task 3: Verify

1. Run the new test file (command above). Expect 2 passed.
2. Run `tests/test_multiplayer_race_cp.py` and `tests/test_multiplayer_race_result.py` (affected neighbours; same hooks). Expect no new failures.
3. If the `pair` fixture cannot start locally (`#mpbtn` click timeout), do a single-page check instead: in a throwaway script (own `mktemp -d`) open `index.html?netice=none`, start Time trial with `document.querySelector('#startbtn').click()` once `#startbtn` is enabled, fake the guest role via a temporary local hook (not committed: `NET.role='G'; NET.link={send(){},broadcast(){},peerIds:()=>[]}; NET.race={t0:0,go:true}`), mark all five cps done with `__mm.netMarkCpDone`, set `R.state='racing'`, place at `__mm.netRace().finish`, wait 3 s and assert `arrowShown === false`, `finishVisible === false`, `cpVisible` all false. Revert the temporary hook before committing.
4. Single-player regression: Time trial finish still opens the result overlay and `body.mpdone` is absent (`document.body.classList.contains('mpdone') === false`).

### Task 4: Changelog and commit

1. `CHANGELOG.md` under `[Unreleased]`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, written for the player, bold 1-3 keywords: `- \`<ts>\` In a multiplayer race, **checkpoints** and the **arrow** disappear once you reach the finish.`
2. Commit `fix(multiplayer): hide checkpoints and arrow after the own finish` with body `Closes #1120`, on a branch from `main`; open a PR (CLAUDE.md: every code change goes through a PR). Do not bump `version.js`.
