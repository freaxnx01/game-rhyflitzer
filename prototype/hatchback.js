// hatchback.js — the Hatchback vehicle table entry and its wheel-node helpers (#236).
// Pure module: no DOM, no three.js, so node --test can import it. The model is a glTF file (assets/hatchback.glb), built by index.html.

export const HATCHBACK = {
  model: 'gltf', gltf: { id: 'hatchback', url: './assets/hatchback.glb', fallback: 'compact' }, scale: 1.0, paint: true, defaultPaint: 'swiss',
  wheels: [[1.36, 0.77], [-1.36, 0.77]], wheelR: 0.33,
  drive: { top: 64, topNitro: 95, accel: 17.5, accelNitro: 36, brake: 25, reverse: 8, reverseMax: 14, grip: 10, gripHandbrake: 1.8, steerRate: 2.7, airSteer: 0.4 },
  mass: 1.1, engineAt: [1.4, 1.0, 0], collision: { shape: 'circle', r: 1.25 },
  camera: { chase: { dist: 6.9, h: 2.5 }, near: { dist: 4.6, h: 1.8 }, cockpit: { eye: [-0.2, 1.18, -0.37] }, bumper: { eye: [2.2, 0.5, 0] }, drone: { dist: 18, h: 12 } },
  sound: { gears: [0, 21, 47, 78, 113, 153, 999],
    engine: { cylinders: 4, idleRpm: 900, shiftRpm: 6800, limitRpm: 7400, topKmh: 330, harmonics: [{ mul: 0.5, gain: 0.3, detune: -8 }, { mul: 1, gain: 1, detune: 0 }, { mul: 2, gain: 0.6, detune: 6 }, { mul: 3, gain: 0.3, detune: -5 }, { mul: 4, gain: 0.16, detune: 9 }],
      filter: { idle: 500, open: 3000, offLoad: 0.55, q: 1.8 }, gain: { idle: 0.06, rev: 0.06, load: 0.1 }, shiftTime: 0.15, shiftDip: 0.6, nitroHiss: 0.07 },
    horn: { notes: [392, 494], dur: 0.9, gain: 0.22, band: 1400, wave: 'square' },
    crash: { weight: 1, thump: 72, noise: 1900, gain: 1 } },
  blinkers: [[2.12, 0.62, 0.74], [-2.10, 0.7, 0.74]],   // mirrored to ±z; the indicator boxes of the compact, at this body
};

export const WHEEL_NODES = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];

// [{ name, front, side }] in FL FR RL RR order; side -1 = left (-z), +1 = right
export function wheelPlan(nodeNames) {
  return WHEEL_NODES.map(name => {
    if (!nodeNames.includes(name)) throw new Error(`hatchback: wheel node ${name} missing`);
    return { name, front: name[6] === 'F', side: name[7] === 'L' ? -1 : 1 };
  });
}

// centres { name: [x, y, z] } -> plan plus x, z and r (the centre height is the wheel radius)
export function wheelEntries(centres) {
  return wheelPlan(Object.keys(centres)).map(w => {
    const [x, y, z] = centres[w.name];
    return { ...w, x, z, r: y };
  });
}

// [[x, |z|] front, [x, |z|] rear] — the shape of VEHICLES[..].wheels
export function tableWheels(entries) {
  const front = entries.find(w => w.front), rear = entries.find(w => !w.front);
  return [[front.x, Math.abs(front.z)], [rear.x, Math.abs(rear.z)]];
}
