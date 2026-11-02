// The tip-over state machine of a top-heavy vehicle (the Rhy Wobbler). Pure module, node --test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIP_UP, stepTip, tipped, tipLift, lateralAccel, tipSounds } from '../tipover.js';

const CFG = { latAccel: 24, rate: 5, lean: 0.14, fall: 0.5, lie: 1.4, rise: 0.8, pivot: 0.75, slide: 2.5 };
const run = (state, a, secs, dt = 1 / 60) => { let s = state; for (let i = 0; i < Math.round(secs / dt); i++) s = stepTip(s, a, dt, CFG); return s; };

test('lateralAccel_TurningRightForwards_IsPositive', () => {
  assert.ok(Math.abs(lateralAccel(10, 0, 0.02, 0.01) - 20) < 1e-9);    // 10 m/s, heading +0.02 rad in 0.01 s = 2 rad/s
  assert.ok(Math.abs(lateralAccel(-10, 0, -0.02, 0.01) - 20) < 1e-9);  // reversing with the wheel to the right turns the nose left: still a pull to the right
});

test('lateralAccel_HeadingWrapsPastPi_UsesTheShortWay', () => {
  assert.ok(Math.abs(lateralAccel(10, Math.PI - 0.01, -Math.PI + 0.01, 0.01) - 20) < 1e-6);
});

test('stepTip_GentleCorner_StaysUpAndLeansOutwards', () => {
  const s = run(TIP_UP, 15, 3);   // a steady right-hand corner under the limit
  assert.equal(s.phase, 'up');
  assert.equal(tipped(s), false);
  assert.ok(s.roll < 0 && s.roll > -CFG.lean, `leans to the left (outside), within the warning lean: ${s.roll}`);
});

test('stepTip_ShortJabOverTheLimit_DoesNotTip', () => {
  const s = run(TIP_UP, 40, 0.1);   // a tap of the key at speed: the load is smoothed
  assert.equal(s.phase, 'up');
});

test('stepTip_HeldOverTheLimit_TipsToTheOutsideWithinHalfASecond', () => {
  const s = run(TIP_UP, 30, 0.5);
  assert.equal(s.phase, 'falling');
  assert.equal(s.side, -1, 'a right-hand corner throws it onto its left side');
  assert.ok(tipped(s));
});

test('stepTip_Falling_LandsOnItsSideOnceWithALandedFlag', () => {
  let s = run(TIP_UP, 30, 0.5), landed = 0;
  for (let i = 0; i < 60; i++) { s = stepTip(s, 0, 1 / 60, CFG); if (s.landed) landed++; }
  assert.equal(landed, 1);
  assert.equal(s.phase, 'down');
  assert.ok(Math.abs(s.roll + Math.PI / 2) < 1e-9, `lies on the left side: ${s.roll}`);
});

test('stepTip_AfterLyingAndRighting_IsBackUpRight', () => {
  let s = run(TIP_UP, -30, 0.5);   // left-hand corner: onto the right side
  assert.equal(s.side, 1);
  s = run(s, 0, CFG.fall + CFG.lie + CFG.rise + 0.1);
  assert.equal(s.phase, 'up');
  assert.equal(s.roll, 0);
  assert.equal(s.load, 0, 'starts fresh, not straight back over');
});

test('stepTip_WhileTipped_IgnoresTheCorner', () => {
  const a = run(run(TIP_UP, 30, 0.5), 30, 0.3), b = run(run(TIP_UP, 30, 0.5), -30, 0.3);
  assert.deepEqual(a, b);
});

test('tipLift_Upright_IsZero', () => {
  assert.deepEqual(tipLift(0, 0.75), { dy: 0, dz: 0 });
});

test('tipLift_OnItsSide_RaisesTheCentreByThePivotAndShiftsItOver', () => {
  const l = tipLift(-Math.PI / 2, 0.75);
  assert.ok(Math.abs(l.dy - 0.75) < 1e-9 && Math.abs(l.dz + 0.75) < 1e-9, JSON.stringify(l));
  const r = tipLift(Math.PI / 4, 0.75);
  assert.ok(r.dy > 0 && r.dz > 0);
});

const SPIN = { ...CFG, turn: 1.3, turnRate: 2.5 };
const turnOf = (s, a, secs) => { let st = s, th = 0; for (let i = 0; i < Math.round(secs * 60); i++) { st = stepTip(st, a, 1 / 60, SPIN); th += st.dTh; } return { st, th }; };

test('stepTip_Upright_DoesNotTurnTheCar', () => {
  assert.equal(turnOf(TIP_UP, 15, 2).th, 0);
});

test('stepTip_TippingInARightHandCorner_SlewsOnRightwardsUpToTheTurn', () => {
  const { th } = turnOf(TIP_UP, 30, 3);
  assert.ok(th > 1.2 && th <= 1.3 + 1e-9, `turned ${th} rad, ends crosswise`);
});

test('stepTip_TippingInALeftHandCorner_SlewsLeftwards', () => {
  assert.ok(turnOf(TIP_UP, -30, 3).th < -1.2);
});

test('stepTip_Righting_TurnsNoFurther', () => {
  const { st } = turnOf(TIP_UP, 30, 0.5 + SPIN.fall + SPIN.lie + 0.05);
  assert.equal(st.phase, 'righting');
  assert.equal(stepTip(st, 0, 1 / 60, SPIN).dTh, 0);
});

test('tipSounds_Start_IsAShortTyreScreech', () => {
  const plan = tipSounds('start', 20, SPIN);
  assert.ok(plan.length > 0 && plan.every(e => e.t >= 0 && e.dur > 0 && e.dur <= 0.6 && e.gain > 0));
  assert.ok(plan.some(e => e.tone) && plan.some(e => e.noise));
});

test('tipSounds_Landing_ScrapesForAsLongAsItSlides', () => {
  const fast = tipSounds('land', 15, SPIN), slow = tipSounds('land', 4, SPIN), longest = (p) => Math.max(...p.map(e => e.dur));
  assert.ok(Math.abs(longest(fast) - Math.log(15 / 1.5) / SPIN.slide) < 1e-9, 'until the slide is down to 1.5 m/s');
  assert.ok(longest(slow) < longest(fast) && slow[0].gain < fast[0].gain);
  assert.ok(fast.every(e => e.noise || e.tone));
});

test('tipSounds_LandingAtWalkingPace_StillThuds', () => {
  const plan = tipSounds('land', 0.5, SPIN);
  assert.ok(plan.length > 0 && plan.every(e => e.dur > 0 && e.gain > 0));
});
