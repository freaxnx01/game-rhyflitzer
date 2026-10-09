// The J dialog's landmarks (#41): names and Gemeinden kept by hand here, positions from the loaded world
// (an anchors.landmarks key or a world building id), or a fixed game point (at). Pure: no DOM, no three.js.
export const GEMEINDEN = ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln'];   // west → east

// Gemeinden verified against OpenStreetMap on 2026-10-02/03 (#41, #46, #81)
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
  { name: 'Kirche Stein', gemeinde: 'Stein', anchor: 'steinChurch' },
  { name: 'Bahnhof Stein-Säckingen', gemeinde: 'Stein', anchor: 'stationStein' },
  { name: 'Plattform Sisslerfeld', gemeinde: 'Münchwilen', anchor: 'plattform' },
  { name: 'DSM-Kamin', gemeinde: 'Eiken', anchor: 'dsmChimney' },
  { name: 'Bahnhof Sisseln', gemeinde: 'Eiken', anchor: 'stationSisseln' },
  { name: 'Bahnhof Eiken', gemeinde: 'Eiken', building: 199241726 },
  { name: 'LANDI-Turm', gemeinde: 'Eiken', anchor: 'landiTurm' },                    // Sisslerstrasse 19.1, w197688923 (#81)
  { name: 'Südspange Sisslerfeld', gemeinde: 'Eiken', at: [1528, 409] },            // #125: the K295 junction, the road's start; J snaps to the nearest road (the K295 until #42 builds the Südspange)
  { name: 'DSM-Wasserturm', gemeinde: 'Sisseln', anchor: 'dsmWaterTower' },
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Hallenbad Sissila', gemeinde: 'Sisseln', anchor: 'hallenbad' },
  { name: 'Bodenackerstrasse 6c', gemeinde: 'Sisseln', building: 171822634 },
  { name: 'Bodenackerstrasse 10B', gemeinde: 'Sisseln', building: 171822943 },
  { name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp', ramp: true },     // J puts the car on its run-up, not on a road (#80)
  { name: 'Gemeindehaus Sisseln', gemeinde: 'Sisseln', building: 171822808 },
  { name: 'Schulhaus Sisseln', gemeinde: 'Sisseln', building: 171822721 },
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

export function landmarkEntries(info, anchors, buildings) {
  const byId = new Map((buildings || []).map(b => [Number(b.id), b]));
  const found = [];
  info.forEach((item, i) => {
    const p = sourcePos(item, anchors || {}, byId);
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, ...(item.jump ? { j: [...item.jump] } : {}), ...(item.ramp ? { ramp: true } : {}), i });
  });
  found.sort((a, b) => GEMEINDEN.indexOf(a.g) - GEMEINDEN.indexOf(b.g) || a.i - b.i);
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

export function gemeindenOf(entries) {
  const present = new Set(entries.map(e => e.g));
  return GEMEINDEN.filter(g => present.has(g));
}

// The Sprungschanze's run-up (#80): runUp metres before the low edge x0, centred across it, facing up the ramp
// (th 0 = +x, the direction groundH raises it).
export function rampApproach(ramp, runUp) {
  return { x: ramp.x0 - runUp, z: (ramp.z0 + ramp.z1) / 2, th: 0 };
}
