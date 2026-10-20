// knock.js — #415: knock-over street furniture. Pure functions (node --test) plus createKnock(), which gets THREE and the
// game's hooks passed in, so this file imports nothing.
// A knocked prop is a small rigid body: it keeps the centre of mass (x, y, z), a velocity, Euler angles (order YXZ, like THREE)
// and angular velocities. It flies, bounces on the ground height it is given, tumbles and ends up lying down.

export const GRAVITY = 20;
export const BEND_KMH = 40;          // a lamp bends over above this speed, below it stays solid
export const KNOCK_MIN = 1.5;        // m/s: slower than a walk and the car just touches the prop
export const RESTORE_AFTER = 60;     // s lying before it may stand up again ...
export const RESTORE_DIST = 70;      // ... once the car is further away than this (out of view)
export const FOUNTAIN_SECONDS = [8, 10];
export const CLOTH_PER_CONTAINER = 12;

// r: hit radius (added to the car's), h: height, th: half thickness when lying, push: share of the car's velocity the prop
// gets, up: base upward kick, slow: share of the car's speed lost, sound: sound recipe, mass: spin damping
export const KINDS = {
  bin:               { r: 0.35, h: 1.0, th: 0.25, push: 1.0, up: 4.5, slow: 0.02, sound: 'clatter', long: false },
  robidog:           { r: 0.35, h: 1.3, th: 0.25, push: 1.0, up: 4.5, slow: 0.02, sound: 'clatter', long: false },
  bench:             { r: 0.75, h: 0.9, th: 0.3, push: 0.75, up: 3.5, slow: 0.05, sound: 'wood', long: true },
  bike_rack:         { r: 1.0, h: 0.6, th: 0.3, push: 0.8, up: 3.5, slow: 0.04, sound: 'clang', long: true },
  glass_container:   { r: 1.0, h: 1.6, th: 0.75, push: 0.55, up: 4.5, slow: 0.08, sound: 'glass', long: false },
  clothes_container: { r: 0.9, h: 2.0, th: 0.6, push: 0.55, up: 4.5, slow: 0.08, sound: 'clothes', long: false },
  hydrant:           { r: 0.4, h: 0.9, th: 0.13, push: 1.0, up: 5.5, slow: 0.03, sound: 'hydrant', long: false },
  lamp:              { r: 0.3, h: 6.0, th: 0.08, push: 0, up: 0, slow: 0.12, sound: 'lamp', long: false },
};
export const KNOCKABLE = Object.keys(KINDS);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// what a hit at this speed (m/s) does to this kind: 'fly' | 'bend' | null (not hit: too slow, or a lamp below the bend speed)
export function knockAction(kind, speed) {
  const k = KINDS[kind];
  if (!k || !(speed >= KNOCK_MIN)) return null;
  if (kind === 'lamp') return speed * 3.6 >= BEND_KMH ? 'bend' : null;
  return 'fly';
}

// car circle (x, z, radius) touching the prop's hit circle, and the car not flying over the top of it
export function touches(kind, px, pz, groundY, car) {
  const k = KINDS[kind], dx = car.x - px, dz = car.z - pz, r = car.r + k.r;
  return dx * dx + dz * dz < r * r && car.y < groundY + k.h;
}

// ---------- spatial grid: cell -> list of prop indices; the query fills a reused array ----------
export function propGrid(list, cell = 16) {
  const m = new Map();
  list.forEach((p, i) => { const k = Math.floor(p.x / cell) * 65536 + Math.floor(p.z / cell); let a = m.get(k); if (!a) m.set(k, a = []); a.push(i); });
  return { cell, m };
}
export function nearProps(g, x, z, out) {
  out.length = 0;
  const i0 = Math.floor(x / g.cell), j0 = Math.floor(z / g.cell);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = g.m.get(i * 65536 + j); if (a) for (let n = 0; n < a.length; n++) out.push(a[n]); }
  return out;
}

// ---------- the flying body ----------
// the model's up axis in the world (the model hangs from its base: the centre of mass sits h/2 above it)
export function upAxis(b, out = [0, 0, 0]) {
  const sz = Math.sin(b.rz), cz = Math.cos(b.rz), sx = Math.sin(b.rx), cx = Math.cos(b.rx), sy = Math.sin(b.ry), cy = Math.cos(b.ry);
  const x = -sz, y = cz * cx, z = cz * sx;   // Rz then Rx
  out[0] = x * cy + z * sy; out[1] = y; out[2] = -x * sy + z * cy;
  return out;
}
// where the model's base (its pivot) is, for a body whose centre of mass is at b
export function pivotOf(b, h, out = [0, 0, 0]) {
  upAxis(b, out); out[0] = b.x - out[0] * h / 2; out[1] = b.y - out[1] * h / 2; out[2] = b.z - out[2] * h / 2;
  return out;
}
const contactH = (k, b) => k.th + (k.h / 2 - k.th) * Math.abs(Math.cos(b.rz) * Math.cos(b.rx));

// the body that a car (vx, vz at speed) makes of the prop standing at (px, groundY, pz) with yaw ry
export function launch(kind, px, groundY, pz, yaw, car, rng = Math.random) {
  const k = KINDS[kind], speed = Math.hypot(car.vx, car.vz), sp = clamp(speed / 12, 0.3, 2.2), side = () => (rng() - 0.5) * 3;
  const spin = (m) => (rng() * 2 - 1) * m * sp;
  return {
    kind, x: px, y: groundY + k.h / 2, z: pz,
    vx: car.vx * k.push + side(), vy: k.up * (0.6 + 0.4 * sp) + speed * 0.12 + rng() * 1.5, vz: car.vz * k.push + side(),
    rx: 0, ry: yaw, rz: 0,
    wx: spin(k.long ? 9 : 7), wy: spin(6), wz: spin(k.long ? 2 : 7),
    rest: false, t: 0, bounces: 0,
  };
}

// one step; gy = ground height under the body. Returns true on the step it hits the ground hard enough to be heard again
export function stepBody(b, dt, gy) {
  const k = KINDS[b.kind]; b.t += dt;
  if (b.rest) return false;
  b.vy -= GRAVITY * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
  const floor = gy + contactH(k, b); let hit = false;
  if (b.y <= floor) {
    b.y = floor;
    if (b.vy < 0) { hit = -b.vy > 3; b.vy = -b.vy * 0.32; if (b.vy < 1.2) b.vy = 0; b.bounces++; }
    const f = Math.exp(-3.5 * dt), g = Math.exp(-2.5 * dt);
    b.vx *= f; b.vz *= f; b.wx *= g; b.wy *= g; b.wz *= g;
    if (Math.hypot(b.vx, b.vz) < 0.5 && b.vy === 0 && Math.hypot(b.wx, b.wz) < 1.2) {
      b.vx = b.vz = b.wx = b.wy = b.wz = 0;
      if (Math.abs(Math.cos(b.rz) * Math.cos(b.rx)) > 0.35) { const a = b.long ? 'rx' : 'rz'; b[a] += (b[a] >= 0 ? 1 : -1) * 2.6 * dt; b.wx = b.wz = 0.0001; }   // still standing: topple over
      else b.rest = true;
    }
  }
  return hit;
}

// ---------- the lamp bending over (rotation about its foot) ----------
export const BEND_MAX = 1.38;   // ~79 degrees
export function bendAngle(t) {
  if (t <= 0) return 0;
  const fall = 0.7;
  if (t < fall) { const u = t / fall; return BEND_MAX * u * u; }
  const u = (t - fall) / 0.35;
  return u >= 1 ? BEND_MAX : BEND_MAX - Math.sin(u * Math.PI) * 0.08 * (1 - u);   // a small rebound
}

// ---------- fountain droplets ----------
export function fountainSeconds(rng = Math.random) { return FOUNTAIN_SECONDS[0] + rng() * (FOUNTAIN_SECONDS[1] - FOUNTAIN_SECONDS[0]); }
export function newDrop(d, x, y, z, rng = Math.random) {
  const a = rng() * Math.PI * 2, s = Math.sqrt(rng()) * 2.2;
  d.x = x; d.y = y; d.z = z; d.vx = Math.cos(a) * s; d.vz = Math.sin(a) * s; d.vy = 13 + rng() * 4.5; d.life = 0; d.on = true;
  return d;
}
export function stepDrop(d, dt, gy) {
  if (!d.on) return;
  d.vy -= GRAVITY * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.life += dt;
  if (d.y <= gy && d.vy < 0) d.on = false;
}

// ---------- clothes ----------
export const CLOTH_TYPES = ['sock', 'tshirt', 'trousers'];
export const CLOTH_COLOURS = [0xe63946, 0xf4a261, 0xf9c74f, 0x90be6d, 0x43aa8b, 0x4cc9f0, 0x4361ee, 0x7209b7, 0xf72585, 0xffffff, 0x2b2d42, 0xb5838d];
export function newCloth(c, x, y, z, type, rng = Math.random) {
  const a = rng() * Math.PI * 2, s = 1.5 + rng() * 4;
  c.type = type; c.on = true; c.rest = false; c.t = 0; c.phase = rng() * 6.28; c.color = CLOTH_COLOURS[Math.floor(rng() * CLOTH_COLOURS.length)];
  c.x = x; c.y = y; c.z = z; c.vx = Math.cos(a) * s; c.vz = Math.sin(a) * s; c.vy = 6 + rng() * 6;
  c.rx = rng() * 6.28; c.ry = rng() * 6.28; c.rz = rng() * 6.28; c.wx = (rng() - 0.5) * 9; c.wy = (rng() - 0.5) * 9; c.wz = (rng() - 0.5) * 9;
  return c;
}
// thrown up fast, then the air catches it: a low terminal speed and a sway, so it flutters down
export function stepCloth(c, dt, gy) {
  if (!c.on || c.rest) return;
  c.t += dt;
  c.vy -= 9 * dt; if (c.vy < -1.4) c.vy = -1.4;
  const drag = Math.exp(-1.6 * dt); c.vx *= drag; c.vz *= drag;
  c.x += (c.vx + Math.sin(c.t * 3.1 + c.phase) * 1.2) * dt; c.z += (c.vz + Math.cos(c.t * 2.7 + c.phase) * 1.2) * dt; c.y += c.vy * dt;
  c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
  const damp = Math.exp(-0.9 * dt); c.wx *= damp; c.wy *= damp; c.wz *= damp;
  if (c.y <= gy + 0.03) { c.y = gy + 0.03; c.rest = true; c.rx = c.rz = 0; }   // lies flat, any heading
}

// ---------- sounds: a recipe is a list of events; knock.js's player turns it into Web Audio nodes ----------
// event: { t, dur, gain, noise: { type, freq, q } | tone: { f0, f1, wave } }
export function soundLevel(speed) { return clamp(0.3 + speed / 22, 0.3, 1); }
const noiseEv = (t, dur, gain, type, freq, q = 1) => ({ t, dur, gain, noise: { type, freq, q } });
const toneEv = (t, dur, gain, f0, f1 = f0, wave = 'sine') => ({ t, dur, gain, tone: { f0, f1, wave } });
const bell = (t, f, gain, dur) => [1, 2.76, 5.4, 8.93].map((m, i) => toneEv(t, dur / (1 + i * 0.6), gain / (1 + i * 0.9), f * m, f * m, i % 2 ? 'triangle' : 'sine'));

export function soundPlan(sound, level, rng = Math.random) {
  const v = clamp(level, 0, 1), ev = [];
  switch (sound) {
    case 'clatter': {   // a tin bin: several tinny hits, bouncing off
      let t = 0, g = 0.5;
      for (let i = 0; i < 5; i++) { ev.push(noiseEv(t, 0.12, g * v, 'bandpass', 1800 + rng() * 2200, 2.5), toneEv(t, 0.14, g * 0.5 * v, 700 + rng() * 800, 520 + rng() * 300, 'triangle')); t += 0.05 + rng() * 0.12 + i * 0.03; g *= 0.68; }
      ev.push(toneEv(0, 0.12, 0.4 * v, 140, 70));
      break;
    }
    case 'wood': {      // a heavy hollow knock and two lighter ones
      [[0, 0.7], [0.16, 0.42], [0.3, 0.25]].forEach(([t, g]) => ev.push(toneEv(t, 0.12, g * v, 240 - t * 160, 90, 'sine'), noiseEv(t, 0.05, g * 0.8 * v, 'lowpass', 1100, 0.8)));
      break;
    }
    case 'clang': {     // struck metal tube
      ev.push(...bell(0, 430, 0.45 * v, 0.9), noiseEv(0, 0.05, 0.4 * v, 'highpass', 3000, 0.7), ...bell(0.19, 470, 0.22 * v, 0.5));
      break;
    }
    case 'lamp': {      // a long, low pole ringing
      ev.push(...bell(0, 190, 0.55 * v, 1.5), noiseEv(0, 0.08, 0.35 * v, 'bandpass', 900, 1.2), toneEv(0.55, 0.3, 0.3 * v, 120, 60), ...bell(0.62, 230, 0.2 * v, 0.7));
      break;
    }
    case 'glass': {     // shatter: a burst, then a rain of splinters
      ev.push(noiseEv(0, 0.18, 0.55 * v, 'highpass', 3500, 0.7));
      for (let i = 0; i < 14; i++) { const t = 0.03 + rng() * 0.6; ev.push(toneEv(t, 0.08 + rng() * 0.08, (0.25 - t * 0.2) * v, 2500 + rng() * 3500, 2000 + rng() * 2000, 'sine'), noiseEv(t, 0.05, 0.12 * v, 'highpass', 5000, 1)); }
      ev.push(toneEv(0, 0.1, 0.35 * v, 120, 60));
      break;
    }
    case 'clothes': {   // a soft thud and a whoosh of fabric
      ev.push(toneEv(0, 0.2, 0.55 * v, 110, 50), noiseEv(0.02, 0.5, 0.4 * v, 'lowpass', 700, 0.6), noiseEv(0.1, 0.4, 0.15 * v, 'bandpass', 1800, 0.5));
      break;
    }
    case 'hydrant': {   // dull clang plus the rush of water
      ev.push(...bell(0, 330, 0.4 * v, 0.7), noiseEv(0, 0.07, 0.35 * v, 'highpass', 2500, 0.7), noiseEv(0.15, 0.6, 0.3 * v, 'bandpass', 2600, 0.6));
      break;
    }
    default:
  }
  return ev;
}
// the fountain's hiss: one long band-passed noise, faded in and out (played once per fountain)
export function hissPlan(seconds, level = 1) {
  return [noiseEv(0, seconds, 0.16 * level, 'highpass', 2200, 0.5), noiseEv(0, seconds, 0.1 * level, 'bandpass', 4200, 0.7)];
}

const noiseCache = new WeakMap();
function noiseBuf(ac) {
  let b = noiseCache.get(ac);
  if (!b) { b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseCache.set(ac, b); }
  return b;
}
// plays a plan on a destination node; `shape` 'decay' (hits) or 'swell' (the hiss)
export function playPlan(ac, dest, plan, shape = 'decay') {
  const t0 = ac.currentTime;
  for (const e of plan) {
    const t = t0 + e.t, g = ac.createGain(); let src;
    if (shape === 'swell') { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.gain, t + 0.4); g.gain.setValueAtTime(e.gain, t + Math.max(0.4, e.dur - 1.5)); g.gain.linearRampToValueAtTime(0.0001, t + e.dur); }
    else { g.gain.setValueAtTime(e.gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur); }
    if (e.noise) {
      src = ac.createBufferSource(); src.buffer = noiseBuf(ac); src.loop = true;
      const f = ac.createBiquadFilter(); f.type = e.noise.type; f.frequency.value = e.noise.freq; f.Q.value = e.noise.q;
      src.connect(f); f.connect(g);
    } else {
      src = ac.createOscillator(); src.type = e.tone.wave; src.frequency.setValueAtTime(e.tone.f0, t);
      if (e.tone.f1 !== e.tone.f0) src.frequency.exponentialRampToValueAtTime(e.tone.f1, t + e.dur);
      src.connect(g);
    }
    g.connect(dest); src.start(t); src.stop(t + e.dur + 0.05);
  }
}

// ---------- restoring ----------
export function restoreDue(age, distToCar) { return age >= RESTORE_AFTER && distToCar > RESTORE_DIST; }

// ---------- the scene side ----------
// deps: { THREE, parent, terrainH(x, z), groups: { kind: { mesh, list } } (list items {x, z, rot, obb?}), car: () => {x, y, z, vx, vz, r},
//         play(sound, level), hiss(seconds), onCount(n), rng }
export function createKnock(deps) {
  const { THREE, parent, terrainH, groups, car, play, hiss, onCount } = deps, rng = deps.rng || Math.random;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), axis = new THREE.Vector3(), upV = new THREE.Vector3(0, 1, 0), piv = [0, 0, 0];
  const state = { count: 0, started: 0 };
  const all = [];   // every knockable prop: { kind, i, p, grid index }
  for (const kind of KNOCKABLE) { const g = groups[kind]; if (g) g.list.forEach((p, i) => all.push({ kind, i, p, g, hit: null, off: 0 })); }
  const grid = propGrid(all.map(a => a.p)), nearBuf = [], active = [];   // active: the knocked props (flying, lying, bending)
  const hiddenM = new THREE.Matrix4().compose(zero, q.identity(), zero);
  const setM = (a, mat) => { a.g.mesh.setMatrixAt(a.i, mat); a.g.mesh.instanceMatrix.addUpdateRange(a.i * 16, 16); a.g.mesh.instanceMatrix.needsUpdate = true; };
  const standM = (a) => { q.setFromAxisAngle(upV, -a.p.rot); pos.set(a.p.x, terrainH(a.p.x, a.p.z), a.p.z); return m4.compose(pos, q, one); };

  // pools: droplets (one instanced mesh), clothes (one instanced mesh per type)
  const DROPS = 220, drops = Array.from({ length: DROPS }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
  const dropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.8, depthWrite: false }), DROPS);
  dropMesh.frustumCulled = false; dropMesh.visible = false; parent.add(dropMesh);
  const fountains = [];   // { x, y, z, left, acc }
  const CLOTH_N = 30, cloths = Array.from({ length: CLOTH_N * CLOTH_TYPES.length }, (_, n) => ({ on: false, rest: true, type: CLOTH_TYPES[Math.floor(n / CLOTH_N)], slot: n % CLOTH_N, owner: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, t: 0, phase: 0, color: 0xffffff }));
  const clothMesh = {};
  const flat = (w, d) => { const g = new THREE.BoxGeometry(w, 0.03, d); return g; };
  const part = (g, x, z, ry = 0) => { g.rotateY(ry); g.translate(x, 0, z); return g; };
  const merge = (gs) => { const out = new THREE.BufferGeometry(); const pos = [], idx = []; let off = 0; for (const g of gs) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); for (const i of g.index.array) idx.push(i + off); off += p.count; } out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); out.computeVertexNormals(); return out; };
  const clothGeo = {
    sock: merge([part(flat(0.1, 0.3), 0, 0), part(flat(0.18, 0.1), 0.05, 0.15)]),
    tshirt: merge([part(flat(0.34, 0.4), 0, 0), part(flat(0.16, 0.12), -0.24, -0.12, 0.5), part(flat(0.16, 0.12), 0.24, -0.12, -0.5)]),
    trousers: merge([part(flat(0.32, 0.12), 0, -0.2), part(flat(0.14, 0.5), -0.09, 0.1), part(flat(0.14, 0.5), 0.09, 0.1)]),
  };
  for (const t of CLOTH_TYPES) { const m = new THREE.InstancedMesh(clothGeo[t], new THREE.MeshLambertMaterial({ color: 0xffffff }), CLOTH_N); m.frustumCulled = false; for (let i = 0; i < CLOTH_N; i++) { m.setMatrixAt(i, hiddenM); m.setColorAt(i, new THREE.Color(0xffffff)); } m.visible = false; parent.add(m); clothMesh[t] = m; }
  const col = new THREE.Color();

  function setCloth(c) {
    const m = clothMesh[c.type]; e.set(c.rx, c.ry, c.rz); q.setFromEuler(e); pos.set(c.x, c.y, c.z); m.setMatrixAt(c.slot, m4.compose(pos, q, one)); m.instanceMatrix.needsUpdate = true;
  }
  function hideCloth(c) { c.on = false; c.owner = null; const m = clothMesh[c.type]; m.setMatrixAt(c.slot, hiddenM); m.instanceMatrix.needsUpdate = true; }
  function throwClothes(x, y, z, owner) {
    for (let n = 0; n < CLOTH_PER_CONTAINER; n++) {
      const type = CLOTH_TYPES[n % CLOTH_TYPES.length];
      let c = cloths.find(k => k.type === type && !k.on) || cloths.filter(k => k.type === type).sort((a, b) => b.t - a.t)[0];   // none free: recycle the oldest
      newCloth(c, x, y, z, type, rng); c.owner = owner; col.setHex(c.color); clothMesh[type].setColorAt(c.slot, col); clothMesh[type].instanceColor.needsUpdate = true; clothMesh[type].visible = true;
    }
  }

  function startFountain(x, y, z) {
    const s = fountainSeconds(rng); fountains.push({ x, y, z, left: s, acc: 0 }); if (fountains.length > 3) fountains.shift();
    hiss(s); dropMesh.visible = true;
  }

  function knock(a, action, speed) {
    const k = KINDS[a.kind], gy = terrainH(a.p.x, a.p.z), c = car(), vel = Math.hypot(c.vx, c.vz);
    a.age = 0; state.count++; state.started++;
    if (action === 'bend') {
      const n = vel || 1; a.hit = { bend: true, dx: c.vx / n, dz: c.vz / n, t: 0, done: false };
      if (a.p.obb) a.p.obb.off = true;
      play('lamp', soundLevel(speed));
    } else {
      a.hit = launch(a.kind, a.p.x, gy, a.p.z, -a.p.rot, c, rng); a.hit.long = k.long;
      if (a.p.obb) a.p.obb.off = true;
      play(k.sound, soundLevel(speed));
      if (a.kind === 'hydrant') startFountain(a.p.x, gy + 0.5, a.p.z);
      if (a.kind === 'clothes_container') throwClothes(a.p.x, gy + k.h * 0.7, a.p.z, a);
    }
    active.push(a); onCount(state.count);
    return k.slow;
  }

  function writeBody(a) {
    const b = a.hit, k = KINDS[a.kind];
    pivotOf(b, k.h, piv); e.set(b.rx, b.ry, b.rz); q.setFromEuler(e); pos.set(piv[0], piv[1], piv[2]); setM(a, m4.compose(pos, q, one));
  }
  function writeBend(a) {
    const b = a.hit; axis.set(b.dz, 0, -b.dx); q2.setFromAxisAngle(axis, bendAngle(b.t)); q.setFromAxisAngle(upV, -a.p.rot); q2.multiply(q); pos.set(a.p.x, terrainH(a.p.x, a.p.z), a.p.z); setM(a, m4.compose(pos, q2, one));
  }

  function restore(a) {
    a.hit = null; setM(a, standM(a)); if (a.p.obb) a.p.obb.off = false;
    for (const c of cloths) if (c.owner === a) hideCloth(c);
  }

  return {
    // called from stepCar before the collision step (hit test only): returns the share of the car's speed lost
    step() {
      const c = car(); let slow = 0;
      if (c) {
        const speed = Math.hypot(c.vx, c.vz);
        if (speed >= KNOCK_MIN) {
          nearProps(grid, c.x, c.z, nearBuf);
          for (let n = 0; n < nearBuf.length; n++) {
            const a = all[nearBuf[n]]; if (a.hit) continue;
            if (!touches(a.kind, a.p.x, a.p.z, terrainH(a.p.x, a.p.z), c)) continue;
            const act = knockAction(a.kind, speed); if (act) slow = Math.max(slow, knock(a, act, speed));
          }
        }
      }
      return slow;
    },
    animate(dt) {
      const cc = car(), cx = cc ? cc.x : 1e9, cz = cc ? cc.z : 1e9;
      for (let n = active.length - 1; n >= 0; n--) {
        const a = active[n], b = a.hit; if (!b) { active.splice(n, 1); continue; }
        a.age += dt;
        if (b.bend) { if (!b.done) { b.t += dt; writeBend(a); if (b.t > 1.1) b.done = true; } }
        else if (!b.rest) { if (stepBody(b, dt, terrainH(b.x, b.z))) play(KINDS[a.kind].sound === 'glass' ? 'clatter' : KINDS[a.kind].sound === 'clothes' ? 'clothes' : 'wood', soundLevel(Math.min(10, -b.vy)) * 0.5); writeBody(a); }
        if (restoreDue(a.age, Math.hypot(a.p.x - cx, a.p.z - cz))) { restore(a); active.splice(n, 1); }
      }
      this.fountainsAndCloth(dt);
    },
    fountainsAndCloth(dt) {
      let live = false;
      for (let n = fountains.length - 1; n >= 0; n--) { const f = fountains[n]; f.left -= dt; if (f.left <= 0) { fountains.splice(n, 1); continue; } f.acc += dt * 60; while (f.acc >= 1) { f.acc -= 1; const d = drops.find(x => !x.on); if (d) newDrop(d, f.x, f.y, f.z, rng); } }
      for (let i = 0; i < DROPS; i++) { const d = drops[i]; if (d.on) { stepDrop(d, dt, terrainH(d.x, d.z)); live = true; } pos.set(d.x, d.y, d.z); m4.compose(pos, q.identity(), d.on ? one : zero); dropMesh.setMatrixAt(i, m4); }
      if (live || fountains.length) dropMesh.instanceMatrix.needsUpdate = true; else if (dropMesh.visible) { dropMesh.visible = false; }
      for (const c of cloths) { if (!c.on || c.rest) continue; stepCloth(c, dt, terrainH(c.x, c.z)); setCloth(c); }
    },
    restoreAll() {
      for (const a of active) restore(a); active.length = 0;
      fountains.length = 0; for (const d of drops) d.on = false;
      for (const c of cloths) if (c.on) hideCloth(c);
      dropMesh.visible = false;
    },
    resetCount() { state.count = 0; onCount(0); },
    debug() { return { count: state.count, started: state.started, loose: active.length, resting: active.filter(a => a.hit && (a.hit.rest || a.hit.done)).length, bent: active.filter(a => a.hit && a.hit.bend).length, fountains: fountains.length, drops: drops.filter(d => d.on).length, cloths: cloths.filter(c => c.on).length, kinds: active.map(a => a.kind) }; },
    // for tests: the knocked prop's index in its group list, or -1
    knocked(kind) { return active.filter(a => a.kind === kind).map(a => a.i); },
    all() { return all; },
  };
}
