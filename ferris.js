// #513: the Ferris wheel of star room 6 -- pure numbers, no three.js, no DOM: the wheel as a rim, a hub,
// two A-frames and 48 hanging gondolas, where it stands in a room and its colliders. ferrismesh.js builds
// the meshes from these numbers; index.html places them and steps the turn.
// #588: a record-size observation wheel: 250 m across (rim radius 125 m) on a hub 136 m over the floor, so the
// lowest gondola hangs over the lawn (6.25 m clearance) and the highest roof reaches 265.75 m. Plus its light show
// (ledLayout / ledColour), fireworks (salvoAt / burstsLive / particle) and the room's dusk look (DUSK_LOOK).
// Unit-tested with `node --test tests/ferris.test.mjs`.
//
// The wheel's own frame: y = 0 on the floor, +x along the room's forward axis (f, the axle), +z across (v,
// the wheel's plane).
export const FERRIS = {
  key: 'ferris', h: 265.75,                                 // floor to the top of the highest gondola roof
  rim: 125, hub: { y: 136, r: 8, len: 34 },                 // rim radius (a 250 m wheel); hub centre height; drum radius; axle length along f
  spin: 0.01,                                              // rad/s -- one turn in ~10.5 min
  gondola: { n: 48, w: 8, d: 5, h: 3.5, drop: 3 },          // hang point on the rim; box centre `drop` m outside it; bottom stays > 5 m over the floor
  frame: { a: 17, b: 62, foot: { hw: 8, h: 0.8 }, r: 1.8 }, // A-frames at f = +-a; feet at b = +-b; leg radius
  collider: { hw: 8, over: 2 },                             // foot squares, solid to the hub + over
  led: { rimStep: 2, spokes: 32, spokeN: 24, ringX: 3 },    // ~2 m between rim LEDs, 32 spoke pairs, 24 LEDs per spoke, rim rings at x = +-ringX
  fireworks: { every: 10, perSalvo: [3, 5], particles: 120, life: 2.5, speed: [25, 45], g: 9.81, colours: ['#ff4d4d', '#ffd23f', '#5ce1ff', '#7dff6b', '#ff7be5', '#ffffff'] },
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

// #588: the light show -- ~2300 LEDs on both rim rings and along the spokes, in the rotating wheel's frame (hub at the
// origin). Rim: { kind 'rim', ring +-1, u 0..1 round the ring }; spoke: { kind 'spoke', spoke, side +-1, s 0..1 hub to rim }.
export function ledLayout(cfg = FERRIS) {
  const L = [], X = cfg.led.ringX, nr = Math.round(2 * Math.PI * cfg.rim / cfg.led.rimStep), ns = cfg.led.spokeN, nsp = cfg.led.spokes;
  const add = l => L.push({ ...l, i: L.length });
  for (const ring of [-1, 1]) for (let k = 0; k < nr; k++) { const u = k / nr, t = u * 2 * Math.PI; add({ kind: 'rim', ring, u, pos: [ring * X, cfg.rim * Math.sin(t), cfg.rim * Math.cos(t)] }); }
  for (let i = 0; i < nsp; i++) { const t = i / nsp * 2 * Math.PI; for (const side of [-1, 1]) for (let k = 0; k < ns; k++) { const s = (k + 0.5) / ns, r = cfg.hub.r + s * (cfg.rim - cfg.hub.r); add({ kind: 'spoke', spoke: i, side, s, pos: [side * X, r * Math.sin(t), r * Math.cos(t)] }); } }
  return L;
}

export const PATTERNS = ['chase', 'pulse', 'sparkle', 'fade'];
const PATTERN_LEN = 18, CROSSFADE = 1.5;

// which pattern runs at t seconds (and which follows, with how much of the crossfade is done)
export function patternAt(t) {
  const n = PATTERNS.length, k = Math.floor(t / PATTERN_LEN), local = t - k * PATTERN_LEN, a = ((k % n) + n) % n, fade = local - (PATTERN_LEN - CROSSFADE);
  return fade > 0 ? { a: PATTERNS[a], b: PATTERNS[(a + 1) % n], mix: fade / CROSSFADE } : { a: PATTERNS[a], b: PATTERNS[a], mix: 0 };
}

// seeded hash of an integer -> [0, 1) (no Math.random: every peer and every run sees the same show)
export function hash01(n) { let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b; x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39); x ^= x >>> 15; return (x >>> 0) / 4294967296; }

function hsv(h, s, v, out) { h = ((h % 1) + 1) % 1; const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); switch (i % 6) { case 0: out[0] = v; out[1] = t; out[2] = p; break; case 1: out[0] = q; out[1] = v; out[2] = p; break; case 2: out[0] = p; out[1] = v; out[2] = t; break; case 3: out[0] = p; out[1] = q; out[2] = v; break; case 4: out[0] = t; out[1] = p; out[2] = v; break; default: out[0] = v; out[1] = p; out[2] = q; } }
const phase = x => x - Math.floor(x);
const TMP = [0, 0, 0], TMP2 = [0, 0, 0];

function pattern(name, led, t, out) {
  const rim = led.kind === 'rim', pos = rim ? led.u : led.spoke / 32;
  if (name === 'chase') return hsv(pos * 2 - t * 0.15, 1, rim ? 1 : 0.55, out);               // a rainbow running round the rim, the spokes glow dimmer
  if (name === 'pulse') { const d = rim ? 0.25 + 0.2 * Math.sin(t * 2 + led.u * 40) : phase(led.s - t * 0.5), v = rim ? d : Math.pow(1 - d, 3); return hsv(0.55 + (rim ? 0 : led.spoke / 64) + t * 0.02, 0.8, Math.min(1, 0.12 + v), out); }   // pulses run out along the spokes
  if (name === 'sparkle') { const h = hash01(led.i * 7919 + Math.floor(t * 8)); return h > 0.93 ? hsv(hash01(led.i), 0.15, 1, out) : hsv(0.62, 0.6, 0.18, out); }   // random twinkles on a dim blue base
  return hsv(t * 0.05 + (rim ? 0 : 0.02 * led.s), 0.9, 1, out);                                  // the whole wheel fading through the colours
}

// the colour of one LED at t seconds, written into out[0..2] (each 0..1); no allocation
export function ledColour(led, t, out) {
  const k = Math.floor(t / PATTERN_LEN), n = PATTERNS.length, a = (((k % n) + n) % n), local = t - k * PATTERN_LEN, fade = local - (PATTERN_LEN - CROSSFADE);
  pattern(PATTERNS[a], led, t, out);
  if (fade <= 0) return out;
  pattern(PATTERNS[(a + 1) % n], led, t, TMP); const m = fade / CROSSFADE;
  for (let c = 0; c < 3; c++) out[c] = out[c] * (1 - m) + TMP[c] * m;
  return out;
}

// #588: fireworks -- salvo n (every `every` s) is 3-5 bursts above the wheel, all from the seeded hash of n.
// Burst: { t0, centre [x, y, z] in the wheel's frame, colour, speed }.
export function salvoAt(n, cfg = FERRIS) {
  const FW = cfg.fireworks, count = FW.perSalvo[0] + Math.floor(hash01(n * 131 + 1) * (FW.perSalvo[1] - FW.perSalvo[0] + 1)), out = [];
  for (let k = 0; k < count; k++) {
    const h = j => hash01(n * 1009 + k * 17 + j);
    out.push({ t0: n * FW.every + h(1) * 2, centre: [(h(2) * 2 - 1) * 150, cfg.h + 10 + h(3) * (400 - cfg.h - 10), (h(4) * 2 - 1) * 150], colour: FW.colours[Math.floor(h(5) * FW.colours.length)], speed: FW.speed[0] + h(6) * (FW.speed[1] - FW.speed[0]) });
  }
  return out;
}

// the bursts alive at t seconds (age in [0, life)): from this salvo and the one before it
export function burstsLive(t, cfg = FERRIS) {
  const FW = cfg.fireworks, n = Math.floor(t / FW.every), live = [];
  for (const s of [n - 1, n]) if (s >= 0) for (const b of salvoAt(s, cfg)) { const age = t - b.t0; if (age >= 0 && age < FW.life) live.push(b); }
  return live;
}

// particle j of a burst at `age` s: out = [x, y, z, fade]. A Fibonacci sphere of directions, flung at `speed`, falling under gravity, fading (1 - age / life)^2
export function particle(burst, j, age, out, cfg = FERRIS) {
  const FW = cfg.fireworks, y = 1 - 2 * (j + 0.5) / FW.particles, r = Math.sqrt(1 - y * y), phi = j * 2.399963229728653, d = burst.speed * age;
  out[0] = burst.centre[0] + Math.cos(phi) * r * d; out[1] = burst.centre[1] + y * d - 0.5 * FW.g * age * age; out[2] = burst.centre[2] + Math.sin(phi) * r * d;
  const f = Math.max(0, 1 - age / FW.life); out[3] = f * f;
  return out;
}

// #588: the dusk look of room 6, same shape as ROOM_LOOK in index.html
export const DUSK_LOOK = { fog: '#6b4f6e', density: 0.0006, skyTop: '#1c2050', skyHor: '#f0875a', hemiSky: '#9a88c0', hemiGround: '#3a3a30', hemi: 0.45, sun: 0.35 };
