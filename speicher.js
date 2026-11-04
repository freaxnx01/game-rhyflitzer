// speicher.js -- #666: a part of the Hamburg Speicherstadt as numbers (pure, no three.js, no DOM): the
// warehouses, the Fleet (canal) and the bridges as boxes and gable prisms, where they stand in a room and
// their colliders. speichermesh.js builds the meshes from these numbers; index.html places them.
// The Speicherstadt (built 1883-1927 on oak piles in the Elbe, UNESCO World Heritage since 2015) is the
// largest warehouse complex in the world: five to seven storeys of red brick with gables and hoist bays
// right at the water's edge. These six blocks are a representative stretch, not one specific building (A2).
// Unit-tested with `node --test tests/speicher.test.mjs`.
//
// Frame: x along the room's forward axis (a), z across (b), y = 0 on the floor.
export const SPEICHER = {
  key: 'speicher', h: 30,                                        // floor to the roof ridge
  fleet: { len: 120, hw: 6, lift: 0.12, kerb: { h: 0.6, hd: 0.5 } },   // canal a -60..60, b -6..6; kerb like rooms.js RIM
  quay: { b: 11, hw: 3, endA: 66 },                              // gravel lanes at b = +-11, crossing at a = +-66
  block: { at: [-40, 0, 40], len: 30, depth: 20, front: 16, eaves: 24, ridge: 30, bands: 5, hoist: { w: 4, d: 2, y0: 12, y1: 27 } },
  bridge: { at: [-20, 20], hw: 5, span: 8, lift: 0.3, rail: { h: 1.0, hd: 0.25 } },   // deck a = at +- 5, b -8..8
  loop: 95,                                                      // the room's gravel loop, for the connector
  colours: { brick: 0x8e3d2e, roof: 0x3f4a4c, window: 0x2c2f33, trim: 0xd8cbb0, deck: 0x6b6b6b, rail: 0x7a3a2c, kerb: 0xb8b2a6, water: 0x6f9aa8 },
};

// #666: the parts of one shape -- kind 'box' is a box w (along x) x d (along z) from y0 to y1; 'prism' is a
// triangular gable prism with its ridge along x, base w x d at y0, ridge line at y1.
const part = (kind, x, z, w, d, y0, y1, colour) => ({ kind, x, z, w, d, y0, y1, colour });

// #666: the six warehouses as parts: per block a brick body (0 -> eaves), a dark roof prism (eaves -> ridge),
// `bands` window bands on the canal face and one hoist bay sticking out of it (12 m up to 27 m) -- eight
// parts per block, six blocks (three per bank at block.at, fronts `front` m from the centre line).
export function warehouseParts(cfg = SPEICHER) {
  const B = cfg.block, C = cfg.colours, parts = [];
  for (const side of [-1, 1]) for (const a of B.at) {
    const z = side * (B.front + B.depth / 2);
    parts.push(part('box', a, z, B.len, B.depth, 0, B.eaves, C.brick));
    parts.push(part('prism', a, z, B.len, B.depth, B.eaves, B.ridge, C.roof));
    for (let i = 0; i < B.bands; i++)   // the window bands on the canal face, one per storey
      parts.push(part('box', a, side * (B.front - 0.05), B.len - 4, 0.1, 1.2 + 4.8 * i, 3.2 + 4.8 * i, C.window));
    parts.push(part('box', a, side * (B.front - B.hoist.d / 2), B.hoist.w, B.hoist.d, B.hoist.y0, B.hoist.y1, C.trim));
  }
  return parts;
}
