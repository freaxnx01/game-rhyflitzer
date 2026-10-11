// #165: where a beam to a clicked terrain point lands. No DOM, no three.js: unit-tested with `node --test prototype/tests/*.test.mjs`.

// metres: how far the nearest road may be when the clicked point itself is blocked (water, a building)
export const BEAM_SNAP = 30;

// blocked(x, z) -> bool; nearestRoad(x, z) -> { d, x, z, th } | null
// -> { x, z, kind: 'terrain' } | { x, z, th, kind: 'road' } | null (nowhere to land)
export function beamSpot(x, z, { blocked, nearestRoad }) {
  if (!blocked(x, z)) return { x, z, kind: 'terrain' };
  const road = nearestRoad(x, z);
  if (!road || road.d > BEAM_SNAP) return null;
  return { x: road.x, z: road.z, th: road.th, kind: 'road' };
}
