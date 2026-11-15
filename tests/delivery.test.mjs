// #107: the delivery mode's rules. Pure module, so node --test imports it without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DELIV, DEPOTS, mulberry32, parseHouse, buildAddresses, resolveDepots, timeLimit, orderScore, hitCargo, isHandover, pickOrder, newShift, beginOrder, tick, applyImpact, applyPenalty, finishOrder, isNewBest } from '../delivery.js';

const BLD = (id, addr, x = 0, z = 0, st = null) => ({ id, addr, st, rect: [x, z, 10, 8, 0] });

test('parseHouse keeps plain numbers and letters, drops ranges and oddities', () => {
  assert.equal(parseHouse('6'), '6');
  assert.equal(parseHouse('36A'), '36A');
  assert.equal(parseHouse(' 6c '), '6c');
  for (const bad of ['6a–6d', '14-18', '65/1', '1.1', '19.1', '', undefined]) assert.equal(parseHouse(bad), null);
});

test('buildAddresses needs a plain number and a street name, with a road inside the radius', () => {
  const near = (x) => (x === 1 ? { n: '', d: 5 } : x === 2 ? { n: 'Hauptstrasse', d: 90 } : x === 3 ? null : { n: 'Hauptstrasse', d: 20 });
  const out = buildAddresses([BLD(1, '4', 1), BLD(2, '5', 2), BLD(3, '6', 3), BLD(4, '7-9', 4), BLD(5, '12b', 5), { id: 6, addr: '8' }], near);
  assert.deepEqual(out.map(a => a.label), ['Hauptstrasse 12b']);
  assert.deepEqual([out[0].x, out[0].z, out[0].id], [5, 0, 5]);
});

test('buildAddresses prefers the OSM street of the building over the nearest road name', () => {
  const near = () => ({ n: 'Hauptstrasse', d: 20 });
  const out = buildAddresses([BLD(1, '7', 0, 0, 'Bodenackerstrasse'), BLD(2, '9', 1, 0)], near);
  assert.deepEqual(out.map(a => a.label), ['Bodenackerstrasse 7', 'Hauptstrasse 9']);
  assert.equal(out[0].street, 'Bodenackerstrasse');
});

test('buildAddresses takes a building whose own street is known even next to an unnamed road', () => {
  const out = buildAddresses([BLD(1, '3', 0, 0, 'Dorfstrasse')], () => ({ n: '', d: 12 }));
  assert.deepEqual(out.map(a => a.label), ['Dorfstrasse 3']);
});

test('resolveDepots puts each depot on the nearest address within the radius and skips unknown anchors', () => {
  const addrs = [{ label: 'A 1', x: 100, z: 0 }, { label: 'B 2', x: 40, z: 0 }, { label: 'C 3', x: 900, z: 0 }];
  const lms = [{ n: 'muenster', x: 0, z: 0 }, { n: 'stationSisseln', x: 880, z: 0 }];
  const out = resolveDepots(DEPOTS, lms, addrs);
  assert.deepEqual(out.map(d => [d.name, d.label]), [['Pizza Fridolin', 'B 2'], ['Pizza Sissla', 'C 3']]);
  assert.equal(resolveDepots(DEPOTS, [{ n: 'muenster', x: 0, z: 0 }], [{ label: 'far', x: 500, z: 0 }]).length, 0);
});

test('timeLimit is grace plus length over the reference speed, never below the minimum', () => {
  assert.equal(timeLimit(1500), 192);
  assert.equal(timeLimit(600), 92);
  assert.equal(timeLimit(100), 45);
});

test('orderScore rewards length and time left, scaled by the cargo', () => {
  assert.deepEqual(orderScore({ len: 1500, left: 30, cargo: 100 }), { base: 150, bonus: 60, tip: 210 });
  assert.equal(orderScore({ len: 1500, left: 30.9, cargo: 50 }).tip, 105);
  assert.equal(orderScore({ len: 1500, left: 0, cargo: 100 }).tip, 150);
});

test('hitCargo loses 40 % at full strength, nothing at 0, never below 0', () => {
  assert.equal(hitCargo(100, 0), 100);
  assert.equal(hitCargo(100, 1), 60);
  assert.equal(hitCargo(100, 0.5), 80);
  assert.equal(hitCargo(30, 1), 0);
});

test('isHandover needs both: close and slow', () => {
  assert.equal(isHandover(9.9, 1.4), true);
  assert.equal(isHandover(10.1, 0.5), false);
  assert.equal(isHandover(3, 5), false);
});

test('pickOrder honours the band, avoids recent addresses, is repeatable for a seed and widens once', () => {
  const addrs = Array.from({ length: 30 }, (_, i) => ({ id: i, label: 'S ' + i, x: i, z: 0 }));
  const len = a => 300 + a.id * 100;   // 300 .. 3200
  const a = pickOrder({ addresses: addrs, rng: mulberry32(7), routeLen: len, recent: [] });
  const b = pickOrder({ addresses: addrs, rng: mulberry32(7), routeLen: len, recent: [] });
  assert.deepEqual(a, b);
  assert.ok(a.len >= DELIV.minRoute && a.len <= DELIV.maxRoute);
  const none = pickOrder({ addresses: addrs, rng: mulberry32(1), routeLen: () => null, recent: [] });
  assert.equal(none, null);
  const wide = pickOrder({ addresses: addrs, rng: mulberry32(1), routeLen: () => 4000, recent: [] });
  assert.equal(wide.len, 4000);
  const recent = addrs.map(x => x.id).slice(0, 29);
  assert.equal(pickOrder({ addresses: addrs, rng: mulberry32(3), routeLen: () => 1000, recent }).addr.id, 29);
});

test('a delivered order pays the tip and moves on; a shift ends after the last order', () => {
  const st = newShift(0);
  beginOrder(st, { label: 'S 1', x: 0, z: 0 }, 1500);
  assert.equal(st.order.left, 192);
  assert.equal(tick(st, 100, 50, 10), null);
  assert.equal(st.order.left, 92);
  assert.equal(tick(st, 1, 4, 0.5), 'delivered');
  assert.equal(st.results[0].tip, 150 + 2 * 91);
  assert.equal(st.score, 332);
  assert.equal(st.idx, 1);
  assert.equal(st.order, null);
  for (let i = 1; i < DELIV.orders; i++) { beginOrder(st, { label: 'S', x: 0, z: 0 }, 1000); finishOrder(st, 'late'); }
  assert.equal(st.phase, 'over');
  assert.equal(st.results.filter(r => r.outcome === 'delivered').length, 1);
});

test('running out of time loses the order', () => {
  const st = newShift(0);
  beginOrder(st, { label: 'S', x: 0, z: 0 }, 400);
  assert.equal(tick(st, 1000, 500, 10), 'late');
  assert.equal(st.score, 0);
  assert.equal(st.results[0].outcome, 'late');
});

test('a tick outside a running order changes nothing', () => {
  const st = newShift(0);
  assert.equal(tick(st, 1, 1, 0), null);
  st.phase = 'over';
  beginOrder(st, { label: 'S', x: 0, z: 0 }, 1000);
  assert.equal(tick(st, 1, 1, 0), null);
  assert.equal(st.order.left, timeLimit(1000));
});

test('impacts damage the cargo and ruin it at 0; penalties cost time', () => {
  const st = newShift(0);
  beginOrder(st, { label: 'S', x: 0, z: 0 }, 1000);
  assert.equal(applyImpact(st, 0), null);
  assert.equal(st.order.cargo, 100);
  assert.equal(applyImpact(st, 1), null);
  assert.equal(st.order.cargo, 60);
  assert.equal(applyImpact(st, 1), null);
  assert.equal(applyImpact(st, 1), 'ruined');
  assert.equal(st.results[0].outcome, 'ruined');
  assert.equal(st.results[0].tip, 0);
  beginOrder(st, { label: 'S', x: 0, z: 0 }, 1000);
  const before = st.order.left;
  applyPenalty(st, DELIV.resetPenalty);
  assert.equal(st.order.left, before - DELIV.resetPenalty);
  assert.equal(applyImpact(newShift(0), 1), null);   // no order running: ignored
});

test('beginOrder remembers only the last few addresses', () => {
  const st = newShift(0);
  for (const id of [1, 2, 3, 4]) beginOrder(st, { id, label: 'S ' + id, x: 0, z: 0 }, 1000);
  assert.deepEqual(st.recent, [2, 3, 4]);
  assert.equal(st.recent.length, DELIV.recent);
});

test('isNewBest only counts a positive score above the old best', () => {
  assert.equal(isNewBest(100, 50), true);
  assert.equal(isNewBest(50, 50), false);
  assert.equal(isNewBest(0, 0), false);
});

test('the depots carry invented names only, each anchored to a world landmark', () => {
  assert.equal(DEPOTS.length, 3);
  assert.deepEqual(DEPOTS.map(d => d.name), ['Pizza Fridolin', 'Pizza Rheinblick', 'Pizza Sissla']);
  for (const d of DEPOTS) assert.ok(d.near && typeof d.near === 'string', d.name);
});
