// #538: what the game tells Umami. Pure; node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTracker, pageUrl, pageviewProps, createChangeReporter, roundSeconds, regionId, vehicleSource, vehicleData,
  activityOf, activityData, modeData, modeEndData, jumpData, MAX_TEXT,
} from '../analytics.js';

const MODES = ['trial', 'blitz', 'hunt'];
const fakeUmami = () => { const calls = []; return { calls, track: (...a) => calls.push(a) }; };

test('tracker: sends straight to umami when it is there', () => {
  const u = fakeUmami(), t = createTracker({ getUmami: () => u });
  t.track('x', { a: 1 });
  assert.deepEqual(u.calls, [['x', { a: 1 }]]);
});

test('tracker: events before umami exists wait, settle() flushes them in order', () => {
  let u; const t = createTracker({ getUmami: () => u });
  t.track('a'); t.track('b', { n: 2 });
  u = fakeUmami(); t.settle();
  assert.deepEqual(u.calls, [['a'], ['b', { n: 2 }]]);
});

test('tracker: settle() without umami drops the queue and later calls are a silent no-op', () => {
  const t = createTracker({ getUmami: () => undefined });
  t.track('a'); t.settle(); t.track('b');
  assert.doesNotThrow(() => t.settle());
});

test('tracker: umami arriving before settle() is flushed before the next event', () => {
  let u; const t = createTracker({ getUmami: () => u });
  t.track('a'); u = fakeUmami(); t.track('b');
  assert.deepEqual(u.calls.map((c) => c[0]), ['a', 'b']);
});

test('tracker: the queue is capped', () => {
  let u; const t = createTracker({ getUmami: () => u, maxQueue: 3 });
  for (let i = 0; i < 10; i++) t.track(`e${i}`);
  u = fakeUmami(); t.settle();
  assert.equal(u.calls.length, 3);
});

test('tracker: a throwing umami and a getter that throws never escape', () => {
  const boom = { track: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => createTracker({ getUmami: () => boom }).track('x'));
  assert.doesNotThrow(() => createTracker({ getUmami: () => { throw new Error('x'); } }).track('x'));
  assert.doesNotThrow(() => createTracker({ getUmami: () => ({}) }).track('x'));   // no .track function
});

test('pageUrl: the path plus utm tags only, never the world id, vehicle or dev flag', () => {
  assert.equal(pageUrl({ pathname: '/', search: '?world=abc123&vehicle=mini&dev=1' }), '/');
  assert.equal(pageUrl({ pathname: '/', search: '?utm_source=nfz&utm_medium=print&utm_campaign=okt&world=abc' }), '/?utm_source=nfz&utm_medium=print&utm_campaign=okt');
  assert.equal(pageUrl({ pathname: '/editor/', search: '' }), '/editor/');
  assert.ok(pageUrl({ pathname: '/', search: `?utm_source=${'x'.repeat(200)}` }).length <= '/?utm_source='.length + MAX_TEXT);
});

test('pageviewProps keeps umami props and replaces the url', () => {
  globalThis.location = { pathname: '/', search: '?world=secret' };
  try { assert.deepEqual(pageviewProps({ website: 'w', url: '/?world=secret', referrer: 'r' }), { website: 'w', url: '/', referrer: 'r' }); }
  finally { delete globalThis.location; }
});

test('roundSeconds: steps of 5, bad input is 0', () => {
  assert.equal(roundSeconds(62.4), 60); assert.equal(roundSeconds(63), 65); assert.equal(roundSeconds(-1), 0);
  assert.equal(roundSeconds(NaN), 0); assert.equal(roundSeconds(undefined), 0);
});

test('regionId: a generated world is just "world", never its id', () => {
  assert.equal(regionId({ id: 'hochrhein' }), 'hochrhein');
  assert.equal(regionId({ id: 'world:abc123', worldId: 'abc123', generated: true }), 'world');
  assert.equal(regionId(undefined), 'unknown');
});

test('vehicleSource: query beats stored beats default; an unknown ?vehicle= is ignored', () => {
  const ids = ['compact', 'mini'];
  assert.equal(vehicleSource('?vehicle=mini', '{"id":"compact"}', ids), 'query');
  assert.equal(vehicleSource('?vehicle=nope', '{"id":"compact"}', ids), 'stored');
  assert.equal(vehicleSource('', null, ids), 'default');
});

test('vehicleData / jumpData: cut to MAX_TEXT, empty means none / unknown', () => {
  assert.deepEqual(vehicleData('mini', 'compact'), { vehicle: 'mini', previous: 'compact' });
  assert.equal(vehicleData('mini', null).previous, 'none');
  assert.equal(jumpData('x'.repeat(200)).target.length, MAX_TEXT);
  assert.deepEqual(jumpData(''), { target: 'unknown' });
});

test('activityOf: train beats hideout beats building beats foot beats heli, else car', () => {
  const base = { train: false, level: 'surface', indoors: false, house: '6c', foot: false, fly: false };
  assert.equal(activityOf(base), 'car');
  assert.equal(activityOf({ ...base, fly: true }), 'heli');
  assert.equal(activityOf({ ...base, foot: true, fly: true }), 'foot');
  assert.equal(activityOf({ ...base, foot: true, indoors: true }), 'building:6c');
  assert.equal(activityOf({ ...base, foot: true, indoors: true, level: 'ring1' }), 'hideout');
  assert.equal(activityOf({ ...base, train: true, level: 'ring1' }), 'train');
});

test('activityData: kind, from and the place of a building', () => {
  assert.deepEqual(activityData('foot', 'car'), { activity: 'foot', from: 'car' });
  assert.deepEqual(activityData('building:6c', 'foot'), { activity: 'building', from: 'foot', place: '6c' });
  assert.deepEqual(activityData('car', 'building:6c'), { activity: 'car', from: 'building' });
});

test('modeData is generic over the MODES list: a new mode counts, a stranger is "unknown"', () => {
  assert.deepEqual(modeData('blitz', MODES, null), { mode: 'blitz', previous: 'none' });
  assert.deepEqual(modeData('trial', MODES, 'hunt'), { mode: 'trial', previous: 'hunt' });
  assert.equal(modeData('cruising', MODES, null).mode, 'unknown');
  assert.equal(modeData('cruising', [...MODES, 'cruising'], 'trial').mode, 'cruising');
  assert.equal(modeData('trial', MODES, 'whatever').previous, 'none');
});

test('modeEndData: rounded seconds, known outcomes only', () => {
  assert.deepEqual(modeEndData({ mode: 'trial', outcome: 'finished', seconds: 123.4 }, MODES), { mode: 'trial', outcome: 'finished', seconds: 125 });
  assert.equal(modeEndData({ mode: 'trial', outcome: 'quit', seconds: 1 }, MODES).outcome, 'unknown');
  assert.equal(modeEndData({ mode: 'x', outcome: 'timeup', seconds: 1 }, MODES).mode, 'unknown');
});

const reporter = (opts = {}) => { const sent = []; const r = createChangeReporter({ send: (n, d) => sent.push([n, d]), name: 'vehicle', initial: 'compact', shape: vehicleData, ...opts }); return { r, sent }; };

test('change reporter: a value that holds for the settle time is sent once', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.update('mini', 1000); assert.equal(sent.length, 0);
  r.update('mini', 2000); r.update('mini', 3000);
  assert.deepEqual(sent, [['vehicle', { vehicle: 'mini', previous: 'compact' }]]);
});

test('change reporter: browsing through values sends only the one that held', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.update('delorean', 500); r.update('bus', 1000); r.update('bus', 3100);
  assert.deepEqual(sent.map((s) => s[1].vehicle), ['bus']);
});

test('change reporter: flicker back to the last sent value sends nothing', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.update('compact', 500); r.update('compact', 5000);
  assert.equal(sent.length, 0);
});

test('change reporter: flush() sends the pending value at once, once', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.flush(); r.flush();
  assert.equal(sent.length, 1);
});

test('change reporter: at most max events per page view', () => {
  const { r, sent } = reporter({ max: 2 });
  for (let i = 0; i < 6; i++) { r.update(i % 2 ? 'a' : 'b', i * 10000); r.update(i % 2 ? 'a' : 'b', i * 10000 + 2500); }
  assert.equal(sent.length, 2);
});
