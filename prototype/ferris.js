// #513: the Ferris wheel of star room 6 -- pure numbers, no three.js, no DOM: the wheel as a rim, a hub,
// two A-frames and 32 hanging gondolas, where it stands in a room and its colliders. ferrismesh.js builds
// the meshes from these numbers; index.html places them and steps the turn.
// A classic big observation wheel: 100 m across (rim radius 50 m) on a hub 59 m over the floor, so the
// lowest gondola hangs well over the lawn (6 m clearance) and the highest roof reaches 112 m.
// Unit-tested with `node --test prototype/tests/ferris.test.mjs`.
//
// The wheel's own frame: y = 0 on the floor, +x along the room's forward axis (f, the axle), +z across (v,
// the wheel's plane).
export const FERRIS = {
  key: 'ferris', h: 112,                                    // floor to the top of the highest gondola roof
  rim: 50, hub: { y: 59, r: 4, len: 20 },                   // rim radius (a 100 m wheel); hub centre height; drum radius; axle length along f
  spin: 0.01,                                              // rad/s -- one turn in ~10 min
  gondola: { n: 32, w: 4, d: 3.2, h: 2, drop: 2 },          // hang point on the rim; box centre `drop` m outside it; bottom stays > 5 m over the floor
  frame: { a: 8, b: 30, foot: { hw: 5, h: 0.6 }, r: 0.9 },  // A-frames at f = +-a; feet at b = +-b; leg radius
  collider: { hw: 5, over: 2 },                             // foot squares, solid to the hub + over
  colours: { rim: 0xf2f2ee, steel: 0x3a3d42, foot: 0x8a8d92, gondolas: [0xc9503f, 0x3f7fc9, 0xe0b13a, 0x4aa36b, 0xd9d9d9, 0x8a5fb3] },
};

// the gondolas' hang angles on the rim: n evenly spaced from 0 (one hangs straight down)
export const gondolaAngles = (cfg = FERRIS) => Array.from({ length: cfg.gondola.n }, (_, i) => i / cfg.gondola.n * 2 * Math.PI);

// the wheel's turn at t seconds: linear in cfg.spin, wrapped at a turn (0 at t = 0)
export const wheelAngle = (t, cfg = FERRIS) => (t * cfg.spin) % (2 * Math.PI);

// the four legs of the two A-frames: for each side sa = +-1 of the axle and sb = +-1 across, one cylinder
// (radius frame.r) from the foot (y 0, at (sa.a, sb.b) in the wheel's frame) up to the axle end at y = hub.y.
export function legSegments(cfg = FERRIS) {
  const legs = [];
  for (const sa of [-1, 1]) for (const sb of [-1, 1])
    legs.push({ a: [sa * cfg.frame.a, 0, sb * cfg.frame.b], b: [sa * cfg.frame.a, cfg.hub.y, 0], r: cfg.frame.r });
  return legs;
}

// where the wheel stands in a room ({ centre, frame: { f, v }, portal: { c }, y } as artemisPlacement takes it):
// on the room centre, the axle along the room's f (the portal sees the wheel face-on); four `low` foot colliders
// (the car stops on the floor, the helicopter / hovering walker pass over each top, index.html collide()).
// The rim and gondolas have none: the lowest one hangs 6 m clear over the lawn.
export function ferrisPlacement(room, cfg = FERRIS) {
  const [cx, cz] = room.centre, { f, v } = room.frame, y = room.y;
  const th = Math.atan2(f[1], f[0]);
  const loc = (a, b) => [cx + f[0] * a + v[0] * b, cz + f[1] * a + v[1] * b];
  const colliders = [];
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const [x, z] = loc(sa * cfg.frame.a, sb * cfg.frame.b);
    colliders.push({ x, z, hw: cfg.collider.hw, hd: cfg.collider.hw, c: f[0], s: f[1], h: y + cfg.hub.y + cfg.collider.over, low: true, ferris: 'foot' });
  }
  return { wheel: { x: cx, z: cz, th }, colliders };
}