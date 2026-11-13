// wobbler.js — the Rhy Wobbler vehicle table entry: a 1970s British three-wheeler van look-alike (one wheel in front), no badge;
// paintable, sunflower yellow from the factory.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/wobbler.glb, tools/prepare-wobbler.mjs).
//
// Three-wheeler numbers: an 850 cc four in the nose, very light (about 450 kg), a four-speed box, about 137 km/h (38 m/s) flat out;
// 3.33 m long, 2.17 m wheelbase, right-hand drive. The one front wheel makes it top-heavy: held through a corner at speed it tips
// onto its side (tipover.js, cfg `tip`) and is set back on its wheels after a moment. The light body takes the most damage.
// The front wheel is two half-wheel nodes on one centre (wheel_FL, wheel_FR at z 0), so the table's front |z| is 0.
export const WOBBLER = {
  type: 'screen',   // #493: the gallery's type chip; Film & TV, the three-wheeler is the Mr Bean car
  model: 'gltf', gltf: { id: 'wobbler', url: './assets/wobbler.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'sunflower',
  wheels: [[1.085, 0], [-1.085, 0.61]], wheelR: 0.272,   // the model's own wheel nodes: front x 1.085 on the centre line, rear x -1.085, |z| 0.61
  drive: { top: 38, topNitro: 60, accel: 9, accelNitro: 30, brake: 16, reverse: 6, reverseMax: 10, grip: 7, gripHandbrake: 1.4, steerRate: 2.6, airSteer: 0.35 },
  mass: 0.6, engineAt: [0.9, 0.6, 0], collision: { shape: 'circle', r: 1.0 },
  // full lock holds it up to about 45 km/h; above that, a held corner tips it in under half a second, a tap only rocks it
  // on its side it slews on round the corner by about 75° (turn) and slides on crosswise for a good second before it stops (slide)
  tip: { latAccel: 24, rate: 5, lean: 0.14, fall: 0.55, lie: 2.0, rise: 0.8, pivot: 0.75, slide: 1.1, turn: 1.3, turnRate: 2.5, hit: 0.3 },   // hit: the landing's impact strength (15 % damage)
  camera: { chase: { dist: 6.2, h: 2.3 }, near: { dist: 4.2, h: 1.7 }, cockpit: { eye: [-0.1, 1.15, 0.3] }, bumper: { eye: [1.75, 0.5, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 30, 55, 90, 999],
    engine: { cylinders: 4, idleRpm: 900, shiftRpm: 5000, limitRpm: 5500, topKmh: 137, harmonics: [{ mul: 0.5, gain: 0.5, detune: -4 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.45, detune: 5 }, { mul: 3, gain: 0.2, detune: -6 }],
      filter: { idle: 500, open: 2600, offLoad: 0.55, q: 1.8 }, gain: { idle: 0.06, rev: 0.06, load: 0.09 }, shiftTime: 0.25, shiftDip: 0.55, nitroHiss: 0.09 },
    horn: { notes: [494], dur: 0.35, gain: 0.2, band: 1600, wave: 'square' },
    crash: { weight: 0.6, thump: 75, noise: 2100, gain: 1 } },   // a buzzy little four: thin, bright, high revs; a short high meep; a light, tinny crash
  blinkers: [[1.49, 0.38, 0.59], [-1.64, 0.55, 0.62]],   // in the front bumper corners and by the tail lamps
};
