// hyper.js — the Rhy Hyper vehicle table entry: a 2016 Bugatti Chiron look-alike, two-tone racing blue from the factory, paintable
// (the dark side stays), no badge. Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file
// (assets/hyper.glb, tools/prepare-hyper.mjs).
//
// Chiron numbers: an 8.0 l quad-turbo W16 behind the seats, all-wheel drive, 420 km/h (limited; here 300 km/h, 83.3 m/s, the
// fastest car in the game, nitro on top), seven gears, 0-100 in 2.4 s, 1995 kg; 2.711 m wheelbase; long, wide and very low.
export const HYPER = {
  model: 'gltf', gltf: { id: 'hyper', url: './assets/hyper.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'racing',
  wheels: [[1.355, 0.809], [-1.355, 0.807]], wheelR: 0.366,   // the model's own wheel nodes: x ±1.355, |z| 0.809 / 0.807, r 0.364 / 0.368
  drive: { top: 83.3, topNitro: 105, accel: 21, accelNitro: 40, brake: 30, reverse: 8, reverseMax: 14, grip: 9.5, gripHandbrake: 1.2, steerRate: 2.6, airSteer: 0.4 },
  mass: 1.67, engineAt: [-0.9, 0.7, 0], collision: { shape: 'circle', r: 1.25 },
  camera: { chase: { dist: 7, h: 2.3 }, near: { dist: 4.7, h: 1.6 }, cockpit: { eye: [0.1, 1.0, -0.39] }, bumper: { eye: [2.35, 0.45, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 60, 100, 145, 190, 235, 280, 999],
    engine: { cylinders: 16, idleRpm: 900, shiftRpm: 6500, limitRpm: 6700, topKmh: 300, harmonics: [{ mul: 0.5, gain: 0.35, detune: -4 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.4, detune: 3 }, { mul: 3, gain: 0.2, detune: -5 }],
      filter: { idle: 380, open: 2600, offLoad: 0.5, q: 1.4 }, gain: { idle: 0.07, rev: 0.08, load: 0.12 }, shiftTime: 0.1, shiftDip: 0.6, nitroHiss: 0.09 },
    horn: { notes: [392, 494], dur: 0.7, gain: 0.22, band: 1400, wave: 'square' },
    crash: { weight: 1.67, thump: 62, noise: 1700, gain: 1 } },   // a deep, smooth W16 roar: strong half orders, very quick shifts, a two-tone horn
  blinkers: [[1.86, 0.6, 0.72], [-2.08, 0.69, 0.75]],   // in the head lamps and in the tail lamp band
};
