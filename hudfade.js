// hudfade.js (#773): pure rules for the driving HUD's secondary elements -- when they fade to a ghost, when they wake,
// what a mode shows, the heading text of the map bar. No DOM: node --test imports it; hud() in index.html samples
// the DOM and applies what these rules say.
export const FADE_S = Object.freeze({ hold: 4, wake: 3, keybar: 30 });   // seconds of game time
export const GHOST_OPACITY = 0.28;
// the elements the fader manages, by the id that gets the class (the three #gear plates get ids in index.html)
export const FADED = Object.freeze(['tl', 'dmgplate', 'gearplate', 'tripplate', 'watername', 'roadname', 'autoline', 'prompt', 'best']);

export function createFader(t = 0) { return { t, items: {} }; }
export function resetFader(f) { f.items = {}; }   // a run start: everything holds its 4 s again

// values = { id: string | null } -- null means "nothing to show". A fresh or re-appearing value holds for FADE_S.hold,
// a change of a shown value lights it for FADE_S.wake. Mutates and returns the fader.
export function sample(f, values, t) {
  f.t = t;
  for (const id of Object.keys(values)) {
    const v = values[id], it = f.items[id];
    if (!it) { f.items[id] = { value: v, since: t, changed: false }; continue; }
    if (v === it.value) continue;
    it.changed = it.value !== null && v !== null;
    it.value = v; it.since = t;
  }
  return f;
}

export function phase(f, id) {
  const it = f.items[id];
  if (!it || it.value === null) return 'hidden';
  return f.t - it.since < (it.changed ? FADE_S.wake : FADE_S.hold) ? 'awake' : 'ghost';
}

export function phases(f) { return Object.fromEntries(Object.keys(f.items).map(id => [id, phase(f, id)])); }

// the key bar has one timer of its own, restarted by a new context signature (KEYBAR.sig in index.html)
export function createKeybar(t = 0) { return { sig: null, since: t }; }
export function keybarPhase(k, sig, t) {
  if (k.sig !== sig) { k.sig = sig; k.since = t; }
  return t - k.since < FADE_S.keybar ? 'awake' : 'ghost';
}

// what a mode shows at all -- mirrors the CSS in index.html: body.cruise hides the clock, the pips and the target
// (#551), body.tutorial hides the clock (#534). Blitz, hunt and view are timed and show everything.
const TRIAL_ONLY = new Set(['tr', 'best', 'cps', 'pips', 'arrow', 'dist', 'cpname']);
export function visibleInMode(id, mode) {
  if (mode === 'cruise') return !TRIAL_ONLY.has(id);
  if (mode === 'tutorial') return id !== 'tr' && id !== 'best';
  return true;
}

// 'NE 37°' for the map bar; east is 'E' or the language's letter ('O' in German), so NE → NO and SE → SO
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function headingText(deg, east = 'E') {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return `${POINTS[Math.round(d / 45) % 8].replace('E', east)} ${d}°`;
}
