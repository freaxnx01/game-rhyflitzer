// #491: the U.S.S. Enterprise NCC-1701-D in ring-2 room 0 -- pure numbers, no three.js, no DOM: the descriptor loadModel reads,
// where the ship hangs in its room, its hover bob, the lettering decals and the room's holodeck-and-stars look.
// index.html builds the meshes. Unit-tested with `node --test tests/enterprise.test.mjs`.
//
// The model (assets/models/enterprise_d.glb, tools/prepare-enterprise.mjs) is in metres: bow on +x, +y up, +z starboard,
// y = 0 at the lowest hull point (the engineering hull's underside), x = z = 0 the centre of its footprint. Measured 2026-10-29:
// 642.5 x 476.7 x 143.1 m, the saucer underside 81 .. 102 m over the lowest point, its top 123 .. 135 m forward of the bridge.
export const ENTERPRISE = {
  key: 'enterprise', h: 143.1, length: 642.5, beam: 476.7, scale: 1, anchor: [0, 0, 0],
  hover: 25,                                   // the lowest hull point over the floor: the bus and the walker pass, the hull still fills the view
  yaw: Math.PI / 6,                            // bow towards the portal, turned 30 degrees to the right: the three-quarter view on approach
  bob: { amp: 1.5, period: 14 },               // a slow hover, metres and seconds
  glow: { saucer: 1.6, drive: 1.6, aux: 1.8, nacelles: 2.6 },   // emissiveIntensity per section (the materials' extras.glow): windows, deflector, warp grilles + bussards
  // canvas text draped on the saucer (ship frame: x along the ship, the text runs across it, w metres wide, h metres tall)
  lettering: [
    { side: 'top', text: 'U.S.S. ENTERPRISE', x: 235, w: 180, h: 14 }, { side: 'top', text: 'NCC-1701-D', x: 205, w: 150, h: 20 },
    { side: 'bottom', text: 'U.S.S. ENTERPRISE', x: 235, w: 180, h: 14 }, { side: 'bottom', text: 'NCC-1701-D', x: 205, w: 150, h: 20 },
  ],
  url: './assets/models/enterprise_d.glb', loadWithin: 400,
};

// the ship's footprint centre on the room centre, `hover` m up; th = the bow's heading: back out towards the portal, turned `yaw` towards +v
export function enterprisePlacement(room, cfg = ENTERPRISE) {
  const [cx, cz] = room.centre, { f, v } = room.frame, c = Math.cos(cfg.yaw), s = Math.sin(cfg.yaw);
  const bow = [-f[0] * c + v[0] * s, -f[1] * c + v[1] * s];
  return { x: cx, z: cz, y: room.y + cfg.hover, th: Math.atan2(bow[1], bow[0]) };
}
export const enterpriseHover = (t, cfg = ENTERPRISE) => cfg.bob.amp * Math.sin(2 * Math.PI * t / cfg.bob.period);
// a PlaneGeometry (in xy, facing +z, text up = +y) turned so the letters' up points to the bow (+x) and the face away from the hull
export const letteringFrame = (side) => (side === 'top' ? { rx: -Math.PI / 2, ry: -Math.PI / 2 } : { rx: Math.PI / 2, ry: Math.PI / 2 });

// the room's look (blendLook's keys, as ROOM_LOOK): near-black sky behind the star dome, fog so thin it takes 0.6 % at 1000 m,
// the sun as a strong key light from the upper front-left of the car, a cool low hemisphere fill
export const SPACE_LOOK = { fog: '#04050a', density: 0.00008, skyTop: '#04050a', skyHor: '#04050a', hemiSky: '#8fa3c8', hemiGround: '#141a26', hemi: 0.45, sun: 2.2 };
// the holodeck floor: one 256 px tile per 10 m cell, a light-blue line on two edges, a dim half-line through the middle; a brighter rim along the walls
export const HOLODECK = { cell: 10, tile: 256, line: '#5fd0ff', sub: '#1f4a66', ground: '#05070d', rim: '#8fe0ff', rimW: 1 };

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// the dome's texture, in texture coordinates (u round the horizon, v = 0 at the zenith, 0.5 the horizon, 1 the nadir): about 2200 stars above
// the floor, a few big ones, three nebula clouds and a faint milky band. Deterministic per seed.
export function starField(seed = 1701) {
  const r = rng(seed), stars = [];
  for (let i = 0; i < 2200; i++) { const big = r() < 0.015; stars.push({ u: r(), v: r() * 0.68, r: big ? 2.5 + r() * 0.5 : 0.5 + r() * 1.3, b: 0.35 + r() * 0.65, tint: r() < 0.7 ? 'white' : r() < 0.5 ? 'blue' : 'amber' }); }
  const clouds = [{ u: 0.22, v: 0.28, r: 0.17, colour: '#6a3fb0', alpha: 0.32 }, { u: 0.31, v: 0.2, r: 0.12, colour: '#2a8f9c', alpha: 0.28 }, { u: 0.7, v: 0.33, r: 0.2, colour: '#b03f8a', alpha: 0.22 }];
  return { stars, clouds, band: { v: 0.3, alpha: 0.08, width: 0.12 } };
}