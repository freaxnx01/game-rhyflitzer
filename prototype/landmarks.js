// The J dialog's landmarks (#41): names and Gemeinden kept by hand here, positions from the loaded world
// (an anchors.landmarks key or a world building id). Pure: no DOM, no three.js.
export const GEMEINDEN = ['Bad Säckingen', 'Stein', 'Münchwilen', 'Eiken', 'Sisseln'];   // west → east

// Gemeinden verified against OpenStreetMap on 2026-10-02
export const LANDMARK_INFO = [
  { name: 'Fridolinsmünster', gemeinde: 'Bad Säckingen', anchor: 'muenster' },
  { name: 'Holzbrücke', gemeinde: 'Bad Säckingen', anchor: 'holzbruecke' },
  { name: 'Fridolinsbrücke', gemeinde: 'Bad Säckingen', anchor: 'fridolinsbruecke' },
  { name: 'Kirche Stein', gemeinde: 'Stein', anchor: 'steinChurch' },
  { name: 'Bahnhof Stein-Säckingen', gemeinde: 'Stein', anchor: 'stationStein' },
  { name: 'Plattform Sisslerfeld', gemeinde: 'Münchwilen', anchor: 'plattform' },
  { name: 'DSM-Kamin', gemeinde: 'Eiken', anchor: 'dsmChimney' },
  { name: 'Bahnhof Sisseln', gemeinde: 'Eiken', anchor: 'stationSisseln' },
  { name: 'DSM-Wasserturm', gemeinde: 'Sisseln', anchor: 'dsmWaterTower' },
  { name: 'Smile-Kreisel', gemeinde: 'Sisseln', anchor: 'smileKreisel' },
  { name: 'Hallenbad Sissila', gemeinde: 'Sisseln', anchor: 'hallenbad' },
  { name: 'Bodenackerstrasse 6c', gemeinde: 'Sisseln', building: 171822634 },
  { name: 'Bodenackerstrasse 10B', gemeinde: 'Sisseln', building: 171822943 },
  { name: 'Sprungschanze', gemeinde: 'Sisseln', anchor: 'jumpRamp' },
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
    if (p) found.push({ n: item.name, g: item.gemeinde, x: p.x, z: p.z, i });
  });
  found.sort((a, b) => GEMEINDEN.indexOf(a.g) - GEMEINDEN.indexOf(b.g) || a.i - b.i);
  return found.map(({ i, ...entry }) => entry);
}

export function filterLandmarks(entries, query, gemeinde) {
  const q = foldText(query.trim());
  return entries.filter(e => (!gemeinde || e.g === gemeinde) && (!q || foldText(e.n).includes(q)));
}

export function gemeindenOf(entries) {
  const present = new Set(entries.map(e => e.g));
  return GEMEINDEN.filter(g => present.has(g));
}
