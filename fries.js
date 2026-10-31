// #451: the giant fries figure beside the Atomium -- the Brussels street mascot (a paper cone of fries with a face, thin legs and big
// boots) as a procedural three.js model about 20 m tall. Pure: no three.js, no DOM -- where it stands in the room, its one collider and
// the fry bundle's layout; friesmesh.js builds the meshes from these numbers. Unit-tested with `node --test tests/fries.test.mjs`.
//
// The figure's own frame: +x is forward (its face), y up from the plinth's top, z across. Every height below is metres over the plinth.
export const FRIES = {
  key: 'fries', h: 20,                  // plinth top to the tallest fry's tip
  at: [-55, -52],                       // room frame [a, b] from the Atomium's axis: a towards the far edge, b across (see rooms.js roomLayout)
  plinth: { w: 8, d: 6, h: 0.6 },       // dark metal, w along the figure's forward axis
  shoe: { len: 4.0, w: 1.8, h: 1.4, sole: 0.35, gap: 1.15, splay: 18 * Math.PI / 180, fwd: 0.9 },   // gap: shoe centre off the axis; fwd: the toes point ahead
  sock: { r: 0.5, h: 1.2, cuff: 0.3 },
  leg: { r: 0.3, top: 7.6 },            // the legs end inside the cone
  cone: { tip: 4.6, top: 14.5, r: 4.4, lip: 0.35 },   // a little taller than wide, as the real paper cone
  // chunky square sticks (width about a fifth of the length), packed over the whole mouth and `spread` m beyond it, the outer ones leaning
  // out; sink: the bases stand this deep inside the cone's top
  fries: { n: 40, w: 1.4, lenMin: 3.5, lenMax: 7.0, tilt: 25 * Math.PI / 180, sink: 1.5, spread: 0.4 },
  // the face is painted big on the upper cone: brows just under the rim, the mouth some 40 % of the cone down; the held fry crosses at chin height
  face: { browY: 13.3, eyeY: 12.2, noseY: 11.0, mouthY: 9.7, eyeZ: 1.7, fryY: 8.0 },
};

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// the cone's radius at height y (0 at the tip, r at the top)
export const coneRadiusAt = (y, cone = FRIES.cone) => cone.r * Math.max(0, Math.min(1, (y - cone.tip) / (cone.top - cone.tip)));

// the fries: n chunky sticks standing in the cone's top on a sunflower spiral (evenly packed, round from every side), each leaning outward
// the further off the axis it stands, with a jitter of its own, lengths and shades varied; deterministic. Lengths are stretched so the
// tallest tip ends exactly at h.
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export function fryBundle(cfg = FRIES) {
  const r = rng(451), { n, lenMin, lenMax, tilt, spread } = cfg.fries, outer = cfg.cone.r + spread, out = [];
  for (let i = 0; i < n; i++) {
    const rad = Math.sqrt((i + 0.5) / n) * outer, az = i * GOLDEN + (r() - 0.5) * 0.3;
    const lean = tilt * (rad / outer) * (0.6 + 0.4 * r()), len = lenMin + (lenMax - lenMin) * r();
    out.push({ x: Math.cos(az) * rad, z: Math.sin(az) * rad, len, tilt: lean, az: az + (r() - 0.5) * 0.6, shade: 0.92 + r() * 0.14 });
  }
  const top = bundleTop(out, cfg), base = cfg.cone.top - cfg.fries.sink, k = (cfg.h - base) / (top - base);
  for (const f of out) f.len = Math.min(lenMax, Math.max(lenMin, f.len * k));
  return out;
}
export const bundleTop = (bundle, cfg = FRIES) => Math.max(...bundle.map(f => cfg.cone.top - cfg.fries.sink + f.len * Math.cos(f.tilt)));

// where the figure stands in a room: at cfg.at in the room's frame, facing the portal, one plinth-sized collider solid up to the fry tips
// (the helicopter's floor lifts over the whole figure); `low` so a hovering walker above it is not pushed off (rooms.js rimColliders)
export function friesPlacement(room, cfg = FRIES) {
  const [cx, cz] = room.centre, { f, v } = room.frame, [a, b] = cfg.at;
  const x = cx + f[0] * a + v[0] * b, z = cz + f[1] * a + v[1] * b, th = Math.atan2(room.portal.c[1] - z, room.portal.c[0] - x);
  const c = Math.cos(th), s = Math.sin(th);
  return { x, z, th, colliders: [{ x, z, hw: cfg.plinth.w / 2, hd: cfg.plinth.d / 2, c, s, h: room.y + cfg.plinth.h + cfg.h, low: true, fries: true }] };
}
