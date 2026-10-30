#!/usr/bin/env node
// #421: builds prototype/assets/models/vasa.glb — the Vasa (1628) life size, procedurally, from scripts/vasa/vasa-spec.mjs.
//
//   node scripts/vasa/build.mjs                 # → prototype/assets/models/vasa.glb (meshopt-compressed via npx @gltf-transform/cli)
//   node scripts/vasa/build.mjs --raw out.glb   # uncompressed, no npx
//
// three.js 0.170 is fetched once from jsdelivr into $THREE_DIR (default: <os tmpdir>/rhyflitzer-three-0.170.0); the repo keeps no
// package.json. Memory-heavy, so run it as `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 node scripts/vasa/build.mjs`.
//
// Frame: metres, +x bow, +y up, +z starboard, origin = keel underside midway between the perpendiculars (see vasa-spec.mjs).
// Scene nodes: `hull` (hull, decks, castles, beakhead, masts, yards — one wood material with vertex colours), `rigging` (ropes),
// `stern` (the carved stern: transom, galleries, figures) and `cradle` (the museum's steel supports, floor at y = VASA.floorY).
//
// Swapping in the photogrammetry scan "Vasa Stern" (PeterAtwood, CC BY 4.0, sketchfab.com/3d-models/vasa-stern-21d4057a406f4859812e0b23c50d6b03):
// replace the children of the `stern` node. Its origin is the aft perpendicular at the keel, (VASA.AP, 0, 0) = (-23.75, 0, 0) in
// hull space, with the same axes; the carvings it holds span x ∈ [-4.6, 0] (aft is negative), y ∈ [7.2, 19.3], z ∈ ±6 — the exact
// box is written to the scene extras (`stern.bbox`, hull space) so the scan can be scaled to the taffrail height (19.3 - 7.2 =
// 12.1 m wing transom to taffrail) and its transom centre aligned to x = AP, z = 0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { VASA, BREAKS, ROWS, WALES, rowY, deg, lerp, clamp, smoothstep, deckY, railY, topY, castleDeckY, sternX, stemX, hullX, halfBreadth, gunports, bowspritTip } from './vasa-spec.mjs';

const THREE_VERSION = '0.170.0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

async function ensureThree(dir) {
  const files = { 'three.module.js': `build/three.module.js`, 'GLTFExporter.js': `examples/jsm/exporters/GLTFExporter.js` };
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, remote] of Object.entries(files)) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) continue;
    const url = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/${remote}`;
    console.info(`Fetching ${url} into ${dir}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const text = (await res.text()).replace(/from 'three'/g, "from './three.module.js'");
    fs.writeFileSync(file, text);
  }
  return dir;
}

// GLTFExporter wants the browser's FileReader for the binary pack
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((buf) => { this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`; this.onloadend?.(); }); }
};

const THREE_DIR = await ensureThree(process.env.THREE_DIR || path.join(os.tmpdir(), `rhyflitzer-three-${THREE_VERSION}`));
const THREE = await import(pathToFileURL(path.join(THREE_DIR, 'three.module.js')).href);
const { GLTFExporter } = await import(pathToFileURL(path.join(THREE_DIR, 'GLTFExporter.js')).href);

// ---------- small vector helpers on plain arrays ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mirror = (p) => [p[0], p[1], -p[2]];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(1628);

const colour = (hex, k = 1) => { const c = new THREE.Color(hex).multiplyScalar(k); return [c.r, c.g, c.b]; };
const OAK = 0x56402d, DECK = 0x6a5440, DARK = 0x2a1d14, HOLE = 0x0d0906, MAST = 0x6e4e30, ROPE = 0x2a241e, FIGURE = 0x634a34, GOLD = 0x8c6d32, BLUE = 0x2b3652, STEEL = 0x5a5e66;

// ---------- geometry accumulator: non-indexed triangles with per-vertex normal and colour ----------
class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  get tris() { return this.pos.length / 9; }
  vertex(p, n, c) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]); }
  tri(a, b, c, col, na, nb, nc) {
    const n = na ? null : norm(cross(sub(b, a), sub(c, a)));
    this.vertex(a, na || n, col); this.vertex(b, nb || n, col); this.vertex(c, nc || n, col);
  }
  quad(a, b, c, d, col, normals) {
    const [na, nb, nc, nd] = normals || [];
    this.tri(a, b, c, col, na, nb, nc); this.tri(a, c, d, col, na, nc, nd);
  }
  // a flat quad whose normal must point roughly along `facing`; the winding is flipped when it does not
  quadFacing(a, b, c, d, facing, col) {
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, facing) >= 0) this.quad(a, b, c, d, col); else this.quad(a, d, c, b, col);
  }
  bake(geometry, matrix, col) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) this.vertex([p[i], p[i + 1], p[i + 2]], [n[i], n[i + 1], n[i + 2]], col);
    g.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

const M = THREE.Matrix4, V = THREE.Vector3, Q = THREE.Quaternion;
const v3 = (p) => new V(p[0], p[1], p[2]);
// a cylinder from p0 (radius r0) to p1 (radius r1)
function beam(b, p0, p1, r0, r1, col, radial = 8) {
  const d = sub(p1, p0), h = len(d);
  if (h < 1e-4) return;
  const q = new Q().setFromUnitVectors(new V(0, 1, 0), v3(norm(d)));
  const m = new M().compose(v3(mix(p0, p1, 0.5)), q, new V(1, 1, 1));
  b.bake(new THREE.CylinderGeometry(r1, r0, h, radial, 1), m, col);
}
// an orthonormal frame at p: +z = facing, +y = world up (orthogonalised), +x = their right
function frameAt(p, facing, scale = [1, 1, 1]) {
  const f = norm(facing);
  let u = sub([0, 1, 0], mul(f, f[1])); if (len(u) < 1e-3) u = [1, 0, 0]; u = norm(u);
  const r = norm(cross(u, f));
  return new M().makeBasis(v3(r), v3(u), v3(f)).setPosition(v3(p)).scale(new V(...scale));
}
function box(b, centre, size, col, facing = [0, 0, 1]) {
  b.bake(new THREE.BoxGeometry(1, 1, 1), frameAt(centre, facing, size), col);
}
function ball(b, centre, r, col, scale = [1, 1, 1], facing = [0, 0, 1]) {
  b.bake(new THREE.SphereGeometry(r, 9, 6), frameAt(centre, facing, scale), col);
}
// a carved figure: standing at foot, h tall, facing out — the stern of the Vasa carries hundreds of these
function statue(b, foot, facing, h, col = colour(FIGURE)) {
  const f = norm(facing), fr = frameAt(foot, f), right = norm(cross([0, 1, 0], f));
  const at = (y, dx = 0, dz = 0) => add(add(foot, [0, y, 0]), add(mul(right, dx), mul(f, dz)));
  box(b, at(0.08), [h * 0.34, 0.16, h * 0.3], colour(DARK), f);
  for (const dx of [-0.07, 0.07]) b.bake(new THREE.CylinderGeometry(h * 0.06, h * 0.05, h * 0.42, 6, 1), fr.clone().setPosition(v3(at(0.16 + h * 0.21, dx * h))), col);
  box(b, at(0.16 + h * 0.55), [h * 0.3, h * 0.28, h * 0.17], col, f);                 // torso
  box(b, at(0.16 + h * 0.4, 0, h * 0.02), [h * 0.26, h * 0.06, h * 0.19], col, f);     // belt / skirt
  for (const dx of [-0.19, 0.19]) b.bake(new THREE.CylinderGeometry(h * 0.045, h * 0.04, h * 0.3, 5, 1), fr.clone().setPosition(v3(at(0.16 + h * 0.52, dx * h))), col);
  ball(b, at(0.16 + h * 0.78), h * 0.085, col, [1, 1.15, 1], f);
}

// ---------- hull surface ----------
const NS = 97;                                              // stations from sternpost to stem
const surf = (s, y) => [hullX(s, y), y, halfBreadth(s, y)];
function surfNormal(s, y) {
  const ds = 0.002, dy = 0.03, s0 = clamp(s - ds, 0, 1), s1 = clamp(s + ds, 0, 1);
  const dS = sub(surf(s1, y), surf(s0, y)), dY = sub(surf(s, y + dy), surf(s, Math.max(0, y - dy)));
  return norm(cross(dS, dY));
}
function surfTangent(s, y) { const s0 = clamp(s - 0.002, 0, 1), s1 = clamp(s + 0.002, 0, 1); return norm(sub(surf(s1, y), surf(s0, y))); }
const sAtX = (x, y = 11) => (x - sternX(y)) / (stemX(y) - sternX(y));

function hullStrakes(b) {
  const ABOVE = 8, stations = [];
  let beamMax = 0;
  for (let i = 0; i < NS; i++) {
    const s = i / (NS - 1), rows = [];
    for (let j = 0; j < ROWS.length; j++) rows.push(rowY(j, s));
    const rail = railY(s), top = topY(s);
    for (let k = 1; k <= ABOVE; k++) rows.push(rail + (top - rail) * k / ABOVE);
    stations.push(rows.map((y) => { const p = surf(s, y); beamMax = Math.max(beamMax, p[2]); return { p, n: surfNormal(s, y) }; }));
  }
  const bands = stations[0].length - 1;
  const bandColour = [], bandOffset = [];
  for (let j = 0; j < bands; j++) {
    const wale = WALES.has(j), above = j >= ROWS.length - 1;
    bandOffset.push(wale ? 0.14 : 0);
    bandColour.push(colour(OAK, wale ? 0.55 : above ? 0.8 + rand() * 0.3 : 0.7 + rand() * 0.5));
  }
  for (const side of [1, -1]) {
    for (let j = 0; j < bands; j++) {
      const o = bandOffset[j];
      for (let i = 0; i < NS - 1; i++) {
        const A = stations[i][j], B = stations[i + 1][j], C = stations[i + 1][j + 1], D = stations[i][j + 1];
        if (C.p[1] - B.p[1] < 1e-3 && D.p[1] - A.p[1] < 1e-3) continue;      // no castle here: degenerate band
        const at = (v) => { const p = add(v.p, mul(v.n, o)); return side > 0 ? p : mirror(p); };
        const nn = (v) => side > 0 ? v.n : mirror(v.n);
        const c = bandColour[j].map((x) => x * (0.92 + 0.16 * rand()));
        if (side > 0) b.quad(at(A), at(B), at(C), at(D), c, [nn(A), nn(B), nn(C), nn(D)]);
        else b.quad(at(A), at(D), at(C), at(B), c, [nn(A), nn(D), nn(C), nn(B)]);
        if (j + 1 < bands && bandOffset[j + 1] !== o) {                        // the step onto / off a wale
          const o2 = bandOffset[j + 1], E = stations[i][j + 1], F = stations[i + 1][j + 1];
          const p = (v, off) => { const q = add(v.p, mul(v.n, off)); return side > 0 ? q : mirror(q); };
          b.quadFacing(p(E, o), p(F, o), p(F, o2), p(E, o2), [0, o2 > o ? -1 : 1, 0], colour(OAK, 0.5));
        }
      }
    }
  }
  closeHull(b, stations, bands);
  return { beam: 2 * (beamMax + 0.14) };
}
// bottom, transom and stem strips between the two sides
function closeHull(b, stations, bands) {
  const dark = colour(OAK, 0.7);
  for (let i = 0; i < NS - 1; i++) {
    const A = stations[i][0].p, B = stations[i + 1][0].p;
    b.quadFacing(A, B, mirror(B), mirror(A), [0, -1, 0], dark);
  }
  for (const [i, facing] of [[0, [-1, 0, 0]], [NS - 1, [1, 0, 0]]]) {
    for (let j = 0; j < bands; j++) {
      const A = stations[i][j].p, D = stations[i][j + 1].p;
      if (D[1] - A[1] < 1e-3) continue;
      b.quadFacing(A, D, mirror(D), mirror(A), facing, dark);
    }
  }
}

// ---------- decks, bulwarks, deck breaks ----------
function deckPlanks(b, s0, s1, yAt, nS = 20) {
  const inner = (s) => halfBreadth(s, yAt(s)) - 0.35, width = 0.34;
  const zmax = Math.max(inner(s0), inner(lerp(s0, s1, 0.5)), inner(s1));
  for (let z0 = -zmax; z0 < zmax; z0 += width) {
    const col = colour(DECK, 0.85 + rand() * 0.3), z1 = z0 + width;
    for (let i = 0; i < nS; i++) {
      const sa = lerp(s0, s1, i / nS), sb = lerp(s0, s1, (i + 1) / nS), ya = yAt(sa), yb = yAt(sb), ha = inner(sa), hb = inner(sb);
      const a = [hullX(sa, ya), ya, clamp(z0, -ha, ha)], d = [hullX(sa, ya), ya, clamp(z1, -ha, ha)];
      const bb = [hullX(sb, yb), yb, clamp(z0, -hb, hb)], c = [hullX(sb, yb), yb, clamp(z1, -hb, hb)];
      if (d[2] - a[2] < 1e-3 && c[2] - bb[2] < 1e-3) continue;
      b.quadFacing(a, bb, c, d, [0, 1, 0], col);
    }
  }
}
function bulwark(b, s0, s1, deckAt, nS = 24) {
  const cap = colour(OAK, 0.75), inside = colour(OAK, 0.55);
  for (const side of [1, -1]) for (let i = 0; i < nS; i++) {
    const pts = [lerp(s0, s1, i / nS), lerp(s0, s1, (i + 1) / nS)].map((s) => {
      const top = topY(s), O = surf(s, top), yd = deckAt(s);
      const I = [O[0], O[1], O[2] - 0.35], D = [hullX(s, yd), yd, halfBreadth(s, yd) - 0.35];
      return side > 0 ? [O, I, D] : [mirror(O), mirror(I), mirror(D)];
    });
    b.quadFacing(pts[0][0], pts[1][0], pts[1][1], pts[0][1], [0, 1, 0], cap);
    b.quadFacing(pts[0][1], pts[1][1], pts[1][2], pts[0][2], [0, 0, -side], inside);
  }
}
function deckBreak(b, s, yLow, yHigh, facing) {
  const hl = halfBreadth(s, yLow) - 0.35, hh = halfBreadth(s, yHigh) - 0.35;
  b.quadFacing([hullX(s, yLow), yLow, -hl], [hullX(s, yLow), yLow, hl], [hullX(s, yHigh), yHigh, hh], [hullX(s, yHigh), yHigh, -hh], facing, colour(OAK, 0.6));
}
function decks(b) {
  const eps = 0.004;
  deckPlanks(b, BREAKS.quarter, BREAKS.fore, deckY, 28);
  deckPlanks(b, BREAKS.poop + eps, BREAKS.quarter - eps, castleDeckY, 12);
  deckPlanks(b, 0.004, BREAKS.poop - eps, castleDeckY, 10);
  deckPlanks(b, BREAKS.fore + eps, 0.985, castleDeckY, 12);
  bulwark(b, BREAKS.quarter, BREAKS.fore, deckY, 30);
  bulwark(b, BREAKS.poop + eps, BREAKS.quarter - eps, castleDeckY, 14);
  bulwark(b, 0.004, BREAKS.poop - eps, castleDeckY, 12);
  bulwark(b, BREAKS.fore + eps, 0.985, castleDeckY, 14);
  deckBreak(b, BREAKS.quarter, deckY(BREAKS.quarter), castleDeckY(BREAKS.quarter - eps), [1, 0, 0]);
  deckBreak(b, BREAKS.fore, deckY(BREAKS.fore), castleDeckY(BREAKS.fore + eps), [-1, 0, 0]);
  deckBreak(b, BREAKS.poop, castleDeckY(BREAKS.poop + eps), castleDeckY(BREAKS.poop - eps), [1, 0, 0]);
  for (const [s, w, l] of [[0.46, 2.6, 3.2], [0.62, 2.2, 2.6]]) {                      // hatches with gratings
    const y = deckY(s) + 0.3, x = hullX(s, y);
    box(b, [x, y - 0.15, 0], [l, 0.3, w], colour(OAK, 0.7), [1, 0, 0]);
    b.quadFacing([x - l / 2, y + 0.01, -w / 2], [x + l / 2, y + 0.01, -w / 2], [x + l / 2, y + 0.01, w / 2], [x - l / 2, y + 0.01, w / 2], [0, 1, 0], colour(HOLE));
  }
  const cs = 0.55, cy = deckY(cs);                                                       // capstan
  beam(b, [hullX(cs, cy), cy, 0], [hullX(cs, cy), cy + 1.5, 0], 0.5, 0.42, colour(OAK, 0.8), 10);
}

// ---------- gunports with open lids ----------
function gunportsOpen(b) {
  const hole = colour(HOLE), reveal = colour(DARK), lid = colour(OAK, 0.8);
  for (const [s, y, kind] of gunports()) for (const side of [1, -1]) {
    const P0 = surf(s, y), n0 = surfNormal(s, y), t0 = surfTangent(s, y);
    const P = side > 0 ? P0 : mirror(P0), n = side > 0 ? n0 : mirror(n0), t = side > 0 ? t0 : mirror(t0);
    let u = norm(cross(n, t)); if (u[1] < 0) u = mul(u, -1);
    const w = kind === 'castle' ? 0.7 : 0.95, h = kind === 'castle' ? 0.65 : 0.85, depth = 0.35;
    const corner = (sx, sy, d) => add(add(add(P, mul(t, sx * w / 2)), mul(u, sy * h / 2)), mul(n, 0.03 - d));
    const o = [corner(-1, -1, 0), corner(1, -1, 0), corner(1, 1, 0), corner(-1, 1, 0)];
    const q = [corner(-1, -1, depth), corner(1, -1, depth), corner(1, 1, depth), corner(-1, 1, depth)];
    b.quadFacing(q[0], q[1], q[2], q[3], n, hole);
    const centre = add(P, mul(n, -depth / 2));
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4, midp = mix(mix(o[k], o[k2], 0.5), mix(q[k], q[k2], 0.5), 0.5);
      b.quadFacing(o[k], o[k2], q[k2], q[k], sub(centre, midp), reveal);
    }
    const d = add(mul(u, 0.34), mul(n, 0.94));                                            // the lid, swung open on its top hinge
    const hinge = add(P, add(mul(u, h / 2), mul(n, 0.03)));
    b.bake(new THREE.BoxGeometry(w, h, 0.08), new M().makeBasis(v3(t), v3(d), v3(norm(cross(t, d)))).setPosition(v3(add(hinge, mul(d, h / 2)))), lid);
  }
}

// ---------- masts, yards, bowsprit and the rigging ----------
const ropes = [];      // [a, b, radius]
const rope = (a, b, r = 0.05) => ropes.push([a, b, r]);
function ratlines(shrouds) {
  const y0 = Math.max(...shrouds.map((s) => s[0][1])) + 1.2, y1 = Math.min(...shrouds.map((s) => s[1][1])) - 1.0;
  for (let y = y0; y < y1; y += 0.45) {
    const pts = shrouds.map(([a, b]) => mix(a, b, (y - a[1]) / (b[1] - a[1])));
    for (let k = 0; k + 1 < pts.length; k++) rope(pts[k], pts[k + 1], 0.025);
  }
}
function shroudSet(b, mast, pos, yFoot, yHead, count, headZ, headSpread) {
  for (const side of [1, -1]) {
    const set = [];
    for (let k = 0; k < count; k++) {
      const f = count === 1 ? 0.5 : k / (count - 1);
      const foot = yFoot(f, side), head = add(pos(yHead), [lerp(-headSpread, headSpread, f) * 0.5, 0, side * headZ]);
      rope(foot, head); set.push([foot, head]);
    }
    if (count > 2) ratlines(set);
  }
}
function channelFeet(b, x, yc, count, side) {
  const s = sAtX(x, yc), P = surf(s, yc), n = surfNormal(s, yc), t = surfTangent(s, yc);
  const centre = add(P, mul(n, 0.36)), sp = side > 0 ? centre : mirror(centre);
  b.bake(new THREE.BoxGeometry(4.6, 0.14, 0.72), new M().makeBasis(v3(side > 0 ? t : mirror(t)), v3([0, 1, 0]), v3(side > 0 ? n : mirror(n))).setPosition(v3(sp)), colour(OAK, 0.7));
  return (f) => { const p = add(add(P, mul(n, 0.72)), add(mul(t, lerp(-2.1, 2.1, f)), [0, 0.1, 0])); return side > 0 ? p : mirror(p); };
}
function squareMast(b, m, deckAt) {
  const s = sAtX(m.x), y0 = deckAt(s), H = m.truck, tanR = Math.tan(deg(m.rake));
  const pos = (y) => [m.x - tanR * (y - y0), y, 0];
  const h1 = y0 + (H - y0) * 0.5, h2 = y0 + (H - y0) * 0.8, mast = colour(MAST), deck = colour(DECK, 0.8);
  beam(b, pos(y0 - 1.2), pos(h1), 0.55, 0.38, mast, 10);
  b.bake(new THREE.CylinderGeometry(2.0, 1.7, 0.3, 14, 1), new M().setPosition(v3(pos(h1 - 1.2))), deck);
  box(b, pos(h1 - 1.5), [3.4, 0.3, 2.4], colour(OAK, 0.7), [0, 0, 1]);
  beam(b, pos(h1 - 3.4), pos(h2), 0.3, 0.2, mast, 8);
  box(b, pos(h2 - 0.9), [3.0, 0.16, 0.3], colour(OAK, 0.7), [0, 0, 1]);
  box(b, pos(h2 - 0.9), [0.4, 0.16, 2.6], colour(OAK, 0.7), [0, 0, 1]);
  beam(b, pos(h2 - 2.3), pos(H - 0.6), 0.16, 0.08, mast, 7);
  ball(b, pos(H - 0.2), 0.24, colour(OAK, 0.7));
  const yards = [[h1 - 3.0, m.yard, 0.32, 0.12], [h2 - 2.4, m.yard * 0.62, 0.2, 0.08], [H - 3.2, m.yard * 0.36, 0.12, 0.05]];
  const yardEnds = [];
  for (const [y, L, r0, r1] of yards) {
    const c = add(pos(y), [0.45, 0, 0]);
    beam(b, c, add(c, [0, 0, L / 2]), r0, r1, mast, 7); beam(b, c, add(c, [0, 0, -L / 2]), r0, r1, mast, 7);
    yardEnds.push([add(c, [0, 0, L / 2]), add(c, [0, 0, -L / 2])]);
  }
  const yc = 10.9 * railY(s) / VASA.railMid;
  for (const side of [1, -1]) {
    const foot = channelFeet(b, m.x + 0.3, yc, m.shrouds, side);
    const set = [];
    for (let k = 0; k < m.shrouds; k++) { const f = k / (m.shrouds - 1), a = foot(f), c = add(pos(h1 - 1.4), [lerp(-0.4, 0.4, f), 0, side * 0.9]); rope(a, c); set.push([a, c]); }
    ratlines(set);
    const topSet = [];
    for (let k = 0; k < 5; k++) { const f = k / 4, a = add(pos(h1 - 1.1), [lerp(-1.2, 1.2, f), 0, side * 1.9]), c = add(pos(h2 - 1.1), [lerp(-0.2, 0.2, f), 0, side * 0.4]); rope(a, c, 0.04); topSet.push([a, c]); }
    ratlines(topSet);
    for (let k = 0; k < 3; k++) rope(add(pos(h2 - 0.9), [lerp(-0.9, 0.9, k / 2), 0, side * 1.3]), add(pos(H - 1.2), [0, 0, side * 0.2]), 0.03);
    rope(add(pos(h2 - 1.0), [0, 0, side * 0.3]), foot(0).map((v, i) => i === 0 ? v - 6 : v), 0.04);           // topmast backstay
    rope(add(pos(H - 1.1), [0, 0, side * 0.2]), foot(0).map((v, i) => i === 0 ? v - 10 : v), 0.03);          // topgallant backstay
    rope(yardEnds[0][side > 0 ? 0 : 1], add(pos(h1 - 1.3), [0, 0, side * 0.5]), 0.035);                       // lifts
    rope(yardEnds[1][side > 0 ? 0 : 1], add(pos(h2 - 0.8), [0, 0, side * 0.3]), 0.03);
    rope(yardEnds[2][side > 0 ? 0 : 1], add(pos(H - 0.6), [0, 0, side * 0.15]), 0.025);
  }
  return { pos, h1, h2, H, yardEnds };
}
function mizzenMast(b, m, deckAt) {
  const s = sAtX(m.x), y0 = deckAt(s), H = m.truck, tanR = Math.tan(deg(m.rake));
  const pos = (y) => [m.x - tanR * (y - y0), y, 0];
  const h1 = y0 + (H - y0) * 0.62, mast = colour(MAST);
  beam(b, pos(y0 - 1.2), pos(h1), 0.42, 0.3, mast, 10);
  b.bake(new THREE.CylinderGeometry(1.5, 1.3, 0.28, 12, 1), new M().setPosition(v3(pos(h1 - 1.1))), colour(DECK, 0.8));
  beam(b, pos(h1 - 2.8), pos(H - 0.5), 0.2, 0.09, mast, 8);
  ball(b, pos(H - 0.2), 0.2, colour(OAK, 0.7));
  const dir = norm([-Math.cos(deg(48)), Math.sin(deg(48)), 0]), pivot = add(pos(h1 - 2.2), [0.5, 0, 0]);
  const lo = add(pivot, mul(dir, -m.yard * 0.45)), hi = add(pivot, mul(dir, m.yard * 0.55));
  beam(b, lo, hi, 0.14, 0.22, mast, 7);                                                                       // lateen yard
  const ty = add(pos(H - 2.8), [0.3, 0, 0]);
  beam(b, ty, add(ty, [0, 0, 4.5]), 0.12, 0.05, mast, 6); beam(b, ty, add(ty, [0, 0, -4.5]), 0.12, 0.05, mast, 6);
  const yc = 10.9 * railY(s) / VASA.railMid;
  for (const side of [1, -1]) {
    const foot = channelFeet(b, m.x + 0.2, yc, m.shrouds, side), set = [];
    for (let k = 0; k < m.shrouds; k++) { const f = k / (m.shrouds - 1), a = foot(f), c = add(pos(h1 - 1.3), [lerp(-0.3, 0.3, f), 0, side * 0.7]); rope(a, c); set.push([a, c]); }
    ratlines(set);
    for (let k = 0; k < 3; k++) rope(add(pos(h1 - 1.0), [lerp(-0.8, 0.8, k / 2), 0, side * 1.4]), add(pos(H - 1.0), [0, 0, side * 0.25]), 0.035);
    rope(hi, [VASA.AP - 1.5, VASA.sternTop - 0.5, side * 2.4], 0.035);                                       // vangs
  }
  return { pos, h1, H, lo, hi };
}
function bowsprit(b) {
  const { root, angle, length } = VASA.bowsprit, tip = [...bowspritTip(), 0], r0 = [root[0], root[1], 0];
  const d = norm(sub(tip, r0)), at = (f) => mix(r0, tip, f), mast = colour(MAST);
  beam(b, add(r0, mul(d, -2.5)), tip, 0.44, 0.22, mast, 10);
  const sy = at(0.45);
  beam(b, sy, add(sy, [0, 0, 6.5]), 0.18, 0.07, mast, 6); beam(b, sy, add(sy, [0, 0, -6.5]), 0.18, 0.07, mast, 6);
  const topmastHead = add(tip, [0, 8.5, 0]);
  beam(b, add(tip, [0, -0.5, 0]), topmastHead, 0.15, 0.08, mast, 7);
  b.bake(new THREE.CylinderGeometry(0.95, 0.8, 0.2, 10, 1), new M().setPosition(v3(add(tip, [0, 1.0, 0]))), colour(DECK, 0.8));
  const ty = add(tip, [0, 6.4, 0]);
  beam(b, ty, add(ty, [0, 0, 3.2]), 0.1, 0.05, mast, 6); beam(b, ty, add(ty, [0, 0, -3.2]), 0.1, 0.05, mast, 6);
  for (const side of [1, -1]) {
    rope(add(sy, [0, 0, side * 6.5]), add(tip, [0, 0.3, 0]), 0.03);
    rope(add(tip, [0, 1.0, side * 0.9]), add(topmastHead, [0, -0.6, 0]), 0.03);
  }
  rope(at(0.55), [stemX(6.5) - 0.3, 6.5, 0], 0.05);                                                            // bobstay
  rope(at(0.15), [stemX(9) - 0.2, 9, 0], 0.045);
  return { at, tip, topmastHead, angle, length };
}
function rig(b) {
  const fore = squareMast(b, VASA.masts.fore, castleDeckY), main = squareMast(b, VASA.masts.main, deckY), mizzen = mizzenMast(b, VASA.masts.mizzen, castleDeckY);
  const bs = bowsprit(b);
  rope(fore.pos(fore.h1 - 1.3), bs.at(0.6));                                                                   // forestay
  rope(fore.pos(fore.h2 - 1.0), add(bs.tip, [0, 0.6, 0]), 0.045);
  rope(fore.pos(fore.H - 1.0), bs.topmastHead, 0.035);
  rope(main.pos(main.h1 - 1.3), [stemX(14.2) - 0.5, 14.2, 0], 0.065);                                          // mainstay
  rope(main.pos(main.h2 - 1.0), fore.pos(fore.h1 - 1.6), 0.045);
  rope(main.pos(main.H - 1.0), fore.pos(fore.h2 - 1.0), 0.035);
  rope(mizzen.pos(mizzen.h1 - 1.3), main.pos(deckY(sAtX(VASA.masts.main.x)) + 7), 0.05);
  rope(mizzen.pos(mizzen.H - 1.0), main.pos(main.h1 - 1.2), 0.035);
  for (const side of [0, 1]) {
    rope(main.yardEnds[0][side], mizzen.pos(mizzen.h1 - 2.5), 0.035);                                          // braces
    rope(fore.yardEnds[0][side], main.pos(main.h1 - 3.5), 0.035);
    rope(fore.yardEnds[1][side], main.pos(main.h2 - 3.0), 0.03);
  }
  return { fore, main, mizzen };
}
function ropeMesh(rb) {
  for (const [a, b, r] of ropes) beam(rb, a, b, r, r, colour(ROPE), 3);
}

// ---------- beakhead with the lion ----------
function bezier(p0, p1, p2, t) { return add(add(mul(p0, (1 - t) * (1 - t)), mul(p1, 2 * (1 - t) * t)), mul(p2, t * t)); }
function curvedBeam(b, p0, p1, p2, r0, r1, col, n = 8) {
  for (let i = 0; i < n; i++) beam(b, bezier(p0, p1, p2, i / n), bezier(p0, p1, p2, (i + 1) / n), lerp(r0, r1, i / n), lerp(r0, r1, (i + 1) / n), col, 6);
}
function beakhead(b) {
  const base = [stemX(12.9) - 0.6, 12.9, 0], tip = [33.6, 14.6, 0], oak = colour(OAK, 0.85);
  const corner = (f, sy, sz) => { const p = mix(base, tip, f), w = lerp(1.7, 0.45, f); return [p[0], p[1] + sy * 0.35, sz * w]; };
  const A = [corner(0, 1, -1), corner(0, 1, 1), corner(1, 1, 1), corner(1, 1, -1)], B = [corner(0, -1, -1), corner(0, -1, 1), corner(1, -1, 1), corner(1, -1, -1)];
  b.quadFacing(A[0], A[1], A[2], A[3], [0, 1, 0], colour(DECK, 0.8));
  b.quadFacing(B[0], B[1], B[2], B[3], [0, -1, 0], oak);
  b.quadFacing(A[1], A[2], B[2], B[1], [0, 0, 1], oak); b.quadFacing(A[0], A[3], B[3], B[0], [0, 0, -1], oak);
  b.quadFacing(A[2], A[3], B[3], B[2], [1, 0, 0], oak);
  curvedBeam(b, [stemX(6.8) - 0.2, 6.8, 0], [31.0, 7.6, 0], [33.0, 13.9, 0], 0.5, 0.3, oak, 10);                // knee of the head
  for (const side of [1, -1]) {
    const up0 = [stemX(14.3) - 1.2, 14.4, side * 2.9], up1 = [30.0, 13.6, side * 2.3], up2 = [33.0, 15.1, side * 0.5];
    const lo0 = [stemX(12.4) - 1.0, 12.3, side * 3.3], lo1 = [30.0, 11.9, side * 2.2], lo2 = [32.9, 13.7, side * 0.5];
    curvedBeam(b, up0, up1, up2, 0.2, 0.14, oak, 9); curvedBeam(b, lo0, lo1, lo2, 0.2, 0.14, oak, 9);
    for (let k = 1; k <= 4; k++) beam(b, bezier(lo0, lo1, lo2, k / 5), bezier(up0, up1, up2, k / 5), 0.12, 0.12, oak, 5);
    for (let k = 1; k <= 6; k++) { const p = bezier(up0, up1, up2, k / 7); statue(b, add(p, [0, 0.1, 0]), [0.2, 0, side], 1.3); }
  }
  const lion = colour(0x5e4630), tilt = deg(28), ax = [Math.cos(tilt), Math.sin(tilt), 0];
  const body = add(tip, [1.4, 0.9, 0]);
  b.bake(new THREE.SphereGeometry(1, 12, 8), frameAt(body, [0, 0, 1], [1, 1, 1]).multiply(new M().makeRotationZ(tilt)).scale(new V(1.8, 1.0, 0.8)), lion);
  const neck = add(body, mul(ax, 1.5));
  ball(b, add(neck, [0, 0.25, 0]), 0.95, lion, [0.9, 1, 1.05]);
  ball(b, add(neck, [0.65, 0.5, 0]), 0.62, lion, [1.1, 0.9, 0.9]);
  for (const side of [1, -1]) ball(b, add(neck, [0.3, 1.0, side * 0.5]), 0.2, lion);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ball(b, add(neck, [-0.3 + 0.2 * Math.cos(a), 0.25 + 0.95 * Math.sin(a), 0.95 * Math.cos(a)]), 0.26, lion); }
  for (const side of [1, -1]) {
    beam(b, add(body, [0.9, -0.4, side * 0.45]), add(tip, [3.1, 0.1, side * 0.5]), 0.24, 0.18, lion, 6);
    beam(b, add(body, [-1.0, -0.5, side * 0.5]), add(tip, [0.5, 0.3, side * 0.55]), 0.26, 0.2, lion, 6);
  }
}

// ---------- the carved stern (its own node, origin at the aft perpendicular on the keel) ----------
function transom(y, v) { const w = halfBreadth(0, y); return [sternX(y) - 0.35 * (1 - v * v) - VASA.AP, y, v * w]; }
function transomNormal(y, v) { return norm(cross(sub(transom(y, v + 0.01), transom(y, v - 0.01)), sub(transom(y + 0.02, v), transom(y - 0.02, v)))); }
function sternFace(b) {
  const ys = [VASA.wingTransomY, 8.4, 9.4, 10.6, 11.6, 12.3, 13.4, 14.5, 15.3, 16.4, 17.4, 18.4, VASA.sternTop], cols = 14;
  for (let j = 0; j + 1 < ys.length; j++) {
    const col = colour(OAK, 0.75 + rand() * 0.3);
    for (let k = 0; k < cols; k++) {
      const v0 = -1 + 2 * k / cols, v1 = -1 + 2 * (k + 1) / cols, lift = (y, v) => add(transom(y, v), mul(transomNormal(y, v), 0.06));
      b.quadFacing(lift(ys[j], v0), lift(ys[j], v1), lift(ys[j + 1], v1), lift(ys[j + 1], v0), [-1, -0.3, 0], col);
    }
  }
  const moulding = colour(DARK);
  for (const y of [9.4, 12.3, 15.3, 18.4]) for (let k = 0; k < 12; k++) {
    const v0 = -1.04 + 2.08 * k / 12, v1 = -1.04 + 2.08 * (k + 1) / 12;
    beam(b, add(transom(y, v0), mul(transomNormal(y, v0), 0.16)), add(transom(y, v1), mul(transomNormal(y, v1), 0.16)), 0.17, 0.17, moulding, 6);
  }
  const on = (y, v, out) => add(transom(y, v), mul(transomNormal(y, v), out));
  for (let k = 0; k <= 6; k++) { const v = -0.86 + 1.72 * k / 6; box(b, on(10.85, v, 0.2), [0.3, 2.4, 0.3], moulding, transomNormal(10.85, v)); }
  for (let k = 0; k < 6; k++) { const v = -0.86 + 1.72 * (k + 0.5) / 6; statue(b, on(9.62, v, 0.32), transomNormal(9.6, v), 2.0); }
  for (const v of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const c = on(13.6, v, 0.09), n = transomNormal(13.6, v), r = norm(cross([0, 1, 0], n)), hw = 0.42, hh = 0.55;
    b.quadFacing(add(add(c, mul(r, -hw)), [0, -hh, 0]), add(add(c, mul(r, hw)), [0, -hh, 0]), add(add(c, mul(r, hw)), [0, hh, 0]), add(add(c, mul(r, -hw)), [0, hh, 0]), n, colour(HOLE));
  }
  for (const v of [-0.78, -0.45, -0.15, 0.15, 0.45, 0.78]) statue(b, on(12.52, v, 0.32), transomNormal(12.5, v), 1.9);
  const arms = on(16.9, 0, 0.3), an = transomNormal(16.9, 0);
  box(b, add(arms, mul(an, -0.08)), [2.3, 2.7, 0.18], colour(GOLD), an);
  box(b, arms, [1.9, 2.3, 0.26], colour(BLUE), an);
  for (const [dx, dy] of [[-0.45, 0.4], [0.45, 0.4], [0, -0.45]]) box(b, add(add(arms, mul(norm(cross([0, 1, 0], an)), dx)), [0, dy, 0]), [0.42, 0.34, 0.4], colour(GOLD), an);
  b.bake(new THREE.CylinderGeometry(0.62, 0.5, 0.5, 10, 1), new M().setPosition(v3(on(18.5, 0, 0.35))), colour(GOLD));
  for (const v of [-0.33, 0.33]) statue(b, on(15.58, v, 0.35), transomNormal(15.6, v), 2.5, colour(0x5e4630));
  for (const v of [-0.62, -0.88, 0.62, 0.88]) statue(b, on(15.58, v, 0.32), transomNormal(15.6, v), 2.2);
  for (let k = 0; k < 7; k++) { const v = -0.9 + 1.8 * k / 6; statue(b, on(18.68, v, 0.2), transomNormal(18.6, v), k === 3 ? 1.5 : 0.95); }
  for (const v of [-1.03, 1.03]) { statue(b, on(11.6, v, 0.45), transomNormal(11.6, v), 3.6); statue(b, on(15.5, v, 0.4), transomNormal(15.5, v), 3.0); }
  for (const v of [-0.45, 0.45]) {                                                                                // stern chase ports
    const c = on(8.2, v, 0.1), n = transomNormal(8.2, v), r = norm(cross([0, 1, 0], n));
    b.quadFacing(add(add(c, mul(r, -0.45)), [0, -0.4, 0]), add(add(c, mul(r, 0.45)), [0, -0.4, 0]), add(add(c, mul(r, 0.45)), [0, 0.4, 0]), add(add(c, mul(r, -0.45)), [0, 0.4, 0]), n, colour(HOLE));
  }
}
function quarterGalleries(b) {
  const rows = [[10.6, 0], [11.4, 0.55], [12.2, 0.95], [13.2, 0.95], [14.2, 0.95], [15.0, 0.95], [15.8, 0.65], [16.6, 0.15]], nS = 12, s1 = 0.115;
  const taper = (s) => 1 - smoothstep(0.085, s1, s);
  const G = (s, y, p) => { const q = add(surf(s, y), mul(surfNormal(s, y), p * taper(s))); q[0] -= VASA.AP; return q; };
  for (const side of [1, -1]) {
    const S = (p) => side > 0 ? p : mirror(p);
    for (let j = 0; j + 1 < rows.length; j++) {
      const col = colour(OAK, 0.8 + rand() * 0.25);
      for (let i = 0; i < nS; i++) {
        const sa = s1 * i / nS, sb = s1 * (i + 1) / nS, [ya, pa] = rows[j], [yb, pb] = rows[j + 1];
        b.quadFacing(S(G(sa, ya, pa)), S(G(sb, ya, pa)), S(G(sb, yb, pb)), S(G(sa, yb, pb)), [0, 0, side], col);
      }
      b.quadFacing(S(G(0, rows[j][0], rows[j][1])), S(G(0, rows[j + 1][0], rows[j + 1][1])), S(G(0, rows[j + 1][0], 0)), S(G(0, rows[j][0], 0)), [-1, 0, 0], col);
    }
    for (const y of [12.2, 15.0]) for (let i = 0; i < nS; i++) beam(b, S(G(s1 * i / nS, y, 1.1)), S(G(s1 * (i + 1) / nS, y, 1.1)), 0.14, 0.14, colour(DARK), 5);
    for (const s of [0.03, 0.06, 0.09]) {
      const c = S(G(s, 13.6, 1.0)), n = S(surfNormal(s, 13.6)), t = S(surfTangent(s, 13.6));
      b.quadFacing(add(add(c, mul(t, -0.35)), [0, -0.5, 0]), add(add(c, mul(t, 0.35)), [0, -0.5, 0]), add(add(c, mul(t, 0.35)), [0, 0.5, 0]), add(add(c, mul(t, -0.35)), [0, 0.5, 0]), n, colour(HOLE));
      statue(b, S(G(s, 15.12, 1.0)), n, 1.3);
    }
    ball(b, S(G(0.022, 16.5, 0.5)), 1.05, colour(OAK, 0.7), [1.0, 1.35, 0.9]);
  }
}

// ---------- the museum cradle ----------
function cradle(b) {
  const steel = colour(STEEL), y0 = VASA.floorY;
  for (let x = -17; x <= 17; x += 4.25) box(b, [x, y0 / 2, 0], [1.0, -y0, 1.5], steel, [1, 0, 0]);
  for (const side of [1, -1]) {
    const feet = [];
    for (const x of [-16, -9, -2, 5, 12]) {
      const s = sAtX(x, 3.5), h = halfBreadth(s, 3.5), foot = [x, y0, side * (h + 4.5)], touch = [hullX(s, 3.5), 3.5, side * (h - 0.05)];
      beam(b, foot, touch, 0.2, 0.2, steel, 4);
      box(b, [x, y0 + 0.2, side * (h + 4.5)], [1.2, 0.4, 1.2], steel, [1, 0, 0]);
      feet.push(foot);
    }
    for (let k = 0; k + 1 < feet.length; k++) beam(b, add(feet[k], [0, 0.35, 0]), add(feet[k + 1], [0, 0.35, 0]), 0.12, 0.12, steel, 4);
  }
}

// ---------- assemble, measure, export ----------
function build() {
  const hull = new Builder(), ropesB = new Builder(), stern = new Builder(), cradleB = new Builder();
  const { beam: hullBeam } = hullStrakes(hull);
  decks(hull); gunportsOpen(hull); beakhead(hull); rig(hull); ropeMesh(ropesB);
  sternFace(stern); quarterGalleries(stern); cradle(cradleB);

  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.04, name: 'wood' });
  const ropeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, name: 'rope' });
  const steel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25, name: 'steel' });
  const scene = new THREE.Scene(); scene.name = 'Vasa';
  const mesh = (name, b, mat) => { const m = new THREE.Mesh(b.geometry(), mat); m.name = name; return m; };
  scene.add(mesh('hull', hull, wood), mesh('rigging', ropesB, ropeMat));
  const sternNode = new THREE.Group(); sternNode.name = 'stern'; sternNode.position.set(VASA.AP, 0, 0);
  sternNode.add(mesh('stern-carvings', stern, wood));
  const cradleNode = new THREE.Group(); cradleNode.name = 'cradle'; cradleNode.add(mesh('cradle-steel', cradleB, steel));
  scene.add(sternNode, cradleNode);
  scene.updateMatrixWorld(true);

  const box3 = new THREE.Box3().setFromObject(scene.getObjectByName('hull'));
  const sternBox = new THREE.Box3().setFromObject(sternNode);
  const tris = hull.tris + ropesB.tris + stern.tris + cradleB.tris;
  scene.userData = {
    generator: 'scripts/vasa/build.mjs', units: 'm', axes: '+x bow, +y up, +z starboard; origin keel underside between the perpendiculars',
    loa: +(box3.max.x - box3.min.x).toFixed(2), lbp: VASA.FP - VASA.AP, beam: +hullBeam.toFixed(2), mastTop: +box3.max.y.toFixed(2),
    sternTop: VASA.sternTop, floorY: VASA.floorY, tris,
    stern: { anchor: [VASA.AP, 0, 0], bbox: { min: sternBox.min.toArray().map((v) => +v.toFixed(2)), max: sternBox.max.toArray().map((v) => +v.toFixed(2)) } },
  };
  return { scene, tris, parts: { hull: hull.tris, rigging: ropesB.tris, stern: stern.tris, cradle: cradleB.tris } };
}

function exportGlb(scene) {
  return new Promise((resolve, reject) => new GLTFExporter().parse(scene, (glb) => resolve(Buffer.from(glb)), reject, { binary: true }));
}
function gltfTransform(...args) {
  const r = spawnSync('npx', ['--yes', '@gltf-transform/cli', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`gltf-transform ${args[0]} failed with status ${r.status}`);
}
// weld the duplicated quad corners into an indexed mesh, then quantize + meshopt (EXT_meshopt_compression, as the Eiffel model)
function compress(rawFile, outFile) {
  console.info(`Compressing ${rawFile} with weld + meshopt into ${outFile}`);
  gltfTransform('weld', rawFile, rawFile);
  gltfTransform('meshopt', rawFile, outFile, '--level', 'medium');
}

const args = process.argv.slice(2), rawOnly = args.includes('--raw');
const outFile = args.find((a, i) => i > 0 && args[i - 1] === '--out') || (rawOnly ? args[args.indexOf('--raw') + 1] : null) || path.join(REPO, 'prototype/assets/models/vasa.glb');
const { scene, tris, parts } = build();
console.info('Vasa built:', JSON.stringify({ ...scene.userData, parts }));
const glb = await exportGlb(scene);
if (rawOnly) { fs.writeFileSync(outFile, glb); console.info(`Wrote ${outFile} (${glb.length} bytes, ${tris} triangles, uncompressed)`); }
else {
  const tmp = path.join(os.tmpdir(), `vasa-raw-${process.pid}.glb`);
  fs.writeFileSync(tmp, glb);
  try { compress(tmp, outFile); } finally { fs.rmSync(tmp, { force: true }); }
  console.info(`Wrote ${outFile} (${fs.statSync(outFile).size} bytes, ${tris} triangles)`);
}
