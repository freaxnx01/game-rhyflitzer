// ostriches.js — #846: the Straussenfarm Sisseln's ostrich paddock. The LWB pasture parcel's outline (A–O, clockwise
// from the road), the post-and-rail fence on it (posts, runs, the gate opening on edge F–G), the point-in-paddock
// test the tree scatter and the flock share, and the flock's deterministic behaviour (stand / peck / walk / flee).
// Pure: no DOM, no three.js. The glue (fence mesh, solids, instanced ostriches) lives in index.html.
import { inPoly } from './walkways.js';
import { rng } from './world.js';

export const OSTRICH = {
  show: 350, centre: [2380, -422], count: 8,
  flee: 25, calm: 45, fleeSpeed: 6, walkSpeed: 1.2, apart: 2, inset: 1,
  postGap: 4, postH: 1.8, rails: [0.55, 1.1, 1.65],
  gate: { edge: ['F', 'G'], fromEnd: 6, width: 4 },
};

// the LWB pasture parcel beside the farmyard, micro-vertices dropped; J and K sit 2 m east of the LWB line so no
// post stands in the stable w171822866 (spec A10)
export const PADDOCK = [
  [2376.9, -321.1],   // A  road side, west corner of the tongue
  [2432.9, -321.1],   // B  road side, east corner
  [2426.8, -523.6],   // C  north-east corner (Stelliweg track beyond)
  [2378.1, -523.2],   // D
  [2329.0, -526.2],   // E  north-west corner
  [2334.2, -378.6],   // F
  [2365.4, -379.3],   // G  gate corner
  [2374.1, -364.3],   // H
  [2383.2, -359.8],   // I  south-west corner of the stable
  [2404.5, -360.3],   // J  stable's east wall, 2 m east of the LWB line
  [2404.5, -333.6],   // K
  [2397.1, -332.4],   // L
  [2397.1, -330.5],   // M
  [2379.6, -328.5],   // N
  [2375.7, -324.1],   // O
];

const VERTEX = 'ABCDEFGHIJKLMNO'.split('');

function edgeDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < PADDOCK.length; i++) {
    const a = PADDOCK[i], b = PADDOCK[(i + 1) % PADDOCK.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

// pad > 0: also true within pad m of the fence line; pad < 0: true only that far inside; pad 0: the plain even-odd test
export function inPaddock(x, z, pad = 0) {
  const inside = inPoly(PADDOCK, x, z);
  if (pad === 0) return inside;
  if (pad < 0) return inside && edgeDist(x, z) >= -pad;
  return inside || edgeDist(x, z) <= pad;
}

// a post at every vertex, then one every postGap along each edge (the last gap shorter); runs between consecutive
// posts. The gate opening sits on its edge, its east end fromEnd m before the edge's end vertex; the run across it
// is the gate. Posts and runs are ordered along the outline, so consecutive posts are always <= postGap apart.
export function fencePosts() {
  const posts = [], runs = [];
  const gateEdge = VERTEX.indexOf(OSTRICH.gate.edge[0]);
  for (let e = 0; e < PADDOCK.length; e++) {
    const a = PADDOCK[e], b = PADDOCK[(e + 1) % PADDOCK.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ts = [];
    for (let t = 0; t < L - 1e-9; t += OSTRICH.postGap) ts.push(t);
    ts.push(L);
    let gate = null;
    if (e === gateEdge) {
      const g1 = L - OSTRICH.gate.fromEnd, g0 = g1 - OSTRICH.gate.width;
      for (let i = ts.length - 1; i >= 0; i--) if (ts[i] > g0 + 1e-6 && ts[i] < g1 - 1e-6) ts.splice(i, 1);   // no post stands in the gateway
      ts.push(g0, g1);
      ts.sort((p, q) => p - q);
      gate = [g0, g1];
    }
    const pts = ts.map(t => [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]);
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) continue;   // the edge's first post is the previous edge's last post
      posts.push(pts[i]);
      if (i > 0) runs.push({ a: pts[i - 1], b: pts[i], gate: !!gate && ts[i - 1] === gate[0] && ts[i] === gate[1] });
    }
  }
  return { posts, runs };
}

// 8 birds on seeded points in the parcel's south half (z > -440, seen from the Hauptstrasse), >= 4 m apart;
// the first three are the dark males
export function makeFlock(seed) {
  const r = rng(seed), birds = [];
  for (let guard = 0; birds.length < OSTRICH.count && guard < 10000; guard++) {
    const x = 2332 + r() * 99, z = -438 + r() * 113;
    if (!inPaddock(x, z, -1)) continue;
    if (birds.some(b => Math.hypot(b.x - x, b.z - z) < 4)) continue;
    birds.push({ x, z, yaw: r() * Math.PI * 2, state: 'stand', timer: 0, dur: 2 + 4 * r(), target: null, male: birds.length < 3, phase: r(), neck: 0, legL: 0, legR: 0, bob: 0 });
  }
  if (birds.length < OSTRICH.count) throw new Error('the paddock cannot hold the flock');
  return { t: 0, birds };
}

function stride(b, dist, strideLen) {
  b.phase += dist / strideLen;
  b.legL = 0.45 * Math.sin(2 * Math.PI * b.phase);
  b.legR = -b.legL;
  b.bob = 0.04 * Math.sin(4 * Math.PI * b.phase);
}

// a seeded point at least 3 m inside the paddock, 20 tries
function walkTarget(rnd) {
  for (let i = 0; i < 20; i++) {
    const x = 2332 + rnd() * 99, z = -522 + rnd() * 197;
    if (inPaddock(x, z, -3)) return [x, z];
  }
  return null;
}

// the next idle state, weighted stand 0.4 / peck 0.35 / walk 0.25 (spec)
function nextIdle(b, rnd) {
  b.timer = 0;
  b.legL = b.legR = b.bob = 0;
  const r = rnd();
  if (r < 0.4) { b.state = 'stand'; b.dur = 2 + 4 * rnd(); b.target = null; }
  else if (r < 0.75) { b.state = 'peck'; b.dur = 2 + 2 * rnd(); b.target = null; }
  else if (!(b.target = walkTarget(rnd))) { b.state = 'stand'; b.dur = 2 + 4 * rnd(); }
  else b.state = 'walk';
}

function stepFlee(b, dt, player, rnd) {
  b.timer += dt;
  const away = Math.atan2(b.z - player.z, b.x - player.x);
  for (const off of [0, 1, -1, 2, -2]) {                    // straight, ±60°, ±120°; all blocked: cornered, it stands
    const th = away + off * Math.PI / 3;
    const nx = b.x + Math.cos(th) * OSTRICH.fleeSpeed * dt, nz = b.z + Math.sin(th) * OSTRICH.fleeSpeed * dt;
    if (!inPaddock(nx, nz, -OSTRICH.inset)) continue;
    b.x = nx; b.z = nz; b.yaw = th;
    stride(b, OSTRICH.fleeSpeed * dt, 2.4);
    break;
  }
  if (Math.hypot(player.x - b.x, player.z - b.z) >= OSTRICH.calm || b.timer >= 6) nextIdle(b, rnd);
}

function stepWalk(b, dt, rnd) {
  b.timer += dt;
  const dx = b.target[0] - b.x, dz = b.target[1] - b.z, d = Math.hypot(dx, dz);
  const step = Math.min(OSTRICH.walkSpeed * dt, d);
  const nx = b.x + dx / d * step, nz = b.z + dz / d * step;
  if (d < 0.3 || b.timer > 10 || !inPaddock(nx, nz, -OSTRICH.inset)) { nextIdle(b, rnd); return; }
  b.x = nx; b.z = nz; b.yaw = Math.atan2(dz, dx);
  stride(b, step, 1.6);
}

function stepStand(b, dt, rnd) {
  b.timer += dt;
  b.neck = Math.max(0, b.neck - 3 * dt);
  if (b.timer >= b.dur) nextIdle(b, rnd);
}

function stepPeck(b, dt, rnd) {
  b.timer += dt;
  const t = b.timer;
  const lift = Math.max(0, Math.min(1, t / 0.6, (b.dur - t) / 0.6));   // down in 0.6 s, hold, back up in 0.6 s
  const peck = t > 0.6 && t < b.dur - 0.6 ? 0.22 * Math.abs(Math.sin((t - 0.6) * 9)) : 0;
  b.neck = Math.max(0, 1.35 * lift - peck);
  if (t >= b.dur) nextIdle(b, rnd);
}

function stepBird(b, dt, player, rnd) {
  if (b.state !== 'flee' && Math.hypot(player.x - b.x, player.z - b.z) < OSTRICH.flee) {
    b.state = 'flee'; b.timer = 0; b.neck = 0; b.legL = b.legR = b.bob = 0;
  }
  if (b.state === 'flee') stepFlee(b, dt, player, rnd);
  else if (b.state === 'walk') stepWalk(b, dt, rnd);
  else if (b.state === 'peck') stepPeck(b, dt, rnd);
  else stepStand(b, dt, rnd);
}

// the 2 m pairwise push: half of the overlap to both birds, each only where the result stays inside the inset
function pushApart(birds) {
  for (let i = 0; i < birds.length; i++) for (let j = i + 1; j < birds.length; j++) {
    const a = birds[i], c = birds[j];
    const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
    if (d === 0 || d >= OSTRICH.apart) continue;
    const push = (OSTRICH.apart - d) / 2, ux = dx / d, uz = dz / d;
    const ax = a.x - ux * push, az = a.z - uz * push, cx = c.x + ux * push, cz = c.z + uz * push;
    if (inPaddock(ax, az, -OSTRICH.inset)) { a.x = ax; a.z = az; }
    if (inPaddock(cx, cz, -OSTRICH.inset)) { c.x = cx; c.z = cz; }
  }
}

// the state table (spec: stand 2–6 s, peck 2–4 s, walk <= 10 s at 1.2 m/s, flee <= 6 s at 6 m/s); mutates in place
export function stepFlock(flock, dt, player, rnd) {
  flock.t += dt;
  for (const b of flock.birds) stepBird(b, dt, player, rnd);
  pushApart(flock.birds);
}

// the J list's row: on the Hauptstrasse in front of the farm, looking at the paddock (landmarks.js carries it)
export function paddockEntry() {
  return { name: 'Straussenfarm Sisseln', gemeinde: 'Sisseln', at: [2345, -318], look: [2385, -400] };
}
