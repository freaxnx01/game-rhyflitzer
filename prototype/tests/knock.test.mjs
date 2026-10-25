import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, KNOCKABLE, knockAction, touches, propGrid, nearProps, launch, stepBody, upAxis, pivotOf, bendAngle, BEND_MAX, newDrop, stepDrop, fountainSeconds, newCloth, stepCloth, newPoo, stepPoo, POO_PER_ROBIDOG, POO_COLOURS, touchesLying, shove, shovable, lyingR, SHOVE_MIN, soundPlan, hissPlan, soundLevel, restoreDue, RESTORE_AFTER } from '../knock.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('knockAction: lamps bend only above the bend speed, everything else flies from a walking pace', () => {
  assert.equal(knockAction('bin', 1), null);
  assert.equal(knockAction('bin', 2), 'fly');
  assert.equal(knockAction('hydrant', 5), 'fly');
  assert.equal(knockAction('lamp', 39 / 3.6), null);
  assert.equal(knockAction('lamp', 41 / 3.6), 'bend');
  assert.equal(knockAction('tree', 30), null);
});

test('touches: inside the summed radii, and not when the car flies over it', () => {
  const car = { x: 1.2, z: 0, y: 0, r: 1 };
  assert.equal(touches('bin', 0, 0, 0, car), true);
  assert.equal(touches('bin', 0, 0, 0, { ...car, x: 1.5 }), false);
  assert.equal(touches('bin', 0, 0, 0, { ...car, y: 3 }), false);
});

test('propGrid/nearProps: finds neighbours, skips far props, reuses the output array', () => {
  const g = propGrid([{ x: 1, z: 1 }, { x: 20, z: 3 }, { x: 500, z: 500 }, { x: -3, z: -5 }]), out = [];
  assert.deepEqual(nearProps(g, 0, 0, out).sort(), [0, 1, 3]);
  assert.equal(nearProps(g, 500, 500, out), out);
  assert.deepEqual(out, [2]);
});

test('launch: goes along the car, upward, and a faster car throws harder', () => {
  const slow = launch('bin', 5, 10, 5, 0, { vx: 4, vz: 0 }, seq(0.5)), fast = launch('bin', 5, 10, 5, 0, { vx: 16, vz: 0 }, seq(0.5));
  assert.ok(slow.vx > 3 && slow.vy > 0);
  assert.ok(fast.vx > slow.vx && fast.vy > slow.vy);
  assert.equal(fast.y, 10 + KINDS.bin.h / 2);
  const heavy = launch('clothes_container', 0, 0, 0, 0, { vx: 10, vz: 0 }, seq(0.5));
  assert.ok(heavy.vx < launch('bin', 0, 0, 0, 0, { vx: 10, vz: 0 }, seq(0.5)).vx);
});

test('stepBody: flies, falls, never sinks under the ground and ends lying still', () => {
  for (const kind of KNOCKABLE.filter(k => k !== 'lamp')) {
    const b = launch(kind, 0, 5, 0, 0.3, { vx: 12, vz: 3 }, Math.random); b.long = KINDS[kind].long;
    let peak = b.y, t = 0;
    for (; t < 30 && !b.rest; t += 1 / 60) { stepBody(b, 1 / 60, 5); peak = Math.max(peak, b.y); assert.ok(b.y >= 5 + KINDS[kind].th - 1e-6, kind + ' above ground'); }
    assert.ok(b.rest, kind + ' comes to rest');
    assert.ok(peak > 5 + KINDS[kind].h / 2 + 0.3, kind + ' left the ground');
    assert.ok(b.x > 2, kind + ' travelled');
    assert.ok(Math.abs(Math.cos(b.rz) * Math.cos(b.rx)) <= 0.36, kind + ' lies down');
  }
});

test('stepBody: a body at rest stays put', () => {
  const b = launch('bin', 0, 0, 0, 0, { vx: 8, vz: 0 }, Math.random); while (!b.rest) stepBody(b, 1 / 60, 0);
  const { x, y, z } = b; stepBody(b, 1 / 60, 0); assert.deepEqual([b.x, b.y, b.z], [x, y, z]);
});

test('upAxis / pivotOf: upright is straight up, the pivot sits h/2 below the centre', () => {
  const b = { x: 1, y: 3, z: 2, rx: 0, ry: 0.7, rz: 0 };
  assert.deepEqual(upAxis(b).map(v => +v.toFixed(6)), [0, 1, 0]);
  assert.deepEqual(pivotOf(b, 2).map(v => +v.toFixed(6)), [1, 2, 2]);
  const lying = upAxis({ rx: 0, ry: 0, rz: Math.PI / 2 }); assert.ok(Math.abs(lying[1]) < 1e-9 && Math.abs(lying[0] + 1) < 1e-9);
});

test('bendAngle: from 0 to about 80 degrees, monotone on the way down, settles', () => {
  assert.equal(bendAngle(0), 0);
  let prev = 0; for (let t = 0; t <= 0.7; t += 0.05) { assert.ok(bendAngle(t) >= prev); prev = bendAngle(t); }
  assert.ok(Math.abs(bendAngle(5) - BEND_MAX) < 1e-9);
  for (let t = 0; t < 2; t += 0.01) assert.ok(bendAngle(t) <= BEND_MAX + 1e-9);
});

test('droplets: shoot up, fall back and switch off at the ground; a fountain lasts 8-10 s', () => {
  const d = newDrop({}, 0, 1, 0, seq(0.5)); assert.ok(d.vy > 12);
  let top = d.y, t = 0; for (; d.on && t < 10; t += 1 / 60) { stepDrop(d, 1 / 60, 0); top = Math.max(top, d.y); }
  assert.ok(!d.on && top > 5 && t < 4);
  assert.ok(fountainSeconds(() => 0) >= 8 && fountainSeconds(() => 0.999) <= 10);
});

test('cloth: thrown up, flutters down slowly (terminal speed), lies flat', () => {
  const c = newCloth({}, 0, 2, 0, 'sock', seq(0.5)); let maxFall = 0, t = 0;
  for (; !c.rest && t < 30; t += 1 / 60) { stepCloth(c, 1 / 60, 0); maxFall = Math.max(maxFall, -c.vy); }
  assert.ok(c.rest && c.y < 0.1 && c.rx === 0 && c.rz === 0);
  assert.ok(maxFall < 2.5, 'falls slowly: ' + maxFall);
  assert.ok(t > 1.5, 'stays in the air for a while: ' + t);
});

test('cloth (#427): from the container top it is down in about 2-3.5 s, whatever the throw', () => {
  for (const r of [0, 0.5, 0.999]) {
    const c = newCloth({}, 0, 1.4, 0, 'sock', () => r); let t = 0, top = 0;
    for (; !c.rest && t < 30; t += 1 / 60) { stepCloth(c, 1 / 60, 0); top = Math.max(top, c.y); }
    assert.ok(c.rest && t >= 1.8 && t <= 3.5, 'airborne ' + t + ' s at rng ' + r);
    assert.ok(top < 3.5, 'rises less than 2.1 m above the start: ' + top);
  }
});

test('poo (#469): a Robidog throws a handful, brown, out and up from its top', () => {
  assert.ok(POO_PER_ROBIDOG >= 4 && POO_PER_ROBIDOG <= 8);
  for (const r of [0, 0.5, 0.999]) {
    const c = newPoo({}, 3, 1.1, -2, () => r);
    assert.ok(c.on && !c.rest && c.vy > 2, 'thrown up: ' + c.vy);
    assert.ok(Math.hypot(c.vx, c.vz) > 1, 'thrown out');
    assert.ok(POO_COLOURS.includes(c.color));
  }
  for (const col of POO_COLOURS) { const r = col >> 16, g = (col >> 8) & 255, b = col & 255; assert.ok(r > g && g > b, 'brown: ' + col.toString(16)); }
});

test('poo (#469): falls like a lump, not a cloth, and sits upright where it lands', () => {
  for (const r of [0, 0.5, 0.999]) {
    const c = newPoo({}, 0, 1.1, 0, () => r); let t = 0, maxFall = 0;
    for (; !c.rest && t < 30; t += 1 / 60) { stepPoo(c, 1 / 60, 0.4); maxFall = Math.max(maxFall, -c.vy); }
    assert.ok(c.rest && t < 1.6, 'down quickly: ' + t);
    assert.ok(maxFall > 3, 'no flutter: ' + maxFall);
    assert.equal(c.y, 0.4); assert.equal(c.rx, 0); assert.equal(c.rz, 0);
    const x = c.x; stepPoo(c, 1 / 60, 0.4); assert.equal(c.x, x, 'stays put once down');
  }
});

test('lying props (#428): solid for the car, shoved along its direction by its speed, then settle again', () => {
  const b = { kind: 'bin', x: 10, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 1.57, wx: 0, wy: 0, wz: 0, rest: true, t: 5, bounces: 3 };
  assert.ok(shovable(b) && !shovable({ ...b, rest: false, vy: 3 }) && !shovable({ ...b, bend: true }));
  assert.ok(touchesLying('bin', b, { x: 9, y: 0.3, z: 0, r: 1.0 }), 'touches');
  assert.ok(!touchesLying('bin', b, { x: 7, y: 0.3, z: 0, r: 1.0 }), 'too far');
  assert.ok(!touchesLying('bin', b, { x: 9.5, y: 3, z: 0, r: 1.0 }), 'flown over');
  assert.equal(shove('bin', b, { vx: 0.2, vz: 0 }), false, 'too slow: leaned against'); assert.ok(b.rest);
  assert.equal(shove('bin', b, { vx: 8, vz: 0 }, () => 0.5), true, 'fresh shove from rest');
  assert.ok(!b.rest && b.vx > 5 && Math.abs(b.vz) < 1e-9);
  const slow = { ...b, vx: 0, vz: 0, rest: true }; shove('bin', slow, { vx: 3, vz: 0 }, () => 0.5);
  assert.ok(slow.vx < b.vx, 'scales with the car speed');
  assert.equal(shove('bin', b, { vx: 8, vz: 0 }, () => 0.5), false, 'already sliding: no new scrape');
  const x0 = b.x; let n = 0; while (!b.rest && n++ < 600) stepBody(b, 1 / 60, 0);
  assert.ok(b.rest && b.x > x0 + 0.5 && b.x < x0 + 6, 'slid a little and settled: ' + (b.x - x0));
  assert.ok(lyingR('bench') >= lyingR('bin') && SHOVE_MIN > 0);
});

test('soundPlan: every recipe has events, gains scale with the level, times stay short', () => {
  for (const s of ['clatter', 'wood', 'clang', 'lamp', 'glass', 'clink', 'scrape', 'clothes', 'hydrant']) {
    const loud = soundPlan(s, 1, seq(0.5)), soft = soundPlan(s, 0.3, seq(0.5));
    assert.ok(loud.length >= 3, s);
    assert.ok(Math.max(...loud.map(e => e.gain)) <= 1 && Math.max(...loud.map(e => e.t + e.dur)) < 2.5, s);
    assert.ok(Math.max(...soft.map(e => e.gain)) < Math.max(...loud.map(e => e.gain)), s);
    assert.ok(loud.every(e => (e.noise || e.tone) && e.dur > 0 && e.gain > 0), s);
  }
  const g = soundPlan('glass', 1, seq(0.5, 0.2, 0.8)), end = Math.max(...g.map(e => e.t + e.dur));
  assert.ok(g.length >= 60 && end > 0.8 && end < 1.6, 'glass: rich and about a second: ' + g.length + ' events, ' + end + ' s');
  assert.ok(g.filter(e => e.noise && e.noise.freq >= 3500 && e.dur >= 0.2).length >= 3, 'glass: several bright shatter bursts');
  assert.ok(soundPlan('clink', 1, seq(0.5)).filter(e => e.tone && e.tone.f0 > 2000).length >= 8, 'clink: tinkling bottles');
  assert.deepEqual(soundPlan('nothing', 1), []);
  assert.ok(hissPlan(9).every(e => e.dur === 9 && e.noise));
  assert.ok(soundLevel(2) < soundLevel(20) && soundLevel(100) === 1);
});

test('restoreDue: only after the minute and out of view', () => {
  assert.equal(restoreDue(RESTORE_AFTER - 1, 500), false);
  assert.equal(restoreDue(RESTORE_AFTER, 20), false);
  assert.equal(restoreDue(RESTORE_AFTER, 500), true);
});
