# Controls Rethink Implementation Plan (#535)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small, always-visible, context-aware set of controls for newcomers on desktop (key bar, Shift nitro, Comma/Period signals, E as the one context key) and on phones (joystick, Gas/Brake/Jump, core buttons, context button, ☰ menu), while every existing key keeps working.

**Architecture:** A new pure module `controls.js` is the single table of which input triggers which action in which context; the keydown dispatcher in `index.html` asks it for the signal keys and the context key, the key bar and the phone ☰ menu are rendered from it. Phase 2 adds `touch.js` (pure stick maths plus DOM binding) that turns touches into the same `keys[...]` / `touch` writes and synthetic key events the keyboard produces, so the simulation does not know the difference.

**Tech Stack:** Vanilla ES modules, no build; `node --test tests/*.test.mjs` for pure modules; pytest + Playwright (`tests/test_*.py`, `server` fixture from `tests/conftest.py`) for the browser.

**Spec:** `docs/superpowers/specs/2026-11-02-controls-rethink-design.md` (approved 2026-11-02). Read it before starting; this plan does not change its decisions.

## Dependency and phasing

- **#551 (Cruise mode) must be merged to `main` first.** It touches `startscreen.js`, `pause.js`, `strings.js`, `index.html` and `tests/test_pause.py` / `tests/pause.test.mjs`. Start from a fresh `main` that contains it. This plan relies on nothing of #551 beyond: `PAUSE_BUTTONS` still exists in `pause.js` (the cruise plan adds `pauseButtonsFor(mode)` that filters it), and `#startbtn` still starts a run (time trial). If #551 is not merged when you start, stop and report.
- **Two phases, each shippable alone.** Phase 1 (desktop, Tasks 1-5) is one PR. Phase 2 (phone, Tasks 6-8) is a second PR on top of Phase 1. If one pipeline run cannot do both, ship Phase 1 and stop; Phase 2 is then dispatched separately.
- Line numbers below are from `main` at 18730ff (before #551). Find each spot with the quoted `grep` pattern, not by number.

## Global Constraints

- Desktop: nitro = **Shift (left or right) or N**, held, in the car only; on foot and in the helicopter Shift keeps "down" and N stays nitro.
- Turn signals: **Comma** (left) · **Period** (right). Q · E no longer signal in the car. In the steam loco Q · E stay the switches (`train.js` TRAIN_KEYS unchanged).
- **E is the one context key** on foot: enter a glowing door (outside), leave the building (inside), call the lift (inside at the lift gap). **B is only look-back** (B no longer leaves).
- Every other key keeps its binding (spec "Bindings that change" list). No player rebinding.
- Core actions besides driving: **Z** get out/in, **J** jump to a place, **F1** all keys, and **C** camera in the car only. **Camera is not available on foot** (maintainer decision 2026-11-02): `foot.js` keeps blocking `KeyC` on foot, the foot bar has no camera entry, the phone camera button is hidden on foot. X (photo) is not core.
- Key bar: centred at the bottom edge, above `#game-nav`; car `WASD fahren · Shift Nitro · Z aussteigen · J springen · C Kamera · F1 alle Tasten`; foot `WASD gehen · Space springen · Z einsteigen · J springen · F1 …` (no camera); highlighted first entry `E eintreten` / `E hinaus` / `E Lift` when the context key has an action. Hidden on phones, in the start screen and in dialogs; `pointer-events:none`, never focusable.
- Pause-menu toggle "Tastenleiste ein/aus", stored in `localStorage` key `mm.keybar` (`'0'` = off, anything else / missing = on), every access wrapped in try/catch.
- All new UI text in **en and de** in `strings.js` (keys in the same camelCase style; `tests/strings.test.mjs` demands identical key sets and Swiss spelling, no ß).
- Phone (Phase 2, car and on foot only): all buttons ≥ 44 px, respect `env(safe-area-inset-*)`, multi-touch; shown on `@media (pointer:coarse)` in place of today's `#touch` buttons.
- No new dependencies, no framework, no build step. CHANGELOG entry per phase, player-facing, hand-written under `[Unreleased]` (never `git cliff -o`).
- Commit and push the branch **before** running Playwright; run Playwright in the foreground only. Run the targeted test files named in each task, not the full ~2 h suite.

## Review Focus

1. **E indoors at the lift gap.** Inside 6c near the lift door, E must call the lift (as today), not throw the walker out of the building; everywhere else indoors E leaves. Pinned in Task 1 (`contextKeyAction` priority) and Task 3 (`test_enter_6c.py` keeps its lift calls, the leave test stands away from the gap).
2. **Comma/Period on foot and in the loco.** They must not switch the car's blinker while walking or driving the train (Q was blocked there for the same reason). Pinned in Task 2 (`FOOT_BLOCKED`, `TRAIN_BLOCKED` unit tests).
3. **Shift during the autopilot.** Holding Shift (nitro) must take over from the autopilot like N does today, or the player's nitro silently does nothing. Pinned in Task 2 (`TAKE_OVER_KEYS` test).
4. **Key bar covering HUD or the world.** At 1280×720 the bar must not overlap the speedometer (`#bl`) or the minimap (`#br`) and must not swallow clicks. Pinned in Task 4 (bounding-box and `pointer-events` assertions).
5. **Language switch while playing.** Toggling EN/DE must re-label the key bar and the pause toggle at once, not after the next context change. Pinned in Task 4 (signature includes the language; test toggles `ggSetLang`).

---

# Phase 1 - Desktop

### Task 1: `controls.js`, the controls table (pure)

**Files:**
- Create: `controls.js`
- Test: `tests/controls.test.mjs` (new)

**Interfaces:**
- Produces (exact exports, used by Tasks 3, 4, 7, 8):
  - `CONTEXTS: string[]` = `['car', 'foot', 'indoors', 'heli', 'train', 'lift']`
  - `entriesFor(context) -> Entry[]`, `Entry = { action, keys: string[], hold: boolean, core: boolean, touch: 'button'|'menu'|null, label: string|null, cap: string|null }`
  - `actionFor(context, code) -> string|null`
  - `barEntries(context, contextAction = null) -> { action, cap, label, highlight: boolean }[]` (core entries in table order; a highlighted `E` entry first when `contextAction` is `'enter'|'leave'|'lift'`)
  - `menuEntries(context) -> { action, label, cmd }[]` (entries with `touch === 'menu'`; `cmd` = the entry's first key code, the same format as a help row's `data-cmd`)
  - `conflicts() -> { context, key, actions: string[] }[]`
  - `contextKeyAction({ liftPrompt, indoors, doorPrompt }) -> 'lift'|'leave'|'enter'|null`
  - `contextLabel(action) -> string|null` (strings key: `barEnter`, `barLeave`, `barLift`)
  - `KEYBAR_KEY = 'mm.keybar'`, `keybarOnFrom(stored) -> boolean`

- [ ] **Step 1: Write the failing test** `tests/controls.test.mjs`:

```js
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

test('barEntries_HeliTrainLift_OnlyAllKeys', () => {
  for (const c of ['heli', 'train', 'lift']) assert.deepEqual(barEntries(c).map(e => e.cap), ['F1'], c);
});

test('menuEntries_Car_ListsTheRestNotTheCore', () => {
  const cmds = menuEntries('car').map(e => e.cmd);
  for (const k of ['Comma', 'Period', 'KeyL', 'Digit1', 'KeyH', 'KeyO', 'KeyI', 'KeyF', 'KeyX', 'KeyM', 'KeyT', 'KeyR']) assert.ok(cmds.includes(k), k);
  for (const k of ['KeyZ', 'KeyJ', 'KeyC']) assert.ok(!cmds.includes(k), k);
});

test('labels_EveryLabelExistsInBothLanguages', () => {
  for (const c of CONTEXTS) for (const e of entriesFor(c)) if (e.label) for (const l of ['en', 'de']) assert.notEqual(translate(l, e.label), e.label, `${c} ${e.action} ${l}`);
});

test('contextKeyAction_LiftWinsOverLeave_LeaveOverEnter', () => {
  assert.equal(contextKeyAction({ liftPrompt: true, indoors: true, doorPrompt: true }), 'lift');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: true, doorPrompt: true }), 'leave');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: true }), 'enter');
  assert.equal(contextKeyAction({ liftPrompt: false, indoors: false, doorPrompt: false }), null);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/controls.test.mjs`
Expected: FAIL, `Cannot find module '../controls.js'`.

- [ ] **Step 3: Write `controls.js`**

```js
// controls.js (#535): which input triggers which action in which context. The single source of truth for the key bar,
// the phone ☰ menu and the keydown dispatcher's signal and context keys. Pure: no DOM, no three.js (node --test imports it).
// Labels are strings.js keys. `cap` is what the key bar shows on the key cap. `cmd` of a menu entry = its first key code,
// the same format as a help row's data-cmd (helpfilter.js), so a tap runs exactly what the key does.
export const CONTEXTS = ['car', 'foot', 'indoors', 'heli', 'train', 'lift'];

const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const SHIFT = ['ShiftLeft', 'ShiftRight'];
const entry = (action, keys, o = {}) => ({ action, keys, hold: !!o.hold, core: !!o.core, touch: o.touch ?? null, label: o.label ?? null, cap: o.cap ?? null });
const help = () => entry('help', ['F1'], { core: true, label: 'barAllKeys', cap: 'F1' });
const jumpTo = () => entry('jump', ['KeyJ'], { core: true, touch: 'button', label: 'barJumpTo', cap: 'J' });
const camera = () => entry('camera', ['KeyC'], { core: true, touch: 'button', label: 'barCamera', cap: 'C' });
const menu = (action, keys, label) => entry(action, keys, { touch: 'menu', label });

const CAR = [
  entry('drive', [...MOVE, 'Space'], { hold: true, core: true, touch: 'button', label: 'barDrive', cap: 'WASD' }),
  entry('nitro', [...SHIFT, 'KeyN'], { hold: true, core: true, label: 'barNitro', cap: 'Shift' }),
  entry('getOut', ['KeyZ'], { core: true, touch: 'button', label: 'barGetOut', cap: 'Z' }),
  jumpTo(), camera(), help(),
  entry('handbrake', ['ControlLeft', 'ControlRight'], { hold: true, touch: 'button', label: 'keyHandbrake' }),
  entry('lookBack', ['KeyB'], { hold: true, label: 'keyLookBack' }),
  entry('fullMap', ['Tab'], { hold: true, label: 'keyTab' }),
  menu('signalLeft', ['Comma'], 'menuSignalLeft'), menu('signalRight', ['Period'], 'menuSignalRight'),
  menu('lights', ['KeyL'], 'keyLights'), menu('hazard', ['Digit1'], 'keyHazard'), menu('horn', ['KeyH', 'Enter', 'NumpadEnter'], 'keyHorn'),
  menu('autopilot', ['KeyO'], 'keyAuto'), menu('navi', ['KeyI'], 'keyNavi'), menu('heli', ['KeyF'], 'keyHeli'), menu('pontoon', ['KeyU'], 'keyPontoon'),
  menu('hideCar', ['KeyV'], 'keyCar'), menu('bounds', ['KeyG'], 'keyBounds'), menu('borders', ['KeyY'], 'keyBorders'),
  menu('trip', ['KeyK'], 'keyTrip'), menu('reset', ['KeyR'], 'keyReset'), menu('style', ['KeyT'], 'keyStyle'), menu('photo', ['KeyX'], 'keyPhoto'), menu('mute', ['KeyM'], 'keyMute'),
  entry('pause', ['Escape', 'KeyP'], { label: 'keyPause' }),
];
const WALK = [
  entry('walk', MOVE, { hold: true, core: true, touch: 'button', label: 'barWalk', cap: 'WASD' }),
  entry('jumpUp', ['Space'], { hold: true, core: true, touch: 'button', label: 'barJumpUp', cap: 'Space' }),
  entry('getIn', ['KeyZ'], { core: true, touch: 'button', label: 'barGetIn', cap: 'Z' }),
  jumpTo(), help(),
  entry('context', ['KeyE'], {}),
  entry('down', SHIFT, { hold: true }),
  entry('footNitro', ['KeyN'], { hold: true }),
  entry('lookBack', ['KeyB'], { hold: true, label: 'keyLookBack' }),
  menu('bounds', ['KeyG'], 'keyBounds'), menu('borders', ['KeyY'], 'keyBorders'), menu('style', ['KeyT'], 'keyStyle'), menu('photo', ['KeyX'], 'keyPhoto'), menu('mute', ['KeyM'], 'keyMute'),
];
const TABLE = {
  car: CAR,
  foot: [...WALK, menu('hover', ['KeyF'], 'menuHover')],
  indoors: WALK,
  heli: [entry('fly', MOVE, { hold: true }), entry('climb', ['Space'], { hold: true }), entry('sink', SHIFT, { hold: true }), entry('heliNitro', ['KeyN'], { hold: true }), menu('land', ['KeyF'], 'keyHeli'), help()],
  train: [entry('steam', ['KeyW'], { hold: true }), entry('trainBrake', ['KeyS'], { hold: true }), menu('switchLeft', ['KeyQ'], 'menuSwitchLeft'), menu('switchRight', ['KeyE'], 'menuSwitchRight'),
    menu('whistle', ['KeyH'], 'menuWhistle'), menu('trainReset', ['KeyR'], 'keyReset'), entry('trainCamera', ['KeyC'], {}), entry('turnLeft', ['KeyA'], {}), entry('turnRight', ['KeyD'], {}), entry('leaveTrain', ['KeyZ'], { touch: 'button' }), help()],
  lift: [entry('floor', ['Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], {}), entry('roof', ['KeyD'], {}), entry('context', ['KeyE'], {}), help()],
};

export const entriesFor = (context) => TABLE[context] || [];

export function actionFor(context, code) {
  const hit = entriesFor(context).find(e => e.keys.includes(code));
  return hit ? hit.action : null;
}

const CONTEXT_LABELS = { enter: 'barEnter', leave: 'barLeave', lift: 'barLift' };
export const contextLabel = (action) => CONTEXT_LABELS[action] ?? null;

export function barEntries(context, contextAction = null) {
  const core = entriesFor(context).filter(e => e.core).map(e => ({ action: e.action, cap: e.cap, label: e.label, highlight: false }));
  const label = contextLabel(contextAction);
  return label ? [{ action: 'context', cap: 'E', label, highlight: true }, ...core] : core;
}

export function menuEntries(context) {
  return entriesFor(context).filter(e => e.touch === 'menu').map(e => ({ action: e.action, label: e.label, cmd: e.keys[0] }));
}

export function conflicts() {
  const out = [];
  for (const context of CONTEXTS) {
    const byKey = new Map();
    for (const e of entriesFor(context)) for (const k of e.keys) byKey.set(k, [...(byKey.get(k) || []), e.action]);
    for (const [key, actions] of byKey) if (actions.length > 1) out.push({ context, key, actions });
  }
  return out;
}

// E on foot: the lift (inside, at the lift gap) wins over leaving, leaving (anywhere else inside) over a glowing door
export function contextKeyAction({ liftPrompt, indoors, doorPrompt }) {
  if (liftPrompt) return 'lift';
  if (indoors) return 'leave';
  return doorPrompt ? 'enter' : null;
}

export const KEYBAR_KEY = 'mm.keybar';
export const keybarOnFrom = (stored) => stored !== '0';
```

Z and Y are dispatched by letter (`e.key`, Swiss keyboards) in `index.html`; the table lists `KeyZ` / `KeyY` for the conflict check only. Do not route them through `actionFor`.

- [ ] **Step 4: Add the strings** to `strings.js`, en block (next to `keyNitro`, grep `keyNitro:`) and de block, same keys:

| key | en | de |
|---|---|---|
| `barDrive` | `drive` | `fahren` |
| `barNitro` | `Nitro` | `Nitro` |
| `barGetOut` | `get out` | `aussteigen` |
| `barJumpTo` | `jump to` | `springen` |
| `barCamera` | `camera` | `Kamera` |
| `barAllKeys` | `all keys` | `alle Tasten` |
| `barWalk` | `walk` | `gehen` |
| `barJumpUp` | `jump` | `springen` |
| `barGetIn` | `get in` | `einsteigen` |
| `barEnter` | `enter` | `eintreten` |
| `barLeave` | `go out` | `hinaus` |
| `barLift` | `lift` | `Lift` |
| `menuSignalLeft` | `Turn signal left` | `Blinker links` |
| `menuSignalRight` | `Turn signal right` | `Blinker rechts` |
| `menuHover` | `Hover on · off` | `Schweben ein · aus` |
| `menuSwitchLeft` | `Next switch left` | `Nächste Weiche links` |
| `menuSwitchRight` | `Next switch right` | `Nächste Weiche rechts` |
| `menuWhistle` | `Whistle` | `Pfeifen` |
| `pauseKeybarOn` | `Key bar: on` | `Tastenleiste: ein` |
| `pauseKeybarOff` | `Key bar: off` | `Tastenleiste: aus` |

(The foot bar shows `F1 alle Tasten` like the car bar; the spec's foot example abbreviates it to `F1`.)

- [ ] **Step 5: Run the tests**

Run: `node --test tests/controls.test.mjs tests/strings.test.mjs`
Expected: PASS (strings: same keys in en and de, no ß).

- [ ] **Step 6: Commit**

```bash
git add controls.js tests/controls.test.mjs strings.js
git commit -m "feat(controls): controls table as single source of truth (#535)"
```

### Task 2: Pure key rules in `foot.js`, `train.js`, `route.js`

**Files:**
- Modify: `foot.js` (`FOOT_BLOCKED`, `footKeyAction`, ~line 87-93)
- Modify: `train.js` (`TRAIN_BLOCKED`, ~line 199)
- Modify: `route.js` (`TAKE_OVER_KEYS`, line 30)
- Test: `tests/foot.test.mjs`, `tests/train.test.mjs`, `tests/route.test.mjs`

**Interfaces:**
- Produces: `footKeyAction('KeyE', indoors)` returns `'enter'` outside and `'leave'` indoors; `footKeyAction('KeyB', any)` returns `'pass'`; `'Comma'`/`'Period'` return `'block'` on foot; `trainKeyAction('Comma'|'Period')` returns `'block'`; `TAKE_OVER_KEYS` contains `ShiftLeft`, `ShiftRight`.

- [ ] **Step 1: Update the existing unit tests** (behaviour changes the spec asks for; nothing is loosened):
  - `tests/foot.test.mjs` `footKeyAction_KeyB_LeavesOnlyIndoors` (line ~118) becomes:

```js
// #535: E is the one context key -- indoors it leaves (B is only look-back now)
test('footKeyAction_KeyE_LeavesIndoors_KeyBNeverLeaves', () => {
  assert.equal(footKeyAction('KeyE', true), 'leave');
  assert.equal(footKeyAction('KeyE', false), 'enter');
  assert.equal(footKeyAction('KeyB', true), 'pass');
  assert.equal(footKeyAction('KeyB', false), 'pass');
});
```

  - In `footKeyAction_HoverIndoors_IsBlockedAndOutdoorsStaysAsBefore` (line ~247) change `assert.equal(footKeyAction('KeyE', true), 'enter');` to `assert.equal(footKeyAction('KeyE', true), 'leave');`.
  - Add to `tests/foot.test.mjs`:

```js
test('footKeyAction_SignalKeys_BlockedOnFoot', () => {
  for (const k of ['Comma', 'Period', 'KeyQ']) for (const indoors of [false, true]) assert.equal(footKeyAction(k, indoors), 'block', `${k} ${indoors}`);
});
```

  - Add to `tests/train.test.mjs` (import `trainKeyAction` is already there; check):

```js
test('trainKeyAction_SignalKeys_Blocked_QEStaySwitches', () => {
  assert.equal(trainKeyAction('Comma'), 'block');
  assert.equal(trainKeyAction('Period'), 'block');
  assert.equal(trainKeyAction('KeyQ'), 'left');
  assert.equal(trainKeyAction('KeyE'), 'right');
});
```

  - `tests/route.test.mjs` `TAKE_OVER_KEYS` test (line ~131): add `'ShiftLeft', 'ShiftRight'` to the must-have list and `'Comma', 'Period'` to the must-not list. Keep `'KeyQ', 'KeyE'` in the must-not list.

- [ ] **Step 2: Run** `node --test tests/foot.test.mjs tests/train.test.mjs tests/route.test.mjs`. Expected: the new/changed assertions FAIL.

- [ ] **Step 3: Implement**
  - `foot.js`: add `'Comma', 'Period'` to `FOOT_BLOCKED`; replace the two E/B lines in `footKeyAction`:

```js
  if (code === 'KeyE') return indoors ? 'leave' : 'enter';   // #535: E is the context key (B is only look-back)
```

    and delete the `KeyB` line (B then falls through to `'pass'`, so look-back keeps working). Update the comment above `FOOT_BLOCKED` to say E enters or leaves.
  - `train.js`: add `'Comma', 'Period'` to `TRAIN_BLOCKED`.
  - `route.js`: add `'ShiftLeft', 'ShiftRight'` to `TAKE_OVER_KEYS` (nitro takes over like N).

- [ ] **Step 4: Run** `node --test tests/*.test.mjs`. Expected: all PASS.

- [ ] **Step 5: Commit** `git commit -am "feat(controls): E leaves buildings, signal keys blocked on foot and in the loco, Shift takes over (#535)"`

### Task 3: Wire the dispatcher, Shift nitro and the context key in `index.html`; help rows; update browser tests

**Files:**
- Modify: `index.html`: imports (near `import ... from './foot.js'`), keydown dispatcher (grep `addEventListener('keydown'`), `pressEnter`/`leaveBuilding` (grep `function pressEnter`), `stepCar` nitro (grep `nitro = ap ? 0 : (inp.KeyN`), HUD comment (grep `turn signal (Q/E)`), help rows (grep `data-cmd="KeyQ"`), debug hooks (grep `window.__mm.cam = `)
- Modify: `tests/test_smoke.py:487`, `tests/test_lights.py:65-107`, `tests/test_enter_6c.py:230-250`
- Create: `tests/test_controls.py`

**Interfaces:**
- Consumes: `actionFor`, `contextKeyAction` (Task 1); `footKeyAction` (Task 2).
- Produces (used by Tasks 4, 7, 8): `contextAction() -> 'enter'|'leave'|'lift'|null`, `controlContext() -> one of CONTEXTS`, `runContextKey()`; debug hook `window.__mm.drive() -> { gas, nitro, back }`.

- [ ] **Step 1: Write the failing browser test** `tests/test_controls.py` (copy `MMH_ROUTE`, `ARGS`, `ROAD`, `open_hand`, `press_z` verbatim from `tests/test_on_foot.py`):

```python
"""#535: the desktop controls -- Space, Shift and B held together; Comma / Period signal; E is the context key.
Hand-traced layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

# MMH_ROUTE, ARGS, ROAD, open_hand, press_z: copied from tests/test_on_foot.py


def test_space_shift_and_b_held_together_give_gas_nitro_and_look_back(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        for k in ("Space", "ShiftLeft", "KeyB"):
            page.keyboard.down(k)
        page.wait_for_function("() => { const d = window.__mm.drive(); return d.gas === 1 && d.nitro === 1 && d.back === true; }", timeout=120000)
        held = page.evaluate("() => window.__mm.keysDown()")
        for k in ("KeyB", "ShiftLeft", "Space"):
            page.keyboard.up(k)
        b.close()
    assert errors == []
    assert {"Space", "ShiftLeft", "KeyB"} <= set(held), held


def test_n_still_gives_nitro(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.keyboard.down("KeyN")
        page.wait_for_function("() => window.__mm.drive().nitro === 1", timeout=120000)
        page.keyboard.up("KeyN")
        b.close()
    assert errors == []


def test_comma_and_period_toggle_the_signals_and_q_e_do_nothing_in_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        hud = lambda: page.evaluate("() => window.__mm.hud().blinker")
        page.keyboard.press("KeyQ"); q = hud()
        page.keyboard.press("KeyE"); e = hud()
        page.keyboard.press("Comma"); left = hud()
        page.keyboard.press("Period"); right = hud()
        page.keyboard.press("Period"); off = hud()
        b.close()
    assert errors == []
    assert (q, e, left, right, off) == (None, None, "left", "right", None)


def test_comma_on_foot_does_not_signal(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        page.keyboard.press("Comma")
        blinker = page.evaluate("() => window.__mm.hud().blinker")
        b.close()
    assert errors == []
    assert blinker is None
```

- [ ] **Step 2: Implement in `index.html`**
  - Import: `import { actionFor, contextKeyAction } from './controls.js';   // #535` (Task 4 extends this import).
  - Dispatcher, foot branch: replace `if (fa === 'enter') pressEnter(); if (fa === 'leave') leaveBuilding();` with `if (fa === 'enter' || fa === 'leave') runContextKey();`.
  - Dispatcher, signals: replace `if (e.code === 'KeyQ') HUD.blinker = ...; if (e.code === 'KeyE') HUD.blinker = ...;` with:

```js
const sig = actionFor('car', e.code); if (sig === 'signalLeft') HUD.blinker = HUD.blinker === 'left' ? null : 'left'; if (sig === 'signalRight') HUD.blinker = HUD.blinker === 'right' ? null : 'right';   /* #535: Comma · Period */
```

  - Below `function leaveBuilding`, add (and drop the now unreachable lift clause from `pressEnter`, which becomes `function pressEnter() { const n = HUD.enter; if (!n) return; ... }`; check with `grep -n "pressEnter(" index.html` that only `runContextKey` calls it):

```js
// #535: E is the one context key on foot -- lift (at the lift gap) > leave (inside) > enter (at a glowing door)
function contextAction() { return FOOT.on ? contextKeyAction({ liftPrompt: INT.indoors && !!INT.prompt, indoors: INT.indoors, doorPrompt: !!HUD.enter }) : null; }
function runContextKey() { const a = contextAction(); if (a === 'lift') INT.lift.call(INT.floor); else if (a === 'leave') leaveBuilding(); else if (a === 'enter') pressEnter(); }
function controlContext() { if (FOOT.on) return INT.pad ? 'lift' : INT.indoors ? 'indoors' : 'foot'; if (TRAIN.on) return 'train'; if (FLY.on) return 'heli'; return 'car'; }
```

  - `stepCar`: `nitro = ap ? 0 : ((inp.ShiftLeft || inp.ShiftRight || inp.KeyN) ? 1 : 0)`.
  - HUD comment: `turn signal (Q/E)` becomes `turn signal (Comma/Period, #535)`.
  - Debug hook next to `window.__mm.cam`: `window.__mm.drive = () => ({ gas: P.gas, nitro: P.nitro, back: CAM.back });   // #535`
  - Help rows (`#help .keys`): `<kbd data-cmd="hold">N</kbd>` becomes `<kbd data-cmd="hold">Shift · N</kbd>`; `<kbd data-cmd="KeyQ">Q · E</kbd>` becomes `<kbd data-cmd="Comma|,">, · .</kbd>`; the `keyLeave` row's `<kbd data-cmd="KeyB">B</kbd>` becomes `<kbd data-cmd="KeyE">E</kbd>`. The look-back row (`hold`, B) and the train row (Q · E switches) stay.

- [ ] **Step 3: Update the existing browser tests** (same behaviour checked, new keys):
  - `tests/test_smoke.py:487`: `page.keyboard.press("KeyQ")` becomes `press("Comma")`, both `press("KeyE")` become `press("Period")`. The `left/right/off` assertions stay unchanged.
  - `tests/test_lights.py` `test_1_toggles_hazard_both_sides_flash_win_over_q_and_yield_to_the_blinker`: line 89 `press("KeyQ")` becomes `press("Comma")`; rename the test to `..._win_over_the_signal_...` and replace "Q" with "Comma" in its docstring and comments. Assertions unchanged.
  - `tests/test_enter_6c.py` `test_b_takes_the_walker_from_the_fifth_floor_out_in_front_of_the_entrance` becomes `test_e_takes_the_walker_from_the_fifth_floor_out_in_front_of_the_entrance`: docstring "#474/#535: E anywhere inside the hall away from the lift gap ...". `stand(page, 0.7, 0.4, ...)` becomes `stand(page, 0.7, -0.7, math.pi / 2, level=5)` (on the landing, 1.98 m from the lift-call spot `(0.7, 1.275)`, outside its 1.3 m radius; the landing spans b -1.2..1.2, `stairhall.js` header), and `key(page, "b", 300)` becomes `key(page, "e", 300)`. All assertions stay.
  - Add to `tests/test_enter_6c.py` a guard for Review Focus 1:

```python
@needs_world
def test_e_at_the_lift_gap_calls_the_lift_and_stays_inside(server):
    """#535: E at the lift gap is the lift, not the way out."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        stand(page, 0.7, 0.4, math.pi / 2, level=5)
        foot_sim(page, 0.3)
        key(page, "e", 200)
        page.evaluate("() => window.__mm.interiorSim(1.5)")
        after = interior(page)
        b.close()
    assert errors == []
    assert after["indoors"] is True and after["floor"] == 5, after
    assert after["lift"]["busy"] or after["lift"]["at"] == 5, after
```

  - Unchanged and must stay green: the lift calls in `test_enter_6c.py` (`key(page, "e", ...)` at `(0.7, 0.4)`), `test_on_foot.py` `test_e_on_foot_at_a_ready_entrance...` (E enters), B look-back in `test_look_back.py`, `test_drone.py`, `test_debug.py`, `test_mirror.py`, `test_carselect.py:107`, `test_train.py:147`, and `q` = switch in `test_train.py:95`.

- [ ] **Step 4: Commit and push the branch**, then run in the foreground:
`node --test tests/*.test.mjs` and `pytest tests/test_controls.py tests/test_smoke.py tests/test_lights.py tests/test_on_foot.py -x` and `pytest tests/test_enter_6c.py -x` (skips without world data, see `needs_world`). Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "feat(controls): Shift nitro, Comma/Period signals, E as the context key (#535)"`

### Task 4: The key bar and its pause-menu toggle

**Files:**
- Modify: `index.html`: markup next to `#stylebtn` (grep `<button id="stylebtn"`), CSS next to `#stylebtn{` and the hide rules (grep `body:has(#overlay:not([hidden])) :is(`), pause markup (grep `id="pauseabout"`), pause wiring (grep `$('pausebtn').onclick`), frame loop (grep `stepWreck(dt);`), `gg-langchange` listener (grep `addEventListener('gg-langchange'`)
- Modify: `pause.js` (`PAUSE_BUTTONS`)
- Modify: `tests/pause.test.mjs`, `tests/test_pause.py` (focus-order test)
- Create: `tests/test_keybar.py`

**Interfaces:**
- Consumes: `barEntries`, `KEYBAR_KEY`, `keybarOnFrom` (Task 1); `controlContext`, `contextAction` (Task 3).
- Produces: `#keybar` element; `KEYBAR = { on, sig }`; `stepKeybar()`; debug hook `window.__mm.keybar() -> { shown, text, ctx, action, on }`; pause button `#pausekeybar`; `PAUSE_BUTTONS = ['pauseresume', 'pausevehicle', 'pauseabout', 'pausekeybar', 'pauserestart', 'pausemenu']`.

- [ ] **Step 1: Update the pause unit tests**
  - `tests/pause.test.mjs` line ~56: expected `PAUSE_BUTTONS` becomes `['pauseresume', 'pausevehicle', 'pauseabout', 'pausekeybar', 'pauserestart', 'pausemenu']` (comment `// #535: the key bar toggle after About`). The `nextFocus` assertions stay.
  - #551's `pauseButtonsFor_Cruise_HasNoRestart` expected list becomes `['pauseresume', 'pausevehicle', 'pauseabout', 'pausekeybar', 'pausemenu']`.
  - `tests/test_pause.py` `test_keyboard_navigation_and_main_menu_asks_first`: key list becomes `["ArrowDown"] * 5 + ["ArrowUp", "Tab", "Tab", "Shift+Tab"]` and the expected `seen` becomes `["pauseresume", "pausevehicle", "pauseabout", "pausekeybar", "pauserestart", "pausemenu", "pauserestart", "pausemenu", "pauseresume", "pausemenu"]` (still wraps both ways and ends on Main menu before Enter). If #551 already changed this test, apply the same insertion to its version.
  - `test_phone_pause_button_and_menu_fit` stays: the toggle is hidden on coarse pointers (the key bar does not exist there), and that test lists its ids explicitly.

- [ ] **Step 2: Write the failing browser test** `tests/test_keybar.py` (copy `MMH_ROUTE`, `ARGS`, `ROAD`, `open_hand`, `press_z` from `tests/test_on_foot.py`):

```python
"""#535: the key bar -- car entries, foot entries after Z, E eintreten at a glowing door, the pause toggle survives a reload."""
from playwright.sync_api import sync_playwright

# MMH_ROUTE, ARGS, ROAD, open_hand, press_z: copied from tests/test_on_foot.py

BAR = "() => window.__mm.keybar()"


def test_bar_follows_the_context_and_the_language(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.evaluate("() => window.ggSetLang('de')")
        car = page.evaluate(BAR)
        boxes = page.evaluate("""() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
          return { bar: r('#keybar'), bl: r('#bl'), br: r('#br'), pe: getComputedStyle(document.querySelector('#keybar')).pointerEvents }; }""")
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        foot = page.evaluate(BAR)
        page.evaluate(f"() => window.__mm.enterables.setReady('plattform-sisslerfeld', true, [{x + 12}, {z}])")
        page.evaluate(f"() => window.__mm.place({x + 10}, {z}, 0)")
        page.wait_for_function("() => window.__mm.enterables.prompt() === 'plattform-sisslerfeld'", timeout=60000)
        door = page.evaluate(BAR)
        page.evaluate("() => window.ggSetLang('en')")
        door_en = page.evaluate(BAR)
        page.evaluate("() => window.__mm.enterables.setReady('plattform-sisslerfeld', false)")
        b.close()
    overlap = lambda a, c: not (a[2] <= c[0] or c[2] <= a[0] or a[3] <= c[1] or c[3] <= a[1])
    assert errors == []
    assert car["shown"] and car["text"] == "WASD fahrenShift NitroZ aussteigenJ springenC KameraF1 alle Tasten", car
    assert boxes["pe"] == "none" and not overlap(boxes["bar"], boxes["bl"]) and not overlap(boxes["bar"], boxes["br"]), boxes
    assert foot["ctx"] == "foot" and foot["text"].startswith("WASD gehenSpace springenZ einsteigen") and "Kamera" not in foot["text"], foot
    assert door["action"] == "enter" and door["text"].startswith("E eintreten"), door
    assert door_en["text"].startswith("E enter"), door_en


def test_bar_hidden_on_the_start_screen_and_in_the_help(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server, start=None)   # extend the copied open_hand: skip page.click when start is None
        start = page.evaluate(BAR)
        page.click("#startbtn")
        racing = page.evaluate(BAR)
        page.keyboard.press("F1")
        page.wait_for_function("() => window.__mm.hud().help", timeout=60000)
        help_open = page.evaluate(BAR)
        page.keyboard.press("F1")
        page.wait_for_function("() => !window.__mm.hud().help", timeout=60000)
        back = page.evaluate(BAR)
        b.close()
    assert errors == []
    assert (start["shown"], racing["shown"], help_open["shown"], back["shown"]) == (False, True, False, True)


def test_pause_toggle_hides_the_bar_and_survives_a_reload(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        page.click("#pausekeybar")
        label = page.text_content("#pausekeybar")
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.pause().on", timeout=120000)
        off = page.evaluate(BAR)
        page.reload()
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.click("#startbtn")
        reloaded = page.evaluate(BAR)
        page.evaluate("() => localStorage.removeItem('mm.keybar')")
        b.close()
    assert errors == []
    assert label in ("Key bar: off", "Tastenleiste: aus"), label
    assert off["on"] is False and off["shown"] is False, off
    assert reloaded["on"] is False and reloaded["shown"] is False, reloaded
```

- [ ] **Step 3: Implement**
  - Import: extend to `import { actionFor, contextKeyAction, barEntries, KEYBAR_KEY, keybarOnFrom } from './controls.js';`.
  - `pause.js`: `PAUSE_BUTTONS` gets `'pausekeybar'` after `'pauseabout'`.
  - Markup after `#stylebtn`: `<div id="keybar" aria-hidden="true"></div>`. Pause markup after `#pauseabout`: `<button id="pausekeybar" class="btn" type="button" aria-pressed="true">Key bar: on</button>`.
  - CSS (next to `#stylebtn{`):

```css
#keybar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(104px + env(safe-area-inset-bottom,0px));max-width:min(760px,calc(100vw - 32px));display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;padding:5px 12px;box-sizing:border-box;background:rgba(20,23,29,.72);color:var(--cream);font-size:15px;font-weight:700;letter-spacing:1px;pointer-events:none;user-select:none;z-index:4}
#keybar[hidden]{display:none}
#keybar kbd{font:inherit;font-weight:800;color:var(--sun);border:2px solid var(--steel);padding:0 5px}
#keybar .ctx{color:var(--ink);background:var(--sun);padding:0 6px}#keybar .ctx kbd{color:var(--ink);border-color:var(--ink)}
@media (pointer:coarse){#keybar,#pausekeybar{display:none!important}}
body:has(#carsel:not([hidden])) #keybar,body:has(#pause:not([hidden])) #keybar,body:has(#abandon:not([hidden])) #keybar,body:has(#help:not([hidden])) #keybar,body:has(#jump:not([hidden])) #keybar,body:has(#borderinfo:not([hidden])) #keybar{display:none}
```

    and add `#keybar` to the three `:is(#tl,#tr,#bl,#br,#compass,#stylebtn,#pausebtn,#touch)` hide lists (overlay, worlds, about). Check at 1280×720 that the bar sits between `#bl` and `#br`; if `test_keybar.py` reports an overlap, lower `max-width`, do not move the HUD.
  - JS (after `controlContext`):

```js
// #535: the key bar -- core keys of the current context, the context key first; rebuilt only when what it shows changes
const KEYBAR = { on: keybarOnFrom((() => { try { return localStorage.getItem(KEYBAR_KEY); } catch (e) { return null; } })()), sig: '' };
function stepKeybar() {
  const ctx = controlContext(), act = contextAction(), sig = `${KEYBAR.on}|${ctx}|${act}|${window.GG_LANG}`;
  if (sig === KEYBAR.sig) return;
  KEYBAR.sig = sig; $('keybar').hidden = !KEYBAR.on;
  $('keybar').innerHTML = barEntries(ctx, act).map(x => `<span${x.highlight ? ' class="ctx"' : ''}><kbd>${x.cap}</kbd> ${tr(x.label)}</span>`).join('');
}
function renderKeybarToggle() { const b = $('pausekeybar'); b.textContent = tr(KEYBAR.on ? 'pauseKeybarOn' : 'pauseKeybarOff'); b.setAttribute('aria-pressed', String(KEYBAR.on)); }
function toggleKeybar() { KEYBAR.on = !KEYBAR.on; try { localStorage.setItem(KEYBAR_KEY, KEYBAR.on ? '1' : '0'); } catch (e) { } renderKeybarToggle(); stepKeybar(); }
window.__mm.keybar = () => { stepKeybar(); const el = $('keybar'); return { shown: !el.hidden && getComputedStyle(el).display !== 'none', text: el.textContent, ctx: controlContext(), action: contextAction(), on: KEYBAR.on }; };
```

    (One space between cap and label, none between entries: the test's `text` strings, e.g. `WASD fahrenShift Nitro…`, rely on exactly that.)
  - Pause wiring line: add `$('pausekeybar').onclick = toggleKeybar; renderKeybarToggle();`.
  - Frame loop: insert `stepKeybar();` right after `stepWreck(dt);`.
  - `gg-langchange` listener: add `renderKeybarToggle();` (the bar re-renders by itself: its signature contains `GG_LANG`).

- [ ] **Step 4: Commit and push**, then run in the foreground: `node --test tests/*.test.mjs` and `pytest tests/test_keybar.py tests/test_pause.py -x`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "feat(controls): context-aware key bar with a pause-menu toggle (#535)"`

### Task 5: Phase 1 CHANGELOG and final check

**Files:** Modify `CHANGELOG.md` (`[Unreleased]`, `### Changed`, newest first, entries carry the go-live time `YYYY-MM-DD HH:MM` Swiss time; use the time of writing, the maintainer corrects it at merge).

- [ ] **Step 1:** Add, in the existing English player-facing voice:

```markdown
- `YYYY-MM-DD HH:MM` **New controls for newcomers:** a slim **key bar** at the bottom always shows how to drive and the core keys (**Z** get out/in, **J** jump to a place, **F1** all keys, plus **C** camera in the car), and **E** whenever there is something to do right here (enter, go out, call the lift). It can be switched off in the pause menu. **Nitro** is now also on **Shift**, so gas, nitro and look-back (B) can be held together. The **turn signals** moved from Q · E to **Comma · Period**, and **E** (not B) takes you out of a building; B only looks back. In the steam loco Q · E still pick the switches.
```

- [ ] **Step 2:** `node --test tests/*.test.mjs` (all), plus the Playwright files of Tasks 3-4 once more. `grep -n "KeyQ\|'KeyB'" index.html` shows only the train help row text and the look-back read (`keys.KeyB`).
- [ ] **Step 3: Commit** `git commit -am "docs(changelog): new desktop controls (#535)"`, push, open the Phase 1 PR (`feat(controls): desktop controls rethink, phase 1 (#535)`, body `Part of #535`, not `Closes`).

---

# Phase 2 - Phone (car and on foot)

Starts from `main` with Phase 1 merged.

### Task 6: `touch.js` stick maths and touch walking in `foot.js` (pure)

**Files:**
- Create: `touch.js`
- Modify: `foot.js` (`footInput`)
- Test: `tests/touch.test.mjs` (new), `tests/foot.test.mjs`

**Interfaces:**
- Produces: `STICK = { radius: 56, dead: 0.15 }`, `stickVector(dx, dy, cfg = STICK) -> { x, y }` (x right, y forward = screen up, each in [-1, 1], 0 inside the dead zone, clamped at the rim); `TOUCH_LOOK = 2` (drag px to `footLook` units); `footInput(keys, stick = null)` adds `stick.y` to `fwd` and `stick.x` to `side`, each clamped to [-1, 1].

- [ ] **Step 1: Failing tests** `tests/touch.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STICK, stickVector } from '../touch.js';

test('stickVector_InsideDeadZone_IsZero', () => {
  assert.deepEqual(stickVector(STICK.radius * 0.1, 0), { x: 0, y: 0 });
});

test('stickVector_AtTheRim_IsUnit_UpIsForward', () => {
  const r = stickVector(STICK.radius, 0); assert.ok(Math.abs(r.x - 1) < 1e-9 && Math.abs(r.y) < 1e-9);
  const u = stickVector(0, -STICK.radius); assert.ok(Math.abs(u.y - 1) < 1e-9 && Math.abs(u.x) < 1e-9);
});

test('stickVector_BeyondTheRim_IsClamped', () => {
  const v = stickVector(STICK.radius * 3, STICK.radius * 3);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9 && v.x > 0 && v.y < 0);
});

test('stickVector_Half_IsAnalog', () => {
  assert.ok(Math.abs(stickVector(STICK.radius / 2, 0).x - 0.5) < 1e-9);
});
```

  and in `tests/foot.test.mjs`:

```js
test('footInput_Stick_AddsToTheKeys_Clamped', () => {
  assert.deepEqual(footInput({}, { x: 0.5, y: -1 }), { fwd: -1, side: 0.5, turn: 0, lift: 0, nitro: 0 });
  assert.equal(footInput({ KeyW: true }, { x: 0, y: 1 }).fwd, 1);
  assert.deepEqual(footInput({ KeyW: true }), footInput({ KeyW: true }, null));
});
```

- [ ] **Step 2:** `node --test tests/touch.test.mjs tests/foot.test.mjs`: FAIL.
- [ ] **Step 3: Implement**

```js
// touch.js (#535 phase 2): the phone controls. STICK / stickVector are pure (node --test imports this file);
// bindStick only runs when index.html calls it.
export const STICK = { radius: 56, dead: 0.15 };
export const TOUCH_LOOK = 2;   // a finger drag turns the walker TOUCH_LOOK times as far as the same mouse movement

export function stickVector(dx, dy, cfg = STICK) {
  const m = Math.hypot(dx, dy) / cfg.radius;
  if (m < cfg.dead) return { x: 0, y: 0 };
  const k = Math.min(1, m) / m / cfg.radius;
  return { x: dx * k, y: -dy * k };
}

// the joystick: one pointer at a time, captured, so steering survives the finger leaving the base; onMove({ x, y }) on every change
export function bindStick(base, knob, onMove) {
  let id = null;
  const set = (e) => { const r = base.getBoundingClientRect(), v = stickVector(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    knob.style.transform = `translate(${v.x * STICK.radius}px, ${-v.y * STICK.radius}px)`; onMove(v); };
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; onMove({ x: 0, y: 0 }); };
  base.addEventListener('pointerdown', (e) => { if (id !== null) return; e.preventDefault(); id = e.pointerId; base.setPointerCapture?.(id); set(e); });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
}
```

  `foot.js` `footInput(keys, stick = null)`: `fwd: clamp(axis(...) + (stick ? stick.y : 0), -1, 1)`, `side: clamp(axis(...) + (stick ? stick.x : 0), -1, 1)`; update the comment to mention the touch stick.
- [ ] **Step 4:** `node --test tests/*.test.mjs`: PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(touch): joystick maths and touch walking (#535)"`

### Task 7: Phone controls in `index.html` (replace `#touch` buttons)

**Files:**
- Modify: `index.html`: `#touch` markup (grep `<div id="touch">`), its CSS (grep `#touch{position:fixed`), touch wiring (grep `const touch = { l: 0`), `stepCar` steer (grep `steer = ap ? ap.steer`), `stepOnFoot` (grep `footInput(keys)`), `#gl` pointer handlers (grep `$('gl').addEventListener('pointerdown'`), `stepKeybar`
- Modify: `strings.js` (en + de)
- Modify: `tests/test_i18n.py:63,80`, `tests/test_debug.py:333`
- Create: `tests/test_touch_controls.py`

**Interfaces:**
- Consumes: `stickVector`, `bindStick`, `TOUCH_LOOK` (Task 6); `menuEntries`, `contextLabel` (Task 1); `controlContext`, `contextAction` (Phase 1); `commandEventInit` (`helpfilter.js`, already imported).
- Produces: `touch = { x, y, g, b, h }`; elements `#tStick` (with knob `i`), `#tG`, `#tB`, `#tH`, `#tZ`, `#tJ`, `#tC`, `#tE`, `#tMenu`, `#tMenuList`; `#touch[data-ctx]`; debug hook `window.__mm.touch() -> { x, y, g, b, h, ctx }`.

- [ ] **Step 1: Strings** (en / de): `stickAria` `Steer · walk` / `Lenken · gehen`; `jumpUp` aria reuse `barJumpUp`; `touchMenu` `All actions` / `Alle Aktionen`. Existing `steerLeft` / `steerRight` become unused: delete them in both languages (orphans of this change).
- [ ] **Step 2: Markup** replaces the five buttons inside `<div id="touch">` (keep the container id: CSS hide rules and `test_carselect.py` rely on it):

```html
<div id="touch" data-ctx="car">
  <div id="tStick" aria-label="Steer · walk" data-i18n-aria="stickAria"><i></i></div>
  <button id="tG" type="button" aria-label="Accelerate" data-i18n-aria="accelerate">▲</button>
  <button id="tB" type="button" aria-label="Brake" data-i18n-aria="brake">▼</button>
  <button id="tH" type="button" aria-label="Handbrake" data-i18n-aria="handbrake">H</button>
  <button id="tZ" class="round" type="button" aria-label="get out" data-i18n-aria="barGetOut">Z</button>
  <button id="tJ" class="round" type="button" aria-label="jump to" data-i18n-aria="barJumpTo">J</button>
  <button id="tC" class="round" type="button" aria-label="camera" data-i18n-aria="barCamera">C</button>
  <button id="tE" type="button" hidden></button>
  <button id="tMenu" type="button" aria-label="All actions" data-i18n-aria="touchMenu" aria-expanded="false">☰</button>
  <div id="tMenuList" hidden></div>
</div>
```

- [ ] **Step 3: CSS** replaces the `#tL`…`#tH` position rules (keep `#touch{...display:none}` + `@media (pointer:coarse){#touch{display:block}}`):

```css
#tStick{position:absolute;pointer-events:auto;left:calc(20px + env(safe-area-inset-left,0px));bottom:calc(200px + env(safe-area-inset-bottom,0px));width:132px;height:132px;border-radius:50%;background:rgba(20,23,29,.45);border:4px solid var(--steel-l);touch-action:none}
#tStick i{position:absolute;left:34px;top:34px;width:56px;height:56px;border-radius:50%;background:var(--steel-l);pointer-events:none}
#tG{right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(200px + env(safe-area-inset-bottom,0px))}#tB{right:calc(120px + env(safe-area-inset-right,0px));bottom:calc(200px + env(safe-area-inset-bottom,0px))}
#touch button#tH{width:56px;height:56px;font-size:22px;right:calc(212px + env(safe-area-inset-right,0px));bottom:calc(214px + env(safe-area-inset-bottom,0px))}
#touch .round{width:56px;height:56px;font-size:22px;bottom:calc(300px + env(safe-area-inset-bottom,0px))}
#tZ{right:calc(20px + env(safe-area-inset-right,0px))}#tJ{right:calc(84px + env(safe-area-inset-right,0px))}#tC{right:calc(148px + env(safe-area-inset-right,0px))}
#touch button#tE{width:auto;min-width:96px;height:48px;border-radius:24px;padding:0 16px;font-size:18px;background:var(--sun);color:var(--ink);right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(368px + env(safe-area-inset-bottom,0px))}
#touch button#tMenu{width:48px;height:48px;border-radius:0;font-size:24px;right:calc(16px + env(safe-area-inset-right,0px));top:calc(264px + env(safe-area-inset-top,0px))}
#tMenuList{position:absolute;pointer-events:auto;right:calc(16px + env(safe-area-inset-right,0px));top:calc(320px + env(safe-area-inset-top,0px));width:min(300px,calc(100vw - 32px));max-height:calc(100vh - 340px - env(safe-area-inset-top,0px));overflow:auto;display:flex;flex-direction:column;gap:4px;background:rgba(20,23,29,.92);border:3px solid var(--steel);padding:6px;box-sizing:border-box}
#tMenuList[hidden],#touch button[hidden]{display:none}
#tMenuList button{position:static;width:100%;height:auto;min-height:44px;border-radius:0;font-size:16px;text-align:left;padding:6px 10px}
#touch:not([data-ctx=car]) :is(#tB,#tH,#tC){display:none}
#touch:is([data-ctx=heli],[data-ctx=train]) :is(#tStick,#tG,#tJ,#tC){display:none}
```

  (Heli and loco on the phone: ☰ and Z only, per spec decision 6.)
- [ ] **Step 4: JS** replaces `const touch = { l: 0, ... }` and its `for` loop:

```js
// #535: the phone controls -- joystick, Gas (Jump on foot), Brake, Handbrake, Z / J / C, the context button and the ☰ menu.
// Buttons that stand for a key press dispatch that key, so the dispatcher's own rules apply (as the command search does).
const touch = { x: 0, y: 0, g: 0, b: 0, h: 0 };
const pressKey = (cmd) => { const init = commandEventInit(cmd); if (!init) return; dispatchEvent(new KeyboardEvent('keydown', init)); dispatchEvent(new KeyboardEvent('keyup', init)); };
bindStick($('tStick'), $('tStick').firstElementChild, (v) => { touch.x = v.x; touch.y = v.y; if (v.x || v.y) stopAuto('off'); });
const holdButton = (id, down, up) => { const el = $(id); const on = e => { e.preventDefault(); down(); }; const off = e => { e.preventDefault(); up(); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off); };
holdButton('tG', () => { if (FOOT.on) keys.Space = true; else { touch.g = 1; stopAuto('off'); } }, () => { keys.Space = false; touch.g = 0; });   // on foot Gas is Jump
holdButton('tB', () => { touch.b = 1; stopAuto('off'); }, () => { touch.b = 0; });
holdButton('tH', () => { touch.h = 1; stopAuto('off'); }, () => { touch.h = 0; });
for (const [id, cmd] of [['tZ', 'KeyZ'], ['tJ', 'KeyJ'], ['tC', 'KeyC'], ['tE', 'KeyE']]) $(id).addEventListener('click', () => pressKey(cmd));
function closeTouchMenu() { $('tMenuList').hidden = true; $('tMenu').setAttribute('aria-expanded', 'false'); }
function openTouchMenu() {
  $('tMenuList').innerHTML = menuEntries(controlContext()).map(m => `<button type="button" data-cmd="${m.cmd}">${tr(m.label)}</button>`).join('');
  $('tMenuList').hidden = false; $('tMenu').setAttribute('aria-expanded', 'true');
}
$('tMenu').addEventListener('click', () => { if ($('tMenuList').hidden) openTouchMenu(); else closeTouchMenu(); });
$('tMenuList').addEventListener('click', (e) => { const b = e.target.closest('button[data-cmd]'); if (!b) return; closeTouchMenu(); pressKey(b.dataset.cmd); });
function stepTouch(ctx, act) {
  $('touch').dataset.ctx = ctx;
  $('tE').hidden = !act; if (act) $('tE').textContent = tr(contextLabel(act));
  $('tG').textContent = FOOT.on ? '⤒' : '▲'; $('tG').setAttribute('aria-label', tr(FOOT.on ? 'barJumpUp' : 'accelerate'));
  $('tZ').setAttribute('aria-label', tr(FOOT.on ? 'barGetIn' : 'barGetOut'));
}
window.__mm.touch = () => ({ ...touch, ctx: $('touch').dataset.ctx });
```

  - Imports: `import { bindStick, TOUCH_LOOK } from './touch.js';` and add `menuEntries, contextLabel` to the `controls.js` import.
  - `stepKeybar`: compute `ctx`/`act` once and call `stepTouch(ctx, act)` before the signature check returns, i.e. move the signature check below it: `const ctx = ..., act = ...; stepTouch(ctx, act); if (sig === KEYBAR.sig) return; ...`. (`stepTouch` only writes attributes; cheap.)
  - `stepCar` steer: `steer = ap ? ap.steer : Math.max(-1, Math.min(1, ((inp.KeyD || inp.ArrowRight) ? 1 : 0) - ((inp.KeyA || inp.ArrowLeft) ? 1 : 0) + (tch.x || 0)))` (`tch` is `NO_INPUT` in a wreck, so `tch.x` is undefined there).
  - `stepOnFoot`: `footInput(keys)` becomes `footInput(keys, touch)`.
  - Touch look on foot (today there is none: only the pointer-lock mouse, grep `document.addEventListener('mousemove'`; the spec assumes it exists). After the `#gl` `pointerdown` beam handler:

```js
const TLOOK = { id: null, x: 0, y: 0 };   // #535: one finger dragged on the world turns the walker
$('gl').addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || !FOOT.on || TLOOK.id !== null) return; TLOOK.id = e.pointerId; TLOOK.x = e.clientX; TLOOK.y = e.clientY; });
$('gl').addEventListener('pointermove', e => { if (e.pointerId !== TLOOK.id) return; footMouse((e.clientX - TLOOK.x) * TOUCH_LOOK, (e.clientY - TLOOK.y) * TOUCH_LOOK); TLOOK.x = e.clientX; TLOOK.y = e.clientY; });
for (const t of ['pointerup', 'pointercancel']) $('gl').addEventListener(t, e => { if (e.pointerId === TLOOK.id) TLOOK.id = null; });
```

- [ ] **Step 5: Update existing tests** for the removed `#tL` / `#tR`:
  - `tests/test_i18n.py:63`: `steerLeft: document.querySelector('#tL').getAttribute('aria-label')` becomes `stick: document.querySelector('#tStick').getAttribute('aria-label')`; line 80 `assert shown["steerLeft"] == "Links lenken"` becomes `assert shown["stick"] == "Lenken · gehen"` (same check: the touch control's aria label is translated).
  - `tests/test_debug.py:333`: selectors `("#tL", "#tR", "#tH")` become `("#tStick", "#tG", "#tB", "#tH", "#tZ", "#tJ", "#tC", "#tMenu")` (more controls checked, not fewer).
- [ ] **Step 6: Failing-then-passing browser test** `tests/test_touch_controls.py`. Context like `tests/test_pause.py` `open_page(phone=True)` but 390×844: `b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, locale="de-CH")` (has_touch without is_mobile: no viewport meta, see that file's comment), routes for hand layout as in `test_on_foot.py`, then `page.click("#startbtn")`. Helpers:

```python
PTR = """([sel, type, id, dx, dy]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true,
    clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 + dy })); }"""
ptr = lambda page, sel, t, i, dx=0, dy=0: page.evaluate(PTR, [sel, t, i, dx, dy])
```

  Tests (each asserts `errors == []`):
  1. `test_joystick_steers_while_gas_is_held`: `ptr(#tStick, pointerdown, 1)`, `ptr(#tStick, pointermove, 1, 56, 0)`, `ptr(#tG, pointerdown, 2)`; wait for `window.__mm.drive().gas === 1`; read `window.__mm.touch()`; assert `x == 1` and `g == 1` (two pointers at once); release both, assert `x == 0`.
  2. `test_z_button_gets_out_and_the_controls_switch_to_foot`: place at `ROAD` (copy from `test_on_foot.py`), `page.tap("#tZ")`, wait `window.__mm.foot().on`; assert `touch().ctx == "foot"`, `#tB`, `#tH` and `#tC` (camera, car only) not visible, `#tG` aria-label `springen`; `ptr(#tStick, ...)` forward (`dy=-56`) then `window.__mm.footSim(1, [])` moves the walker (`foot().x` changes).
  3. `test_context_button_appears_at_a_glowing_door`: on foot, `setReady('plattform-sisslerfeld', true, [x + 12, z])`, place at `x + 10`; wait `#tE` visible with text `eintreten`; tap it; assert the toast is `Noch nicht begehbar` (`enterSoon`, de).
  4. `test_menu_lists_the_rest_and_runs_a_row`: tap `#tMenu`; rows = `#tMenuList button`; assert count `== len(menuEntries('car'))` read via `page.evaluate("async () => (await import('./controls.js')).menuEntries('car').length")`, every row height ≥ 44, a row with `data-cmd="KeyV"` exists; tap it; assert `hud().carVisible` is False and the list is hidden.
  5. `test_phone_layout_fits`: no horizontal scroll (`document.documentElement.scrollWidth <= 390`); every visible control inside the viewport and ≥ 44 px both ways; no two of `#tStick #tG #tB #tH #tZ #tJ #tC #tMenu` overlap; `#keybar` and `#pausekeybar` are `display:none`.
- [ ] **Step 7: Commit and push**, then run in the foreground: `node --test tests/*.test.mjs`; `pytest tests/test_touch_controls.py tests/test_i18n.py tests/test_carselect.py tests/test_pause.py -x`; `pytest tests/test_debug.py -k legend -x`. Expected: PASS.
- [ ] **Step 8: Commit** `git commit -am "feat(touch): joystick, context button and ☰ menu on phones (#535)"`

### Task 8: Phase 2 CHANGELOG and PR

- [ ] **Step 1:** `CHANGELOG.md` `[Unreleased]` `### Changed`:

```markdown
- `YYYY-MM-DD HH:MM` **On the phone** you now steer and walk with a **joystick** on the left, with **Gas** and **Brake** on the right (on foot Gas jumps), round buttons to **get out/in**, **jump to a place** and (in the car) switch the **camera**, a yellow button for whatever **E** does right here (enter, go out, call the lift), and a **☰ menu** with every other action. On foot, drag a finger across the picture to look around. Helicopter and steam loco are reached through ☰ for now.
```

- [ ] **Step 2:** All node tests once more; push; open the Phase 2 PR (`feat(touch): phone controls, phase 2 (#535)`, body `Closes #535`).

---

## Files per phase

- **Phase 1:** `controls.js` (new), `foot.js`, `train.js`, `route.js`, `pause.js`, `strings.js`, `index.html`, `CHANGELOG.md`; tests: `tests/controls.test.mjs` (new), `tests/test_controls.py` (new), `tests/test_keybar.py` (new), `tests/foot.test.mjs`, `tests/train.test.mjs`, `tests/route.test.mjs`, `tests/pause.test.mjs`, `tests/test_pause.py`, `tests/test_smoke.py`, `tests/test_lights.py`, `tests/test_enter_6c.py`.
- **Phase 2:** `touch.js` (new), `foot.js`, `strings.js`, `index.html`, `CHANGELOG.md`; tests: `tests/touch.test.mjs` (new), `tests/test_touch_controls.py` (new), `tests/foot.test.mjs`, `tests/test_i18n.py`, `tests/test_debug.py`.
- **Overlap with #551:** `pause.js`, `strings.js`, `index.html`, `tests/pause.test.mjs`, `tests/test_pause.py` (Phase 1); `strings.js`, `index.html` (Phase 2). Hence: #551 first, then rebase.
