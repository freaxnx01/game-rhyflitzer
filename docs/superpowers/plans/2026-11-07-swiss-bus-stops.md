# Swiss-style Postauto stops (#712): implementation plan

**Spec:** `docs/superpowers/specs/2026-11-07-swiss-bus-stops-design.md`. Read it first: it has the measured
numbers and the sources.

**Goal:** every Postauto stop is drawn from a computed layout (`busstop.js`) that keeps pole and shelter ≥ 0.5 m from
every standing bus and off every road, and looks Swiss but unbranded: Haltestellentafel (landscape, yellow header with a black bus pictogram, white stop-name
band, one yellow row per line and direction) in an inverted-U steel frame, timetable frame, glass shelter behind the
pole, yellow zigzag (SSV 6.21) along the kerb. No "PostAuto" wordmark, no posthorn (spec A5).

**Global constraints**

- Pure placement logic in `busstop.js`, node --test only; no three.js, no DOM.
- `index.html` draws from the layout; no geometry decisions there.
- Exactly one Playwright test (`tests/test_bus_stops.py`); `node --test tests/*.test.mjs` must stay green.
- Commit and push the branch **before** running Playwright (CLAUDE.md), run it in the foreground.
- Surgical edits: `busStop` (`index.html:1994`), the stop loop (`index.html:5538`), `loadPostauto`
  (`index.html:3868-3880`), the `__mm` hook block (`index.html:4433`), `tests/test-map.json`, `CHANGELOG.md`.
  Nothing else in `index.html` changes. Do not touch `postauto.js` or `pipeline/`.

---

### Task 1: pure module `busstop.js` with node tests

**Files:** `busstop.js` (new), `tests/busstop.test.mjs` (new)

**Interfaces** (all exported):

- `STOP = { poleOut: 0.6, clear: 0.5, poleRoad: 0.2, push: 0.25, maxPush: 2, shift: 1, maxShift: 12, shelter: { w: 4, d: 1.8, front: 0.3, back: 2.1, h: 2.4 }, zigzag: { len: 16, w: 0.5 } }`
- `rectClearance(px, pz, pose, size) -> number` (`pose = { x, z, th }`, `size = { length, width }`; negative inside)
- `roadEdgeDist(x, z, roads) -> number` (roads as in `world_hochrhein.json`: `{ w, pts: [[x, z], …] }`; `Infinity` with no roads)
- `stopLayout(stop, poses, roads, bus = BUS, cfg = STOP) -> { x, z, yaw, pole: [x, z], shelter: { x, z, corners: [[x, z] × 4] } | null, shift, pushed }`
- `zigzagLine(route, s, roadW, cfg = STOP) -> [[x, z], …]` (`route = { pts, cum, len }` as `busRoute` builds it)
- `stopKey(st) -> string` = `` `${st.uic}:${st.x}:${st.z}` ``
- `stopRows(calls) -> [{ line, dest }]`: `calls = [{ line, dest, last }]`, one per route that calls at the point
  (`dest` = the route's `to`, `last` = the stop is the route's final stop). Drops `last` calls, dedupes by
  line + dest, sorted by line then dest. These are the rows of the sign.

- [ ] **Write the failing tests** (`tests/busstop.test.mjs`):

```js
// #712: where a Postauto stop's pole, shelter and zigzag go -- pure. node --test tests/busstop.test.mjs
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STOP, rectClearance, roadEdgeDist, stopLayout, zigzagLine, stopKey, stopRows } from '../busstop.js';
import { buildGraph, cumulative } from '../route.js';
import { BUS } from '../bus.js';
import { busRoute, busPose } from '../postauto.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const road = (pts, w = 6) => ({ n: '', cls: 'primary', w, bridge: false, pts });
// a bus standing east along z = 0, centred at x = 100, 12.2 x 2.55
const POSE = { x: 100, z: 0, th: 0 };
const STAND = { length: BUS.length, width: BUS.width };

test('rectClearance: signed distance to the bus box, negative inside', () => {
  assert.ok(near(rectClearance(100, 0, POSE, STAND), -BUS.width / 2));
  assert.ok(near(rectClearance(100, 2, POSE, STAND), 2 - BUS.width / 2));          // beside the flank
  assert.ok(near(rectClearance(110, 0, POSE, STAND), 10 - BUS.length / 2));        // past the nose
  const south = { x: 0, z: 0, th: Math.PI / 2 };                                    // heading south: the flank is along z
  assert.ok(near(rectClearance(2, 0, south, STAND), 2 - BUS.width / 2));
});

test('roadEdgeDist: distance to the nearest asphalt edge, negative on the road', () => {
  const roads = [road([[0, 0], [200, 0]], 6), road([[50, -50], [50, 50]], 4)];
  assert.ok(near(roadEdgeDist(100, 5, roads), 2));
  assert.ok(near(roadEdgeDist(100, 1, roads), -2));
  assert.ok(near(roadEdgeDist(53, 20, roads), 1));     // the cross road is nearer there
  assert.equal(roadEdgeDist(0, 0, []), Infinity);
});

test('stopLayout: a straight stop stays put, pole 0.6 m beyond the point away from the road, shelter behind it', () => {
  const roads = [road([[0, 0], [200, 0]], 6)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: 3.5, rot: 0 };            // w/2 + 0.5 right of eastward travel
  const pose = { x: 100, z: 3.5 - BUS.width / 2 - 0.3, th: 0 };                     // the bus at the kerb like busOffset
  const lay = stopLayout(stop, [pose], roads);
  assert.equal(lay.shift, 0); assert.equal(lay.pushed, 0); assert.equal(lay.yaw, 0);
  assert.ok(near(lay.pole[0], 100) && near(lay.pole[1], 4.1));
  assert.ok(near(lay.shelter.z, 4.1 + 1.2));
  assert.ok(lay.shelter.corners.every(([x, z]) => z >= 4.1 + 0.3 - 1e-9 && Math.abs(x - 100) <= 2 + 1e-9));
  assert.ok(rectClearance(...lay.pole, pose, STAND) >= STOP.clear);
});

test('stopLayout: a bus standing across the kerb slides the stop along the road, then pushes it out', () => {
  const roads = [road([[0, 0], [200, 0]], 6)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: 3.5, rot: 0 };
  const diagonal = { x: 100, z: 2, th: -1.2 };                                      // nose swung over the kerb line
  const lay = stopLayout(stop, [diagonal], roads);
  assert.notEqual(lay.shift, 0);
  assert.ok(lay.shelter, 'keeps a shelter');
  for (const p of [lay.pole, ...lay.shelter.corners]) assert.ok(rectClearance(...p, diagonal, STAND) >= STOP.clear - 1e-9);
  assert.ok(roadEdgeDist(...lay.pole, roads) >= STOP.poleRoad - 1e-9);
});

test('stopLayout: no clear spot within reach -> sign only, shelter null', () => {
  // asphalt on both sides: a 6 m road and a parallel 30 m apron right behind the kerb
  const roads = [road([[0, 0], [200, 0]], 6), road([[0, 19], [200, 19]], 30)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: 3.5, rot: 0 };
  const lay = stopLayout(stop, [POSE], roads);
  assert.equal(lay.shelter, null);
  assert.ok(Array.isArray(lay.pole));
});

test('stopLayout: westward travel mirrors the side', () => {
  const roads = [road([[0, 0], [200, 0]], 6)];
  const stop = { uic: '1', name: 'S', s: 100, x: 100, z: -3.5, rot: Math.PI };     // right of westward travel is north (-z)
  const lay = stopLayout(stop, [{ x: 100, z: -2, th: Math.PI }], roads);
  assert.ok(lay.pole[1] < -3.5 && lay.shelter.z < lay.pole[1]);
});

test('zigzagLine: 16 m along the kerb, inside the asphalt edge, clamped to the route', () => {
  const pts = [[0, 0], [200, 0]], cum = cumulative(pts), route = { pts, cum, len: 200 };
  const line = zigzagLine(route, 100, 6);
  assert.ok(near(line[0][0], 92) && near(line.at(-1)[0], 108));
  assert.ok(line.every(([, z]) => near(z, 3 - STOP.zigzag.w / 2)));
  assert.ok(line.length >= 5);
  assert.ok(near(zigzagLine(route, 3, 6)[0][0], 0));
});

test('stopKey: one key per distinct point', () => {
  assert.equal(stopKey({ uic: '8582522', x: 1965.8, z: 834.1 }), '8582522:1965.8:834.1');
});

test('stopRows: one row per line and direction, none for a route that ends here', () => {
  const rows = stopRows([{ line: '133', dest: 'Stein-Säckingen, Bahnhof', last: false }, { line: '133', dest: 'Frick, Bahnhof', last: true }]);
  assert.deepEqual(rows, [{ line: '133', dest: 'Stein-Säckingen, Bahnhof' }]);
  const both = stopRows([{ line: '133', dest: 'Stein-Säckingen, Bahnhof', last: false }, { line: '133', dest: 'Frick, Bahnhof', last: false }, { line: '133', dest: 'Frick, Bahnhof', last: false }]);
  assert.deepEqual(both, [{ line: '133', dest: 'Frick, Bahnhof' }, { line: '133', dest: 'Stein-Säckingen, Bahnhof' }]);   // deduped, sorted
  assert.ok(rows.every((r) => !/postauto/i.test(r.dest)), 'no brand text on the sign');
});

// the real world: every stop keeps its shelter, nothing of it within 0.5 m of a standing bus or on asphalt
const WORLD = new URL('../data/world_hochrhein.json', import.meta.url);
test('world_hochrhein: all 20 stop points lay out clear of every standing bus and every road', { skip: !fs.existsSync(WORLD) }, () => {
  const L = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
  const G = buildGraph(L.roads), byKey = new Map();
  for (const br of L.busRoutes) { const R = busRoute(br, L.roads, G); for (const st of R.stops) { const k = stopKey(st); if (!byKey.has(k)) byKey.set(k, { st, poses: [] }); byKey.get(k).poses.push(busPose(R, st.s)); } }
  assert.equal(byKey.size, 20);
  for (const { st, poses } of byKey.values()) {
    const lay = stopLayout(st, poses, L.roads);
    assert.ok(lay.shelter, `${st.name}: no shelter`);
    for (const p of [lay.pole, ...lay.shelter.corners]) for (const pose of poses) assert.ok(rectClearance(...p, pose, STAND) >= STOP.clear - 1e-9, `${st.name}: ${rectClearance(...p, pose, STAND)}`);
    for (const p of lay.shelter.corners) assert.ok(roadEdgeDist(...p, L.roads) >= -1e-9, `${st.name}: shelter on asphalt`);
    assert.ok(Math.abs(lay.shift) <= 6 && lay.pushed <= 2, `${st.name}: shift ${lay.shift} push ${lay.pushed}`);
  }
});

test('world_hochrhein: every stop point has at least one row; Frick Bahnhof shows only the way to Stein-Säckingen', { skip: !fs.existsSync(WORLD) }, () => {
  const L = JSON.parse(fs.readFileSync(WORLD, 'utf8')), calls = new Map();
  for (const br of L.busRoutes) for (const [i, st] of br.stops.entries()) { const k = stopKey(st); if (!calls.has(k)) calls.set(k, { st, calls: [] }); calls.get(k).calls.push({ line: br.line, dest: br.to, last: i === br.stops.length - 1 }); }
  for (const { st, calls: c } of calls.values()) assert.ok(stopRows(c).length >= 1, `${st.name}: no row`);
  const frick = [...calls.values()].filter(({ st }) => st.uic === '8500583');
  assert.ok(frick.length >= 1);
  for (const { calls: c } of frick) assert.ok(stopRows(c).every((r) => r.dest === 'Stein-Säckingen, Bahnhof'));
});
```

- [ ] **Run it, see it fail** (`node --test tests/busstop.test.mjs`: cannot find `../busstop.js`).

- [ ] **Write `busstop.js`**:

```js
// #712: where a Postauto stop stands -- pole, shelter and the yellow zigzag -- clear of every standing bus and off
// the asphalt. Pure module, node --test only. The world's stop point is w/2 + 0.5 right of the route
// (pipeline/world_bus.py); the bus pulls in to 0.3 m short of it (postauto.js busOffset).
import { BUS } from './bus.js';
import { rightOf } from './route.js';

export const STOP = {
  poleOut: 0.6,                 // m: the pole this far beyond the stop point, away from the road
  clear: 0.5,                   // m: pole and shelter to every standing bus; shelter to every asphalt edge
  poleRoad: 0.2,                // m: the pole to the nearest asphalt edge
  push: 0.25, maxPush: 2,       // m: candidates further out, step and limit
  shift: 1, maxShift: 12,       // m: candidates along the kerb, step and limit (both ways)
  shelter: { w: 4, d: 1.8, front: 0.3, back: 2.1, h: 2.4 },   // roof 4 x 1.8 from `front` to `back` behind the pole
  zigzag: { len: 16, w: 0.5 },  // SSV 6.21 along the kerb, centred on the stand point
};

export const stopKey = (st) => `${st.uic}:${st.x}:${st.z}`;

// the sign's rows: one per line and direction that leaves this point; a route that ends here has no row
export function stopRows(calls) {
  const seen = new Map();
  for (const c of calls) if (!c.last) seen.set(`${c.line}|${c.dest}`, { line: c.line, dest: c.dest });
  return [...seen.values()].sort((a, b) => a.line.localeCompare(b.line) || a.dest.localeCompare(b.dest));
}

export function rectClearance(px, pz, pose, size) {
  const dx = px - pose.x, dz = pz - pose.z, c = Math.cos(pose.th), s = Math.sin(pose.th);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return Math.max(Math.abs(u) - size.length / 2, Math.abs(v) - size.width / 2);
}

function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

export function roadEdgeDist(x, z, roads) {
  let m = Infinity;
  for (const r of roads) { const p = r.pts; for (let i = 0; i < p.length - 1; i++) { const d = segDist(x, z, p[i], p[i + 1]) - r.w / 2; if (d < m) m = d; } }
  return m;
}

function shelterCorners(cx, cz, u, n, cfg) {
  const hw = cfg.shelter.w / 2, hd = cfg.shelter.d / 2;
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [cx + u[0] * hw * a + n[0] * hd * b, cz + u[1] * hw * a + n[1] * hd * b]);
}

// along the kerb first (0, +1, -1, +2, -2 ...), then out; the first clear candidate wins
function* candidates(cfg) {
  for (let k = 0; k * cfg.shift <= cfg.maxShift; k++) for (const sgn of k ? [1, -1] : [1]) for (let p = 0; p <= cfg.maxPush + 1e-9; p += cfg.push) yield { shift: sgn * k * cfg.shift, push: p };
}

export function stopLayout(stop, poses, roads, bus = BUS, cfg = STOP) {
  const u = [Math.cos(stop.rot), Math.sin(stop.rot)], n = [-u[1], u[0]];   // along the kerb; away from the road (right of travel)
  const mid = (cfg.shelter.front + cfg.shelter.back) / 2;
  const clearance = (x, z) => Math.min(...poses.map((p) => rectClearance(x, z, p, bus)));
  let last = null;
  for (const c of candidates(cfg)) {
    const out = cfg.poleOut + c.push;
    const pole = [stop.x + u[0] * c.shift + n[0] * out, stop.z + u[1] * c.shift + n[1] * out];
    const cx = pole[0] + n[0] * mid, cz = pole[1] + n[1] * mid, corners = shelterCorners(cx, cz, u, n, cfg);
    last = { x: stop.x, z: stop.z, yaw: stop.rot, pole, shelter: { x: cx, z: cz, corners }, shift: c.shift, pushed: c.push };
    const ok = clearance(...pole) >= cfg.clear && roadEdgeDist(...pole, roads) >= cfg.poleRoad
      && corners.every(([x, z]) => clearance(x, z) >= cfg.clear && roadEdgeDist(x, z, roads) >= 0);
    if (ok) return last;
  }
  return { ...last, shelter: null };
}

export function zigzagLine(route, s, roadW, cfg = STOP) {
  const a = Math.max(0, s - cfg.zigzag.len / 2), b = Math.min(route.len, s + cfg.zigzag.len / 2), off = roadW / 2 - cfg.zigzag.w / 2;
  const out = [];
  for (let q = a; q < b; q += 2) out.push(rightOf(route.pts, route.cum, q, off));
  out.push(rightOf(route.pts, route.cum, b, off));
  return out;
}
```

Check `route.js:61` `rightOf(pts, cum, s, off)` is exported (it is used by `postauto.js:97`); if `cumulative` is not
exported for the test, import `busRoute` and build the route from a `br` instead.

- [ ] **Run the tests** (`node --test tests/busstop.test.mjs`, then `node --test tests/*.test.mjs`). If the
  real-world test fails on a number, print the layout for that stop and compare with the spec's table before
  touching the constants: the spec's values were measured with exactly this algorithm.

- [ ] **Commit:** `feat(traffic): lay out Postauto stops clear of the standing bus (#712)`.

---

### Task 2: draw the Swiss stop from the layout (`index.html`), build order, hook

**Files:** `index.html`, `CHANGELOG.md`

**Interfaces:**
- `busStop(layout, name, rows)` replaces `busStop(x, z, name, faceDeg)` (`index.html:1994`); `rows = [{ line, dest }]` from `stopRows`.
- `buildBusStops()` (new, next to the loop at `index.html:5538`): builds `POSTAUTO.routes`, dedupes stops by
  `stopKey`, computes layouts, draws stops and zigzags, fills `POSTAUTO.stops` for the hook.
- `window.__mm.busStops()` → `POSTAUTO.stops` (plain data).

- [ ] **Import** at `index.html:728`, next to the `postauto.js` import:

```js
import { STOP, stopLayout, zigzagLine, stopKey, stopRows } from './busstop.js';   // #712
```

Keep `stopFaceDeg` in the `postauto.js` import list only if something else still uses it; otherwise drop it
from the import (the export and its test in `postauto.js` stay).

- [ ] **Textures** (near `textTex`, `index.html:947`), two small canvas textures:

```js
// #712: the Haltestellentafel -- landscape 0.9 x 0.55 m: Postgelb header with a black bus pictogram (no wordmark, spec A5), white
// stop-name band, one Postgelb row per line and direction with thin white separators
function busPictogram(g, x, y, h) {   // procedural, black: rounded body, yellow window cut-outs, two wheels
  const w = h * 1.9;
  g.fillStyle = '#111111'; g.beginPath(); g.roundRect(x, y, w, h * 0.78, h * 0.14); g.fill();
  g.fillStyle = '#ffcc00'; for (let i = 0; i < 4; i++) g.fillRect(x + w * (0.08 + i * 0.22), y + h * 0.12, w * 0.17, h * 0.28);
  g.fillStyle = '#111111'; for (const cx of [0.25, 0.75]) { g.beginPath(); g.arc(x + w * cx, y + h * 0.8, h * 0.17, 0, Math.PI * 2); g.fill(); }
}
function stopSignTex(name, rows) {
  return makeTex(512, 312, (g, w, h) => {
    const headH = 62, rowH = Math.min(60, Math.floor(126 / Math.max(1, rows.length))), rowsTop = h - rows.length * rowH;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, headH);
    busPictogram(g, 16, 10, 42);
    g.fillStyle = '#111111'; g.textBaseline = 'middle';
    const parts = name.includes(',') ? name.split(',').map((t) => t.trim()) : name.length > 14 && name.includes(' ') ? [name.slice(0, name.lastIndexOf(' ')), name.slice(name.lastIndexOf(' ') + 1)] : [name];
    const size = parts.length > 1 || parts.some((t) => t.length > 12) ? 52 : 72, mid = (headH + rowsTop) / 2;
    g.textAlign = 'center'; g.font = `700 ${size}px "Barlow Condensed", sans-serif`;
    parts.forEach((t, i) => g.fillText(t, w / 2, mid + (i - (parts.length - 1) / 2) * (size + 6)));
    rows.forEach((r, i) => {
      const y = rowsTop + i * rowH;
      g.fillStyle = '#ffcc00'; g.fillRect(0, y, w, rowH);
      if (i) { g.fillStyle = '#ffffff'; g.fillRect(0, y, w, 3); }
      g.fillStyle = '#111111'; g.textAlign = 'left'; g.font = `700 ${Math.round(rowH * 0.7)}px "Barlow Condensed", sans-serif`;
      g.fillText(r.line, 20, y + rowH / 2 + 2); g.fillText(r.dest, 110, y + rowH / 2 + 2);
    });
  }, { alpha: true });
}
// #712: the Fahrplantafel -- a white sheet with a yellow header and grey lines, no real times
function timetableTex() {
  return makeTex(128, 192, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcc00'; g.fillRect(0, 0, w, 28);
    g.fillStyle = '#111111'; g.font = '700 18px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('133', 8, 14);
    g.fillStyle = '#9a9a9a'; for (let y = 44; y < h - 8; y += 14) { g.fillRect(8, y, 20, 4); g.fillRect(36, y, w - 44, 4); }
  }, { alpha: true });
}
// #712: SSV 6.21 -- one yellow zigzag per 2 m tile, repeats along the ribbon
const zigzagTex = () => makeTex(64, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#f5c400'; g.lineWidth = 10; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(8, 0); g.lineTo(w - 8, h / 2); g.lineTo(8, h); g.stroke(); });
```

`makeTex` (`index.html:851`) uses `RepeatWrapping` when `alpha` is not set: the zigzag needs that, the plates do
not. The zigzag material is `transparent: true` so the cleared pixels show the asphalt.

- [ ] **Replace `busStop`** (`index.html:1994`) by a draw-from-layout version. Local frame: +x along the kerb
  (`u`), +z away from the road (`n`), so `g.rotation.y = -layout.yaw` (the same sign the car and the bus use,
  `index.html:5535`: `car.rotation.y = -START.th`):

```js
// #712: one stop from its layout (busstop.js): the inverted-U steel frame with the Haltestellentafel (its pole leg at layout.pole)
// and the timetable frame, the glass shelter at layout.shelter (null: sign only). Local +x along the kerb, +z away from the road.
function busStop(layout, name, rows) {
  const g = new THREE.Group(), b = terrainH(...layout.pole);
  const px = layout.pole[0] - layout.x, pz = layout.pole[1] - layout.z;   // world offsets of the pole from the stop point
  const steel = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  const tube = (x, y0, y1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, y1 - y0, 8), steel); m.position.set(x, (y0 + y1) / 2, 0); g.add(m); };
  tube(0, 0, 2.9); tube(-1, 2.15, 2.9);   // the pole leg and the short leg of the inverted U
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), steel); bar.rotation.z = Math.PI / 2; bar.position.set(-0.5, 2.9, 0); g.add(bar);
  for (const x of [0, -1]) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), steel); knob.position.set(x, 2.9, 0); g.add(knob); }   // rounded top corners
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: stopSignTex(name, rows), side: THREE.DoubleSide })); sign.position.set(-0.5, 2.5, -0.05); g.add(sign);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.03), new THREE.MeshLambertMaterial({ color: 0x2b2f36 })); frame.position.set(0, 1.6, -0.05); g.add(frame);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.58), new THREE.MeshBasicMaterial({ map: timetableTex() })); sheet.position.set(0, 1.6, -0.07); sheet.rotation.y = Math.PI; g.add(sheet);
  if (layout.shelter) {
    const S = STOP.shelter, mid = (S.front + S.back) / 2;   // the shelter centre is mid metres further out than the pole
    const roof = new THREE.Mesh(new THREE.BoxGeometry(S.w, 0.15, S.d), new THREE.MeshLambertMaterial({ color: 0x4a515e })); roof.position.set(0, S.h + 0.1, mid); g.add(roof);
    const glass = new THREE.MeshPhongMaterial({ color: 0x8fb2c8, transparent: true, opacity: 0.5 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(S.w, S.h, 0.06), glass); back.position.set(0, S.h / 2, S.back - 0.05); g.add(back);
    for (const sd of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, S.h, S.d), glass); side.position.set(sd * (S.w / 2 - 0.03), S.h / 2, mid); g.add(side); }
    for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, S.h, 6), new THREE.MeshLambertMaterial({ color: 0x4a515e })); post.position.set(sd * (S.w / 2 - 0.1), S.h / 2, S.front + 0.1); g.add(post); }
  }
  g.position.set(layout.pole[0], b, layout.pole[1]); g.rotation.y = -layout.yaw;
  signs.add(g);
}
```

The plate hangs inside the U, 0.5 m beside the pole leg, in the plane 0.05 m on the road side of the frame. The whole group is anchored at the pole, so the shelter's local z runs from `S.front` to `S.back` behind it —
the same offsets `stopLayout` used for the corners. The sign plane and the frame sit at local z = −0.05 (the
road side of the pole), facing the road; `DoubleSide` keeps the plate readable from the pavement.

Delete the old `textTex(name, 512, 214, '#f5c400', …)` board: nothing else uses that call.

- [ ] **Zigzag decal** (new function next to `busStop`):

```js
// #712: the yellow zigzag (SSV 6.21) along the kerb, 16 m centred on the stand point, on the road surface
let ZIGZAG_TEX = null;
function stopZigzag(route, s, roadW) {
  const line = zigzagLine(route, s, roadW);
  if (line.length < 2) return;
  ZIGZAG_TEX ??= zigzagTex();
  const geo = ribbonGeo(line, STOP.zigzag.w / 2, 0.05, 2, true);
  decals.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: ZIGZAG_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
}
```

`roadW` is the width of the road under the stand point, read like `roadDist` (`index.html:1464`) does:

```js
// #712: the width of the road nearest a point (the stop's road), 6 m when none is within reach
function roadWidthAt(x, z) { let best = null; for (const { r, i } of gridQuery(ROAD_GRID, x, z, 8)) { const d = segDist(x, z, ...r.pts[i], ...r.pts[i + 1]) - r.w / 2; if (!best || d < best.d) best = { d, w: r.w }; } return best ? best.w : 6; }
```

- [ ] **Build order:** replace the loop at `index.html:5538` with a call to a new function, and stop building
  routes in `loadPostauto`:

```js
// #712: routes first (busPose needs them), then one stop per distinct point, laid out clear of every bus that stands there
function buildBusStops() {
  if (!L || !L.busRoutes?.length) return;
  const g = autoGraph();
  for (const br of L.busRoutes) if (!POSTAUTO.routes.has(br.id)) POSTAUTO.routes.set(br.id, busRoute(br, ROADS, g));
  const byKey = new Map();
  for (const br of L.busRoutes) { const R = POSTAUTO.routes.get(br.id); for (const [i, st] of R.stops.entries()) { const k = stopKey(st); if (!byKey.has(k)) byKey.set(k, { st, R, poses: [], calls: [] }); const e = byKey.get(k); e.poses.push(busPose(R, st.s)); e.calls.push({ line: br.line, dest: br.to, last: i === R.stops.length - 1 }); } }
  POSTAUTO.stops = [];
  for (const { st, R, poses, calls } of byKey.values()) {
    const lay = stopLayout(st, poses, ROADS), rows = stopRows(calls);
    busStop(lay, st.name, rows);
    stopZigzag(R, st.s, roadWidthAt(st.x, st.z));
    POSTAUTO.stops.push({ uic: st.uic, name: st.name, x: st.x, z: st.z, yaw: lay.yaw, pole: lay.pole, shelter: lay.shelter, shift: lay.shift, pushed: lay.pushed, rows });
  }
}
buildBusStops();   // #712: before loadPostauto's fetch, so the stops stand without a timetable too
```

In `loadPostauto` (`index.html:3874`) change the route line to reuse what `buildBusStops` built:
`for (const br of L.busRoutes) if (!POSTAUTO.routes.has(br.id)) POSTAUTO.routes.set(br.id, busRoute(br, ROADS, g));`
— keep the `autoGraph()` call there (it is cached). Add `stops: []` to the `POSTAUTO` literal
(`index.html:3864`). `br.line` is the line number and `br.to` the destination ("Frick, Bahnhof") in `busRoutes[]`; check the field
names in the world file (`busRoute` reads `br.line`, `postauto.js:76`). `R.stops` keeps the world's stop order, so
the last entry is the route's final stop. The municipality is not in the data and is not drawn (spec A10).

- [ ] **Hand-placed Sisseln stop** (`index.html:2318`): it has no route and no bus. Replace the call with a
  synthetic layout so it draws through the same function:

```js
  { const [x, z] = V(812, 722); busStop(stopLayout({ x, z, rot: Math.PI }, [], ROADS), 'Breitenacher', [{ line: '133', dest: 'Frick, Bahnhof' }, { line: '133', dest: 'Stein-Säckingen, Bahnhof' }]); }
```

`stopLayout` with an empty `poses` list only checks the roads (`Math.min()` of nothing is `Infinity`, so the bus
clearance passes). `rot: Math.PI` keeps today's facing (`faceDeg 180` was `π − rot` with `rot = 0`; the group's
sign convention is now `−yaw`, so `yaw = π` faces the same way). Check in the browser that the board faces the
Hauptstrasse; if it faces away, use `rot: 0`.

- [ ] **Hook** (`index.html:4433` block): add a sibling line

```js
window.__mm.busStops = () => POSTAUTO.stops;   // #712: the laid-out stops, for the test
```

- [ ] **CHANGELOG** (`[Unreleased]` → `### Changed`, player voice, timestamp like the others):

```markdown
- `2026-11-07 HH:MM` The **Postauto stops** are now Swiss: a steel-frame sign with the yellow **Haltestellentafel**, the stop's name and a row for each line and direction (with a little bus, no brand), a **timetable frame** at eye height, the glass shelter behind the pole, and the yellow **zigzag** on the road along the kerb. Pole and shelter stand beside the kerb, clear of the standing Postauto and off the road — also at the bends at Industriezone Rütti and the two stations, where the bus used to stand through the shelter.
```

- [ ] **Verify in node first:** `node --test tests/*.test.mjs` (Task 1's world test is the gate for the layout).
  Then load `index.html` once headless (`python3 -m http.server`, Playwright `page.goto`, wait for
  `window.__mm.busStops`) and print `__mm.busStops().length` (expect 20) and any `pageerror`. Do this in the
  foreground, before Task 3's test.

- [ ] **Commit:** `feat(world): Swiss-style Postauto stops with Haltestellentafel, timetable frame and zigzag (#712)`.

---

### Task 3: one Playwright test, test map, push

**Files:** `tests/test_bus_stops.py` (new), `tests/test-map.json`

- [ ] **Push the branch first** (`git push -u origin <branch>`), then write the test:

```python
"""#712: Postauto stops stand beside the kerb, clear of the standing bus. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
needs_data = pytest.mark.skipif(not TT.exists(), reason="run the #682 timetable cut first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
RUETTI = "8582522"   # Industriezone Rütti: the bus stands across the kerb line here (spec table)
BUS_L, BUS_W = 12.2, 2.55


def hhmm(secs):
    secs = int(secs) % 86400
    return f"{secs // 3600:02d}:{secs // 60 % 60:02d}"


def clearance(px, pz, bus):
    dx, dz = px - bus["x"], pz - bus["z"]
    c, s = math.cos(bus["th"]), math.sin(bus["th"])
    u, v = dx * c + dz * s, -dx * s + dz * c
    return max(abs(u) - BUS_L / 2, abs(v) - BUS_W / 2)


@needs_data
def test_stops_lay_out_clear_of_the_standing_bus_at_ruetti(server):
    trips = json.loads(TT.read_text(encoding="utf-8"))["trips"]
    trip = next(t for t in trips if any(c[0] == RUETTI for c in t["calls"]))
    k, call = next((i, c) for i, c in enumerate(trip["calls"]) if c[0] == RUETTI)
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.clock.install()
        page.goto(f"{server}/index.html?patime={hhmm(call[2] - 40)}")
        page.wait_for_function("() => window.__mm && window.__mm.busStops && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
        stops = page.evaluate("() => window.__mm.busStops()")
        assert len(stops) == 20 and all(s["shelter"] for s in stops)
        assert all(s["rows"] for s in stops), "every sign has at least one line row"
        frick = next(s for s in stops if s["uic"] == "8500583")
        assert [r["dest"] for r in frick["rows"]] == ["Stein-Säckingen, Bahnhof"]
        assert not any("postauto" in (s["name"] + " ".join(r["dest"] for r in s["rows"])).lower() for s in stops), "no brand text on the signs"
        page.wait_for_function(f"() => window.__mm.postauto().buses.some(x => x.phase === 'stand' && x.k === {k})", timeout=180000)
        page.clock.set_fixed_time(page.evaluate("() => Date.now()"))
        bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses") if x["phase"] == "stand" and x["k"] == k)
        stop = next(s for s in stops if s["uic"] == RUETTI)
        for px, pz in [stop["pole"], *stop["shelter"]["corners"]]:
            assert clearance(px, pz, bus) >= 0.5 - 1e-6, (stop["name"], px, pz, bus)
        assert not errors
        b.close()
```

If the dwell at Rütti (`arr == dep`, `minDwell` 10 s, `postauto.js:166`) is too short for SwiftShader to catch
the `stand` phase, read the bus right after the `wait_for_function` resolves as the test does (the clock is frozen
there), and if it still flakes, assert against the bus while `phase === 'drive'` with `|s − stopS| < 1` instead.

- [ ] **Test map** (`tests/test-map.json`): add `"busstop.js": ["test_bus_stops.py"]` and extend the
  `index.html` → bus stop mapping if the file maps `index.html` regions; otherwise `test_bus_stops.py` is picked
  up by the `tests/*` default. Check `tests/select_tests.py` for how a new `.py` file is selected and follow it.

- [ ] **Run in the foreground:** `python -m pytest tests/test_bus_stops.py -v` (generous timeout; never
  `run_in_background`). Then `node --test tests/*.test.mjs` once more.

- [ ] **Commit:** `test(traffic): Playwright check that the Rütti stop stands clear of the bus (#712)`, push, open
  the PR with the body template (Summary · Changes · Testing · Checklist) and `Closes #712`.
