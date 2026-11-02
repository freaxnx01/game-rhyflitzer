// fizz.js — the Rhy Fizz vehicle table entry: a stylised red drinks truck, an American long-nose tractor with a box trailer, white
// trim and fairy lights round the trailer that light up with the head lamps (L); no brand, logo or lettering (the livery is the
// model's own colours, so it is not paintable).
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/fizz.glb, tools/prepare-fizz.mjs).
//
// Semi numbers: a big six-cylinder diesel in the long nose, eight gears, 105 km/h; 11 m long as one rigid piece (the trailer does
// not articulate), five axles, ten wheel nodes (wheel_RL2 .. wheel_RR4 behind the four). Heavy: knocks barely hurt, slow off the
// line, very wide in the corners.
export const FIZZ = {
  model: 'gltf', gltf: { id: 'fizz', url: './assets/fizz.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[4.551, 1.37], [1.961, 1.37]], wheelR: 0.458,   // the front axle and the first drive axle; behind them x 0.742, -3.653, -4.808
  drive: { top: 29.2, topNitro: 38, accel: 4.5, accelNitro: 10, brake: 10, reverse: 3, reverseMax: 5, grip: 6, gripHandbrake: 1.5, steerRate: 1.2, airSteer: 0.2 },
  mass: 7, engineAt: [4.6, 1.2, 0], collision: { shape: 'capsule', r: 1.4, hl: 4.1 },   // circles reach -5.5 .. 5.5 m over the 11 m truck
  camera: { chase: { dist: 15, h: 5.5 }, near: { dist: 11, h: 4.2 }, cockpit: { eye: [3.0, 2.3, -0.5] }, bumper: { eye: [5.6, 0.9, 0] }, drone: { dist: 28, h: 17 } },
  sound: { gears: [0, 8, 16, 25, 35, 47, 60, 78, 999],
    engine: { cylinders: 6, idleRpm: 600, shiftRpm: 1800, limitRpm: 2100, topKmh: 105, harmonics: [{ mul: 0.5, gain: 0.7, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.3, detune: 4 }, { mul: 2, gain: 0.35, detune: -5 }],
      filter: { idle: 230, open: 1100, offLoad: 0.45, q: 1.2 }, gain: { idle: 0.08, rev: 0.05, load: 0.12 }, shiftTime: 0.4, shiftDip: 0.5, nitroHiss: 0.07 },
    horn: { notes: [220, 277, 330], dur: 1.2, gain: 0.26, band: 900, wave: 'sawtooth' },
    crash: { weight: 2.8, thump: 42, noise: 950, gain: 1 } },   // a deep, slow-revving diesel with many gears; a three-note air horn
  blinkers: [[5.47, 0.74, 1.04], [-5.6, 0.75, 1.0]],   // in the bumper corners and beside the trailer's tail lamps
};
