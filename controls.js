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
// #735: the car radio on the top-row digits 5-0, in every run context (the lift pad's floors take precedence while it is open)
const radio = () => [
  entry('radioPower', ['Digit5'], { label: 'keyRadioPower' }), entry('radioStation', ['Digit6'], { label: 'keyRadioStation' }),
  entry('radioTrack', ['Digit7', 'Digit8'], { label: 'keyRadioTrack' }), entry('radioVolume', ['Digit9', 'Digit0'], { label: 'keyRadioVolume' }),
];

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
  menu('record', ['Backquote'], 'keyRecord'),   // #749: the literal stays -- controls.js does not import record.js, so the modules stay independent
  entry('pause', ['Escape', 'KeyP'], { label: 'keyPause' }),
  ...radio(),
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
  menu('record', ['Backquote'], 'keyRecord'),   // #749: also in the indoor / foot contexts, so § records there too
  ...radio(),
];
const TABLE = {
  car: CAR,
  foot: [...WALK, menu('hover', ['KeyF'], 'menuHover')],
  indoors: WALK,
  heli: [entry('fly', MOVE, { hold: true }), entry('climb', ['Space'], { hold: true }), entry('sink', SHIFT, { hold: true }), entry('heliNitro', ['KeyN'], { hold: true }), menu('land', ['KeyF'], 'keyHeli'), ...radio(), help()],
  train: [entry('steam', ['KeyW'], { hold: true }), entry('trainBrake', ['KeyS'], { hold: true }), menu('switchLeft', ['KeyQ'], 'menuSwitchLeft'), menu('switchRight', ['KeyE'], 'menuSwitchRight'),
    menu('whistle', ['KeyH'], 'menuWhistle'), menu('trainReset', ['KeyR'], 'keyReset'), entry('trainCamera', ['KeyC'], {}), entry('turnLeft', ['KeyA'], {}), entry('turnRight', ['KeyD'], {}), entry('leaveTrain', ['KeyZ'], { touch: 'button' }), ...radio(), help()],
  lift: [entry('floor', ['Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], {}), entry('roof', ['KeyD'], {}), entry('context', ['KeyE'], {}), help()],
};

export const entriesFor = (context) => TABLE[context] || [];

export function actionFor(context, code) {
  const hit = entriesFor(context).find(e => e.keys.includes(code));
  return hit ? hit.action : null;
}

const CONTEXT_LABELS = { enter: 'barEnter', leave: 'barLeave', lift: 'barLift', up: 'barHopUp', down: 'barHopDown', board: 'barBoard', timetable: 'barTimetable' };   // #553, #801
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

// E on foot: the lift (inside, at the lift gap) wins over leaving, leaving over a hop (#701: up / down the Plattform) over a glowing door
// over a parked depot vehicle (#553) over a stop's timetable board (#801)
export function contextKeyAction({ liftPrompt, indoors, doorPrompt, hop = null, boardPrompt, stopPrompt = false }) {
  if (liftPrompt) return 'lift';
  if (indoors) return 'leave';
  if (hop) return hop;
  if (doorPrompt) return 'enter';
  if (boardPrompt) return 'board';
  return stopPrompt ? 'timetable' : null;
}

export const KEYBAR_KEY = 'mm.keybar';
export const keybarOnFrom = (stored) => stored !== '0';