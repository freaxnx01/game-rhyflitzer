// bulldog.js — the Rhy Bulldog vehicle table entry: a 1980s full-size sedan built for the demolition derby, push bar on the nose,
// black with orange-yellow flames and the number 77 (the livery is the model's texture, so it is not paintable), no badge.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/bulldog.glb, tools/prepare-bulldog.mjs).
//
// The tank of the garage: a big V8 driving the rear wheels, 190 km/h (52.8 m/s), four gears, heavy and stiffened, so it takes the
// least damage of all cars (damage / mass) and shoves the others aside; slow to turn. Caprice size: 5.4 m long, 2.946 m wheelbase,
// 5.54 m with the push bar, which the capsule collision covers.
export const BULLDOG = {
  model: 'gltf', gltf: { id: 'bulldog', url: './assets/bulldog.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.473, 0.757], [-1.473, 0.757]], wheelR: 0.344,   // the model's own wheel nodes: x ±1.473, |z| 0.757, r 0.344
  drive: { top: 52.8, topNitro: 75, accel: 12, accelNitro: 28, brake: 22, reverse: 8, reverseMax: 12, grip: 8, gripHandbrake: 1.6, steerRate: 2.2, airSteer: 0.3 },
  mass: 3.0, engineAt: [1.7, 0.8, 0], collision: { shape: 'capsule', r: 1.0, hl: 1.75 },
  camera: { chase: { dist: 7.6, h: 2.6 }, near: { dist: 5, h: 1.9 }, cockpit: { eye: [-0.35, 1.2, -0.38] }, bumper: { eye: [2.75, 0.6, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 50, 95, 145, 999],
    engine: { cylinders: 8, idleRpm: 650, shiftRpm: 4800, limitRpm: 5200, topKmh: 190, harmonics: [{ mul: 0.5, gain: 0.6, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.3, detune: 6 }, { mul: 2, gain: 0.2, detune: -4 }],
      filter: { idle: 300, open: 1900, offLoad: 0.45, q: 1.2 }, gain: { idle: 0.08, rev: 0.08, load: 0.13 }, shiftTime: 0.3, shiftDip: 0.45, nitroHiss: 0.08 },
    horn: { notes: [262, 330], dur: 0.9, gain: 0.24, band: 1000, wave: 'sawtooth' },
    crash: { weight: 3.0, thump: 52, noise: 1300, gain: 1 } },   // a lumpy big-block V8: heavy half orders, slow shifts, a deep two-tone horn
  blinkers: [[2.42, 0.62, 0.78], [-2.86, 0.7, 0.88]],   // in the corner markers and beside the tail lamps
};
