// #346: pure helpers of the start screen and the Worlds dialog. No DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, startModeFrom, lastModeFrom, modeTextKey, hasCheckpoints, editionText, worldsKeyAction, bestKeyFor } from '../startscreen.js';

const key = (code) => ({ code, repeat: false });

test('MODES are cruise and the three race modes in bar order', () => {
  assert.deepEqual(MODES, ['cruise', 'trial', 'blitz', 'hunt']);
});

test('startModeFrom: ?mode= picks a known mode, anything else is cruise', () => {
  assert.equal(startModeFrom('', false), 'cruise');
  assert.equal(startModeFrom('?mode=trial', false), 'trial');
  assert.equal(startModeFrom('?region=ehrendingen&mode=blitz', false), 'blitz');
  assert.equal(startModeFrom('?mode=hunt', false), 'hunt');
  assert.equal(startModeFrom('?mode=cruise', false), 'cruise');
  assert.equal(startModeFrom('?mode=<img onerror=1>', false), 'cruise');
});

test('startModeFrom: a raceless world offers only cruise and hunt', () => {
  assert.equal(startModeFrom('?mode=trial', true), 'cruise');
  assert.equal(startModeFrom('?mode=blitz', true), 'cruise');
  assert.equal(startModeFrom('?mode=hunt', true), 'hunt');
  assert.equal(startModeFrom('', true), 'cruise');
});

test('lastModeFrom: a stored mode wins, junk falls back to cruise, a raceless world keeps only cruise or hunt', () => {
  assert.equal(lastModeFrom('blitz', false), 'blitz');
  assert.equal(lastModeFrom('trial', false), 'trial');
  assert.equal(lastModeFrom(null, false), 'cruise');
  assert.equal(lastModeFrom('<img onerror=1>', false), 'cruise');
  assert.equal(lastModeFrom('blitz', true), 'cruise');
  assert.equal(lastModeFrom('hunt', true), 'hunt');
});

test('modeTextKey: cruise and trial use their intros, blitz and hunt their own intro', () => {
  const strings = { intro: 'introEhrendingen' };
  assert.equal(modeTextKey('cruise', strings), 'cruiseIntro');
  assert.equal(modeTextKey('trial', strings), 'introEhrendingen');
  assert.equal(modeTextKey('blitz', strings), 'blitzIntro');
  assert.equal(modeTextKey('hunt', strings), 'huntIntro');
});

test('hasCheckpoints: only the time trial and Blitz race the checkpoints', () => {
  assert.equal(hasCheckpoints('trial'), true);
  assert.equal(hasCheckpoints('blitz'), true);
  assert.equal(hasCheckpoints('hunt'), false);
  assert.equal(hasCheckpoints('cruise'), false);
});

test('editionText: built-in regions get the Edition suffix, generated worlds their plain name', () => {
  const tr = (k, n) => (k === 'edition' ? `${n} Edition` : k);
  assert.equal(editionText({ name: 'Hochrhein' }, tr), 'Hochrhein Edition');
  assert.equal(editionText({ name: 'Testdorf', generated: true }, tr), 'Testdorf');
});

test('worldsKeyAction: Esc backs out, arrows move rows only while on a row, Tab/Enter/Space pass, game keys are ignored', () => {
  assert.equal(worldsKeyAction(key('Escape'), true), 'back');
  assert.equal(worldsKeyAction(key('Escape'), false), 'back');
  assert.equal(worldsKeyAction(key('ArrowDown'), true), 'next');
  assert.equal(worldsKeyAction(key('ArrowUp'), true), 'prev');
  assert.equal(worldsKeyAction(key('ArrowDown'), false), 'ignore');
  for (const c of ['Tab', 'Enter', 'NumpadEnter', 'Space']) assert.equal(worldsKeyAction(key(c), true), 'pass');
  for (const c of ['KeyT', 'KeyC', 'KeyJ', 'F1', 'KeyR']) assert.equal(worldsKeyAction(key(c), true), 'ignore');
});

test('bestKeyFor: regions use their bestKey, worlds the generated key', () => {
  const regions = { hochrhein: { bestKey: 'mm.best2' }, ehrendingen: { bestKey: 'mm.best2.ehrendingen' } };
  assert.equal(bestKeyFor({ kind: 'region', id: 'ehrendingen' }, regions), 'mm.best2.ehrendingen');
  assert.equal(bestKeyFor({ kind: 'region', id: 'hochrhein' }, regions), 'mm.best2');
  assert.equal(bestKeyFor({ kind: 'world', id: 'abc123' }, regions), 'mm.best2.world.abc123');
});
