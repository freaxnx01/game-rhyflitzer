// #1198: the signaling relay client. Pure module with an injected WebSocket class, so node --test drives the whole
// protocol against a fake socket: no relay, no browser, no network.
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
  r.close();
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
