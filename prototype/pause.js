// #83: pure rules for the pause menu -- no DOM, no three.js. Unit-tested with `node --test prototype/tests/*.test.mjs`.

// the menu's buttons, in focus order (ids in prototype/index.html)
export const PAUSE_BUTTONS = ['pauseresume', 'pauserestart', 'pausemenu'];
// the „Abandon this run?" question's buttons, Cancel first (it gets the focus)
export const ABANDON_BUTTONS = ['abandoncancel', 'abandonok'];

// a pause only makes sense during a run: start / result screen hidden, race armed or running
export function canPause(overlayHidden, raceState) {
  return overlayHidden && (raceState === 'armed' || raceState === 'racing');
}

// Main menu asks first only while the race clock runs; 'armed' has nothing to lose (A3)
export function needsAbandonConfirm(raceState) {
  return raceState === 'racing';
}

const TOGGLE = new Set(['Escape', 'KeyP']);
const NEXT = new Set(['ArrowDown', 'ArrowRight']);
const PREV = new Set(['ArrowUp', 'ArrowLeft']);

// key = { code, shiftKey, repeat }, state = { paused, canPause, helpOpen, confirm }
// → 'pause' | 'resume' | 'cancel' | 'next' | 'prev' | 'debug' | 'photo' | 'ignore' (swallowed, browser default kept) | 'pass' (normal game key handling)
export function pauseKeyAction(key, state) {
  if (state.paused) return state.confirm ? confirmAction(key) : pausedAction(key);
  if (!TOGGLE.has(key.code) || key.repeat || !state.canPause) return 'pass';
  if (key.code === 'Escape' && state.helpOpen) return 'pass';
  return 'pause';
}

function pausedAction(key) {
  if (TOGGLE.has(key.code)) return key.repeat ? 'ignore' : 'resume';
  // #113: a photo of the frozen scene is harmless here, unlike behind the abandon question
  if (key.code === 'KeyX') return key.repeat ? 'ignore' : 'photo';
  return menuAction(key);
}

// the abandon question: Esc = Cancel, P does nothing (no resume from behind a question)
function confirmAction(key) {
  if (key.code === 'Escape') return key.repeat ? 'ignore' : 'cancel';
  return menuAction(key);
}

// shared by both dialogs: focus moves, F3, every other key swallowed
function menuAction(key) {
  if (NEXT.has(key.code)) return 'next';
  if (PREV.has(key.code)) return 'prev';
  if (key.code === 'Tab') return key.shiftKey ? 'prev' : 'next';
  if (key.code === 'F3') return 'debug';
  return 'ignore';
}

// the id `step` places after `current` in `ids`, wrapping; an unknown current starts from the first
export function nextFocus(ids, current, step) {
  const i = ids.indexOf(current);
  if (i < 0) return ids[0];
  return ids[(i + step + ids.length) % ids.length];
}
