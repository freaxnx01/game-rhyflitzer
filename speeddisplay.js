// #745: the smiley speed display at the Sisseln village entrance -- where it stands, which cars it measures and what
// it shows. Pure: no DOM, no three.js. Coordinates from data/world_hochrhein.json (spec 2026-11-08-sisseln-speed-display).
const APPROACH = [0.99862, -0.05256],   // from the world file: the straight from the Smile-Kreisel, renormalised below
  ALEN = Math.hypot(...APPROACH);
export const SPEED_DISPLAY = {
  x: 1465.45, z: -158.27,            // foot: right of the Hauptstrasse at the middle of the bend, 1.2 m off the asphalt
  approach: [APPROACH[0] / ALEN, APPROACH[1] / ALEN],   // unit direction of the measured traffic
  limit: 50,                         // km/h: at or under -> happy
  range: 120, lateral: 10,           // m: lights up this far before the sign, within this much of the approach axis
  minKmh: 3,                         // km/h: dark for a standing car
  delay: 2,                          // s: the panel shows the reading from this long ago, so passing it you see your earlier speed
  panel: { w: 0.8, h: 1.2, y: 2.2 }, // m: housing size and centre height
  tex: { w: 256, h: 384 },           // px: the LED face canvas
};

// the sign group's rotation.y: local +z (the LED face) points against the approach, at the oncoming cars
export const faceYaw = (cfg = SPEED_DISPLAY) => Math.atan2(-cfg.approach[0], -cfg.approach[1]);

export function displayState(car, cfg = SPEED_DISPLAY) {
  if (!car.ground) return { on: false };
  const [ux, uz] = cfg.approach, dx = cfg.x - car.x, dz = cfg.z - car.z;
  const ahead = dx * ux + dz * uz;                     // m still to drive to the sign
  if (ahead <= 0 || ahead > cfg.range) return { on: false };
  const lat = (car.x - cfg.x) * -uz + (car.z - cfg.z) * ux;   // (car - sign) . n, n = (-uz, ux)
  if (Math.abs(lat) > cfg.lateral) return { on: false };
  if (car.vx * ux + car.vz * uz <= 0) return { on: false }; // not closing
  const kmh = Math.round(Math.hypot(car.vx, car.vz) * 3.6);
  if (kmh < cfg.minKmh) return { on: false };
  return { on: true, kmh, happy: kmh <= cfg.limit };
}

export const displayKey = (s) => s.on ? `${s.kmh}:${s.happy ? 'h' : 's'}` : 'off';

export const panelColors = (s) => ({ digits: '#ffb000', face: s.happy ? '#39d353' : '#ff3b30' });

// the panel's lag: record() every frame on the game clock, shown() the newest reading at least `delay` seconds old
// (dark until there is one). After passing, the last on-reading stays up for `delay` seconds, then goes dark.
export function delayedReading(delay = SPEED_DISPLAY.delay) {
  const q = [];
  return {
    record(t, state) { q.push({ t, state }); while (q.length > 1 && q[1].t <= t - delay) q.shift(); },
    shown(t) { return q.length && q[0].t <= t - delay ? q[0].state : { on: false }; },
  };
}
