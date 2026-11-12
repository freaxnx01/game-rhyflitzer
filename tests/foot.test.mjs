import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALKER, footInput, stepFoot, footFloor, footLook, exitSpots, parkedBox, carReach, footKeyAction, footSteps, STEP_STRIDE, easeEye, smoothK, easeTo, easeLook, LOOK_EASE, footClickAction } from '../foot.js';
import { footView } from '../camera.js';
import { colliderPush } from '../world.js';
import { translate } from '../strings.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const IDLE = { fwd: 0, side: 0, turn: 0, lift: 0, nitro: 0 };
const flat = (h = 0) => () => h;
const run = (s, input, secs, floorAt = flat()) => { for (let i = 0; i < secs * 60; i++) s = stepFoot(s, input, 1 / 60, floorAt); return s; };
const at = (o) => ({ x: 0, z: 0, y: 0, th: 0, vy: 0, hover: false, ...o });
// #895: speeds ease in, so a test that pins a full-speed number settles first (2 s: within 1e-8 of the target) and
// measures the next second -- the asserted numbers and tolerances are unchanged, only the lead-in is new
const settle = (s, input, floorAt) => run(s, input, 2, floorAt);
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

// #535 phase 2: the phone joystick walks and sidesteps through the same input object the keys fill
test('footInput_Stick_AddsToTheKeys_Clamped', () => {
  assert.deepEqual(footInput({}, { x: 0.5, y: -1 }), { fwd: -1, side: 0.5, turn: 0, lift: 0, nitro: 0 });
  assert.equal(footInput({ KeyW: true }, { x: 0, y: 1 }).fwd, 1);
  assert.deepEqual(footInput({ KeyW: true }), footInput({ KeyW: true }, null));
});

// #895: walking eases in -- settle first, then the next second covers walk metres exactly (same 4.5, same 1e-6)
test('stepFoot_WalkForward_MovesAtWalkSpeedAlongHeading', () => {
  const s0 = settle(at({ th: Math.PI / 2 }), { ...IDLE, fwd: 1 });
  const s = run(s0, { ...IDLE, fwd: 1 }, 1);
  close(s.x, 0, 1e-6); close(s.z - s0.z, WALKER.walk, 1e-6); close(s.y, 0, 1e-9);
});

// #895: the sidestep eases on its own axis -- settled, the diagonal still covers walk metres, not more
test('stepFoot_ForwardPlusSidestep_IsNotFaster', () => {
  const s0 = settle(at(), { ...IDLE, fwd: 1, side: 1 });
  const s = run(s0, { ...IDLE, fwd: 1, side: 1 }, 1);
  close(Math.hypot(s.x - s0.x, s.z - s0.z), WALKER.walk, 1e-6);
  assert.ok(s.z > 0, 'D sidesteps to the right (+z when facing +x)');
});

// #895: the turn rate eases in -- settled it is the full turnRate, and the angle lost to the ramp over the first
// second from rest is the analytic integral of the missing rate
test('stepFoot_TurnKeys_ChangeHeading', () => {
  const settled = settle(at(), { ...IDLE, turn: 1 });
  close(settled.tw, WALKER.turnRate, 1e-6);
  const fromRest = run(at(), { ...IDLE, turn: 1 }, 1);
  close(WALKER.turnRate * 1 - fromRest.th, WALKER.turnRate * WALKER.turnTau * (1 - Math.exp(-1 / WALKER.turnTau)), 1e-6);
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
  // #895: the hover glide eases in too -- settle, then the next second covers hover metres (same 11, same 1e-6)
  const fast0 = settle(at({ hover: true }), { ...IDLE, fwd: 1 });
  const fast = run(fast0, { ...IDLE, fwd: 1 }, 1);
  close(fast.x - fast0.x, WALKER.hover, 1e-6);
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
  for (const k of ['KeyC', 'KeyO', 'KeyI', 'KeyU', 'KeyH', 'Enter', 'NumpadEnter', 'KeyQ', 'KeyL', 'Digit1', 'Digit2', 'KeyV']) assert.equal(footKeyAction(k), 'block', k);
  for (const k of ['KeyR', 'KeyJ', 'KeyM', 'KeyT', 'KeyX', 'KeyG', 'KeyK', 'Tab', 'Space', 'KeyW', 'F1', 'F3', 'Escape']) assert.equal(footKeyAction(k), 'pass', k);
});

// #409/#535: E is the one context key -- outdoors it enters, indoors it leaves; B is only look-back now
test('footKeyAction_KeyE_LeavesIndoors_KeyBNeverLeaves', () => {
  assert.equal(footKeyAction('KeyE', true), 'leave');
  assert.equal(footKeyAction('KeyE', false), 'enter');
  assert.equal(footKeyAction('KeyB', true), 'pass');
  assert.equal(footKeyAction('KeyB', false), 'pass');
});

test('footKeyAction_SignalKeys_BlockedOnFoot', () => {
  for (const k of ['Comma', 'Period', 'KeyQ']) for (const indoors of [false, true]) assert.equal(footKeyAction(k, indoors), 'block', `${k} ${indoors}`);
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

// #404: N held on foot doubles the horizontal speed (walk 4.5 -> 9, hover 11 -> 22); climb and sink stay as they are.
// #895: the eased speed settles first -- the next second still covers twice the walk metres (same 2x, same 1e-6)
test('stepFoot_WalkWithNitro_IsTwiceAsFast', () => {
  const s0 = settle(at(), { ...IDLE, fwd: 1, nitro: 1 });
  const s = run(s0, { ...IDLE, fwd: 1, nitro: 1 }, 1);
  close(s.x - s0.x, 2 * WALKER.walk, 1e-6);
  assert.equal(WALKER.nitro, 2);
});

// #895: settle the horizontal glide only (no lift held: hover holds the height), so the climb assertion keeps its metre
test('stepFoot_HoverWithNitro_IsTwiceAsFastButClimbsAsBefore', () => {
  const s0 = settle(at({ hover: true, y: 20 }), { ...IDLE, fwd: 1, nitro: 1 }, flat(0));
  const s = run(s0, { ...IDLE, fwd: 1, lift: 1, nitro: 1 }, 1, flat(0));
  close(s.x - s0.x, 2 * WALKER.hover, 1e-6); close(s.y, 20 + WALKER.climb, 1e-6);
});

test('stepFoot_NitroWithoutMovement_DoesNothing', () => {
  const s = run(at(), { ...IDLE, nitro: 1 }, 1);
  close(s.x, 0, 1e-9); close(s.z, 0, 1e-9);
});

// #895: the diagonal eases on both local axes -- settled, it still covers nitro speed, not more (same 2x, same 1e-6)
test('stepFoot_DiagonalWithNitro_IsNotFasterThanStraight', () => {
  const s0 = settle(at(), { ...IDLE, fwd: 1, side: 1, nitro: 1 });
  const s = run(s0, { ...IDLE, fwd: 1, side: 1, nitro: 1 }, 1);
  close(Math.hypot(s.x - s0.x, s.z - s0.z), 2 * WALKER.walk, 1e-6);
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
  assert.equal(footKeyAction('KeyE', true), 'leave');
});

// #592: the camera's eye height eases out over a tread snap (stair rise) while the walker's y stays exact
const eyeOf = (st, y) => y + st.off;

test('easeEye_TreadSnapUp_EyeDoesNotJump', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  const before = eyeOf(st, 0);
  st = easeEye(st, 0.16, true, 1 / 60);
  assert.ok(Math.abs(eyeOf(st, 0.16) - before) < 0.16 * 0.4, 'eye moved far less than the 0.16 snap in one frame');
});

test('easeEye_AfterSnap_ConvergesToBodyWithin015s', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 0.16, true, 1 / 60);
  for (let i = 0; i < 9; i++) st = easeEye(st, 0.16, true, 1 / 60);
  assert.ok(Math.abs(st.off) < 0.16 * 0.1);
});

test('easeEye_StairClimb_NoFrameJumpAboveThreshold', () => {
  let st = easeEye(null, 0, true, 1 / 60), y = 0, last = eyeOf(st, y), worst = 0;
  for (let i = 1; i <= 120; i++) {
    if (i % 8 === 0) y += 0.16;   // a tread every 8 frames, as on the Plattform spiral
    st = easeEye(st, y, true, 1 / 60);
    worst = Math.max(worst, Math.abs(eyeOf(st, y) - last)); last = eyeOf(st, y);
  }
  assert.ok(worst < 0.08, `worst frame jump ${worst}`);
});

test('easeEye_StepDown_Symmetric', () => {
  let st = easeEye(null, 0.16, true, 1 / 60);
  st = easeEye(st, 0, true, 1 / 60);
  assert.ok(st.off > 0 && st.off <= 0.16);
});

test('easeEye_Teleport_NoLag', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 12, true, 1 / 60);   // more than stepUp
  assert.equal(st.off, 0);
});

test('easeEye_NotSteady_FollowsBodyExactly', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 0.16, true, 1 / 60);
  st = easeEye(st, 0.2, false, 1 / 60);   // jump, hover or lift
  assert.equal(st.off, 0);
});

test('easeEye_SmallRamp_NotAbsorbed', () => {
  let st = easeEye(null, 0, true, 1 / 60);
  st = easeEye(st, 0.02, true, 1 / 60);
  assert.equal(st.off, 0);
});

// #895: eased walking, turning and camera -- the pure helpers. easeTo returns the end value and the exact mean over the
// step, so a distance integrates the same whatever the dt split (frame-rate independence is the whole point).
test('easeTo_SplitDt_SameDistance', () => {
  const distance = (steps) => { let v = 0, d = 0; for (let i = 0; i < steps; i++) { const r = easeTo(v, 4.5, 1 / steps, 0.1); d += r.avg * (1 / steps); v = r.v; } return d; };
  close(distance(60), distance(30), 1e-9);
  close(distance(60), distance(1), 1e-9);
});

test('easeTo_After3Tau_At95Percent', () => {
  const r = easeTo(0, 4.5, 3 * 0.1, 0.1);
  assert.ok(r.v >= 0.95 * 4.5 && r.v < 4.5, `after 3 tau at ${r.v}`);
});

test('easeTo_NeverOvershoots', () => {
  let v = 0; for (let i = 0; i < 60; i++) { const r = easeTo(v, 4.5, 1 / 60, 0.1); assert.ok(r.v >= v && r.v <= 4.5, `from below ${r.v}`); v = r.v; }
  v = 10; for (let i = 0; i < 60; i++) { const r = easeTo(v, 4.5, 1 / 60, 0.1); assert.ok(r.v <= v && r.v >= 4.5, `from above ${r.v}`); v = r.v; }
});

test('easeTo_ZeroTau_JumpsToTarget', () => {
  assert.deepEqual(easeTo(0, 4.5, 1 / 60, 0), { v: 4.5, avg: 4.5 });
  assert.deepEqual(easeTo(3, 1, 1 / 60, 0), { v: 1, avg: 1 });
});

// the view yaw/pitch follow the body's, the yaw by the shortest angle; a gap over LOOK_EASE.snap (a teleport, entering
// foot) snaps instead of sweeping
test('easeLook_NullView_Snaps', () => {
  assert.deepEqual(easeLook(null, 1.234, 0.567, 1 / 60), { th: 1.234, pitch: 0.567 });
});

test('easeLook_Follows_ByTheShortestAngle', () => {
  const first = easeLook({ th: 3.0, pitch: 0 }, -3.0, 0, 1 / 60);
  assert.ok(first.th > 3.0 && first.th - 3.0 < 0.284, `turns across pi, not 6 rad: ${first.th}`);
  let v = first; for (let i = 0; i < 180; i++) v = easeLook(v, -3.0, 0, 1 / 60);
  close(v.th, -3.0 + 2 * Math.PI, 1e-9, 'settled on the target angle');
});

test('easeLook_GapOverSnap_Snaps', () => {
  assert.deepEqual(easeLook({ th: 0, pitch: 0 }, 2.0, 0, 1 / 60), { th: 2.0, pitch: 0 });
  assert.deepEqual(easeLook({ th: 0, pitch: 0 }, 0, LOOK_EASE.snap + 0.1, 1 / 60), { th: 0, pitch: LOOK_EASE.snap + 0.1 });
});

test('easeLook_SplitDt_SameResult', () => {
  const once = easeLook({ th: 1.0, pitch: 0.2 }, 1.5, 0.4, 0.1);
  let v = { th: 1.0, pitch: 0.2 }; for (let i = 0; i < 10; i++) v = easeLook(v, 1.5, 0.4, 0.01);
  close(v.th, once.th, 1e-9); close(v.pitch, once.pitch, 1e-9);
  close(smoothK(0.1, LOOK_EASE.tau), smoothK(0.1, LOOK_EASE.tau), 1e-12);
});

// #895: stepFoot eases into walking, sidestepping and turning (state lf/ls/tw carried by the caller); the height,
// jump, hover climb and gravity stay exactly as they were (vertical motion is not smoothed, A2)
test('stepFoot_WalkFromRest_RampsUpInAboutPointThreeSeconds', () => {
  const early = run(at(), { ...IDLE, fwd: 1 }, 0.05);
  assert.ok(Math.hypot(early.vx, early.vz) < 0.5 * WALKER.walk, `after 0.05 s at ${Math.hypot(early.vx, early.vz)}`);
  const late = run(at(), { ...IDLE, fwd: 1 }, 0.5);
  close(Math.hypot(late.vx, late.vz), WALKER.walk, 0.01 * WALKER.walk);
});

test('stepFoot_ReleaseKey_BrakesAndStopsMoving', () => {
  let s = run(at(), { ...IDLE, fwd: 1 }, 1);
  const from = { x: s.x, z: s.z };
  s = run(s, IDLE, 0.6);
  const glide = Math.hypot(s.x - from.x, s.z - from.z);
  assert.ok(glide > 0 && glide < WALKER.walk * WALKER.walkTau * 1.01, `glide ${glide}`);
  const still = run(s, IDLE, 0.5);
  assert.ok(Math.hypot(still.x - s.x, still.z - s.z) < 2e-3, `keeps sliding ${Math.hypot(still.x - s.x, still.z - s.z)}`);
});

test('stepFoot_TurnKey_RampsAndSettlesAtTurnRate', () => {
  const settled = run(at(), { ...IDLE, turn: 1 }, 0.6);
  close(settled.tw, WALKER.turnRate, 0.01 * WALKER.turnRate);
  const t = run(at(), { ...IDLE, turn: 1 }, 1);
  close(WALKER.turnRate * 1 - t.th, WALKER.turnRate * WALKER.turnTau * (1 - Math.exp(-1 / WALKER.turnTau)), 1e-6, 'the lost angle');
});

// the exact step mean makes the distance dt-independent; under a turn key the endpoints differ by the arc
// discretisation (as with the old instant turn), so the strides and the total heading are compared instead
test('stepFoot_SameWalkAtDt60And30_SameDistance', () => {
  const stride = (dt, input) => { let s = at(), dist = 0; for (let i = 0; i < Math.round(1 / dt); i++) { const n = stepFoot(s, input, dt, flat()); dist += Math.hypot(n.x - s.x, n.z - s.z); s = n; } return { s, dist }; };
  const straight60 = stride(1 / 60, { ...IDLE, fwd: 1 }), straight30 = stride(1 / 30, { ...IDLE, fwd: 1 });
  close(straight60.dist, straight30.dist, 1e-9);
  close(Math.hypot(straight60.s.x, straight60.s.z), Math.hypot(straight30.s.x, straight30.s.z), 1e-9);
  const turn60 = stride(1 / 60, { ...IDLE, fwd: 1, turn: 1 }), turn30 = stride(1 / 30, { ...IDLE, fwd: 1, turn: 1 });
  close(turn60.dist, turn30.dist, 1e-3);
  close(turn60.s.th, turn30.s.th, 1e-3);
});

test('stepFoot_TurnWhileWalking_NoSideSlip', () => {
  const s = run(at(), { ...IDLE, fwd: 1, turn: 1 }, 1);
  assert.equal(s.ls, 0, 'the eased speed stays on the walking axis while the heading turns');
});

test('stepFoot_HoverWithNitro_RampsToTwiceHover', () => {
  const early = run(at({ hover: true }), { ...IDLE, fwd: 1, nitro: 1 }, 0.05);
  assert.ok(Math.hypot(early.vx, early.vz) < WALKER.hover, `after 0.05 s at ${Math.hypot(early.vx, early.vz)}`);
  const s = run(at({ hover: true }), { ...IDLE, fwd: 1, nitro: 1 }, 1);
  close(Math.hypot(s.vx, s.vz), 2 * WALKER.hover, 0.02 * 2 * WALKER.hover);
});

test('stepFoot_StateRoundTrip_IsDeterministic', () => {
  const journey = () => {
    let s = run(at(), { ...IDLE, fwd: 1, turn: 1 }, 0.5);
    s = run(s, { ...IDLE, lift: 1 }, 0.1);
    s = run(s, IDLE, 1);
    return s;
  };
  assert.deepEqual(journey(), journey());
});

// a left click on the landscape on foot toggles the look mode: it grabs the mouse, and a second one lets it go again (no pause)
test('footClickAction_OnFootUnlocked_Locks', () => {
  assert.equal(footClickAction({ foot: true, locked: false, menu: false }), 'lock');
});

test('footClickAction_OnFootLocked_Unlocks', () => {
  assert.equal(footClickAction({ foot: true, locked: true, menu: false }), 'unlock');
});

test('footClickAction_InTheCarOrAMenu_Nothing', () => {
  assert.equal(footClickAction({ foot: false, locked: false, menu: false }), null);
  assert.equal(footClickAction({ foot: true, locked: false, menu: true }), null);
});
