// #6 / #126: vehicle helpers -- pure, no three.js, no DOM. Unit-tested with `node --test tests/*.test.mjs`.
// `?vehicle=<id>` picks a table entry at startup; unknown ids are ignored (the picker UI is #7)
export function vehicleFromQuery(search, ids) {
  const id = new URLSearchParams(search).get('vehicle');
  return id !== null && ids.includes(id) ? id : null;
}

// #902: a rise under a grounded car launches it only when it is a slope (a crest, the Sprungschanze), not a kerb (a road
// ribbon's edge over an embankment, the kreisel apron). Sampled at a fixed spacing along the frame's path, so frame rate and speed don't matter.
export const KERB = { grade: 0.5, spacing: 0.25, keep: 0.6, min: 1, snap: 0.6 };

export function stepSamples(x0, z0, x1, z1, spacing = KERB.spacing) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / spacing));
  return Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
}

export function isKerb(heights, run, grade = KERB.grade) {
  const gap = run / (heights.length - 1);
  for (let i = 1; i < heights.length; i++) if (heights[i] - heights[i - 1] > grade * gap) return true;
  return false;
}

export function launchVy(lift, dt, kerb, cfg = KERB) {
  if (kerb || lift <= 0) return 0;
  const v = lift / dt * cfg.keep;
  return v < cfg.min ? 0 : v;
}

// #902: the far side of a rise -- the ground ahead (heights[0] is where the car stands) steps DOWN like a kerb (steeper
// than grade over one spacing) and the ground right after the step lands within the snap window below the car. The car
// rolls over such an edge and is set down onto the lower ground; only a real drop (the Sprungschanze's 3.4 m take-off)
// keeps its launch. The bottom is the ground after the step, not the lowest sample of the look-ahead: what lies beyond
// the edge (a yard falling away) must not widen the drop.
export function isEdge(heights, run, cfg = KERB) {
  const gap = run / (heights.length - 1);
  for (let i = 1; i < heights.length; i++) if (heights[i - 1] - heights[i] > cfg.grade * gap)
    return heights[0] - heights[i] > 0 && heights[0] - heights[i] <= cfg.snap;
  return false;
}
