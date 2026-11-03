// viewpoints.js (#508): the viewpoint hunt -- the hand-picked panorama spots, where a photo counts and what it scores.
// Pure: no DOM, no three.js. Unit-tested with `node --test tests/*.test.mjs`.
// World metres, x east, z south (origin: data/world_<region>.json). Names are proper names: never translated.

export const VIEW = { aimDeg: 30, base: 100, bonus: 50, endS: 2 };

// stand `at` (a landmark key of the world's anchors.landmarks, or {x, z}) within r metres, at least `aboveGround` metres up
// (the Plattform deck), and face `subject` (a landmark key or {x, z})
export const VIEWPOINT_DEFS = {
  hochrhein: [
    { id: 'rheinblick', n: 'Rheinblick Stein', at: { x: -1515.1, z: 870.4 }, r: 25, subject: 'fridolinsbruecke', subjectN: 'Fridolinsbrücke' },   // #508: the car park above the Rhine, LV95 2638266 / 1265917
    { id: 'plattform', n: 'Plattform Sisslerfeld', at: 'plattform', r: 6, aboveGround: 5, subject: 'dsmChimney', subjectN: 'DSM-Kamin' },   // the deck (5.735 m, plattform.js), on foot via the stair (#413)
    { id: 'fridolinsbruecke', n: 'Fridolinsbrücke', at: 'fridolinsbruecke', r: 40, subject: 'holzbruecke', subjectN: 'Holzbrücke' },
    { id: 'muensterplatz', n: 'Münsterplatz', at: { x: -1290.3, z: -91.4 }, r: 30, subject: 'muenster', subjectN: 'Fridolinsmünster' },
  ],
};

export function viewpointsFor(region) {
  return region.generated ? [] : VIEWPOINT_DEFS[region.id] || [];
}

const pointOf = (ref, landmarks) => (typeof ref === 'string' ? landmarks[ref] : ref);

// a world without one of the landmarks simply has one viewpoint fewer
export function resolveViewpoints(defs, landmarks = {}, groundAt) {
  const out = [];
  for (const d of defs) {
    const at = pointOf(d.at, landmarks), subject = pointOf(d.subject, landmarks);
    if (!at || !subject) continue;
    const minY = d.aboveGround === undefined ? -Infinity : groundAt(at.x, at.z) + d.aboveGround;
    out.push({ id: d.id, n: d.n, subjectN: d.subjectN, x: at.x, z: at.z, r: d.r, minY, sx: subject.x, sz: subject.z });
  }
  return out;
}

// pose = { x, y, z } of the player plus the camera's horizontal direction { dx, dz }
export function standsAt(vp, pose) {
  return Math.hypot(pose.x - vp.x, pose.z - vp.z) <= vp.r && pose.y >= vp.minY;
}

export function standingAt(spots, shot, pose) {
  return spots.findIndex((vp, i) => !shot[i] && standsAt(vp, pose));
}

export function aimError(vp, pose) {
  const want = Math.atan2(vp.sz - pose.z, vp.sx - pose.x), have = Math.atan2(pose.dz, pose.dx);
  const d = Math.abs(want - have) % (2 * Math.PI);
  return (d > Math.PI ? 2 * Math.PI - d : d) * 180 / Math.PI;
}

export function shotPoints(vp, pose) {
  if (!standsAt(vp, pose)) return 0;
  const err = aimError(vp, pose);
  return err > VIEW.aimDeg ? 0 : VIEW.base + Math.round(VIEW.bonus * (1 - err / VIEW.aimDeg));
}

export const maxPoints = (spots) => spots.length * (VIEW.base + VIEW.bonus);
