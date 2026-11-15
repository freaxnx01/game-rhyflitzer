// netbump.js — #836: car-to-car contact in a shared drive. Pure: no DOM, no three.js. Each device moves only its own car.
import { capsuleOffsets, capsuleCircles } from './bus.js';

export const RESTITUTION = 0.3;     // e of the epic formula
export const BUMP_COOLDOWN = 0.3;   // s per remote player
export const BUMP_DY = 2.5;         // m: further above/below (bridge, jump) is no contact
export const MAX_CLOSING = 240;     // m/s: two cars at top nitro speed head-on; caps an implausible peer-reported vx/vz (#836)

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
  const k = closing * (1 + e) * bumpShare(own.m, other.m);
  return { dvx: n.nx * k, dvz: n.nz * k, closing };
}

// true at most once per BUMP_COOLDOWN s per player; records the time (like impact.js crashGate)
export function bumpGate(gate, id, now) {
  const last = gate.get(id);
  if (last !== undefined && now - last < BUMP_COOLDOWN) return false;
  gate.set(id, now);
  return true;
}
