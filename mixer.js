// mixer.js — the Rhy Mixer vehicle table entry: a 1970s German cab-over concrete mixer truck look-alike, orange and cream, red
// chassis, no badge, no number plates (the livery is the model's texture, so it is not paintable). The drum turns all the time.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/mixer.glb, tools/prepare-mixer.mjs).
//
// Mixer numbers: a big air-cooled diesel under the cab, three axles (6x4), about 25 t loaded, 80 km/h flat out, six gears; 7.2 m
// long, 2.5 m wide; left-hand drive. Six wheel nodes: the front axle and the tandem's two (wheel_RL2 / RR2). The heaviest after the
// bus: it shrugs off knocks, but it is slow off the line and turns wide.
export const MIXER = {
  type: 'utility',   // #493: the gallery's type chip
  model: 'gltf', gltf: { id: 'mixer', url: './assets/mixer.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.73, 1.04], [-1.02, 0.87]], wheelR: 0.535,   // the model's front axle and the tandem's front axle (the second at x -2.44)
  drive: { top: 22.2, topNitro: 30, accel: 3.5, accelNitro: 8, brake: 9, reverse: 3, reverseMax: 5, grip: 6, gripHandbrake: 1.5, steerRate: 1.4, airSteer: 0.2 },
  mass: 6, engineAt: [2.2, 1.0, 0], collision: { shape: 'capsule', r: 1.3, hl: 2.6 },   // circles reach -3.9 .. 3.9 m: the 7.2 m body sits from -3.95 to 3.28
  spin: [{ node: 'drum', rate: 1.0 }],   // the drum, about 10 turns a minute
  camera: { chase: { dist: 12, h: 4.5 }, near: { dist: 8.5, h: 3.5 }, cockpit: { eye: [2.3, 2.45, -0.72] }, bumper: { eye: [3.4, 1.0, 0] }, drone: { dist: 24, h: 15 } },
  sound: { gears: [0, 10, 20, 32, 45, 60, 999],
    engine: { cylinders: 6, idleRpm: 550, shiftRpm: 2100, limitRpm: 2400, topKmh: 80, harmonics: [{ mul: 0.5, gain: 0.7, detune: -7 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.35, detune: 5 }, { mul: 2, gain: 0.3, detune: -4 }],
      filter: { idle: 240, open: 1200, offLoad: 0.45, q: 1.3 }, gain: { idle: 0.08, rev: 0.05, load: 0.11 }, shiftTime: 0.35, shiftDip: 0.5, nitroHiss: 0.07 },
    horn: { notes: [185, 233], dur: 1.1, gain: 0.26, band: 900, wave: 'sawtooth' },
    crash: { weight: 2.5, thump: 45, noise: 1000, gain: 1 } },   // a rattling air-cooled diesel: low revs, a dark filter, slow shifts; a deep two-tone air horn
  blinkers: [[2.88, 1.35, 1.31], [-3.63, 0.52, 1.1]],   // on the cab corners and beside the tail lamps
};
