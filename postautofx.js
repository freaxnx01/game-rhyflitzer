// #709: which Postautos are heard and how loud. Pure module, node --test only.
export const FX = { ref: 8, max: 80, voices: 3, floor: 0.02 };

export function engineGain(dist, cfg = FX) {
  if (!(dist >= 0) || dist >= cfg.max) return 0;
  if (dist <= cfg.ref) return 1;
  const k = (dist - cfg.ref) / (cfg.max - cfg.ref);
  return (1 - k) * (1 - k);
}

export function pickVoices(buses, listener, cfg = FX) {
  return buses
    .filter((b) => b.phase !== 'done')
    .map((b) => ({ key: b.key, gain: engineGain(Math.hypot(b.x - listener.x, b.z - listener.z), cfg), kmh: b.v * 3.6 }))
    .filter((v) => v.gain > cfg.floor)
    .sort((a, b) => b.gain - a.gain || (a.key < b.key ? -1 : 1))
    .slice(0, cfg.voices);
}

// per-frame savings for a drawn bus: the LED is only repainted when its text changed, and the ground under a bus
// that crept less than GROUND_EPS metres along its route is not sampled again
export const GROUND_EPS = 0.1;

export function ledCurrent(prev, trip, thanks) {
  return !!prev && prev.line === String(trip.line) && prev.dest === trip.to && prev.thanks === thanks;
}

export function groundStale(lastS, s, eps = GROUND_EPS) {
  return lastS === undefined || !(Math.abs(s - lastS) < eps);
}