// #241: the covered wooden Holzbrücke Stein–Bad Säckingen, laid out from measurements instead of by eye. Pure: no three.js, no DOM.
// Sources: swisstopo swissBUILDINGS3D 3.0, tile 1049-33 (2024), BuildingPart ID_62E48E33-707A-4079-8CA2-B966E2A4E3D5 (roof heights,
// chapel extents) and de.wikipedia.org "Holzbrücke Bad Säckingen" (seven openings of 29.10, 31.10, 26.21, 26.61, 21.19, 23.14 and
// 28.06 m from Säckingen on six piers; chapels on the second and fourth pier). See docs/superpowers/specs/2026-10-10-holzbruecke-true-to-plan-design.md
import { polylineLength } from './world.js';

export const HOLZ = {
  eave: 4.2, ridge: 6.4,            // m above the deck surface
  overhang: 0.9,                    // roof edge beyond the deck edge
  parapet: 1.1,                     // boarded lower wall
  bay: 5,                           // largest frame spacing, m
  pierFractions: [0.1452, 0.2738, 0.3928, 0.5384, 0.6820, 0.8497],   // pier centres along the bridge, from the Stein end
  pierWidth: 3.05,                  // along the bridge
  chapels: [                        // pier: index into pierFractions; side: +1 = south (+z), -1 = north; depth: out from the wall
    { pier: 4, side: 1, kind: 'polygon', depth: 3.0, length: 4.0 },
    { pier: 4, side: -1, kind: 'polygon', depth: 1.7, length: 4.0 },
    { pier: 2, side: 1, kind: 'pent', depth: 1.0, length: 2.0 },
  ],
};

// Stein is the eastern end; fractions and chapel sides count from there, and the direction of an OSM way is no contract
export function orientEastWest(pts) { return pts[0][0] >= pts[pts.length - 1][0] ? pts : pts.slice().reverse(); }

// one polyline from pieces that share endpoints (an OSM bridge may be split into several ways); a piece touching nothing is left out
export function joinPolylines(lines, tol = 0.5) {
  const touch = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const rest = lines.slice().sort((a, b) => polylineLength(b) - polylineLength(a));
  let out = rest.shift().slice();
  for (let grown = true; grown;) {
    grown = false;
    for (let i = 0; i < rest.length; i++) {
      const l = rest[i], back = l.slice().reverse(), head = out[0], tail = out[out.length - 1];
      const next = touch(tail, l[0]) ? out.concat(l.slice(1)) : touch(tail, back[0]) ? out.concat(back.slice(1))
        : touch(head, back[0]) ? l.slice(0, -1).concat(out) : touch(head, l[0]) ? back.slice(0, -1).concat(out) : null;
      if (!next) continue;
      out = next; rest.splice(i, 1); grown = true; break;
    }
  }
  return out;
}

function distinct(pts) {
  const out = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (out.length < 2) throw new Error('holzbruecke: a line needs at least two distinct points');
  return out;
}

// point and unit direction at arc length t; on a vertex the direction is that of the segment starting there
function station(line, t) {
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (acc + L > t || i === line.length - 2) {
      const u = Math.min(1, Math.max(0, (t - acc) / L));
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, ux: (bx - ax) / L, uz: (bz - az) / L, t };
    }
    acc += L;
  }
}

// a frame on every vertex, and evenly spaced frames in between so that no gap exceeds bay
export function frameStations(pts, bay) {
  const line = distinct(pts), out = [];
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const L = Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]), n = Math.max(1, Math.ceil(L / bay));
    for (let k = 0; k < n; k++) out.push(station(line, acc + L * k / n));
    acc += L;
  }
  out.push(station(line, acc));
  return out;
}

export function pierStations(pts, fractions) {
  const line = distinct(pts), len = polylineLength(line);
  return fractions.map(f => station(line, f * len));
}
