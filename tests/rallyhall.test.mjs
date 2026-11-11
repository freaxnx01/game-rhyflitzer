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

import { rallyhallPlacement } from '../rallyhall.js';

const room = { centre: [1000, -2000], frame: { f: [0, 1], v: [-1, 0] }, y: -600 };   // the far wall lies along +z; v = f turned +90°
const loc = (a, b) => [room.centre[0] + room.frame.f[0] * a + room.frame.v[0] * b, room.centre[1] + room.frame.f[1] * a + room.frame.v[1] * b];
const inside = (o, x, z, r = 0) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw + r && Math.abs(lz) <= o.hd + r; };

test('rallyhallPlacement_HallAtTheCentre_CarsOnTheirPodiumsNosesToTheOpenFront', () => {
  const P = rallyhallPlacement(room, RALLYHALL), th = Math.atan2(room.frame.f[1], room.frame.f[0]);
  assert.deepEqual([P.hall.x, P.hall.z], room.centre); near(P.hall.th, th, 1e-9);
  assert.equal(P.cars.length, 3);
  RALLYHALL.cars.forEach((c, i) => {
    assert.equal(P.cars[i].id, c.id); assert.deepEqual([P.cars[i].x, P.cars[i].z], loc(...c.at)); near(P.cars[i].th, th + c.th, 1e-9);
    assert.ok(Math.cos(c.th) < 0, `${c.id}: nose towards the portal side (-a)`);
  });
});

test('rallyhallPlacement_NineColliders_AllLow_WallsToTheRoofTop_RoofIsABridge_CarsSolidAbove2m4', () => {
  const P = rallyhallPlacement(room, RALLYHALL), Y = room.y;
  assert.equal(P.colliders.length, 9); assert.ok(P.colliders.every(o => o.low === true && Number.isFinite(o.x) && o.hw > 0 && o.hd > 0));
  const bridges = P.colliders.filter(o => o.bridge); assert.equal(bridges.length, 1);
  near(bridges[0].y0, Y + 14.0, 1e-9, 'roof deck'); near(bridges[0].h, Y + 14.8, 1e-9, 'roof top');
  const solid = P.colliders.filter(o => !o.bridge && o.h >= Y + 14.8 - 1e-9); assert.equal(solid.length, 5, 'back wall, two side walls, two posts');
  const cars = P.colliders.filter(o => !o.bridge && o.h < Y + 14); assert.equal(cars.length, 3); for (const o of cars) assert.ok(o.h >= Y + 2.4);
});

test('rallyhallPlacement_BlocksTheCarAtWallsPostsAndPodiums_LeavesFloorUnderRoofApronAndLoopFree', () => {
  const P = rallyhallPlacement(room, RALLYHALL), CAR_R = 2.6;
  const blocked = (a, b, r = CAR_R) => P.colliders.some(o => !o.bridge && inside(o, ...loc(a, b), r));
  for (const [a, b] of [[19.7, 0], [0, 35.7], [0, -35.7], [-19.5, 35.5], [-19.5, -35.5], [4, -22], [4, 0], [4, 22]]) assert.ok(blocked(a, b, 0), `solid at ${a},${b}`);
  for (const [a, b] of [[-5, -11], [-5, 11], [4, -11], [4, 11], [12, 0], [-22, 0], [-23, 20], [-95, 0], [0, -95], [95, 0]]) assert.ok(!blocked(a, b), `free at ${a},${b}`);
  const [from, to] = P.apron; assert.deepEqual(from, loc(-95, 0)); assert.deepEqual(to, loc(-24, 0));
});
