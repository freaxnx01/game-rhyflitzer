// exhaust.js — where the blue nitro flames sit behind a glTF vehicle. Pure module: no DOM, no three.js, so node --test can import it.
// index.html measures the model's body box (car-local metres, x forward) and puts one cone per spot; a vehicle table entry with
// `exhaustPipes: 1` gets one centred flame (the Rhy Tumbler's jet burner), every other one two side by side. A model whose box reaches
// past its tail (the Rhy Harvester's unloading auger, high up) gives `exhaustAt: [tailX, height]` instead.
export const EXHAUST = {
  flameR: 0.16, flameLen: 1.1,   // the cone, like the procedural cars'
  height: 0.3, minH: 0.3, maxH: 0.8,   // above the body's underside: 30 % of its height, at least 0.3 m, at most 0.8 m (trucks)
  spread: 0.22, maxZ: 0.45,   // each pipe 22 % of the width off the centre line, at most 0.45 m
  overlap: 0.05,   // the cone's base tucks this far into the tail
};

export function exhaustSpots(box, pipes = 2, at) {
  const x = (at ? at[0] : box.min.x) - EXHAUST.flameLen / 2 + EXHAUST.overlap;
  const y = at ? at[1] : box.min.y + Math.min(EXHAUST.maxH, Math.max(EXHAUST.minH, (box.max.y - box.min.y) * EXHAUST.height));
  if (pipes === 1) return [[x, y, 0]];
  const z = Math.min(EXHAUST.maxZ, (box.max.z - box.min.z) * EXHAUST.spread);
  return [[x, y, z], [x, y, -z]];
}
