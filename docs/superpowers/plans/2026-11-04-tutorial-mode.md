# Tutorial Mode Implementation Plan (#534)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sixth start-screen mode **Tutorial** that walks a newcomer through drive, brake, three checkpoints, nitro, J jump to the Plattform Sisslerfeld, Z get out, climb the deck, X photo of the DSM chimney, Z get back in; every step completes on its own when the game observes the action; preselected on the first visit.

**Architecture:** A pure module `tutorial.js` holds the steps, the Hochrhein start pose and three checkpoints, the step state machine `tutorialStep(state, observed)` and `howTo` (input wording from `controls.js`, key cap on desktop, touch control on a coarse pointer). `index.html` keeps a run object `TUT_RUN` (like `VIEW_RUN`), gathers the observation each frame in `stepTutorial` (dispatched from `stepRace` like `stepView`), writes a dedicated hint line `#tuthint` in `#tc`, toasts each completed step, and adds the mode button, the first-visit highlight, the pause entry "End tutorial" and the read-only hook `window.__mm.tutorial()`. `startscreen.js` and `pause.js` learn the new mode.

**Tech Stack:** Vanilla ES modules, no build; `node --test tests/*.test.mjs` for pure modules; pytest + Playwright (`tests/test_*.py`, `server` fixture from `tests/conftest.py`) for the browser.

**Spec:** `docs/superpowers/specs/2026-11-04-tutorial-mode-design.md` (approved by the maintainer). Read it first; this plan does not change its decisions.

## Dependency

- **#535 phase 2 (phone controls: `touch.js`, joystick, Z/J/C buttons, ☰ menu) must be merged to `main` before this plan runs.** Check with `test -f touch.js && grep -n "touch" controls.js`. If `touch.js` is missing on `main`, stop and report; do not implement the tutorial against the old `#touch` buttons.
- Phase 2 shifts line numbers in `index.html`. The anchors below are from `main` at `4f4b3e2` (before phase 2). Every anchor also quotes a `grep` pattern; find the spot by the pattern, not by the number.
- Read `controls.js` and `touch.js` on `main` before Task 1. If phase 2 added touch metadata to the entries (for example a touch label or symbol field, or a `touch` value for `nitro`), use it in `howTo` (Task 1) in place of the generic `label`; keep the return shape `{ via, label }` and add a field only if needed, and adapt the `howTo` phone test to it. If phase 2 changed the `touch` object in `index.html` (`{ x, y, g, b, h }`), use its steering field in `steeringHeld()` (Task 5).

## Global Constraints

- Buildless: no new dependency, no framework, no `package.json`. Do not add a signalling server or anything outside the files listed per task.
- Mode id `tutorial`; `MODES` becomes `['cruise', 'trial', 'blitz', 'hunt', 'view', 'tutorial']`. The button `#tutorialbtn` sits right after `#viewbtn` in the start-screen bar.
- First visit = `localStorage['mm.tutorialDone']` absent (`TUT_KEY`). Finishing or quitting writes `'1'`. Every storage access in `try/catch`; a throwing storage counts as done.
- No clock in the tutorial: `R.state` stays `'armed'` during the run and becomes `'finished'` only after the last step. Do not touch `R.best`, `R.huntBest`, `R.blitzBest`.
- Do not reuse the race checkpoint meshes `cpObjs` / `CPS`; the tutorial has its own points and one marker group.
- Do not add a branch to the keydown dispatcher (`index.html:3498`, `addEventListener('keydown'`). The photo step reads `photoPending`; the jump step reads a landing set in `placeOnRoad`.
- All new UI text in en and de in `strings.js`. German: real umlauts, `ss` (never ß), capitalised `Du`/`Dir`/`Dein…`. `tests/strings.test.mjs` demands identical key sets and equal function arity.
- Commits: Conventional Commits, English, ending with the session's `Co-Authored-By` line. CHANGELOG entry hand-written under `## [Unreleased]` → `### Added`, player voice, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`. Never `git cliff -o`.
- Tests: TDD for the pure modules. Playwright only for the files named in each task, in the foreground, never `run_in_background`; do not run the full ~2 h suite. Commit and push the branch **before** starting Playwright.

## Review Focus

1. **Existing Playwright tests and the first-visit preselect.** A fresh browser context is a first visitor. Task 4 seeds `mm.tutorialDone` in `tests/hermetic_api.py` unless the URL has `firstvisit`; check that `test_cruise.py::test_cruise_is_preselected_and_enter_starts_it` and `test_viewpoints.py::test_ehrendingen_has_no_viewpoints_and_falls_back_to_cruise` still see `cruisebtn` focused.
2. **The other modes are unchanged.** `startRace` gets a start pose per mode: for every mode except `tutorial` the car must still start at `START` and the camera at `START.x + 12` exactly as before. `openPause` hides buttons per mode: Cruise still hides only Restart, the race modes show the full menu, `#pausetutorial` is hidden outside the tutorial.
3. **The photo step.** `stepTutorial` runs inside `loop` before `renderer.render` and `capturePhoto` (`index.html:5099`), so it sees `photoPending` set by X between frames. A Testhub screenshot (`photoSink` set) must not count. A mis-aimed photo on the deck gets `viewAim` as its toast, a photo elsewhere `viewMiss`.
4. **Hint line vs toasts.** `#tuthint` is its own element; no toast may write into it, and it is written only when its text changes.
5. **Touch wording** comes from `controls.js` through `howTo`; no key letters on a coarse pointer (except where the phone button itself shows the letter, as phase 2 decides).

---

### Task 1: `tutorial.js`, the pure step logic (TDD)

**Files:**
- Create: `tutorial.js`
- Test: `tests/tutorial.test.mjs` (new)

**Interfaces:**
- Consumes: `entriesFor(context)` from `controls.js` (entries `{ action, keys, cap, touch, label }`).
- Produces:
  - `TUT = { driveKmh: 20, brakeKmh: 5, cpRadius: 8, nitroS: 1, jumpNearM: 60, toastS: 3, endS: 6 }`, `TUT_KEY = 'mm.tutorialDone'`
  - `TUTORIAL_STEPS`: `[{ id, needs: 'car'|'foot'|null, context, action, key?, touchLabel?, hint }]`, ids in order `drive, brake, checkpoints, nitro, jump, getOut, climb, photo, getIn, done`
  - `TUTORIAL_DEFS.hochrhein = { start: { x, z, th }, cps: [{ x, z } ×3] }`, `tutorialFor(region) -> def | null`
  - `tutorialDoneFrom(stored) -> boolean`, `keyCap(code) -> string`
  - `howTo(step, coarse) -> { via: 'key', cap } | { via: 'button', label } | { via: 'menu', label } | null`
  - `stepsFor(coarse) -> string[]` (step ids; a step whose action has no input on this device is left out)
  - `tutorialStart(steps, cps) -> st`, st = `{ steps, i, cp, cps, hold, steered, done }`; `tutorialStepId(st) -> id`
  - `tutorialStep(st, o) -> st'` (pure, never mutates `st`), o = `{ dt, kmh, steering, nitro, foot, cpDist, jumpedNear, onDeck, photoAimed }`
  - `tutorialHint(st, foot, coarse) -> { key, how, n, of }` (`key` a `strings.js` key; `n`/`of` the checkpoint counter)

- [ ] **Step 1: Write the failing tests** `tests/tutorial.test.mjs`:

```js
// #534: the tutorial's pure step logic. No DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesFor } from '../controls.js';
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
```

- [ ] **Step 2: Run** `node --test tests/tutorial.test.mjs`. Expected: FAIL (`Cannot find module '../tutorial.js'`).

- [ ] **Step 3: Implement** `tutorial.js`:

```js
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

export function tutorialHint(st, foot, coarse) {
  const d = stepDef(tutorialStepId(st));
  if (d.needs === 'car' && foot) return { key: 'tutNeedCar', how: howTo(stepDef('getIn'), coarse), n: 0, of: 0 };
  if (d.needs === 'foot' && !foot) return { key: 'tutNeedFoot', how: howTo(stepDef('getOut'), coarse), n: 0, of: 0 };
  return { key: d.hint, how: howTo(d, coarse), n: st.cp + 1, of: st.cps };
}
```

- [ ] **Step 4: Run** `node --test tests/tutorial.test.mjs`. Expected: PASS. If `howTo_Phone_FollowsTheTouchColumnOfControls` or `howTo_Desktop_…` fails because #535 phase 2 changed an entry's `cap`/`touch`/`label`, adapt `howTo` to the table on `main` (see Dependency), not the table to the test.
- [ ] **Step 5: Commit** `git add tutorial.js tests/tutorial.test.mjs && git commit -m "feat(tutorial): pure step logic and input wording (#534)"`

---

### Task 2: `startscreen.js` and `pause.js` learn the mode (TDD)

**Files:**
- Modify: `startscreen.js:4-28` (`MODES`, `allowedModes`, `startModeFrom`, `lastModeFrom`, `modeTextKey`)
- Modify: `pause.js:9-12` (`pauseButtonsFor`)
- Test: `tests/startscreen.test.mjs:8-10` and new tests, `tests/pause.test.mjs` new test

**Interfaces:**
- Produces: `MODES` with `'tutorial'` last; `startModeFrom(search, raceless, hasViewpoints = false, tutorialDone = true)`; `lastModeFrom` never returns `'tutorial'`; `modeTextKey('tutorial') === 'tutorialIntro'`; `pauseButtonsFor('tutorial')` = `['pauseresume', 'pausevehicle', 'pauseabout', 'pausekeybar', 'pausetutorial']`.

- [ ] **Step 1: Failing tests.** In `tests/startscreen.test.mjs` replace the MODES test (`:8-10`; the list changes on purpose):

```js
test('MODES are cruise, the three race modes, the viewpoint hunt and the tutorial in bar order', () => {
  assert.deepEqual(MODES, ['cruise', 'trial', 'blitz', 'hunt', 'view', 'tutorial']);
});
```

  and append:

```js
test('startModeFrom_FirstVisit_PreselectsTheTutorialWhereThereAreViewpoints', () => {
  assert.equal(startModeFrom('', false, true, false), 'tutorial');
  assert.equal(startModeFrom('', false, true, true), 'cruise');
  assert.equal(startModeFrom('', false, true), 'cruise', 'done is the default');
  assert.equal(startModeFrom('?mode=blitz', false, true, false), 'blitz', '?mode= wins');
  assert.equal(startModeFrom('', false, false, false), 'cruise', 'no viewpoints, no tutorial');
  assert.equal(startModeFrom('', true, true, false), 'cruise', 'a raceless world has no tutorial');
  assert.equal(startModeFrom('?mode=tutorial', false, true, true), 'tutorial');
  assert.equal(startModeFrom('?mode=tutorial', false, false, false), 'cruise');
});

test('lastModeFrom_NeverReopensTheTutorial', () => {
  assert.equal(lastModeFrom('tutorial', false, true), 'cruise');
  assert.equal(lastModeFrom('view', false, true), 'view');
});

test('modeTextKey_Tutorial_HasItsIntro_AndNoCheckpoints', () => {
  assert.equal(modeTextKey('tutorial', { intro: 'introHochrhein' }), 'tutorialIntro');
  assert.equal(hasCheckpoints('tutorial'), false);
});
```

  In `tests/pause.test.mjs` append:

```js
test('pauseButtonsFor_Tutorial_EndsTheTutorialInsteadOfRestartOrMainMenu', () => {
  assert.deepEqual(pauseButtonsFor('tutorial'), ['pauseresume', 'pausevehicle', 'pauseabout', 'pausekeybar', 'pausetutorial']);
  assert.ok(!PAUSE_BUTTONS.includes('pausetutorial'), 'the other modes never show it');
});
```

- [ ] **Step 2: Run** `node --test tests/startscreen.test.mjs tests/pause.test.mjs`. Expected: the new/changed tests FAIL.
- [ ] **Step 3: Implement.** `startscreen.js`:

```js
export const MODES = ['cruise', 'trial', 'blitz', 'hunt', 'view', 'tutorial'];
// #551: a generated world without a race has no checkpoints, so only these two make sense there
const RACELESS_MODES = ['cruise', 'hunt'];

// #508: the viewpoint hunt needs a world with hand-picked viewpoints (viewpoints.js); #534: so does the tutorial (it climbs the Plattform viewpoint)
const NEEDS_VIEWPOINTS = new Set(['view', 'tutorial']);
const allowedModes = (raceless, hasViewpoints) => (raceless ? RACELESS_MODES : MODES).filter(m => !NEEDS_VIEWPOINTS.has(m) || hasViewpoints);

// #551: the preselected mode: ?mode= when it names an allowed mode, else cruise (the default); #534: on a first visit the tutorial
export function startModeFrom(search, raceless, hasViewpoints = false, tutorialDone = true) {
  const wanted = new URLSearchParams(search).get('mode'), allowed = allowedModes(raceless, hasViewpoints);
  if (allowed.includes(wanted)) return wanted;
  return !tutorialDone && allowed.includes('tutorial') ? 'tutorial' : 'cruise';
}

// the mode the slot shows when nothing is focused: the last played one (localStorage mm.lastMode), validated; never the tutorial (#534)
export function lastModeFrom(stored, raceless, hasViewpoints = false) {
  return stored !== 'tutorial' && allowedModes(raceless, hasViewpoints).includes(stored) ? stored : 'cruise';
}
```

  and in `modeTextKey` add `if (mode === 'tutorial') return 'tutorialIntro';` after the `view` line.

  `pause.js`, replace `pauseButtonsFor`:

```js
// #534: the tutorial has no race to restart and leaves through "End tutorial" instead of Main menu
const TUTORIAL_PAUSE = ['pauseresume', 'pausevehicle', 'pauseabout', 'pausekeybar', 'pausetutorial'];

// #551: cruise has no race to restart, so its menu drops "Restart race"
export function pauseButtonsFor(mode) {
  if (mode === 'tutorial') return TUTORIAL_PAUSE;
  return mode === 'cruise' ? PAUSE_BUTTONS.filter(id => id !== 'pauserestart') : PAUSE_BUTTONS;
}
```

- [ ] **Step 4: Run** `node --test tests/*.test.mjs`. Expected: PASS (`tests/analytics.test.mjs` is generic over the list).
- [ ] **Step 5: Commit** `git commit -am "feat(tutorial): tutorial mode in the start screen and pause rules (#534)"`

---

### Task 3: Strings (en + de)

**Files:**
- Modify: `strings.js` (en block after `albumMissing`, `strings.js:161`; de block after `albumMissing`, `strings.js:693`)
- Test: `tests/strings.test.mjs` (append)

- [ ] **Step 1: Failing test** (append to `tests/strings.test.mjs`):

```js
test('tutorial texts exist in both languages, name the input and address the player as Du (#534)', () => {
  assert.equal(translate('en', 'tutStepDrive', 'WASD'), 'Drive off with WASD: speed up to 20 km/h and steer a little');
  assert.equal(translate('de', 'tutStepDrive', 'WASD'), 'Fahr los mit WASD: gib Gas bis 20 km/h und lenk ein wenig');
  assert.equal(translate('de', 'tutStepCheckpoints', '', 2, 3), 'Folge dem gelben Pfeil durch Checkpoint 2 von 3');
  assert.match(translate('de', 'tutStepGetIn', 'Z'), /Deinem Auto.*Z$/);
  assert.equal(translate('de', 'tutButton', 'aussteigen'), '[aussteigen]');
  assert.equal(translate('en', 'tutMenu', 'Photo'), '☰ → Photo');
  assert.equal(translate('de', 'tutPause'), 'Tutorial beenden');
  assert.equal(translate('en', 'tutorial'), 'Tutorial');
  assert.equal(translate('de', 'modeTutorial', 'Hochrhein'), 'Tutorial · Hochrhein');
});
```

- [ ] **Step 2: Run** `node --test tests/strings.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Add** to the **en** block after `albumMissing: 'not yet',`:

```js
  tutorial: 'Tutorial',
  modeTutorial: (r) => `Tutorial · ${r}`,
  tutorialIntro: 'New here? Step by step: drive, brake, follow the arrow, nitro, jump to a place, walk up the Plattform Sisslerfeld and take a photo. Each step ticks itself off as soon as you have done it.',
  tutorialFinishedText: 'Tutorial done. Try the Viewpoints next, or just cruise around.',
  tutStepsLabel: 'steps',
  tutStepDrive: (how) => `Drive off with ${how}: speed up to 20 km/h and steer a little`,
  tutStepBrake: (how) => `Brake with ${how} until you almost stand still`,
  tutStepCheckpoints: (how, n, of) => `Follow the yellow arrow through checkpoint ${n} of ${of}`,
  tutStepNitro: (how) => `Hold ${how} for nitro, one second`,
  tutStepJump: (how) => `Press ${how}, type “Plattform” and pick Plattform Sisslerfeld`,
  tutStepGetOut: (how) => `Get out with ${how}`,
  tutStepClimb: (how) => `Walk with ${how} through the door and up the stair onto the deck`,
  tutStepPhoto: (how) => `Face the DSM chimney (follow the arrow) and take a photo with ${how}`,
  tutStepGetIn: (how) => `Walk back to your car and get in with ${how}`,
  tutNeedCar: (how) => `Get back in the car first: ${how}`,
  tutNeedFoot: (how) => `Get out first: ${how}`,
  tutKey: (cap) => cap,
  tutButton: (label) => `[${label}]`,
  tutMenu: (label) => `☰ → ${label}`,
  tutStepOk: (n, of) => `✓ Step ${n}/${of} done`,
  tutCpOk: (n, of) => `Checkpoint ${n}/${of}`,
  tutCpTarget: (n, of) => `Tutorial checkpoint ${n}/${of}`,
  tutCarTarget: 'Your car',
  tutDoneBig: 'Well done! You know the basics now. Next: Viewpoints or Cruise.',
  tutResultTitle: 'Tutorial done',
  tutResultNext: 'Next: Viewpoints or Cruise',
  tutPause: 'End tutorial',
```

  and to the **de** block after `albumMissing: 'noch nicht',`:

```js
  tutorial: 'Tutorial',
  modeTutorial: (r) => `Tutorial · ${r}`,
  tutorialIntro: 'Neu hier? Schritt für Schritt: fahren, bremsen, dem Pfeil folgen, Nitro, an einen Ort springen, zu Fuss auf die Plattform Sisslerfeld steigen und ein Foto machen. Jeder Schritt hakt sich selbst ab, sobald Du ihn geschafft hast.',
  tutorialFinishedText: 'Tutorial geschafft. Probier als Nächstes die Aussichtspunkte oder fahr einfach herum.',
  tutStepsLabel: 'Schritte',
  tutStepDrive: (how) => `Fahr los mit ${how}: gib Gas bis 20 km/h und lenk ein wenig`,
  tutStepBrake: (how) => `Brems mit ${how}, bis Du fast stehst`,
  tutStepCheckpoints: (how, n, of) => `Folge dem gelben Pfeil durch Checkpoint ${n} von ${of}`,
  tutStepNitro: (how) => `Halte ${how} gedrückt für Nitro, eine Sekunde lang`,
  tutStepJump: (how) => `Drück ${how}, tipp „Plattform“ und wähl Plattform Sisslerfeld`,
  tutStepGetOut: (how) => `Steig aus mit ${how}`,
  tutStepClimb: (how) => `Geh mit ${how} durch die Tür und die Treppe hoch auf die Plattform`,
  tutStepPhoto: (how) => `Schau zum DSM-Kamin (folge dem Pfeil) und mach ein Foto mit ${how}`,
  tutStepGetIn: (how) => `Geh zurück zu Deinem Auto und steig ein mit ${how}`,
  tutNeedCar: (how) => `Steig zuerst wieder ins Auto: ${how}`,
  tutNeedFoot: (how) => `Steig zuerst aus: ${how}`,
  tutKey: (cap) => cap,
  tutButton: (label) => `[${label}]`,
  tutMenu: (label) => `☰ → ${label}`,
  tutStepOk: (n, of) => `✓ Schritt ${n}/${of} geschafft`,
  tutCpOk: (n, of) => `Checkpoint ${n}/${of}`,
  tutCpTarget: (n, of) => `Tutorial-Checkpoint ${n}/${of}`,
  tutCarTarget: 'Dein Auto',
  tutDoneBig: 'Super! Jetzt kennst Du das Wichtigste. Weiter mit Aussichtspunkte oder Herumfahren.',
  tutResultTitle: 'Tutorial geschafft',
  tutResultNext: 'Weiter: Aussichtspunkte oder Herumfahren',
  tutPause: 'Tutorial beenden',
```

- [ ] **Step 4: Run** `node --test tests/*.test.mjs`. Expected: PASS (same keys, same arity, no ß).
- [ ] **Step 5: Commit** `git commit -am "feat(tutorial): tutorial texts in English and German (#534)"`

---

### Task 4: Test harness: every browser context is a returning player

**Files:**
- Modify: `tests/hermetic_api.py` (whole file, 33 lines)

Why: from Task 5 on, a context without `mm.tutorialDone` preselects the tutorial, so every existing test that expects `cruisebtn` focused would break. The harness seeds the flag; a test that wants a first visit adds `firstvisit` to the URL (the game ignores that parameter).

- [ ] **Step 1: Implement.** Add to `tests/hermetic_api.py` (and extend the module docstring with one sentence: "#534: every new context also starts as a returning player (`mm.tutorialDone` set) unless the page URL contains `firstvisit`, so the first-visit tutorial preselect does not change what the other tests see."):

```python
# #534: a fresh context is a first visitor and would get the tutorial preselected; tests opt in with ?firstvisit=1
SEED_TUTORIAL_DONE = """(() => { if (location.search.includes('firstvisit')) return;
  try { if (localStorage.getItem('mm.tutorialDone') === null) localStorage.setItem('mm.tutorialDone', '1'); } catch (e) {} })();"""


def seed_returning_player(context):
    context.add_init_script(SEED_TUTORIAL_DONE)
```

  and call `seed_returning_player(context)` next to `route_gallery(context)` in `hermetic_new_context`, and `seed_returning_player(page.context)` next to `route_gallery(page.context)` in `hermetic_new_page` (init scripts added before the first `goto` apply to it).
- [ ] **Step 2: Commit** `git commit -am "test(tutorial): browser contexts start as returning players (#534)"`

---

### Task 5: Wire the tutorial into `index.html`

**Files:**
- Modify: `index.html` (anchors below, `main` at 4f4b3e2; find each by its grep pattern)
- Modify: `tests/test_start_screen.py:8`, `:36-46`; `tests/test_carselect.py:62` (bar order gains `tutorialbtn`, intended)

**Interfaces:**
- Consumes: Task 1 exports; `standsAt`, `shotPoints` (`viewpoints.js`); `pauseButtonsFor` (Task 2); strings (Task 3).
- Produces: `#tutorialbtn`, `#tuthint`, `#pausetutorial`; `TUT_RUN = { st, endIn }`; `window.__mm.tutorial() -> { step, done }`.

- [ ] **Step 1: Markup.**
  - Start bar, after `#viewbtn` (`index.html:449`, grep `id="viewbtn"`):
    `<button id="tutorialbtn" class="btn" type="button" disabled data-i18n="tutorial">Tutorial</button>`
  - `#tc`, right after `#cpname` (`:320`, grep `id="cpname"`):
    `<div id="tuthint" aria-live="polite"></div>`
  - Pause panel, after `#pausemenu` (`:622`, grep `id="pausemenu"`):
    `<button id="pausetutorial" class="btn" type="button" data-i18n="tutPause" hidden>End tutorial</button>`

- [ ] **Step 2: CSS.**
  - After the `#cpname{…}` rule (`:24`):
    `#tuthint{max-width:min(560px,calc(100vw - 32px));margin-top:4px;padding:6px 12px;box-sizing:border-box;background:rgba(20,23,29,.88);border:3px solid var(--sun);color:var(--cream);font-size:18px;font-weight:700;letter-spacing:.5px;line-height:1.25;text-align:center;text-shadow:none}#tuthint:empty{display:none}   /* #534: the tutorial's instruction, its own line so a toast never replaces it */`
  - After the `body.cruise …{display:none}` rule (`:89`):
    `body.tutorial #tr{display:none}#tutorialbtn.first{outline:4px solid var(--sun);outline-offset:3px}   /* #534: no clock in the tutorial; its button glows on the first visit */`
  - In the phone rule (`:227`, grep `#viewbtn:not([hidden])~#carbtn{grid-column:1/-1}`) append after that selector's block: `#tutorialbtn:not([hidden])~#carbtn{grid-column:auto}` and extend the trailing comment with `#534: tutorial + car share the last row`.

- [ ] **Step 3: Imports.** After the `viewpoints.js` import (`:682`, grep `from './viewpoints.js'`):
  `import { TUT, TUT_KEY, tutorialFor, tutorialDoneFrom, stepsFor, tutorialStart, tutorialStep, tutorialStepId, tutorialHint } from './tutorial.js';   // #534`
  and add `standsAt` to the `viewpoints.js` import list.

- [ ] **Step 4: The checkpoint marker.** After the `const cpObjs = …` line (`:2511`, grep `const cpObjs = CPS.map`):

```js
// #534: the tutorial's one checkpoint marker, same look as a race checkpoint; moved to the current tutorial checkpoint
const tutMark = new THREE.Group();
{ const pillar = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 40, 16, 1, true), cpMat); pillar.position.y = 20; const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.35, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffc61a })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; tutMark.add(pillar, ring); tutMark.visible = false; scene.add(tutMark); }
```

- [ ] **Step 5: The jump landing.** Directly before `function placeOnRoad(` (`:3573`):
  `let LAST_JUMP = null;   // #534: where the last jump landed [x, z]; the tutorial's jump step reads and clears it`
  and inside `placeOnRoad`, right after `P.safe = [x, z, th];`, add `LAST_JUMP = [x, z];`.

- [ ] **Step 6: Run state, availability, first visit.** After `const VIEWPOINTS = …` (`:4448`):

```js
// #534: the tutorial -- its start and checkpoints (tutorial.js) and the Plattform deck it climbs (the viewpoint hunt's spot)
const TUT_DEF = tutorialFor(REGION), TUT_VP = VIEWPOINTS.find(v => v.id === 'plattform') || null, TUT_ON = !!TUT_DEF && !!TUT_VP;
const TUT_COARSE = matchMedia('(pointer:coarse)').matches;
const tutorialDoneStored = () => { try { return tutorialDoneFrom(localStorage.getItem(TUT_KEY)); } catch (e) { return true; } };   // storage blocked: never nag
let TUT_RUN = { st: tutorialStart(stepsFor(TUT_COARSE), TUT_DEF ? TUT_DEF.cps.length : 0), endIn: 0 };
function startTutorialRun() { TUT_RUN = { st: tutorialStart(stepsFor(TUT_COARSE), TUT_DEF ? TUT_DEF.cps.length : 0), endIn: 0 }; LAST_JUMP = null; tutMark.visible = false; $('tuthint').textContent = ''; }
```

  Change `const START_MODE = startModeFrom(location.search, RACELESS, VIEWPOINTS.length > 0);` (`:4466`) to
  `let START_MODE = startModeFrom(location.search, RACELESS, VIEWPOINTS.length > 0, !TUT_ON || tutorialDoneStored());   // … #534: the tutorial on a first visit`
  (keep the existing comment, append the #534 part).

- [ ] **Step 7: `startRace` / `resetMode`** (`:4468`, grep `function startRace(`; `:4678`, grep `function resetMode(`). In `startRace` only:
  - replace `P.safe = [START.x, START.z, START.th];` with `P.safe = startPose(mode);`
  - replace `camPos.set(START.x + 12, P.y + 5, START.z);` with `camPos.set(P.x + (mode === 'tutorial' ? -12 : 12), P.y + 5, P.z);` (unchanged for every other mode: `P.x` is `START.x` there after `resetCar`; the tutorial faces east, so its camera starts west of the car)
  - replace `startViewRun(); $('overlay').hidden = true;` with `startViewRun(); startTutorialRun(); $('overlay').hidden = true;`
  - define above `startRace`: `const startPose = (mode) => mode === 'tutorial' && TUT_ON ? [TUT_DEF.start.x, TUT_DEF.start.z, TUT_DEF.start.th] : [START.x, START.z, START.th];   // #534`
  In `resetMode` replace `startViewRun(); }` with `startViewRun(); startTutorialRun(); }`.

- [ ] **Step 8: HUD mode line and pips.**
  - `modeKey` (`:4470`): prepend `R.mode === 'tutorial' ? 'modeTutorial' :` after `const modeKey = () =>`.
  - `renderModeLine` (`:4471`), replace the function with:

```js
function renderModeLine() { document.body.classList.toggle('cruise', R.mode === 'cruise'); document.body.classList.toggle('tutorial', R.mode === 'tutorial'); const hunt = R.mode === 'hunt', view = R.mode === 'view', blitz = R.mode === 'blitz', tut = R.mode === 'tutorial'; $('tl').querySelector('.mode').textContent = tr(modeKey(), REGION.name); $('tr').querySelector('.lbl').textContent = tr(blitz ? 'timeLeft' : 'time'); $('tl').querySelector('[data-i18n="checkpointsLabel"]').textContent = tr(hunt ? 'presentsLabel' : view ? 'viewsLabel' : tut ? 'tutStepsLabel' : 'checkpointsLabel'); setPipCount(hunt ? HUNT_RUN.spots.length : view ? VIEWPOINTS.length : tut ? TUT_RUN.st.steps.length - 1 : CPS.length); }   // #128: after applyStaticStrings, which resets the labels to the trial's; #534: the tutorial counts its steps
```

  - `updatePips` (`:4474`): replace `R.mode === 'view' ? VIEW_RUN.shot :` with `R.mode === 'view' ? VIEW_RUN.shot : R.mode === 'tutorial' ? TUT_RUN.st.steps.slice(0, -1).map((_, k) => k < TUT_RUN.st.i) :`.

- [ ] **Step 9: The step loop.** In `stepRace` (`:4476`) replace `if (R.mode === 'view') { stepView(dt); return; }` with `if (R.mode === 'view') { stepView(dt); return; } if (R.mode === 'tutorial') { stepTutorial(dt); return; }`. After `function showViewResult` (`:4518`) add:

```js
// #534: the tutorial -- no clock (R.state stays 'armed'); each frame the game's own signals advance the step (tutorial.js)
function stepTutorial(dt) {
  if (TUT_RUN.endIn > 0) { TUT_RUN.endIn -= dt; if (TUT_RUN.endIn <= 0) showTutorialResult(); }
  if (R.state !== 'armed' || !TUT_ON) { R.target = null; tutMark.visible = false; return; }
  const before = TUT_RUN.st;
  TUT_RUN.st = tutorialStep(before, tutorialObserved(dt));
  announceTutorial(before, TUT_RUN.st);
  if (R.state !== 'armed') return;   // the last step just finished the run
  R.target = tutorialTarget(TUT_RUN.st);
  placeTutMark(TUT_RUN.st);
  renderTutorialHint();
}
const steeringHeld = () => !!(keys.KeyA || keys.KeyD || keys.ArrowLeft || keys.ArrowRight || touch.l || touch.r || touch.x);   // #535 phase 2: use the stick field its touch object has
function tutorialObserved(dt) {
  const st = TUT_RUN.st, cp = TUT_DEF.cps[st.cp], pose = shotPose(), onDeck = FOOT.on && standsAt(TUT_VP, pose);
  const shot = photoPending && !photoSink, aimed = shot && onDeck && shotPoints(TUT_VP, pose) > 0, jump = LAST_JUMP;
  LAST_JUMP = null;
  if (shot && !aimed && tutorialStepId(st) === 'photo') photoNote = onDeck ? tr('viewAim', TUT_VP.subjectN) : tr('viewMiss');
  return { dt, kmh: Math.hypot(P.vx, P.vz) * 3.6, steering: steeringHeld(), nitro: !!P.nitro, foot: FOOT.on,
    cpDist: cp ? Math.hypot(cp.x - P.x, cp.z - P.z) : Infinity, onDeck, photoAimed: aimed,
    jumpedNear: !!jump && Math.hypot(jump[0] - TUT_VP.x, jump[1] - TUT_VP.z) <= TUT.jumpNearM };
}
function announceTutorial(a, b) {
  if (b.cp > a.cp) { SFX.checkpoint(); toast(tr('tutCpOk', b.cp, b.cps), TUT.toastS); }
  if (b.i === a.i) return;
  R.done = b.i; updatePips();
  if (b.done) { finishTutorial(); return; }
  const ok = tr('tutStepOk', b.i, b.steps.length - 1);
  if (tutorialStepId(a) === 'photo') photoNote = ok; else toast(ok, TUT.toastS);   // the photo's own toast carries it, so "Photo saved" does not replace it
}
function tutorialTarget(st) {
  const id = tutorialStepId(st), c = TUT_DEF.cps[st.cp];
  if (id === 'checkpoints' && c) return { x: c.x, z: c.z, i: st.cp, tutLabel: tr('tutCpTarget', st.cp + 1, st.cps) };
  if (id === 'climb') return { x: TUT_VP.x, z: TUT_VP.z, i: -2, tutLabel: TUT_VP.n };
  if (id === 'photo') return { x: TUT_VP.sx, z: TUT_VP.sz, i: -2, tutLabel: tr('viewAimTarget', TUT_VP.subjectN) };
  if (id === 'getIn' && FOOT.car) return { x: FOOT.car.x, z: FOOT.car.z, i: -2, tutLabel: tr('tutCarTarget') };
  return null;
}
function placeTutMark(st) { const c = tutorialStepId(st) === 'checkpoints' && TUT_DEF.cps[st.cp]; tutMark.visible = !!c; if (c) tutMark.position.set(c.x, groundH(c.x, c.z), c.z); }
const howText = (how) => how.via === 'key' ? tr('tutKey', how.cap) : tr(how.via === 'button' ? 'tutButton' : 'tutMenu', tr(how.label));
function renderTutorialHint() { const h = tutorialHint(TUT_RUN.st, FOOT.on, TUT_COARSE), text = tr(h.key, h.how ? howText(h.how) : '', h.n, h.of); if ($('tuthint').textContent !== text) $('tuthint').textContent = text; }   // written only on a change
function finishTutorial() { markTutorialDone(); R.state = 'finished'; SFX.finish(); trackModeEnd('finished'); R.last = { mode: 'tutorial' }; R.target = null; tutMark.visible = false; $('tuthint').textContent = tr('tutResultNext'); toastBig(tr('tutDoneBig')); TUT_RUN.endIn = TUT.endS; }
function showTutorialResult() { TUT_RUN.endIn = 0; if (R.state !== 'finished' || R.mode !== 'tutorial') return; endFoot(); $('result').hidden = false; renderOverlay(); $('overlay').hidden = false; $(!$('viewbtn').hidden ? 'viewbtn' : 'cruisebtn').focus(); }   // the suggestion: Viewpoints next
function markTutorialDone() { try { localStorage.setItem(TUT_KEY, '1'); } catch (e) { } START_MODE = startModeFrom(location.search, RACELESS, VIEWPOINTS.length > 0, true); $('tutorialbtn').classList.remove('first'); }
function quitTutorial() { markTutorialDone(); toMainMenu(); }   // #534: End tutorial in the pause menu; no clock, so no abandon question
```

  `touch` is the object at `index.html:3503` (grep `const touch = {`); after #535 phase 2 it has the stick field, keep only the fields that exist.

- [ ] **Step 10: HUD text, result, overlay.**
  - `hud` (`:5020`, grep `$('cpname').textContent = R.target.view ?`): replace `$('cpname').textContent = R.target.view ?` with `$('cpname').textContent = R.target.tutLabel !== undefined ? R.target.tutLabel : R.target.view ?`.
  - `resultHtml` (`:4530`): right after `function resultHtml(last) {` insert `if (last.mode === 'tutorial') return \`<small>${tr('tutResultTitle')}</small>${tr('tutResultNext')}\`;`.
  - `MODE_BTN` (`:4533`): add `tutorialbtn: 'tutorial'` after `viewbtn: 'view'`.
  - `modeText` (`:4535`): replace `mode === 'view' ? 'viewFinishedText' :` with `mode === 'view' ? 'viewFinishedText' : mode === 'tutorial' ? 'tutorialFinishedText' :`.
  - `renderOverlay` (`:4539`): after `$('viewbtn').textContent = tr(done && R.mode === 'view' ? 'retry' : 'view');` add `$('tutorialbtn').textContent = tr('tutorial');`.
  - After `if (!VIEWPOINTS.length) $('viewbtn').hidden = true;` (`:4558`) add:

```js
if (!TUT_ON) $('tutorialbtn').hidden = true;   // #534: only where the Plattform viewpoint and the tutorial's points exist (Hochrhein)
if (START_MODE === 'tutorial' && TUT_ON) { SHOWN.mode = 'tutorial'; if (!tutorialDoneStored()) $('tutorialbtn').classList.add('first'); }   // #534: first visit: the slot shows the tutorial, its button glows
```

  - After `$('viewbtn').onclick = …` (`:4564`) add `$('tutorialbtn').onclick = () => { SFX.start(); startRace('tutorial'); };`.

- [ ] **Step 11: Pause.**
  - Next to `const inRun = …` (`:4673`) add `const PAUSE_ALL = [...new Set([...PAUSE_BUTTONS, ...pauseButtonsFor('tutorial')])];   // #534: every button any mode shows`.
  - `openPause` (`:4675`): replace `$('pauserestart').hidden = !pauseButtonsFor(R.mode).includes('pauserestart');` with `for (const id of PAUSE_ALL) $(id).hidden = !pauseButtonsFor(R.mode).includes(id);`.
  - After the `$('pausebtn').onclick = …` line (`:4688`) add `$('pausetutorial').onclick = quitTutorial;`.

- [ ] **Step 12: Debug hook.** After `window.__mm.viewSetEndIn = …` (`:4873`):
  `window.__mm.tutorial = () => ({ step: tutorialStepId(TUT_RUN.st), done: TUT_RUN.st.done });   // #534: read-only`

- [ ] **Step 13: Update the bar-order tests** (the list changes on purpose):
  - `tests/test_start_screen.py:8`: `BAR = ["cruisebtn", "startbtn", "blitzbtn", "huntbtn", "viewbtn", "tutorialbtn", "carbtn"]`; `:36` `range(5)` → `range(6)`; `:46` expected order `["startbtn", "blitzbtn", "huntbtn", "viewbtn", "tutorialbtn", "carbtn"]`; the docstring `5 + 2 buttons` → `6 + 2 buttons`.
  - `tests/test_carselect.py:62`: insert `"tutorialbtn"` after `"viewbtn"` in the expected list.
- [ ] **Step 14: Static checks.** `node --test tests/*.test.mjs` (PASS). Load check: `python3 -m http.server 8000` is not needed; the Playwright run in Task 6 is the load check.
- [ ] **Step 15: Commit** `git commit -am "feat(tutorial): tutorial mode with step hints, checkpoints and pause exit (#534)"` and **push the branch** before Task 6.

---

### Task 6: Playwright `tests/test_tutorial.py`

**Files:**
- Create: `tests/test_tutorial.py`

- [ ] **Step 1: Write the tests:**

```python
"""#534: the tutorial mode on Hochrhein (the OSM world; terrain blocked). Slow (Playwright): run in the foreground.
A first visit needs ?firstvisit=1: tests/hermetic_api.py seeds mm.tutorialDone in every other context."""
import math

from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.tutorial && window.__mm.plattform() && document.querySelector('#worldstatus')?.textContent"
T = 240000
DEFS = "async () => (await import('./tutorial.js')).TUTORIAL_DEFS.hochrhein"
FLAG = "() => localStorage.getItem('mm.tutorialDone')"
AIMED_AT_DSM = """() => { const v = window.__mm.views(), s = v.spots.find(q => q.id === 'plattform'), p = v.pose;
  const want = Math.atan2(s.sz - p.z, s.sx - p.x), have = Math.atan2(p.dz, p.dx);
  let d = Math.abs(want - have) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d < 0.3; }"""


def boot(p, server, query="", locale="en-US", phone=False):
    b = p.chromium.launch(args=ARGS)
    size = {"width": 390, "height": 844} if phone else {"width": 1280, "height": 720}
    page = b.new_context(viewport=size, has_touch=phone, locale=locale, accept_downloads=True).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def start(page):
    page.click("#tutorialbtn")
    page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)


def wait_step(page, step):
    page.wait_for_function("(s) => window.__mm.tutorial().step === s", arg=step, timeout=T)


def hold_until(page, keys, step):
    for k in keys:
        page.keyboard.down(k)
    wait_step(page, step)
    for k in keys:
        page.keyboard.up(k)


def hint(page):
    return page.text_content("#tuthint")


def test_first_visit_preselects_the_tutorial_and_a_returning_player_gets_cruise(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?firstvisit=1")
        first = page.evaluate("() => ({ ...window.__mm.startScreen(), glow: document.querySelector('#tutorialbtn').classList.contains('first'), label: document.querySelector('#tutorialbtn').textContent })")
        flag = page.evaluate(FLAG)
        b.close()
        b2, page2, errors2 = boot(p, server)
        again = page2.evaluate("() => ({ focus: document.activeElement.id, glow: document.querySelector('#tutorialbtn').classList.contains('first') })")
        b2.close()
    assert flag is None
    assert first["focus"] == "tutorialbtn" and first["mode"] == "tutorial" and first["glow"] is True and first["label"] == "Tutorial", first
    assert first["text"].startswith("New here?"), first
    assert again == {"focus": "cruisebtn", "glow": False}, again
    assert errors == [] and errors2 == []


def test_the_tutorial_runs_through_every_step_and_marks_itself_done(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?firstvisit=1")
        defs = page.evaluate(DEFS)
        start(page)
        begin = page.evaluate("() => ({ ...window.__mm.car(), road: window.__mm.roadDist(), line: document.querySelector('#tl .mode').textContent, pips: document.querySelector('#pips').children.length, clock: getComputedStyle(document.querySelector('#tr')).display })")
        page.wait_for_function("() => document.querySelector('#tuthint').textContent !== ''", timeout=T)
        hints = {"drive": hint(page)}
        hold_until(page, ["KeyW", "KeyD"], "brake")
        hold_until(page, ["KeyS"], "checkpoints")
        hints["checkpoints"] = hint(page)
        roads = []
        for k, cp in enumerate(defs["cps"], start=1):
            page.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [cp["x"], cp["z"]])
            roads.append(page.evaluate("() => window.__mm.roadDist()"))
            if k < len(defs["cps"]):
                page.wait_for_function("(k) => window.__mm.toast().text === `Checkpoint ${k}/3`", arg=k, timeout=T)
        wait_step(page, "nitro")
        hints["nitro"] = hint(page)
        hold_until(page, ["ShiftLeft", "KeyW"], "jump")
        hints["jump"] = hint(page)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        page.keyboard.type("Plattform")
        page.click("#jumplist li:has-text('Plattform Sisslerfeld')")
        wait_step(page, "getOut")
        page.keyboard.press("z")
        wait_step(page, "climb")
        out = page.evaluate("() => window.__mm.foot()")
        hints["climb"] = hint(page)
        plat = page.evaluate("() => window.__mm.plattform()")
        u = 9.84 / (2 * math.sqrt(3)) - 1   # 1 m inside the deck edge, as in test_plattform_stair.py
        x, z = plat["x"] + u * math.cos(plat["facing"]), plat["z"] + u * math.sin(plat["facing"])
        th = math.atan2(345.1 - z, 1065.2 - x)   # the DSM chimney landmark
        page.evaluate("([x, z, th, y]) => { window.__mm.place(x, z, th); window.__mm.setFootY(y); window.__mm.footSim(0.1, []); }", [x, z, th, plat["deckY"]])
        wait_step(page, "photo")
        page.wait_for_function(AIMED_AT_DSM, timeout=120000)
        page.keyboard.press("KeyX")
        wait_step(page, "getIn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [out["x"], out["z"]])
        page.keyboard.press("z")
        page.wait_for_function("() => window.__mm.tutorial().done", timeout=T)
        end = page.evaluate("() => ({ ...window.__mm.tutorial(), flag: localStorage.getItem('mm.tutorialDone'), toast: window.__mm.toast().text })")
        b.close()
    assert math.hypot(begin["x"] - defs["start"]["x"], begin["z"] - defs["start"]["z"]) < 3, begin
    assert begin["road"] < 4 and all(r < 4 for r in roads), (begin, roads)   # start and checkpoints sit on a road
    assert begin["line"] == "Tutorial · Hochrhein" and begin["pips"] == 9 and begin["clock"] == "none", begin
    assert "WASD" in hints["drive"] and "20 km/h" in hints["drive"], hints
    assert "checkpoint 1 of 3" in hints["checkpoints"], hints
    assert "Shift" in hints["nitro"] and "J" in hints["jump"] and "WASD" in hints["climb"], hints
    assert end["step"] == "done" and end["done"] is True and end["flag"] == "1", end
    assert end["toast"].startswith("Well done!"), end
    assert errors == []


def test_esc_offers_end_tutorial_which_marks_it_done_and_returns_to_cruise(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?firstvisit=1")
        start(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=T)
        shown = page.evaluate("() => Object.fromEntries(['pauserestart', 'pausemenu', 'pausetutorial'].map(i => [i, !document.getElementById(i).hidden]))")
        seen = []
        for _ in range(5):
            page.keyboard.press("ArrowDown")
            seen.append(page.evaluate("() => document.activeElement.id"))
        page.click("#pausetutorial")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        after = page.evaluate("() => ({ abandon: !document.querySelector('#abandon').hidden, focus: document.activeElement.id, glow: document.querySelector('#tutorialbtn').classList.contains('first'), flag: localStorage.getItem('mm.tutorialDone') })")
        b.close()
    assert shown == {"pauserestart": False, "pausemenu": False, "pausetutorial": True}, shown
    assert seen == ["pausevehicle", "pauseabout", "pausekeybar", "pausetutorial", "pauseresume"], seen
    assert after == {"abandon": False, "focus": "cruisebtn", "glow": False, "flag": "1"}, after
    assert errors == []


def test_on_a_phone_the_hint_speaks_touch_and_german(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, locale="de-CH", phone=True)
        page.tap("#tutorialbtn")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.wait_for_function("() => document.querySelector('#tuthint').textContent !== ''", timeout=T)
        got = page.evaluate("""async () => ({ hint: document.querySelector('#tuthint').textContent, pips: document.querySelector('#pips').children.length,
            steps: (await import('./tutorial.js')).stepsFor(true).length - 1 })""")
        b.close()
    assert got["hint"].startswith("Fahr los mit ") and "WASD" not in got["hint"], got
    assert got["pips"] == got["steps"], got
    assert errors == []
```

  If the GPU-less headless run is too slow for a `hold_until` (each frame advances at most 0.05 s), raise that call's timeout; do not add a test-only setter hook.
- [ ] **Step 2: Run in the foreground** (branch pushed in Task 5): `pytest tests/test_tutorial.py -x`. Fix the implementation (not the test) on failure; after 3 failed attempts on the same test, stop and report.
- [ ] **Step 3: Run the neighbours** that the start screen and the harness change touch: `pytest tests/test_start_screen.py tests/test_cruise.py tests/test_viewpoints.py tests/test_pause.py tests/test_carselect.py -x` (foreground). Expected: PASS.
- [ ] **Step 4: Commit** `git add tests/test_tutorial.py && git commit -m "test(tutorial): run through every tutorial step in the browser (#534)"`

---

### Task 7: CHANGELOG, final check, PR

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`, at the top of the list)

- [ ] **Step 1:** Add (timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`):

```markdown
- `YYYY-MM-DD HH:MM` New mode **Tutorial** for newcomers: step by step it shows how to **drive** and **brake**, follow the **arrow** through three checkpoints, use **nitro**, **jump** to the Plattform Sisslerfeld with <kbd>J</kbd>, get out with <kbd>Z</kbd>, walk up onto the deck, take a **photo** of the DSM chimney with <kbd>X</kbd> and get back in. Each step ticks itself off as soon as you have done it, and the line under the arrow always says what to do next (on a phone in touch words). On your first visit the start screen offers the tutorial first; <kbd>Esc</kbd> → **End tutorial** leaves it at any time.
```

- [ ] **Step 2:** `node --test tests/*.test.mjs` once more (PASS).
- [ ] **Step 3:** Commit `docs(changelog): tutorial mode (#534)`, push, open the PR `feat(tutorial): tutorial mode for newcomers (#534)` with `Closes #534`; the PR body lists the Playwright files run and their result.
