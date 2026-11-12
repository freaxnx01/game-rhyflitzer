// #859: the rally hall and its three cars (Toyota GR Yaris Rally1, Hyundai i20 N Rally1, Subaru Impreza WRC)
// as pure numbers, no three.js, no DOM: the descriptor, the cars as boxes and wheels in their own frames, their
// extents and where everything stands in a room, with the colliders. rallyhallmesh.js builds the meshes from these
// numbers; index.html places them. Unit-tested with `node --test tests/rallyhall.test.mjs`.
//
// The hall's frame: a along its length (into the room, towards the back wall), b across, y = 0 on the floor;
// the front (a = -d/2) is open. A car's frame: +x nose, y up with the tyres at y = 0, z across.
export const RALLYHALL = {
  key: 'rallyhall', h: 14.8,                                // floor to the roof top
  hall: { w: 72, d: 40, wall: 0.6, post: 1.0, floor: 0.15, roof: { y0: 14.0, t: 0.8, canopy: 4 }, glass: { y0: 3, y1: 9 } },
  podium: { r: 4.5, h: 0.5, hw: 3.0, clear: 0.6 },
  apron: { from: 95, hw: 5 },                               // gravel strip from a = -95 to the roof edge
  cars: [                                                   // a, b: centre-relative (a towards the far wall); th: heading in the hall frame, PI = nose to the open front
    { id: 'neuville', at: [4, -22], th: Math.PI + 0.5, len: 4.10, wid: 1.88, hgt: 1.40, wheelbase: 2.60, wheelR: 0.33, wheelW: 0.30, colour: 0x3f7fd0 },   // light blue
    { id: 'evans',    at: [4, 0],   th: Math.PI,       len: 4.07, wid: 1.88, hgt: 1.40, wheelbase: 2.56, wheelR: 0.33, wheelW: 0.30, colour: 0xc23b2f },   // red
    { id: 'mccrae',   at: [4, 22],  th: Math.PI - 0.5, len: 4.34, wid: 1.77, hgt: 1.42, wheelbase: 2.52, wheelR: 0.32, wheelW: 0.28, colour: 0x1b2f78 },   // deep blue
  ],
  colours: { glass: 0x1b2330, dark: 0x202226, tyre: 0x17181a, rim: 0xb7b9bd, wall: 0xc9c8c2, roof: 0x8d9096, floor: 0x9b9a95, podium: 0xe6e6e2, band: 0x2c3b4d },
};

// one rally car in its own frame (+x nose, y up with the tyres at y = 0, z across): the lower body box, the cabin
// on it, a dark window band, a front splitter, the rear wing (a plane on two uprights at the top) and four wheels
// (a dark tyre with a silver rim showing at the outer face). Plain paint only -- no livery, no badge, no lettering.
export function carParts(car, cfg = RALLYHALL) {
  const C = cfg.colours, L = car.len, W = car.wid, H = car.hgt, p = [];
  const box = (x, y, z, sx, sy, sz, colour) => p.push({ kind: 'box', x, y, z, sx, sy, sz, colour });
  const wheel = (x, y, z, r, w, colour) => p.push({ kind: 'wheel', x, y, z, r, w, colour });
  box(0, 0.39, 0, L, 0.50, W, car.colour);                                             // the lower body: full length and width, 0.14 - 0.64 m
  box(-0.04 * L, (0.64 + H) / 2, 0, 0.48 * L, H - 0.64, 0.78 * W, car.colour);         // the cabin: up to the car's height, a little aft
  box(-0.04 * L, 0.97, 0, 0.50 * L, 0.38, 0.80 * W, C.glass);                          // the window band on the cabin
  box(L / 2 - 0.15, 0.12, 0, 0.30, 0.06, 0.95 * W, C.dark);                            // the front splitter under the nose
  box(-L / 2 + 0.225, H - 0.025, 0, 0.45, 0.05, 0.90 * W, C.dark);                     // the rear wing's plane at the top
  for (const s of [-1, 1]) box(-L / 2 + 0.225, H - 0.20, s * 0.30 * W, 0.08, 0.3, 0.05, C.dark);   // its two uprights
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * car.wheelbase / 2, z = sz * (W / 2 - car.wheelW / 2);
    wheel(x, car.wheelR, z, car.wheelR, car.wheelW, C.tyre);
    wheel(x, car.wheelR, sz * (W / 2 - 0.3 * car.wheelW), 0.62 * car.wheelR, 0.6 * car.wheelW, C.rim);   // the rim showing at the tyre's outer face
  }
  return p;
}

// the extents over a parts list (a wheel spans x ± r, y ± r, z ± w/2): the car's length, width, height and the
// lowest point (the tyres touch y = 0)
export function carExtent(parts) {
  const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of parts) {
    const rx = p.kind === 'wheel' ? p.r : p.sx / 2, ry = p.kind === 'wheel' ? p.r : p.sy / 2, rz = p.kind === 'wheel' ? p.w / 2 : p.sz / 2;
    lo.x = Math.min(lo.x, p.x - rx); hi.x = Math.max(hi.x, p.x + rx);
    lo.y = Math.min(lo.y, p.y - ry); hi.y = Math.max(hi.y, p.y + ry);
    lo.z = Math.min(lo.z, p.z - rz); hi.z = Math.max(hi.z, p.z + rz);
  }
  return { len: hi.x - lo.x, wid: hi.z - lo.z, hgt: hi.y, minY: lo.y };
}

// where the hall and its cars stand in a room ({ centre, frame: { f, v }, y } as roomLayout gives it): the hall at the
// room centre turned to the frame, each car on its podium with its nose to the open front, the gravel apron from the
// 95 m loop to the roof edge, and nine colliders (back wall, two side walls, two posts, the roof as a bridge deck,
// one square per podium + car) -- all `low`, so the car stops on the floor and the helicopter passes over each top.
export function rallyhallPlacement(room, cfg = RALLYHALL) {
  const [cx, cz] = room.centre, { f, v } = room.frame, y = room.y, { hall: H, podium, apron } = cfg;
  const th = Math.atan2(f[1], f[0]);
  const loc = (a, b) => [cx + f[0] * a + v[0] * b, cz + f[1] * a + v[1] * b];
  const box = (a, b, hw, hd, h, rallyhall, extra) => { const [x, z] = loc(a, b); return { x, z, hw, hd, c: f[0], s: f[1], h, low: true, rallyhall, ...extra }; };
  const wallTop = { h: y + cfg.h };
  const colliders = [
    box(H.d / 2 - H.wall / 2, 0, H.wall / 2, H.w / 2, wallTop.h, 'back wall'),
    box(0, H.w / 2 - H.wall / 2, H.d / 2, H.wall / 2, wallTop.h, 'side wall'),
    box(0, -(H.w / 2 - H.wall / 2), H.d / 2, H.wall / 2, wallTop.h, 'side wall'),
    box(-H.d / 2 + H.post / 2, H.w / 2 - H.post / 2, H.post / 2, H.post / 2, wallTop.h, 'post'),
    box(-H.d / 2 + H.post / 2, -(H.w / 2 - H.post / 2), H.post / 2, H.post / 2, wallTop.h, 'post'),
    box(-H.roof.canopy / 2, 0, (H.d + H.roof.canopy) / 2, H.w / 2, wallTop.h, 'roof', { bridge: true, y0: y + H.roof.y0 }),
  ];
  const cars = cfg.cars.map(c => {
    const [x, z] = loc(...c.at);
    colliders.push(box(c.at[0], c.at[1], podium.hw, podium.hw, y + podium.h + c.hgt + podium.clear, `car ${c.id}`));
    return { id: c.id, x, z, th: th + c.th };
  });
  return { hall: { x: cx, z: cz, th }, cars, apron: [loc(-apron.from, 0), loc(-(H.d / 2 + H.roof.canopy), 0)], colliders };
}
