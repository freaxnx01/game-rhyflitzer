#!/usr/bin/env node
// #179: the pipeline's bridge to the game's own A* (prototype/route.js), so "drivable" means drivable on the game's
// road graph: one A*, no Python port. Pure stdin -> stdout, no files.
// stdin:  {"roads": [world roads], "points": [[x, z], ...], "pairs": [[i, j], ...], "maxSnap": 60}
// stdout: {"snap": [{"x", "z", "d"} | null per point], "len": [route metres | null per pair]}
import { buildGraph, snapToGraph, findRoute } from '../prototype/route.js';

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const req = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const g = buildGraph(req.roads);
const snaps = req.points.map(([x, z]) => snapToGraph(g, x, z, req.maxSnap ?? 60));
const len = req.pairs.map(([i, j]) => {
  if (!snaps[i] || !snaps[j]) return null;
  const r = findRoute(g, snaps[i], [snaps[j]]);
  return r ? Math.round(r.len * 10) / 10 : null;
});
const r1 = (v) => Math.round(v * 10) / 10;
process.stdout.write(JSON.stringify({ snap: snaps.map((s) => (s ? { x: r1(s.x), z: r1(s.z), d: r1(s.d) } : null)), len }));
