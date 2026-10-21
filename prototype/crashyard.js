// crashyard.js — #415: the Crash-Platz (EN "Crash yard"), a test yard on the Sisslerfeld where every knock-over prop stands in a
// row and a run-up lane leads to them. Defined here, once; pure (no DOM, no three.js). Game-side props, not OSM.
// The site is a flat meadow found by scanning the Hochrhein world (terrain range 0.15 m over 110 x 44 m, 57 m from the
// nearest street, no building, wood, water or car park within 12 m, 250 m from every checkpoint, the start and the finish).
export const KIND_ORDER = ['bin', 'robidog', 'bench', 'bike_rack', 'glass_container', 'clothes_container', 'hydrant', 'lamp'];

export const CRASH_YARD = {
  region: 'hochrhein',
  x0: 590, z0: 740,          // north-west corner of the free rectangle (game metres)
  length: 110, width: 44,    // along the run-up (+x) and across it
  runUp: 32,                 // metres of lane before the first row
  rowGap: 9, perRow: 5, spacing: 6.5,
  gemeinde: 'Eiken',
};

export const yardCentreZ = (y = CRASH_YARD) => y.z0 + y.width / 2;
// the car lands at the start of the lane, facing the rows (th 0 = +x)
export function yardStart(y = CRASH_YARD) { return { x: y.x0 + 6, z: yardCentreZ(y), th: 0 }; }
// the J dialog's point: the middle of the rows
export const yardEntryPoint = (y = CRASH_YARD) => [y.x0 + y.runUp + (KIND_ORDER.length * y.rowGap) / 2, yardCentreZ(y)];

// one row per kind across the lane; benches, racks and glass containers lie across it so the car meets the broad side
export function yardProps(y = CRASH_YARD) {
  const out = [], zc = yardCentreZ(y), mid = (y.perRow - 1) / 2;
  KIND_ORDER.forEach((kind, r) => {
    for (let i = 0; i < y.perRow; i++) out.push({ kind, x: y.x0 + y.runUp + r * y.rowGap, z: +(zc + (i - mid) * y.spacing).toFixed(1), rot: kind === 'bench' || kind === 'bike_rack' || kind === 'glass_container' ? +(Math.PI / 2).toFixed(2) : 0 });
  });
  return out;
}
// trees, fields and the like keep out of the yard (and a margin)
export const inYard = (x, z, pad = 0, y = CRASH_YARD) => x > y.x0 - pad && x < y.x0 + y.length + pad && z > y.z0 - pad && z < y.z0 + y.width + pad;
export const yardFor = (regionId) => (regionId === CRASH_YARD.region ? CRASH_YARD : null);
// the J dialog's entry (index.html adds it after the Gemeinde's last landmark, named after the game language)
export const yardEntry = (name, y = CRASH_YARD) => { const [x, z] = yardEntryPoint(y); return { n: name, g: y.gemeinde, x, z, yard: true }; };
