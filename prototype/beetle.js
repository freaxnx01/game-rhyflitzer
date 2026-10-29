// beetle.js — the Ladybug vehicle table entry: a red drag-strip VW Beetle look-alike with a nitrous bottle, no badge, no lettering.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/beetle.glb, tools/prepare-beetle.mjs).
//
// Beetle numbers: air-cooled flat four in the tail, light (about 800 kg), a four-speed box, modest top speed (about 137 km/h = 38 m/s)
// until the nitrous kicks in; the engine over the rear axle makes the tail loose; 2.40 m wheelbase; left-hand drive.
export const BEETLE = {
  model: 'gltf', gltf: { id: 'beetle', url: './assets/beetle.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.2, 0.7], [-1.2, 0.7]], wheelR: 0.349,   // the model's own wheel nodes: x ±1.2, |z| 0.704, r 0.329 front / 0.349 rear
  drive: { top: 38, topNitro: 64, accel: 10, accelNitro: 40, brake: 16, reverse: 6, reverseMax: 10, grip: 7.5, gripHandbrake: 1.3, steerRate: 2.6, airSteer: 0.35 },
  mass: 0.85, engineAt: [-1.4, 0.7, 0], collision: { shape: 'circle', r: 1.1 },
  camera: { chase: { dist: 6.5, h: 2.4 }, near: { dist: 4.4, h: 1.7 }, cockpit: { eye: [-0.25, 1.12, -0.28] }, bumper: { eye: [1.85, 0.6, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 35, 65, 100, 999],
    engine: { cylinders: 4, idleRpm: 850, shiftRpm: 4500, limitRpm: 5000, topKmh: 137, harmonics: [{ mul: 0.5, gain: 0.8, detune: -5 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.4, detune: 6 }, { mul: 2, gain: 0.3, detune: -4 }],
      filter: { idle: 400, open: 2000, offLoad: 0.55, q: 1.6 }, gain: { idle: 0.07, rev: 0.06, load: 0.1 }, shiftTime: 0.25, shiftDip: 0.55, nitroHiss: 0.1 },
    horn: { notes: [415], dur: 0.4, gain: 0.2, band: 1400, wave: 'square' },
    crash: { weight: 0.85, thump: 65, noise: 1800, gain: 1 } },   // a chugging air-cooled four: strong half-order, a dark filter, a loud nitrous hiss; a single short meep
  blinkers: [[1.45, 0.82, 0.66], [-1.72, 0.6, 0.6]],   // on the front wings and by the tail lamps
};
