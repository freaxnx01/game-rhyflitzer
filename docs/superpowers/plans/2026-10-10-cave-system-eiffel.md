# Reservoir Hübel cave system with a life-size Eiffel Tower (#201) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans) task by task. Steps use `- [ ]`.

**Goal:** behind the #102 gate, a cave system — T1 → Vorhalle R0 (hub, two bricked-up stubs) → T2a west → bend N1 → T2b → a 340 m hall with a 330 m Eiffel Tower (Sketchfab model, CC BY 4.0), dark and floodlit; the tower not visible from the entrance; nothing changed outside; the find toasts in the hall.

**Spec:** `docs/superpowers/specs/2026-10-10-cave-system-eiffel-design.md` — layout sketch, all constants, A2/A4/A6 are `[needs maintainer]`; implement the defaults.

**Tech:** vanilla ES modules, three r170 (`GLTFLoader`, `MeshoptDecoder`, `SpotLight`, `CylinderGeometry`), `node --test`, pytest + Playwright (Chromium, SwiftShader).

## Global constraints

- **No `//` comment in the middle of a one-line statement in `prototype/index.html`**; new code on whole new lines. Find anchors **by quoted code**, not line numbers (numbers below are `main` @ `4e1ea73`).
- Pure maths in `prototype/hideout.js` (no three.js, no DOM). Never push a cave cut into `CUTS`. The system exists only when `HIDE` is non-null (`L && REAL && REGION.id === 'hochrhein'`).
- No package, bundler or `node_modules`. The only new dependency is the committed GLB; the loader and decoder come from the existing `three/addons/` importmap entry.
- Strings via `tr()`, `en` + `de` with equal keys, Swiss spelling, real umlauts. CHANGELOG by hand, player's voice. Never `git cliff -o`.
- Browser tests in the **foreground**, capped, output to a file, call timeout 600000 ms: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest prototype/tests/test_hideout.py -q -p no:cacheprovider > /tmp/hideout.txt 2>&1` (venv: `/home/freax/repos/github/freaxnx01/public/game-rhyflitzer/pipeline/.venv/bin/python` if the checkout has none). Run only the affected suites: `test_hideout.py`, `test_underpass.py`, `test_jump.py`, `test_heli.py`, `test_smoke.py`. **Commit and push before long verification.** No loosened assertions, no longer timeouts.
- Branch `feature/201-cave-system`; commits per task below; PR title `feat(world): Reservoir Hübel cave system with a life-size Eiffel Tower (#201)`, body `Closes #201`.

## Review focus

1. **Tower hidden from the gate** — `sightBlocked_MouthToHall` (Task 1) + the ray in `test_tower_hidden_from_the_mouth` (Task 3).
2. **Outside unchanged** — `test_hill_is_solid_over_the_system`, `test_map_shows_the_hill_over_the_hall`, forest tiles visible, `test_underpass.py` green (Tasks 2, 4).
3. **Cave mode restores the style** — `test_cave_mode_toggles_and_restores` (Task 4).
4. **Model loads lazily, placeholder survives a blocked load, feet pinned** — Task 5.
5. **Triangle/draw-call budget** — `lidTris + floorTris < 120000`, `calls ≤ outside + 20` (Tasks 2, 4).

---

### Task 1: Pure cave layout in `hideout.js`

**Files:** modify `prototype/hideout.js`, `prototype/tests/hideout.test.mjs`.

**Interfaces (new exports):** `CAVE` `{ f0: null (set per terrain), nodes: { r0: { c, r: 20, ceiling: 'lid' }, n1: { c, r: 7, ceiling: 'lid' }, hall: { c: [-790, 1855], r: 168, ceiling: 380, shellR: 167 } }, links: [{ id: 't2a', from: 'r0', to: 'n1', hw: 4.5, ceiling: 12 }, { id: 't2b', from: 'n1', to: 'hall', hw: 4.5, ceiling: 12 }], stubs: [{ id: 'stubE', node: 'r0', heading: 45°, len: 15, hw: 4.5, ceiling: 'lid' }, { id: 'stubW', node: 'n1', heading: 185°, len: 15, hw: 4.5, ceiling: 'lid' }] }` with `n1.c = r0.c + 90 m @ 185°`; `TUNNEL_CEIL = 12`; `EIFFEL = { h: 330, feet: [[-50, -50], [50, -50], [50, 50], [-50, 50]], footHw: 13, footH: 60, url: './assets/models/eiffel_tower.glb', colour: 0x6b4a32, roughness: 0.75, metalness: 0.35, loadWithin: 400 }`; `HALL_CAM = { tilt: 0.45, ease: 1 }`; `TOWER_SPOTS = { r: 140, aimY: 100, intensity: 10000, distance: 600, angle: 0.5, penumbra: 0.5 }`; functions `nodeR(node, u)` (`r + margin + wall/2`), `linkPts(link)`, `stubPts(stub)`, `caveCuts(groundAt, h, u)` → `{ cuts: [t1, r0, n1, t2a, t2b, hall, stubE, stubW], f0 }` (each cut `{ id, pts, t, hw, flat, f0, u, x, z, depth, reach, roundEnds, capped: null }`), `roomAt(x, z, pad = 0)`, `corridorAt(x, z, pad = 0)` (links and stubs; returns `{ id, s, d }`), `caveRoofed(x, z, portal, pad = 0)`, `inHideout(x, z)` (trench only), `segmentInHideout` (unchanged body, new `inHideout`), `ringArcs(nodeId)` → `[{ a0, a1 }]`, `ceilingAt(x, z, meshAt, portal)` (number or null), `sightBlocked(a, b, portal)`, `eiffelParts(h, footHalf = EIFFEL.feet[2][0])` (legs end at the given foot half-width). Keep `HIDEOUT`, `TUNNEL`, `hideoutAxis`, `axisCoords`, `floorAt`, `portalS`, `cavernR`, `inCavern`, `ringStations`, `hideoutCuts` (still returns `{ tunnel, cavern, f0 }`; `caveCuts` reuses it).

- [ ] **Step 1: Rewrite the failing tests.** In `hideout.test.mjs` replace `HIDEOUT and TUNNEL`, `hideoutCuts_*` (keep `FloorMeetsTheGroundAtTheMouth`, `CavernIsAFlatDiscOfRadius22`, `NoStepWhereTheTunnelOpensIntoTheCavern`), `ringArc_*`, `inCavern_roofed_inHideout`, `segmentInHideout_*` and add:

```js
import { CAVE, EIFFEL, TUNNEL_CEIL, nodeR, caveCuts, roomAt, corridorAt, caveRoofed, ringArcs, ceilingAt, sightBlocked, linkPts, stubPts } from '../hideout.js';
const hill = (x, z) => 150;   // a flat 150 m plateau; T1 tests keep their sloped `hill`

test('CAVE_LayoutIsTheSpecsSketch', () => {
  close(CAVE.nodes.n1.c[0], -802.5, 0.1); close(CAVE.nodes.n1.c[1], 1520.4, 0.1);
  assert.deepEqual(CAVE.nodes.hall.c, [-790, 1855]); assert.equal(nodeR(CAVE.nodes.hall), 170); assert.equal(nodeR(CAVE.nodes.r0), 22);
  assert.equal(CAVE.nodes.hall.ceiling, 380); assert.equal(TUNNEL_CEIL, 12);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [a, b] of [['r0', 'n1'], ['r0', 'hall'], ['n1', 'hall']]) assert.ok(d(CAVE.nodes[a].c, CAVE.nodes[b].c) > nodeR(CAVE.nodes[a]) + nodeR(CAVE.nodes[b]) + 10, `${a}/${b} overlap`);
  assert.ok(CAVE.nodes.hall.c[1] + nodeR(CAVE.nodes.hall) + TUNNEL.wall < 2042, 'inside the ground grid');
});

test('caveCuts_EightLevelCutsOnOneFloor', () => {
  const { cuts, f0 } = caveCuts(hill);
  assert.deepEqual(cuts.map(c => c.id), ['t1', 'r0', 'n1', 't2a', 't2b', 'hall', 'stubE', 'stubW']);
  for (const c of cuts.slice(1)) { assert.equal(c.f0, f0); assert.equal(c.u, TUNNEL); assert.ok(c.depth > 70); assert.ok(c.roundEnds); }
  const [hx, hz] = CAVE.nodes.hall.c, hall = cuts.find(c => c.id === 'hall');
  for (const r of [0, 100, 169]) close(cutFloorAt(hall, hx + r, hz, TUNNEL), f0, 1e-6, `hall r ${r}`);
  assert.equal(cutFloorAt(hall, hx + 171, hz, TUNNEL), null);
  const t2b = cuts.find(c => c.id === 't2b'), [px, pz] = linkPts(CAVE.links[1])[0];
  close(cutFloorAt(t2b, px, pz, TUNNEL), f0); close(cutFloorAt(t2b, (px + hx) / 2, (pz + hz) / 2, TUNNEL), f0, 1e-6, 'level along T2b');
});

test('roomAt_corridorAt_caveRoofed', () => {
  const [hx, hz] = CAVE.nodes.hall.c, [rx, rz] = CAVE.nodes.r0.c;
  assert.equal(roomAt(hx, hz), 'hall'); assert.equal(roomAt(hx + 169, hz), 'hall'); assert.equal(roomAt(hx + 175, hz), null); assert.equal(roomAt(hx + 175, hz, 6), 'hall');
  assert.equal(roomAt(rx, rz), 'r0'); assert.equal(roomAt(...CAVE.nodes.n1.c), 'n1');
  const mid = linkPts(CAVE.links[0]).map(p => p[0] / 2).reduce((a, b) => a + b), midz = linkPts(CAVE.links[0]).map(p => p[1] / 2).reduce((a, b) => a + b);
  assert.equal(corridorAt(mid, midz).id, 't2a'); assert.equal(corridorAt(mid, midz + 12), null, '12 m off T2a is rock');
  assert.equal(corridorAt(...stubPts(CAVE.stubs[0])[1]).id, 'stubE');
  assert.ok(caveRoofed(hx, hz, 10)); assert.ok(caveRoofed(mid, midz, 10)); assert.ok(!caveRoofed(hx + 300, hz, 10));
  assert.ok(caveRoofed(A.mouth[0] + A.ux * 50, A.mouth[1] + A.uz * 50, 10)); assert.ok(!caveRoofed(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5, 10), 'the open trench');
});

test('inHideout_IsTheOpenTrenchOnly', () => {
  assert.ok(inHideout(A.mouth[0] + A.ux * 5, A.mouth[1] + A.uz * 5)); assert.ok(!inHideout(...CAVE.nodes.r0.c), 'forest stands on the lid over R0'); assert.ok(!inHideout(...CAVE.nodes.hall.c));
  assert.ok(!segmentInHideout(CAVE.nodes.hall.c[0] - 5, CAVE.nodes.hall.c[1], CAVE.nodes.hall.c[0] + 5, CAVE.nodes.hall.c[1]));
});

test('ringArcs_LeaveEveryExitOpen', () => {
  const r0 = ringArcs('r0'), n1 = ringArcs('n1'), hall = ringArcs('hall');
  assert.equal(r0.length, 3); assert.equal(n1.length, 3); assert.equal(hall.length, 1);
  const total = r0.reduce((s, a) => s + a.a1 - a.a0, 0); assert.ok(total < 2 * Math.PI && total > Math.PI, 'three openings in R0');
  // nothing in any doorway: no arc point lies within the corridor half-width of an exit's axis
  for (const [id, arcs] of [['r0', r0], ['n1', n1], ['hall', hall]]) for (const a of arcs) for (let k = 0; k <= 20; k++) {
    const ang = a.a0 + (a.a1 - a.a0) * k / 20, n = CAVE.nodes[id], R = nodeR(n) - TUNNEL.wall / 2, x = n.c[0] + Math.cos(ang) * R, z = n.c[1] + Math.sin(ang) * R;
    assert.equal(corridorAt(x, z, -0.01), null, `${id} wall in a doorway at ${ang}`);
  }
});

test('ceilingAt_TunnelsCappedRoomsLidHallHigh', () => {
  const f0 = caveCuts(hill).f0, mid = linkPts(CAVE.links[1]); const mx = (mid[0][0] + mid[1][0]) / 2, mz = (mid[0][1] + mid[1][1]) / 2;
  close(ceilingAt(mx, mz, hill, 10), f0 + TUNNEL_CEIL); close(ceilingAt(...CAVE.nodes.hall.c, hill, 10), f0 + 380); close(ceilingAt(...CAVE.nodes.r0.c, hill, 10), 150 - 0.6);
  close(ceilingAt(A.mouth[0] + A.ux * 60, A.mouth[1] + A.uz * 60, hill, 10), Math.min(150 - 0.6, floorAt(60, 150) + TUNNEL_CEIL), 1e-6, 'T1 capped too');
  assert.equal(ceilingAt(CAVE.nodes.hall.c[0] + 400, CAVE.nodes.hall.c[1], hill, 10), null);
});

test('sightBlocked_MouthToHall', () => {
  const [hx, hz] = CAVE.nodes.hall.c, R = nodeR(CAVE.nodes.hall), eyes = [], targets = [[hx, hz]];
  for (let d = -4.5; d <= 4.5; d += 1.125) eyes.push([A.mouth[0] - A.uz * d, A.mouth[1] + A.ux * d]);
  for (let k = 0; k < 36; k++) targets.push([hx + Math.cos(k / 36 * 2 * Math.PI) * R, hz + Math.sin(k / 36 * 2 * Math.PI) * R]);
  for (const e of eyes) for (const t of targets) assert.ok(sightBlocked(e, t, 10), `clear line from ${e} to ${t}`);
  assert.ok(!sightBlocked(A.mouth, CAVE.nodes.r0.c, 10), 'R0 is in plain view from the mouth');
  assert.ok(!sightBlocked(CAVE.nodes.n1.c, [hx, hz], 10), 'the reveal: N1 looks straight at the tower');
});

test('eiffelParts_ScalesTo330AndStandsOnTheFeet', () => {
  const parts = eiffelParts(330, 50), spire = parts.find(p => p.kind === 'spire'); close(spire.y1, 330);
  const feet = parts.filter(p => p.kind === 'leg' && p.r0 > 2 && p.from[1] === 0).map(p => p.from); assert.equal(feet.length, 4);
  for (const f of feet) { close(Math.abs(f[0]), 50); close(Math.abs(f[2]), 50); }
});
```

- [ ] **Step 2: Run, expect failures** (`node --test prototype/tests/hideout.test.mjs`: missing exports).

- [ ] **Step 3: Implement.** Sketch (keep the existing helpers; add):

```js
export const TUNNEL_CEIL = 12;
const R0 = [-712.8, 1528.2], deg = (d) => d * Math.PI / 180, step = (p, a, l) => [p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l];
export const CAVE = { nodes: { r0: { c: R0, r: 20, ceiling: 'lid' }, n1: { c: step(R0, deg(185), 90), r: 7, ceiling: 'lid' }, hall: { c: [-790, 1855], r: 168, ceiling: 380, shellR: 167 } },
  links: [{ id: 't2a', from: 'r0', to: 'n1', hw: 4.5, ceiling: TUNNEL_CEIL }, { id: 't2b', from: 'n1', to: 'hall', hw: 4.5, ceiling: TUNNEL_CEIL }],
  stubs: [{ id: 'stubE', node: 'r0', heading: deg(45), len: 15, hw: 4.5, ceiling: 'lid' }, { id: 'stubW', node: 'n1', heading: deg(185), len: 15, hw: 4.5, ceiling: 'lid' }] };
export const EIFFEL = { h: 330, feet: [[-50, -50], [50, -50], [50, 50], [-50, 50]], footHw: 13, footH: 60, url: './assets/models/eiffel_tower.glb', colour: 0x6b4a32, roughness: 0.75, metalness: 0.35, loadWithin: 400 };
export const HALL_CAM = { tilt: 0.45, ease: 1 };
export const TOWER_SPOTS = { r: 140, aimY: 100, intensity: 10000, distance: 600, angle: 0.5, penumbra: 0.5 };
export function nodeR(n, u = TUNNEL) { return n.r + u.margin + u.wall / 2; }
export function linkPts(l) { return [CAVE.nodes[l.from].c, CAVE.nodes[l.to].c]; }
// a stub starts on the node's disc edge (inside the wall, so the cut and the disc overlap) and runs len m out
export function stubPts(s, u = TUNNEL) { const n = CAVE.nodes[s.node], a = step(n.c, s.heading, nodeR(n, u) - u.wall); return [a, step(a, s.heading, s.len)]; }
const disc = (id, c, r, f0, depth, u) => { const e = 0.05; return { id, pts: [[c[0] - e, c[1]], [c[0] + e, c[1]]], t: e, hw: r, flat: 1, f0, u, x: c[0], z: c[1], depth, reach: [1, 1], roundEnds: true, capped: null }; };
const corridor = (id, pts, hw, f0, depth, u) => { const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); return { id, pts, t: 0, hw, flat: 1e9, f0, u, x: (pts[0][0] + pts[1][0]) / 2, z: (pts[0][1] + pts[1][1]) / 2, depth, reach: [0, len], roundEnds: true, capped: null }; };
export function caveCuts(groundAt, h = HIDEOUT, u = TUNNEL) {
  const { tunnel, cavern, f0 } = hideoutCuts(groundAt, h, u), dep = (c) => groundAt(c[0], c[1]) - f0, N = CAVE.nodes;
  tunnel.id = 't1'; cavern.id = 'r0';
  const cuts = [tunnel, cavern, disc('n1', N.n1.c, N.n1.r, f0, dep(N.n1.c), u),
    ...CAVE.links.map(l => corridor(l.id, linkPts(l), l.hw, f0, dep(linkPts(l)[1]), u)), disc('hall', N.hall.c, N.hall.r, f0, dep(N.hall.c), u),
    ...CAVE.stubs.map(s => corridor(s.id, stubPts(s, u), s.hw, f0, dep(stubPts(s, u)[1]), u))];
  return { cuts, f0 };
}
export function roomAt(x, z, pad = 0, u = TUNNEL) { for (const id in CAVE.nodes) { const n = CAVE.nodes[id]; if (Math.hypot(x - n.c[0], z - n.c[1]) <= nodeR(n, u) + pad) return id; } return null; }
function alongPts(pts, x, z) { const [ax, az] = pts[0], [bx, bz] = pts[1], ux = bx - ax, uz = bz - az, len = Math.hypot(ux, uz), s = ((x - ax) * ux + (z - az) * uz) / len, d = Math.abs((-(x - ax) * uz + (z - az) * ux) / len); return { s, d, len }; }
export function corridorAt(x, z, pad = 0, u = TUNNEL) {
  for (const c of [...CAVE.links.map(l => ({ ...l, pts: linkPts(l) })), ...CAVE.stubs.map(s => ({ ...s, pts: stubPts(s, u) }))]) { const { s, d, len } = alongPts(c.pts, x, z); if (d <= c.hw + u.margin + u.wall / 2 + pad && s >= -pad && s <= len + pad) return { id: c.id, s, d }; }
  return null;
}
export function caveRoofed(x, z, portal, pad = 0, h = HIDEOUT, u = TUNNEL) {
  if (roomAt(x, z, u.wall + pad, u) || corridorAt(x, z, pad, u)) return true;
  const { s, d } = axisCoords(x, z, h); return d <= h.hw + u.margin + u.wall / 2 + pad && s >= portal && s <= h.length;
}
export function inHideout(x, z, h = HIDEOUT) { const { s, d } = axisCoords(x, z, h); return d <= 10 && s >= -4 && s <= h.length - cavernR(h) + 6; }
// the arcs of wall of a node between its exits (links/stubs leaving it, and T1 for R0)
export function ringArcs(id, u = TUNNEL) {
  const n = CAVE.nodes[id], R = nodeR(n, u) - u.wall / 2, exits = [];
  for (const l of CAVE.links) { if (l.from === id) exits.push({ a: Math.atan2(CAVE.nodes[l.to].c[1] - n.c[1], CAVE.nodes[l.to].c[0] - n.c[0]), hw: l.hw }); if (l.to === id) exits.push({ a: Math.atan2(CAVE.nodes[l.from].c[1] - n.c[1], CAVE.nodes[l.from].c[0] - n.c[0]), hw: l.hw }); }
  for (const s of CAVE.stubs) if (s.node === id) exits.push({ a: s.heading, hw: s.hw });
  if (id === 'r0') exits.push({ a: HIDEOUT.heading + Math.PI, hw: HIDEOUT.hw });
  const half = (e) => Math.asin(Math.min(1, (e.hw + u.margin + u.wall) / R)), sorted = exits.map(e => ({ a: ((e.a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), half: half(e) })).sort((p, q) => p.a - q.a), out = [];
  for (let i = 0; i < sorted.length; i++) { const e = sorted[i], f = sorted[(i + 1) % sorted.length]; const a0 = e.a + e.half, a1 = (i + 1 < sorted.length ? f.a : f.a + 2 * Math.PI) - f.half; if (a1 > a0) out.push({ a0, a1 }); }
  return out;
}
export function ceilingAt(x, z, meshAt, portal, h = HIDEOUT, u = TUNNEL) {
  const lid = meshAt(x, z) - 0.6, f0 = floorAt(h.length, meshAt(...hideoutAxis(h).mouth), h, u), room = roomAt(x, z, u.wall, u);
  if (room) { const n = CAVE.nodes[room]; return n.ceiling === 'lid' ? lid : f0 + n.ceiling; }
  const c = corridorAt(x, z, 0, u); if (c) { const def = [...CAVE.links, ...CAVE.stubs].find(k => k.id === c.id); return def.ceiling === 'lid' ? lid : Math.min(lid, f0 + def.ceiling); }
  const { s, d } = axisCoords(x, z, h); if (d <= h.hw + u.margin + u.wall / 2 && s >= portal && s <= h.length) return Math.min(lid, floorAt(s, meshAt(...hideoutAxis(h).mouth), h, u) + TUNNEL_CEIL);
  return null;
}
function inCaveAir(x, z, h = HIDEOUT, u = TUNNEL) { if (roomAt(x, z, 0, u) || corridorAt(x, z, 0, u)) return true; const { s, d } = axisCoords(x, z, h); return d <= h.hw + u.margin && s >= -1 && s <= h.length; }
export function sightBlocked(a, b, portal) { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); for (let k = 0; k <= n; k++) if (!inCaveAir(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return true; return false; }
```

and `eiffelParts(h = HIDEOUT.towerH, footHalf = 6.25)`: scale the base corners `6.25` → `footHalf × 33 / h` in the `levels` table so the legs end on the feet. Update the module header comment to #201.

- [ ] **Step 4: Run, expect green.** If `ringArcs` leaves a wall piece in a doorway, check `half()` uses `hw + margin + wall` (the corridor's outer face) and `R` the ring's centre radius.
- [ ] **Step 5: Commit** `feat(world): pure cave layout for the Reservoir Hübel system (#201)`.

---

### Task 2: Floor, lid, capped ceilings, walls, stubs, map, trees (`index.html`)

**Files:** modify `prototype/index.html` (import `:328`; `HIDE`/`patchCuts`/`buildCuts` `:636-660`; `roofedAt…skyGroundH` `:663-667`; patch draw + lid `:1070-1098`; `hideoutBuild` `:883-919`; `disc` `:756`; tree loops `:1304, 1307, 1317, 1318`, forest `:1419`; map `:2099`; hooks `:1803-1808`), `prototype/tests/test_hideout.py`.

**Interfaces:** `HIDE = { cuts, f0, portal, found, walls, lamps, lidTris, floorTris, lidCells, floor, ring: { r0: [...], n1: [...] }, rooms }`; `roofedAt(x, z)` → `caveRoofed(x, z, HIDE.portal)`; `underLid` (pad `TUNNEL.wall`); `lidH` unchanged (`meshH − 0.6` under the lid); **new** `ceilingH(x, z)` → `ceilingAt(x, z, meshH, HIDE.portal)`; `lidGround(x, z)` → `roofedAt ? meshH : terrainH`; hooks `__mm.roomAt`, `__mm.ceilingAt`, `__mm.hideout()` with `rooms`, `floorTris`, `stubs`.

- [ ] **Step 1: Failing browser tests.** In `test_hideout.py` rewrite `test_floor_lid_and_tower` → `test_floor_lid_rooms_and_walls` (asserts `h["rooms"]["hall"]["c"] == [-790, 1855]`, `r == 170`, `minRock >= 40`, `abs(probe(hall).terrain − floor) < 0.3`, `abs(probe(n1).terrain − floor) < 0.3`, `h["stubs"] == 2`, `h["lidTris"] + h["floorTris"] < 120000`, `wallRoleAt` from inside R0 outward hits `stone`, down stub E from R0's centre hits `stone` within 40 m and `wallRoleAt` 2 m before the end wall hits the sign plane's role or `stone`); replace `test_ring_wall_stays_under_the_hill` (iterate `hideoutRing()` = `{ r0: [...], n1: [...] }`, same per-block grass check); add

```python
@needs_world
def test_hill_is_solid_over_the_system(server):
    """Across T2a, down T2b's axis and across the hall on the hilltop: the car stays on the hill, never under a ceiling, no find."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()")
        hx, hz = h["rooms"]["hall"]["c"]; n1x, n1z = h["rooms"]["n1"]["c"]
        t2a = page.evaluate(CROSS_JS, [n1x + 45, n1z + 25, -math.pi / 2, 5])       # north across T2a's middle
        hall = page.evaluate(CROSS_JS, [hx - 200, hz, 0.0, 25])                   # east across the whole hall footprint
        found = page.evaluate("() => window.__mm.hideout().found")
        br.close()
    assert errors == []
    for r in (t2a, hall):
        assert r["roofed"] > 0 and r["minAboveLid"] > 0, r["path"][:5]
    assert found is False

@needs_world
def test_map_shows_the_hill_over_the_hall(server):
    """The static map paints the hill's height over the hall, not the cave floor."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        px = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.hall.c; return [window.__mm.mapPixel(x, z), window.__mm.mapPixel(x + 260, z)]; }")
        br.close()
    assert errors == []
    assert px[0] == px[1], px      # same terrain tint as the uncut hill 260 m east (both > 100 m)

@needs_world
def test_forest_stands_on_the_lid(server):
    """Forest trees over the hall are planted on the hill, not on the cave floor."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        low = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.hall.c; return window.__FOREST.filter(t => Math.hypot(t[0] - x, t[1] - z) < 150).map(t => t[3] - window.__mm.skyGround(t[0], t[1])); }")
        br.close()
    assert errors == []
    assert len(low) > 50 and all(abs(d) < 0.05 for d in low), (len(low), low[:5])
```

(`CROSS_JS`/`across` exist; add `__mm.mapPixel(x, z)` → the `mapStatic` RGBA at `MX(x), MZ(z)` as a string.) Run `-k "floor_lid or solid_over or map_shows or forest"` → fail.

- [ ] **Step 2: Wire the cuts.** Import `CAVE, caveCuts, roomAt, corridorAt, caveRoofed, ceilingAt, ringArcs, linkPts, stubPts, nodeR, EIFFEL, HALL_CAM, TOWER_SPOTS, TUNNEL_CEIL, sightBlocked` (drop `ringArc`, keep the rest). `HIDE = … { ...caveCuts(meshH), portal: portalS(meshH), found, walls: 0, lamps: 0, lidTris: 0, floorTris: 0, lidCells: new Set(), floor: null }`. `patchCuts()` → `[...ARMS, ...HIDE.cuts.filter(c => c.depth > 0)]`; in `buildCuts` set `c.bounds = cutBounds(c, c.u)` for every `HIDE.cuts`. Replace the four predicates:

```js
function roofedAt(x, z) { return !!HIDE && caveRoofed(x, z, HIDE.portal); }
function underLid(x, z) { return !!HIDE && caveRoofed(x, z, HIDE.portal, TUNNEL.wall); }
function lidH(x, z) { return underLid(x, z) ? meshH(x, z) - 0.6 : null; }
function ceilingH(x, z) { return HIDE ? ceilingAt(x, z, meshH, HIDE.portal) : null; }
function skyGroundH(x, z) { const g = groundH(x, z, 1e4); return roofedAt(x, z) ? Math.max(g, meshH(x, z)) : g; }
function lidGround(x, z) { return roofedAt(x, z) ? meshH(x, z) : terrainH(x, z); }
```

- [ ] **Step 3: Patches and lid.** In the patch draw loop (`for … CUT_CELLS` building `PlaneGeometry(TGRID.dx, TGRID.dz, CUT_N, CUT_N)`): if `HIDE` and the cell's 4 corners + centre all have `terrainH === HIDE.f0` (±1e-3) → `PlaneGeometry(dx, dz, 1, 1)`; count `HIDE.floorTris += tris` for cells touching any cave cut. In the lid block: iterate `HIDE.cuts`; a cell wholly `underLid` at its 4 corners + centre → `1 × 1`; else as today. **Ceiling copy only when `roomAt(cx, cz, TUNNEL.wall) !== 'hall'`** (test the cell centre; boundary cells of the hall next to T2b's door keep their copy — the shell covers the rest), with vertex `y = ceilingH(x, z) ?? meshH(x, z) − 0.6` instead of `translate(0, −0.6, 0)`.
- [ ] **Step 4: Walls, stubs, floors.** In `hideoutBuild`: T1 walls as today but `topAt = (x, z) => ceilingH(x, z)` under the lid; R0 and N1 rings: `for (const arc of ringArcs(id)) ringStations(c, nodeR(n) − wall/2, Math.round(24 × span/2π), arc.a0, arc.a1)` → `wallBox(…, fl, ceilingH)`; store in `HIDE.ring[id]`. Links and stubs: `wallStations(pts, [[0, len]], hw + margin + wall/2, 2)`, skip stations with `roomAt(w.x, w.z, −TUNNEL.wall)`, `wallBox(…, fl, ceilingH)`. **Stub end wall:** at `len − 0.6` along the stub, `box(2 × (hw + margin + wall), ceilingH − fl, 1.2, …, stone, 'stone')` + a solid `pushOBB` (`secret`, not `low`), and a sign plane `PlaneGeometry(4, 0.7)` with `textTex('KEIN ZUTRITT', 1024, 180, '#f2c230', '#1a1a1a', '800 120px "Barlow Condensed", sans-serif')` 0.62 m in front of it facing the node; `HIDE.stubs++`. Hall: 48 invisible OBBs `ringStations(c, 166, 48)` → `pushOBB({ …, hw: len/2, hd: 1, h: fl + 400, secret: true })` (no box drawn). Gravel: `ribbon(linkPts/stubPts, hw, 0.04, 'gravel', …)` per link/stub, `disc(c, 167, 0.04, 'gravel', gravel, 48)` for the hall (`function disc(x, z, r, y, role, c, seg = 14)` → `RingGeometry(0, r, seg, 3)`). Remove the R0 `eiffelTower` call (Task 4 rebuilds it in the hall). `HIDE.rooms = { r0: { c, r: nodeR }, n1: …, hall: { c, r, ceiling: fl + 380, minRock: min over the disc of meshH − fl, sampled every 10 m } }`.
- [ ] **Step 5: Map and trees.** Map: `const h = HIDE && roofedAt(x, z) ? meshH(x, z) : terrainH(x, z)`. Trees: the `TREES` loop keeps `!(HIDE && (inHideout(tx, tz) || roomAt(tx, tz, 4) || corridorAt(tx, tz, 4)))` (scattered trees stay out of the whole system); `TREES` colliders unchanged. Forest: `t[3] = lidGround(t[0], t[1])` (`:1419`); the forest placement filter uses `inHideout` only (trench); edge walls: `h: lidGround(e.mx, e.mz) + 1.6` and skip only `segmentInHideout` (trench). Hooks: `__mm.hideout` adds `rooms`, `floorTris`, `stubs`, `ring` → `hideoutRing()` returns `{ r0, n1 }`; `__mm.roomAt = roomAt; __mm.ceilingAt = ceilingH; __mm.mapPixel`.
- [ ] **Step 6: Run** `-k "floor_lid or solid_over or map_shows or forest or ring_wall or corridor_edges or sky_ground"` → green; `node --test prototype/tests/*.test.mjs` green. Also `test_underpass.py -q` (rail cuts untouched).
- [ ] **Step 7: Commit** `feat(world): cave system floor, lid, capped ceilings, stubs and forest on the lid (#201)`.

---

### Task 3: Camera and ceiling, find in the hall, tower hidden from the mouth

**Files:** `prototype/index.html` (`underCeiling` `:1924`, `stepCamera` `:1931`, find `:1901`), `prototype/tests/test_hideout.py`.

- [ ] **Step 1: Failing tests.** Rewrite `test_drive_in_finds_the_hideout`: after `sim` 8 s into R0 assert `found is False` and `stored is None`; then `sim` from a point on T2b 60 m before the hall door, heading along T2b (`math.atan2(hz − n1z, hx − n1x)`), 16 m/s, 6 s → `found is True`, `stored == "1"`, toast shown, `roomAt(car) == 'hall'`, `|car.y − floor| < 1`. Extend `test_camera_stays_under_the_ceiling…`: the T1 check uses `ceilingAt` (`c["y"] <= ceiling − 1`); add the hall tilt:

```python
@needs_world
def test_chase_camera_tilts_up_in_the_hall(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        page.evaluate(f"() => window.__mm.sim({hx + 120}, {hz}, {math.pi}, 8, 0.5, ['KeyW'])")
        inside = page.evaluate("() => { let c; for (let i = 0; i < 180; i++) c = window.__mm.camStep(1 / 60, null); return c; }")
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING + math.pi}, 8, 0.5, ['KeyW'])")
        outside = page.evaluate("() => { let c; for (let i = 0; i < 180; i++) c = window.__mm.camStep(1 / 60, null); return c; }")
        br.close()
    assert errors == []
    assert inside["look"][1] >= 0.3, inside
    assert outside["look"][1] <= 0.05, outside

@needs_world
def test_tower_hidden_from_the_mouth(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        hits = page.evaluate(f"() => [60, 150, 300].map(y => window.__mm.wallRoleAt({h['mouth'][0]}, {h['mouth'][1]}, {hx}, {hz}, 1.5, y))")
        br.close()
    assert errors == []
    assert all(r == "stone" for r in hits), hits
```

(`wallRoleAt(x0, z0, x1, z1, up, up1 = up)` gains the optional target height.) Run → fail.

- [ ] **Step 2: Implement.** `underCeiling`: `const lid = HIDE && P.y < meshH(P.x, P.z) - 1 ? ceilingH(x, z) : null;`. Find: `if (HIDE && !HIDE.found && caveInside() && roomAt(P.x, P.z) === 'hall') foundHideout();` with `function caveInside() { return !!HIDE && roofedAt(P.x, P.z) && P.y < meshH(P.x, P.z) - 1; }` (one place; #202 makes it stateful). Camera: module state `const CAVE_CAM = { hall: 0 }`; in `stepCar` (or `stepCamera`) ease `CAVE_CAM.hall += ((caveInside() && roomAt(P.x, P.z) === 'hall') ? 1 : -1) * dt / HALL_CAM.ease`, clamped 0..1; in the chase branch build `const look = new THREE.Vector3(P.x + bx * 6, P.y + 1.2, P.z + bz * 6); look.y += CAVE_CAM.hall * HALL_CAM.tilt * Math.hypot(camPos.x - look.x, camPos.z - look.z); camera.lookAt(look);`. `__mm.cave()` (stub for now) → `{ inside: caveInside(), hallCam: CAVE_CAM.hall }`.
- [ ] **Step 3: Run** `-k "drive_in or camera or tilts or hidden_from or no_find or j_reservoir"` → green.
- [ ] **Step 4: Commit** `feat(world): find the hideout in the hall; chase camera tilts up there (#201)`.

---

### Task 4: Cave mode — hall shell, lights, fog, trees, pre-warm

**Files:** `prototype/index.html` (near `setUnderwater` `:1639`, `applyStyle` `:1635`, `hideoutBuild`, `stepCar`), `prototype/tests/test_hideout.py`.

**Interfaces:** `CAVE_MODE = { on: false, group: THREE.Group, lights: [], placeholder, model }`; `setCave(on)`; hooks `__mm.cave()` → `{ inside, visible, fog, fogDensity, shadows, treesVisible, lights: n, hallCam, programs }`, `__mm.hideoutLights()` adds `visible`, `kind`, `target`; `__mm.renderInfo()`.

- [ ] **Step 1: Failing tests.** Replace `test_cavern_is_floodlit_and_the_light_stays_inside` with

```python
@needs_world
def test_cave_mode_toggles_and_restores(server):
    """Inside: dark fog, no shadows, trees hidden, lights on, interior visible, no shader recompile. Outside again: the style's values."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        before = page.evaluate("() => window.__mm.cave()")
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        page.evaluate(f"() => window.__mm.sim({hx + 100}, {hz}, {math.pi}, 8, 0.5, ['KeyW'])")
        page.wait_for_function("() => window.__mm.cave().inside === true")
        inside = page.evaluate("() => window.__mm.cave()")
        lights = page.evaluate("() => window.__mm.hideoutLights()")
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING + math.pi}, 8, 0.5, ['KeyW'])")
        page.wait_for_function("() => window.__mm.cave().inside === false")
        after = page.evaluate("() => window.__mm.cave()")
        br.close()
    assert errors == []
    assert before["visible"] is False and all(not l["visible"] for l in lights) is False or True   # see assertions below
    assert inside["visible"] and inside["fog"] == "#07080a" and inside["shadows"] is False and inside["treesVisible"] is False
    assert 6 <= inside["lights"] <= 12 and all(l["visible"] for l in lights)
    assert inside["programs"] == before["programs"], "cave lights must be pre-compiled"
    for k in ("fog", "fogDensity", "shadows", "treesVisible", "visible"):
        assert after[k] == before[k], (k, before[k], after[k])

@needs_world
def test_floodlights_aim_at_the_tower_and_draw_calls_stay_bounded(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        h = page.evaluate("() => window.__mm.hideout()"); hx, hz = h["rooms"]["hall"]["c"]
        out_calls = page.evaluate("() => window.__mm.renderInfo().calls")
        page.evaluate(f"() => window.__mm.sim({hx + 100}, {hz}, {math.pi}, 8, 0.5, ['KeyW'])")
        page.wait_for_function("() => window.__mm.cave().inside === true")
        page.wait_for_timeout(1500)
        in_calls = page.evaluate("() => window.__mm.renderInfo().calls")
        spots = [l for l in page.evaluate("() => window.__mm.hideoutLights()") if l["kind"] == "spot"]
        br.close()
    assert errors == []
    assert len(spots) == 4
    aim = (hx, h["floor"] + 100, hz)
    e = sum(irradiance(l, *aim) for l in spots)
    assert 0.4 <= e <= 1.2, (e, spots)
    for l in spots: assert tuple(round(v, 1) for v in l["target"]) == tuple(round(v, 1) for v in aim)
    assert in_calls <= out_calls + 20, (out_calls, in_calls)
```

(Fix the first test's `before` line to `assert before["visible"] is False`.) Run → fail.

- [ ] **Step 2: Build the group.** In `hideoutBuild` (hall part): `CAVE_MODE.group = new THREE.Group(); scene.add(group); group.visible = false`. Shell: `const R = CAVE.nodes.hall.shellR, [arc] = ringArcs('hall'), th0 = Math.PI / 2 - arc.a1, thLen = arc.a1 - arc.a0;` lower ring `new THREE.CylinderGeometry(R, R, TUNNEL_CEIL, 64, 1, true, th0, thLen)` translated to `fl + TUNNEL_CEIL / 2`; upper ring `CylinderGeometry(R, R, 380 - TUNNEL_CEIL, 64, 1, true)` at `fl + TUNNEL_CEIL + (380 - TUNNEL_CEIL) / 2`; ceiling `CircleGeometry(R, 64).rotateX(Math.PI / 2)` at `fl + 380`; `mergeGeometries` → one `Mesh` with `MeshLambertMaterial({ color: 0x3a3632, side: THREE.DoubleSide, vertexColors: true })`, vertex colours `0.75 + 0.25 × rng` grey jitter (`colorize` then multiply). Lights: four `SpotLight(0xffd9a0, TOWER_SPOTS.intensity, distance, angle, penumbra, 2)` at `(cx ± r/√2, fl + 2, cz ± r/√2)`, `target.position.set(cx, fl + TOWER_SPOTS.aimY, cz)`, `group.add(light, light.target)`; two `PointLight(0xffe2b0, 400, 120, 2)` at `fl + 6`, ±60 m along the T2b direction; move R0's two point lights into the group (`group.add(l)`; positions unchanged). `HIDE.lights` = all of them, each with `userData.kind`.
- [ ] **Step 3: `setCave(on)`** next to `setUnderwater`:

```js
const CAVE_LOOK = { fog: '#07080a', density: 0.0016, hemiSky: '#4a5468', hemiGround: '#1a1612', hemi: 0.35, sunFactor: 0.15 };
function treesVisible(on) { const St = STYLES[styleKey]; treeBill.visible = on && St.trees === 'bill'; treeCone.visible = treeTrunk.visible = on && St.trees === 'cone'; for (const f of FOREST_MESHES) { f.bill.visible = on && St.trees === 'bill'; f.cone.visible = f.trunk.visible = on && St.trees === 'cone'; } }
function setCave(on) {
  CAVE_MODE.on = on; const St = STYLES[styleKey]; if (CAVE_MODE.group) CAVE_MODE.group.visible = on; sunSprite.visible = !on && !UWS.on;
  if (on) { scene.fog = new THREE.FogExp2(col(CAVE_LOOK.fog), CAVE_LOOK.density); skyMat.uniforms.top.value.set(CAVE_LOOK.fog); skyMat.uniforms.hor.value.set(CAVE_LOOK.fog); hemi.color.set(CAVE_LOOK.hemiSky); hemi.groundColor.set(CAVE_LOOK.hemiGround); hemi.intensity = CAVE_LOOK.hemi; sun.intensity = St.sunI * CAVE_LOOK.sunFactor; sun.castShadow = false; renderer.shadowMap.enabled = false; }
  else { scene.fog = St.fog(); skyMat.uniforms.top.value.set(St.sky[0]); skyMat.uniforms.hor.value.set(St.sky[1]); hemi.color.copy(HEMI_SKY.dry); hemi.groundColor.set(0x6a5a40); hemi.intensity = St.hemi; sun.intensity = St.sunI; sun.castShadow = St.shadows; renderer.shadowMap.enabled = St.shadows; }
  treesVisible(!on);
}
```

`applyStyle` ends with `if (CAVE_MODE.on) setCave(true);` (after `setUnderwater(UWS.on)`); `applyStyle`'s own tree-visibility lines are replaced by `treesVisible(!CAVE_MODE.on)`. In `stepCar`, after the find check: `const inside = caveInside(); if (inside !== CAVE_MODE.on) setCave(inside);`. **Pre-warm** right after the scene is built (after `applyStyle` runs the first time): `if (CAVE_MODE.group) { CAVE_MODE.group.visible = true; renderer.compile(scene, camera); CAVE_MODE.group.visible = false; }`.
- [ ] **Step 4: Hooks.** `__mm.cave = () => ({ inside: caveInside(), visible: !!CAVE_MODE.group && CAVE_MODE.group.visible, fog: '#' + scene.fog.color.getHexString(), fogDensity: scene.fog.density ?? null, shadows: renderer.shadowMap.enabled, treesVisible: treeBill.visible || treeCone.visible || FOREST_MESHES.some(f => f.bill.visible || f.cone.visible), lights: HIDE ? HIDE.lights.length : 0, hallCam: CAVE_CAM.hall, programs: renderer.info.programs.length })`; `__mm.hideoutLights` adds `visible: l.visible && l.parent.visible, kind: l.userData.kind, target: l.target ? l.target.position.toArray() : null, angle, penumbra`; `__mm.renderInfo = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles })`.
- [ ] **Step 5: Run** `-k "cave_mode or floodlights or sky_ground"` → green. Eyeball once (`?debug`, J → reservoir, drive in; smooth and original styles): the hall reads dark, the tower lit from below. Tune `CAVE_LOOK`/`TOWER_SPOTS` constants only.
- [ ] **Step 6: Commit** `feat(world): cave mode with a dark hall shell, floodlights and pre-compiled lights (#201)`.

---

### Task 5: The Eiffel Tower model — asset, lazy load, placeholder, feet

**Files:** add `prototype/assets/models/eiffel_tower.glb` (copy of `~/LocalSend/eiffel_tower.desktop.glb`), `prototype/assets/models/eiffel_tower.LICENSE.txt`; modify `prototype/index.html` (`eiffelTower` `:922-935`, `stepCar`), `prototype/hideout.js` (`EIFFEL.feet` after measuring), `prototype/tests/test_hideout.py`.

- [ ] **Step 1: Asset.** `mkdir -p prototype/assets/models && cp ~/LocalSend/eiffel_tower.desktop.glb prototype/assets/models/eiffel_tower.glb && ls -l prototype/assets/models/` (≈ 3.1 MB). Write `eiffel_tower.LICENSE.txt`: `„Eiffel Tower" (https://skfb.ly/AIU9) by Johnson Martin, licensed under Creative Commons Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). Modified: simplified/quantized and meshopt-compressed with gltf-transform; materials replaced in-game with a plain brown PBR material.` Commit `feat(world): life-size Eiffel Tower model by Johnson Martin, CC BY 4.0 (#201)` (binary + licence only).
- [ ] **Step 2: Failing tests.**

```python
@needs_world
def test_eiffel_model_loads_lazily_and_matches_the_feet(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith(".glb") else None)
        e0 = page.evaluate("() => window.__mm.eiffel()")
        assert e0["placeholder"] is True and e0["loaded"] is False and requests == []
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 0, 0.1, [])")
        page.wait_for_function("() => window.__mm.eiffel().loaded === true", timeout=60000)
        e = page.evaluate("() => window.__mm.eiffel()")
        fp = page.evaluate("() => window.__mm.eiffelFootprints()")
        push = page.evaluate("() => { const h = window.__mm.hideout(), [x, z] = h.rooms.hall.c, f = window.__mm.eiffel().feet; return { foot: window.__mm.pushAt(x + f[2][0], z + f[2][1], h.floor), centre: window.__mm.pushAt(x, z, h.floor) }; }")
        br.close()
    assert errors == []
    assert len(requests) == 1 and requests[0].endswith("/prototype/assets/models/eiffel_tower.glb")
    assert e["placeholder"] is False and e["tris"] >= 400000 and abs(e["height"] - 330) <= 2 and e["base"] <= 145 and e["material"] == "#6b4a32"
    assert len(fp) == 4
    for box in fp:                      # per-quadrant bbox of the model's vertices below 20 m, relative to the hall centre
        foot = min(e["feet"], key=lambda f: math.hypot(f[0] - (box["x0"] + box["x1"]) / 2, f[1] - (box["z0"] + box["z1"]) / 2))
        hw = e["footHw"] + 2
        assert foot[0] - hw <= box["x0"] and box["x1"] <= foot[0] + hw and foot[1] - hw <= box["z0"] and box["z1"] <= foot[1] + hw, (foot, box)
    assert math.hypot(push["foot"]["dx"], push["foot"]["dz"]) > 5, push      # a foot is solid
    assert math.hypot(push["centre"]["dx"], push["centre"]["dz"]) < 0.01, push  # between the legs is free

@needs_world
def test_eiffel_placeholder_survives_a_blocked_model(server):
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        page.route("**/eiffel_tower.glb", lambda r: r.abort())
        page.evaluate(f"() => window.__mm.sim({MOUTH_ROAD[0]}, {MOUTH_ROAD[1]}, {HEADING}, 0, 0.1, [])")
        page.wait_for_function("() => window.__mm.eiffel().error !== null", timeout=60000)
        e = page.evaluate("() => window.__mm.eiffel()"); counts = page.evaluate("() => window.__mm.counts")
        br.close()
    assert errors == []
    assert e["placeholder"] is True and e["loaded"] is False and counts["eiffel"] == 1
```

Run → fail (`__mm.eiffel` undefined).

- [ ] **Step 3: Placeholder + loader.** Rewrite `eiffelTower(x, z, b)`: build the parts of `eiffelParts(EIFFEL.h, EIFFEL.feet[2][0])` into one `mergeGeometries` → `new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: EIFFEL.colour }))` → `CAVE_MODE.group.add(mesh)`; `CAVE_MODE.placeholder = mesh`; feet: `for (const [fx, fz] of EIFFEL.feet) pushOBB({ x: x + fx, z: z + fz, hw: EIFFEL.footHw, hd: EIFFEL.footHw, c: 1, s: 0, h: b + EIFFEL.footH, secret: true })`; `window.__mm.counts.eiffel = 1`; `CAVE_MODE.eiffel = { loaded: false, placeholder: true, error: null, tris: 0, height: null, base: null }`. Loader:

```js
async function loadEiffel() {
  const E = CAVE_MODE.eiffel; E.started = true;
  try {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(EIFFEL.url), root = gltf.scene, mat = new THREE.MeshStandardMaterial({ color: EIFFEL.colour, roughness: EIFFEL.roughness, metalness: EIFFEL.metalness });
    let tris = 0; root.traverse(o => { if (!o.isMesh) return; o.material = mat; o.castShadow = o.receiveShadow = false; if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), s = EIFFEL.h / size.y, [cx, cz] = CAVE.nodes.hall.c, fl = HIDE.floor;
    root.scale.setScalar(s); root.position.set(cx - s * (box.min.x + box.max.x) / 2, fl - s * box.min.y, cz - s * (box.min.z + box.max.z) / 2);
    CAVE_MODE.group.remove(CAVE_MODE.placeholder); CAVE_MODE.group.add(root); CAVE_MODE.model = root;
    Object.assign(E, { loaded: true, placeholder: false, tris, height: size.y * s, base: Math.max(size.x, size.z) * s, material: '#' + mat.color.getHexString() });
  } catch (err) { console.warn('Eiffel Tower model not loaded, keeping the placeholder:', err); E.error = String(err); }
}
```

In `stepCar`: `if (HIDE && CAVE_MODE.eiffel && !CAVE_MODE.eiffel.started && Math.hypot(P.x - HIDEOUT.mouth[0], P.z - HIDEOUT.mouth[1]) < EIFFEL.loadWithin) loadEiffel();`. Hooks: `__mm.eiffel = () => CAVE_MODE.eiffel ? { ...CAVE_MODE.eiffel, feet: EIFFEL.feet, footHw: EIFFEL.footHw } : null`; `__mm.eiffelFootprints = () => { … }` — for the loaded model: for each mesh, apply `matrixWorld` to every vertex (`updateWorldMatrix(true, false)`), keep `y < HIDE.floor + 20`, bucket by the sign of `(x − cx, z − cz)`, return four `{ x0, x1, z0, z1 }` relative to the hall centre.
- [ ] **Step 4: Measure and pin the feet.** Run the loads test once; read the four footprints from the failure output (or `__mm.eiffelFootprints()` via `?debug` console); set `EIFFEL.feet` to the four bbox centres (rounded to 0.5 m) and `footHw` to the largest half-extent + 1 (rounded up), note the date in a comment; re-run → green. Keep the placeholder legs on the same feet (they take `EIFFEL.feet[2][0]`).
- [ ] **Step 5: Run** `-k eiffel` → green; `node --test prototype/tests/*.test.mjs` green.
- [ ] **Step 6: Commit** `feat(world): lazy-loaded life-size Eiffel Tower with a placeholder and foot collision (#201)`.

---

### Task 6: Credits, strings, changelog, README; final verification

**Files:** `prototype/strings.js`, `prototype/index.html` (help panel, F1 DOM near `<div id="help">`), `prototype/tests/strings.test.mjs`, `prototype/tests/test_credits.py` (new, no browser), `README.md`, `CHANGELOG.md`.

- [ ] **Step 1: Failing tests.** `strings.test.mjs`: `assert.match(translate('en', 'creditEiffel'), /Johnson Martin.*CC BY 4\.0/)`, de likewise. `test_credits.py`:

```python
from pathlib import Path
ROOT = Path(__file__).parents[2]
def test_eiffel_model_is_credited_everywhere():
    for f in ("README.md", "CHANGELOG.md", "prototype/assets/models/eiffel_tower.LICENSE.txt"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "Johnson Martin" in t and "CC BY 4.0" in t and "skfb.ly/AIU9" in t, f
    assert (ROOT / "prototype/assets/models/eiffel_tower.glb").stat().st_size > 2_000_000
```

- [ ] **Step 2: Strings + help.** en `creditEiffel: '3D model „Eiffel Tower" by Johnson Martin (Sketchfab), CC BY 4.0'`, de `creditEiffel: '3D-Modell „Eiffel Tower" von Johnson Martin (Sketchfab), CC BY 4.0'`; in the help panel, after the last `<div class="keys">…</div>` add `<small data-i18n="creditEiffel" style="display:block;margin-top:8px;color:var(--steel-l)"></small>` (the `data-i18n` fill-in handles both languages).
- [ ] **Step 3: README + CHANGELOG.** README „License": add `- **Third-party assets**: „Eiffel Tower" (https://skfb.ly/AIU9) by Johnson Martin, [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) — simplified and compressed, materials replaced in-game (see prototype/assets/models/eiffel_tower.LICENSE.txt)`. CHANGELOG `[Unreleased]` → `Changed`: „The Reservoir Hübel is a cave system now: the old cavern is a hub with two bricked-up passages, a tunnel bends west and south, and opens into a hall 340 m across with a **life-size Eiffel Tower** — 330 m, floodlit in the dark, big enough to drive between its legs. From the gate you no longer see it coming. The find is announced in the hall. The tower is the Sketchfab model „Eiffel Tower" by Johnson Martin (CC BY 4.0), loaded when you get near the Hübel. Outside, the hill looks exactly as before; the helicopter still finds no sky down there."
- [ ] **Step 4: Verify.** `node --test prototype/tests/*.test.mjs`; commit and push; then in the foreground, capped: `test_hideout.py`, `test_credits.py`, `test_underpass.py`, `test_jump.py`, `test_heli.py`, `test_smoke.py` (one `systemd-run` call, output to a file). Check the file for `passed`, no `skipped` on the hideout tests (the world files exist).
- [ ] **Step 5: Commit** `docs(credits): Eiffel Tower model attribution in help, README and changelog (#201)`; open the PR.
