// #488: the Artemis II stack (SLS Block 1 with the Orion spacecraft) and the Orion crew capsule on its own --
// pure numbers, no three.js, no DOM: the parts as cylinders and cones over the deck top, where they stand in a
// room and their colliders. artemismesh.js builds the meshes from these numbers; index.html places them.
// Artemis II took humans farther from Earth than anyone before: 406,000+ km on 2026-04-06.
// Unit-tested with `node --test prototype/tests/artemis.test.mjs`.
//
// The rocket's own frame: y = 0 at the launch mount's deck top, +x along the room's forward axis (f), +z across (v).
// The capsule's frame: y = 0 on the lawn, +x = the hatch side.
export const ARTEMIS = {
  key: 'artemis', h: 98.1,                                  // deck top to the tip of the launch abort tower
  pad: { w: 40, lift: 0.15 },                               // concrete slab on the lawn, no collider (bumped over like gravel)
  deck: { w: 24, h: 2 },                                    // the launch mount the rocket stands on, one collider
  core: { r: 4.2, y0: 2.0, y1: 66.6, nozzle: { n: 4, r: 1.2, h: 1.7, off: 2.2 } },   // 8.4 m across, 64.6 m long; four nozzles hang under it
  srb: { r: 1.855, off: 6.5, y0: 0, y1: 50.2, nose: 3.7, skirt: { r: 2.6, h: 2.2 } },   // 3.71 m across, 53.9 m incl. nose, axes 6.5 m off the core along v
  lvsa: { y0: 66.6, y1: 75.5, r1: 2.5 },                    // cone 8.4 -> 5 m
  icps: { y0: 75.5, y1: 84.0, r: 2.5 },
  esm: { y0: 84.0, y1: 89.0, r: 2.6, band: 0.3 },           // service module + fairings; dark band at the top
  cm: { y0: 89.0, y1: 94.5, r1: 0.9 },                      // crew module under the abort system's ogive
  las: { y0: 94.5, y1: 98.1, r: 0.45, nose: 0.8 },          // abort tower; the nose cone is the last `nose` m of it
  capsule: { at: [-50, 45], r: 2.515, rTop: 0.95, h: 3.3, shield: 0.5, tunnel: { r: 0.5, h: 0.4 }, stand: { h: 1.0, r: 2.0, post: 0.12 }, ring: { r: 11, hw: 3 }, hw: 3.0, clear: 0.6 },
  colours: { core: 0xd27a35, white: 0xf2f2ee, dark: 0x3a3d42, nozzle: 0x6e6e70, shell: 0x9a9ea3, shield: 0x8a6a4a, stand: 0x2b2e34, deck: 0x55595e, pad: 0xb9b5aa },
};

const part = (kind, r0, r1, y0, y1, colour, x = 0, z = 0) => ({ kind, r0, r1, y0, y1, x, z, colour });

// the rocket as cylinders and cones over the deck top (y = 0): the orange core with four dark nozzles under it,
// a white booster tube, nose cone and dark aft skirt either side across the room (z = ±srb.off), then the upper
// stages: the LVSA cone, the ICPS, the ESM with its dark band, the crew module's ogive and the launch abort tower.
export function rocketParts(cfg = ARTEMIS) {
  const C = cfg.colours, p = [];
  p.push(part('cyl', cfg.core.r, cfg.core.r, cfg.core.y0, cfg.core.y1, C.core));
  for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2)   // the four RS-25 nozzles on a square under the core
    p.push(part('cone', cfg.core.nozzle.r, 0.7, cfg.core.y0 - cfg.core.nozzle.h, cfg.core.y0, C.nozzle, sx * cfg.core.nozzle.off, sz * cfg.core.nozzle.off));
  for (const s of [-1, 1]) {   // the two five-segment boosters, their axes 6.5 m either side of the core along v
    p.push(part('cyl', cfg.srb.r, cfg.srb.r, cfg.srb.y0, cfg.srb.y1, C.white, 0, s * cfg.srb.off));
    p.push(part('cone', cfg.srb.r, 0.05, cfg.srb.y1, cfg.srb.y1 + cfg.srb.nose, C.white, 0, s * cfg.srb.off));
    p.push(part('cone', cfg.srb.skirt.r, cfg.srb.r, cfg.srb.y0, cfg.srb.y0 + cfg.srb.skirt.h, C.dark, 0, s * cfg.srb.off));
  }
  p.push(part('cone', cfg.core.r, cfg.lvsa.r1, cfg.lvsa.y0, cfg.lvsa.y1, C.white));
  p.push(part('cyl', cfg.icps.r, cfg.icps.r, cfg.icps.y0, cfg.icps.y1, C.white));
  p.push(part('cyl', cfg.esm.r, cfg.esm.r, cfg.esm.y0, cfg.esm.y1, C.white));
  p.push(part('cyl', cfg.esm.r + 0.02, cfg.esm.r + 0.02, cfg.esm.y1 - cfg.esm.band, cfg.esm.y1, C.dark));
  p.push(part('cone', cfg.esm.r, cfg.cm.r1, cfg.cm.y0, cfg.cm.y1, C.white));
  p.push(part('cyl', cfg.las.r, cfg.las.r, cfg.las.y0, cfg.las.y1 - cfg.las.nose, C.shell));
  p.push(part('cone', cfg.las.r, 0.02, cfg.las.y1 - cfg.las.nose, cfg.las.y1, C.shell));
  return p;
}

// the Orion crew module on its own: a silver truncated cone on a low display stand (four posts and a ring),
// its heat shield showing under the base, the docking tunnel on top. Stands on y = 0 (the lawn).
export function capsuleParts(cfg = ARTEMIS) {
  const C = cfg.colours, K = cfg.capsule, p = [];
  for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2)   // the stand's four posts on the diagonals
    p.push(part('cyl', K.stand.post, K.stand.post, 0, K.stand.h, C.stand, sx * K.stand.r / Math.SQRT2, sz * K.stand.r / Math.SQRT2));
  p.push(part('cyl', K.stand.r + 0.15, K.stand.r + 0.15, K.stand.h - 0.1, K.stand.h, C.dark));
  p.push(part('cone', K.r - 0.1, K.r, K.stand.h - K.shield, K.stand.h, C.shield));
  p.push(part('cone', K.r, K.rTop, K.stand.h, K.stand.h + K.h, C.shell));
  p.push(part('cyl', K.tunnel.r, K.tunnel.r, K.stand.h + K.h, K.stand.h + K.h + K.tunnel.h, C.dark));
  return p;
}

// the tallest tip of a parts list (the rocket's own height over the deck top)
export const rocketTop = (parts) => Math.max(...parts.map(p => p.y1));

// where the stack and the capsule stand in a room ({ centre, frame: { f, v }, portal: { c }, y } as friesPlacement
// takes it): the rocket at the room centre on its mount, turned to the frame (SRBs along v); the capsule at
// capsule.at, its hatch facing the portal; the capsule's gravel ring; the colliders, all `low` (the car stops,
// the helicopter / hovering walker pass over each top, index.html collide()).
export function artemisPlacement(room, cfg = ARTEMIS) {
  const [cx, cz] = room.centre, { f, v } = room.frame, P = room.portal.c, y = room.y;
  const th = Math.atan2(f[1], f[0]);
  const loc = (a, b) => [cx + f[0] * a + v[0] * b, cz + f[1] * a + v[1] * b];
  const [kx, kz] = loc(...cfg.capsule.at), kth = Math.atan2(P[1] - kz, P[0] - kx);
  const base = y + cfg.pad.lift, deckTop = base + cfg.deck.h;
  const box = (x, z, hw, c, s, h, artemis) => ({ x, z, hw, hd: hw, c, s, h, low: true, artemis });
  const mount = box(cx, cz, cfg.deck.w / 2, f[0], f[1], deckTop, 'mount');
  const core = box(cx, cz, cfg.core.r + 0.4, f[0], f[1], deckTop + cfg.h + 2, 'core');
  const srbs = [-1, 1].map(s => { const [x, z] = loc(0, s * cfg.srb.off); return box(x, z, cfg.srb.r + 0.35, f[0], f[1], deckTop + cfg.srb.y1 + cfg.srb.nose + 2, 'srb'); });
  const capsule = box(kx, kz, cfg.capsule.hw, Math.cos(kth), Math.sin(kth), y + cfg.capsule.stand.h + cfg.capsule.h + cfg.capsule.clear, 'capsule');
  const ring = Array.from({ length: 33 }, (_, i) => { const t = i / 32 * 2 * Math.PI; return [kx + Math.cos(t) * cfg.capsule.ring.r, kz + Math.sin(t) * cfg.capsule.ring.r]; });
  return { rocket: { x: cx, z: cz, th }, capsule: { x: kx, z: kz, th: kth }, ring, colliders: [mount, core, ...srbs, capsule] };
}