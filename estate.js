// estate.js — the Rhy Estate (de: Rhy Kombi) vehicle table entry: a 2009–2013 Škoda Octavia Combi look-alike, the family estate of
// about 2011, paintable, Rhine blue from the factory, no badge. Pure module: no DOM, no three.js, so node --test can import it.
// The model is a glTF file (assets/estate.glb, tools/prepare-estate.mjs).
//
// Octavia numbers: the 2.0 l TDI four in the nose, 140 hp, front-wheel drive, 207 km/h (57.5 m/s), six gears, 0-100 in about
// 9.6 s, 1.4 t; long, calm and roomy rather than quick; 2.578 m wheelbase; left-hand drive.
export const ESTATE = {
  model: 'gltf', gltf: { id: 'estate', url: './assets/estate.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'rhine',
  wheels: [[1.289, 0.732], [-1.289, 0.732]], wheelR: 0.322,   // the model's own wheel nodes: x ±1.289, |z| 0.732, r 0.322
  drive: { top: 57.5, topNitro: 80, accel: 13.5, accelNitro: 30, brake: 22, reverse: 7, reverseMax: 12, grip: 9, gripHandbrake: 1.6, steerRate: 2.6, airSteer: 0.4 },
  mass: 1.15, engineAt: [1.6, 0.7, 0], collision: { shape: 'circle', r: 1.25 },
  camera: { chase: { dist: 7.0, h: 2.5 }, near: { dist: 4.7, h: 1.8 }, cockpit: { eye: [-0.2, 1.2, -0.38] }, bumper: { eye: [2.25, 0.5, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 35, 60, 90, 125, 165, 999],
    engine: { cylinders: 4, idleRpm: 800, shiftRpm: 3800, limitRpm: 4500, topKmh: 207, harmonics: [{ mul: 0.5, gain: 0.45, detune: -7 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.45, detune: 4 }, { mul: 3, gain: 0.25, detune: -5 }],
      filter: { idle: 350, open: 1900, offLoad: 0.5, q: 1.4 }, gain: { idle: 0.07, rev: 0.05, load: 0.1 }, shiftTime: 0.25, shiftDip: 0.6, nitroHiss: 0.07 },
    horn: { notes: [392, 494], dur: 0.6, gain: 0.22, band: 1400, wave: 'square' },
    crash: { weight: 1.15, thump: 66, noise: 1800, gain: 1 } },   // a clattering diesel four: low revs, six early shifts, a plain two-tone horn
  blinkers: [[2.05, 0.72, 0.72], [-2.22, 0.92, 0.66]],   // in the head lamps and in the tail lamps
};
