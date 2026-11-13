// #811: the Space Shuttle Enterprise (OV-101) in launch position on the whole of Launch Pad 39A, as it stood there from May
// to July 1979 for fit checks: the orbiter on the external tank between the two solid rocket boosters, on the mobile launcher
// platform, on the raised hardstand with the flame trench through it; beside it the fixed service structure (lattice tower,
// crane, lightning mast) with the crew access arm and the vent arm's hood over the tank tip, the rotating service structure
// swung back, and the water tower. Pure numbers, no three.js, no DOM: the parts, where they stand in a room and their
// colliders. shuttlemesh.js builds the meshes from these numbers; index.html places them. The tank in its familiar orange
// (the 1979 pathfinder tank was most likely white); Enterprise white with a black belly; the pad structures grey and white.
// Unit-tested with `node --test tests/shuttle.test.mjs`.
//
// The stack's own frame: y = 0 at the platform's deck top, +x along the boosters' line, +z towards the orbiter. The pad's
// frame (padLayout): the same x and z, y = 0 on the room floor -- the deck top is stackBase() over it. In a room both are
// the room's (f, v) turned by `turn`, so the portal sees the orbiter three-quarter on (stackFrame). The orbiter's own
// frame: u up its length (0 at the engine exits), w along its span (= stack x), n from the belly to the fin (= stack z).
export const SHUTTLE = {
  key: 'shuttle', h: 56.1,                                  // deck top to the tank's nose spike
  turn: Math.PI / 4,                                        // the stack turned 45° from the room's axis: wing and fin face the portal
  deck: { w: 49, d: 41, h: 7.6 },                           // the mobile launcher platform (160 x 135 x 25 ft)
  pad: {
    hard: { w: 119, d: 99, h: 14.6, slope: 14 },            // the hardstand's foot (x, z), its height and how far the sides lean in
    trench: { w: 17.7 },                                    // the flame trench along z right through it, open to drive through
    pedestal: { h: 6.7, s: 3, at: [[-14, -16], [-14, 16], [14, -16], [14, 16], [-22, 0], [22, 0]] },   // the platform's six mounts
    fss: { at: [-31.5, 6], w: 12.2, h: 75.3, level: 6.1, beam: 0.45, crane: { h: 5.5, len: 24, w: 2 }, mast: { h: 25, r0: 0.6, r1: 0.2 } },   // 40 ft square, 347 ft to the mast tip
    arm: { u: 29, w: 2.0, h: 2.6, room: 3.6 },              // the crew access arm at the orbiter's hatch (u up the orbiter), the white room at its end
    vent: { w: 1.6, z: 1, cap: { r: 2.4, h: 3.4 } },        // the vent arm and its hood ("beanie cap") over the tank tip
    rss: { at: [-30, -29], w: 31, d: 15, h: 57.6, y0: 10, leg: 1.2 },   // swung back: 189 ft over the pad, on legs
    water: { at: [85, -70], h: 88, r: 7.5, leg: 0.7, spread: 7 },       // the 290 ft water tower beside the pad
  },
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
  colours: { tank: 0xc0682e, white: 0xf2f2ee, belly: 0x26282c, dark: 0x3a3d42, nozzle: 0x6e6e70, deck: 0x55595e, concrete: 0xb9b5aa, trench: 0x34353a, steel: 0x7d838b, rss: 0xd8d8d2, arm: 0x9aa0a6, water: 0xdcdcd6 },
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

// the deck top over the room floor: hardstand, mounts, platform
export const stackBase = (cfg = SHUTTLE) => cfg.pad.hard.h + cfg.pad.pedestal.h + cfg.deck.h;

// the pad in its own frame (x, z as the stack's, y = 0 on the floor): the two hardstand halves either side of the trench
// (foot and top as x / z ranges), the mounts, the platform, the tower, the two arms (x from the tower's face to the
// vehicle), the swung-back service structure and the water tower
export function padLayout(cfg = SHUTTLE) {
  const P = cfg.pad, H = P.hard, t = P.trench.w / 2, base = stackBase(cfg), top = H.h, O = cfg.orbiter, E = cfg.et;
  const half = (s) => ({ foot: { x: s < 0 ? [-H.w / 2, -t] : [t, H.w / 2], z: [-H.d / 2, H.d / 2] },
    top: { x: s < 0 ? [-H.w / 2 + H.slope, -t] : [t, H.w / 2 - H.slope], z: [-H.d / 2 + H.slope, H.d / 2 - H.slope] }, h: H.h });
  const F = P.fss, face = F.at[0] + F.w / 2;
  const capY0 = base + E.y1 - E.spike.h - P.vent.cap.h + 0.6;
  return {
    hard: [half(-1), half(1)], trench: { x: [-t, t], z: [-H.d / 2, H.d / 2] },
    pedestals: P.pedestal.at.map(([x, z]) => ({ x, z, s: P.pedestal.s, y0: top, y1: top + P.pedestal.h })),
    deck: { w: cfg.deck.w, d: cfg.deck.d, y0: top + P.pedestal.h, y1: base },
    fss: { x: F.at[0], z: F.at[1], w: F.w, y0: top, y1: top + F.h, levels: Math.round(F.h / F.level), crane: top + F.h + F.crane.h, mastTop: top + F.h + F.crane.h + F.mast.h },
    arm: { x: [face, -O.body.w / 2], y: base + O.y0 + P.arm.u, z: O.off },
    vent: { x: [face, -P.vent.cap.r], y: capY0 + P.vent.cap.h / 2, z: P.vent.z, cap: { y0: capY0, y1: capY0 + P.vent.cap.h, r: P.vent.cap.r } },
    rss: { x: P.rss.at[0], z: P.rss.at[1], w: P.rss.w, d: P.rss.d, y0: top + P.rss.y0, y1: top + P.rss.h },
    water: { x: P.water.at[0], z: P.water.at[1], y1: P.water.h, r: P.water.r, spread: P.water.spread },
  };
}

// the stack's x (boosters) and z (orbiter) axes in the world: the room's (f, v) turned by `turn` about the vertical
export function stackFrame(f, v, turn = 0) {
  const c = Math.cos(turn), s = Math.sin(turn);
  return { x: [f[0] * c + v[0] * s, f[1] * c + v[1] * s], z: [v[0] * c - f[0] * s, v[1] * c - f[1] * s] };
}

// where the pad stands in a room ({ centre, frame: { f, v }, y }): on the room centre, turned by `turn`; the colliders, all
// `low` (the car stops, the helicopter / hovering walker pass over each top). The platform and everything on it is a
// `bridge` over the trench: a car on the floor drives through the trench under the rocket.
export function shuttlePlacement(room, cfg = SHUTTLE) {
  const [cx, cz] = room.centre, y = room.y, { x: X, z: Z } = stackFrame(room.frame.f, room.frame.v, cfg.turn);
  const loc = (a, b) => [cx + X[0] * a + Z[0] * b, cz + X[1] * a + Z[1] * b];
  const L = padLayout(cfg), deckTop = y + stackBase(cfg), E = orbiterExtent(cfg), O = cfg.orbiter;
  const box = (a, b, hw, hd, h, shuttle, over) => { const [x, z] = loc(a, b); return { x, z, hw, hd, c: X[0], s: X[1], h, low: true, shuttle, ...(over === undefined ? {} : { bridge: true, y0: over }) }; };
  const span = ([a0, a1]) => [(a0 + a1) / 2, (a1 - a0) / 2];
  const hard = L.hard.map(H => { const [a, hw] = span(H.foot.x), [b, hd] = span(H.foot.z); return box(a, b, hw, hd, y + H.h, 'hardstand'); });
  const mount = box(0, 0, cfg.deck.w / 2, cfg.deck.d / 2, deckTop, 'mount', y + L.deck.y0);
  const tank = box(0, 0, cfg.et.r + 0.4, cfg.et.r + 0.4, deckTop + cfg.h + 2, 'tank', deckTop);
  const srbs = [-1, 1].map(s => box(s * cfg.srb.off, 0, cfg.srb.r + 0.35, cfg.srb.r + 0.35, deckTop + cfg.srb.y1 + cfg.srb.nose + 2, 'srb', deckTop));
  const fuselage = box(0, (E.z0 + E.z1) / 2, O.body.w / 2 + 0.3, (E.z1 - E.z0) / 2, deckTop + E.y1 + 1, 'fuselage', deckTop);
  const wings = box(0, E.z0 + O.wingT / 2 + 0.1, O.span / 2, O.wingT / 2 + 0.1, deckTop + O.y0 + Math.max(...O.wing.map(p => p[0])) + 1, 'wings', deckTop);
  const fss = box(L.fss.x, L.fss.z, L.fss.w / 2, L.fss.w / 2, y + L.fss.crane, 'fss');
  const rss = box(L.rss.x, L.rss.z, L.rss.w / 2, L.rss.d / 2, y + L.rss.y1, 'rss');
  const water = box(L.water.x, L.water.z, L.water.spread + 0.5, L.water.spread + 0.5, y + L.water.y1, 'water');
  return { stack: { x: cx, z: cz, th: Math.atan2(X[1], X[0]) }, colliders: [...hard, mount, tank, ...srbs, fuselage, wings, fss, rss, water] };
}
