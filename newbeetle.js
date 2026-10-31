// newbeetle.js — the Rhy Bubble vehicle table entry: a 1998 VW New Beetle look-alike, paintable, sunflower yellow from the factory,
// no badge. Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/newbeetle.glb,
// tools/prepare-newbeetle.mjs).
//
// New Beetle numbers: 2.0 l four in the nose, front-wheel drive, about 180 km/h (50 m/s), five gears, 1200 kg, friendly and
// stable rather than sharp; 2.51 m wheelbase; left-hand drive.
export const NEW_BEETLE = {
  model: 'gltf', gltf: { id: 'newbeetle', url: './assets/newbeetle.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'sunflower',
  wheels: [[1.255, 0.736], [-1.255, 0.736]], wheelR: 0.317,   // the model's own wheel nodes: x ±1.255, |z| 0.736, r 0.317
  drive: { top: 50, topNitro: 75, accel: 13, accelNitro: 30, brake: 22, reverse: 7, reverseMax: 12, grip: 9, gripHandbrake: 1.6, steerRate: 2.7, airSteer: 0.4 },
  mass: 1.0, engineAt: [1.5, 0.8, 0], collision: { shape: 'circle', r: 1.2 },
  camera: { chase: { dist: 6.9, h: 2.5 }, near: { dist: 4.6, h: 1.8 }, cockpit: { eye: [-0.25, 1.2, -0.36] }, bumper: { eye: [2.12, 0.5, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 40, 70, 105, 145, 999],
    engine: { cylinders: 4, idleRpm: 800, shiftRpm: 6000, limitRpm: 6500, topKmh: 180, harmonics: [{ mul: 0.5, gain: 0.35, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.5, detune: 5 }, { mul: 3, gain: 0.2, detune: -4 }],
      filter: { idle: 450, open: 2600, offLoad: 0.55, q: 1.5 }, gain: { idle: 0.06, rev: 0.06, load: 0.1 }, shiftTime: 0.2, shiftDip: 0.6, nitroHiss: 0.07 },
    horn: { notes: [370, 466], dur: 0.6, gain: 0.22, band: 1500, wave: 'square' },
    crash: { weight: 1, thump: 70, noise: 1900, gain: 1 } },   // a plain, smooth four: moderate revs, five calm shifts, a bright two-tone horn
  blinkers: [[1.87, 0.4, 0.7], [-1.69, 0.72, 0.65]],   // in the front bumper and in the tail lamps
};
