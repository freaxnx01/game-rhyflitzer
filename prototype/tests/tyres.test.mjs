// #416: tyre stacks -- the pure helpers, then the physics core driven by the vendored engine in node. node --test prototype/tests/tyres.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../vendor/crashcat/crashcat.min.js';
import { TYRE, PHYS, rowPlacements, pyramidPlacements, tyreSlots, fixedSteps, carBox, slowdown, tyreProfile, createTyrePhysics, createTyreStacks } from '../tyres.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('rowPlacements_ThreeStacksAlongYaw_AreCentredAndEvenlySpaced', () => {
  const r = rowPlacements(10, 20, 0, [5, 6, 7], 1); assert.equal(r.length, 3);
  near(r[0].x, 9); near(r[1].x, 10); near(r[2].x, 11); assert.ok(r.every(p => p.z === 20)); assert.deepEqual(r.map(p => p.n), [5, 6, 7]);
});

test('pyramidPlacements_Default_StacksAreFiveToEightTyresAndDoNotOverlap', () => {
  const p = pyramidPlacements(0, 0, 0.7);
  assert.ok(p.length >= 6 && p.every(s => s.n >= 5 && s.n <= 8));
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) assert.ok(Math.hypot(p[i].x - p[j].x, p[i].z - p[j].z) > TYRE.r * 2, `stacks ${i},${j} overlap`);
});

test('tyreSlots_OneStack_StartsOnTheGroundAndEachTyreSitsOnTheLast', () => {
  const s = tyreSlots([{ x: 1, z: 2, n: 3 }], 10);
  assert.equal(s.length, 3); assert.ok(s[0].y > 10 + TYRE.w / 2 - 1e-9 && s[0].y < 10 + TYRE.w / 2 + 0.01);
  assert.ok(s[1].y - s[0].y > TYRE.w && s[1].y - s[0].y < TYRE.w + 0.01); assert.ok(s.every(t => t.x === 1 && t.z === 2));
});

test('tyreSlots_SillyHeights_AreClamped', () => {
  assert.equal(tyreSlots([{ x: 0, z: 0, n: 99 }], 0).length, 12); assert.equal(tyreSlots([{ x: 0, z: 0, n: 0 }], 0).length, 1);
});

test('fixedSteps_ShortFrame_CarriesTheRemainder', () => {
  const a = fixedSteps(0, 0.01, 1 / 60, 4); assert.equal(a.n, 0); const b = fixedSteps(a.acc, 0.01, 1 / 60, 4); assert.equal(b.n, 1); near(b.acc, 0.02 - 1 / 60, 1e-9);
});

test('fixedSteps_LongFrame_IsCappedAndTheRestDropped', () => {
  const r = fixedSteps(0, 1, 1 / 60, 4); assert.equal(r.n, 4); assert.ok(r.acc < 1 / 60);
});

test('carBox_HeadingZero_PointsLongSideAlongPlusX', () => {
  const b = carBox({ x: 1, y: 2, z: 3, th: 0, l: 4, w: 2, h: 1.4 }); b.q.forEach((v, i) => near(v, [0, 0, 0, 1][i])); near(b.hx, 2); near(b.hz, 1); near(b.y, 2 + PHYS.carLift + b.hy);
});

test('carBox_HeadingQuarterTurn_RotatesPlusXOntoPlusZ', () => {
  const b = carBox({ x: 0, y: 0, z: 0, th: Math.PI / 2, l: 4, w: 2, h: 1.4 }), [, y, , w] = b.q, ang = 2 * Math.atan2(y, w);
  near(ang, -Math.PI / 2, 1e-9);   // rotating about +y by -90 degrees takes +x to +z
});

test('slowdown_NothingGained_IsZeroAndTheCapHolds', () => {
  assert.equal(slowdown(0, 14), 0); assert.equal(slowdown(500, 0.1), 0); assert.equal(slowdown(1e9, 14), PHYS.slowCap);
  assert.ok(slowdown(100, 14) < PHYS.slowCap);
});

test('tyreProfile_HoleIsGreyRim_AndTreadIsRubber', () => {
  const p = tyreProfile(); assert.ok(p.some(q => q[2] === 1) && p.some(q => q[2] === 0)); assert.ok(p.every(q => q[0] <= TYRE.r + 1e-9));
});

test('createTyreStacks_EngineFailsToLoad_StaysStaticAndNeverThrows', async () => {
  const added = [], scene = { add: o => added.push(o), remove() {} };
  const THREE = fakeThree();
  const t = createTyreStacks(scene, THREE, [{ x: 0, z: 0, n: 5 }], () => 0, { engine: () => Promise.reject(new Error('offline')) });
  await t.ready;
  assert.equal(t.state().engine, 'failed'); assert.equal(t.step(1 / 60, { x: 0, y: 0, z: 0, th: 0, vx: 10, vz: 0, l: 4, w: 2, h: 1.4 }), 0);
  assert.equal(t.state().count, 5); t.reset(); t.dispose();
});

function fakeThree() {
  class V { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } set(x, y, z) { Object.assign(this, { x, y, z }); return this; } }
  class G { constructor() { this.attributes = { position: { count: 8 } }; } setAttribute() {} dispose() {} }
  return {
    Vector2: V, Vector3: V, Quaternion: class { set() { return this; } }, Matrix4: class { compose() { return this; } },
    LatheGeometry: G, BufferAttribute: class {}, DynamicDrawUsage: 1, MeshLambertMaterial: class { dispose() {} },
    Group: class { add() {} }, InstancedMesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.instanceMatrix = { setUsage() {} }; } setMatrixAt() {} dispose() {} },
  };
}

// ---- the engine ----
const CAR = { x: 0, y: 0, z: 0, th: 0, vx: 0, vz: 0, l: 4.2, w: 1.8, h: 1.4 };
const FAR = { ...CAR, x: 900, z: 900 };
const run = (P, secs, car) => { let hits = 0; for (let i = 0; i < secs * 60; i++) { const r = P.step(1 / 60, car); if (r.impact > 0) hits++; } return hits; };

test('createTyrePhysics_FreshStacks_StandUprightAndAsleepAtTheirSlots', () => {
  const P = createTyrePhysics(C, pyramidPlacements(0, 0, 0), 0); const s = P.state();
  assert.equal(s.count, P.count); assert.equal(s.awake, 0); assert.equal(s.displaced, 0); assert.equal(s.upright, s.count);
});

test('step_StacksLeftAloneForSixtySeconds_NeverMoveAtAll', () => {
  const P = createTyrePhysics(C, pyramidPlacements(0, 0, 0), 0); run(P, 60, FAR); const s = P.state();
  assert.equal(s.awake, 0); assert.equal(s.displaced, 0); assert.equal(s.upright, s.count);
});

test('step_CarWithinReachButNotTouching_LeavesTheStacksAsleep', () => {
  const P = createTyrePhysics(C, pyramidPlacements(100, 0, 0), 0); run(P, 5, { ...CAR, x: 85, z: 12 }); assert.equal(P.state().awake, 0);
});

test('step_CarDrivenThroughAt50kmh_KnocksOverMostTyresAndTheyComeToRest', () => {
  const P = createTyrePhysics(C, pyramidPlacements(100, 0, 0), 0), car = { ...CAR, x: 80, vx: 50 / 3.6 };
  let slowed = 0, knocks = 0;
  for (let i = 0; i < 6 * 60; i++) { car.x += car.vx / 60; const r = P.step(1 / 60, car); slowed += r.slow; if (r.impact > 0) knocks++; car.vx *= 1 - r.slow; }
  assert.ok(knocks > 5, `impacts ${knocks}`); assert.ok(car.vx > 50 / 3.6 * 0.8, `the tyres should slow the car only slightly, v=${car.vx}`); assert.ok(slowed > 0);
  Object.assign(car, FAR); run(P, 25, car);
  const s = P.state(); assert.ok(s.displaced > s.count * 0.5, `displaced ${s.displaced} of ${s.count}`); assert.ok(s.upright < s.count * 0.8, `still upright ${s.upright}`);
  assert.equal(s.awake, 0, 'everything comes to rest'); assert.equal(s.far < s.count, true);
});

test('step_CarDrivenThrough_NoTyreFallsThroughTheGround', () => {
  const P = createTyrePhysics(C, pyramidPlacements(100, 0, 0), 5), car = { ...CAR, y: 5, x: 80, vx: 50 / 3.6 }, p = [0, 0, 0], q = [0, 0, 0, 1];
  for (let i = 0; i < 8 * 60; i++) { car.x += car.vx / 60; P.step(1 / 60, car); }
  for (let i = 0; i < P.count; i++) { P.pose(i, p, q); assert.ok(p[1] > 5 + 0.1, `tyre ${i} at y ${p[1]}`); }
});

test('reset_AfterACrash_PutsEveryStackBackUprightAndAsleep', () => {
  const P = createTyrePhysics(C, pyramidPlacements(100, 0, 0), 0), car = { ...CAR, x: 80, vx: 50 / 3.6 };
  for (let i = 0; i < 4 * 60; i++) { car.x += car.vx / 60; P.step(1 / 60, car); }
  assert.ok(P.state().displaced > 0); P.reset(); const s = P.state(); assert.equal(s.displaced, 0); assert.equal(s.upright, s.count); assert.equal(s.awake, 0);
});
