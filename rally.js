// rally.js — the Rhy Rally vehicle table entry: a 2013 Hyundai i20 WRC look-alike in our own livery (start number 8), no badge, no sponsor.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/rally.glb, tools/prepare-rally.mjs).
//
// World rally car numbers: 1.6 l turbo four, 300 hp, 1200 kg, geared short (about 200 km/h = 56 m/s), a six-speed sequential box,
// quick off the line and quick to turn; the handbrake throws the tail out (low handbrake grip); 2.57 m wheelbase; left-hand drive.
export const RALLY = {
  model: 'gltf', gltf: { id: 'rally', url: './assets/rally.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.285, 0.83], [-1.285, 0.83]], wheelR: 0.323,   // the model's own wheel nodes: x ±1.285, |z| 0.833 / 0.835, r 0.323
  drive: { top: 56, topNitro: 86, accel: 19, accelNitro: 36, brake: 26, reverse: 8, reverseMax: 14, grip: 10.5, gripHandbrake: 1.2, steerRate: 3.0, airSteer: 0.45 },
  mass: 1.1, engineAt: [1.5, 0.8, 0], collision: { shape: 'circle', r: 1.2 },
  camera: { chase: { dist: 6.9, h: 2.4 }, near: { dist: 4.6, h: 1.7 }, cockpit: { eye: [-0.35, 1.12, -0.38] }, bumper: { eye: [2.15, 0.5, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 45, 75, 105, 140, 175, 999],
    engine: { cylinders: 4, idleRpm: 1000, shiftRpm: 7500, limitRpm: 8500, topKmh: 200, harmonics: [{ mul: 0.5, gain: 0.3, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.7, detune: 7 }, { mul: 3, gain: 0.35, detune: -6 }, { mul: 4, gain: 0.2, detune: 9 }],
      filter: { idle: 600, open: 3400, offLoad: 0.6, q: 2.0 }, gain: { idle: 0.06, rev: 0.07, load: 0.11 }, shiftTime: 0.08, shiftDip: 0.7, nitroHiss: 0.07 },
    horn: { notes: [440, 554], dur: 0.6, gain: 0.22, band: 1600, wave: 'square' },
    crash: { weight: 1.1, thump: 75, noise: 2100, gain: 1 } },   // a high, rasping turbo four: high idle filter, quick sequential shifts, a short bright horn
  blinkers: [[1.98, 0.62, 0.8], [-1.93, 0.86, 0.74]],
};
