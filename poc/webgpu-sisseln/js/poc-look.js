// PoC: pure helpers for the T (time of day) and R (wet roads) keys; no three/tsl imports so node --test can load it.
export const TIME_ORDER = ['golden', 'midday', 'twilight', 'midnight'];
export const WET_ROAD_WETNESS = 0.9;

export function nextTimePreset(id) {
  const index = TIME_ORDER.indexOf(id);
  if (index === -1) return TIME_ORDER[0];
  return TIME_ORDER[(index + 1) % TIME_ORDER.length];
}

export function roadWetness(presetWetness, wet) {
  return wet ? Math.max(presetWetness, WET_ROAD_WETNESS) : presetWetness;
}

export function isLookKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (event.code === 'KeyT') return 'time';
  if (event.code === 'KeyR') return 'wet';
  return null;
}
