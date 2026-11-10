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