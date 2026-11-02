// harvester.js — the Rhy Harvester vehicle table entry: a modern combine harvester look-alike with a wide grain header and a reel
// that never stops turning; paintable, meadow green from the factory, no badge.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/harvester.glb, tools/prepare-harvester.mjs).
//
// Combine numbers: a big diesel behind the grain tank, a hydrostatic drive with four ranges, 40 km/h on the road; 11.7 m long with
// the unloading auger, the header 9.9 m wide (wider than the collision: it sweeps over kerbs and hedges), big front tyres, small
// steering rear wheels (here the front ones steer, as on every car in the game). Slow and heavy, but it turns tightly.
export const HARVESTER = {
  model: 'gltf', gltf: { id: 'harvester', url: './assets/harvester.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'meadow',
  wheels: [[1.554, 1.324], [-1.554, 1.273]], wheelR: 0.9,   // the model's own wheel nodes: x ±1.554, |z| 1.324 / 1.273, r 0.9 front / 0.753 rear
  drive: { top: 11.1, topNitro: 16, accel: 2.5, accelNitro: 6, brake: 7, reverse: 2.5, reverseMax: 4, grip: 6, gripHandbrake: 1.5, steerRate: 2.0, airSteer: 0.2 },
  mass: 5, engineAt: [-1.5, 3.0, 0], collision: { shape: 'capsule', r: 1.7, hl: 4.6 },   // circles reach -6.3 .. 6.3 m: the body sits from -6.26 to 5.42
  spin: [{ node: 'reel', rate: -1.6 }],   // the reel, about 15 turns a minute, its lower bars sweeping back towards the cutter bar
  camera: { chase: { dist: 16, h: 7 }, near: { dist: 12, h: 5.5 }, cockpit: { eye: [2.6, 3.1, 0] }, bumper: { eye: [5.6, 1.2, 0] }, drone: { dist: 30, h: 20 } },
  sound: { gears: [0, 10, 20, 30, 999],
    engine: { cylinders: 6, idleRpm: 800, shiftRpm: 2000, limitRpm: 2200, topKmh: 40, harmonics: [{ mul: 0.5, gain: 0.6, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.4, detune: 5 }, { mul: 3, gain: 0.15, detune: -4 }],
      filter: { idle: 300, open: 1400, offLoad: 0.5, q: 1.3 }, gain: { idle: 0.09, rev: 0.05, load: 0.11 }, shiftTime: 0.3, shiftDip: 0.6, nitroHiss: 0.06 },
    horn: { notes: [196], dur: 0.8, gain: 0.24, band: 900, wave: 'sawtooth' },
    crash: { weight: 2.4, thump: 48, noise: 1100, gain: 1 } },   // a busy diesel that stays near its working revs, four ranges; one deep honk
  blinkers: [[3.55, 3.4, 1.15], [-3.9, 2.8, 1.5]],   // on the cab roof corners and at the back of the grain tank
};
