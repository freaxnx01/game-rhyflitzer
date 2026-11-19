// hints.js (#1090): the discovery hints -- which hint exists, when it may show, what a tap on it does and what the
// player has seen already. Pure: no DOM, no three.js (node --test imports it). The card itself is #1093.
import { keyCap } from './tutorial.js';

export const HINT_CFG = { paceS: 150, firstS: 90, stayS: 20, maxShows: 3, winkPlayS: 3600 };
export const HINTS_KEY = 'mm.hints', HINTS_ON_KEY = 'mm.hintsOn', PLAY_TIME_KEY = 'mm.playTime';

// kind: 'time' (after some Cruise minutes, in catalogue order) | 'mode' | 'event' (sess.events holds `event`) |
//       'place' (the player is at the spot: ctx.near holds the id) | 'wink' (the one hideout nudge)
// keys: what the card shows as a cap; empty = a statement, nothing to press. tap: false for a key that must be held.
// touch: false while the action has no touch route at all (heli flight, loco, nitro, full map -- #1091).
// touchSel: the on-screen button a tap clicks instead of pressing the key. region / hideout: where the spot is.
// text / touchText: strings.js keys; the touch text names the buttons instead of the keys.
const entry = (kind, id, keys, o) => ({
  kind, id, keys,
  tap: o.tap !== false,
  touch: o.touch !== false,
  touchSel: o.touchSel ?? null,
  region: o.region ?? null,
  hideout: !!o.hideout,
  event: o.event ?? null,
  text: `hint${id[0].toUpperCase()}${id.slice(1)}`,
  touchText: o.touchText ?? null,
  icon: o.icon,
});
const place = (id, keys, o) => entry('place', id, keys, { region: 'hochrhein', ...o });

export const HINTS = [
  entry('time', 'heli', ['KeyF'], { touch: false, icon: '🚁' }),
  entry('time', 'jumpTo', ['KeyJ'], { icon: '📍' }),
  entry('time', 'autopilot', ['KeyO'], { icon: '🧭' }),
  entry('time', 'radio', ['Digit5', 'Digit0'], { touchSel: '#radiobtn', icon: '📻' }),
  entry('time', 'camera', ['KeyC'], { icon: '🎥' }),
  entry('time', 'nitro', ['KeyN'], { tap: false, touch: false, icon: '💨' }),
  entry('time', 'fullMap', ['Tab'], { tap: false, touch: false, icon: '🗺️' }),
  entry('time', 'photo', ['KeyX'], { icon: '📷' }),
  entry('mode', 'modes', ['Escape'], { icon: '🏁' }),
  entry('event', 'foot', ['Space'], { tap: false, event: 'footOut', touchText: 'hintFootTouch', icon: '🚶' }),
  place('loco', ['KeyZ'], { touch: false, icon: '🚂' }),
  place('postauto', ['KeyE'], { touchSel: '#tE', icon: '🚌' }),
  place('depot', ['KeyE'], { touchSel: '#tE', icon: '🅿️' }),
  place('pontoon', ['KeyU'], { icon: '🌉' }),
  place('plattform', [], { icon: '🗼' }),
  place('holz', [], { icon: '🪵' }),
  place('crash', [], { icon: '💥' }),
  place('ostriches', [], { icon: '🐦' }),
  place('bodenacker', [], { icon: '🚪' }),
  place('ferris', ['Digit3'], { touch: false, hideout: true, icon: '🎡' }),
  place('freight', [], { hideout: true, icon: '🛗' }),
  entry('wink', 'wink', [], { icon: '🤫' }),
];

// ---------- the seen store: id -> { shown, seen }. A null store means localStorage is blocked: everything is seen, we never nag. ----------
export function hintStoreFrom(raw) {
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const [id, v] of Object.entries(parsed)) {
    if (!v || typeof v !== 'object') continue;
    out[id] = { shown: Number.isFinite(+v.shown) ? +v.shown : 0, seen: v.seen === true };
  }
  return out;
}

export const hintSeen = (store, id) => (store ? store[id]?.seen === true : true);

// how: 'acted' (the key was pressed or the card tapped) | 'closed' (x, or hints switched off) | 'timeout'
export function hintStoreAfter(store, hint, how) {
  if (!store) return null;
  const shown = (store[hint.id]?.shown ?? 0) + 1;
  const seen = how !== 'timeout' || hint.keys.length === 0 || shown >= HINT_CFG.maxShows;
  return { ...store, [hint.id]: { shown, seen } };
}

export const hintsOnFrom = (stored) => stored !== '0';

export function playTimeFrom(stored) {
  const secs = Number(stored);
  return Number.isFinite(secs) && secs > 0 ? secs : 0;
}

// ---------- the session: what this visit has seen happen. sinceLast = seconds since the last card (the pace). ----------
export const newHintSession = () => ({ sinceLast: Infinity, cruiseS: 0, events: [], waitLeave: [] });

export function hintTick(sess, dt, { cruising, near }) {
  return {
    ...sess,
    sinceLast: sess.sinceLast + dt,
    cruiseS: cruising ? sess.cruiseS + dt : sess.cruiseS,
    waitLeave: sess.waitLeave.filter(id => near.includes(id)),   // a place hint waits until the player has left its spot
  };
}

export const hintEvent = (sess, name) => (sess.events.includes(name) ? sess : { ...sess, events: [...sess.events, name] });

export function hintSessionAfter(sess, hint) {
  return { ...sess, sinceLast: 0, waitLeave: hint.kind === 'place' ? [...sess.waitLeave, hint.id] : sess.waitLeave };
}

// ---------- which hints a mode allows ----------
const SCOPES = { cruise: 'all', view: 'place', hunt: 'place' };   // Viewpoints and the Surprise hunt: statements only -- flying or boarding would taint the run
export const hintScope = (mode, multiplayer) => (multiplayer ? 'none' : SCOPES[mode] ?? 'none');

export function hintAllowed(hint, ctx, scope) {
  if (scope === 'none') return false;
  if (scope === 'place' && (hint.kind !== 'place' || hint.keys.length > 0 || hint.hideout)) return false;
  if (ctx.coarse && !hint.touch) return false;
  if (hint.region && hint.region !== ctx.region) return false;
  if (hint.hideout && !ctx.hideoutFound) return false;
  if (hint.kind === 'wink' && (ctx.hideoutFound || ctx.playTime < HINT_CFG.winkPlayS)) return false;
  return true;
}

// the one hint to show now, or null. store null (blocked) shows nothing; a place hint the player stands at breaks the pace.
export function pickHint(store, sess, ctx) {
  if (!store) return null;
  const scope = hintScope(ctx.mode, ctx.multiplayer);
  const open = HINTS.filter(h => hintAllowed(h, ctx, scope) && !hintSeen(store, h.id));
  const atSpot = open.find(h => h.kind === 'place' && ctx.near.includes(h.id) && !sess.waitLeave.includes(h.id));
  if (atSpot) return atSpot;
  if (sess.sinceLast < HINT_CFG.paceS) return null;
  const happened = open.find(h => h.kind === 'event' && sess.events.includes(h.event));
  if (happened) return happened;
  if (sess.cruiseS >= HINT_CFG.firstS) {
    const told = open.find(h => h.kind === 'time' || h.kind === 'mode');
    if (told) return told;
  }
  return open.find(h => h.kind === 'wink') ?? null;
}

// ---------- the card's two readings: what a tap does, and what the key cap says ----------
export function hintTap(hint, coarse) {
  if (coarse && hint.touchSel) return { via: 'click', sel: hint.touchSel };
  if (!hint.tap || hint.keys.length === 0) return null;
  return { via: 'key', cmd: hint.keys[0] };
}

export const hintCap = (hint) => (hint.keys.length ? hint.keys.map(keyCap).join('–') : null);
