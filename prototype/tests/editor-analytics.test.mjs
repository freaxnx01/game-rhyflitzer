// #197: what the region editor tells Umami. Pure; node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameData, track, trackPageview, createPreviewReporter, MAX_NAMES, MAX_TEXT } from '../../editor/analytics.js';

const EHR = [2667000, 1259750, 2669000, 1261750];

test('frameData: names, a 0.05 degree centre cell and the size, nothing else', () => {
  const d = frameData(EHR, ['Ehrendingen', 'Freienwil']);
  assert.deepEqual(Object.keys(d).sort(), ['gemeinden', 'h_km', 'lat', 'lon', 'w_km']);
  assert.equal(d.gemeinden, 'Ehrendingen, Freienwil');
  assert.equal(d.w_km, 2); assert.equal(d.h_km, 2);
  assert.ok(Math.abs(d.lat * 20 - Math.round(d.lat * 20)) < 1e-9, 'lat is a multiple of 0.05');
  assert.ok(Math.abs(d.lon * 20 - Math.round(d.lon * 20)) < 1e-9, 'lon is a multiple of 0.05');
  assert.ok(d.lat > 47 && d.lat < 48 && d.lon > 8 && d.lon < 9);
});

test('frameData: no LV95 digits leak, and a frame nudged within one cell reports the same cell', () => {
  const a = frameData([2667000, 1259750, 2669000, 1261750], ['X']), b = frameData([2667250, 1259750, 2669250, 1261750], ['X']);
  assert.deepEqual(a, b);
  assert.doesNotMatch(JSON.stringify(a), /26[67]\d{4}|12[56]\d{4}/);
});

test('frameData: at most MAX_NAMES names and MAX_TEXT characters; non-strings and blanks dropped', () => {
  assert.equal(frameData(EHR, ['a', 'b', 'c', 'd', 'e', 'f']).gemeinden.split(', ').length, MAX_NAMES);
  assert.ok(frameData(EHR, ['x'.repeat(500)]).gemeinden.length <= MAX_TEXT);
  assert.equal(frameData(EHR, ['A', 7, '', null, ' ']).gemeinden, 'A');
  assert.equal(frameData(EHR, []).gemeinden, '');
  assert.equal(frameData(EHR, undefined).gemeinden, '');
});

test('track and trackPageview: no-op without umami, swallow a throwing umami, pass name and data through', () => {
  delete globalThis.umami;
  assert.doesNotThrow(() => { track('x', { a: 1 }); trackPageview(); });
  globalThis.umami = { track: () => { throw new Error('boom'); } };
  assert.doesNotThrow(() => { track('x'); trackPageview(); });
  const calls = []; globalThis.umami = { track: (...a) => calls.push(a) };
  track('editor-build-start', { cached: false });
  assert.deepEqual(calls[0], ['editor-build-start', { cached: false }]);
  globalThis.location = { pathname: '/game-rhyflitzer/editor/', search: '?bbox=1,2,3,4' };
  trackPageview();
  assert.deepEqual(calls[1][0]({ website: 'w', url: '/game-rhyflitzer/editor/?bbox=1,2,3,4', title: 'T' }), { website: 'w', url: '/game-rhyflitzer/editor/', title: 'T' });
  delete globalThis.umami; delete globalThis.location;
});

function fakeTimers() {
  const pending = new Map(); let id = 0;
  return { setTimer: (fn) => { pending.set(++id, fn); return id; }, clearTimer: (i) => pending.delete(i),
    fire: () => { const fns = [...pending.values()]; pending.clear(); fns.forEach((f) => f()); }, count: () => pending.size };
}

test('preview reporter: sends only after the delay, replaces a pending frame, once per Gemeinde set, capped', () => {
  const sent = [], t = fakeTimers();
  const r = createPreviewReporter({ send: (n, d) => sent.push([n, d]), delayMs: 3000, max: 2, setTimer: t.setTimer, clearTimer: t.clearTimer });
  r.frame({ gemeinden: 'A' }); r.frame({ gemeinden: 'B' });   // the second replaces the first before it settled
  assert.equal(t.count(), 1); t.fire();
  assert.deepEqual(sent, [['editor-frame', { gemeinden: 'B' }]]);
  r.frame({ gemeinden: 'B' }); t.fire();   // same set again: not sent
  assert.equal(sent.length, 1);
  r.frame({ gemeinden: 'C' }); t.fire();
  r.frame({ gemeinden: 'D' }); t.fire();   // max 2 reached
  assert.deepEqual(sent.map((s) => s[1].gemeinden), ['B', 'C']);
  r.frame({ gemeinden: 'E' }); r.cancel(); assert.equal(t.count(), 0);
});

test('preview reporter: a frame without any Gemeinde is not reported', () => {
  const sent = [], t = fakeTimers();
  const r = createPreviewReporter({ send: (n, d) => sent.push(d), setTimer: t.setTimer, clearTimer: t.clearTimer });
  r.frame({ gemeinden: '' }); t.fire(); assert.deepEqual(sent, []);
});