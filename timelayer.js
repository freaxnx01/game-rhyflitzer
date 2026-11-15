// #530: the 1952 time layer, pure helpers. Ctrl+Y toggles it; matched by letter like the plain-Y borders toggle (QWERTZ puts Y on KeyZ).
export function isEraKey(e) { return !!e.ctrlKey && (e.key || '').toLowerCase() === 'y'; }
export function eraAvailable(world) { return !!(world && world.era); }
export function clearExempt(buildings, keep) {
  let n = 0;
  for (const b of buildings) if (b.modern && keep(b)) { delete b.modern; n++; }
  return n;
}
export function eraShown(entry, on) { return !(on && entry.modern); }
