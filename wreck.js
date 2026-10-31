// #105: wreck rules -- pure, no three.js, no DOM. Unit-tested with `node --test tests/*.test.mjs`.
// Units m, m/s, s. Same frame as the car: x east, z south, th = heading (0 = +x); a model's x is forward, its z is to the right.

export const WRECK = {
  perHit: 0.3,       // damage of a full-strength hit (impactStrength = 1, from 25 m/s) on a mass-1 vehicle
  landMin: 9,        // m/s of fall a landing survives for free (as before #105)
  delay: 3,          // s from the wreck to the new car
  coast: 2.5,        // 1/s extra drag on a wreck: from 15 m/s it is down to 2 m/s after about 1 s
  gravity: 22,       // same as the car
  bounce: 0.4,       // a wheel keeps 40 % of its fall speed on a bounce
  friction: 1.2,     // 1/s horizontal drag of a wheel on the ground
  restSpeed: 0.3,    // m/s: below this a wheel on the ground lies still
  smokeRate: 10,     // puffs per second
  smokeLife: 2.4,    // s a puff lives
  smokeMax: 24,      // puffs alive at once = the sprite pool
  smokeRise: 1.6,    // m/s a puff rises
};

// damage of one hit from its impactStrength s (0..1, impact.js -- the one definition shared with the crash sound #104):
// nothing for s = 0 (a scrape or a bump under 3 m/s), linear above, softened by mass (#6)
export function impactDamage(s, mass = 1, cfg = WRECK) {
  return s * cfg.perHit / mass;
}

// a landing hurts when the fall (vy < 0) is faster than landMin; the strength is impactStrength(-vy)
export function landingHurts(vy, cfg = WRECK) {
  return vy < -cfg.landMin;
}

export const isWrecked = (dmg) => dmg >= 1;

// the countdown to the new car; t = seconds since the wreck
export function wreckTick(t, dt, cfg = WRECK) {
  const next = t + dt;
  return { t: next, respawn: next >= cfg.delay };
}

// the wheels leave the car: wheels = [{ lx, lz, r }] (model metres, lz > 0 = right side), car = { x, y, z, th, vx, vz, scale }
// → one debris state per wheel: world position, velocity (car's own + outward + up), world radius, spin angle, still
export function detachWheels(wheels, car) {
  const fx = Math.cos(car.th), fz = Math.sin(car.th), rx = -fz, rz = fx;
  return wheels.map((w, i) => {
    const side = Math.sign(w.lz) || 1, along = w.lx >= 0 ? 1 : -1, out = 2.5 + 0.8 * (i % 3);
    return {
      x: car.x + car.scale * (w.lx * fx + w.lz * rx),
      y: car.y + car.scale * w.r,
      z: car.z + car.scale * (w.lx * fz + w.lz * rz),
      vx: car.vx + rx * side * out + fx * along,
      vy: 4 + 1.5 * (i % 3),
      vz: car.vz + rz * side * out + fz * along,
      r: car.scale * w.r,
      spin: 0,
      still: false,
    };
  });
}

// one fixed step of a loose wheel over ground height groundY: gravity, bounce, rolling friction; lies still once slow on the ground
export function stepDebris(d, dt, groundY, cfg = WRECK) {
  if (d.still) return d;
  let { x, y, z, vx, vy, vz } = d;
  vy -= cfg.gravity * dt;
  x += vx * dt; y += vy * dt; z += vz * dt;
  const onGround = y <= groundY + d.r;
  if (onGround) {
    y = groundY + d.r;
    vy = vy < -1.5 ? -vy * cfg.bounce : 0;
    const drag = Math.exp(-cfg.friction * dt);
    vx *= drag; vz *= drag;
  }
  const speed = Math.hypot(vx, vz);
  return { ...d, x, y, z, vx, vy, vz, spin: d.spin + speed / d.r * dt, still: onGround && vy === 0 && speed < cfg.restSpeed };
}

// a smoke puff of the given age (s): size in metres, opacity 0..1 (fades in over 0.25 s, then out), height gained; null once it is gone
export function smokeAt(age, cfg = WRECK) {
  if (age < 0 || age >= cfg.smokeLife) return null;
  const t = age / cfg.smokeLife;
  return { size: 1 + 3 * t, opacity: Math.min(1, age / 0.25) * 0.6 * (1 - t), rise: cfg.smokeRise * age };
}

// how many puffs to emit this step; acc carries the fraction to the next step
export function smokeEmit(acc, dt, cfg = WRECK) {
  const total = acc + dt * cfg.smokeRate;
  const n = Math.floor(total);
  return { n, acc: total - n };
}
