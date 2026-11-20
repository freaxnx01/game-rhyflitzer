# #837 part b: race start (Race button, grid, countdown, held cars), plan

**Goal:** the host starts a **race**. Every device spawns on a two-abreast grid at the trial start, the cars are held through a 3-2-1 countdown and released together at `T0`, and the trial checkpoints are live. Finishing only shows a toast; part d makes it host-checked.
**Needs:** part a (`raceGrid`, `RACE`, `start` with `mode: 'race'`).
**Spec:** `docs/superpowers/specs/2026-11-15-multiplayer-race-rules-design.md`.
**Files:** `index.html` (the #834/#835 multiplayer glue, `stepCar`, `stepRace`, the loop), `strings.js`, `CHANGELOG.md`, `tests/test_multiplayer_race_start.py`.
**Do not touch:** the delivery code (#107), or `stepCar` beyond the one hold line (#836 adds its own hook there).

## Task 1: strings and the button

1. In `strings.js`, add after `mpGo` in the en and the de block:
   - `mpRace: 'Start race'` / `'Rennen starten'`;
   - `mpRaceGo: 'Go!'` / `'Los!'`;
   - `mpRaceFinished: 'Finished! Waiting for the others'` / `'Im Ziel! Warte auf die anderen'`.
2. In `index.html`, right after `#mpgo`:

   ```html
   <button id="mprace" class="btn primary" type="button" hidden data-i18n="mpRace">Start race</button>
   ```
3. In `renderLobby`, next to the `#mpgo` lines:

   ```js
   $('mprace').hidden = !host || NET.session;
   $('mprace').disabled = !ready;
   ```
4. Import `raceGrid, RACE` from `./netrace.js` (extend the existing import).

Run `node --test tests/*.test.mjs` (the strings tests check that de and en are complete).

## Task 2: guests sync the clock from the lobby on

The race start needs the offset before `T0`, and cruise only started pinging at the session start.

- In `netPeerState`, the guest `open` branch: after the hello, add `netPing(); NET.pingTimer = setInterval(netPing, PING_MS);`.
- In `netStartSession`, delete the guest ping line.
- `netEndSession` no longer resets `clock`, `offset` or `pingTimer`, so the clock survives a session end (part d goes back to the lobby without leaving).
- `netLeave` clears them instead:

  ```js
  clearInterval(NET.pingTimer);
  Object.assign(NET, { clock: null, offset: null, pingTimer: null });
  ```

  Put this before the existing `Object.assign`.
- Add `race: null` to `NET`, with the comment `// #837: { t0, shown, go } while a network race runs`.

## Task 3: start a race session

Generalise `netStartSession`:

```js
function netStartSession(mode = 'cruise', t0 = null) {
  if (NET.session) return;
  NET.session = true;
  CARSEL.mp = false;
  stopCodeClock(); $('mplobby').hidden = true; $('mp').hidden = true;
  const race = mode === 'race';
  startRace(race ? 'trial' : 'cruise');                            // #837: a race is the trial's checkpoints under NET.race
  NET.race = race ? { t0, shown: null, go: false } : null;
  $('pauserestart').hidden = race;                                  // a restart would leave the shared start
  P.safe = (race ? raceGrid : gridPose)([START.x, START.z, START.th], NET.you); resetCar();
  camPos.set(P.x + 12, P.y + 5, P.z);
  syncNetCars();
  NET.poseTimer = setInterval(netSendPose, POSE_MS);
}
```

- `netEndSession`: add `NET.race = null; $('pauserestart').hidden = false;`.
- Host button:

  ```js
  $('mprace').onclick = () => {
    if (NET.role !== 'H' || !NET.lobby || !canStart(NET.lobby)) return;
    const now = performance.now(), t0 = now + RACE.countdown;
    NET.link.broadcast({ type: 'start', mode: 'race', t0, now });
    netStartSession('race', t0);
  };
  ```
- Guest, in `netGuestMessage`, replace the `start` line:

  ```js
  if (msg.type === 'start') {
    if (msg.mode === 'race' && NET.offset === null) NET.offset = msg.now - performance.now();   // no pong yet: latency ignored once
    netStartSession(msg.mode, msg.t0 ?? null);
    return;
  }
  ```

## Task 4: hold, countdown and go

```js
// #837: the own car stands on the grid until T0 (host clock)
const netHeld = () => !!NET.race && !NET.race.go && hostNow() < NET.race.t0;
// from the loop: 3-2-1 in big toasts, then Go! -- the race clock starts at T0, not at the first movement
function stepNetRace() {
  if (!NET.race || NET.race.go) return;
  const left = Math.ceil((NET.race.t0 - hostNow()) / 1000);
  if (left > 0) {
    if (left <= 3 && left !== NET.race.shown) { NET.race.shown = left; toastBig(String(left)); }
    return;
  }
  NET.race.go = true; R.state = 'racing'; R.t = 0; toastBig(tr('mpRaceGo'));
}
```

- In `stepCar`, right after the `LIFT_RIDE.busy` line, add the hold:

  ```js
  if (netHeld()) { P.vx = P.vz = 0; car.position.set(P.x, P.y, P.z); return; }   // #837
  ```
- In the loop, call `stepNetRace();` right after `stepNetCars();`.
- Extend `__mm.net` with this field:

  ```js
  race: NET.race ? { t0: NET.race.t0, held: netHeld(), go: NET.race.go } : null
  ```

## Task 5: local finish in a race

In `stepRace`, the finish branch calls `finish()`. In a network race it must not write the single-player best or open the result. Change it to:

```js
... else if (best.i < 0 && bd < 7 && R.state === 'racing') { if (NET.race) netRaceFinish(); else finish(); }
```

Add:

```js
// #837 part b: the own finish; part d sends it to the host and shows the result
function netRaceFinish() { stopAuto('reset'); R.state = 'finished'; R.target = null; SFX.finish(); toastBig(tr('mpRaceFinished')); }
```

Add the CHANGELOG entry under `[Unreleased] → Added`, with the current timestamp:

> `YYYY-MM-DD HH:MM` Mehrspieler: Der Host kann jetzt ein **Rennen starten**. Alle stehen nebeneinander am Start, nach **3-2-1-Los!** fahren alle gleichzeitig los zu den Checkpoints.

## Task 6: browser test

`tests/test_multiplayer_race_start.py`. Reuse `pair_fixture` and `ready_both` from `test_multiplayer_cruise.py` (import them) and `connect`, `T` from `test_multiplayer_lobby.py`.

```python
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401  (fixture)
from test_multiplayer_lobby import T, connect

HELD = """() => { const a = window.__mm.carPose().pos, before = window.__mm.net().race.held;
  window.__mm.driveSim(0.5, ['ArrowUp']);
  const b = window.__mm.carPose().pos;
  return { before, after: window.__mm.net().race.held, d: Math.hypot(b[0] - a[0], b[2] - a[2]) }; }"""

def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5

def test_race_start_holds_then_releases_both(pair):
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    assert guest.is_hidden("#mprace")
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race && document.querySelector('#mplobby').hidden", timeout=T)
    gap = dist(host.evaluate("() => window.__mm.carPose().pos"), guest.evaluate("() => window.__mm.carPose().pos"))
    assert 3 < gap < 5, gap                                   # side by side, 4 m apart
    for page in (host, guest):
        r = page.evaluate(HELD)
        assert r["before"] and r["after"] and r["d"] < 0.5, r
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race.go", timeout=T)
        a = page.evaluate("() => window.__mm.carPose().pos")
        page.evaluate("() => window.__mm.driveSim(2, ['ArrowUp'])")
        assert dist(page.evaluate("() => window.__mm.carPose().pos"), a) > 5
    assert host.is_hidden("#pauserestart")
    assert errors == []
```

Run `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest -q tests/test_multiplayer_race_start.py tests/test_multiplayer_cruise.py`, in the foreground. Commit and push before you run it. Commit `feat(multiplayer): race start with grid and countdown (#837 part b)`.
