// netbump.js — #836: car-to-car contact in a shared drive. Pure: no DOM, no three.js. Each device moves only its own car.
import { capsuleOffsets, capsuleCircles } from './bus.js';

export const RESTITUTION = 0.3;     // e of the epic formula
export const BUMP_COOLDOWN = 0.3;   // s per remote player
export const BUMP_DY = 2.5;         // m: further above/below (bridge, jump) is no contact
export const MAX_CLOSING = 240;     // m/s: two cars at top nitro speed head-on; caps an implausible peer-reported vx/vz (#836)
export const HIT_WINDOW = 300;      // ms: a sent hit rides on every pose for this long, so one lost packet does not lose it
export const HIT_REACH = 10;        // m: a hit from a car drawn further away than this is ignored

// the collision circles the walls already use, in world metres
export function carShape(x, z, th, collision, scale) {
  const offsets = capsuleOffsets(collision).map((d) => d * scale);
  return { circles: capsuleCircles(x, z, th, offsets), r: collision.r * scale };
}

// carContact(own, other) — the deepest circle-pair overlap, normal from other to own, or null
export function carContact(own, other) {
  let best = null;
  for (const [ax, az] of own.circles) for (const [bx, bz] of other.circles) {
    const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), pen = own.r + other.r - d;
    if (pen <= 0 || (best && pen <= best.pen)) continue;
    best = d < 1e-6 ? { nx: 1, nz: 0, pen } : { nx: dx / d, nz: dz / d, pen };
  }
  return best;
}

export function bumpShare(mOwn, mOther) { return mOther / (mOwn + mOther); }

// the own car's Δv: n · max(0, −(v_own − v_other)·n) · (1 + e) · share
export function bumpImpulse(own, other, n, e = RESTITUTION) {
  const closing = Math.max(0, Math.min(MAX_CLOSING, -((own.vx - other.vx) * n.nx + (own.vz - other.vz) * n.nz)));
  if (!closing) return { dvx: 0, dvz: 0, closing: 0 };   // no -0 from n · 0
  const d = hitImpulse(closing, n, own.m, other.m, e);
  return { dvx: d.dvx, dvz: d.dvz, closing };
}

// hitImpulse(c, n, mOwn, mOther, e) — the Δv a relayed hit imposes on the own car, scaled by the own mass share
export function hitImpulse(c, n, mOwn, mOther, e = RESTITUTION) {
  const k = c * (1 + e) * bumpShare(mOwn, mOther);
  return { dvx: n.nx * k, dvz: n.nz * k };
}

// true at most once per BUMP_COOLDOWN s per player; records the time (like impact.js crashGate)
export function bumpGate(gate, id, now) {
  const last = gate.get(id);
  if (last !== undefined && now - last < BUMP_COOLDOWN) return false;
  gate.set(id, now);
  return true;
}

// acceptHit(seen, from, hit, gate, now) — true once per (from, hit.n), and only while the pair's cooldown is off
export function acceptHit(seen, from, hit, gate, now) {
  if (seen.get(from) === hit.n) return false;
  seen.set(from, hit.n);
  return bumpGate(gate, from, now);
}

// hitNormal(x, z, pose) — unit vector from the sender's drawn position to the own car; at the same spot, the
// sender's direction of travel; null when that is undefined or the sender is out of reach
export function hitNormal(x, z, pose) {
  const dx = x - pose.x, dz = z - pose.z, d = Math.hypot(dx, dz);
  if (d > HIT_REACH) return null;
  if (d > 1e-6) return { nx: dx / d, nz: dz / d };
  const v = Math.hypot(pose.vx, pose.vz);
  return v > 1e-6 ? { nx: pose.vx / v, nz: pose.vz / v } : null;
}
