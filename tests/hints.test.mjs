// #1090 discovery hints, part a: the catalogue, the picking (pace, modes, touch, region, events, the hideout wink),
// the seen store and the tap/cap helpers. Pure module, so node --test imports it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HINTS, HINT_CFG, pickHint, hintScope, hintStoreFrom, hintStoreAfter, hintSeen, hintsOnFrom,
  newHintSession, hintSessionAfter, hintTick, hintEvent, playTimeFrom, hintTap, hintCap,
} from '../hints.js';
import { entriesFor } from '../controls.js';
import { translate } from '../strings.js';

const H = (id) => HINTS.find(h => h.id === id), eq = assert.equal;
const ctx = (o) => ({ mode: 'cruise', multiplayer: false, coarse: false, region: 'hochrhein', hideoutFound: false, near: [], playTime: 0, ...o });
const ripe = (o) => ({ ...newHintSession(), cruiseS: 1000, ...o });
const pick = (c = {}, s = ripe(), st = {}) => pickHint(st, s, ctx(c))?.id ?? null;
const after = (id, how, st = {}) => hintStoreAfter(st, H(id), how)[id];

test('HINTS_OrderTextsTouch', () => {
  eq(HINTS.find(h => h.kind === 'time').id, 'heli');
  for (const h of HINTS) for (const k of [h.text, h.touchText].filter(Boolean)) for (const l of ['en', 'de']) assert.notEqual(translate(l, k), k);
  assert.deepEqual(HINTS.filter(h => h.touch).map(h => h.id).sort(), ['autopilot', 'bodenacker', 'camera', 'crash', 'depot', 'foot', 'freight', 'holz', 'jumpTo', 'modes', 'ostriches', 'photo', 'plattform', 'pontoon', 'postauto', 'radio', 'wink']);
  for (const [id, a] of [['jumpTo', 'jump'], ['camera', 'camera'], ['autopilot', 'autopilot'], ['photo', 'photo'], ['nitro', 'nitro'], ['fullMap', 'fullMap']])
    eq(H(id).touch, !!entriesFor('car').find(e => e.action === a).touch, id);
});
test('Store_BadInputIsEmpty_BlockedSeesAll', () => {
  for (const raw of [null, '', '{', '[1]', '7', 'null']) assert.deepEqual(hintStoreFrom(raw), {});
  assert.deepEqual(hintStoreFrom('{"heli":{"shown":1,"seen":false}}'), { heli: { shown: 1, seen: false } });
  eq(hintSeen(null, 'x'), true); eq(pickHint(null, ripe(), ctx({ near: ['crash'] })), null);
  eq(hintStoreAfter(null, H('heli'), 'timeout'), null);   // blocked storage: nothing to remember either
  eq(hintsOnFrom(null), true); eq(hintsOnFrom('0'), false);
});
test('pickHint_Modes', () => {
  for (const m of ['trial', 'blitz', 'delivery', 'tutorial']) eq(hintScope(m, false), 'none');
  eq(pick({ multiplayer: true }), null);
  eq(pick({ mode: 'view' }), null); eq(pick({ mode: 'view', near: ['pontoon'] }), null);
  eq(pick({ mode: 'hunt', near: ['holz'] }), 'holz');
});
test('pickHint_PaceTouchRegionEventsHideout', () => {
  const busy = ripe({ sinceLast: HINT_CFG.paceS - 1 }), now = ripe({ sinceLast: 0 });
  eq(pick({}, busy), null); eq(pick({ near: ['crash'] }, busy), 'crash');
  eq(pick({}, ripe({ sinceLast: HINT_CFG.paceS })), 'heli');
  eq(pick({}, ripe({ cruiseS: HINT_CFG.firstS - 1 })), null);
  eq(pick({ coarse: true, near: ['loco'] }), 'jumpTo');
  eq(pick({ region: 'ehrendingen', near: ['crash'] }, now), null); eq(pick({ region: 'ehrendingen' }), 'heli');
  eq(pick({}, hintEvent(ripe(), 'footOut')), 'foot');
  eq(pick({ near: ['ferris'] }, now), null); eq(pick({ near: ['ferris'], hideoutFound: true }, now), 'ferris');
});
test('pickHint_Wink', () => {
  const seen = Object.fromEntries(HINTS.filter(h => h.id !== 'wink').map(h => [h.id, { shown: 1, seen: true }]));
  eq(pick({ playTime: 3599 }, ripe(), seen), null); eq(pick({ playTime: 3600 }, ripe(), seen), 'wink');
  eq(pick({ playTime: 3600, hideoutFound: true }, ripe(), seen), null);
});
test('hintStoreAfter_ThreeTimeoutsOrOneActOrClose', () => {
  const two = hintStoreAfter(hintStoreAfter({}, H('heli'), 'timeout'), H('heli'), 'timeout');
  assert.deepEqual(two.heli, { shown: 2, seen: false }); eq(after('heli', 'timeout', two).seen, true);
  eq(after('jumpTo', 'closed').seen, true); eq(after('camera', 'acted').seen, true); eq(after('crash', 'timeout').seen, true);
  hintStoreAfter(Object.freeze({}), H('heli'), 'timeout');
});
test('Session_PlaceWaitsUntilLeft_CruiseCounted', () => {
  let s = hintSessionAfter(ripe(), H('depot'));
  eq(pick({ near: ['depot'] }, s), null);
  eq(pick({ near: ['depot'] }, hintTick(s, 1, { cruising: true, near: [] })), 'depot');
  eq(hintTick(newHintSession(), 2, { cruising: false, near: [] }).cruiseS, 0);
  eq(hintTick(newHintSession(), 2, { cruising: true, near: [] }).cruiseS, 2);
});
test('PlayTimeTapCap', () => {
  for (const v of [null, '', 'NaN', '-5']) eq(playTimeFrom(v), 0); eq(playTimeFrom('12.5'), 12.5);
  assert.deepEqual(hintTap(H('heli'), false), { via: 'key', cmd: 'KeyF' });
  assert.deepEqual(hintTap(H('radio'), true), { via: 'click', sel: '#radiobtn' });
  assert.deepEqual(hintTap(H('modes'), true), { via: 'key', cmd: 'Escape' });
  eq(hintTap(H('nitro'), false), null); eq(hintTap(H('crash'), false), null);
  eq(hintCap(H('radio')), '5–0'); eq(hintCap(H('heli')), 'F'); eq(hintCap(H('crash')), null);
});
