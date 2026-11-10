// #773: the driving HUD's fade rules -- hold, wake, hidden, the key bar's own timer, what a mode shows, the heading text
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FADE_S, GHOST_OPACITY, FADED, createFader, resetFader, sample, phase, phases, createKeybar, keybarPhase, visibleInMode, headingText } from '../hudfade.js';

test('FADE_S_AreTheDecidedSeconds', () => {
  assert.deepEqual(FADE_S, { hold: 4, wake: 3, keybar: 30 });
  assert.ok(GHOST_OPACITY > 0 && GHOST_OPACITY < 0.5);
  assert.deepEqual(FADED, ['tl', 'dmgplate', 'gearplate', 'tripplate', 'watername', 'roadname', 'autoline', 'prompt', 'best']);
});

test('phase_AccumulatedFloatTime_AtExactlyTheHoldIsGhost', () => {
  // the browser accumulates t in ~0.05 s steps and __mm.hudFade(secs) adds secs to that sum, so "4 s later"
  // computes as t - since === 3.9999999999999996 -- the boundary must not wobble on float noise (#773)
  const f = createFader(0);
  sample(f, { dmgplate: '30%' }, 0.3831999999999999);
  assert.equal(phase(f, 'dmgplate'), 'awake');
  sample(f, { dmgplate: '30%' }, 4.3831999999999995);
  assert.equal(phase(f, 'dmgplate'), 'ghost');
});

test('phase_FreshValue_HoldsFourSecondsThenGhosts', () => {
  const f = createFader(0);
  sample(f, { roadname: 'Bahnhofstrasse' }, 0);
  assert.equal(phase(f, 'roadname'), 'awake');
  sample(f, { roadname: 'Bahnhofstrasse' }, 3.9);
  assert.equal(phase(f, 'roadname'), 'awake');
  sample(f, { roadname: 'Bahnhofstrasse' }, 4.0);
  assert.equal(phase(f, 'roadname'), 'ghost');
});

test('phase_ChangedValue_WakesThreeSecondsThenGhosts', () => {
  const f = createFader(0);
  sample(f, { gearplate: '2' }, 0);
  sample(f, { gearplate: '2' }, 10);
  assert.equal(phase(f, 'gearplate'), 'ghost');
  sample(f, { gearplate: '3' }, 10);
  assert.equal(phase(f, 'gearplate'), 'awake');
  sample(f, { gearplate: '3' }, 12.9);
  assert.equal(phase(f, 'gearplate'), 'awake');
  sample(f, { gearplate: '3' }, 13);
  assert.equal(phase(f, 'gearplate'), 'ghost');
});

test('phase_NullValue_IsHidden_AndAppearingHoldsFour', () => {
  const f = createFader(0);
  sample(f, { dmgplate: null }, 0);
  assert.equal(phase(f, 'dmgplate'), 'hidden');
  sample(f, { dmgplate: null }, 20);
  assert.equal(phase(f, 'dmgplate'), 'hidden');
  sample(f, { dmgplate: '22 %' }, 20);
  assert.equal(phase(f, 'dmgplate'), 'awake');
  sample(f, { dmgplate: '22 %' }, 23.5);
  assert.equal(phase(f, 'dmgplate'), 'awake');          // appearance holds 4 s, not the 3 s wake
  sample(f, { dmgplate: '22 %' }, 24);
  assert.equal(phase(f, 'dmgplate'), 'ghost');
  sample(f, { dmgplate: null }, 25);
  assert.equal(phase(f, 'dmgplate'), 'hidden');
});

test('phase_UnknownId_IsHidden_AndPhasesListsEverySampledId', () => {
  const f = createFader(0);
  assert.equal(phase(f, 'best'), 'hidden');
  sample(f, { tl: 'Cruising · Hochrhein|0', best: 'Best —' }, 0);
  sample(f, { tl: 'Cruising · Hochrhein|0', best: 'Best —' }, 5);
  assert.deepEqual(phases(f), { tl: 'ghost', best: 'ghost' });
});

test('resetFader_ForgetsEveryValue_SoARunStartHoldsFourSecondsAgain', () => {
  const f = createFader(0);
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 0);
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 90);       // the start screen sat open for a while
  assert.equal(phase(f, 'tl'), 'ghost');
  resetFader(f);
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 90);
  assert.equal(phase(f, 'tl'), 'awake');
  sample(f, { tl: 'Time trial · Hochrhein|0' }, 94);
  assert.equal(phase(f, 'tl'), 'ghost');
});

test('sample_OnlyTheChangedIdWakes', () => {
  const f = createFader(0);
  sample(f, { roadname: 'A', watername: 'Rhein' }, 0);
  sample(f, { roadname: 'B', watername: 'Rhein' }, 6);
  assert.deepEqual(phases(f), { roadname: 'awake', watername: 'ghost' });
});

test('keybarPhase_ThirtySecondsPerContext_NewSignatureRestarts', () => {
  const k = createKeybar(0);
  assert.equal(keybarPhase(k, 'true|car|null|en', 0), 'awake');
  assert.equal(keybarPhase(k, 'true|car|null|en', 29.9), 'awake');
  assert.equal(keybarPhase(k, 'true|car|null|en', 30), 'ghost');
  assert.equal(keybarPhase(k, 'true|foot|null|en', 30), 'awake');   // Z: on foot -- a new context brings it back
  assert.equal(keybarPhase(k, 'true|foot|null|en', 59.9), 'awake');
  assert.equal(keybarPhase(k, 'true|foot|enter|en', 60), 'awake');  // a door's E action is a new context too
});

test('visibleInMode_MirrorsTheCruiseAndTutorialCss', () => {
  for (const id of ['tr', 'best', 'cps', 'pips', 'arrow', 'dist', 'cpname']) assert.equal(visibleInMode(id, 'cruise'), false, id);
  for (const id of ['tl', 'roadname', 'watername', 'gearplate', 'dmgplate', 'tripplate', 'keybar', 'br', 'speedo']) assert.equal(visibleInMode(id, 'cruise'), true, id);
  assert.equal(visibleInMode('tr', 'tutorial'), false);
  assert.equal(visibleInMode('best', 'tutorial'), false);
  assert.equal(visibleInMode('arrow', 'tutorial'), true);
  for (const m of ['trial', 'blitz', 'hunt', 'view']) for (const id of ['tr', 'best', 'pips', 'arrow', 'tl']) assert.equal(visibleInMode(id, m), true, `${m} ${id}`);
});

test('headingText_RoundsAndNamesTheEightPoints_WithTheEastLetter', () => {
  assert.equal(headingText(0), 'N 0°');
  assert.equal(headingText(37.4), 'NE 37°');
  assert.equal(headingText(37.4, 'O'), 'NO 37°');
  assert.equal(headingText(90, 'O'), 'O 90°');
  assert.equal(headingText(135, 'O'), 'SO 135°');
  assert.equal(headingText(359.6), 'N 0°');
  assert.equal(headingText(-90), 'W 270°');
  assert.equal(headingText(247.5), 'W 248°');
});
