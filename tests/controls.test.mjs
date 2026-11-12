// #535: the controls table -- one source of truth for the key bar, the phone menu and the dispatcher's signal / context keys
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXTS, entriesFor, actionFor, barEntries, menuEntries, conflicts, contextKeyAction, contextLabel, keybarOnFrom } from '../controls.js';
import { translate } from '../strings.js';

test('conflicts_Table_IsEmpty', () => {
  assert.deepEqual(conflicts(), []);
});

test('entriesFor_EveryContext_HasEntries', () => {
  for (const c of CONTEXTS) assert.ok(entriesFor(c).length > 0, c);
});

test('coreKeys_Car_HaveZJCAndF1', () => {
  const keys = entriesFor('car').filter(e => e.core).flatMap(e => e.keys);
  for (const k of ['KeyZ', 'KeyJ', 'KeyC', 'F1']) assert.ok(keys.includes(k), k);
});

test('coreKeys_FootAndIndoors_HaveZJAndF1_NoCamera', () => {
  for (const c of ['foot', 'indoors']) {
    const keys = entriesFor(c).filter(e => e.core).flatMap(e => e.keys);
    for (const k of ['KeyZ', 'KeyJ', 'F1']) assert.ok(keys.includes(k), `${c} ${k}`);
    assert.ok(!entriesFor(c).some(e => e.keys.includes('KeyC') || e.action === 'camera'), `${c} has no KeyC entry`);
  }
});

test('actionFor_Car_ShiftAndNBothNitro', () => {
  for (const k of ['ShiftLeft', 'ShiftRight', 'KeyN']) assert.equal(actionFor('car', k), 'nitro', k);
});

test('actionFor_FootAndHeli_ShiftIsDownAndNStaysNitro', () => {
  assert.equal(actionFor('foot', 'ShiftLeft'), 'down');
  assert.equal(actionFor('foot', 'KeyN'), 'footNitro');
  assert.equal(actionFor('heli', 'ShiftRight'), 'sink');
  assert.equal(actionFor('heli', 'KeyN'), 'heliNitro');
});

test('actionFor_Car_CommaPeriodAreTheSignals_QEAreFree', () => {
  assert.equal(actionFor('car', 'Comma'), 'signalLeft');
  assert.equal(actionFor('car', 'Period'), 'signalRight');
  assert.equal(actionFor('car', 'KeyQ'), null);
  assert.equal(actionFor('car', 'KeyE'), null);
});

test('actionFor_E_IsTheContextKeyOnFootAndIndoors', () => {
  for (const c of ['foot', 'indoors', 'lift']) assert.equal(actionFor(c, 'KeyE'), 'context', c);
});

test('actionFor_B_IsOnlyLookBack', () => {
  for (const c of ['car', 'foot', 'indoors']) assert.equal(actionFor(c, 'KeyB'), 'lookBack', c);
  for (const c of CONTEXTS) assert.ok([null, 'lookBack'].includes(actionFor(c, 'KeyB')), c);
});

test('actionFor_Train_QEStayTheSwitches', () => {
  assert.equal(actionFor('train', 'KeyQ'), 'switchLeft');
  assert.equal(actionFor('train', 'KeyE'), 'switchRight');
  assert.equal(actionFor('train', 'Comma'), null);
});

test('barEntries_Car_SpecOrder', () => {
  assert.deepEqual(barEntries('car').map(e => e.cap), ['WASD', 'Shift', 'Z', 'J', 'C', 'F1']);
  assert.deepEqual(barEntries('car').map(e => translate('de', e.label)), ['fahren', 'Nitro', 'aussteigen', 'springen', 'Kamera', 'alle Tasten']);
});

test('barEntries_Foot_SpecOrder', () => {
  assert.deepEqual(barEntries('foot').map(e => e.cap), ['WASD', 'Space', 'Z', 'J', 'F1']);
  assert.deepEqual(barEntries('foot').map(e => translate('de', e.label)).slice(0, 3), ['gehen', 'springen', 'einsteigen']);
  assert.ok(!barEntries('foot').some(e => e.cap === 'C'), 'no camera entry on foot');
});

test('barEntries_WithContextAction_HighlightedEFirst', () => {
  for (const [a, de] of [['enter', 'eintreten'], ['leave', 'hinaus'], ['lift', 'Lift']]) {
    const first = barEntries('indoors', a)[0];
    assert.deepEqual([first.cap, first.highlight, translate('de', first.label)], ['E', true, de], a);
  }
  assert.ok(barEntries('car', null).every(e => !e.highlight));
});

test('barEntries_HopActions_HighlightedEWithTheirLabels', () => {   // #701
  for (const [a, en, de] of [['up', 'up to the deck', 'hinauf'], ['down', 'down', 'hinunter']]) {
    const first = barEntries('foot', a)[0];
    assert.deepEqual([first.cap, first.highlight, translate('en', first.label), translate('de', first.label)], ['E', true, en, de], a);
  }
});

test('barEntries_HeliTrainLift_OnlyAllKeys', () => {
  for (const c of ['heli', 'train', 'lift']) assert.deepEqual(barEntries(c).map(e => e.cap), ['F1'], c);
});

test('menuEntries_Car_ListsTheRestNotTheCore', () => {
  const cmds = menuEntries('car').map(e => e.cmd);
  for (const k of ['Comma', 'Period', 'KeyL', 'Digit1', 'KeyH', 'KeyO', 'KeyI', 'KeyF', 'KeyX', 'KeyM', 'KeyT', 'KeyR', 'Backquote']) assert.ok(cmds.includes(k), k);
  for (const k of ['KeyZ', 'KeyJ', 'KeyC']) assert.ok(!cmds.includes(k), k);
});

test('actionFor_Backquote_IsRecordInEveryRunContext (#749)', () => {
  for (const c of ['car', 'foot', 'indoors']) assert.equal(actionFor(c, 'Backquote'), 'record', c);
});

test('labels_EveryLabelExistsInBothLanguages', () => {
  for (const c of CONTEXTS) for (const e of entriesFor(c)) if (e.label) for (const l of ['en', 'de']) assert.notEqual(translate(l, e.label), e.label, `${c} ${e.action} ${l}`);
});

test('contextKeyAction_BoardOnlyWhenNothingElseIsUp', () => {   // #553
  assert.equal(contextKeyAction({ boardPrompt: true }), 'board');
  assert.equal(contextKeyAction({ doorPrompt: true, boardPrompt: true }), 'enter');   // a door beats a parked car
  assert.equal(contextKeyAction({ indoors: true, boardPrompt: true }), 'leave');
  assert.equal(contextKeyAction({}), null);
  assert.equal(contextLabel('board'), 'barBoard');
});

test('contextKeyAction_TimetableOnlyWhenNothingElseIsUp', () => {   // #801
  assert.equal(contextKeyAction({ stopPrompt: true }), 'timetable');
  assert.equal(contextKeyAction({ boardPrompt: true, stopPrompt: true }), 'board');
  assert.equal(contextKeyAction({ doorPrompt: true, stopPrompt: true }), 'enter');
  assert.equal(contextKeyAction({ hop: 'up', stopPrompt: true }), 'up');
  assert.equal(contextKeyAction({ indoors: true, stopPrompt: true }), 'leave');
  assert.equal(contextLabel('timetable'), 'barTimetable');
  for (const l of ['en', 'de']) for (const k of ['barTimetable', 'ttPrompt', 'ttPauseBtn', 'ttDepartures', 'ttNone', 'keyTimetable', 'ttEarlier', 'ttLater', 'ttBus']) assert.notEqual(translate(l, k), k, `${l} ${k}`);
  assert.equal(translate('de', 'ttLine', '143'), 'Linie 143');
  assert.equal(translate('en', 'ttIn', 5), "in 5'");
});

test('contextKeyAction_LiftWinsOverLeave_LeaveOverEnter', () => {
  assert.equal(contextKeyAction({ liftPrompt: true, indoors: true, doorPrompt: true }), 'lift');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: true, doorPrompt: true }), 'leave');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: true }), 'enter');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: false }), null);
});

test('contextKeyAction_HopWinsOverEnter_LiftAndLeaveWinOverHop', () => {   // #701
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: true, hop: 'up' }), 'up');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: false, hop: 'down' }), 'down');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: true, doorPrompt: false, hop: 'up' }), 'leave');
  assert.equal(contextKeyAction({ liftPrompt: true, indoors: true, doorPrompt: false, hop: 'up' }), 'lift');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: true }), 'enter', 'hop is optional');
});

test('contextLabel_KnownAndUnknown', () => {
  assert.equal(contextLabel('leave'), 'barLeave');
  assert.equal(contextLabel(null), null);
});

test('keybarOnFrom_DefaultOn_ZeroIsOff', () => {
  assert.equal(keybarOnFrom(null), true);
  assert.equal(keybarOnFrom('1'), true);
  assert.equal(keybarOnFrom('0'), false);
  assert.equal(keybarOnFrom('garbage'), true);
});
test('actionFor_Digits5To0_AreTheRadioInEveryRunContext_ButNotTheLiftPad', () => {
  const want = { Digit5: 'radioPower', Digit6: 'radioStation', Digit7: 'radioTrack', Digit8: 'radioTrack', Digit9: 'radioVolume', Digit0: 'radioVolume' };
  for (const c of ['car', 'foot', 'indoors', 'heli', 'train']) for (const [k, a] of Object.entries(want)) assert.equal(actionFor(c, k), a, `${c} ${k}`);
  assert.equal(actionFor('lift', 'Digit5'), 'floor');
  assert.equal(actionFor('car', 'KeyM'), 'mute');   // M stays the global mute
});

test('radioEntries_AreNotTouchMenuEntries', () => {
  for (const c of CONTEXTS) assert.ok(!menuEntries(c).some(e => e.action.startsWith('radio')), c);   // the phone has its own 📻 panel
});

test('actionFor_CamPathKeys_InEveryRunContext (#900)', () => {
  const want = { BracketLeft: 'camPathAdd', Semicolon: 'camPathUndo', Quote: 'camPathPlay' };
  for (const c of ['car', 'foot', 'indoors', 'heli', 'train']) for (const [k, a] of Object.entries(want)) assert.equal(actionFor(c, k), a, `${c} ${k}`);
  assert.equal(actionFor('lift', 'Quote'), null);   // the lift pad has its own keys, the path keys stay out
});

test('camPathEntries_AreLabelledAndNotOnThePhone (#900)', () => {
  for (const c of ['car', 'foot', 'indoors', 'heli', 'train']) {
    for (const e of entriesFor(c).filter(e => e.action.startsWith('camPath'))) {
      assert.ok(translate('en', e.label) !== e.label, `${c} ${e.label} en`);
      assert.ok(translate('de', e.label) !== e.label, `${c} ${e.label} de`);
      assert.equal(e.touch, null, `${c} ${e.action}`);   // too rare for the key bar or the ☰ menu
    }
  }
});
