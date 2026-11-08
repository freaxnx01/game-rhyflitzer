import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELI, heliInput, heliFloor, heliStart, stepHeli, landingSpot, heliAltitude, heliBob, heliLoad, heliChaseFrom, heliChaseStep } from '../heli.js';

const IDLE = { fwd: 0, yaw: 0, lift: 0, nitro: 0 };
const NO_TOUCH = { l: 0, r: 0, g: 0, b: 0, h: 0 };
const run = (s, input, secs, ground = 0, floor = ground + HELI.clearance) => { for (let i = 0; i < secs * 60; i++) s = stepHeli(s, input, 1 / 60, ground, floor); return s; };
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const at = (y, th = 0) => ({ x: 0, z: 0, y, th, v: 0, vy: 0, pitch: 0, roll: 0, assist: null });
const MOVING = (v, y = 50) => ({ ...at(y), v });
const box = (o) => ({ x: 0, z: 0, hw: 5, hd: 5, c: 1, s: 0, h: 30, ...o });

test('HELI: the agreed flight constants', () => {
  assert.deepEqual(HELI, { takeoffAgl: 120, clearance: 3, maxAgl: 400, top: 40, topNitro: 60, back: 10, accel: 20, accelNitro: 30, drag: 1.8,
    rest: 0.05, yawRate: 1.2, climb: 16, climbAccel: 22, climbDrag: 3.5, assistStop: 5, pitchMax: 0.24, rollMax: 0.28, tiltRate: 5,
    bobAmp: 0.18, bobRate: 2.6, rotorMargin: 8, landRadius: 150, camDist: 16, camH: 6, camAhead: 8, camUp: 2, camRate: 8.5, camSpeedRate: 3 });
});

test('HELI: the rotor margin covers the gunship model (nose 3.9 m, tail rotor 7.85 m, blades 6 m) and nitro is faster -- #99', () => {
  assert.ok(HELI.rotorMargin >= 7.85);
  assert.ok(HELI.topNitro > HELI.top && HELI.accelNitro > HELI.accel);
});

test('landingSpot: the nearest road counts only within landRadius -- review of #84', () => {
  const road = (d) => ({ d, x: 1, z: 2, th: 0 });
  assert.deepEqual(landingSpot(road(0)), road(0));
  assert.deepEqual(landingSpot(road(HELI.landRadius)), road(HELI.landRadius));
  assert.equal(landingSpot(road(HELI.landRadius + 0.1)), null);
  assert.equal(landingSpot(null), null);
});

test('heliInput: W/S and arrows fly, A/D and arrows yaw, Space climbs, Shift sinks, touch buttons too', () => {
  assert.deepEqual(heliInput({}, NO_TOUCH), IDLE);
  assert.deepEqual(heliInput({ KeyW: true, KeyD: true, Space: true }, NO_TOUCH), { fwd: 1, yaw: 1, lift: 1, nitro: 0 });
  assert.deepEqual(heliInput({ ArrowDown: true, ArrowLeft: true, ShiftRight: true }, NO_TOUCH), { fwd: -1, yaw: -1, lift: -1, nitro: 0 });
  assert.deepEqual(heliInput({ ArrowUp: true, ArrowRight: true, ShiftLeft: true }, NO_TOUCH), { fwd: 1, yaw: 1, lift: -1, nitro: 0 });
  assert.deepEqual(heliInput({ KeyW: true, KeyS: true, KeyA: true, KeyD: true, Space: true, ShiftLeft: true }, NO_TOUCH), IDLE);
  assert.deepEqual(heliInput({ KeyW: false }, { ...NO_TOUCH, g: 1, l: 1 }), { fwd: 1, yaw: -1, lift: 0, nitro: 0 });
  assert.deepEqual(heliInput({}, { ...NO_TOUCH, b: 1, r: 1 }), { fwd: -1, yaw: 1, lift: 0, nitro: 0 });
  assert.deepEqual(heliInput({ KeyN: true }, NO_TOUCH), { fwd: 1, yaw: 0, lift: 0, nitro: 1 });            // N alone flies forward, like gas
  assert.deepEqual(heliInput({ KeyN: true, KeyS: true }, NO_TOUCH), { fwd: 0, yaw: 0, lift: 0, nitro: 1 });
});

test('heliStart: where the car is, standing, with the take-off climb armed', () => {
  assert.deepEqual(heliStart(10, -20, 3, 1.5, 3), { x: 10, z: -20, y: 3, th: 1.5, v: 0, vy: 0, pitch: 0, roll: 0, assist: 3 + HELI.takeoffAgl });
});

test('stepHeli: from take-off it climbs by itself to about takeoffAgl and hovers there', () => {
  const s = run(heliStart(0, 0, 0, 0, 0), IDLE, 12);
  assert.ok(s.y > HELI.takeoffAgl - 10 && s.y < HELI.takeoffAgl + 5, String(s.y));
  assert.equal(s.assist, null); assert.equal(s.x, 0); assert.equal(s.v, 0); assert.ok(Math.abs(s.vy) < 0.05, String(s.vy));
});

test('stepHeli: any Space or Shift press cancels the take-off assist', () => {
  const s = run(heliStart(0, 0, 0, 0, 0), { ...IDLE, lift: -1 }, 0.5);
  assert.equal(s.assist, null);
});

test('stepHeli: W reaches top speed in 2.5 s and never goes beyond', () => {
  close(run(at(50), { ...IDLE, fwd: 1 }, 2.5).v, HELI.top, 1e-9, '2.5 s');
  close(run(at(50), { ...IDLE, fwd: 1 }, 8).v, HELI.top, 1e-9, '8 s');
});

test('stepHeli: letting go of W brakes exponentially: under 4 m/s after 1.5 s, never negative, ends at rest -- slop-newyork feel', () => {
  let s = MOVING(HELI.top), prev = s.v;
  for (let i = 0; i < 90; i++) { s = stepHeli(s, IDLE, 1 / 60, 0, 10); assert.ok(s.v < prev && s.v >= 0); prev = s.v; }
  assert.ok(s.v < 4, String(s.v));
  assert.equal(run(MOVING(HELI.top), IDLE, 6).v, 0);
});

test('stepHeli: S flies slowly backwards', () => {
  close(run(at(50), { ...IDLE, fwd: -1 }, 3).v, -HELI.back, 1e-9, 'v');
});

test('stepHeli: D yaws right (heading grows) at yawRate, A left', () => {
  close(run(at(50), { ...IDLE, yaw: 1 }, 1).th, HELI.yawRate, 1e-9, 'D');
  close(run(at(50), { ...IDLE, yaw: -1 }, 1).th, -HELI.yawRate, 1e-9, 'A');
});

test('stepHeli: Space accelerates the climb to climb m/s and not beyond; letting go stops it within a second', () => {
  let s = run(at(50), { ...IDLE, lift: 1 }, 2);
  close(s.vy, HELI.climb, 1e-9, 'vy');
  s = run(s, IDLE, 1); assert.ok(Math.abs(s.vy) < 0.5, String(s.vy));
});

test('stepHeli: Shift sinks, but never below the floor, and rests there', () => {
  const s = run(at(100), { ...IDLE, lift: -1 }, 20, 0, 30);
  close(s.y, 30, 1e-9, 'y'); assert.ok(s.vy >= 0);
});

test('stepHeli: the ceiling stops the climb and zeroes vy (maxAgl by default, the room passes its own)', () => {
  close(run(at(50), { ...IDLE, lift: 1 }, 60, 5).y, 5 + HELI.maxAgl, 1e-9, 'maxAgl');
  let s = at(50);
  for (let i = 0; i < 600; i++) s = stepHeli(s, { ...IDLE, lift: 1 }, 1 / 60, 0, 10, HELI, 70);
  assert.equal(s.y, 70); assert.ok(s.vy <= 0);
});

test('stepHeli: a floor above the helicopter lifts it at once (a tall building ahead)', () => {
  const s = stepHeli(at(20), IDLE, 1 / 60, 0, 45);
  assert.equal(s.y, 45);
});

test('stepHeli: pitch is nose down flying forward, nose up backing, bounded by pitchMax, settled within a second', () => {
  const f = run(at(50), { ...IDLE, fwd: 1 }, 4), b = run(at(50), { ...IDLE, fwd: -1 }, 4);
  assert.ok(f.pitch > 0.9 * HELI.pitchMax && f.pitch <= HELI.pitchMax + 1e-9, String(f.pitch));
  assert.ok(b.pitch < 0 && b.pitch >= -HELI.pitchMax, String(b.pitch));
  assert.ok(Math.abs(run(f, IDLE, 5).pitch) < 0.01);
});

test('stepHeli: roll banks into the turn (D positive, A negative), bounded by rollMax, levels out when released', () => {
  const r = run(at(50), { ...IDLE, yaw: 1 }, 1), l = run(at(50), { ...IDLE, yaw: -1 }, 1);
  assert.ok(r.roll > 0.9 * HELI.rollMax && r.roll <= HELI.rollMax + 1e-9, String(r.roll));
  assert.ok(l.roll < 0 && l.roll >= -HELI.rollMax);
  assert.ok(Math.abs(run(r, IDLE, 2).roll) < 0.01);
});

test('stepHeli: it returns a new state and leaves the old one alone', () => {
  const s = at(50); const n = stepHeli(s, { fwd: 1, yaw: 1, lift: 1 }, 1 / 60, 0, 10);
  assert.deepEqual(s, at(50)); assert.notEqual(n, s);
});

test('stepHeli: N raises the top speed to topNitro at accelNitro; letting go falls back to top -- #99', () => {
  let s = run(at(50), { ...IDLE, fwd: 1, nitro: 1 }, 6);
  close(s.v, HELI.topNitro, 1e-9, 'nitro top');
  close(stepHeli(at(50), { ...IDLE, fwd: 1, nitro: 1 }, 1, 0, 10).v, HELI.accelNitro, 1e-9, 'one second of nitro from rest');
  s = run(s, { ...IDLE, fwd: 1 }, 3); close(s.v, HELI.top, 1e-9, 'back to top');
  s = run(s, heliInput({ KeyN: true }, NO_TOUCH), 3); close(s.v, HELI.topNitro, 1e-9, 'N alone');
  close(run(at(50), heliInput({ KeyN: true, KeyS: true }, NO_TOUCH), 3).v, 0, 1e-9, 'S + N hover');
});

test('heliFloor: ground plus clearance with nothing around', () => {
  assert.equal(heliFloor(7, [], 0, 0), 7 + HELI.clearance);
});

test('heliFloor: the top of a box under the rotor counts; bridges and boxes further away do not', () => {
  assert.equal(heliFloor(2, [box()], 0, 0), 30 + HELI.clearance);
  assert.equal(heliFloor(2, [box()], 5 + HELI.rotorMargin - 0.1, 0), 30 + HELI.clearance);
  assert.equal(heliFloor(2, [box()], 5 + HELI.rotorMargin + 0.1, 0), 2 + HELI.clearance);
  assert.equal(heliFloor(2, [box({ bridge: true })], 0, 0), 2 + HELI.clearance);
  assert.equal(heliFloor(40, [box()], 0, 0), 40 + HELI.clearance);   // ground above a low box wins
  assert.equal(heliFloor(2, [box(), box({ h: 55 })], 0, 0), 55 + HELI.clearance);   // the highest box wins
});

test('heliFloor: rotated boxes are tested in their own frame', () => {
  const r = box({ hw: 20, hd: 2, c: Math.cos(Math.PI / 2), s: Math.sin(Math.PI / 2) });   // long along z
  assert.equal(heliFloor(0, [r], 0, 15), 30 + HELI.clearance);
  assert.equal(heliFloor(0, [r], 15, 0), HELI.clearance);
});

test('heliBob: a slow, small swing, only ever drawn', () => {
  assert.equal(heliBob(0), 0);
  close(heliBob(Math.PI / 2 / HELI.bobRate), HELI.bobAmp, 1e-12, 'peak');
  for (let t = 0; t < 20; t += 0.1) assert.ok(Math.abs(heliBob(t)) <= HELI.bobAmp + 1e-12);
});

test('heliLoad: hover 0.45, climbing harder, sinking softer, always within 0..1 -- slop-newyork audio-sources.js', () => {
  const hover = heliLoad(0, 0, IDLE);
  close(hover, 0.45, 1e-12, 'hover');
  assert.ok(heliLoad(0, HELI.climb, { ...IDLE, lift: 1 }) > hover + 0.3);
  assert.ok(heliLoad(0, -HELI.climb, { ...IDLE, lift: -1 }) < hover);
  assert.ok(heliLoad(HELI.topNitro, HELI.climb, { fwd: 1, yaw: 0, lift: 1, nitro: 1 }) <= 1);
});

const P0 = { x: 0, y: 100, z: 0 };

test('heliChaseStep: at rest the camera settles camDist behind and camH above, looking camAhead ahead', () => {
  let c = heliChaseFrom({ x: -300, y: 40, z: 90 }, P0, 0);
  for (let i = 0; i < 600; i++) c = heliChaseStep(c, P0, 0, 0, 1 / 60);
  close(c.pos.x, -HELI.camDist, 1e-3, 'x'); close(c.pos.y, P0.y + HELI.camH, 1e-3, 'y'); close(c.pos.z, 0, 1e-3, 'z');
  close(c.look.x, HELI.camAhead, 1e-3, 'look x'); close(c.look.y, P0.y + HELI.camUp, 1e-3, 'look y');
});

test('heliChaseStep: flying straight at constant speed the camera keeps a constant distance (no trailing growth)', () => {
  let c = heliChaseFrom({ x: -20, y: 106, z: 0 }, P0, 0), p = { ...P0 }, last = 0;
  for (let i = 0; i < 60 * 12; i++) { p = { ...p, x: p.x + HELI.top / 60 }; c = heliChaseStep(c, p, 0, HELI.top, 1 / 60); if (i === 60 * 10) last = p.x - c.pos.x; }
  close(p.x - c.pos.x, last, 0.05, 'distance still constant after 10 s');
  assert.ok(last > HELI.camDist && last < HELI.camDist * 2, String(last));   // pulled back with speed, not by lag
});

test('heliChaseStep: the offset swings round behind a turning helicopter', () => {
  let c = heliChaseFrom({ x: -HELI.camDist, y: 106, z: 0 }, P0, 0);
  for (let i = 0; i < 300; i++) c = heliChaseStep(c, P0, Math.PI / 2, 0, 1 / 60);
  close(c.pos.x, 0, 1e-3, 'x'); close(c.pos.z, -HELI.camDist, 1e-3, 'z');
});

test('heliAltitude: metres above the ground, and above sea level only with a datum -- #99', () => {
  assert.deepEqual(heliAltitude(130.4, 10.2, 284), { agl: 120, asl: 414 });
  assert.deepEqual(heliAltitude(130.4, 10.2, undefined), { agl: 120, asl: null });
  assert.deepEqual(heliAltitude(130.4, 10.2, null), { agl: 120, asl: null });
  assert.deepEqual(heliAltitude(130.4, 10.2, NaN), { agl: 120, asl: null });
  assert.deepEqual(heliAltitude(5, 5, 284), { agl: 0, asl: 289 });
});
