# #837 part c: host-checked checkpoints, board, HUD position and gap, plan

**Goal:** in a network race, every checkpoint pass goes to the host. The host checks it against that player's recent poses and broadcasts a board, and each device shows its position and gap (`P 2/3 · +1.8 s`). A refused pass reopens the checkpoint on that device.
**Needs:** parts a and b.
**Spec:** `docs/superpowers/specs/2026-11-15-multiplayer-race-rules-design.md` (*Checkpoints*, *Board, position and gap*).
**Files:** `index.html` (the multiplayer glue and the `stepRace` checkpoint branch), `strings.js`, `CHANGELOG.md`, `tests/test_multiplayer_race_cp.py`.
**Rules:** the host's own passes are trusted. A guest's `cp` counts only through `acceptCp`, and nothing from a peer touches state unparsed.

## Task 1: string and HUD line

- In `strings.js`, en: `mpPos: (p, n, gap) => \`P ${p}/${n} · ${gap}\``; de: `mpPos: (p, n, gap) => \`Platz ${p}/${n} · ${gap}\``.
- In `index.html`, the `#tr` plate gets a last child `<div id="netpos" hidden></div>`, after `#best`.
- Import `createRace, acceptCp, standings, boardRows, nearPoint` from `./netrace.js`.

Run `node --test tests/*.test.mjs`.

## Task 2: the host's race state and the board

- In `netStartSession`, right after `NET.race = …`, add:

  ```js
  if (race && NET.role === 'H') NET.race.state = createRace(NET.lobby, CPS.length);
  ```
- At the end of `netStartSession`, add `if (NET.race?.state) netRaceBoard();`, so every HUD shows its start position.
- New functions:

```js
// #837 part c: the host's standings go to everyone; every device ranks them with the same standings()
function netRaceBoard() {
  const msg = { type: 'board', over: NET.race.state.over, rows: boardRows(NET.race.state) };
  NET.link.broadcast(msg);
  netApplyBoard(msg.rows, msg.over);
}
function netApplyBoard(rows, over) { NET.race.board = rows; NET.race.over = over; renderNetPos(); }
const gapText = (ms) => (ms === null ? '—' : `${(ms / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })} s`);
function renderNetPos() {
  const el = $('netpos'), rows = NET.race?.board;
  el.hidden = !rows;
  if (!rows) return;
  const me = standings(rows).find((r) => r.id === NET.you);
  el.textContent = me ? tr('mpPos', me.pos, rows.length, gapText(me.gap)) : '';
}
```

- In `netEndSession`, add `$('netpos').hidden = true;`.
- In the `gg-langchange` listener that calls `rerenderAll()`, also call `renderNetPos()`.

## Task 3: report passes

```js
const raceMs = () => Math.max(0, Math.round(hostNow() - NET.race.t0));
// the own pass: the host books it directly, a guest asks the host
function netRaceCp(i) {
  if (!NET.race || !NET.race.go) return;
  if (NET.role === 'H') netHostPass(NET.you, i, raceMs(), null);
  else NET.link.send(HOST_ID, { type: 'cp', i, t: raceMs() });
}
// host: peerId null = the host's own pass (trusted); a guest's needs one of its last poses near the checkpoint
function netHostPass(id, i, t, peerId) {
  const cp = CPS[i], poses = NETCARS.get(id)?.track.poses ?? [];
  const near = peerId === null || (!!cp && nearPoint(poses, cp));
  const r = acceptCp(NET.race.state, id, i, t, near);
  if (!r.ok) { if (peerId !== null) { NET.link.send(peerId, { type: 'cpno', i }); } return; }
  NET.race.state = r.race; netRaceBoard();
}
```

- In `stepRace`, at the end of the `best.i >= 0 && bd < 7` branch (after `if (R.done === 5) finishG.visible = true;`), add `if (NET.race) netRaceCp(best.i);`.
- In `netHostMessage`, before the `pick` branch:

  ```js
  if (msg.type === 'cp') { if (NET.race?.state) netHostPass(id, msg.i, msg.t, peerId); return; }
  ```

## Task 4: the guest side

In `netGuestMessage`, add:

```js
if (msg.type === 'board') { if (NET.race) netApplyBoard(msg.rows, msg.over); return; }
if (msg.type === 'cpno') { if (NET.race) { NET.race.cpno = (NET.race.cpno ?? 0) + 1; netReopenCp(msg.i); } return; }
```

```js
// the host did not count this pass: the checkpoint opens again, so it can be driven once more
function netReopenCp(i) {
  const c = cpObjs[i];
  if (!c || !c.done) return;
  c.done = false; c.pillar.material = cpMat; c.ring.visible = true;
  R.done--; updatePips(); finishG.visible = false;
}
```

Add a test hook next to `__mm.net`:

```js
window.__mm.netRace = () => ({ cps: CPS.map((c) => [c.x, c.z]), finish: [FINISH.x, FINISH.z], done: cpObjs.map((c) => c.done), board: NET.race?.board ?? null, over: !!NET.race?.over, cpno: NET.race?.cpno ?? 0, pos: $('netpos').textContent });
```

Add the CHANGELOG entry under `[Unreleased] → Added`:

> `YYYY-MM-DD HH:MM` Mehrspieler-Rennen: Oben rechts steht jetzt der **Platz** (z. B. *Platz 2/3*) und der **Abstand** zum Auto davor in Sekunden. Der Host prüft jeden Checkpoint mit.

## Task 5: browser test

`tests/test_multiplayer_race_cp.py`. It reuses the fixture and helpers of part b's test.

```python
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401
from test_multiplayer_lobby import T, connect

def start_race(host, guest):
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race && window.__mm.net().race.go", timeout=T)

SEEN_NEAR = """([id, x, z]) => { const c = window.__mm.netCars().find(c => c.id === id);
  return !!c && !!c.pos && Math.hypot(c.pos[0] - x, c.pos[2] - z) < 20; }"""

def guest_pass(host, guest, i):
    """12 m short first, so the host has a near pose, then onto the checkpoint."""
    x, z = guest.evaluate("() => window.__mm.netRace().cps")[i]
    guest.evaluate("([x, z]) => window.__mm.place(x - 12, z, 0)", [x, z])
    host.wait_for_function(SEEN_NEAR, arg=[1, x, z], timeout=T)
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])

def test_guest_pass_counts_on_host_and_far_claim_is_refused(pair):
    host, guest, errors = pair
    start_race(host, guest)
    guest.wait_for_function("() => window.__mm.netRace().pos.length > 0", timeout=T)
    guest_pass(host, guest, 0)
    guest.wait_for_function("() => window.__mm.netRace().done[0]", timeout=T)
    for page in (host, guest):
        page.wait_for_function(
            "() => (window.__mm.netRace().board || []).some(r => r.id === 1 && r.times.length === 1)", timeout=T)
    # 1st of 2 on the guest, who has one pass and the host none
    assert guest.evaluate("() => window.__mm.netRace().pos").startswith(("P 1/2", "Platz 1/2"))
    guest.evaluate("() => window.__mm.netSend(0, { type: 'cp', i: 1, t: 1000 })")   # far from checkpoint 1
    guest.wait_for_function("() => window.__mm.netRace().cpno === 1", timeout=T)
    assert host.evaluate("() => window.__mm.netRace().board.find(r => r.id === 1).times.length") == 1
    assert errors == []
```

Run `PW_CDP_ENDPOINT=http://192.168.1.120:9223 python3 -m pytest -q tests/test_multiplayer_race_cp.py tests/test_multiplayer_race_start.py`, in the foreground. Commit and push before you run it. Commit `feat(multiplayer): host-checked checkpoints and race position (#837 part c)`.
