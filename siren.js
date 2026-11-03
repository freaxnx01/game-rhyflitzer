// siren.js — the Rhy Blaze's blue lights and two-tone siren ("tatütata"), switched together with the 2 key. Pure module: no DOM,
// no three.js, so node --test can import it. index.html flashes the Beacon0 / Beacon1 materials of the model
// (tools/prepare-blaze.mjs, extras.beacon = 0 left, 1 right) with beaconGlow(beaconLevels(t)[i]) and lets the SFX voice follow
// sirenNote(t). A vehicle has a siren when its table entry carries `siren` (these numbers).
export const SIREN = {
  notes: [440, 587],   // A and D, a fourth apart like the European two-tone horn
  step: 0.6,           // s each tone
  flash: 0.8,          // s for one turn of the blue lights: left flashes twice, then right twice
  gain: 0.16, band: 1500, wave: 'square',
};

export function hasSiren(def) { return Boolean(def.siren); }

export function toggleSiren(on, def) { return hasSiren(def) && !on; }

export function sirenNote(t) { return SIREN.notes[Math.floor(t / SIREN.step) % 2]; }

// [left, right], each 0 or 1: within each half of the turn, the side flashes twice (on 0-20 % and 40-60 % of its half)
export function beaconLevels(t) {
  const phase = ((t / SIREN.flash) % 1 + 1) % 1, side = phase < 0.5 ? 0 : 1, u = (phase % 0.5) * 2;
  const lit = u < 0.2 || (u >= 0.4 && u < 0.6) ? 1 : 0;
  return side === 0 ? [lit, 0] : [0, lit];
}

export function beaconGlow(level) { return level ? 3 : 0.1; }
