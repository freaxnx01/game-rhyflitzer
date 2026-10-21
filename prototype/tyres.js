// #416: tyre stacks that collapse with real physics (crashcat, vendored under vendor/crashcat/).
// Layers: the pure helpers (layout, fixed timestep, car box) and the physics core (createTyrePhysics, engine injected, no THREE) are unit-tested
// in node; createTyreStacks adds the meshes and loads the engine lazily, so nothing is fetched unless a stack is placed.
export const TYRE = { r: 0.3, w: 0.25, hole: 0.16, mass: 9, friction: 0.85, restitution: 0.12, linearDamping: 0.35, angularDamping: 1.6 };
export const STACK_GAP = 0.004;          // m between stacked tyres at build time, so nothing starts in penetration
export const PHYS = { dt: 1 / 60, maxSteps: 4, near: 22, carMass: 2500, slowCap: 0.05, impactMin: 1.4, carLift: 0.2, calmAfter: 14, fellBelow: 2 };   // calmAfter: s awake with no car near before the stragglers are put to sleep; fellBelow: m under the ground = lost, frozen
export const SOLVER = { velocityIterations: 20, positionIterations: 4, penetrationSlop: 0.02, baumgarteFactor: 0.2, convexRadius: 0.05, timeBeforeSleep: 0.5, pointVelocitySleepThreshold: 0.03 };
export const HITS = { gap: 0.06 };       // s between two onImpact calls

// stacks side by side along a row: `heights` tyres per stack, centred on (x, z), the row running along `yaw` (rad, x towards z)
export function rowPlacements(x, z, yaw, heights, spacing = TYRE.r * 2 + 0.12) {
  const c = Math.cos(yaw), s = Math.sin(yaw), out = [];
  heights.forEach((n, i) => { const o = (i - (heights.length - 1) / 2) * spacing; out.push({ x: x + c * o, z: z + s * o, n }); });
  return out;
}

// a stepped pyramid: 8 6 5 / 7 5 -- two rows of stacks, the back row shifted half a spacing; rows run across the car's heading `th`
export function pyramidPlacements(x, z, th, spacing = TYRE.r * 2 + 0.12) {
  const side = th + Math.PI / 2, fx = Math.cos(th), fz = Math.sin(th), a = rowPlacements(x, z, side, [8, 6, 5, 6, 8], spacing);
  const b = rowPlacements(x + fx * spacing * 0.9, z + fz * spacing * 0.9, side, [5, 7, 7, 5], spacing);
  return a.concat(b);
}

// the tyres of one set of placements, bottom to top; n is clamped to 1..12
export function tyreSlots(placements, groundY) {
  const out = [];
  placements.forEach((p, stack) => {
    const n = Math.max(1, Math.min(12, Math.round(p.n)));
    for (let i = 0; i < n; i++) out.push({ x: p.x, y: groundY + TYRE.w / 2 + STACK_GAP + i * (TYRE.w + STACK_GAP), z: p.z, stack, level: i });
  });
  return out;
}

// fixed timestep: how many steps of `step` fit into acc + dt (at most `max`; the rest of a long frame is dropped, not carried)
export function fixedSteps(acc, dt, step, max) {
  const total = acc + Math.min(dt, step * max);
  const n = Math.min(max, Math.floor(total / step + 1e-9));
  return { n, acc: Math.max(0, total - n * step) };
}

// the car as a box for the physics: the heading th turns +x towards +z (as in index.html), the box stands carLift above the road
export function carBox(c, out = { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, q: [0, 0, 0, 1] }) {
  const lift = PHYS.carLift, hy = Math.max(0.2, (c.h - lift) / 2), half = -c.th / 2;
  out.x = c.x; out.y = c.y + lift + hy; out.z = c.z; out.hx = c.l / 2; out.hy = hy; out.hz = c.w / 2;
  out.q[0] = 0; out.q[1] = Math.sin(half); out.q[2] = 0; out.q[3] = Math.cos(half);
  return out;
}

// how much of the car's speed the tyres took this frame: the momentum they gained along the car's travel over the car's mass, capped
export function slowdown(gainedMomentum, speed) {
  if (!(speed > 0.5) || !(gainedMomentum > 0)) return 0;
  return Math.min(PHYS.slowCap, gainedMomentum / PHYS.carMass / speed);
}

// ---------- physics core: the engine module C is injected (the vendored crashcat bundle), so node can drive it too ----------
export function createTyrePhysics(C, placements, groundY, size = 60) {
  C.registerShapes([C.cylinder.def, C.box.def]);
  const ws = C.createWorldSettings();
  const MOVING = C.addBroadphaseLayer(ws), STILL = C.addBroadphaseLayer(ws);
  const L_MOVING = C.addObjectLayer(ws, MOVING), L_STILL = C.addObjectLayer(ws, STILL);
  C.enableCollision(ws, L_MOVING, L_STILL); C.enableCollision(ws, L_MOVING, L_MOVING);
  ws.gravity = [0, -9.81, 0];
  Object.assign(ws.solver, { velocityIterations: SOLVER.velocityIterations, positionIterations: SOLVER.positionIterations, penetrationSlop: SOLVER.penetrationSlop, baumgarteFactor: SOLVER.baumgarteFactor });
  Object.assign(ws.sleeping, { timeBeforeSleep: SOLVER.timeBeforeSleep, pointVelocitySleepThreshold: SOLVER.pointVelocitySleepThreshold });
  const world = C.createWorld(ws), slots = tyreSlots(placements, groundY), n = slots.length, ids = new Array(n);
  const tyreShape = C.cylinder.create({ halfHeight: TYRE.w / 2, radius: TYRE.r, convexRadius: SOLVER.convexRadius, density: TYRE.mass / (Math.PI * TYRE.r * TYRE.r * TYRE.w) });
  const home = { x: 0, z: 0 };
  for (const p of placements) { home.x += p.x / placements.length; home.z += p.z / placements.length; }
  C.rigidBody.create(world, { motionType: C.MotionType.STATIC, shape: C.box.create({ halfExtents: [size, 1, size] }), objectLayer: L_STILL, position: [home.x, groundY - 1, home.z], friction: 0.9 });
  let car = null; const box = carBox({ x: 0, y: 0, z: 0, th: 0, l: 4, w: 1.8, h: 1.4 });
  const prevV = new Float32Array(n * 3), flags = { warm: false, awakeFor: 0 };

  function makeTyres() {
    for (let i = 0; i < n; i++) {
      const s = slots[i];
      ids[i] = C.rigidBody.create(world, { motionType: C.MotionType.DYNAMIC, shape: tyreShape, objectLayer: L_MOVING, position: [s.x, s.y, s.z], friction: TYRE.friction, restitution: TYRE.restitution, linearDamping: TYRE.linearDamping, angularDamping: TYRE.angularDamping }).id;
    }
  }
  function makeCar() {
    car = C.rigidBody.create(world, { motionType: C.MotionType.KINEMATIC, shape: C.box.create({ halfExtents: [1, 0.5, 0.5] }), objectLayer: L_MOVING, position: [0, -50, 0], allowSleeping: false }).id;
  }
  const body = (i) => C.rigidBody.get(world, ids[i]);
  const carBody = () => C.rigidBody.get(world, car);

  // the stacks start asleep, exactly where they were built: perfectly aligned cylinders would creep a few cm while settling
  // (the solver's contact points swim on round faces), and a stack that is never hit should never move at all
  function sleepAll() {
    for (let i = 0; i < n; i++) { const b = body(i); C.rigidBody.sleep(world, b); const v = b.motionProperties.linearVelocity; prevV[i * 3] = v[0]; prevV[i * 3 + 1] = v[1]; prevV[i * 3 + 2] = v[2]; }
    flags.warm = true;
  }
  function asleep() { let k = 0; for (let i = 0; i < n; i++) if (body(i).sleeping) k++; return k; }

  makeTyres(); makeCar(); sleepAll();
  const sizeCar = { size: null };

  // dims for the kinematic box change per vehicle: rebuild the shape only when they do
  function fitCar(b) {
    const s = sizeCar.size;
    if (s && s.hx === b.hx && s.hy === b.hy && s.hz === b.hz) return;
    sizeCar.size = { hx: b.hx, hy: b.hy, hz: b.hz };
    C.rigidBody.remove(world, carBody());
    car = C.rigidBody.create(world, { motionType: C.MotionType.KINEMATIC, shape: C.box.create({ halfExtents: [b.hx, b.hy, b.hz] }), objectLayer: L_MOVING, position: [0, -50, 0], allowSleeping: false }).id;
  }
  const anyAwake = () => asleep() < n;
  function near(c) { for (let i = 0; i < placements.length; i++) { if (Math.abs(placements[i].x - c.x) < PHYS.near && Math.abs(placements[i].z - c.z) < PHYS.near) return true; } return false; }
  const hit = { slow: 0, impact: 0 };

  // one frame: sync the car (box + velocity), run the fixed steps, measure what the tyres took and the hardest knock
  const acc = { v: 0 }, fwd = [0, 0];
  function step(dt, c) {
    hit.slow = 0; hit.impact = 0;
    const active = anyAwake(), close = c && near(c);
    if (!active && !close) { acc.v = 0; return hit; }
    if (close) { carBox(c, box); fitCar(box); const b = carBody(); C.rigidBody.setTransform(world, b, [box.x, box.y, box.z], box.q, false); C.rigidBody.setLinearVelocity(world, b, [c.vx, 0, c.vz]); }
    else if (car !== null) { const b = carBody(); C.rigidBody.setLinearVelocity(world, b, [0, 0, 0]); C.rigidBody.setTransform(world, b, [0, -50, 0], [0, 0, 0, 1], false); }
    const sp = close ? Math.hypot(c.vx, c.vz) : 0; fwd[0] = sp > 0.1 ? c.vx / sp : 0; fwd[1] = sp > 0.1 ? c.vz / sp : 0;
    const f = fixedSteps(acc.v, dt, PHYS.dt, PHYS.maxSteps); acc.v = f.acc;
    let gained = 0;
    for (let k = 0; k < f.n; k++) {
      C.updateWorld(world, undefined, PHYS.dt);
      for (let i = 0; i < n; i++) {
        const b = body(i); if (b.sleeping) continue;
        const v = b.motionProperties.linearVelocity, j = i * 3, dx = v[0] - prevV[j], dy = v[1] - prevV[j + 1], dz = v[2] - prevV[j + 2];
        prevV[j] = v[0]; prevV[j + 1] = v[1]; prevV[j + 2] = v[2];
        const d = Math.hypot(dx, dy, dz); if (d > hit.impact) hit.impact = d;
        const along = dx * fwd[0] + dz * fwd[1]; if (along > 0) gained += along * TYRE.mass;
      }
    }
    calm(dt, close);
    if (hit.impact < PHYS.impactMin) hit.impact = 0;
    hit.slow = slowdown(gained, sp);
    return hit;
  }

  // a tyre that fell off the yard is frozen; once the car has left and everything has rolled for calmAfter seconds, what still creeps goes to sleep
  function calm(dt, close) {
    flags.awakeFor = close ? 0 : flags.awakeFor + dt;
    const all = flags.awakeFor > PHYS.calmAfter;
    for (let i = 0; i < n; i++) {
      const b = body(i); if (b.sleeping) continue;
      const v = b.motionProperties.linearVelocity;
      if (b.position[1] < groundY - PHYS.fellBelow || all && Math.hypot(v[0], v[1], v[2]) < 2) C.rigidBody.sleep(world, b);
    }
  }

  function reset() {
    for (let i = 0; i < n; i++) C.rigidBody.remove(world, body(i));
    makeTyres(); sleepAll(); flags.awakeFor = 0;
  }

  function pose(i, outPos, outQuat) { const b = body(i); outPos[0] = b.position[0]; outPos[1] = b.position[1]; outPos[2] = b.position[2]; outQuat[0] = b.quaternion[0]; outQuat[1] = b.quaternion[1]; outQuat[2] = b.quaternion[2]; outQuat[3] = b.quaternion[3]; return !b.sleeping; }
  const poseSleeping = (i) => body(i).sleeping;

  // for tests: how many tyres are awake / asleep / moved off their slot / lying on the side / more than 0.3 m away, and the fastest one
  function state() {
    let awake = 0, displaced = 0, upright = 0, far = 0, fastest = 0;
    for (let i = 0; i < n; i++) {
      const b = body(i), s = slots[i], q = b.quaternion;
      const up = 1 - 2 * (q[0] * q[0] + q[2] * q[2]);            // y axis of the tyre dotted with world up
      if (!b.sleeping) awake++;
      if (up > 0.97) upright++;
      const off = Math.hypot(b.position[0] - s.x, b.position[1] - s.y, b.position[2] - s.z); if (off > 0.05) displaced++; if (off > 0.3) far++;
      const v = b.motionProperties.linearVelocity, sp = Math.hypot(v[0], v[1], v[2]); if (sp > fastest) fastest = sp;
    }
    return { count: n, awake, asleep: n - awake, displaced, far, upright, fastest, settled: flags.warm };
  }

  return { count: n, slots, step, reset, pose, poseSleeping, state, asleep, world };
}

// ---------- the look: low-poly tyres painted red and white like a track barrier, black rubber in the grooves and the hole, a grey rim ----------
// #416: two paints, a little weathered: the hydrant's red from index.html toned down, and a warm off-white. Alternating per tyre up a stack,
// offset between neighbouring stacks, so a pyramid reads as a checker
export const PAINT = { red: [0.78, 0.18, 0.14], white: [0.95, 0.92, 0.85] };
export const RUBBER = 0.07, RIM = 0.52;
export const TREAD = { grooves: 2, width: 0.024, depth: 0.014, segments: 16 };

// which paint a tyre gets: red on even levels of even stacks, white next to it, both ways
export function paintFor(slot) { return (slot.level + slot.stack) % 2 === 0 ? 'red' : 'white'; }

// [radius, y, shade, painted]: shade is the vertex grey (rubber, rim or 1 under paint), painted 1 where the instance colour applies
// (tread ribs and both sidewalls), 0 in the grooves and the hole. Hard edges by doubled points. Written top down from the rim and
// reversed at the end: the lathe winds its faces outward only when the outside is traversed bottom to top
export function tyreProfile() {
  const { r, w, hole } = TYRE, h = w / 2, rim = hole - 0.01, bevel = 0.04, { grooves, width, depth } = TREAD;
  const out = [[rim, -h + 0.02, RIM, 0], [rim, h - 0.02, RIM, 0], [hole, h, 1, 1], [r - bevel, h, 1, 1], [r, h - bevel, 1, 1]];
  for (let g = 1; g <= grooves; g++) {
    const y = h - bevel - (h * 2 - bevel * 2) * g / (grooves + 1);
    out.push([r, y + width / 2, 1, 1], [r - depth, y + width / 2, RUBBER, 0], [r - depth, y - width / 2, RUBBER, 0], [r, y - width / 2, 1, 1]);
  }
  out.push([r, -h + bevel, 1, 1], [r - bevel, -h, 1, 1], [hole, -h, 1, 1], [rim, -h + 0.02, RIM, 0]);
  return out.reverse();
}

// triangles of one tyre: a lathe makes two per profile span and segment
export function tyreTriangles(segments = TREAD.segments) { return (tyreProfile().length - 1) * segments * 2; }

// the vertex colours and the paint mask of a lathe over `profile` with `count` vertices (the lathe repeats the profile per segment)
export function tyreVertexColours(profile, count) {
  const colour = new Float32Array(count * 3), paint = new Float32Array(count);
  for (let i = 0; i < count; i++) { const p = profile[i % profile.length]; colour[i * 3] = colour[i * 3 + 1] = colour[i * 3 + 2] = p[2]; paint[i] = p[3]; }
  return { colour, paint };
}

export function buildTyreGeometry(THREE, segments = TREAD.segments) {
  const prof = tyreProfile(), g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), segments), v = tyreVertexColours(prof, g.attributes.position.count);
  g.setAttribute('color', new THREE.BufferAttribute(v.colour, 3));
  g.setAttribute('paint', new THREE.BufferAttribute(v.paint, 1));
  return g;
}

// Lambert, flat shaded, vertex colours; the instance colour (the paint) only multiplies where the `paint` attribute is 1, so the
// hole and the grooves keep their rubber and rim greys under both paints
export function buildTyreMaterial(THREE) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paint;')
      .replace('#include <color_vertex>', 'vColor = color;\n#ifdef USE_INSTANCING_COLOR\n\tvColor *= mix(vec3(1.0), instanceColor.xyz, paint);\n#endif');
  };
  return m;
}

const ENGINE_URL = '../vendor/crashcat/crashcat.min.js';

// opts: { engine: () => Promise<module> (tests), onImpact(speedChange), size }; placements: [{x, z, n}]; groundHeightFn(x, z) -> y
export function createTyreStacks(scene, THREE, placements, groundHeightFn, opts = {}) {
  const group = new THREE.Group(), cx = placements.reduce((s, p) => s + p.x, 0) / placements.length, cz = placements.reduce((s, p) => s + p.z, 0) / placements.length;
  const groundY = groundHeightFn(cx, cz), slots = tyreSlots(placements, groundY);
  const mesh = new THREE.InstancedMesh(buildTyreGeometry(THREE), buildTyreMaterial(THREE), slots.length), tint = new THREE.Color();
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh); scene.add(group);
  slots.forEach((s, i) => mesh.setColorAt(i, tint.setRGB(...PAINT[paintFor(s)])));   // the paint never changes, so it is uploaded once
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = [0, 0, 0], quat = [0, 0, 0, 1];
  const S = { phys: null, failed: false, loading: true, since: 0, steps: 0, lastHit: -1, disposed: false };

  function upload(all) {
    for (let i = 0; i < slots.length; i++) {
      if (S.phys && !all && S.phys.poseSleeping(i)) continue;
      if (S.phys) S.phys.pose(i, pos, quat); else { pos[0] = slots[i].x; pos[1] = slots[i].y; pos[2] = slots[i].z; quat[0] = quat[1] = quat[2] = 0; quat[3] = 1; }
      p.set(pos[0], pos[1], pos[2]); q.set(quat[0], quat[1], quat[2], quat[3]); m.compose(p, q, one); mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  upload(true);

  const load = opts.engine || (() => import(ENGINE_URL));
  const ready = Promise.resolve().then(load).then((C) => {
    if (S.disposed) return;
    S.phys = createTyrePhysics(C, placements, groundY, opts.size);
    upload(true);
  }).catch((e) => { S.failed = true; console.warn('Tyre physics unavailable, the stacks stand still:', e && e.message); }).finally(() => { S.loading = false; });

  // car: { x, y, z, th, vx, vz, l, w, h }; returns the fraction of speed the tyres took (0 .. slowCap), 0 while the engine is not there
  function step(dt, car) {
    if (!S.phys) return 0;
    try {
      const r = S.phys.step(dt, car); S.steps++;
      upload(false);
      if (r.impact > 0 && opts.onImpact) { S.since += dt; if (S.since >= HITS.gap) { S.since = 0; opts.onImpact(r.impact); } } else S.since += dt;
      return r.slow;
    } catch (e) { S.phys = null; S.failed = true; console.warn('Tyre physics stopped, the stacks stand still:', e && e.message); return 0; }
  }
  function reset() { if (S.phys) { try { S.phys.reset(); } catch (e) { S.phys = null; S.failed = true; } } upload(true); }
  function dispose() { S.disposed = true; S.phys = null; scene.remove(group); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
  function state() {
    const base = S.phys ? S.phys.state() : { count: slots.length, awake: 0, asleep: slots.length, displaced: 0, far: 0, upright: slots.length, fastest: 0, settled: false };
    return { ...base, engine: S.phys ? 'ready' : S.failed ? 'failed' : 'loading', steps: S.steps, groundY };
  }
  return { group, mesh, ready, step, reset, dispose, state, slots };
}
