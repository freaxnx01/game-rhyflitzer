// tutorial.js (#534): the guided tutorial -- its steps, where they happen, when each one is done and how to name the
// input that does it. Pure: no DOM, no three.js (node --test imports it). World metres, x east, z south.
import { entriesFor } from './controls.js';

export const TUT = { driveKmh: 20, brakeKmh: 5, cpRadius: 8, nitroS: 1, jumpNearM: 60, toastS: 3, endS: 6 };
export const TUT_KEY = 'mm.tutorialDone';

// needs: the body a step is done in; in the other one the hint says "get in / get out first".
// context + action point into controls.js (the hint's wording); key / touchLabel override the entry's cap / label.
export const TUTORIAL_STEPS = [
  { id: 'drive', needs: 'car', context: 'car', action: 'drive', hint: 'tutStepDrive' },
  { id: 'brake', needs: 'car', context: 'car', action: 'drive', key: 'KeyS', touchLabel: 'brake', hint: 'tutStepBrake' },
  { id: 'checkpoints', needs: 'car', context: 'car', action: 'drive', hint: 'tutStepCheckpoints' },
  { id: 'nitro', needs: 'car', context: 'car', action: 'nitro', hint: 'tutStepNitro' },
  { id: 'jump', needs: null, context: 'car', action: 'jump', hint: 'tutStepJump' },
  { id: 'getOut', needs: null, context: 'car', action: 'getOut', hint: 'tutStepGetOut' },
  { id: 'climb', needs: 'foot', context: 'foot', action: 'walk', hint: 'tutStepClimb' },
  { id: 'photo', needs: 'foot', context: 'foot', action: 'photo', hint: 'tutStepPhoto' },
  { id: 'getIn', needs: null, context: 'foot', action: 'getIn', hint: 'tutStepGetIn' },
  { id: 'done', needs: null, context: null, action: null, hint: 'tutResultNext' },
];

// the run starts on the Geuerenstrasse (OSM -42004) 205 m west of the Plattform, facing east; the checkpoints lead
// past the tower (Geuerenstrasse), along the Südspange (-42003) and down its south leg, 208 m from the tower
export const TUTORIAL_DEFS = {
  hochrhein: {
    start: { x: 100.0, z: 406.4, th: 0.051 },
    cps: [{ x: 250.0, z: 414.1 }, { x: 386.0, z: 399.0 }, { x: 512.3, z: 440.0 }],
  },
};

export function tutorialFor(region) {
  return region.generated ? null : TUTORIAL_DEFS[region.id] || null;
}

export const tutorialDoneFrom = (stored) => stored !== null && stored !== undefined;

export function keyCap(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code === 'Escape' ? 'Esc' : code;
}

const stepDef = (id) => TUTORIAL_STEPS.find(s => s.id === id);

export function howTo(step, coarse) {
  if (!step.action) return null;
  const e = entriesFor(step.context).find(x => x.action === step.action);
  if (!e) return null;
  if (!coarse) return { via: 'key', cap: step.key ? keyCap(step.key) : e.cap ?? keyCap(e.keys[0]) };
  if (e.touch === 'button') return { via: 'button', label: step.touchLabel ?? e.label };
  if (e.touch === 'menu') return { via: 'menu', label: e.label };
  return null;
}

export function stepsFor(coarse) {
  return TUTORIAL_STEPS.filter(s => !s.action || howTo(s, coarse)).map(s => s.id);
}

export function tutorialStart(steps, cps) {
  return { steps, i: 0, cp: 0, cps, hold: 0, steered: false, done: steps[0] === 'done' };
}

export const tutorialStepId = (st) => st.steps[st.i];

const DONE_WHEN = {
  drive: (st, o) => st.steered && o.kmh >= TUT.driveKmh && !o.foot,
  brake: (st, o) => o.kmh < TUT.brakeKmh && !o.foot,
  checkpoints: (st) => st.cp >= st.cps,
  nitro: (st) => st.hold >= TUT.nitroS,
  jump: (st, o) => o.jumpedNear,
  getOut: (st, o) => o.foot,
  climb: (st, o) => o.onDeck,
  photo: (st, o) => o.photoAimed,
  getIn: (st, o) => !o.foot,
  done: () => false,
};

// o = what the game saw this frame (see index.html tutorialObserved); returns the next state, never mutates st
export function tutorialStep(st, o) {
  if (st.done) return st;
  const id = tutorialStepId(st), next = { ...st, steered: st.steered || !!o.steering };
  if (id === 'checkpoints' && !o.foot && o.cpDist <= TUT.cpRadius) next.cp = st.cp + 1;
  if (id === 'nitro') next.hold = o.nitro && !o.foot ? st.hold + o.dt : 0;
  return DONE_WHEN[id](next, o) ? advance(next) : next;
}

function advance(st) {
  const i = st.i + 1;
  return { ...st, i, hold: 0, done: st.steps[i] === 'done' };
}

// onTop: on foot at the top of the Plattform; the way back to the car starts down the stair, so that step names it and how to look around
export function tutorialHint(st, foot, coarse, onTop = false) {
  const d = stepDef(tutorialStepId(st));
  if (d.id === 'getIn' && foot && onTop) return { key: coarse ? 'tutStepDownTouch' : 'tutStepDown', how: howTo(stepDef('climb'), coarse), n: st.cp + 1, of: st.cps };
  if (d.needs === 'car' && foot) return { key: 'tutNeedCar', how: howTo(stepDef('getIn'), coarse), n: 0, of: 0 };
  if (d.needs === 'foot' && !foot) return { key: 'tutNeedFoot', how: howTo(stepDef('getOut'), coarse), n: 0, of: 0 };
  return { key: d.hint, how: howTo(d, coarse), n: st.cp + 1, of: st.cps };
}