// coupe.js — the Rhy Coupé vehicle table entry: a 2011 BMW 1 Series M Coupé look-alike, paintable, signal orange from the factory,
// no badge. Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/coupe.glb,
// tools/prepare-coupe.mjs).
//
// 1M numbers: a 3.0 l twin-turbo straight six in the nose, rear-wheel drive, 250 km/h (69.4 m/s, limited), six gears, 0-100 in
// 4.9 s, 1495 kg; short and wide, so it turns in sharply and the tail comes round on the handbrake; 2.66 m wheelbase; left-hand drive.
export const COUPE = {
  model: 'gltf', gltf: { id: 'coupe', url: './assets/coupe.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'signal',
  wheels: [[1.33, 0.746], [-1.33, 0.746]], wheelR: 0.306,   // the model's own wheel nodes: x ±1.33, |z| 0.746, r 0.306
  drive: { top: 69.4, topNitro: 95, accel: 18.5, accelNitro: 36, brake: 27, reverse: 8, reverseMax: 14, grip: 10, gripHandbrake: 1.3, steerRate: 2.9, airSteer: 0.4 },
  mass: 1.25, engineAt: [1.45, 0.8, 0], collision: { shape: 'circle', r: 1.2 },
  camera: { chase: { dist: 6.8, h: 2.4 }, near: { dist: 4.5, h: 1.7 }, cockpit: { eye: [-0.3, 1.1, -0.37] }, bumper: { eye: [2.15, 0.5, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 55, 90, 130, 170, 210, 999],
    engine: { cylinders: 6, idleRpm: 800, shiftRpm: 6800, limitRpm: 7000, topKmh: 250, harmonics: [{ mul: 0.5, gain: 0.25, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.45, detune: 4 }, { mul: 3, gain: 0.3, detune: -5 }, { mul: 4.5, gain: 0.12, detune: 7 }],
      filter: { idle: 450, open: 3200, offLoad: 0.5, q: 1.6 }, gain: { idle: 0.06, rev: 0.07, load: 0.11 }, shiftTime: 0.15, shiftDip: 0.55, nitroHiss: 0.08 },
    horn: { notes: [349, 440], dur: 0.7, gain: 0.22, band: 1300, wave: 'square' },
    crash: { weight: 1.25, thump: 66, noise: 1800, gain: 1 } },   // a smooth, rasping straight six: half-order harmonics, quick shifts, a two-tone horn
  blinkers: [[1.92, 0.62, 0.68], [-2.08, 0.78, 0.58]],   // in the head lamps and in the tail lamps
};
