# Remote prop fall (#1191) - implementation plan

Goal: a prop one player knocks over falls (and restores) on every device. Spec: `docs/superpowers/specs/2026-11-25-mp-remote-prop-fall-design.md`.

Files: `knock.js`, `netcodec.js`, `netsync.js` (rename), `index.html`, `CHANGELOG.md`; tests: `knock.test.mjs`, `netcodec.test.mjs`, `joinhandoff.test.mjs`, `test_join_handoff.py`, `test_multiplayer_lobby.py`, `test_multiplayer_cruise.py`.

Constraints: `node --test tests/` after each task; Playwright only `tests/test_multiplayer_cruise.py`, foreground; push before verifying. **#1190:** if `CODE_VERSION` on main is already 3, bump to 4 and use `R4`.

## Task 1 - knock.js pure helpers (TDD)

- [ ] Add to `tests/knock.test.mjs` (extend the import with `fallAction, remoteSpeed, remoteCar`):

```js
test('fallAction (#1191): a lamp bends, everything else flies', () => {
  assert.equal(fallAction('lamp'), 'bend');
  for (const k of KNOCKABLE.filter((k) => k !== 'lamp')) assert.equal(fallAction(k), 'fly');
});
test('remoteSpeed (#1191): inverts soundLevel inside its range, clamped outside', () => {
  assert.ok(Math.abs(remoteSpeed(soundLevel(10)) - 10) < 1e-9);
  assert.equal(remoteSpeed(0.3), 3);
  assert.ok(Math.abs(remoteSpeed(1) - 15.4) < 1e-9);
});
test('remoteCar (#1191): drives along the angle at remoteSpeed', () => {
  const n = remoteCar(Math.PI / 2, soundLevel(10));
  assert.ok(Math.abs(n.vx) < 1e-9 && Math.abs(n.vz - 10) < 1e-9);
});
```

- [ ] Fail, then in `knock.js` below `soundLevel`:

```js
// #1191: a knock from another device: its action, and the car from direction + sound level
export const fallAction = (kind) => (kind === 'lamp' ? 'bend' : 'fly');
export const remoteSpeed = (level) => clamp((level - 0.3) * 22, 3, 15.4);
export function remoteCar(angle, level) { const s = remoteSpeed(level); return { vx: Math.cos(angle) * s, vz: Math.sin(angle) * s }; }
```

- [ ] Green. Commit.

## Task 2 - createKnock remote path

Covered by Task 5 (needs THREE).

- [ ] In `createKnock`, after `const grid = ...`: `const byKind = {}; for (const a of all) (byKind[a.kind] ||= [])[a.i] = a;`
- [ ] `startFountain` no longer calls `hiss(s)`; it still pushes `{ left: s, ... }`.
- [ ] Replace `knock(a, action, speed)` by:

```js
  // #1191: the prop goes over; no sound, no count (local and remote)
  function topple(a, action, c) {
    const k = KINDS[a.kind], gy = terrainH(a.p.x, a.p.z);
    a.age = 0; if (a.p.obb) a.p.obb.off = true;
    if (action === 'bend') { const n = Math.hypot(c.vx, c.vz) || 1; a.hit = { bend: true, dx: c.vx / n, dz: c.vz / n, t: 0, done: false }; }
    else {
      a.hit = launch(a.kind, a.p.x, gy, a.p.z, -a.p.rot, c, rng); a.hit.long = k.long;
      if (a.kind === 'hydrant') startFountain(a.p.x, gy + 0.5, a.p.z);
      if (a.kind === 'clothes_container') throwClothes(a.p.x, gy + k.h * 0.7, a.p.z, a);
      if (a.kind === 'robidog') throwPoos(a.p.x, gy + 1.0, a.p.z, a);   // #469
    }
    active.push(a);
  }
  function knock(a, action, speed) {
    const c = car(), sound = action === 'bend' ? 'lamp' : KINDS[a.kind].sound, lvl = soundLevel(speed);
    a.remote = false; topple(a, action, c);
    state.count++; state.started++;
    play(sound, lvl); if (a.kind === 'hydrant') hiss(fountains[fountains.length - 1].left);
    knocked?.(sound, lvl, { k: a.kind, i: a.i, a: Math.atan2(c.vz, c.vx) });
    onCount(state.count);
    return KINDS[a.kind].slow;
  }
```

- [ ] `animate` bounce line: `if (stepBody(...) && !a.remote) play(...)`.
- [ ] `restore(a)`: add `a.remote = false;`.
- [ ] Returned object, add:

```js
    // #1191: another player knocked it: falls here too, silent, uncounted; false if unknown or already down
    knockRemote(kind, i, angle, level) {
      const a = byKind[kind]?.[i]; if (!a || a.hit) return false;
      a.remote = true; topple(a, fallAction(kind), remoteCar(angle, level));
      return true;
    },
    // test hook: the local knock path at 8 m/s
    hit(kind, i) { const a = byKind[kind]?.[i]; if (!a || a.hit) return false; knock(a, fallAction(kind), 8); return true; },
```

- [ ] `debug()`: add `remote: active.filter(a => a.remote).length`.
- [ ] `deps` comment: `knocked?(sound, level, { k, i, a })`.
- [ ] Green. Commit `feat(knock): remote prop fall (#1191)`.

## Task 3 - codec (TDD) and CODE_VERSION

- [ ] In `tests/netcodec.test.mjs`, after `parseMessage_knock_validated`:

```js
test('parseMessage_knockWithProp_validated', () => {
  assert.deepEqual(parseMessage('{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":3,"a":-1.2}', CTX),
    { type: 'knock', s: 'clatter', l: 0.5, k: 'bin', i: 3, a: -1.2 });
  assert.deepEqual(parseMessage('{"type":"knock","s":"lamp","l":1,"id":1,"k":"lamp","i":0,"a":3.14}', CTX),
    { type: 'knock', s: 'lamp', l: 1, id: 1, k: 'lamp', i: 0, a: 3.14 });
  for (const m of [
    '{"type":"knock","s":"clatter","l":0.5,"k":"tree","i":3,"a":0}',
    '{"type":"knock","s":"glass","l":0.5,"k":"bin","i":3,"a":0}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":1.5,"a":0}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":65536,"a":0}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":3,"a":4}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"bin","i":3}',
    '{"type":"knock","s":"clatter","l":0.5,"k":"__proto__","i":3,"a":0}'])
    assert.equal(parseMessage(m, CTX), null, m);
});
```

- [ ] Fail, then in `netcodec.js` import `KINDS, KNOCKABLE` too, and replace the `knock:` validator line with `knock: parseKnock,` plus:

```js
// #1112: s = primary knock sound, l = level 0..1, id stamped by the host only. #1191: k/i/a = kind, index, direction; all or none
const PROP_I_MAX = 65535;
function parseKnock(m) {
  if (!KNOCK_SOUNDS.includes(m.s) || !finite(m.l) || m.l < 0 || m.l > 1) return null;
  if (m.id !== undefined && !(Number.isInteger(m.id) && m.id >= 0 && m.id < MAX_PLAYERS)) return null;
  const out = m.id === undefined ? { type: 'knock', s: m.s, l: m.l } : { type: 'knock', s: m.s, l: m.l, id: m.id };
  if (m.k === undefined && m.i === undefined && m.a === undefined) return out;
  if (!KNOCKABLE.includes(m.k) || KINDS[m.k].sound !== m.s) return null;
  if (!Number.isInteger(m.i) || m.i < 0 || m.i > PROP_I_MAX || !finite(m.a) || Math.abs(m.a) > Math.PI) return null;
  return { ...out, k: m.k, i: m.i, a: m.a };
}
```

(`parseKnock` goes above `VALIDATORS`, below `finite`.)

- [ ] `CODE_VERSION = 3` (comment: `#1191: knock names the prop`). Replace `R2H`/`R2G` with `R3H`/`R3G` in `tests/netcodec.test.mjs`, `tests/joinhandoff.test.mjs`, `tests/test_join_handoff.py`, `tests/test_multiplayer_lobby.py` (`grep -rn "R2[HG]" tests` must be empty).
- [ ] Green. Commit `feat(netcodec): knock carries the prop (#1191)`.

## Task 4 - wiring in index.html, gate key in netsync.js

- [ ] `netsync.js`: `knockAllowed` param `sound` → `key` (`the sound, or 'kind#index'`, #1191).
- [ ] Replace `netSendKnock` (`index.html` ~7526):

```js
function netSendKnock(s, l, prop) {
  if (!NET.session || !NET.link) return;
  const now = performance.now();
  if (!prop) { if (now - (knockSentAt[s] ?? -1e9) < 60) return; knockSentAt[s] = now; }   // #1191: a prop falls once until restored: never gated
  if (NET.role === 'H') { for (const peerId of NET.slots.keys()) NET.link.send(peerId, knockMsg(s, l, prop, NET.you)); }
  else NET.link.send(HOST_ID, knockMsg(s, l, prop));
}
// #1191: wire form; prop = { k, i, a } or a parsed knock, id = stamped slot (undefined from a guest)
const knockMsg = (s, l, prop, id) => (prop && prop.k !== undefined ? { type: 'knock', s, l, k: prop.k, i: prop.i, a: prop.a, id } : { type: 'knock', s, l, id });
// #1191: the other player's prop falls here too, at any distance
function netFallKnock(msg) { if (msg.k !== undefined && KNOCK) KNOCK.knockRemote(msg.k, msg.i, msg.a, msg.l); }
```

- [ ] Host branch (~7069): gate key `msg.k !== undefined ? msg.k + '#' + msg.i : msg.s`; `netFallKnock(msg);` before `netHearKnock`; relay `knockMsg(msg.s, msg.l, msg, id)`. Append to the comment `#1191: gated per prop, so a pile reaches everyone`.
- [ ] Guest branch (~7102): valid case becomes `{ netFallKnock(msg); netHearKnock(msg.id, msg.s, msg.l); }`.
- [ ] Beside `__mm.knock` (~2598): `window.__mm.knockHit = () => { const a = KNOCK.all().find(x => x.kind !== 'lamp' && !x.hit); return a && KNOCK.hit(a.kind, a.i) ? { k: a.kind, i: a.i } : null; };   // #1191 test hook`
- [ ] Green. Commit `feat(multiplayer): knocked props fall everywhere (#1191)`, push.

## Task 5 - Playwright (only this file)

- [ ] Append to `tests/test_multiplayer_cruise.py`:

```python
def test_a_prop_knocked_over_falls_for_the_other_player(pair):
    """#1191: a knocked prop falls on the other screen too, both ways."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().session && document.querySelector('#mplobby').hidden", timeout=T)
    for sender, receiver in ((host, guest), (guest, host)):
        own = receiver.evaluate("() => window.__mm.knock().count")
        prop = sender.evaluate("() => window.__mm.knockHit()")
        assert prop is not None
        receiver.wait_for_function("([k, i]) => window.__mm.knockProps(k)[i].hit",
                                   arg=[prop["k"], prop["i"]], polling=250, timeout=T)
        d = receiver.evaluate("() => window.__mm.knock()")
        assert d["remote"] == 1 and d["count"] == own, d
    assert net(host)["bad"] == 0 and net(guest)["bad"] == 0
    assert errors == []
```

- [ ] `python -m pytest tests/test_multiplayer_cruise.py -q`, foreground, green. Commit.

## Task 6 - CHANGELOG

- [ ] `[Unreleased]` → `### Added`, top (`TZ=Europe/Zurich date '+%F %H:%M'`):

```markdown
- `YYYY-MM-DD HH:MM` Im **Mehrspieler** fällt ein Objekt, das ein anderer Spieler **umfährt**, jetzt auch bei Dir um, und steht später wieder auf.
```

- [ ] Commit, push, open the PR (`Closes #1191`).
