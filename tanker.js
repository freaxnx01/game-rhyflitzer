// tanker.js — the Rhy Tanker (de: Rhy Tanklaster) vehicle table entry: a Swiss heating-oil delivery truck, a three-axle rigid with
// a white tank and an orange-red stripe, pulling a two-axle drawbar tank trailer in the same livery (#1103). Fixed livery (the
// model's own plain colours, so it is not paintable); no maker's badge, no oil company's name.
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/tanker.glb, tools/prepare-tanker.mjs).
//
// Tanker numbers: a six-cylinder diesel under the tilting cab, six gears, 80 km/h (the limit for a truck with a trailer);
// the truck 9.8 m long, 2.54 m wide, left-hand drive; the trailer is its own node that swings behind (trailer.js), hitched
// 5.2 m behind the origin, its axles' midpoint another 3.85 m back. Heavier than the Mixer: it shrugs off knocks, is slow off the
// line and turns wide. The collision capsule covers the truck only, never the trailer.
export const TANKER = {
  type: 'utility',   // #493: the gallery's type chip
  model: 'gltf', gltf: { id: 'tanker', url: './assets/tanker.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[3.04, 1.054], [-2.36, 0.939]], wheelR: 0.535,   // the model's front axle and the tandem's first axle (the second at x -3.71)
  trailer: { hitch: 5.2, length: 3.85 },   // the glb's root extras: the hitch behind the origin, hitch -> midpoint of the trailer axles
  drive: { top: 22.2, topNitro: 30, accel: 3.0, accelNitro: 7, brake: 8, reverse: 3, reverseMax: 4, grip: 6, gripHandbrake: 1.5, steerRate: 1.2, airSteer: 0.2 },
  mass: 9, engineAt: [3.6, 1.2, 0], collision: { shape: 'capsule', r: 1.3, hl: 3.3 },   // circles reach -4.6 .. 4.6 m over the 9.8 m truck (-5.2 .. 4.6)
  camera: { chase: { dist: 20, h: 6.5 }, near: { dist: 15, h: 5 }, cockpit: { eye: [3.5, 2.5, -0.62] }, bumper: { eye: [4.7, 0.9, 0] }, drone: { dist: 32, h: 20 } },
  sound: { gears: [0, 9, 18, 28, 40, 54, 999],
    engine: { cylinders: 6, idleRpm: 580, shiftRpm: 2000, limitRpm: 2300, topKmh: 80, harmonics: [{ mul: 0.5, gain: 0.7, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.32, detune: 5 }, { mul: 2, gain: 0.3, detune: -4 }],
      filter: { idle: 230, open: 1150, offLoad: 0.45, q: 1.25 }, gain: { idle: 0.08, rev: 0.05, load: 0.12 }, shiftTime: 0.4, shiftDip: 0.5, nitroHiss: 0.07 },
    horn: { notes: [196, 247], dur: 1.1, gain: 0.26, band: 900, wave: 'sawtooth' },
    crash: { weight: 3, thump: 42, noise: 950, gain: 1 } },   // a loaded diesel: low revs, a dark filter, slow shifts; a deep two-tone air horn
  blinkers: [[4.45, 0.95, 1.12], [-5.3, 0.6, 0.95]],   // on the cab's front corners and beside the truck's tail lamps
};
