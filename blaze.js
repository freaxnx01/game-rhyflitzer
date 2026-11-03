// blaze.js — the Rhy Blaze vehicle table entry: a red European tanker fire engine look-alike (a Swiss TLF: cab-over, two axles,
// water tank and equipment lockers behind the crew cab), blue lights and a two-tone siren on the 2 key (siren.js), no crest, no
// lettering, no number plate (fixed livery, not paintable). Pure module: no DOM, no three.js, so node --test can import it. The
// model is a glTF file (assets/blaze.glb, tools/prepare-blaze.mjs).
//
// TLF numbers: a six-cylinder diesel under the cab, six gears, about 16 t with the tank full, 100 km/h flat out; 7.3 m long, 2.55 m
// wide, 3.05 m high to the blue lights, 3.78 m wheelbase, twin tyres at the back; left-hand drive. Heavy like the Rhy Mixer, a
// little quicker off the line.
import { SIREN } from './siren.js';

export const BLAZE = {
  model: 'gltf', gltf: { id: 'blaze', url: './assets/blaze.glb', fallback: 'compact' }, scale: 1.0, paint: false,
  wheels: [[1.892, 1.11], [-1.892, 0.989]], wheelR: 0.478,   // the model's own wheel nodes: front x 1.892 |z| 1.11, rear x -1.892 |z| 0.989 (twins), r 0.478
  drive: { top: 27.8, topNitro: 36, accel: 4.5, accelNitro: 10, brake: 10, reverse: 3, reverseMax: 5, grip: 6.5, gripHandbrake: 1.5, steerRate: 1.6, airSteer: 0.2 },
  mass: 5, engineAt: [2.0, 1.0, 0], collision: { shape: 'capsule', r: 1.3, hl: 2.6 },   // circles reach -3.9 .. 3.9 m: the body sits from -3.88 to 3.39
  siren: SIREN,
  camera: { chase: { dist: 12, h: 4.5 }, near: { dist: 8.5, h: 3.5 }, cockpit: { eye: [2.4, 2.4, -0.6] }, bumper: { eye: [3.5, 0.9, 0] }, drone: { dist: 24, h: 15 } },
  sound: { gears: [0, 12, 24, 38, 55, 75, 999],
    engine: { cylinders: 6, idleRpm: 600, shiftRpm: 2100, limitRpm: 2400, topKmh: 100, harmonics: [{ mul: 0.5, gain: 0.65, detune: -6 }, { mul: 1, gain: 1, detune: 0 }, { mul: 1.5, gain: 0.3, detune: 5 }, { mul: 2, gain: 0.3, detune: -4 }],
      filter: { idle: 250, open: 1250, offLoad: 0.45, q: 1.2 }, gain: { idle: 0.08, rev: 0.05, load: 0.11 }, shiftTime: 0.35, shiftDip: 0.5, nitroHiss: 0.07 },
    horn: { notes: [196, 247], dur: 1.0, gain: 0.26, band: 900, wave: 'sawtooth' },
    crash: { weight: 2.4, thump: 46, noise: 1000, gain: 1 } },   // a turbo diesel under the cab, six gears; a deep two-tone air horn beside the siren
  blinkers: [[3.26, 0.68, 1.2], [-3.84, 1.35, 1.2]],   // beside the head lamps and above the tail lamps
};
