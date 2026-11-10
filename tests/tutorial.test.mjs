// #534: the tutorial's pure step logic. No DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesFor } from '../controls.js';
import { translate } from '../strings.js';
import { TUT, TUT_KEY, TUTORIAL_STEPS, TUTORIAL_DEFS, tutorialFor, tutorialDoneFrom, keyCap, howTo, stepsFor, tutorialStart, tutorialStep, tutorialStepId, tutorialHint } from '../tutorial.js';

const ALL = TUTORIAL_STEPS.map(s => s.id);
const IDLE = { dt: 1 / 60, kmh: 0, steering: false, nitro: false, foot: false, cpDist: Infinity, jumpedNear: false, onDeck: false, photoAimed: false };
const obs = (o = {}) => ({ ...IDLE, ...o });
const at = (id, extra = {}) => ({ ...tutorialStart(ALL, 3), i: ALL.indexOf(id), ...extra });
const def = (id) => TUTORIAL_STEPS.find(s => s.id === id);

test('TUTORIAL_STEPS_AreTheTenStepsInOrder', () => {
  assert.deepEqual(ALL, ['drive', 'brake', 'checkpoints', 'nitro', 'jump', 'getOut', 'climb', 'photo', 'getIn', 'done']);
  assert.equal(TUT_KEY, 'mm.tutorialDone');
});

test('tutorialFor_Hochrhein_HasAStartAndThreeCheckpoints_OthersNone', () => {
  assert.equal(tutorialFor({ id: 'hochrhein' }), TUTORIAL_DEFS.hochrhein);
  assert.equal(TUTORIAL_DEFS.hochrhein.cps.length, 3);
  assert.equal(tutorialFor({ id: 'ehrendingen' }), null);
  assert.equal(tutorialFor({ id: 'hochrhein', generated: true }), null);
});

test('tutorialFor_Hochrhein_StaysNearThePlattform_ButTheJumpIsNeeded', () => {
  const { start, cps } = TUTORIAL_DEFS.hochrhein, plat = { x: 304.8, z: 427.1 };
  for (const p of [start, ...cps]) assert.ok(Math.hypot(p.x - plat.x, p.z - plat.z) < 260, JSON.stringify(p));
  assert.ok(Math.hypot(cps[2].x - plat.x, cps[2].z - plat.z) > TUT.jumpNearM);
});

test('tutorialDoneFrom_OnlyAMissingValueMeansNotDone', () => {
  assert.equal(tutorialDoneFrom(null), false);
  assert.equal(tutorialDoneFrom(undefined), false);
  assert.equal(tutorialDoneFrom('1'), true);
  assert.equal(tutorialDoneFrom(''), true);
});

test('keyCap_KeyAndDigitCodes_LoseTheirPrefix', () => {
  assert.equal(keyCap('KeyX'), 'X');
  assert.equal(keyCap('Digit1'), '1');
  assert.equal(keyCap('Escape'), 'Esc');
  assert.equal(keyCap('F1'), 'F1');
});

test('howTo_Desktop_UsesTheKeyBarCapOrTheKey', () => {
  assert.deepEqual(howTo(def('drive'), false), { via: 'key', cap: 'WASD' });
  assert.deepEqual(howTo(def('brake'), false), { via: 'key', cap: 'S' });
  assert.deepEqual(howTo(def('nitro'), false), { via: 'key', cap: 'Shift' });
  assert.deepEqual(howTo(def('jump'), false), { via: 'key', cap: 'J' });
  assert.deepEqual(howTo(def('getOut'), false), { via: 'key', cap: 'Z' });
  assert.deepEqual(howTo(def('climb'), false), { via: 'key', cap: 'WASD' });
  assert.deepEqual(howTo(def('photo'), false), { via: 'key', cap: 'X' });
  assert.deepEqual(howTo(def('getIn'), false), { via: 'key', cap: 'Z' });
  assert.equal(howTo(def('done'), false), null);
});

test('howTo_Phone_FollowsTheTouchColumnOfControls', () => {
  for (const s of TUTORIAL_STEPS.filter(q => q.action)) {
    const e = entriesFor(s.context).find(q => q.action === s.action), h = howTo(s, true);
    if (e.touch === 'button') assert.deepEqual(h, { via: 'button', label: s.touchLabel ?? e.label }, s.id);
    else if (e.touch === 'menu') assert.deepEqual(h, { via: 'menu', label: e.label }, s.id);
    else assert.equal(h, null, s.id);
  }
});

test('stepsFor_Desktop_IsEveryStep_PhoneDropsStepsWithoutATouchControl', () => {
  assert.deepEqual(stepsFor(false), ALL);
  const phone = stepsFor(true);
  assert.deepEqual(phone, ALL.filter(id => !def(id).action || howTo(def(id), true)));
  assert.equal(phone.at(-1), 'done');
});

test('tutorialStart_BeginsAtTheFirstStep', () => {
  const st = tutorialStart(ALL, 3);
  assert.equal(tutorialStepId(st), 'drive');
  assert.deepEqual({ cp: st.cp, cps: st.cps, hold: st.hold, steered: st.steered, done: st.done }, { cp: 0, cps: 3, hold: 0, steered: false, done: false });
});

test('tutorialStep_Drive_NeedsSteeringOnceAndTwentyKmh', () => {
  let st = tutorialStart(ALL, 3);
  st = tutorialStep(st, obs({ kmh: 25 }));
  assert.equal(tutorialStepId(st), 'drive', 'fast but never steered');
  st = tutorialStep(st, obs({ kmh: 10, steering: true }));
  assert.equal(tutorialStepId(st), 'drive', 'steered but slow');
  st = tutorialStep(st, obs({ kmh: TUT.driveKmh }));
  assert.equal(tutorialStepId(st), 'brake');
});

test('tutorialStep_Drive_OnFootDoesNotCount', () => {
  assert.equal(tutorialStepId(tutorialStep(at('drive', { steered: true }), obs({ kmh: 30, foot: true }))), 'drive');
});

test('tutorialStep_Brake_BelowFiveKmh', () => {
  assert.equal(tutorialStepId(tutorialStep(at('brake'), obs({ kmh: 6 }))), 'brake');
  assert.equal(tutorialStepId(tutorialStep(at('brake'), obs({ kmh: 4.9 }))), 'checkpoints');
});

test('tutorialStep_Checkpoints_CountInTheCarWithinTheRadius_ThenAdvance', () => {
  let st = at('checkpoints');
  st = tutorialStep(st, obs({ cpDist: TUT.cpRadius + 1 }));
  assert.equal(st.cp, 0);
  st = tutorialStep(st, obs({ cpDist: 2, foot: true }));
  assert.equal(st.cp, 0, 'on foot does not count');
  st = tutorialStep(st, obs({ cpDist: 2 }));
  st = tutorialStep(st, obs({ cpDist: 2 }));
  assert.equal(st.cp, 2);
  assert.equal(tutorialStepId(st), 'checkpoints');
  st = tutorialStep(st, obs({ cpDist: 2 }));
  assert.equal(st.cp, 3);
  assert.equal(tutorialStepId(st), 'nitro');
});

test('tutorialStep_Nitro_HeldOneSecondWithoutABreak', () => {
  let st = at('nitro');
  st = tutorialStep(st, obs({ nitro: true, dt: 0.6 }));
  st = tutorialStep(st, obs({ nitro: false, dt: 0.1 }));
  assert.equal(st.hold, 0);
  st = tutorialStep(st, obs({ nitro: true, dt: 0.6 }));
  assert.equal(tutorialStepId(st), 'nitro');
  st = tutorialStep(st, obs({ nitro: true, dt: 0.5 }));
  assert.equal(tutorialStepId(st), 'jump');
  assert.equal(st.hold, 0);
});

test('tutorialStep_Jump_GetOut_Climb_Photo_GetIn_EachOnItsSignal', () => {
  const cases = [
    ['jump', { jumpedNear: true }, 'getOut'],
    ['getOut', { foot: true }, 'climb'],
    ['climb', { foot: true, onDeck: true }, 'photo'],
    ['photo', { foot: true, onDeck: true, photoAimed: true }, 'getIn'],
    ['getIn', { foot: false }, 'done'],
  ];
  for (const [id, signal, next] of cases) {
    const idle = obs({ foot: !['jump', 'getOut'].includes(id) });
    assert.equal(tutorialStepId(tutorialStep(at(id), idle)), id, `${id} waits`);
    assert.equal(tutorialStepId(tutorialStep(at(id), obs(signal))), next, id);
  }
});

test('tutorialStep_LastStep_IsDoneAndStaysDone', () => {
  const st = tutorialStep(at('getIn'), obs({ foot: false }));
  assert.equal(st.done, true);
  assert.equal(tutorialStep(st, obs({ kmh: 50, steering: true })), st);
});

test('tutorialStep_DoesNotMutateItsInput', () => {
  const st = at('checkpoints'), copy = structuredClone(st);
  tutorialStep(st, obs({ cpDist: 1 }));
  assert.deepEqual(st, copy);
});

test('tutorialStep_PhoneWithoutNitro_GoesFromCheckpointsToJump', () => {
  const steps = ALL.filter(id => id !== 'nitro');
  const st = tutorialStep({ ...tutorialStart(steps, 1), i: steps.indexOf('checkpoints') }, obs({ cpDist: 1 }));
  assert.equal(tutorialStepId(st), 'jump');
});

test('tutorialHint_NamesTheInputAndTheCheckpoint', () => {
  assert.deepEqual(tutorialHint(at('drive'), false, false), { key: 'tutStepDrive', how: { via: 'key', cap: 'WASD' }, n: 1, of: 3 });
  assert.equal(tutorialHint(at('checkpoints', { cp: 1 }), false, false).n, 2);
  assert.deepEqual(tutorialHint(at('done'), false, false), { key: 'tutResultNext', how: null, n: 1, of: 3 });
});

test('tutorialHint_WrongBody_SaysGetInOrGetOutFirst', () => {
  assert.deepEqual(tutorialHint(at('nitro'), true, false), { key: 'tutNeedCar', how: { via: 'key', cap: 'Z' }, n: 0, of: 0 });
  assert.deepEqual(tutorialHint(at('photo'), false, false), { key: 'tutNeedFoot', how: { via: 'key', cap: 'Z' }, n: 0, of: 0 });
  assert.equal(tutorialHint(at('jump'), true, false).key, 'tutStepJump', 'J works on foot too');
});
test('tutorialHint_OnTopOfTheTower_NamesTheStairAndHowToLookAround', () => {
  assert.deepEqual(tutorialHint(at('getIn'), true, false, true), { key: 'tutStepDown', how: { via: 'key', cap: 'WASD' }, n: 1, of: 3 });
  assert.equal(tutorialHint(at('getIn'), true, true, true).key, 'tutStepDownTouch');
  assert.equal(tutorialHint(at('getIn'), true, false, false).key, 'tutStepGetIn', 'down the stair it is the car again');
  assert.equal(tutorialHint(at('photo'), true, false, true).key, 'tutStepPhoto', 'only on the way back');
});

test('tutorialHint_Climb_TouchHasItsOwnTextAndBothNameTheShortcut', () => {   // #701
  assert.equal(tutorialHint(at('climb'), true, false).key, 'tutStepClimb');
  assert.equal(tutorialHint(at('climb'), true, true).key, 'tutStepClimbTouch');
  for (const lang of ['en', 'de']) {
    assert.match(translate(lang, 'tutStepClimb', '@', 1, 3), /E/, lang);
    assert.ok(translate(lang, 'tutStepClimbTouch', '@', 1, 3).includes('@'), `${lang}: the how marker survives`);
  }
});
