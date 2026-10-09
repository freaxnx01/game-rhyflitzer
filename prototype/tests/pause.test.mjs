// #83: the pause menu's key and focus rules. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAUSE_BUTTONS, ABANDON_BUTTONS, canPause, needsAbandonConfirm, pauseKeyAction, nextFocus } from '../pause.js';

const key = (code, extra = {}) => ({ code, shiftKey: false, repeat: false, ...extra });
const RUN = { paused: false, canPause: true, helpOpen: false };
const PAUSED = { paused: true, canPause: true, helpOpen: false, confirm: false };
const CONFIRM = { ...PAUSED, confirm: true };

test('canPause: only with the start / result screen hidden and the race armed or running', () => {
  assert.equal(canPause(true, 'armed'), true);
  assert.equal(canPause(true, 'racing'), true);
  assert.equal(canPause(true, 'ready'), false);
  assert.equal(canPause(true, 'finished'), false);
  assert.equal(canPause(false, 'racing'), false);
});

test('Esc and P pause a run; other keys pass to the game', () => {
  assert.equal(pauseKeyAction(key('Escape'), RUN), 'pause');
  assert.equal(pauseKeyAction(key('KeyP'), RUN), 'pause');
  for (const c of ['KeyW', 'Space', 'Tab', 'KeyF', 'F3', 'Enter', 'ArrowDown']) assert.equal(pauseKeyAction(key(c), RUN), 'pass', c);
});

test('no pause outside a run, on a key repeat, or with Esc while the F1 help is open', () => {
  assert.equal(pauseKeyAction(key('Escape'), { ...RUN, canPause: false }), 'pass');
  assert.equal(pauseKeyAction(key('KeyP'), { ...RUN, canPause: false }), 'pass');
  assert.equal(pauseKeyAction(key('KeyP', { repeat: true }), RUN), 'pass');
  assert.equal(pauseKeyAction(key('Escape'), { ...RUN, helpOpen: true }), 'pass');
  assert.equal(pauseKeyAction(key('KeyP'), { ...RUN, helpOpen: true }), 'pause');
});

test('while paused: Esc / P resume, a held P does not flicker', () => {
  assert.equal(pauseKeyAction(key('Escape'), PAUSED), 'resume');
  assert.equal(pauseKeyAction(key('KeyP'), PAUSED), 'resume');
  assert.equal(pauseKeyAction(key('KeyP', { repeat: true }), PAUSED), 'ignore');
});

test('while paused: arrows and Tab move the focus, F3 stays, every other key is swallowed', () => {
  assert.equal(pauseKeyAction(key('ArrowDown'), PAUSED), 'next');
  assert.equal(pauseKeyAction(key('ArrowRight'), PAUSED), 'next');
  assert.equal(pauseKeyAction(key('ArrowUp'), PAUSED), 'prev');
  assert.equal(pauseKeyAction(key('ArrowLeft'), PAUSED), 'prev');
  assert.equal(pauseKeyAction(key('Tab'), PAUSED), 'next');
  assert.equal(pauseKeyAction(key('Tab', { shiftKey: true }), PAUSED), 'prev');
  assert.equal(pauseKeyAction(key('F3'), PAUSED), 'debug');
  for (const c of ['Enter', 'NumpadEnter', 'Space', 'KeyW', 'KeyH', 'KeyJ', 'KeyF', 'KeyM', 'KeyT', 'F1', 'KeyR']) assert.equal(pauseKeyAction(key(c), PAUSED), 'ignore', c);
});

test('X photographs the frozen scene from the pause menu, but not from behind the abandon question (#113)', () => {
  assert.equal(pauseKeyAction(key('KeyX'), PAUSED), 'photo');
  assert.equal(pauseKeyAction(key('KeyX', { repeat: true }), PAUSED), 'ignore');
  assert.equal(pauseKeyAction(key('KeyX'), CONFIRM), 'ignore');
  assert.equal(pauseKeyAction(key('KeyX'), RUN), 'pass');
});

test('nextFocus wraps both ways and starts at the first button from anywhere else', () => {
  assert.deepEqual(PAUSE_BUTTONS, ['pauseresume', 'pauserestart', 'pausemenu']);
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pauseresume', 1), 'pauserestart');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pausemenu', 1), 'pauseresume');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'pauseresume', -1), 'pausemenu');
  assert.equal(nextFocus(PAUSE_BUTTONS, '', 1), 'pauseresume');
  assert.equal(nextFocus(PAUSE_BUTTONS, 'gl', -1), 'pauseresume');
});

test('the abandon question only while the race clock runs (A3)', () => {
  assert.equal(needsAbandonConfirm('racing'), true);
  assert.equal(needsAbandonConfirm('armed'), false);
  assert.equal(needsAbandonConfirm('ready'), false);
  assert.equal(needsAbandonConfirm('finished'), false);
});

test('in the abandon question: Esc cancels, P is ignored, arrows and Tab move the focus, F3 stays', () => {
  assert.equal(pauseKeyAction(key('Escape'), CONFIRM), 'cancel');
  assert.equal(pauseKeyAction(key('Escape', { repeat: true }), CONFIRM), 'ignore');
  assert.equal(pauseKeyAction(key('KeyP'), CONFIRM), 'ignore');
  assert.equal(pauseKeyAction(key('ArrowDown'), CONFIRM), 'next');
  assert.equal(pauseKeyAction(key('ArrowUp'), CONFIRM), 'prev');
  assert.equal(pauseKeyAction(key('Tab'), CONFIRM), 'next');
  assert.equal(pauseKeyAction(key('Tab', { shiftKey: true }), CONFIRM), 'prev');
  assert.equal(pauseKeyAction(key('F3'), CONFIRM), 'debug');
  for (const c of ['Enter', 'Space', 'KeyW', 'KeyH', 'F1']) assert.equal(pauseKeyAction(key(c), CONFIRM), 'ignore', c);
});

test('the abandon question focuses Cancel first and wraps', () => {
  assert.deepEqual(ABANDON_BUTTONS, ['abandoncancel', 'abandonok']);
  assert.equal(nextFocus(ABANDON_BUTTONS, 'abandoncancel', 1), 'abandonok');
  assert.equal(nextFocus(ABANDON_BUTTONS, 'abandonok', 1), 'abandoncancel');
  assert.equal(nextFocus(ABANDON_BUTTONS, 'abandoncancel', -1), 'abandonok');
  assert.equal(nextFocus(ABANDON_BUTTONS, 'pausemenu', 1), 'abandoncancel');
});
