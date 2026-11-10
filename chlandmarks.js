// #649 / #652: swissBUILDINGS3D landmarks (assets/landmarks, exported by .claude/skills/ch-landmarks) placed in the world.
// Pure: no three.js, no DOM. Landmark frame x = E - e, y = H - h, z = -(N - n) (landmarks.yaml origin); world frame
// x = E - E0, z = -(N - N0) (world origin) and y = H - base (terrain .mmh header).

// which OSM building each landmark replaces, and where; the export's index.json knows nothing of OSM
export const REPLACES = {
  'fridolinskapelle-sisseln': { osm: 171822707, region: 'hochrhein' },   // building=chapel, Schulhausstrasse 6.1, Sisseln
  'kirche-bruder-klaus-stein': { osm: 407386050, region: 'hochrhein' },  // #715: Kath. Kirche Hl. Bruder Klaus, Schulstrasse 5, Stein
  // #715: Reformierte Kirche, Gartenstrasse 9, Stein (w88836292): not in the world file (#716), so no box to replace; rect = its
  // collider, the OSM footprint through pipeline world_buildings.roof() (world frame [cx, cz, w, d, rot])
  'reformierte-kirche-stein': { osm: null, region: 'hochrhein', rect: [-1177.97, 795.86, 34.75, 26.71, -2.7343] },
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
    return [{ id, file: lm.file, offset, top: lm.bounds.max[1] + offset.y, osm: r.osm, ...(r.rect ? { rect: r.rect } : {}) }];
  });
}

// a face whose normal points up more than ~20 degrees from vertical walls is roof
export function roofOrWall(ny) { return ny > 0.35 ? 'roof' : 'wall'; }
