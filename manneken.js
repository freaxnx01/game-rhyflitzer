// #585: the Manneken Pis beside the Atomium -- the Brussels bronze boy, life size (0.61 m), standing as he does on the corner of the
// Rue de l'Etuve in his stone niche over a basin, behind a wrought-iron railing, with a thin jet of water into the basin. Pure: no
// three.js, no DOM -- where the corner stands in the room, its one collider and the jet's arc; mannekenmesh.js builds the meshes from
// these numbers and loads the figure (manneken_pis.glb) into the niche. Unit-tested with `node --test tests/manneken.test.mjs`.
//
// The corner's own frame: +x is forward (out of the niche, towards the portal), y up from the room floor, z across; the origin is the
// corner's foot on the floor, on the basin's and the pedestal's axis.
export const MANNEKEN = {
  key: 'manneken',
  at: [-60, -34],                        // room frame [a, b] from the Atomium's axis, as FRIES.at (see rooms.js roomLayout)
  url: './assets/models/manneken_pis.glb',
  figure: { h: 0.61 },                   // the bronze's real height; the file is prepared to it (tools/prepare-manneken.mjs)
  // two cream plaster house walls meeting at a right angle, their corner chamfered towards the viewer to carry the niche; `len` is the
  // facade each wall shows beside the chamfer -- from the corner the two would meet at, each is about 1.7 m longer
  walls: { h: 6, len: 2.3, t: 0.6 },
  chamfer: { hw: 1.2, x: 0.25 },         // the chamfered front: half its width, and how far its face stands ahead of the basin's axis
  band: { h: 0.5 },                      // the bluestone plinth band round the walls' feet
  niche: { w: 1.6, h: 3.4, depth: 0.6 }, // the arched bluestone niche in the chamfered corner; h = the arch's top over the floor
  basin: { r: 0.7, wall: 0.08, rim: 0.7, water: 0.6 },   // the half-round stone basin: 1.4 m across, its rim 0.7 m up, the water just under it
  pedestal: { r: 0.175, top: 1.9 },      // the column the boy stands on
  railing: { r: 1.9, h: 1.2, step: 0.12 },   // the wrought-iron half circle in front, a bar every 0.12 m, spear tips on the top rail
  jet: { from: [0.0797, 0.2254, 0.0394], r: 0.012, reach: 0.5 },   // where the water leaves him (printed by the prep script) and how far ahead it lands
  box: { hw: 2.3, hd: 3.3, h: 6.3 },     // the one collider: the wall backs to the railing's front, the railing's width, solid over the cornice
};

const JET_RISE = 0.12;   // how far the jet still climbs after it leaves him, before it falls into the basin

// where the corner stands in a room: at cfg.at in the room's frame, the niche facing the portal, one box collider over the walls, the
// basin and the railing; `low` so a hovering walker above it is not pushed off (rooms.js rimColliders)
export function mannekenPlacement(room, cfg = MANNEKEN) {
  const [cx, cz] = room.centre, { f, v } = room.frame, [a, b] = cfg.at;
  const x = cx + f[0] * a + v[0] * b, z = cz + f[1] * a + v[1] * b, th = Math.atan2(room.portal.c[1] - z, room.portal.c[0] - x);
  return { x, z, th, colliders: [{ x, z, hw: cfg.box.hw, hd: cfg.box.hd, c: Math.cos(th), s: Math.sin(th), h: room.y + cfg.box.h, low: true }] };
}

// the water's path in the corner's frame: a parabola from the boy's jet start, still rising by JET_RISE, down onto the basin's water
// surface cfg.jet.reach ahead of him. n + 1 points, straight across (z stays his), so the tube along it only ever flows forward.
export function jetArc(cfg = MANNEKEN, n = 16) {
  const [fx, fy, z] = cfg.jet.from, y0 = cfg.pedestal.top + fy, drop = y0 + JET_RISE - cfg.basin.water;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return { x: fx + cfg.jet.reach * t, y: y0 + JET_RISE * t - drop * t * t, z };
  });
}
