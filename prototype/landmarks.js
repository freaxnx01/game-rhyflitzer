// The J dialog's landmarks (#41): names and Gemeinden kept by hand here, positions from the loaded world
// (an anchors.landmarks key or a world building id), or a fixed game point (at). Pure: no DOM, no three.js.
export const GEMEINDEN = ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln'];   // west → east

// Gemeinden verified against OpenStreetMap on 2026-10-02/03 (#41, #46, #81, #103)
export const LANDMARK_INFO = [
  { name: 'Fridolinsmünster', gemeinde: 'Bad Säckingen', anchor: 'muenster' },
  { name: 'Holzbrücke', gemeinde: 'Bad Säckingen', anchor: 'holzbruecke' },
  { name: 'Fridolinsbrücke', gemeinde: 'Bad Säckingen', anchor: 'fridolinsbruecke', jump: [-1211.0, 535.5] },   // #79: J lands on the Swiss approach (Stein), westbound, ~23 m before the deck
  { name: 'Schloss Schönau (Trompeterschloss)', gemeinde: 'Bad Säckingen', building: 390621357 },
  { name: 'Gallusturm', gemeinde: 'Bad Säckingen', building: 25835477 },
  { name: 'Diebsturm', gemeinde: 'Bad Säckingen', building: 92036948 },
  { name: 'Bahnhof Bad Säckingen', gemeinde: 'Bad Säckingen', building: 25049518 },     // station building of n313032305
  { name: 'Kursaal', gemeinde: 'Bad Säckingen', building: 91592556 },                  // contains n426864010
  { name: 'Aqualon Therme', gemeinde: 'Bad Säckingen', building: 92039355 },
  { name: 'Bergsee', gemeinde: 'Bad Säckingen', at: [-2349, -2207], jump: [-2281.8, -2179.9] },   // #94: the OSM lake "Bergsee" above Bad Säckingen (its ring mean); J lands on Am Bergsee, facing across the water
  { name: 'Kirche Stein', gemeinde: 'Stein', anchor: 'steinChurch' },
  { name: 'Bahnhof Stein-Säckingen', gemeinde: 'Stein', anchor: 'stationStein' },
  { name: 'Plattform Sisslerfeld', gemeinde: 'Münchwilen', anchor: 'plattform', jump: [78.1, 861.4] },   // #94: the tower stands on Breitenloh; J lands 25 m east of it on the same road, facing it
  { name: 'Reservoir Hübel', gemeinde: 'Münchwilen', at: [-712.8, 1528.2], jump: [-703.3, 1419.1], look: [-703.7, 1423.6] },   // #102: the hideout in the Hübel (always listed, the name keeps the tower secret); J lands on the Hübel looking at the gate (look: the tunnel mouth)
  { name: 'DSM-Kamin', gemeinde: 'Eiken', anchor: 'dsmChimney' },
  { name: 'Bahnhof Sisseln', gemeinde: 'Eiken', anchor: 'stationSisseln' },
  { name: 'Bahnhof Eiken', gemeinde: 'Eiken', building: 199241726 },
  { name: 'LANDI-Turm', gemeinde: 'Eiken', anchor: 'landiTurm' },                    // Sisslerstrasse 19.1, w197688923 (#81)
  { name: 'Südspange Sisslerfeld', gemeinde: 'Eiken', at: [1528, 409] },            // #125: the K295 junction, the road's start; J snaps to the nearest road (the K295 until #42 builds the Südspange)
  { name: 'Güggeli-Foodtruck', gemeinde: 'Eiken', anchor: 'foodTruck' },            // Bahnhof Eiken car park, a first guess (#103); the position lives in pipeline/anchors.json
  { name: 'DSM-Wasserturm', gemeinde: 'Sisseln', anchor: 'dsmWaterTower' },
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Hallenbad Sissila', gemeinde: 'Sisseln', anchor: 'hallenbad' },
  { name: 'Bodenackerstrasse 6c', gemeinde: 'Sisseln', building: 171822634 },
  { name: 'Bodenackerstrasse 10B', gemeinde: 'Sisseln', building: 171822943 },
  { name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp', ramp: true },     // J puts the car on its run-up, not on a road (#80)
  { name: 'Gemeindehaus Sisseln', gemeinde: 'Sisseln', building: 171822808 },
  { name: 'Schulhaus Sisseln', gemeinde: 'Sisseln', building: 171822721 },
];

// #127: the second region. Positions from the Ehrendingen world (pipeline/anchors_ehrendingen.json, kept buildings).
export const GEMEINDEN_EHRENDINGEN = ['Ehrendingen'];
export const LANDMARK_INFO_EHRENDINGEN = [
  { name: 'Im Böndlern', gemeinde: 'Ehrendingen', anchor: 'boendlern' },
  { name: 'ARA Ehrendingen', gemeinde: 'Ehrendingen', building: 178797287 },
  { name: 'Wanderweg', gemeinde: 'Ehrendingen', anchor: 'wanderweg' },              // junction of Hofrain and Steinbuckweg (spec A3)
  { name: 'Kath. Kirche Ehrendingen', gemeinde: 'Ehrendingen', building: 114544595 },
  { name: 'Reformierte Kirche Ehrendingen', gemeinde: 'Ehrendingen', building: 114544599 },
  { name: 'Kapelle St. Anna', gemeinde: 'Ehrendingen', building: 102158022 },
  { name: 'Mehrzweckhalle Lägernbreite', gemeinde: 'Ehrendingen', building: 178797165 },
  { name: 'Gemeindehaus Unterdorf', gemeinde: 'Ehrendingen', anchor: 'gemeindehausUnterdorf' },
];

export function foldText(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ringMean(ring) {
  let x = 0, z = 0;
  for (const [px, pz] of ring) { x += px; z += pz; }
  return { x: x / ring.length, z: z / ring.length };
}

function sourcePos(item, anchors, buildingsById) {
  if (item.at) return { x: item.at[0], z: item.at[1] };   // #125: a fixed game point, independent of what the world carries
  if (item.anchor) {
    const a = anchors[item.anchor];
    return a ? { x: a.x, z: a.z } : null;
  }
  const b = buildingsById.get(Number(item.building));
  return b && b.ring && b.ring.length ? ringMean(b.ring) : null;
}

export function landmarkEntries(info, anchors, buildings, gemeinden = GEMEINDEN) {
  const byId = new Map((buildings || []).map(b => [Number(b.id), b]));
  const found = [];
  info.forEach((item, i) => {
    const p = sourcePos(item, anchors || {}, byId);
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, ...(item.jump ? { j: [...item.jump] } : {}), ...(item.look ? { look: [...item.look] } : {}), ...(item.ramp ? { ramp: true } : {}), i });
  });
  found.sort((a, b) => gemeinden.indexOf(a.g) - gemeinden.indexOf(b.g) || a.i - b.i);
  return found.map(({ i, ...entry }) => entry);
}

// #79: a road heading (car forward = (cos th, sin th)) turned, if needed, so the car faces (tx, tz)
export function faceToward(th, x, z, tx, tz) {
  return Math.cos(th) * (tx - x) + Math.sin(th) * (tz - z) < 0 ? th + Math.PI : th;
}

export function filterLandmarks(entries, query, gemeinde) {
  const q = foldText(query.trim());
  return entries.filter(e => (!gemeinde || e.g === gemeinde) && (!q || foldText(e.n).includes(q)));
}

export function gemeindenOf(entries, gemeinden = GEMEINDEN) {
  const present = new Set(entries.map(e => e.g));
  return gemeinden.filter(g => present.has(g));
}

// The Sprungschanze's run-up (#80): runUp metres before the low edge x0, centred across it, facing up the ramp
// (th 0 = +x, the direction groundH raises it).
export function rampApproach(ramp, runUp) {
  return { x: ramp.x0 - runUp, z: (ramp.z0 + ramp.z1) / 2, th: 0 };
}
