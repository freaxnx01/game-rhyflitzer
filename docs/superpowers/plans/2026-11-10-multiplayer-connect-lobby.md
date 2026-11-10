# Multiplayer connect + lobby Plan (#834)

> Specs: `docs/superpowers/specs/2026-11-10-multiplayer-race-design.md` (epic) + `…-multiplayer-connect-lobby-design.md` (part 1). Nothing from #835–#837.

**Goal:** players connect by copy-paste codes and meet in a lobby (names, cars, class, ready).
**Architecture:** pure `netcodec.js` + `netrace.js` (lobby), browser-only `netlink.js`, UI in `index.html`.

Constraints: buildless, no packages, no PeerJS/Firebase/signaling server, no TURN; STUN `stun:stun.l.google.com:19302` + `stun1`. Every inbound message through `parseMessage`, never `eval`. Pure modules: no DOM/three.js. DE + EN strings. Run only `node --test tests/net*.test.mjs tests/carselect.test.mjs tests/strings.test.mjs` and `pytest tests/test_multiplayer_lobby.py tests/test_carselect.py`.

## Task 1: connection codes (`netcodec.js`)
Files: `netcodec.js`, `tests/netcodec.test.mjs`.
- [ ] Failing test, run it, expect FAIL:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCode, decodeCode, CODE_TTL } from '../netcodec.js';
const SDP = 'v=0\r\n' + 'a=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\n'.repeat(8);
test('encodeCode_hostOffer_roundTripsWithRegion', async () => {
  const c = await encodeCode('H', SDP, 'hochrhein', 1000);
  assert.match(c, /^R1H\.[A-Za-z0-9_-]+$/); assert.ok(c.length < SDP.length);
  assert.deepEqual(await decodeCode(c, 'H', 1010), { ok: true, t: 1000, g: 'hochrhein', sdp: SDP });
});
test('decodeCode_wrongRoleVersionOrAge_namedError', async () => {
  const g = await encodeCode('G', SDP, null, 1000), h = await encodeCode('H', SDP, 'hochrhein', 1000);
  assert.equal((await decodeCode(g, 'H', 1000)).error, 'role'); assert.equal((await decodeCode(g, 'G', 1000)).ok, true);
  assert.equal((await decodeCode(h.replace(/^R1/, 'R2'), 'H', 1000)).error, 'version');
  assert.equal(CODE_TTL, 300);
  assert.equal((await decodeCode(h, 'H', 1301)).error, 'expired'); assert.equal((await decodeCode(h, 'H', 939)).error, 'expired');
});
test('decodeCode_garbageOrHuge_formatOrSize', async () => {
  for (const g of ['', 'hello', 'R1H.', 'R1H.!!!!', 'R1H.' + btoa('not deflate')]) assert.equal((await decodeCode(g, 'H', 0)).error, 'format', g);
  assert.equal((await decodeCode('R1H.' + 'A'.repeat(16001), 'H', 0)).error, 'size');
});
```
- [ ] Implement per part-1 spec *Code payload*: deflate-raw + base64url; checks: size → prefix `/^R(\d+)([HG])\.(.+)$/` (`format`/`version`/`role`) → inflate+JSON in try (`format`; `t` finite, `s` starts `v=0`, host `g` string) → age. Never throws.
- [ ] PASS, commit `feat(multiplayer): connection codes (#834)`.

## Task 2: message validation (`netcodec.js`)
- [ ] Failing test (append), run it, expect FAIL:
```js
import { parseMessage, cleanName } from '../netcodec.js';
const CTX = { carIds: new Set(['compact', 'bus']), paintIds: new Set(['navy', 'signal']), regions: new Set(['hochrhein', 'ehrendingen']) };
const P = (o) => parseMessage(JSON.stringify(o), CTX);
test('parseMessage_validLobbyMessages_normalised', () => {
  assert.deepEqual(P({ type: 'hello', name: '  Kicsi\u0007 ' }), { type: 'hello', name: 'Kicsi' });
  for (const m of [{ type: 'pick', car: 'bus', paint: 'navy' }, { type: 'ready', on: true }, { type: 'bye' }, { type: 'deny', reason: 'class' }]) assert.deepEqual(P(m), m);
  const lobby = { type: 'lobby', you: 1, region: 'hochrhein', cls: 'B', players: [{ id: 0, name: 'A', car: 'bus', paint: 'navy', ready: true }, { id: 1, name: 'B', car: null, paint: null, ready: false }] };
  assert.deepEqual(P(lobby), lobby);
});
test('parseMessage_invalid_null', () => {
  const pl = (id) => ({ id, name: 'A', car: null, paint: null, ready: false }), L = (o) => ({ type: 'lobby', you: 0, region: 'hochrhein', cls: 'B', players: [pl(0)], ...o });
  for (const bad of [{ type: 'eval' }, { type: 'hello', name: '' }, { type: 'hello', name: 'x'.repeat(25) }, { type: 'pick', car: 'tank', paint: 'navy' },
    { type: 'pick', car: 'bus', paint: 'red' }, { type: 'ready', on: 'yes' }, { type: 'deny', reason: 'x' },
    L({ you: 4 }), L({ players: [] }), L({ region: 'mars' }), L({ cls: 'E' }), L({ players: [pl(0), pl(0)] })])
    assert.equal(P(bad), null, JSON.stringify(bad));
  for (const raw of ['', '{', 'null', '[]', '"x"', 'x'.repeat(4097), 42]) assert.equal(parseMessage(raw, CTX), null);
});
test('cleanName_badInput_null', () => { assert.equal(cleanName('x'.repeat(30)), null); assert.equal(cleanName(7), null); });
```
- [ ] Implement `cleanName` (strip control chars, trim, 1..24 else `null`) and `parseMessage(raw, ctx)`: string ≤ 4096, `JSON.parse` in try, whitelisted `type`, one small validator per type per the test above, returns a fresh object with known fields only.
- [ ] PASS, commit `feat(multiplayer): validate lobby messages (#834)`.

## Task 3: lobby state (`netrace.js`)
Files: `netrace.js`, `tests/netrace.test.mjs`.
- [ ] Failing test, run it, expect FAIL:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, addPlayer, removePlayer, setClass, pickCar, setReady, canStart, carFits, lobbyMessage } from '../netrace.js';
const DEFS = { fast: { drive: { top: 75, accel: 20, grip: 9, steerRate: 2.6 }, mass: 1 }, slow: { drive: { top: 11, accel: 4, grip: 9, steerRate: 2 }, mass: 2 } };
test('addPlayer_upToFour_thenNull', () => {
  let l = createLobby('hochrhein', 'Host');
  for (const n of ['B', 'C', 'D']) ({ lobby: l } = addPlayer(l, n));
  assert.deepEqual(l.players.map(p => p.id), [0, 1, 2, 3]);
  assert.equal(addPlayer(l, 'E'), null);
  assert.deepEqual(removePlayer(l, 2).players.map(p => p.id), [0, 1, 3]);
});
test('pickCar_setClass_classFilter', () => {
  assert.deepEqual([carFits('A', DEFS.fast), carFits('A', DEFS.slow), carFits('all', DEFS.slow)], [true, false, true]);
  const a = setClass(createLobby('hochrhein', 'Host'), 'A', DEFS);
  assert.equal(pickCar(a, 0, 'slow', 'navy', DEFS).reason, 'class');
  assert.equal(pickCar(a, 0, 'fast', 'navy', DEFS).lobby.players[0].car, 'fast');
  let l = setReady(pickCar(createLobby('hochrhein', 'Host'), 0, 'slow', 'navy', DEFS).lobby, 0, true);
  l = setClass(l, 'A', DEFS);   // the car no longer fits: car and ready cleared
  assert.deepEqual([l.players[0].car, l.players[0].ready], [null, false]);
});
test('setReady_canStart_needsCarTwoPlayersAllReady', () => {
  assert.equal(setReady(createLobby('hochrhein', 'Host'), 0, true).players[0].ready, false);
  let l = pickCar(createLobby('hochrhein', 'Host'), 0, 'fast', 'navy', DEFS).lobby;
  l = setReady(l, 0, true); assert.equal(canStart(l), false);
  l = addPlayer(l, 'B').lobby; l = pickCar(l, 1, 'slow', 'signal', DEFS).lobby; assert.equal(canStart(l), false);
  l = setReady(l, 1, true); assert.equal(canStart(l), true);
});
test('lobbyMessage_perPeer_carriesYou', () => {
  const m = lobbyMessage(addPlayer(createLobby('hochrhein', 'Host'), 'B').lobby, 1);
  assert.deepEqual([m.type, m.you, m.region, m.cls, m.players.length], ['lobby', 1, 'hochrhein', 'all', 2]);
});
```
- [ ] Implement: immutable, ids = lowest free 0..3, `carFits(cls, def) = cls === 'all' || powerClass(def) === cls` (import from `carselect.js`); `pickCar` returns `{ ok, lobby, reason? }`.
- [ ] PASS, commit `feat(multiplayer): lobby state (#834)`.

## Task 4: connection wrapper (`netlink.js`)
Browser only, covered by Task 6.
- [ ] `createLink({ iceServers, onMessage, onPeerState })` → `{ hostOffer, hostAccept(slot, sdp), guestAnswer(sdp), send, broadcast, close, closeAll }`. Host: ≤ 3 pcs (guest ids 1..3), each with channels `ev` (reliable) and `pose` (`ordered:false, maxRetransmits:0`); guest gets them via `ondatachannel`. ICE gathered to `complete` (5 s cap). Raw text → `onMessage`; state → `onPeerState`, plus `'timeout'` when not connected 20 s after the answer. Pending slots close after `CODE_TTL`.
- [ ] Commit `feat(multiplayer): host-star WebRTC link (#834)`.

## Task 5: UI
- [ ] `strings.js`: DE+EN `mp*` keys for every visible text (strings test green), wording from the epic spec's *Player flow* plus "Übernehmen"/"Take", a countdown `mpExpiresIn(s)`, one text per `decodeCode` error, `mpDenyClass`, `mpFull`, `mpHostLost`, and `mpIceFail` naming company/school Wi-Fi and some mobile carriers.
- [ ] `index.html`: `#mpbtn` in the start-screen `.bar .row` (hidden with `?world=`); dialog `#mp` (role, name, code + copy + countdown, answer field, status) and `#mplobby` (rows: name, car, `classLine`, ready; host-only class select A–D/all; pick car, ready, leave). Host owns the `netrace` lobby, applies guests' messages, sends `lobbyMessage` per peer on each change (`deny` on refusal). Guest sends `hello` on `ev` open, renders each `lobby`. Inbound text → `parseMessage`; `null` → `NET.bad++`. Region mismatch: as in the part-1 spec. Car picker from the lobby: ids filtered by `carFits`, `#csrace` reads `mpTake` and sends/applies `pick`, back to the lobby. Leave/Esc sends `bye`, `closeAll()`. Dialogs swallow game keys. Debug hook `__mm.net()` → `{ role, lobby, bad, peers }`. `?netice=none` → `iceServers: []`.
- [ ] Commit `feat(multiplayer): start-screen flow and lobby (#834)`.

## Task 6: browser test (one file)
Files: `tests/test_multiplayer_lobby.py`; add `"net*.js": ["test_multiplayer_lobby.py"]` to `tests/test-map.json`.
- [ ] One browser (`test_carselect.py` ARGS + `--disable-features=WebRtcHideLocalIpsWithMdns`), two contexts, `?netice=none`. Host "Anna" and guest "Ben" swap codes. Assert: both lobbies (`__mm.net()`) show Anna and Ben; guest picks a car fitting the host's class and shows ready on the host; garbage on `ev` only raises the guest's `bad`; closing the host shows `mpHostLost`; no page errors.
- [ ] Run in the foreground. Commit `test(multiplayer): two pages meet in one lobby (#834)`.

## Task 7: changelog
- [ ] `CHANGELOG.md` `[Unreleased]` → `Added`, player-facing: "**Race friends**: swap codes, meet in a lobby (up to four), pick class and cars. The race follows." Commit `docs(changelog): multiplayer lobby (#834)`.
