// tumbler.js — the Rhy Tumbler vehicle table entry: a look-alike of the armoured "Tumbler" from the Dark Knight films, matt black,
// no bat logo. Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/tumbler.glb,
// tools/prepare-tumbler.mjs).
//
// Film car numbers: a 5.7 l V8 behind the cockpit, rear-wheel drive on huge rear tyres, about 2.3 t, 0-100 in under 6 s, about
// 180 km/h (50 m/s) and a jet burner for the boost (strong nitro); heavy, so it shrugs off hits; 4.57 m long, the driver in the middle.
export const TUMBLER = {
  model: 'gltf', gltf: { id: 'tumbler', url: './assets/tumbler.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.797, 0.613], [-1.797, 0.82]], wheelR: 0.557,   // the model's own wheel nodes: x ±1.797, |z| 0.613 front / 0.82 rear, r 0.417 front / 0.557 rear (the spin follows the rear)
  drive: { top: 50, topNitro: 90, accel: 15, accelNitro: 42, brake: 24, reverse: 8, reverseMax: 12, grip: 8.5, gripHandbrake: 1.6, steerRate: 2.4, airSteer: 0.35 },
  mass: 2.3, engineAt: [-1.3, 0.9, 0], collision: { shape: 'circle', r: 1.4 },
  camera: { chase: { dist: 7.6, h: 2.8 }, near: { dist: 5.2, h: 2.0 }, cockpit: { eye: [0.1, 1.2, 0] }, bumper: { eye: [2.0, 0.6, 0] }, drone: { dist: 20, h: 13 } },
  sound: { gears: [0, 50, 95, 140, 999],
    engine: { cylinders: 8, idleRpm: 750, shiftRpm: 5500, limitRpm: 6000, topKmh: 180, harmonics: [{ mul: 0.5, gain: 0.6, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.4, detune: 5 }, { mul: 3, gain: 0.15, detune: -4 }],
      filter: { idle: 300, open: 1900, offLoad: 0.5, q: 1.8 }, gain: { idle: 0.08, rev: 0.07, load: 0.12 }, shiftTime: 0.25, shiftDip: 0.55, nitroHiss: 0.12 },
    horn: { notes: [147, 175], dur: 0.8, gain: 0.25, band: 900, wave: 'sawtooth' },
    crash: { weight: 2.3, thump: 50, noise: 1400, gain: 1.1 } },   // a deep, lumpy V8: low filter, slow automatic shifts, a loud jet hiss on nitro, a low growl for a horn
  blinkers: [[1.85, 0.75, 0.6], [-2.25, 0.9, 0.7]],   // beside the head lamps under the nose and at the tail
};
