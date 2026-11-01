// mclaren.js — the Rhy Papaya vehicle table entry: a 2013 McLaren P1 look-alike, paintable, signal orange (papaya) from the
// factory, no badge. Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/mclaren.glb,
// tools/prepare-mclaren.mjs).
//
// P1 numbers: a 3.8 l twin-turbo V8 plus an electric motor behind the seats, rear-wheel drive, 350 km/h (limited; here 280 km/h,
// 77.8 m/s, a step under the Rhy Hyper), seven gears, 0-100 in 2.8 s, 1395 kg; 2.67 m wheelbase. Lighter than the Hyper and with
// the most grip in the game: the corner car.
export const MCLAREN = {
  model: 'gltf', gltf: { id: 'mclaren', url: './assets/mclaren.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'signal',
  wheels: [[1.335, 0.822], [-1.335, 0.794]], wheelR: 0.327,   // the model's own wheel nodes: x ±1.335, |z| 0.822 / 0.794, r 0.323 / 0.33
  drive: { top: 77.8, topNitro: 100, accel: 20, accelNitro: 38, brake: 32, reverse: 8, reverseMax: 14, grip: 11.25, gripHandbrake: 1.4, steerRate: 3.1, airSteer: 0.45 },
  mass: 1.17, engineAt: [-0.8, 0.7, 0], collision: { shape: 'circle', r: 1.2 },
  camera: { chase: { dist: 7, h: 2.3 }, near: { dist: 4.6, h: 1.6 }, cockpit: { eye: [0.15, 1.0, -0.31] }, bumper: { eye: [2.45, 0.4, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 60, 100, 140, 180, 220, 260, 999],
    engine: { cylinders: 8, idleRpm: 950, shiftRpm: 7800, limitRpm: 8200, topKmh: 280, harmonics: [{ mul: 0.5, gain: 0.45, detune: -5 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.35, detune: 4 }, { mul: 4, gain: 0.15, detune: -6 }],
      filter: { idle: 420, open: 3000, offLoad: 0.5, q: 1.5 }, gain: { idle: 0.06, rev: 0.08, load: 0.12 }, shiftTime: 0.08, shiftDip: 0.6, nitroHiss: 0.09 },
    horn: { notes: [415, 523], dur: 0.6, gain: 0.22, band: 1500, wave: 'square' },
    crash: { weight: 1.17, thump: 68, noise: 1900, gain: 1 } },   // a hard, high-revving flat-plane V8: rough half orders, very quick shifts, a two-tone horn
  blinkers: [[1.83, 0.58, 0.81], [-1.93, 0.6, 0.8]],   // in the head lamps and in the tail lamp band
};
