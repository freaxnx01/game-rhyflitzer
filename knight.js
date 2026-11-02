// knight.js — the Rhy Knight vehicle table entry: a black early-eighties sports coupé look-alike with the red scanner light in the
// nose that sweeps back and forth all the time (scanner.js), no badge, no number plate (the livery is the model's texture, so it is
// not paintable). Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/knight.glb,
// tools/prepare-knight.mjs).
//
// Firebird numbers: a 5.0 l V8 in the long nose, rear-wheel drive, four gears, 4.85 m long on a 2.565 m wheelbase, 1.4 t; left-hand
// drive. The TV car's "turbo boost" is the nitro: 220 km/h (61.1 m/s) flat out, 330 km/h with it.
export const KNIGHT = {
  model: 'gltf', gltf: { id: 'knight', url: './assets/knight.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.282, 0.777], [-1.282, 0.777]], wheelR: 0.323,   // the model's own wheel nodes: x ±1.282, |z| 0.777, r 0.323
  drive: { top: 61.1, topNitro: 92, accel: 15, accelNitro: 40, brake: 24, reverse: 8, reverseMax: 13, grip: 9, gripHandbrake: 1.4, steerRate: 2.6, airSteer: 0.4 },
  mass: 1.5, engineAt: [1.6, 0.7, 0], collision: { shape: 'capsule', r: 0.95, hl: 1.5 },   // circles reach -2.45 .. 2.45 m: the body sits from -2.35 to 2.5
  camera: { chase: { dist: 7.2, h: 2.4 }, near: { dist: 4.8, h: 1.7 }, cockpit: { eye: [-0.25, 1.05, -0.42] }, bumper: { eye: [2.55, 0.5, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 60, 105, 160, 999],
    engine: { cylinders: 8, idleRpm: 700, shiftRpm: 4800, limitRpm: 5200, topKmh: 220, harmonics: [{ mul: 0.5, gain: 0.55, detune: -7 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.3, detune: 5 }, { mul: 2, gain: 0.25, detune: -4 }],
      filter: { idle: 320, open: 2200, offLoad: 0.45, q: 1.3 }, gain: { idle: 0.07, rev: 0.08, load: 0.12 }, shiftTime: 0.25, shiftDip: 0.5, nitroHiss: 0.12 },
    horn: { notes: [311, 392], dur: 0.8, gain: 0.23, band: 1100, wave: 'sawtooth' },
    crash: { weight: 1.5, thump: 58, noise: 1500, gain: 1 } },   // a burbling small-block V8: strong half orders, four gears, a loud boost hiss
  blinkers: [[2.33, 0.5, 0.78], [-2.2, 0.75, 0.8]],   // beside the bumper lamps and at the ends of the tail band
};
