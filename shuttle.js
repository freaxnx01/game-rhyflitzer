// #811: the Space Shuttle Enterprise (OV-101) in launch position, as it stood on Launch Pad 39A from May to July 1979 for
// fit checks: the orbiter on the external tank between the two solid rocket boosters, on its launch platform. Pure numbers,
// no three.js, no DOM: the tank and boosters as cylinders and cones, the orbiter's outlines, where the stack stands in a
// room and its colliders. shuttlemesh.js builds the meshes from these numbers; index.html places them.
// The pathfinder stack's tank was painted white (only the first flights flew one); Enterprise itself white with a black belly.
// Unit-tested with `node --test tests/shuttle.test.mjs`.
//
// The stack's own frame: y = 0 at the platform's deck top, +x along the room's forward axis (f, the boosters' line),
// +z across (v, the orbiter's side). The orbiter's own frame: u up its length (0 at the engine exits), w along its span
// (= stack x), n from the belly to the fin (= stack z).
export const SHUTTLE = {
  key: 'shuttle', h: 56.1,                                  // deck top to the tank's nose spike
  pad: { w: 64, lift: 0.15 },                               // concrete slab on the floor, no collider
  deck: { w: 49, d: 41, h: 7.6 },                           // the mobile launcher platform, one collider
  et: { r: 4.2, y0: 9.2, y1: 56.1, dome: 1.4, ogive: 11.5, spike: { r: 0.25, h: 1.2 } },   // 8.4 m across, 46.9 m long
  srb: { r: 1.855, off: 6.5, y0: 0, y1: 41.0, nose: 4.46, skirt: { r: 2.6, h: 3.0 }, band: { y: 30.5, h: 0.6 } },   // 3.71 m across, 45.46 m
  orbiter: {
    length: 37.24, span: 23.79, y0: 7.6, off: 9.0,          // engine exits 7.6 m over the deck; fuselage axis 9 m off the tank axis
    body: { w: 5.2, d: 5.6, u0: 3.4, u1: 31.0 },            // the fuselage (an elliptic tube), nose cone from u1 to the full length
    wing: [[3.6, 2.6], [3.6, 11.895], [6.3, 11.895], [18.8, 4.6], [26.5, 2.6]], wingT: 1.0,   // (u, w) one side, double delta; flush with the belly
    tail: [[4.0, 0], [13.2, 0], [6.4, 8.0], [3.2, 8.0]], tailT: 0.6,   // (u, height over the fuselage top)
    oms: { r: 1.15, u0: 3.4, u1: 12.5, w: 1.95, n: 2.1 },     // the two pods beside the fin
    engines: { exit: 1.15, throat: 0.55, len: 3.4, at: [[0, 1.3], [-1.35, -0.8], [1.35, -0.8]] },   // (w, n) of the three bells
    windows: { u0: 31.6, u1: 33.4, w: 3.2, n: 2.1 },
  },
  colours: { tank: 0xece8dc, white: 0xf2f2ee, belly: 0x26282c, dark: 0x3a3d42, nozzle: 0x6e6e70, deck: 0x55595e, pad: 0xb9b5aa },
};

const part = (kind, r0, r1, y0, y1, colour, x = 0, z = 0) => ({ kind, r0, r1, y0, y1, x, z, colour });

// the tank and the boosters as cylinders and cones over the deck top (y = 0): the tank's aft dome, barrel, ogive and nose
// spike on the axis; a booster each side along x with its skirt, a dark attach band and its nose cone
export function stackParts(cfg = SHUTTLE) {
  const C = cfg.colours, E = cfg.et, B = cfg.srb, p = [];
  const ogive0 = E.y1 - E.spike.h - E.ogive;
  p.push(part('cone', E.r * 0.6, E.r, E.y0, E.y0 + E.dome, C.tank));
  p.push(part('cyl', E.r, E.r, E.y0 + E.dome, ogive0, C.tank));
  p.push(part('cone', E.r, E.spike.r, ogive0, E.y1 - E.spike.h, C.tank));
  p.push(part('cone', E.spike.r, 0, E.y1 - E.spike.h, E.y1, C.dark));
  for (const s of [-1, 1]) {
    p.push(part('cone', B.skirt.r, B.r, B.y0, B.y0 + B.skirt.h, C.white, s * B.off));
    p.push(part('cyl', B.r, B.r, B.y0 + B.skirt.h, B.y1, C.white, s * B.off));
    p.push(part('cyl', B.r + 0.03, B.r + 0.03, B.band.y, B.band.y + B.band.h, C.dark, s * B.off));
    p.push(part('cone', B.r, 0.15, B.y1, B.y1 + B.nose, C.white, s * B.off));
  }
  return p;
}
export const stackTop = (parts) => Math.max(...parts.map(p => p.y1));

// the wing planform, both sides, as one closed (u, w) outline: right side out from the root, back across the fuselage
export function wingOutline(cfg = SHUTTLE) {
  const right = cfg.orbiter.wing, left = right.map(([u, w]) => [u, -w]).reverse();
  return [...right, ...left];
}
// the fin's side outline as (u, height over the fuselage top)
export const tailOutline = (cfg = SHUTTLE) => cfg.orbiter.tail.map(p => [...p]);

// the orbiter's box in the stack frame: x across the span, y from the engine exits to the nose, z from the belly to the fin top
export function orbiterExtent(cfg = SHUTTLE) {
  const O = cfg.orbiter, fin = Math.max(...O.tail.map(p => p[1]));
  return { x1: O.span / 2, y0: O.y0, y1: O.y0 + O.length, z0: O.off - O.body.d / 2, z1: O.off + O.body.d / 2 + fin };
}

// where the stack stands in a room ({ centre, frame: { f, v }, y }): on the room centre, the boosters along f, the orbiter
// on the +v side; the colliders, all `low` (the car stops, the helicopter / hovering walker pass over each top)
export function shuttlePlacement(room, cfg = SHUTTLE) {
  const [cx, cz] = room.centre, { f } = room.frame, v = room.frame.v, y = room.y;
  const loc = (a, b) => [cx + f[0] * a + v[0] * b, cz + f[1] * a + v[1] * b];
  const deckTop = y + cfg.pad.lift + cfg.deck.h, E = orbiterExtent(cfg), O = cfg.orbiter;
  const box = (a, b, hw, hd, h, shuttle) => { const [x, z] = loc(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h, low: true, shuttle }; };
  const mount = box(0, 0, cfg.deck.w / 2, cfg.deck.d / 2, deckTop, 'mount');
  const tank = box(0, 0, cfg.et.r + 0.4, cfg.et.r + 0.4, deckTop + cfg.h + 2, 'tank');
  const srbs = [-1, 1].map(s => box(s * cfg.srb.off, 0, cfg.srb.r + 0.35, cfg.srb.r + 0.35, deckTop + cfg.srb.y1 + cfg.srb.nose + 2, 'srb'));
  const fuselage = box(0, (E.z0 + E.z1) / 2, O.body.w / 2 + 0.3, (E.z1 - E.z0) / 2, deckTop + E.y1 + 1, 'fuselage');
  const wings = box(0, E.z0 + O.wingT / 2 + 0.1, O.span / 2, O.wingT / 2 + 0.1, deckTop + O.y0 + Math.max(...O.wing.map(p => p[0])) + 1, 'wings');
  return { stack: { x: cx, z: cz, th: Math.atan2(f[1], f[0]) }, colliders: [mount, tank, ...srbs, fuselage, wings] };
}
