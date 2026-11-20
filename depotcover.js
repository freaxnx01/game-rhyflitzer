// depotcover.js — #1045: a draped car cover for the depot's far slots, in place of the plain grey box. Pure module: no
// three.js, no textures. index.html turns positions/indices/colors into one BufferGeometry per kind (smooth normals from
// computeVertexNormals) and scales each instance to its slot's l × h × w.
//
// Unit footprint: x ∈ [-0.5, 0.5] along the length (+x = nose), z ∈ [-0.5, 0.5] across, y ∈ [0, 1]. The tarp is a grid
// of cross-sections along x: each station has a roof height and a cross-section template (crowned top, rounded shoulder,
// side hanging to the hem), the stations at both ends sit on the hem so the cloth rolls over bumper and tail. Open at the
// bottom; four dark tyre stubs stand on the ground under the hem.
export const COVER = { tarp: [0.42, 0.47, 0.55], wheel: [0.08, 0.08, 0.09] };

const HEM = 0.15;                                      // the hem's height; the tyre stubs reach a little above it

// cross-section templates, centre to one hem: [z / half-width, (y - hem) / (roof - hem)]; mirrored to the other side
const SECTION = {
  car: [[0, 1], [0.3, 0.98], [0.55, 0.92], [0.75, 0.82], [0.88, 0.66], [0.95, 0.45], [0.98, 0.22], [1, 0]],
  long: [[0, 1], [0.4, 1], [0.65, 0.985], [0.82, 0.93], [0.92, 0.8], [0.97, 0.55], [0.99, 0.25], [1, 0]],
};

// profile: [x, roof height] tail to nose; width: [|x|, half-width] where the ends round off; wheelX: tyre centres
const KINDS = {
  // a hatchback under cloth: a low boot, a steep hatch up to the roof, a long windscreen slope, a flat bonnet, a blunt nose
  car: {
    profile: [[-0.5, HEM], [-0.48, 0.4], [-0.44, 0.56], [-0.36, 0.62], [-0.3, 0.8], [-0.24, 0.97], [-0.16, 1], [0, 1],
      [0.12, 0.98], [0.18, 0.88], [0.26, 0.68], [0.34, 0.6], [0.42, 0.56], [0.47, 0.46], [0.5, HEM]],
    width: [[0.42, 0.5], [0.47, 0.46], [0.5, 0.4]], section: SECTION.car, wheelX: 0.33,
  },
  // a bus or truck under cloth: a box with a flat roof and a slightly lower, rounded front end
  long: {
    profile: [[-0.5, HEM], [-0.48, 0.55], [-0.45, 0.92], [-0.4, 1], [-0.15, 1], [0.1, 1], [0.3, 1], [0.38, 0.97], [0.44, 0.9], [0.47, 0.75],
      [0.49, 0.45], [0.5, HEM]],
    width: [[0.45, 0.5], [0.48, 0.47], [0.5, 0.42]], section: SECTION.long, wheelX: 0.38,
  },
};

// the tyre stub's outline in the x-y plane, counter-clockwise seen from +z: a block with the tread corners knocked off
const TYRE = [[-0.07, HEM + 0.02], [-0.07, 0.06], [-0.045, 0], [0.045, 0], [0.07, 0.06], [0.07, HEM + 0.02]];
const TYRE_Z = [0.37, 0.47];

function halfWidth(kind, x) {
  const ax = Math.abs(x), w = kind.width;
  if (ax <= w[0][0]) return w[0][1];
  for (let i = 0; i + 1 < w.length; i++) if (ax <= w[i + 1][0]) return w[i][1] + (w[i + 1][1] - w[i][1]) * (ax - w[i][0]) / (w[i + 1][0] - w[i][0]);
  return w[w.length - 1][1];
}

function push(out, x, y, z, color) { out.positions.push(x, y, z); out.colors.push(...color); return out.positions.length / 3 - 1; }
function quad(out, a, b, c, d) { out.indices.push(a, b, c, a, c, d); }

// the tarp: one ring of vertices per station (hem to hem over the top), quads between neighbouring rings, outside = CCW
function tarp(out, kind) {
  const ring = [...kind.section.slice(1).reverse().map(([t, s]) => [-t, s]), ...kind.section];
  const first = out.positions.length / 3, n = ring.length;
  for (const [x, h] of kind.profile) for (const [t, s] of ring) push(out, x, HEM + (h - HEM) * s, t * halfWidth(kind, x), COVER.tarp);
  for (let i = 0; i + 1 < kind.profile.length; i++) for (let j = 0; j + 1 < n; j++) {
    const a = first + i * n + j, b = first + (i + 1) * n + j;
    quad(out, a, a + 1, b + 1, b);
  }
}

// a tyre stub: the outline extruded from z0 to z1 (z0 < z1), capped at both ends, shifted to x
function tyre(out, x, z0, z1) {
  const near = TYRE.map(([dx, y]) => push(out, x + dx, y, z0, COVER.wheel));
  const far = TYRE.map(([dx, y]) => push(out, x + dx, y, z1, COVER.wheel));
  for (let i = 0; i < TYRE.length; i++) { const j = (i + 1) % TYRE.length; quad(out, near[i], near[j], far[j], far[i]); }
  for (let i = 1; i + 1 < TYRE.length; i++) { out.indices.push(far[0], far[i], far[i + 1]); out.indices.push(near[0], near[i + 1], near[i]); }
}

export function coverMesh(kindName) {
  const kind = KINDS[kindName];
  if (!kind) throw new Error(`coverMesh: unknown kind ${kindName}`);
  const out = { positions: [], indices: [], colors: [] };
  tarp(out, kind);
  for (const x of [-kind.wheelX, kind.wheelX]) { tyre(out, x, TYRE_Z[0], TYRE_Z[1]); tyre(out, x, -TYRE_Z[1], -TYRE_Z[0]); }
  return out;
}
