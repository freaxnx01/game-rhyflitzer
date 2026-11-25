# Room code via signaling relay (#1198) - implementation plan

Goal: host gets one room code `RHY-NNNN`, guests type it, the relay forwards today's offer/answer codes; "Ohne Server verbinden" keeps the manual path. Spec: `docs/superpowers/specs/2026-11-25-mp-room-code-relay-design.md`. Wire contract: `docs/relay-protocol.md` (on main, with the ADR and `AGENT-NOTES.md`; keep code and contract in sync).

Files: new `relayclient.js`, `tests/relayclient.test.mjs`, `tests/test_multiplayer_relay.py`; edit `index.html`, `strings.js`, `CHANGELOG.md`, `tests/test_multiplayer_lobby.py`, `tests/test_join_handoff.py`.

Constraints: no `package.json`, no npm; `relayclient.js` imports nothing. `node --test tests/*.test.mjs` after each task. Playwright: only `test_multiplayer_relay.py` and `test_multiplayer_lobby.py`, foreground; push before verifying. Every relayed `data` goes through `decodeCode` - never into `hostAccept`/`guestAnswer` raw.

## Task 1 - relayclient.js (TDD)

- [ ] Create `tests/relayclient.test.mjs`:

```js
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoom, parseFrame, openRelay, OPEN_MS, DATA_MAX } from '../relayclient.js';

class FakeWs extends EventTarget {
  static last = null;
  constructor(url) { super(); this.url = url; this.sent = []; this.readyState = 0; FakeWs.last = this; }
  send(t) { this.sent.push(JSON.parse(t)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  recv(o) { this.dispatchEvent(new MessageEvent('message', { data: typeof o === 'string' ? o : JSON.stringify(o) })); }
  drop() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
const relay = (events) => openRelay({ url: 'wss://x/', game: 'rhyflitzer', prefix: 'RHY', WebSocketImpl: FakeWs, onEvent: (e) => events.push(e) });

test('normalizeRoom_variants_canonicalForm', () => {
  for (const t of ['RHY-4827', 'rhy 4827', 'RHY4827', ' 4827 ', 'rhy-4827']) assert.equal(normalizeRoom(t, 'RHY'), 'RHY-4827');
  for (const t of ['', '482', 'ABC-4827', 'RHY-48270', null]) assert.equal(normalizeRoom(t, 'RHY'), null);
});
test('parseFrame_contractFrames_acceptedFresh', () => {
  assert.deepEqual(parseFrame('{"t":"created","room":"RHY-4827","ttl":3600,"x":1}'), { t: 'created', room: 'RHY-4827', ttl: 3600 });
  assert.deepEqual(parseFrame('{"t":"signal","from":0,"data":"R2H.a"}'), { t: 'signal', from: 0, data: 'R2H.a' });
  assert.deepEqual(parseFrame('{"t":"error","code":"no-room"}'), { t: 'error', code: 'no-room' });
});
test('parseFrame_garbage_null', () => {
  for (const raw of ['nope', '{"t":"eval"}', '{"t":"signal","from":-1,"data":"x"}', '{"t":"signal","from":1,"data":""}',
    JSON.stringify({ t: 'signal', from: 1, data: 'x'.repeat(DATA_MAX + 1) }), '{"t":"error","code":"boom"}',
    '{"t":"created","room":"<b>"}', '{"t":"guest","peer":1.5}', 42, 'x'.repeat(20001)]) assert.equal(parseFrame(raw), null);
});
test('openRelay_queuesUntilOpen_thenRoutes', () => {
  const ev = [], r = relay(ev);
  r.create(3);
  assert.deepEqual(FakeWs.last.sent, []);
  FakeWs.last.open();
  assert.deepEqual(FakeWs.last.sent, [{ t: 'create', v: 1, game: 'rhyflitzer', prefix: 'RHY', max: 3 }]);
  FakeWs.last.recv({ t: 'guest', peer: 2 });
  FakeWs.last.recv('garbage');
  r.signal(2, 'R2H.x'); r.signal(2, ''); r.signal(2, 'x'.repeat(DATA_MAX + 1));
  assert.deepEqual(ev, [{ t: 'guest', peer: 2 }]);
  assert.equal(r.bad, 1);
  assert.deepEqual(FakeWs.last.sent.slice(1), [{ t: 'signal', to: 2, data: 'R2H.x' }]);
});
test('openRelay_noOpenInTime_unreachableOnce', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const ev = [], r = relay(ev);
    r.join('RHY-4827');
    mock.timers.tick(OPEN_MS);
    FakeWs.last.drop();
    assert.deepEqual(ev, [{ t: 'unreachable' }]);
  } finally { mock.timers.reset(); }
});
test('openRelay_closeBeforeOpen_unreachable; closeAfterOpen_lost; ownClose_silent', () => {
  let ev = []; relay(ev); FakeWs.last.drop(); assert.deepEqual(ev, [{ t: 'unreachable' }]);
  ev = []; relay(ev); FakeWs.last.open(); FakeWs.last.drop(); assert.deepEqual(ev, [{ t: 'lost' }]);
  ev = []; const r = relay(ev); FakeWs.last.open(); r.close(); FakeWs.last.drop(); FakeWs.last.recv({ t: 'guest', peer: 1 }); assert.deepEqual(ev, []);
});
```

- [ ] Fail. Write `relayclient.js` per spec (header: game-agnostic, copyable like `i18n.js`, see `docs/relay-protocol.md`). `parseFrame` builds a fresh object per type; `openRelay` keeps a queue, an OPEN_MS timer, a `done` flag and a `bad` getter.
- [ ] Green, full node suite. Commit `feat(multiplayer): relayclient.js for room codes (#1198)`.

## Task 2 - strings and markup

- [ ] `strings.js` en and de (key-parity test stays green; Swiss `ss`, capitalized `Du/Dir/Deine`). `mpSub` becomes 'One room code for everyone, no login' / 'Ein Raumcode für alle, kein Login'. New keys, short, in the dialog's tone: `mpRoomLabel` (Raumcode - sag ihn Deinen Freunden), `mpRoomField` (Raumcode), `mpRoomJoin` (Beitreten), `mpRoomHostHint`, `mpRoomGuestHint`, `mpManual` 'Connect without server' / 'Ohne Server verbinden', `mpRelayConnecting`, `mpRelayDown` 'Matchmaker unreachable' / 'Vermittler nicht erreichbar', `mpRoomBad` (example `RHY-4827`), `mpRoomWaiting`, `mpRoomUnknown` (no race with this code), `mpRoomClosed` (host closed the room), `mpRoomInLobby: (c) => ...` (Raumcode ${c}).
- [ ] `index.html` `#mp` dialog, after `#mphint`: `<div id="mproombox" hidden>` holding `<div class="mp-label" id="mproomlabel"></div>`, `<output id="mproomcode">` (large, letter-spaced) + `<button id="mproomcopy" class="btn" data-i18n="mpCopy">`, and for the guest `<input id="mproomfield" maxlength="12" autocapitalize="characters" data-i18n-placeholder="mpRoomField">` + `<button id="mproomjoin" class="btn primary" data-i18n="mpRoomJoin">`. Then `<button id="mpmanual" class="btn" type="button" hidden data-i18n="mpManual">`. In `#mplobby` after `#mplobbysub`: `<small id="mproomline" hidden></small>`. `openMp()` hides `mproombox` and `mpmanual` with the other boxes.
- [ ] Node suite green. Commit.

## Task 3 - glue (behaviour per spec "Game glue")

- [ ] Import `{ openRelay, normalizeRoom }`. Next to `NET`: `const RELAY_URL = 'wss://relay.freaxnx01.ch/', RELAY_GAME = 'rhyflitzer', RELAY_PREFIX = 'RHY';`; NET fields `relay: null, room: null, relayPeers: new Map()`. `netRelayDown()`: hide `mproombox`, `netTrouble(tr('mpRelayDown'))`, close and null `NET.relay`, `mpmanual` stays shown.
- [ ] Host: `netHostStart` - `!RELAY_URL` -> `netHostCode()` as today; else show `mpmanual`, say `mpRelayConnecting`, open the relay and `create(MAX_PLAYERS - 1)`. Events: `created` -> `NET.room`, box shows the code (field/join hidden), hint `mpRoomHostHint`; `guest` -> `hostOffer()`, null -> `signal(peer, 'full')`, else `encodeCode('H', sdp, REGION.id, nowSec())`, map peer -> `offer.id`, signal it; `signal` -> slot from map (none: return), `decodeCode(data, 'G', nowSec())`, `!ok` -> `NET.bad++`, else `hostAccept(slot, sdp)`; `left` -> forget peer; `unreachable|lost|expired|error` -> `netRelayDown()`.
- [ ] Lobby render (`index.html:7149`): `mproomline` = `tr('mpRoomInLobby', NET.room)` while host with `NET.relay && NET.room`, else hidden.
- [ ] Guest: `#mpguestbtn` -> `netGuestRoom()` when `RELAY_URL` (role `'G'`, hint `mpRoomGuestHint`, box with field/join only, `mpmanual` shown), else today's handler. `#mproomjoin` -> `netTakeName()`, `normalizeRoom`; null -> `mpRoomBad`; else open relay, `join(room)`, say `mpRoomWaiting`. Events: `signal` from 0: `'full'` -> `mpFull`; `decodeCode(data, 'H', nowSec())` `!ok` -> `tr(MP_ERR[...])`; other region -> close relay, `netAskRegion(code.g, NET.room)`; else `guestAnswer` -> `encodeCode('G', ...)` -> `signal(0, text)`, say `mpWaiting`, disable name and dice. `error no-room`/`expired` -> `mpRoomUnknown`; `error full` -> `mpFull`; `closed` -> `mpRoomClosed`; other error, `unreachable`, `lost` -> `netRelayDown()`.
- [ ] Guest `'open'` in `netPeerState`: close and null the relay. `netLeave`: close relay, reset the three fields.
- [ ] `#mpmanual`: host -> `netHostCode()`; guest -> close relay, hide box, `netGuestRole()`, focus `#mpin`. `#mproomcopy` copies `NET.room` like `#mpcopy`.
- [ ] `netAskRegion(id, parked = $('mpin').value.trim())` parks `parked`. Restore (`index.html:7672-7673`): a parked `/^[A-Z]{3}-\d{4}$/` with `RELAY_URL` -> `openMp(); netGuestRoom();` field filled, focus `#mproomjoin`; else today's branch.
- [ ] Node suite green. Commit.

## Task 4 - Playwright

- [ ] `tests/test_multiplayer_lobby.py`: `RELAY = re.compile(r"^wss://relay\.freaxnx01\.ch")`; `open_page` before `goto`: `ctx.route_web_socket(RELAY, lambda ws: ws.close())`. `connect()`: click `#mpmanual` after `#mphostbtn` and after `#mpguestbtn`. `tests/test_join_handoff.py` lines 38, 86: click `#mpmanual` after `#mphostbtn`. Assertions unchanged.
- [ ] New `tests/test_multiplayer_relay.py` (imports from the lobby test): a Python fake relay (dict of rooms) via `route_web_socket(RELAY, handler)` on both contexts, implementing `create`/`join`/`signal` (room `RHY-4827`). Tests: `test_room_code_brings_guest_into_lobby` (guest types `rhy 4827`; both reach the lobby with two names; host `#mproomline` has `RHY-4827`); `test_relay_down_offers_manual_way` (`ws.close()`; `#mpstatus` "Matchmaker unreachable", `#mpmanual` visible, `#mpcode` empty; click it -> `#mpcode` starts with `R`); `test_garbage_from_relay_never_answers` (guest gets `signal` data `R2H.garbage`; shows a code error, sends no `signal`).
- [ ] Commit and push, then run both files in the foreground.

## Task 5 - changelog

- [ ] `CHANGELOG.md` `[Unreleased]` `### Added`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`: "Im **Mehrspieler** genügt jetzt ein **Raumcode** wie `RHY-4827` für alle: Der Gastgeber nennt ihn, die Freunde tippen ihn ein und sind verbunden. Ist der **Vermittler** nicht erreichbar, geht es wie bisher über **Ohne Server verbinden**." Commit.
