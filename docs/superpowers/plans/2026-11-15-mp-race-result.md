# #837 part d: host-checked finish, DNF, result, rematch and back to the lobby, plan

**Goal:**
- The host checks every finish.
- A racer still running 60 s after the first finish is DNF, and so is a guest who drops.
- When nobody is running, every device shows the **same ranked result**.
- The host then picks **Rematch** (a new countdown, same cars) or **Back to lobby**.

**Needs:** parts a to c.
**Spec:** `docs/superpowers/specs/2026-11-15-multiplayer-race-rules-design.md` (*Finish, DNF and result*).
**Files:**
- `index.html`: the lobby dialog markup and the multiplayer glue;
- `strings.js`;
- `CHANGELOG.md`;
- `tests/test_multiplayer_race_result.py`.

## Task 1: strings and markup

1. In `strings.js`, en / de:

   | key | en | de |
   |---|---|---|
   | `mpResultTitle` | `'Race result'` | `'Rennergebnis'` |
   | `mpRematch` | `'Rematch'` | `'Revanche'` |
   | `mpBackLobby` | `'Back to lobby'` | `'Zurück zur Lobby'` |
   | `mpWaitHost` | `'Waiting for the host…'` | `'Warte auf den Host …'` |
   | `mpDnf` | `'DNF'` | `'nicht im Ziel'` |

2. In `#mplobby`, before `#mppick`, add:

   ```html
   <div id="mpresult" hidden aria-live="polite"></div>
   <button id="mprematch" class="btn primary" type="button" hidden data-i18n="mpRematch">Rematch</button>
   <button id="mpback" class="btn" type="button" hidden data-i18n="mpBackLobby">Back to lobby</button>
   ```

3. Import `acceptFinish, dropRacer, tickRace` from `./netrace.js`.

Run `node --test tests/*.test.mjs`.

## Task 2: finish through the host

Replace part b's `netRaceFinish` with:

```js
// #837 part d: the own finish -- the host books it (its own is trusted), a guest asks; the car keeps driving
function netRaceFinish() {
  stopAuto('reset'); R.state = 'finished'; R.target = null; SFX.finish(); toastBig(tr('mpRaceFinished'));
  if (NET.role === 'H') netHostFinish(NET.you, raceMs(), null);
  else NET.link.send(HOST_ID, { type: 'finish', t: raceMs() });
}
function netHostFinish(id, t, peerId) {
  const near = peerId === null || nearPoint(NETCARS.get(id)?.track.poses ?? [], FINISH);
  const r = acceptFinish(NET.race.state, id, t, near, performance.now());
  if (!r.ok) { if (peerId !== null) NET.link.send(peerId, { type: 'cpno', i: -1 }); return; }
  NET.race.state = r.race; netRaceBoard();
}
```

- `netHostMessage`, next to `cp`:

  ```js
  if (msg.type === 'finish') { if (NET.race?.state) netHostFinish(id, msg.t, peerId); return; }
  ```
- `netReopenCp`: as its first line, add

  ```js
  if (i === -1) { if (R.state === 'finished') { R.state = 'racing'; finishG.visible = true; } return; }   // the finish opens again
  ```

## Task 3: DNF

- **The 60 s timeout:** at the top of `stepNetRace`, before the `go` check:

  ```js
  if (NET.role === 'H' && NET.race?.state && !NET.race.state.over) {
    const r = tickRace(NET.race.state, performance.now());
    if (r !== NET.race.state) { NET.race.state = r; netRaceBoard(); }
  }
  ```
- **A guest drops:** at the end of `netHostDrop`, after its `netHostBroadcast()`:

  ```js
  if (NET.race?.state && id !== undefined) { NET.race.state = dropRacer(NET.race.state, id); netRaceBoard(); }
  ```

## Task 4: the result

In `netApplyBoard`, after `renderNetPos()`, add `if (over) showNetResult(rows);`.

```js
// the ranking every device shows: standings() of the host's final board, so the order is the same everywhere
function netResultHtml(rows) {
  const s = standings(rows), win = s[0].st === 'fin' ? s[0].times[s[0].times.length - 1] : null;
  const line = (r) => {
    if (r.st !== 'fin') return tr('mpDnf');
    const t = r.times[r.times.length - 1];
    return fmt(t / 1000).replace(/<[^>]+>/g, '') + (r.pos > 1 && win !== null ? ` (${gapText(t - win)})` : '');
  };
  return `<h3>${esc(tr('mpResultTitle'))}</h3>` + s.map((r) => `<div class="mp-row"><b>${r.pos}. ${esc(r.name)}</b><em>${esc(line(r))}</em></div>`).join('');
}
function showNetResult(rows) {
  const host = NET.role === 'H';
  $('mpresult').innerHTML = netResultHtml(rows); $('mpresult').hidden = false;
  $('mprematch').hidden = !host; $('mprematch').disabled = !NET.lobby || NET.lobby.players.length < 2;
  $('mpback').hidden = !host;
  $('mplobby').hidden = false; renderLobby();
  if (!host) $('mplobbystatus').textContent = tr('mpWaitHost');
  (host ? $('mprematch') : $('mpleave')).focus();
}
function hideNetResult() { for (const id of ['mpresult', 'mprematch', 'mpback']) $(id).hidden = true; }
```

- In `netEndSession`, add `hideNetResult();`.
- Extend `__mm.netRace` with:

  ```js
  result: $('mpresult').hidden ? null : [...document.querySelectorAll('#mpresult .mp-row b')].map((b) => b.textContent)
  ```

## Task 5: rematch and back to the lobby

```js
// host: the same field again, a fresh countdown
function netRematch() {
  if (NET.role !== 'H' || !NET.lobby || NET.lobby.players.length < 2) return;
  netEndSession();
  const now = performance.now(), t0 = now + RACE.countdown;
  NET.link.broadcast({ type: 'start', mode: 'race', t0, now });
  netStartSession('race', t0);
}
// everyone: the session ends, the link stays, the lobby is back; the host clears the ready flags so invites work again
function netBackToLobby() {
  netEndSession();
  $('overlay').hidden = false;
  if (NET.role === 'H') {
    for (const p of NET.lobby.players) NET.lobby = setReady(NET.lobby, p.id, false);
    netHostBroadcast();
  }
  openLobby();
}
$('mprematch').onclick = netRematch;
$('mpback').onclick = () => { if (NET.role !== 'H') return; NET.link.broadcast({ type: 'back' }); netBackToLobby(); };
```

- In `netGuestMessage`, the `start` branch: add `if (NET.session) netEndSession();` before `netStartSession(…)`, so a rematch restarts the guest too.
- Add `if (msg.type === 'back') { if (NET.session) netBackToLobby(); return; }`.

Add the CHANGELOG entry under `[Unreleased] → Added`:

> `YYYY-MM-DD HH:MM` Mehrspieler-Rennen mit **Ergebnis**: Alle sehen dieselbe Rangliste mit Zeiten und Rückstand. Wer 60 Sekunden nach dem Sieger noch fährt oder die Verbindung verliert, ist *nicht im Ziel*. Danach startet der Host eine **Revanche** oder geht **zurück zur Lobby**.

## Task 6: browser test

`tests/test_multiplayer_race_result.py`. It imports `start_race` and `guest_pass` from `test_multiplayer_race_cp.py`, and `pair_fixture` from `test_multiplayer_cruise.py`.

```python
from test_multiplayer_cruise import pair_fixture  # noqa: F401
from test_multiplayer_lobby import T
from test_multiplayer_race_cp import guest_pass, start_race

def host_drive_all(host):
    r = host.evaluate("() => window.__mm.netRace()")
    for k, (x, z) in enumerate(r["cps"] + [r["finish"]]):
        host.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
        if k < len(r["cps"]):
            host.wait_for_function("(k) => window.__mm.netRace().done[k]", arg=k, timeout=T)

def test_scripted_race_same_result_then_rematch(pair):
    host, guest, errors = pair
    start_race(host, guest)
    host_drive_all(host)
    n = len(guest.evaluate("() => window.__mm.netRace().cps"))
    for i in range(n):
        guest_pass(host, guest, i)
        guest.wait_for_function("(i) => window.__mm.netRace().done[i]", arg=i, timeout=T)
    x, z = guest.evaluate("() => window.__mm.netRace().finish")
    guest.evaluate("([x, z]) => window.__mm.place(x - 12, z, 0)", [x, z])
    host.wait_for_function("([x, z]) => window.__mm.netCars().some(c => c.id === 1 && c.pos && Math.hypot(c.pos[0] - x, c.pos[2] - z) < 20)", arg=[x, z], timeout=T)
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.netRace().result", timeout=T)
    assert host.evaluate("() => window.__mm.netRace().result") == guest.evaluate("() => window.__mm.netRace().result")
    assert host.evaluate("() => window.__mm.netRace().result")[0].startswith("1.")
    host.click("#mprematch")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race && !window.__mm.net().race.go && window.__mm.netRace().result === null", timeout=T)
    assert errors == []

def test_guest_drop_is_dnf_and_back_to_lobby(pair):
    host, guest, errors = pair
    start_race(host, guest)
    guest.click("#pausebtn")
    guest.click("#pausemenu")
    if guest.is_visible("#abandon"):
        guest.click("#abandonok")
    host_drive_all(host)
    host.wait_for_function("() => window.__mm.netRace().result", timeout=T)
    assert host.evaluate("() => window.__mm.netRace().board.find(r => r.id === 1).st") == "dnf"
    host.click("#mpback")
    host.wait_for_function("() => !window.__mm.net().session && !document.querySelector('#mplobby').hidden", timeout=T)
    assert errors == []
```

Run `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest -q tests/test_multiplayer_race_result.py`, in the foreground. Commit and push before you run it. Commit `feat(multiplayer): race finish, result and rematch (#837 part d)`.
