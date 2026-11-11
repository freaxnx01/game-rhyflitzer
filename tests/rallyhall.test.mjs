// #859: the rally hall and its three cars -- pure. node --test tests/rallyhall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RALLYHALL, carParts, carExtent } from '../rallyhall.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''}: ${a} vs ${b}`);

test('RALLYHALL_ThreeCarsOfTheirRealSizes_EvansNeuvilleMcCrae', () => {
  assert.equal(RALLYHALL.key, 'rallyhall'); near(RALLYHALL.h, 14.8, 1e-9);
  assert.deepEqual(RALLYHALL.cars.map(c => c.id), ['neuville', 'evans', 'mccrae']);
  for (const c of RALLYHALL.cars) { assert.ok(c.len >= 4.0 && c.len <= 4.4, `${c.id} length`); assert.ok(c.wid >= 1.75 && c.wid <= 1.9, `${c.id} width`); assert.ok(c.hgt >= 1.35 && c.hgt <= 1.45, `${c.id} height`); }
  near(RALLYHALL.hall.roof.y0 + RALLYHALL.hall.roof.t, RALLYHALL.h, 1e-9, 'the roof top is the hall height');
});

test('carParts_ExtentsMatchTheCar_FourWheelsOnTheFloor_ARearWing', () => {
  for (const car of RALLYHALL.cars) {
    const parts = carParts(car, RALLYHALL), e = carExtent(parts);
    near(e.len, car.len, 0.05, `${car.id} len`); near(e.wid, car.wid, 0.05, `${car.id} wid`); near(e.hgt, car.hgt, 0.05, `${car.id} hgt`); near(e.minY, 0, 1e-9, 'tyres touch y = 0');
    const wheels = parts.filter(p => p.kind === 'wheel' && p.colour === RALLYHALL.colours.tyre);
    assert.equal(wheels.length, 4); for (const w of wheels) { near(w.r, car.wheelR, 1e-9); near(w.y, car.wheelR, 1e-9); near(Math.abs(w.x), car.wheelbase / 2, 1e-9); }
    assert.equal(new Set(wheels.map(w => `${Math.sign(w.x)},${Math.sign(w.z)}`)).size, 4, 'one wheel per corner');
    for (const b of parts.filter(p => p.kind === 'box')) assert.ok(b.y - b.sy / 2 >= 0.05 - 1e-9, `a ${b.colour} box is off the floor`);
    assert.ok(parts.some(p => p.kind === 'box' && p.x < -car.len / 2 + 0.6 && p.y > 0.9 && p.sz > 0.8 * car.wid), 'a rear wing');
  }
});

test('carParts_PlainPaintOnly_NoSponsorColoursNoThirdColour', () => {
  const C = RALLYHALL.colours;
  for (const car of RALLYHALL.cars) {
    const allowed = new Set([car.colour, C.glass, C.dark, C.tyre, C.rim]);
    for (const p of carParts(car, RALLYHALL)) assert.ok(allowed.has(p.colour), `${car.id}: unexpected colour ${p.colour.toString(16)}`);
  }
  assert.equal(new Set(RALLYHALL.cars.map(c => c.colour)).size, 3, 'three different paints');
});
