// #473: the regional bus's pure data — size, livery, capsule collision, wall yaw. Pure module, node --test only.
// The Swiss regional bus in the Postauto look (a Setra S 415 UL as reference): Postauto yellow body, light roof,
// black window band, red stripe below it. Model metres: x forward, y up; the builder in index.html draws from these.

// the real S 415 UL numbers: 12.2 m over the bumpers, 2.55 m wide, 3.05 m to the roof (+ the AC unit),
// 6.08 m wheelbase with a 2.7 m front overhang (so 2.68 m at the rear), 0.5 m wheels
export const BUS = {
  length: 12.2, width: 2.55, height: 3.05,
  acHeight: 0.15,                  // the roof-top AC unit
  bandLow: 1.55, bandHigh: 2.75,   // the black window band (y, model metres)
  stripe: 0.06,                    // the red stripe directly below the band
  frontOverhang: 2.7, wheelbase: 6.08,
};

// the livery, tuned by eye to the maintainer's photo; the LED display is a lit texture, not a lamp
export const BUS_COLOURS = {
  body: 0xf5c000, roof: 0xe6e8e8, band: 0x111418, stripe: 0xd6202a, led: 0xff9a1a,
};

// the horn: a deep G major chord (G3, B3, D4 — no C#/E/A in any octave, unlike the Postauto three-tone horn)
export const BUS_HORN = { notes: [196, 247, 294], dur: 1.0, gain: 0.22, band: 700, wave: 'sawtooth' };

// ---------- capsule collision (#473): circles of radius r along the car's long axis ----------
// a circle vehicle is one centre; a capsule spans -hl..+hl with spacing <= r, so no gap lets a wall slip between circles
export function capsuleOffsets(collision) {
  const { r, hl } = collision;
  if (collision.shape === 'circle') return [0];
  const n = Math.ceil(2 * hl / r) + 1, step = 2 * hl / (n - 1);
  return Array.from({ length: n }, (_, i) => -hl + i * step);
}

// the circle centres in world metres, run along the heading th (th 0 = +x, like P.th)
export function capsuleCircles(x, z, th, offsets) {
  const c = Math.cos(th), s = Math.sin(th);
  return offsets.map(d => [x + c * d, z + s * d]);
}

// the yaw nudge from a wall push (wx, wz)·pen at the circle d metres along the heading: the torque of the push about
// the centre, clamped. Zero at the centre and head-on (the push runs along the bus's own axis); opposite signs nose/tail.
export function wallYaw(d, th, wx, wz, pen, gain, clamp) {
  if (d === 0) return 0;
  const torque = d * pen * (Math.cos(th) * wz - Math.sin(th) * wx);
  const yaw = gain * torque;
  return yaw > clamp ? clamp : yaw < -clamp ? -clamp : yaw;
}

// ---------- the horn test's helpers: pitch class (C = 0) and cents off the nearest semitone ----------
const A4 = 440, ST = 12 / Math.log(2);   // semitones = ST * ln(f / A4)
export function noteClass(f) {
  const s = Math.round(ST * Math.log(f / A4));          // semitones from A4 (class 9)
  return ((9 + s) % 12 + 12) % 12;
}
export function centsOff(f) {
  const st = ST * Math.log(f / A4);
  return 100 * (st - Math.round(st));
}