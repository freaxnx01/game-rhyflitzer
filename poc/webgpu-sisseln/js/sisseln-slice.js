// PoC Sisseln (#987): cuts the Sisseln slice out of data/world_hochrhein.json.
// Pure: no three.js, no DOM, so node --test can load it.

// World metres around the world origin (Sisseln). World x/z map straight onto three.js x/z, y is up.
// The design named x1 = 1300 for a box holding "the village centre, the Plattform, the DSM chimney and the Rhine".
// Sisseln's built-up centre actually sits at x 1500 ... 2000 (the `SISSELN` label is at x 1950), so x1 = 1300 held
// the Sisslerfeld and 105 buildings but not the village. x1 = 2300 keeps everything the design named and adds the
// village itself: 659 buildings, the station and the Landi tower. The design leaves the exact bounds to the builder.
export const SLICE = { x0: -700, x1: 2300, z0: -1000, z1: 1000 };

// Geometry is clipped to the slice plus this margin, and the terrain is built over the same outer box: a feature
// that straddles the edge then still stands on ground instead of floating past it. Fog hides the edge itself.
export const MARGIN = 300;

export function expandBox(box, margin) {
  return { x0: box.x0 - margin, x1: box.x1 + margin, z0: box.z0 - margin, z1: box.z1 + margin };
}

export function inSlice(x, z, box = SLICE) {
  return x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

// A feature counts as touching the box when its bounding box overlaps it: a road that crosses the slice without a
// single vertex inside is kept too.
export function ringTouches(ring, box) {
  if (!ring || ring.length === 0) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return maxX >= box.x0 && minX <= box.x1 && maxZ >= box.z0 && minZ <= box.z1;
}

// Where the segment a -> b crosses the box edge, as a fraction of the segment (1 when it stays inside).
function exitFraction(a, b, box) {
  let t = 1;
  const limits = [
    [a[0], b[0], box.x0, box.x1],
    [a[1], b[1], box.z0, box.z1]
  ];
  for (const [from, to, lo, hi] of limits) {
    if (to < lo) t = Math.min(t, (lo - from) / (to - from));
    if (to > hi) t = Math.min(t, (hi - from) / (to - from));
  }
  return Math.max(0, Math.min(1, t));
}

const lerpPoint = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Splits a polyline into the pieces that run inside the box, each cut off exactly on the edge.
export function clipPolyline(pts, box) {
  const pieces = [];
  let piece = [];
  for (let i = 0; i < pts.length; i++) {
    const point = pts[i];
    const inside = inSlice(point[0], point[1], box);
    if (inside) {
      if (piece.length === 0 && i > 0) piece.push(lerpPoint(point, pts[i - 1], exitFraction(point, pts[i - 1], box)));
      piece.push(point);
      continue;
    }
    if (piece.length > 0) {
      piece.push(lerpPoint(pts[i - 1], point, exitFraction(pts[i - 1], point, box)));
      pieces.push(piece);
      piece = [];
    }
  }
  if (piece.length >= 2) pieces.push(piece);
  return pieces.filter((p) => p.length >= 2);
}

const EDGES = [
  { keep: (p, box) => p[0] >= box.x0, cut: (a, b, box) => (box.x0 - a[0]) / (b[0] - a[0]) },
  { keep: (p, box) => p[0] <= box.x1, cut: (a, b, box) => (box.x1 - a[0]) / (b[0] - a[0]) },
  { keep: (p, box) => p[1] >= box.z0, cut: (a, b, box) => (box.z0 - a[1]) / (b[1] - a[1]) },
  { keep: (p, box) => p[1] <= box.z1, cut: (a, b, box) => (box.z1 - a[1]) / (b[1] - a[1]) }
];

// Sutherland-Hodgman against the four box edges: the clip region is convex, so one pass per edge is exact.
export function clipRing(ring, box) {
  let output = ring;
  for (const edge of EDGES) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentIn = edge.keep(current, box);
      const previousIn = edge.keep(previous, box);
      if (currentIn !== previousIn) output.push(lerpPoint(previous, current, edge.cut(previous, current, box)));
      if (currentIn) output.push(current);
    }
    if (output.length === 0) return [];
  }
  return output.length >= 3 ? output : [];
}

const list = (value) => (Array.isArray(value) ? value : []);

function slicePolylines(items, box) {
  const out = [];
  for (const item of items) {
    if (!ringTouches(item.pts, box)) continue;
    for (const pts of clipPolyline(item.pts, box)) out.push({ ...item, pts });
  }
  return out;
}

function sliceRings(items, box) {
  const out = [];
  for (const item of items) {
    if (!ringTouches(item.ring, box)) continue;
    const ring = clipRing(item.ring, box);
    if (ring.length >= 3) out.push({ ...item, ring });
  }
  return out;
}

// Water bodies carry several rings; a body is kept with whichever of its rings survives the clip.
function sliceWater(items, box) {
  const out = [];
  for (const item of items) {
    const rings = list(item.rings)
      .filter((ring) => ringTouches(ring, box))
      .map((ring) => clipRing(ring, box))
      .filter((ring) => ring.length >= 3);
    if (rings.length > 0) out.push({ ...item, rings });
  }
  return out;
}

/**
 * Everything the PoC draws, cut out of a parsed world_hochrhein.json. Missing optional arrays come back empty, so a
 * world file without `streams`, `fields` or `props` builds the same way.
 */
export function sliceWorld(world = {}, box = SLICE) {
  const outer = expandBox(box, MARGIN);
  const landmarks = (world.anchors && world.anchors.landmarks) || {};
  return {
    roads: slicePolylines(list(world.roads), outer),
    streams: slicePolylines(list(world.streams), outer),
    buildings: list(world.buildings).filter((building) => ringTouches(building.ring, box)),
    water: sliceWater(list(world.water), outer),
    forests: sliceRings(list(world.forests), outer),
    fields: sliceRings(list(world.fields), outer),
    props: list(world.props).filter((prop) => inSlice(prop.x, prop.z, box)),
    landmarks: {
      plattform: landmarks.plattform || null,
      dsmChimney: landmarks.dsmChimney || null
    }
  };
}
