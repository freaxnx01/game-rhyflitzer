# Realistic cars, slice 1: the compact (#164) Implementation Plan

**Goal:** the compact hatchback gets a lofted body with tumblehome and rounded shoulders, glass as part of the same hull, baked panel lines, dark wheel arches, lathe-turned tyres with five-spoke rims, bumpers and glossy lamp lenses; all car materials become physically based and reflect a small environment map generated from the game's own sky. Both styles, buildless, measured frame budget. Spec: `docs/superpowers/specs/2026-10-09-realistic-cars-design.md`.

**Architecture:** pure `prototype/carbody.js` (stations, fillets, cross-section, loft arrays, wheel lathe profile, spokes) with node tests; `prototype/index.html` gets `CAR_ENV` (a PMREM texture from a private sky scene, regenerated per style), the new `carMats`, a rewritten `buildCompact` and `buildWheels`, three read-only hooks (`carStats`, `carMats`, `setStyle`); one new browser test file `prototype/tests/test_car_look.py`.

**Global constraints for the implementer:**

- `prototype/index.html` is written in long one-line statements. **Never put a `//` comment in the middle of a one-line statement or at the end of a line that other code continues on** — a `//` swallows everything after it on that line. Put a comment on its own line above the statement, or use `/* ... */` if it must sit inline.
- No new dependency, no `package.json`, no model file, nothing downloaded. Only `three` and `three/addons/utils/BufferGeometryUtils.js` (already imported, `:252`) are used.
- Keep `carMats` keys `body`, `steel`, `glass`, `dark`, `rim`, `tyre` (other code and PR #162's paint swatches read them); add `lampHead` and `lampTail`. `carMats.body.color` stays the paint and nothing else writes it.
- Keep `g.userData.wheels` entries `{ front, steer, roll }` and the `steer > roll` group nesting (#132, `test_wheels.py`).
- `test_vehicles.py::test_compact_car_is_true_to_size` (4.66 × 2.18 × 1.55 ± 0.02) and the glass tests (`window.__mm.glass()`) must pass **unchanged**. Do not edit a test to make it green.
- Tests: node first (`node --test prototype/tests/*.test.mjs`), then only the affected browser files, in the foreground, under a memory cap: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest prototype/tests/test_car_look.py prototype/tests/test_vehicles.py prototype/tests/test_wheels.py -x -q`. Never `run_in_background`.
- Commit and push the branch before the browser verification, not after.
- CHANGELOG entries are English and player-facing (what changed in the game, not in the code).
- Line numbers below are from `main` at `579ad3e`; re-grep before editing (`#163`'s shadow work may land first and shift `:1195-1201`; its `CAR_SIZE` / `measureCar()` contract is untouched by this plan).

### Task 1: Pure module `carbody.js` with unit tests

**Files:** create `prototype/carbody.js`, `prototype/tests/carbody.test.mjs`.

- [ ] Write the failing test `prototype/tests/carbody.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPACT, FILLET, fillet, crossSection, loftBody, bodyBox, WHEEL_PROFILE, SPOKES, spokeBars, ARCH, archRadius } from '../carbody.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('COMPACT: stations rise in x, tumblehome everywhere, flags on every span', () => {
  const st = COMPACT.stations;
  assert.ok(st.length >= 8);
  for (let i = 1; i < st.length; i++) assert.ok(st[i].x > st[i - 1].x, `x rises at ${i}`);
  for (const s of st) { assert.ok(s.floor < s.belt && s.belt < s.roof, `heights at x=${s.x}`); assert.ok(s.wRoof < s.wBelt && s.wBelt <= s.wSill, `tumblehome at x=${s.x}`); }
  for (let i = 0; i < st.length - 1; i++) assert.ok(typeof st[i].span.top === 'boolean' && typeof st[i].span.side === 'boolean', `span flags at ${i}`);
  assert.ok(st.some(s => s.span?.top) && st.some(s => s.span?.side), 'some glass');
  close(st[0].x, -2.33, 1e-9); close(st[st.length - 1].x, 2.33, 1e-9);
  close(Math.max(...st.map(s => s.roof)), 1.55, 1e-9); close(Math.max(...st.map(s => s.wSill)), 0.90, 1e-9);
});

test('fillet: a right-angle corner becomes a quarter arc tangent to both legs', () => {
  const pts = fillet([0, 2], [0, 0], [2, 0], 0.5, 4);
  assert.equal(pts.length, 5);
  close(pts[0][0], 0, 1e-9); close(pts[0][1], 0.5, 1e-9);
  close(pts[4][0], 0.5, 1e-9); close(pts[4][1], 0, 1e-9);
  for (const p of pts) close(Math.hypot(p[0] - 0.5, p[1] - 0.5), 0.5, 1e-9, 'on the arc');
});

test('fillet: the tangent length is clamped to 45 % of the shorter leg', () => {
  const pts = fillet([0, 0.1], [0, 0], [1, 0], 0.5, 4);
  close(pts[0][1], 0.045, 1e-9); close(pts[4][0], 0.045, 1e-9);
});

test('crossSection: same point count for every station, from the floor centre to the roof centre, z >= 0, band index fixed', () => {
  const sections = COMPACT.stations.map(s => crossSection(s));
  const m = sections[0].pts.length;
  assert.equal(m, 2 + 3 * (FILLET.n + 1));
  for (const { pts, band } of sections) {
    assert.equal(pts.length, m); assert.equal(band, 2 * FILLET.n + 2);
    close(pts[0][1], 0, 1e-9); close(pts[m - 1][1], 0, 1e-9);
    for (const p of pts) assert.ok(p[1] >= -1e-9, 'right half');
  }
  const mid = crossSection(COMPACT.stations[4]);
  close(mid.pts[0][0], 0.30, 1e-9, 'floor'); close(mid.pts[m - 1][0], 1.55, 1e-9, 'roof');
  assert.ok(Math.max(...mid.pts.map(p => p[1])) <= 0.90 + 1e-9, 'never wider than the sill');
});

test('loftBody: closed, symmetric in z, two index groups, uv in [0, 1], v markers', () => {
  const L = loftBody(COMPACT);
  const n = L.positions.length / 3;
  assert.equal(L.uvs.length, n * 2);
  assert.equal(L.bodyIndices.length % 3, 0); assert.equal(L.glassIndices.length % 3, 0);
  assert.ok(L.glassIndices.length > 0 && L.bodyIndices.length > L.glassIndices.length);
  // watertight by position: the ring repeats its first point as its last (the uv seam), so merge vertices that coincide
  const canon = new Map(), id = new Array(n);
  for (let i = 0; i < n; i++) { const k = [0, 1, 2].map(j => L.positions[3 * i + j].toFixed(6)).join(','); if (!canon.has(k)) canon.set(k, i); id[i] = canon.get(k); }
  const edges = new Map();
  for (const idx of [L.bodyIndices, L.glassIndices]) for (let i = 0; i < idx.length; i += 3) for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) { const p = id[a], q = id[b], k = p < q ? `${p}-${q}` : `${q}-${p}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  for (const [k, c] of edges) assert.equal(c, 2, `edge ${k} shared by two triangles (watertight)`);
  let sumZ = 0; for (let i = 0; i < n; i++) sumZ += L.positions[3 * i + 2];
  close(sumZ, 0, 1e-6, 'symmetric');
  for (let i = 0; i < L.uvs.length; i++) assert.ok(L.uvs[i] >= -1e-9 && L.uvs[i] <= 1 + 1e-9, 'uv range');
  assert.ok(L.v.sill > 0 && L.v.sill < L.v.belt && L.v.belt < L.v.roof && L.v.roof <= 0.5, JSON.stringify(L.v));
});

test('bodyBox: the loft alone is 4.66 long, 1.80 wide, 1.25 high and sits on y = 0.30', () => {
  const b = bodyBox(COMPACT);
  close(b.l, 4.66, 0.02); close(b.w, 1.80, 0.02); close(b.h, 1.25, 0.02); close(b.minY, 0.30, 1e-9);
});

test('WHEEL_PROFILE: radii within [0, R], tread at R, rim lip at 0.66 R, tyreCount splits the run', () => {
  const R = 0.34, w = 0.24, p = WHEEL_PROFILE(R, w);
  assert.ok(p.points.length > p.tyreCount && p.tyreCount >= 4);
  for (const [r, y] of p.points) { assert.ok(r >= 0 && r <= R + 1e-9, `r ${r}`); assert.ok(Math.abs(y) <= w / 2 + 1e-9, `y ${y}`); }
  assert.ok(p.points.some(([r]) => Math.abs(r - R) < 1e-9), 'tread');
  close(p.points[p.tyreCount - 1][0], 0.66 * R, 1e-9, 'rim lip');
  close(p.points[p.points.length - 1][0], 0, 1e-9, 'closes at the axis');
});

test('spokeBars: five bars 72 degrees apart from the hub to the rim lip', () => {
  const bars = spokeBars(0.34);
  assert.equal(bars.length, SPOKES); assert.equal(SPOKES, 5);
  for (let i = 0; i < bars.length; i++) { close(bars[i].angle, i * 2 * Math.PI / 5, 1e-9); close(bars[i].r0, 0.22 * 0.34, 1e-9); close(bars[i].r1, 0.66 * 0.34, 1e-9); assert.ok(bars[i].width > 0 && bars[i].thick > 0); }
});

test('archRadius: the wheel plus the gap', () => {
  close(archRadius(0.34), 0.34 + ARCH.gap, 1e-12); assert.ok(ARCH.lip > 0 && ARCH.gap > ARCH.lip);
});
```

- [ ] Run `node --test prototype/tests/carbody.test.mjs` — fails (module missing).
- [ ] Write `prototype/carbody.js`:

```js
// #164: the compact's body as a loft of cross-sections, the wheel lathe profile and the rim spokes -- pure (no three.js, no DOM).
// Model metres: x forward, y up, z right. The builder in index.html turns the arrays into BufferGeometry.
// Unit-tested with `node --test prototype/tests/*.test.mjs`.

// one station per x: floor / belt (shoulder, where the glass starts) / roof heights and the half-widths at sill, belt and roof
// (wRoof < wBelt <= wSill: tumblehome). span = the material of the stretch from this station to the next: top (windscreen, rear
// window) and side (door glass) are glass, everything else is paint. The last station has no span.
export const COMPACT = {
  stations: [
    { x: -2.33, floor: 0.42, belt: 0.86, roof: 1.00, wSill: 0.76, wBelt: 0.76, wRoof: 0.58, span: { top: false, side: false } },
    { x: -2.15, floor: 0.33, belt: 0.94, roof: 1.10, wSill: 0.86, wBelt: 0.86, wRoof: 0.70, span: { top: true, side: false } },
    { x: -1.80, floor: 0.30, belt: 0.96, roof: 1.36, wSill: 0.90, wBelt: 0.87, wRoof: 0.70, span: { top: true, side: true } },
    { x: -1.35, floor: 0.30, belt: 0.96, roof: 1.50, wSill: 0.90, wBelt: 0.87, wRoof: 0.68, span: { top: false, side: true } },
    { x: -0.90, floor: 0.30, belt: 0.96, roof: 1.55, wSill: 0.90, wBelt: 0.87, wRoof: 0.66, span: { top: false, side: true } },
    { x: 0.15, floor: 0.30, belt: 0.96, roof: 1.55, wSill: 0.90, wBelt: 0.87, wRoof: 0.66, span: { top: true, side: true } },
    { x: 0.85, floor: 0.30, belt: 0.98, roof: 1.16, wSill: 0.90, wBelt: 0.87, wRoof: 0.78, span: { top: false, side: false } },
    { x: 1.40, floor: 0.30, belt: 0.98, roof: 1.04, wSill: 0.90, wBelt: 0.87, wRoof: 0.80, span: { top: false, side: false } },
    { x: 2.00, floor: 0.33, belt: 0.92, roof: 1.00, wSill: 0.88, wBelt: 0.86, wRoof: 0.76, span: { top: false, side: false } },
    { x: 2.33, floor: 0.42, belt: 0.82, roof: 0.90, wSill: 0.78, wBelt: 0.78, wRoof: 0.60 },
  ],
};

// corner radii (floor edge, shoulder, roof edge) and the arc subdivision
export const FILLET = { floor: 0.08, shoulder: 0.06, roof: 0.10, n: 4 };

// replace corner b of the polyline a-b-c by an arc of radius r tangent to both legs: n + 1 points from the a-leg to the c-leg.
// The tangent length is clamped to 45 % of the shorter leg so short legs never fold over.
export function fillet(a, b, c, r, n) {
  const u1 = [a[0] - b[0], a[1] - b[1]], u2 = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
  u1[0] /= l1; u1[1] /= l1; u2[0] /= l2; u2[1] /= l2;
  const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  const t = Math.min(r / Math.tan(theta / 2), 0.45 * Math.min(l1, l2)), rr = t * Math.tan(theta / 2);
  const p1 = [b[0] + u1[0] * t, b[1] + u1[1] * t], p2 = [b[0] + u2[0] * t, b[1] + u2[1] * t];
  const bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis);
  const centre = [b[0] + bis[0] / bl * rr / Math.sin(theta / 2), b[1] + bis[1] / bl * rr / Math.sin(theta / 2)];
  const a1 = Math.atan2(p1[1] - centre[1], p1[0] - centre[0]);
  let da = Math.atan2(p2[1] - centre[1], p2[0] - centre[0]) - a1;
  if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
  const out = [];
  for (let i = 0; i <= n; i++) { const ang = a1 + da * i / n; out.push([centre[0] + rr * Math.cos(ang), centre[1] + rr * Math.sin(ang)]); }
  return out;
}

// the right half of one station's ring, [y, z] from the floor centre up the side to the roof centre:
// floor corner, side, shoulder, the glass band (one straight segment, index `band`), roof corner.
export function crossSection(st, f = FILLET) {
  const A = [st.floor, 0], B = [st.floor, st.wSill], C = [st.belt, st.wBelt], D = [st.roof, st.wRoof], E = [st.roof, 0];
  const pts = [A, ...fillet(A, B, C, f.floor, f.n), ...fillet(B, C, D, f.shoulder, f.n), ...fillet(C, D, E, f.roof, f.n), E];
  return { pts, band: 2 * f.n + 2 };
}

// full ring (closed: the last point repeats the first) from the right half: right side up, left side mirrored back down
function ring(st, f) {
  const { pts, band } = crossSection(st, f), m = pts.length, out = [];
  for (const [y, z] of pts) out.push([y, z]);
  for (let i = m - 2; i >= 1; i--) out.push([pts[i][0], -pts[i][1]]);
  out.push([pts[0][0], pts[0][1]]);
  return { ring: out, m, band };
}

// segment s of the ring: 'lower' (paint), 'band' (door glass when the span says so) or 'top' (windscreen / roof / rear window)
function segmentKind(s, m, band) {
  const j = s < m - 1 ? s : 2 * m - 3 - s;
  return j < band ? 'lower' : j === band ? 'band' : 'top';
}

// positions / uvs as flat arrays, triangle indices split into the paint group and the glass group, plus the v of the
// floor corner, the belt and the roof on the right side (the body texture is drawn in this uv space; left side = 1 - v)
export function loftBody(def, f = FILLET) {
  const st = def.stations, rings = st.map(s => ring(s, f)), m = rings[0].m, band = rings[0].band, R = rings[0].ring.length;
  const xMin = st[0].x, L = st[st.length - 1].x - xMin;
  const positions = [], uvs = [], bodyIndices = [], glassIndices = [];
  for (let i = 0; i < st.length; i++) for (let k = 0; k < R; k++) { const [y, z] = rings[i].ring[k]; positions.push(st[i].x, y, z); uvs.push((st[i].x - xMin) / L, k / (R - 1)); }
  for (let i = 0; i < st.length - 1; i++) {
    const span = st[i].span;
    for (let k = 0; k < R - 1; k++) {
      const kind = segmentKind(k, m, band), glass = (kind === 'band' && span.side) || (kind === 'top' && span.top);
      const a = i * R + k, b = a + 1, c = a + R, d = c + 1, idx = glass ? glassIndices : bodyIndices;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (const [i, flip] of [[0, true], [st.length - 1, false]]) {
    const centre = positions.length / 3; positions.push(st[i].x, (st[i].floor + st[i].roof) / 2, 0); uvs.push(i === 0 ? 0 : 1, 0.5);
    for (let k = 0; k < R - 1; k++) { const a = i * R + k, b = a + 1; if (flip) bodyIndices.push(centre, a, b); else bodyIndices.push(centre, b, a); }
  }
  const v = { sill: (f.n + 1) / (R - 1), belt: (2 * f.n + 2) / (R - 1), roof: (3 * f.n + 3) / (R - 1) };
  return { positions, uvs, bodyIndices, glassIndices, v };
}

export function bodyBox(def) {
  const st = def.stations;
  return { l: st[st.length - 1].x - st[0].x, w: 2 * Math.max(...st.map(s => s.wSill)), h: Math.max(...st.map(s => s.roof)) - Math.min(...st.map(s => s.floor)), minY: Math.min(...st.map(s => s.floor)) };
}

// lathe points [r, y] for one wheel, y along the axle from the inner face (-w/2) to the outer face (+w/2): tread with rounded
// shoulders, sidewall down to the rim lip at 0.66 R, then the rim dish in to the hub boss and the axis. The first tyreCount
// points are rubber, the rest polished alloy.
export function WHEEL_PROFILE(R, w) {
  const points = [[0.66 * R, -w / 2], [0.94 * R, -w / 2 + 0.015], [R, -0.35 * w], [R, 0.35 * w], [0.94 * R, w / 2 - 0.015], [0.66 * R, w / 2], [0.60 * R, w / 2 - 0.02], [0.30 * R, w / 2 - 0.08], [0.22 * R, w / 2 - 0.05], [0, w / 2 - 0.05]];
  return { points, tyreCount: 6 };
}

export const SPOKES = 5;
export function spokeBars(R) {
  return Array.from({ length: SPOKES }, (_, i) => ({ angle: i * 2 * Math.PI / SPOKES, r0: 0.22 * R, r1: 0.66 * R, width: 0.11 * R, thick: 0.025 }));
}

// the dark wheel opening: gap between tyre and arch, and the arch lip's tube radius
export const ARCH = { lip: 0.04, gap: 0.09 };
export const archRadius = (R) => R + ARCH.gap;
```

- [ ] Run `node --test prototype/tests/carbody.test.mjs` — all green. Then `node --test prototype/tests/*.test.mjs`.
- [ ] Commit: `feat(vehicles): pure body loft, wheel profile and spokes for the compact (#164)`.

### Task 2: Environment map, physically based car materials, hooks

**Files:** `prototype/index.html` (`:1148` `carMats`, `:1219-1228` `STYLES` / `applyStyle`, `:1369-1381` hooks), create `prototype/tests/test_car_look.py`.

- [ ] Write the failing browser test `prototype/tests/test_car_look.py`:

```python
"""#164: the car's materials are physically based and lit by a sky environment map; the car stays within its frame budget.
Hand layout (world and terrain blocked), frame-light: one page per test, reads after wait_frames."""
from playwright.sync_api import sync_playwright

from test_vehicles import open_hand, wait_frames, use_vehicle

MATS_JS = "() => window.__mm.carMats()"
STATS_JS = "() => window.__mm.carStats()"


def test_car_materials_are_pbr_with_env_map(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        m = page.evaluate(MATS_JS)
        b.close()
    assert m["body"]["type"] == "MeshPhysicalMaterial" and m["body"]["clearcoat"] == 1 and m["body"]["hasEnv"], m["body"]
    assert m["body"]["color"] == "#1b2d5e", m["body"]
    assert m["glass"]["hasEnv"] and m["glass"]["roughness"] <= 0.1, m["glass"]
    assert m["rim"]["metalness"] == 1 and m["rim"]["hasEnv"], m["rim"]
    assert m["steel"]["metalness"] >= 0.8 and m["steel"]["hasEnv"], m["steel"]
    for k in ("lampHead", "lampTail"):
        assert m[k]["emissiveIntensity"] > 0 and m[k]["hasEnv"], (k, m[k])
    for k in ("tyre", "dark"):
        assert m[k]["metalness"] == 0 and m[k]["roughness"] >= 0.7, (k, m[k])


def test_style_switch_keeps_env_map_and_frees_the_old_one(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        page.evaluate("() => window.__mm.setStyle('smooth')"); wait_frames(page)
        first = page.evaluate("() => ({ gpu: window.__mm.gpu(), env: window.__mm.carMats().body.hasEnv, i: window.__mm.carMats().body.envMapIntensity })")
        page.evaluate("() => window.__mm.setStyle('original')"); wait_frames(page)
        page.evaluate("() => window.__mm.setStyle('smooth')"); wait_frames(page)
        last = page.evaluate("() => ({ gpu: window.__mm.gpu(), env: window.__mm.carMats().body.hasEnv, i: window.__mm.carMats().body.envMapIntensity })")
        b.close()
    assert first["env"] and last["env"], (first, last)
    assert last["gpu"]["textures"] == first["gpu"]["textures"], (first, last)
    assert first["i"] == 1.0, first


def test_original_style_tones_the_reflections_down(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        i = page.evaluate("() => window.__mm.carMats().body.envMapIntensity")
        b.close()
    assert 0 < i < 1, i


def test_compact_stays_within_the_frame_budget(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        s = page.evaluate(STATS_JS)
        b.close()
    assert s["meshes"] <= 48 and s["triangles"] <= 30000, s


def test_delorean_stays_within_the_frame_budget_and_size(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate("() => { window.__mm.setVehicle(window.__mm.vehicles().delorean); }"); wait_frames(page)
        s = page.evaluate(STATS_JS); size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert s["meshes"] <= 56 and s["triangles"] <= 30000, s
    assert abs(size["l"] - 4.27) <= 0.03, size
```

- [ ] Run it (memory-capped, foreground) — fails: no `carMats` / `carStats` / `setStyle` hooks.
- [ ] In `index.html` replace the `carMats` line (`:1148`) with the new materials. Keep `STEEL_GRAIN` (`:1147`). On its own lines above the statement put the comments; the statement itself carries no `//`:

```js
// #164: physically based car materials lit by CAR_ENV (set in applyStyle). body.color is the paint (#7 swatches write it);
// body.map is BODY_LINES (Task 3), white with dark seams, multiplied with the paint. glass stays dark and opaque (#123).
const carMats = { body: new THREE.MeshPhysicalMaterial({ color: 0x1b2d5e, metalness: 0, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 }), steel: new THREE.MeshStandardMaterial({ color: 0xb4b9be, metalness: 0.9, roughness: 0.42, map: STEEL_GRAIN }), glass: new THREE.MeshPhysicalMaterial({ color: 0x0b0f14, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0 }), dark: new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0, roughness: 0.75 }), rim: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.22 }), tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0, roughness: 0.92 }), lampHead: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0xfff6d0, emissiveIntensity: 0.35, metalness: 0, roughness: 0.12 }), lampTail: new THREE.MeshStandardMaterial({ color: 0xa01810, emissive: 0xe0322d, emissiveIntensity: 0.45, metalness: 0, roughness: 0.15 }) };
const CAR_ENV_MATS = [carMats.body, carMats.steel, carMats.glass, carMats.rim, carMats.lampHead, carMats.lampTail];
```

- [ ] Add the environment map right after `sky` / `sunSprite` (`:1089-1090`), before `STYLES`:

```js
// #164: a small environment map for the car's paint, glass and chrome, rendered once per style from a private sky scene
// (the style's gradient, a darker ground, a soft sun blob at the sun's direction). Only the car materials use it: the
// world's MeshStandardMaterials in the smooth style must not change their look (scene.environment stays unset).
const CAR_ENV = { tex: null, pmrem: new THREE.PMREMGenerator(renderer), scene: new THREE.Scene(), mat: null };
CAR_ENV.mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: col('#3a6fb8') }, hor: { value: col('#e6b98a') }, ground: { value: col('#4a4538') }, sunDir: { value: new THREE.Vector3(-300, 400, -200).normalize() } }, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 ground; uniform vec3 sunDir; varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = d.y; vec3 sky = mix(hor, top, smoothstep(-0.02, 0.45, h)); vec3 c = h < 0.0 ? mix(hor, ground, smoothstep(0.0, 0.25, -h)) : sky; float s = smoothstep(0.996, 0.9995, dot(d, sunDir)); c += vec3(1.0, 0.95, 0.8) * s * 3.0; gl_FragColor = vec4(c, 1.0); }' });
CAR_ENV.scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), CAR_ENV.mat));
function buildCarEnv(St) { CAR_ENV.tex?.dispose(); CAR_ENV.mat.uniforms.top.value.set(St.sky[0]); CAR_ENV.mat.uniforms.hor.value.set(St.sky[1]); CAR_ENV.tex = CAR_ENV.pmrem.fromScene(CAR_ENV.scene, 0.04).texture; for (const m of CAR_ENV_MATS) { m.envMap = CAR_ENV.tex; m.envMapIntensity = St.carEnv; m.needsUpdate = true; } }
```

  Note `col` (`:289`) and `renderer` (`:1063`) are defined earlier; `CAR_ENV_MATS` must be defined before `applyStyle` runs (`:1616`), which it is since `carMats` sits at `:1148`. Move the `CAR_ENV` block **after** `carMats` if the file order makes `CAR_ENV_MATS` undefined at the call — the first `applyStyle('original')` is at `:1616`, so any place before that works.

- [ ] In `STYLES` (`:1222`, `:1224`) add `carEnv: 0.7` to `original` and `carEnv: 1.0` to `smooth`. In `applyStyle` (`:1228`) add `buildCarEnv(St);` right after `renderer.toneMapping = St.tone;`. Keep the existing `flatShading` loop.
- [ ] Hooks (next to `:1380`), each on its own line:

```js
window.__mm.carMats = () => Object.fromEntries(Object.entries(carMats).map(([k, m]) => [k, { type: m.type, hasEnv: !!m.envMap, color: '#' + m.color.getHexString(), clearcoat: m.clearcoat ?? null, metalness: m.metalness ?? null, roughness: m.roughness ?? null, envMapIntensity: m.envMapIntensity ?? null, emissiveIntensity: m.emissive ? m.emissiveIntensity : null }]));
window.__mm.carStats = () => { let meshes = 0, triangles = 0; const walk = (o) => { if (!o.visible) return; if (o.isMesh) { meshes++; const g = o.geometry; triangles += Math.round((g.index ? g.index.count : g.attributes.position.count) / 3); } for (const c of o.children) walk(c); }; walk(car); return { meshes, triangles }; };
window.__mm.setStyle = (k) => { if (!Object.hasOwn(STYLES, k)) throw new Error(`Unknown style '${k}'`); applyStyle(k); };
```

- [ ] Run `test_car_look.py` — the three material tests pass; the budget tests pass already (today's car is small); `test_vehicles.py -k "glass or gpu or size"` and `test_wheels.py` still pass. Check the page has no console warning about `envMap` on a material without one (SwiftShader prints shader warnings to `console.warning` — `test_smoke.py`'s error check must stay clean).
- [ ] Commit: `feat(vehicles): sky environment map and physically based paint, glass, chrome and lamps (#164)`.

### Task 3: The compact's lofted body, panel-line texture, bumpers, lamps, mirrors

**Files:** `prototype/index.html` (`:252` imports, `:1147` textures, `:1154-1169` `buildCompact`, `:1376` glass hook).

- [ ] Add the import at `:252`: `import { COMPACT, loftBody, WHEEL_PROFILE, spokeBars, archRadius, ARCH } from './carbody.js';`
- [ ] After `STEEL_GRAIN` (`:1147`) add the body texture (comment on its own line):

```js
// #164: panel lines in the loft's uv space (u along the car, v around the ring: right side 0 -> 0.5, left side mirrored)
const LOFT = loftBody(COMPACT);
const BODY_LINES = makeTex(1024, 512, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); const u = (x) => (x + 2.33) / 4.66 * w, vr = (v) => v * h, vl = (v) => (1 - v) * h; const seam = (x, v0, v1) => { for (const vv of [vr, vl]) { g.fillRect(u(x) - 1, Math.min(vv(v0), vv(v1)), 2, Math.abs(vv(v1) - vv(v0))); } }; g.fillStyle = 'rgba(0,0,0,0.55)'; seam(0.95, LOFT.v.sill, LOFT.v.belt); seam(-0.05, LOFT.v.sill, LOFT.v.belt); seam(-0.95, LOFT.v.sill, LOFT.v.belt); seam(0.85, LOFT.v.belt, LOFT.v.roof); seam(-1.80, LOFT.v.belt, LOFT.v.roof); for (const vv of [vr, vl]) { g.fillRect(u(0.85), vv(LOFT.v.roof) - 1, u(2.0) - u(0.85), 2); g.fillRect(u(-2.15), vv(LOFT.v.roof) - 1, u(-1.80) - u(-2.15), 2); for (const x of [0.15, -0.85]) g.fillRect(u(x), vv(LOFT.v.belt - 0.012) - 2, u(x + 0.16) - u(x), 4); } g.fillStyle = 'rgba(0,0,0,0.25)'; for (const vv of [vr, vl]) g.fillRect(0, Math.min(vv(0), vv(LOFT.v.sill)), w, Math.abs(vv(LOFT.v.sill) - vv(0))); });
BODY_LINES.wrapS = BODY_LINES.wrapT = THREE.ClampToEdgeWrapping; carMats.body.map = BODY_LINES; carMats.body.needsUpdate = true;
```

  `makeTex` (`:298`) sets `anisotropy` only for `TEX` entries at `:1064`; set `BODY_LINES.anisotropy = renderer.capabilities.getMaxAnisotropy()` on its own line after the renderer exists (it does: `:1063` is earlier than `carMats`? — **check the order**: `carMats` at `:1148` comes after `renderer` at `:1063`, so it is fine to set it right here).

- [ ] Rewrite `buildCompact` (`:1154-1169`). Keep the blinker block (first line) and the nitro flames line; replace everything else:

```js
function buildCompact(g, v) {
  { const m = new THREE.MeshBasicMaterial({ color: 0xff9a1a }); for (const [side, z] of [['left', -0.86], ['right', 0.86]]) for (const x of [2.28, -2.30]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), m); b.position.set(x, 0.62, z); BLINK[side].add(b); } }
  // the hull: one loft, paint group 0 and glass group 1 (the glass hook reads material[userData.glass])
  const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(LOFT.positions, 3)); hull.setAttribute('uv', new THREE.Float32BufferAttribute(LOFT.uvs, 2)); hull.setIndex([...LOFT.bodyIndices, ...LOFT.glassIndices]); hull.addGroup(0, LOFT.bodyIndices.length, 0); hull.addGroup(LOFT.bodyIndices.length, LOFT.glassIndices.length, 1); hull.computeVertexNormals();
  const body = new THREE.Mesh(hull, [carMats.body, carMats.glass]); body.userData.glass = 1; g.add(body);
  // wheel openings: a dark half disc and an arch lip on the body side at each wheel (left side faces outward via rotation.y)
  const aR = archRadius(v.wheelR), wSide = 0.90 + 0.01;
  for (const [x] of v.wheels) for (const s of [1, -1]) { const well = new THREE.Mesh(new THREE.CircleGeometry(aR, 20, 0, Math.PI), carMats.dark); well.position.set(x, v.wheelR, s * wSide); well.rotation.y = s < 0 ? Math.PI : 0; const lip = new THREE.Mesh(new THREE.TorusGeometry(aR, ARCH.lip, 6, 14, Math.PI), carMats.dark); lip.position.set(x, v.wheelR, s * wSide); g.add(well, lip); }
  // bumpers: capsules lying across the car under the nose and the tail
  for (const [x, len] of [[2.30, 1.36], [-2.30, 1.36]]) { const bump = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, len, 2, 8), carMats.dark); bump.rotation.x = Math.PI / 2; bump.position.set(x, 0.42, 0); g.add(bump); }
  // nitro: two blue exhaust flames at the rear, shown while N is held
  for (const z of [0.45, -0.45]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 10), new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.85 })); f.rotation.z = Math.PI / 2; f.position.set(-2.65, 0.42, z); flames.add(f); }
  buildWheels(g, v);
  // lamps as glossy lenses, mirrors on dark stalks, grille, plate
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.22, 2, 8), carMats.lampHead); h.rotation.x = Math.PI / 2; h.position.set(2.25, 0.76, s * 0.55); g.add(h); const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.4), carMats.lampTail); t.position.set(-2.31, 0.90, s * 0.52); g.add(t); const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), carMats.body); m.position.set(0.72, 1.12, s * 0.98); g.add(m); const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.12), carMats.dark); stalk.position.set(0.72, 1.08, s * 0.90); g.add(stalk); }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.9), carMats.dark); grille.position.set(2.32, 0.60, 0); g.add(grille);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshBasicMaterial({ map: textTex('AG · 4334', 256, 64, '#ffffff', '#111111', '700 44px "Barlow Condensed", sans-serif', '#111111') })); plate.position.set(-2.345, 0.62, 0); plate.rotation.y = -Math.PI / 2; g.add(plate);
}
```

  The old `shape`, `bodyS`, `glassS`, `sill` and the `MeshBasicMaterial` lamps are gone from `buildCompact`. `buildDelorean` keeps its own `shape` helper (it is defined inside that function, `:1173`).

- [ ] Fix the glass hook (`:1376`) so a multi-material mesh is read by index — replace `m = o.material` with `m = Array.isArray(o.material) ? o.material[o.userData.glass] : o.material`. The DeLorean's and the helicopter's `userData.glass = true` still resolve to the single material.
- [ ] Run `test_vehicles.py -k "size or glass or gpu"` — the size test must still read 4.66 × 2.18 × 1.55 ± 0.02 (the loft runs −2.33..2.33, the tail lamp box reaches −2.34, the mirrors ±1.09, the roof 1.55). If `l` comes out over 4.68, pull the tail lamps to `x = -2.30`; never widen the tolerance.
- [ ] Commit and push the branch: `feat(vehicles): lofted hatchback body with panel lines, bumpers and lamp lenses (#164)`.

### Task 4: Lathe wheels with spokes and the dark dish (shared `buildWheels`)

**Files:** `prototype/index.html` (`:1150-1153` `buildWheels`).

- [ ] Replace `buildWheels`:

```js
// the wheels every procedural car shares (#164 lathe tyre + rim, five spokes, a dark dish behind them) at each v.wheels [x, z],
// mirrored to +-z under #132's steer > roll groups; the outer face points away from the car (rotation.x = s * pi / 2)
function buildWheels(g, v) {
  g.userData.wheels = []; const frontX = frontAxleX(v.wheels), W = 0.24, prof = WHEEL_PROFILE(v.wheelR, W), seg = 24;
  const lathe = new THREE.LatheGeometry(prof.points.map(([r, y]) => new THREE.Vector2(r, y)), seg); const tyreCount = (prof.tyreCount - 1) * seg * 6; lathe.addGroup(0, tyreCount, 0); lathe.addGroup(tyreCount, lathe.index.count - tyreCount, 1);
  const spokes = mergeGeometries(spokeBars(v.wheelR).map(({ angle, r0, r1, width, thick }) => { const b = new THREE.BoxGeometry(r1 - r0, thick, width); b.translate((r0 + r1) / 2, W / 2 - 0.045, 0); b.rotateY(-angle); return b; }), false);
  const dish = new THREE.CircleGeometry(0.64 * v.wheelR, 20); dish.rotateX(-Math.PI / 2); dish.translate(0, W / 2 - 0.07, 0);
  for (const [x, z] of v.wheels) for (const s of [1, -1]) { const w = new THREE.Group(), roll = new THREE.Group(); const t = new THREE.Mesh(s === 1 ? lathe : lathe.clone(), [carMats.tyre, carMats.rim]); const sp = new THREE.Mesh(s === 1 ? spokes : spokes.clone(), carMats.rim); const d = new THREE.Mesh(s === 1 ? dish : dish.clone(), carMats.dark); for (const o of [t, sp, d]) o.rotation.x = s * Math.PI / 2; roll.add(t, sp, d); w.add(roll); w.position.set(x, v.wheelR, s * z); g.add(w); g.userData.wheels.push({ front: x === frontX, steer: w, roll }); }
}
```

  Geometry notes: `LatheGeometry` turns points `(r, y)` about the lathe's y axis, so `rotation.x = ±π/2` puts the axle along ±z with the outer face (`+w/2`) outward on both sides. The spoke boxes lie in the lathe's xz plane at height `W/2 − 0.045`, between the dish at `W/2 − 0.07` and the rim lip at `W/2`; after `rotateY(-angle)` they fan out around the axle. The dish circle's normal must face outward: after `rotateX(-π/2)` the circle faces +y in lathe space, which the wheel's `rotation.x` turns outward. `freeCar()` disposes each clone (they are separate geometries; the originals are referenced by the `s === 1` wheels and disposed with them). `g.index.count` on a lathe: three.js 0.170's `LatheGeometry` is indexed, with `(points.length - 1) * segments * 6` indices in point order, so the group split by `tyreCount` is exact.

- [ ] Run `test_wheels.py` (steer/roll groups unchanged) and `test_car_look.py` (budgets: compact 33 meshes, DeLorean ≈ 12 wheel meshes + its own ≈ 30) and `test_vehicles.py::test_rebuilds_free_gpu_memory` (clones disposed) and the DeLorean size test in `test_car_look.py` (the new tyres are the same radius; nothing pokes out).
- [ ] Commit and push: `feat(vehicles): lathe-turned tyres with five-spoke rims for every car (#164)`.

### Task 5: Screenshots, CHANGELOG, full affected run, PR

**Files:** `CHANGELOG.md`, the PR.

- [ ] Take two chase-camera screenshots with Playwright (hand layout, `wait_settled` from `test_vehicles.py`, 960 × 540, `page.screenshot(path=...)` after `setStyle('original')` and after `setStyle('smooth')`), save them to the scratchpad (not the repo), and attach them to the PR description. Look at them: the roof must be narrower than the sills, the door seams visible, the wheels in black openings with spokes, a bright reflection streak on the bonnet. If the `original` style blows out to white on the roof, lower `STYLES.original.carEnv` to 0.5 and re-shoot.
- [ ] `CHANGELOG.md` → `[Unreleased]` → `### Changed` (create the heading if it is missing):

```markdown
- The compact looks like a real hatchback now: a rounded body that narrows toward the roof, door and bonnet seams, black wheel arches with five-spoke alloy wheels on proper tyres, bumpers, and glossy paint, windows and lamps that reflect the sky. The DeLorean's stainless steel really shines now and rolls on the same new wheels.
```

- [ ] Run, in the foreground under the memory cap: `node --test prototype/tests/*.test.mjs` and `python -m pytest prototype/tests/test_car_look.py prototype/tests/test_vehicles.py prototype/tests/test_wheels.py prototype/tests/test_smoke.py -x -q`.
- [ ] Commit `docs(changelog): realistic compact (#164)`, push, open the PR with the two screenshots, the test commands and their results, and `Closes #164` — no, this is slice 1: write `Part of #164` and list what slice 2 (the DeLorean body) still needs.
