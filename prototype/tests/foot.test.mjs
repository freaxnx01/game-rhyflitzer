import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALKER, footInput, stepFoot, footFloor, footLook, exitSpots, parkedBox, carReach, footKeyAction, footSteps, STEP_STRIDE } from '../foot.js';
import { footView } from '../camera.js';
import { colliderPush } from '../world.js';
import { translate } from '../strings.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const IDLE = { fwd: 0, side: 0, turn: 0, lift: 0, nitro: 0 };
const flat = (h = 0) => () => h;
const run = (s, input, secs, floorAt = flat()) => { for (let i = 0; i < secs * 60; i++) s = stepFoot(s, input, 1 / 60, floorAt); return s; };
const at = (o) => ({ x: 0, z: 0, y: 0, th: 0, vy: 0, hover: false, ...o });
const box = (o) => ({ x: 0, z: 0, hw: 5, hd: 5, c: 1, s: 0, h: 10, ...o });

test('footInput_Keys_MapToAxes', () => {
  assert.deepEqual(footInput({}), IDLE);
  assert.deepEqual(footInput({ KeyW: true, KeyD: true, ArrowRight: true, Space: true }), { fwd: 1, side: 1, turn: 1, lift: 1, nitro: 0 });
  assert.deepEqual(footInput({ ArrowDown: true, KeyA: true, ArrowLeft: true, ShiftLeft: true }), { fwd: -1, side: -1, turn: -1, lift: -1, nitro: 0 });
  assert.equal(footInput({ ArrowUp: true }).fwd, 1);
  assert.equal(footInput({ ShiftRight: true }).lift, -1);
  assert.equal(footInput({ KeyN: true, ControlLeft: true }).fwd, 0, 'N and handbrake do not walk by themselves');
  assert.equal(footInput({ KeyN: true }).nitro, 1);
});

test('stepFoot_WalkForward_MovesAtWalkSpeedAlongHeading', () => {
  const s = run(at({ th: Math.PI / 2 }), { ...IDLE, fwd: 1 }, 2);
  close(s.x, 0, 1e-6); close(s.z, 2 * WALKER.walk, 1e-6); close(s.y, 0, 1e-9);
});

test('stepFoot_ForwardPlusSidestep_IsNotFaster', () => {
  const s = run(at(), { ...IDLE, fwd: 1, side: 1 }, 1);
  close(Math.hypot(s.x, s.z), WALKER.walk, 1e-6);
  assert.ok(s.z > 0, 'D sidesteps to the right (+z when facing +x)');
});

test('stepFoot_TurnKeys_ChangeHeading', () => {
  const s = run(at(), { ...IDLE, turn: 1 }, 1);
  close(s.th, WALKER.turnRate, 1e-6);
});

test('stepFoot_WalkInAir_FallsOntoTheFloor', () => {
  const mid = run(at({ y: 10 }), IDLE, 0.3);
  assert.ok(mid.y < 10 && mid.y > 0, `falling ${mid.y}`);
  const s = run(at({ y: 10 }), IDLE, 3);
  close(s.y, 0, 1e-9); assert.equal(s.vy, 0);
});

test('stepFoot_WalkStepWithinStepUp_SnapsOntoIt', () => {
  const s = run(at(), { ...IDLE, fwd: 1 }, 1, (x) => (x > 2 ? 0.4 : 0));
  close(s.y, 0.4, 1e-9);
});

test('stepFoot_SpaceOnGround_Jumps_ButNotInMidAir', () => {
  const up = run(at(), { ...IDLE, lift: 1 }, 0.1);
  assert.ok(up.y > 0.3, `jumped ${up.y}`);
  const apex = run(at(), { ...IDLE, lift: 1 }, 0.27);
  assert.ok(apex.y < WALKER.jumpV ** 2 / (2 * WALKER.gravity) + 0.05, `no double jump ${apex.y}`);
});

test('stepFoot_Hover_SpaceClimbsShiftSinksNeverBelowFloor', () => {
  const up = run(at({ hover: true }), { ...IDLE, lift: 1 }, 2);
  close(up.y, 2 * WALKER.climb, 1e-6);
  const stay = run(up, IDLE, 2);
  close(stay.y, up.y, 1e-9, 'hover holds the height without input');
  const down = run(up, { ...IDLE, lift: -1 }, 10);
  close(down.y, 0, 1e-9);
  const fast = run(at({ hover: true }), { ...IDLE, fwd: 1 }, 1);
  close(fast.x, WALKER.hover, 1e-6);
});

test('footFloor_BoxTopWithinStepUp_IsTheFloor', () => {
  assert.equal(footFloor(0, [box({ h: 0.5 })], 0, 0, 0), 0.5);
  assert.equal(footFloor(0, [box({ h: 10 })], 0, 0, 10.2), 10, 'standing on a roof');
  assert.equal(footFloor(0, [box({ h: 10 })], 0, 0, 0), 0, 'a wall above you is not a floor');
  assert.equal(footFloor(0, [box({ h: 10 })], 20, 0, 11), 0, 'outside the footprint');
  assert.equal(footFloor(0, [box({ h: 1, circle: 1 })], 0.5, 0, 1), 1, 'circle colliders');
  assert.equal(footFloor(0, [box({ h: 1, circle: 1 })], 1.5, 0, 1), 0);
});

test('footFloor_Bridge_Ignored', () => {
  assert.equal(footFloor(25, [box({ h: 2, bridge: true })], 0, 0, 25), 25);
});

test('footLook_MouseRightTurnsRight_UpLooksUp_PitchClamped', () => {
  const l = footLook(0, 0, 100, -100);
  close(l.th, 100 * WALKER.mouse, 1e-9); close(l.pitch, 100 * WALKER.mouse, 1e-9);
  assert.equal(footLook(0, 0, 0, -1e6).pitch, WALKER.pitchMax);
  assert.equal(footLook(0, 0, 0, 1e6).pitch, -WALKER.pitchMax);
});

test('exitSpots_LeftFirst_ThenRightBehindFront_ClearOfTheCar', () => {
  const car = { x: 0, z: 0, th: 0 }, size = { l: 4, w: 2 }, [left, right, behind, front] = exitSpots(car, size);
  const side = 1 + WALKER.radius + WALKER.exitGap, end = 2 + WALKER.radius + WALKER.exitGap;
  close(left.x, 0, 1e-9); close(left.z, -side, 1e-9, 'left of a car facing +x is -z');
  close(right.z, side, 1e-9); close(behind.x, -end, 1e-9); close(front.x, end, 1e-9);
});

test('parkedBox_AndCarReach_MeasureToTheBody', () => {
  const b = parkedBox({ x: 10, z: 0, y: 3, th: 0 }, { l: 4, w: 2, h: 1.5 });
  assert.deepEqual(b, { x: 10, z: 0, hw: 2, hd: 1, c: 1, s: 0, h: 4.5, parked: true });
  assert.equal(carReach(10, 0, b), 0);
  close(carReach(10, 3, b), 2, 1e-9);
  close(carReach(15, 0, b), 3, 1e-9);
});

test('footKeyAction_FTogglesHover_CarKeysBlocked_RestPass', () => {
  assert.equal(footKeyAction('KeyF'), 'hover');
  for (const k of ['KeyC', 'KeyO', 'KeyI', 'KeyU', 'KeyH', 'Enter', 'NumpadEnter', 'KeyQ', 'KeyL', 'Digit1', 'KeyV']) assert.equal(footKeyAction(k), 'block', k);
  for (const k of ['KeyR', 'KeyJ', 'KeyM', 'KeyT', 'KeyX', 'KeyG', 'KeyK', 'Tab', 'Space', 'KeyW', 'F1', 'F3', 'Escape']) assert.equal(footKeyAction(k), 'pass', k);
});

// #409: E enters a building on foot (the register decides whether one is near); in the car E stays the right blinker
test('footKeyAction_KeyE_IsEnter', () => {
  assert.equal(footKeyAction('KeyE'), 'enter');
});

// #474: indoors B takes the walker straight out in front of the entrance; outside it does nothing
test('footKeyAction_KeyB_LeavesOnlyIndoors', () => {
  assert.equal(footKeyAction('KeyB', true), 'leave');
  assert.equal(footKeyAction('KeyB', false), 'pass');
});

test('footKeyAction_OtherCarKeys_StayBlocked', () => {
  for (const k of ['KeyQ', 'KeyH', 'Enter', 'Digit1']) assert.equal(footKeyAction(k), 'block', k);
});

test('footView_EyeHeightAndPitch', () => {
  const v = footView(1, 2, 3, 0, 0, 1.7);
  assert.deepEqual(v.eye, [1, 3.7, 3]);
  close(v.at[0], 11, 1e-9); close(v.at[1], 3.7, 1e-9); close(v.at[2], 3, 1e-9);
  const up = footView(0, 0, 0, Math.PI / 2, 0.5, 1.7);
  assert.ok(up.at[1] > 1.7, 'positive pitch looks up'); assert.ok(up.at[2] > 0, 'heading pi/2 looks +z');
});

test('colliderPush_Obb_PushesOutAlongTheNearestFace', () => {
  const o = { x: 0, z: 0, hw: 5, hd: 2, c: 1, s: 0, h: 10 };
  assert.equal(colliderPush(o, 10, 0, 0.5), null);
  const hit = colliderPush(o, 5.2, 0, 0.5);
  close(hit.wx, 1, 1e-9); close(hit.wz, 0, 1e-9); close(hit.pen, 0.3, 1e-9);
  const deep = colliderPush(o, 0, 1.5, 0.5);   // centre inside: out through the closer face (z)
  close(deep.wz, 1, 1e-9); close(deep.pen, 1, 1e-9);
});

test('colliderPush_RotatedObb_NormalInWorldFrame', () => {
  const o = { x: 0, z: 0, hw: 5, hd: 2, c: 0, s: 1, h: 10 };   // heading +z: hw runs along z
  const hit = colliderPush(o, 0, 5.2, 0.5);
  close(hit.wx, 0, 1e-9); close(hit.wz, 1, 1e-9); close(hit.pen, 0.3, 1e-9);
});

test('colliderPush_Circle', () => {
  const o = { x: 0, z: 0, hw: 1, hd: 1, c: 1, s: 0, h: 10, circle: 1 };
  assert.equal(colliderPush(o, 2, 0, 0.5), null);
  const hit = colliderPush(o, 0, 1.2, 0.5);
  close(hit.wz, 1, 1e-9); close(hit.pen, 0.3, 1e-9);
});

test('colliderPush_Ring_DelegatesToRingPush', () => {
  const ring = [[-5, -5], [5, -5], [5, 5], [-5, 5]], o = { x: 0, z: 0, hw: 5, hd: 5, c: 1, s: 0, h: 10, ring };
  assert.equal(colliderPush(o, 8, 0, 0.5), null);
  const hit = colliderPush(o, 5.2, 0, 0.5);
  close(hit.wx, 1, 1e-6); close(hit.pen, 0.3, 1e-6);
});

test('footStrings_BothLanguages_SwissGerman', () => {
  const keys = ['footOut', 'footIn', 'footHover', 'footWalk', 'footStopFirst', 'footNoRoom', 'footTooFar', 'notCountedFoot', 'keyFoot'];
  for (const k of keys) {
    const en = translate('en', k), de = translate('de', k);
    assert.ok(en && en !== k, `en ${k}`); assert.ok(de && de !== k && de !== en, `de ${k}`);
    assert.ok(!de.includes('ß'), `de ${k} uses ss`);
  }
  assert.match(translate('en', 'footOut'), /Z/); assert.match(translate('de', 'footOut'), /Zu Fuss/);
});

// #404: N held on foot doubles the horizontal speed (walk 4.5 -> 9, hover 11 -> 22); climb and sink stay as they are
test('stepFoot_WalkWithNitro_IsTwiceAsFast', () => {
  const s = run(at(), { ...IDLE, fwd: 1, nitro: 1 }, 2);
  close(s.x, 2 * 2 * WALKER.walk, 1e-6);
  assert.equal(WALKER.nitro, 2);
});

test('stepFoot_HoverWithNitro_IsTwiceAsFastButClimbsAsBefore', () => {
  const s = run(at({ hover: true, y: 20 }), { ...IDLE, fwd: 1, lift: 1, nitro: 1 }, 1, flat(0));
  close(s.x, 2 * WALKER.hover, 1e-6); close(s.y, 20 + WALKER.climb, 1e-6);
});

test('stepFoot_NitroWithoutMovement_DoesNothing', () => {
  const s = run(at(), { ...IDLE, nitro: 1 }, 1);
  close(s.x, 0, 1e-9); close(s.z, 0, 1e-9);
});

test('stepFoot_DiagonalWithNitro_IsNotFasterThanStraight', () => {
  const s = run(at(), { ...IDLE, fwd: 1, side: 1, nitro: 1 }, 1);
  close(Math.hypot(s.x, s.z), 2 * WALKER.walk, 1e-6);
});

test('keyFoot_MentionsNitro_InBothLanguages', () => {
  assert.match(translate('en', 'keyFoot'), /N \(hold\)/);
  assert.match(translate('de', 'keyFoot'), /N \(halten\)/);
});

test('footView_Back_LooksOverTheShoulderWithTheSamePitch', () => {
  const f = footView(0, 0, 0, 0, 0.5, 1.7), b = footView(0, 0, 0, 0, 0.5, 1.7, true);
  close(b.at[0], -f.at[0], 1e-9); close(b.at[2], f.at[2], 1e-9); close(b.at[1], f.at[1], 1e-9);
  assert.deepEqual(b.eye, f.eye);
});

test('footKeyAction_KeyB_PassesThrough', () => {
  assert.equal(footKeyAction('KeyB'), 'pass');
});

test('footSteps: one step per stride walked, the remainder carries over', () => {
  assert.deepEqual(footSteps(0, 1, false, true), { acc: 1, steps: 0 });
  const r = footSteps(1, 1.5, false, true);
  assert.equal(r.steps, 1); assert.ok(Math.abs(r.acc - 0.5) < 1e-9);
  const total = Array.from({ length: 100 }, () => 0.1).reduce((st, d) => { const r = footSteps(st.acc, d, false, true); return { acc: r.acc, steps: st.steps + r.steps }; }, { acc: 0, steps: 0 });
  assert.equal(total.steps, 5);   // 10 m / 2 m
});

test('footSteps: nitro strides longer but at double speed still steps faster per second', () => {
  assert.ok(STEP_STRIDE.nitro > STEP_STRIDE.walk);
  assert.ok(2 / STEP_STRIDE.nitro > 1 / STEP_STRIDE.walk);
  assert.equal(footSteps(0, STEP_STRIDE.walk, true, true).steps, 0);
  assert.equal(footSteps(0, STEP_STRIDE.nitro, true, true).steps, 1);
});

test('footSteps: silent while airborne or hovering, standing still and a bad distance make no step', () => {
  assert.deepEqual(footSteps(1.5, 10, false, false), { acc: 0, steps: 0 });
  assert.deepEqual(footSteps(1.5, 0, false, true), { acc: 1.5, steps: 0 });
  assert.deepEqual(footSteps(1.5, NaN, false, true), { acc: 1.5, steps: 0 });
});

// #412: the walkway surfaces under the walker (a slab or stair ramp inside a building) are a second floor source next to
// the ground and the world's boxes; and indoors hover is blocked -- no flying through the storeys
test('footFloor_WalkwayAboveTheGround_IsTheFloorWhenWithinStepUp', () => {
  assert.equal(footFloor(0, [], 0, 0, 5, WALKER, 5), 5);
  assert.equal(footFloor(0, [], 0, 0, 5, WALKER, null), 0, 'no walkway under you: the ground');
  assert.equal(footFloor(8, [], 0, 0, 5, WALKER, 5), 8, 'a ground above the walkway still wins');
  assert.equal(footFloor(0, [box({ h: 1 })], 0, 0, 0.5, WALKER, 3), 3, 'the highest of the three sources');
});

test('footKeyAction_HoverIndoors_IsBlockedAndOutdoorsStaysAsBefore', () => {
  assert.equal(footKeyAction('KeyF'), 'hover');
  assert.equal(footKeyAction('KeyF', false), 'hover');
  assert.equal(footKeyAction('KeyF', true), 'block');
  assert.equal(footKeyAction('KeyC', true), 'block', 'C does nothing on foot: the view is first person already');
  assert.equal(footKeyAction('KeyW', true), 'pass');
  assert.equal(footKeyAction('KeyE', true), 'enter');
});
