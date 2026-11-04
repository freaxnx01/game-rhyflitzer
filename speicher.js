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

// where the Fleet, the warehouses and the bridges stand in a room ({ centre, frame: { f, v }, portal: { c }, y } as
// artemisPlacement takes it): the water slab on the centre, the quay ring with its connector as gravel polylines
// (world points), and the colliders, all `low` (the car stops on the floor, the helicopter / hovering walker pass
// over each top, index.html collide()) -- 6 warehouses solid to their ridge + 2, 8 kerbs 0.6 m high (three segments
// per bank with a gap at each bridge, plus an end cap either end) and 4 bridge parapets. The decks have none: the
// parapets keep the car on them, the floor stays flat. speicher.js cannot import rooms.js (it would be circular),
// so the kerb carries its own copy of the RIM numbers.
export function speicherPlacement(room, cfg = SPEICHER) {
  const [cx, cz] = room.centre, { f, v } = room.frame, y = room.y;
  const th = Math.atan2(f[1], f[0]);
  const loc = (a, b) => [cx + f[0] * a + v[0] * b, cz + f[1] * a + v[1] * b];
  const B = cfg.block, F = cfg.fleet, Q = cfg.quay, BR = cfg.bridge;
  const box = (a, b, hw, hd, h, speicher) => { const [x, z] = loc(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h, low: true, speicher }; };
  const colliders = [];
  for (const side of [-1, 1]) for (const a of B.at)   // the six warehouses, solid to ridge + 2 m
    colliders.push(box(a, side * (B.front + B.depth / 2), B.len / 2, B.depth / 2, y + B.ridge + 2, 'warehouse'));
  for (const side of [-1, 1]) {   // each bank's kerb in three segments, an ~11 m gap at each bridge deck
    const gap = BR.hw + 0.3, spans = [[-F.len / 2, BR.at[0] - gap], [BR.at[0] + gap, BR.at[1] - gap], [BR.at[1] + gap, F.len / 2]];
    for (const [a0, a1] of spans) colliders.push(box((a0 + a1) / 2, side * F.hw, (a1 - a0) / 2, F.kerb.hd, y + F.kerb.h, 'kerb'));
  }
  for (const s of [-1, 1])   // the two end caps closing the canal either end
    colliders.push(box(s * (F.len / 2 + 0.5), 0, 0.5, F.hw + F.kerb.hd, y + F.kerb.h, 'kerb'));
  for (const a of BR.at) for (const s of [-1, 1])   // two parapets per bridge, thin along f, spanning the deck
    colliders.push(box(a + s * BR.hw, 0, BR.rail.hd, BR.span, y + BR.rail.h, 'rail'));
  const water = { x: cx, z: cz, th, len: F.len, wid: 2 * F.hw, y: y + F.lift };
  const bridges = BR.at.map(a => { const [x, z] = loc(a, 0); return { x, z, th, wid: 2 * BR.hw, len: 2 * BR.span, y: y + BR.lift }; });
  const quay = [[-Q.endA, -Q.b], [Q.endA, -Q.b], [Q.endA, Q.b], [-Q.endA, Q.b], [-Q.endA, -Q.b]].map(([a, b]) => loc(a, b));   // closed ring along both quays and across both ends
  const HAIR = 1e-6;   // a micrometre off the axis: mapping a world point back into the room frame leaves ~1e-13 noise in b, and the hair keeps the connector's rounded local b at +0, not -0
  const connector = [loc(-cfg.loop, HAIR), loc(-Q.endA, HAIR)];   // the room's 95 m loop -> the quay ring
  return { water, bridges, quay, connector, colliders };
}
