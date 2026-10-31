// modelt.js — the Tin Lizzie vehicle table entry (#521): a Ford Model T look-alike, no badge, no lettering.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/modelt.glb, tools/prepare-modelt.mjs).
//
// Model T numbers: 20 hp, about 72 km/h flat out (20 m/s), slow off the line, two forward gears (planetary box), narrow 30" tyres
// (little grip), weak brakes, 540 kg (light: loses more speed in a crash); 2.54 m wheelbase; left-hand drive; black.
export const MODEL_T = {
  model: 'gltf', gltf: { id: 'modelt', url: './assets/modelt.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.27, 0.6], [-1.27, 0.6]], wheelR: 0.386,   // the model's own wheel nodes: x ±1.27, |z| 0.599, r 0.386
  drive: { top: 20, topNitro: 30, accel: 5, accelNitro: 12, brake: 12, reverse: 4, reverseMax: 6, grip: 6, gripHandbrake: 1.4, steerRate: 2.0, airSteer: 0.3 },
  mass: 0.8, engineAt: [1.2, 0.9, 0], collision: { shape: 'circle', r: 1.1 },
  camera: { chase: { dist: 6.9, h: 2.7 }, near: { dist: 4.6, h: 2.0 }, cockpit: { eye: [-0.3, 1.65, -0.18] }, bumper: { eye: [1.75, 0.7, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 28, 999],
    engine: { cylinders: 4, idleRpm: 500, shiftRpm: 1600, limitRpm: 1800, topKmh: 72, harmonics: [{ mul: 0.5, gain: 0.6, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.3, detune: 5 }, { mul: 3, gain: 0.15, detune: -4 }],
      filter: { idle: 300, open: 1400, offLoad: 0.5, q: 1.3 }, gain: { idle: 0.07, rev: 0.05, load: 0.09 }, shiftTime: 0.35, shiftDip: 0.5, nitroHiss: 0.07 },
    horn: { notes: [220, 277], dur: 0.7, gain: 0.22, band: 900, wave: 'sawtooth' },
    crash: { weight: 0.9, thump: 60, noise: 1500, gain: 1 } },   // a slow, low four: few revs, dark filter, a long shift; a raspy low horn
  blinkers: [[1.45, 0.62, 0.6], [-1.62, 0.78, 0.6]],   // the real car had none; small ones on the front wings and by the tail lamp
};
