// #649 / #652: swissBUILDINGS3D landmarks (assets/landmarks, exported by .claude/skills/ch-landmarks) placed in the world.
// Pure: no three.js, no DOM. Landmark frame x = E - e, y = H - h, z = -(N - n) (landmarks.yaml origin); world frame
// x = E - E0, z = -(N - N0) (world origin) and y = H - base (terrain .mmh header).

// which OSM building each landmark replaces, and where; the export's index.json knows nothing of OSM
export const REPLACES = {
  'fridolinskapelle-sisseln': { osm: 171822707, region: 'hochrhein' },   // building=chapel, Schulhausstrasse 6.1, Sisseln
};

export function landmarkOffset(lm, world, base) {
  return { x: lm.e - world.E, y: lm.h - base, z: -(lm.n - world.N) };
}

export function chLandmarksFor(index, regionId, world, base) {
  if (!index || !index.origin || !index.landmarks || !world || base == null) return [];
  const offset = landmarkOffset(index.origin, world, base);
  return Object.entries(index.landmarks).flatMap(([id, lm]) => {
    const r = REPLACES[id];
    if (!r || r.region !== regionId) return [];
    return [{ id, file: lm.file, offset, top: lm.bounds.max[1] + offset.y, osm: r.osm }];
  });
}

// a face whose normal points up more than ~20 degrees from vertical walls is roof
export function roofOrWall(ny) { return ny > 0.35 ? 'roof' : 'wall'; }
