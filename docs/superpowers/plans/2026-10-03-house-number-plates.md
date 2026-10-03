# House-number plates on the street-side façade (#71) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every numbered building shows its house number as a Swiss blue plate (white digits) flush on the wall that faces the nearest road, 2.2 m up, one plate per unit for letter ranges (`6a`, `6b`, …); no number floats over a roof any more.

**Architecture:** Pure geometry helpers in `prototype/world.js` turn a building (`rect`, `ring`, `addr`) plus the nearest road segment into plate positions and headings, for both building layouts (`box` on the rectangle for the gable path, the OSM ring for the flat path). `prototype/index.html` keeps the #12 label machinery (64 m grid, 250 ms tick, LRU-cached textures) but swaps the sprite pool for 64 pooled `PlaneGeometry` meshes with a blue `textTex` plate. Playwright proves the plates sit on the drawn walls; two screenshots let a human judge the look.

**Tech Stack:** vanilla JS (ES modules), three.js, `node:test`, Playwright (Python, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-03-house-number-plates-design.md`

## Global Constraints

- TDD: write the failing test first, watch it fail, then implement. Never modify an existing test to make it green — the two tests this plan rewrites (`addrLabels` in `world.test.mjs`, `test_house_numbers_appear_near_and_vanish_far` in `test_street_labels.py`) pin the floating-label contract that #71 abolishes; they are replaced by tests of the new contract, as the spec says (A10, A12). Stop and report after 3 failed attempts.
- Surgical edits: touch only `prototype/world.js`, `prototype/tests/world.test.mjs`, `prototype/index.html`, `prototype/tests/test_street_labels.py`, the new screenshot folder and `CHANGELOG.md`. No pipeline or `data/` change; no world rebuild. `prototype/debug.js` and `DEBUG_H` untouched (#70 owns them).
- No new `rr()`/`rnd()` call anywhere (seeded RNG, `index.html:222`): the plates draw with `textTex`, which has none.
- Plate constants, verbatim from the spec: offset `0.06` m off the wall, centre `2.2` m above the terrain, height `0.5` m, width `clamp(0.1 + 0.26 × chars, 0.5, 2.4)` m, radius `60` m, pool `64`, LRU cap `128`, blue `#1c5fb0`, white `#ffffff`, font `700 92px "Barlow Condensed", sans-serif`, road reach `120` m, per-unit faces at least `0.6 ×` the longest, same-facing walls `n · n_face > 0.5`, ring edges under `1.5` m ignored.
- Hook names stay: `__mm.labels()`, `__mm.labelSprites()`, `__mm.labelTick()`, `__mm.labelCache()` (`test_debug.py:71-74` reads `labelSprites`).
- Playwright runs in the **foreground**, never `run_in_background`. Commit and push the branch before starting the slow checks.
- Commits: Conventional Commits, reference `#71`. Branch: `feature/71-house-number-plates`.

## Review Focus

Inputs the spec implies but no test exercised until this list was written — each now has a test in the task that owns the code:

1. A footprint with no edge ≥ 1.5 m (a shed) → `ringFaces` returns `[]`; `projectToWall` must fall back to the rectangle face, not crash (Task 1, `projectToWall` test, `walls = []`).
2. A degenerate road segment (`ax == bx && az == bz`) → `nearestOnSegment` must not divide by zero (Task 1, `streetFace` test with a point segment).
3. A letter range with two different numbers (`3a–5b`) or uppercase letters (`6A–6D`) → one text per letter of the first number, resp. one combined plate; never a crash or an empty list (Task 1, `plateTexts` test).
4. A row house that moves to the gable path when #43 flips its `roof` → the per-unit plates must spread along the rectangle face with no ring projection (Task 1, `addrPlates` test, gable `3a–3c`).
5. A plate behind the car or behind another house must not show through — depth-tested material, unlike the village sprites (Task 3 keeps `MeshBasicMaterial` defaults: `depthTest: true`; `test_single_plate_on_a_gable_house_faces_its_road` proves the plate is on the road side, where the car sees it).

---

## Task 1 — plate geometry helpers in `world.js` (TDD)

**Files:**
- Modify: `prototype/world.js:114-133` (replace `addrLabels`; keep `roofTop`, `pickLabels`)
- Test: `prototype/tests/world.test.mjs:3, 135-141`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 3):
  ```js
  export function drawsGable(b)                        // b.roof === 'gable' && !(b.hsrc === 'dsm' && b.rh < 0.6)
  export function plateTexts(addr)                     // '6a–6d' → ['6a','6b','6c','6d']; else [addr]
  export function plateSize(t)                         // { w: clamp(0.1 + 0.26 * t.length, 0.5, 2.4), h: 0.5 }
  export function rectFaces([cx, cz, w, d, rot])       // 4 faces { x0, z0, x1, z1, nx, nz, len }, outward normals
  export function ringFaces(ring, minLen = 1.5)        // faces of the ring edges ≥ minLen, outward like extrudeFootprint
  export function streetFace(faces, seg, minFrac = 0)  // face that faces seg = [ax, az, bx, bz]; null seg → longest
  export function projectToWall(x, z, face, walls)     // { x, z, nx, nz } on the nearest same-facing wall; walls null/[] → face
  export function addrPlates(buildings, landmarks = {}, nearestSeg = () => null, off = 0.06)  // [{ t, x, z, rotY, id }]
  ```

- [ ] **Step 1: Write the failing tests.** In `prototype/tests/world.test.mjs` change the import on line 3: remove `addrLabels`, add `drawsGable, plateTexts, plateSize, rectFaces, ringFaces, streetFace, projectToWall, addrPlates`. Delete the test `'addrLabels: only numbered buildings, roof-top heights, landmarks'` (lines 135-141). Append:

  ```js
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
  const sameFace = (f, want) => assert.ok(['x0', 'z0', 'x1', 'z1', 'nx', 'nz', 'len'].every(k => near(f[k], want[k])), `${JSON.stringify(f)} != ${JSON.stringify(want)}`);
  // a 12 x 6 footprint (x -1..11, z 2..8) with a 4 x 1 m notch in the +z side between x 3 and 7; positive signed area, so ringFaces must reverse it
  const NOTCHED = [[-1, 2], [11, 2], [11, 8], [7, 8], [7, 7], [3, 7], [3, 8], [-1, 8]];

  test('drawsGable (#71): the osmBuilding gable-path predicate, measured flat roofs excluded', () => {
    assert.equal(drawsGable({ roof: 'gable' }), true);
    assert.equal(drawsGable({ roof: 'gable', hsrc: 'dsm', rh: 2.9 }), true);
    assert.equal(drawsGable({ roof: 'gable', hsrc: 'dsm', rh: 0.1 }), false);   // 16a–16c today
    assert.equal(drawsGable({ roof: 'flat', hsrc: 'dsm', rh: 3.9 }), false);    // 6a–6d: flat stays flat
    assert.equal(drawsGable({ roof: 'flat' }), false);
  });

  test('plateTexts (#71): letter ranges split per unit, everything else is one plate', () => {
    assert.deepEqual(plateTexts('6a–6d'), ['6a', '6b', '6c', '6d']);
    assert.deepEqual(plateTexts('3a–3f'), ['3a', '3b', '3c', '3d', '3e', '3f']);
    assert.deepEqual(plateTexts('16a-16c'), ['16a', '16b', '16c']);           // ASCII hyphen too
    assert.deepEqual(plateTexts('3a–5b'), ['3a', '3b']);                       // first number, letters a..b
    assert.deepEqual(plateTexts('12'), ['12']);
    assert.deepEqual(plateTexts('14-18'), ['14-18']);                          // plain range: entrances unknown
    assert.deepEqual(plateTexts('12/1–12/2'), ['12/1–12/2']);
    assert.deepEqual(plateTexts('36A'), ['36A']);
    assert.deepEqual(plateTexts('6A–6D'), ['6A–6D']);                          // uppercase is not split
  });

  test('plateSize (#71): 0.5 m high, width by text length, clamped 0.5..2.4', () => {
    assert.deepEqual(plateSize('6'), { w: 0.5, h: 0.5 });
    assert.ok(near(plateSize('6a').w, 0.62) && plateSize('6a').h === 0.5);
    assert.ok(near(plateSize('123').w, 0.88));
    assert.deepEqual(plateSize('12/1–12/2'), { w: 2.4, h: 0.5 });
  });

  test('rectFaces (#71): four outward faces in the box frame, left to right as seen from outside', () => {
    const f = rectFaces([10, 20, 6, 4, 0]);
    assert.equal(f.length, 4);
    sameFace(f[0], { x0: 7, z0: 18, x1: 7, z1: 22, nx: -1, nz: 0, len: 4 });    // -x
    sameFace(f[1], { x0: 7, z0: 22, x1: 13, z1: 22, nx: 0, nz: 1, len: 6 });    // +z (the facadeLabels "today" face)
    sameFace(f[2], { x0: 13, z0: 22, x1: 13, z1: 18, nx: 1, nz: 0, len: 4 });   // +x
    sameFace(f[3], { x0: 13, z0: 18, x1: 7, z1: 18, nx: 0, nz: -1, len: 6 });   // -z
    const q = rectFaces([0, 0, 6, 4, Math.PI / 2]);                              // quarter turn: local (lx, lz) → (-lz, lx)
    sameFace(q[0], { x0: 2, z0: -3, x1: -2, z1: -3, nx: 0, nz: -1, len: 4 });
    sameFace(q[1], { x0: -2, z0: -3, x1: -2, z1: 3, nx: -1, nz: 0, len: 6 });
  });

  test('ringFaces (#71): outward like extrudeFootprint, either winding, short edges dropped', () => {
    const sq = ringFaces([[0, 0], [10, 0], [10, 10], [0, 10]]);                 // positive area → reversed
    assert.equal(sq.length, 4);
    sameFace(sq[0], { x0: 0, z0: 10, x1: 10, z1: 10, nx: 0, nz: 1, len: 10 });
    sameFace(sq[2], { x0: 10, z0: 0, x1: 0, z1: 0, nx: 0, nz: -1, len: 10 });
    const sq2 = ringFaces([[0, 10], [10, 10], [10, 0], [0, 0]]);                // already negative → kept
    sameFace(sq2[0], { x0: 0, z0: 10, x1: 10, z1: 10, nx: 0, nz: 1, len: 10 });
    assert.equal(ringFaces(NOTCHED).length, 6);                                  // the two 1 m notch sides are dropped
    assert.equal(ringFaces(NOTCHED, 0.05).length, 8);
    const bottom = ringFaces(NOTCHED).find(f => f.z0 === 7 && f.z1 === 7);
    sameFace(bottom, { x0: 3, z0: 7, x1: 7, z1: 7, nx: 0, nz: 1, len: 4 });     // notch bottom faces +z like the wall around it
    assert.deepEqual(ringFaces([[0, 0], [1, 0], [1, 1], [0, 1]]), []);          // a 1 m shed has no usable wall
  });

  test('streetFace (#71): the face that faces the road, minFrac, fallbacks', () => {
    const f = rectFaces([10, 20, 6, 4, 0]);
    assert.equal(streetFace(f, [0, 30, 20, 30]), f[1]);                        // road to the south (+z) → +z face
    assert.equal(streetFace(f, [30, 0, 30, 40]), f[2]);                        // road to the east → +x face
    assert.equal(streetFace(rectFaces([0, 0, 36, 12, 0]), [30, 0, 30, 40], 0.6).len, 36);   // per-unit: the 12 m end wall faces the road but is skipped
    assert.equal(streetFace(f, null).len, 6);                                  // no road within reach → longest
    assert.equal(streetFace(f, [10, 30, 10, 30]), f[1]);                       // a point segment must not divide by zero
    const diag = rectFaces([0, 0, 10, 10, 0]);
    assert.equal(streetFace(diag, [20, 20, 20, 20]), diag[1]);                 // corner road: both +x and +z face it, +z (first) is as near
  });

  test('projectToWall (#71): nearest same-facing wall, else any wall, else the face itself', () => {
    const face = rectFaces([5, 5, 12, 6, 0])[1];                               // +z face of the NOTCHED rectangle: (-1, 8) → (11, 8)
    const walls = ringFaces(NOTCHED);
    const p = projectToWall(5.2, 8, face, walls);                              // over the notch → onto its bottom
    assert.ok(near(p.x, 5.2) && near(p.z, 7) && p.nx === 0 && p.nz === 1, JSON.stringify(p));
    const q = projectToWall(2, 8, face, walls);                                // on the wall already
    assert.ok(near(q.x, 2) && near(q.z, 8) && q.nz === 1, JSON.stringify(q));
    const r = projectToWall(5, 8, face, null);                                 // gable path: the face is the wall
    assert.deepEqual(r, { x: 5, z: 8, nx: 0, nz: 1 });
    assert.deepEqual(projectToWall(5, 8, face, []), { x: 5, z: 8, nx: 0, nz: 1 });   // a shed with no usable wall
    const back = projectToWall(5, 8, face, walls.filter(w => w.nz < 0.5));     // no same-facing wall → nearest of all
    assert.ok(near(back.z, 2) || near(back.x, -1) || near(back.x, 11), JSON.stringify(back));
  });

  test('addrPlates (#71): per-unit plates on the drawn wall, 0.06 m out, heading from the wall normal', () => {
    const south = () => [0, 30, 20, 30];
    const flat = { id: 2, addr: '6a–6c', roof: 'flat', rect: [5, 5, 12, 6, 0], ring: NOTCHED };
    const got = addrPlates([flat], {}, south);
    assert.deepEqual(got.map(p => [p.t, p.id, p.rotY]), [['6a', 2, 0], ['6b', 2, 0], ['6c', 2, 0]]);
    assert.ok(near(got[0].x, 1) && near(got[0].z, 8.06), JSON.stringify(got[0]));      // left plate, on the wall
    assert.ok(near(got[1].x, 5) && near(got[1].z, 7.06), JSON.stringify(got[1]));      // middle plate, in the notch
    assert.ok(near(got[2].x, 9) && near(got[2].z, 8.06), JSON.stringify(got[2]));
    const gable = { id: 1, addr: '12', roof: 'gable', rect: [10, 20, 6, 4, 0], ring: [[0, 0], [1, 0], [1, 1]] };   // ring ignored
    const one = addrPlates([gable], {}, south);
    assert.equal(one.length, 1);
    assert.ok(near(one[0].x, 10) && near(one[0].z, 22.06) && one[0].rotY === 0 && one[0].t === '12');
    const west = addrPlates([gable], {}, () => [-30, 0, -30, 40]);                      // road to the west → -x face, rotY -π/2
    assert.ok(near(west[0].x, 6.94) && near(west[0].z, 20) && near(west[0].rotY, -Math.PI / 2), JSON.stringify(west[0]));
    const gableRow = addrPlates([{ id: 3, addr: '3a–3c', roof: 'gable', rect: [0, 0, 36, 12, 0], ring: NOTCHED }], {}, south);   // after #43: rectangle face, 12 m apart
    assert.deepEqual(gableRow.map(p => [p.t, +p.x.toFixed(2), +p.z.toFixed(2)]), [['3a', -12, 6.06], ['3b', 0, 6.06], ['3c', 12, 6.06]]);
    assert.deepEqual(addrPlates([{ id: 9, roof: 'flat', rect: [0, 0, 10, 10, 0], ring: NOTCHED }], {}, south), []);   // unnumbered
    assert.deepEqual(addrPlates([gable]).map(p => p.t), ['12']);                      // default nearestSeg → longest face
    const lm = addrPlates([], { hallenbad: { x: 0, z: 0, rot: 0, size: [20, 10], addr: '2' }, chimney: { x: 0, z: 0, rot: 0 }, noSize: { x: 1, z: 1, addr: '4' } }, () => [-50, -30, 50, -30]);
    assert.equal(lm.length, 1);
    assert.ok(lm[0].t === '2' && lm[0].id === 'hallenbad' && near(lm[0].x, 0) && near(lm[0].z, -5.06) && near(lm[0].rotY, Math.PI), JSON.stringify(lm[0]));
  });
  ```

- [ ] **Step 2: Run:** `node --test prototype/tests/world.test.mjs` — expect FAIL (`drawsGable` and friends are not exported; the file fails to import).

- [ ] **Step 3: Implement.** In `prototype/world.js` replace lines 124-128 (`// #12: house-number labels …` through the end of `addrLabels`) with:

  ```js
  // #71: house-number plates on the wall that faces the nearest road. A *face* is a wall segment (x0, z0) → (x1, z1) with its
  // outward unit normal, oriented like extrudeFootprint (ring area negative, n = (-(z1 - z0), x1 - x0) / len): seen from the
  // street it runs left to right, so the first plate of a range is the leftmost.
  export function drawsGable(b) { return b.roof === 'gable' && !(b.hsrc === 'dsm' && b.rh < 0.6); }   // the osmBuilding() gable-path predicate
  // '6a–6d' → one text per unit, 6a..6d; anything else (plain numbers, '14-18', '12/1–12/2') is one plate
  export function plateTexts(addr) {
    const m = /^(\d+)([a-z])[–-]\d+([a-z])$/.exec(addr || '');
    if (!m) return [addr];
    const out = []; for (let c = m[2].charCodeAt(0); c <= m[3].charCodeAt(0); c++) out.push(m[1] + String.fromCharCode(c));
    return out;
  }
  // metres: 0.5 m high (three times a real Swiss plate, readable from the road), width by text length
  export function plateSize(t) { return { w: Math.min(2.4, Math.max(0.5, 0.1 + 0.26 * t.length)), h: 0.5 }; }
  function wallFace(x0, z0, x1, z1) { const len = Math.hypot(x1 - x0, z1 - z0); return { x0, z0, x1, z1, nx: -(z1 - z0) / len + 0, nz: (x1 - x0) / len + 0, len }; }   // + 0: no -0 (deepEqual tells them apart)
  function nearestOnSegment(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; const u = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0; return [ax + dx * u, az + dz * u]; }
  // the four walls of box(w, h, d, cx, y, cz, rot): local corners through the box frame (facadeLabels' mapping), -x, +z, +x, -z
  export function rectFaces([cx, cz, w, d, rot]) {
    const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
    const p = [[-hw, -hd], [-hw, hd], [hw, hd], [hw, -hd]].map(([lx, lz]) => [cx + lx * c - lz * s, cz + lx * s + lz * c]);
    return p.map((a, i) => wallFace(...a, ...p[(i + 1) % 4]));
  }
  // the walls extrudeFootprint draws for a ring; edges under minLen (porch steps, survey noise) carry no plate
  export function ringFaces(ring, minLen = 1.5) {
    let area = 0; for (let i = 0; i < ring.length; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length]; area += x0 * z1 - x1 * z0; }
    const r = area > 0 ? ring.slice().reverse() : ring, out = [];
    for (let i = 0; i < r.length; i++) { const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length]; if (Math.hypot(x1 - x0, z1 - z0) >= minLen) out.push(wallFace(x0, z0, x1, z1)); }
    return out;
  }
  // the face nearest to the road segment seg = [ax, az, bx, bz] among those whose normal points at it; none facing → nearest of
  // all; no seg → the longest. Faces shorter than minFrac x the longest are skipped (per-unit plates spread along a long side).
  export function streetFace(faces, seg, minFrac = 0) {
    const longest = Math.max(...faces.map(f => f.len)), cands = faces.filter(f => f.len >= minFrac * longest);
    if (!seg) return cands.reduce((a, f) => f.len > a.len ? f : a);
    const scored = cands.map(f => { const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2, [rx, rz] = nearestOnSegment(mx, mz, ...seg); return { f, d: Math.hypot(rx - mx, rz - mz), front: (rx - mx) * f.nx + (rz - mz) * f.nz > 0 }; });
    const front = scored.filter(s => s.front);
    return (front.length ? front : scored).reduce((a, s) => s.d < a.d ? s : a).f;
  }
  // flat path: the rectangle's anchor moved onto the nearest drawn wall that faces the same way (so a notch or an L-shape still
  // gets a flush plate); gable path (walls null) and sheds without a usable wall keep the face itself
  export function projectToWall(x, z, face, walls) {
    if (!walls || !walls.length) return { x, z, nx: face.nx, nz: face.nz };
    const same = walls.filter(w => w.nx * face.nx + w.nz * face.nz > 0.5), pool = same.length ? same : walls;
    let best = null;
    for (const w of pool) { const [qx, qz] = nearestOnSegment(x, z, w.x0, w.z0, w.x1, w.z1), d = Math.hypot(qx - x, qz - z); if (!best || d < best.d) best = { d, x: qx, z: qz, nx: w.nx, nz: w.nz }; }
    return { x: best.x, z: best.z, nx: best.nx, nz: best.nz };
  }
  // nearestSeg(x, z) → [ax, az, bx, bz] of the nearest road or null. rotY turns a PlaneGeometry (facing +z) to face along the normal.
  export function addrPlates(buildings, landmarks = {}, nearestSeg = () => null, off = 0.06) {
    const out = [];
    const place = (texts, face, walls, id) => texts.forEach((t, k) => {
      const u = (k + 0.5) / texts.length, p = projectToWall(face.x0 + (face.x1 - face.x0) * u, face.z0 + (face.z1 - face.z0) * u, face, walls);
      out.push({ t, x: p.x + p.nx * off, z: p.z + p.nz * off, rotY: Math.atan2(p.nx, p.nz), id });
    });
    for (const b of buildings) {
      if (!b.addr) continue;
      const texts = plateTexts(b.addr), face = streetFace(rectFaces(b.rect), nearestSeg(b.rect[0], b.rect[1]), texts.length > 1 ? 0.6 : 0);
      place(texts, face, drawsGable(b) ? null : ringFaces(b.ring), b.id);
    }
    for (const [kind, l] of Object.entries(landmarks)) {
      if (!l.addr || !l.size) continue;
      place([l.addr], streetFace(rectFaces([l.x, l.z, l.size[0], l.size[1], l.rot]), nearestSeg(l.x, l.z)), null, kind);
    }
    return out;
  }
  ```

  Keep `roofTop` (line 115, used by `debug.js`) and `pickLabels` (line 129) as they are.

- [ ] **Step 4: Run:** `node --test prototype/tests/` — all green (`world.test.mjs`, `debug.test.mjs`, `landmarks.test.mjs`, `strings.test.mjs`). If `plateSize('6a').w` is off by a float hair, the test's `near` tolerance covers it; do not round in the implementation.

- [ ] **Step 5: Commit:**

  ```bash
  git add prototype/world.js prototype/tests/world.test.mjs
  git commit -m "feat(world): plate geometry for house numbers on the street-side wall (#71)"
  ```

## Task 2 — Playwright tests for the new contract (failing first)

**Files:**
- Modify: `prototype/tests/test_street_labels.py:1, 55-74` (docstring, replace `test_house_numbers_appear_near_and_vanish_far`; add two helpers and one test)

**Interfaces:**
- Consumes (from Task 3): `__mm.labels()` → `[{ t, x, z, y, rotY, d }]`; `__mm.labelSprites()` → number of visible pool meshes; `__mm.probe(x, z).terrain` (exists, `index.html:975`); `__mm.place(x, z)` (exists).

- [ ] **Step 1: Write the failing tests.** Change the module docstring on line 1 to `"""#12/#71: road name in the HUD, house-number plates on the street-side wall, station boards. Slow (Playwright): run in the foreground."""`. Replace lines 55-74 (`@needs_world` through `assert visible == len(far)`) with:

  ```python
  def seg_dist(px, pz, ax, az, bx, bz):
      dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz
      u = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2)) if L2 else 0.0
      return math.hypot(px - ax - dx * u, pz - az - dz * u)


  def outline_dist(ring, x, z):
      """distance from (x, z) to the closed polygon through ring"""
      return min(seg_dist(x, z, *a, *b) for a, b in zip(ring, ring[1:] + ring[:1]))


  UNITS_6 = {"6a", "6b", "6c", "6d"}


  @needs_world
  def test_house_plates_sit_on_the_street_wall_and_vanish_far(server):
      w = json.loads(WORLD.read_text(encoding="utf-8"))
      b = next(x for x in w["buildings"] if x["id"] == 171822634)        # Bodenackerstrasse 6a–6d: flat path (measured flat roof), 40-vertex ring
      b.setdefault("addr", "6a–6d")
      cx, cz = b["rect"][0], b["rect"][1]
      rx, rz = rhine_point(w)
      with sync_playwright() as p:
          br, page = open_page(p, server, world=w)
          page.evaluate(f"() => window.__mm.place({cx + 20}, {cz})")
          page.wait_for_function("() => ['6a', '6b', '6c', '6d'].every(t => window.__mm.labels().some(l => l.t === t))", timeout=60000)
          near = page.evaluate("() => window.__mm.labels()")
          terrain = {l["t"]: page.evaluate(f"() => window.__mm.probe({l['x']}, {l['z']}).terrain") for l in near if l["t"] in UNITS_6}
          page.evaluate(f"() => window.__mm.place({rx}, {rz})")
          page.wait_for_function("() => !window.__mm.labels().some(l => l.t === '6a')", timeout=60000)
          far = page.evaluate("() => window.__mm.labels()")
          visible = page.evaluate("() => window.__mm.labelSprites()")
          br.close()
      plates = [l for l in near if l["t"] in UNITS_6]
      assert len(plates) == 4 and not any(l["t"] == "6a–6d" for l in near), near    # one plate per unit, no combined label
      for l in plates:
          assert outline_dist(b["ring"], l["x"], l["z"]) < 0.15, l                    # flush on the drawn wall (0.06 m off it)
          assert abs(l["y"] - terrain[l["t"]] - 2.2) < 0.01, (l, terrain)             # door height, not the roof (roof top is 26.7 m)
      assert 1 <= len(near) <= 64 and all(l["d"] <= 60 for l in near), near
      assert all(l["d"] <= 60 for l in far) and len(far) <= 64
      assert visible == len(far)                                                      # hidden pool meshes really are hidden


  LERCHENWEG_11 = 171822877   # Sisseln: gable path (roof gable, measured ridge 5.7 m), the Lerchenweg passes 10 m away


  @needs_world
  def test_single_plate_on_a_gable_house_faces_its_road(server):
      w = json.loads(WORLD.read_text(encoding="utf-8"))
      b = next(x for x in w["buildings"] if x["id"] == LERCHENWEG_11)
      assert b["roof"] == "gable" and b.get("rh", 0) >= 0.6 and b["addr"] == "11", b
      cx, cz, bw, bd, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
      box = [(cx + lx * c - lz * s, cz + lx * s + lz * c) for lx, lz in [(-bw / 2, -bd / 2), (-bw / 2, bd / 2), (bw / 2, bd / 2), (bw / 2, -bd / 2)]]
      road = min((sg for r in w["roads"] if r["n"] == "Lerchenweg" for sg in zip(r["pts"], r["pts"][1:])), key=lambda sg: seg_dist(cx, cz, *sg[0], *sg[1]))
      with sync_playwright() as p:
          br, page = open_page(p, server)
          page.evaluate(f"() => window.__mm.place({cx + 15}, {cz})")
          page.wait_for_function(f"() => window.__mm.labels().some(l => l.t === '11' && Math.hypot(l.x - {cx}, l.z - {cz}) < 12)", timeout=60000)
          labels = page.evaluate("() => window.__mm.labels()")
          br.close()
      mine = [l for l in labels if l["t"] == "11" and math.hypot(l["x"] - cx, l["z"] - cz) < 12]
      assert len(mine) == 1, mine
      l = mine[0]
      assert outline_dist(box, l["x"], l["z"]) < 0.15, (l, box)                                            # on the box the gable path draws
      assert seg_dist(l["x"], l["z"], *road[0], *road[1]) < seg_dist(cx, cz, *road[0], *road[1]), (l, road)   # on the road side of the house
  ```

  Leave `test_hud_names_the_road_under_the_car`, `test_station_boards_on_the_osm_stations`, `test_hand_layout_signs_and_no_labels` and `test_label_material_cache_stays_bounded` untouched.

- [ ] **Step 2: Run (foreground):** `python3 -m pytest prototype/tests/test_street_labels.py -q -k "plates or gable_house"` — expect FAIL: the first test times out waiting for `6a` (today's label is `6a–6d`), the second fails on `outline_dist` (today's label sits at the footprint centre, metres inside the box).

- [ ] **Step 3: Commit:**

  ```bash
  git add prototype/tests/test_street_labels.py
  git commit -m "test(labels): house-number plates on the street-side wall (#71)"
  ```

## Task 3 — plates in the scene (`index.html`)

**Files:**
- Modify: `prototype/index.html:203` (import), `:535` (`osmBuilding` predicate), `:811-818` (`LABELS`), `:961` (`__mm.labels`)

**Interfaces:**
- Consumes (Task 1): `addrPlates`, `plateSize`, `drawsGable`; existing `ROAD_GRID`, `gridQuery`, `segDist`, `terrainH`, `textTex`, `pickLabels`, `makeGrid`, `gridAdd`.
- Produces: `__mm.labels()` items gain `y` and `rotY`; `__mm.labelSprites()` now counts visible plate meshes (same name).

- [ ] **Step 1: Import.** On line 203 replace `addrLabels` in the import list with `addrPlates, plateSize, drawsGable` (keep `pickLabels`; `roofTop` is not imported here today and stays that way).

- [ ] **Step 2: One predicate for the gable path.** On line 535 replace

  ```js
    if (b.roof === 'gable' && !(dsm && b.rh < 0.6)) {
  ```

  with

  ```js
    if (drawsGable(b)) {   // #71: the plates use the same predicate to know which walls are drawn
  ```

  `dsm` stays declared on line 531 — lines 537 and 539 still use it.

- [ ] **Step 3: Plates instead of sprites.** Replace lines 811-818 (from the `// house numbers (#12, OSM addr)` comment through `function updateLabels…`) with:

  ```js
  // house numbers (#71, OSM addr): Swiss blue plates flush on the wall that faces the nearest road, centre 2.2 m over the ground, one
  // plate per unit for letter ranges (6a, 6b, …). The #12 machinery stays: a 64 m grid, the plates within 60 m of the car fill a fixed
  // pool (64 meshes on one unit quad) every 250 ms, one material per distinct number, LRU-capped. Debug height labels: DEBUG_H below.
  const LABELS = { grid: makeGrid(64), mat: new Map(), cap: 128, pool: [], shown: [], t: 0, ticks: 0 };
  function nearestRoadSeg(x, z, reach = 120) { let best = null, bd = Infinity; for (const { r, i } of gridQuery(ROAD_GRID, x, z, reach)) { const d = segDist(x, z, ...r.pts[i], ...r.pts[i + 1]); if (d < bd) { bd = d; best = [...r.pts[i], ...r.pts[i + 1]]; } } return best; }
  if (L) for (const it of addrPlates(L.buildings, L.anchors.landmarks, nearestRoadSeg)) { it.y = terrainH(it.x, it.z) + 2.2; gridAdd(LABELS.grid, it.x, it.z, it.x, it.z, it); }
  const PLATE_GEO = new THREE.PlaneGeometry(1, 1), PLATE_BLANK = new THREE.MeshBasicMaterial();
  for (let i = 0; i < 64; i++) { const m = new THREE.Mesh(PLATE_GEO, PLATE_BLANK); m.visible = false; LABELS.pool.push(m); scene.add(m); }
  // white digits and rim on the repo's Swiss-sign blue; 128 px per 0.5 m of plate. Unlit (readable in shadow), depth-tested and fogged like the wall
  function plateTex(t) { const { w, h } = plateSize(t); return textTex(t, Math.round(128 * w / h), 128, '#1c5fb0', '#ffffff', '700 92px "Barlow Condensed", sans-serif', '#ffffff'); }
  // LRU (Map insertion order = recency): a hit moves the number to the back; trimLabelMats frees the oldest beyond LABELS.cap, never one a visible plate shows
  function labelMat(t) { let m = LABELS.mat.get(t); if (m) LABELS.mat.delete(t); else m = new THREE.MeshBasicMaterial({ map: plateTex(t) }); LABELS.mat.set(t, m); return m; }
  function trimLabelMats() { const inUse = new Set(LABELS.pool.filter(s => s.visible).map(s => s.material)); for (const [t, m] of LABELS.mat) { if (LABELS.mat.size <= LABELS.cap) return; if (inUse.has(m)) continue; LABELS.mat.delete(t); m.map.dispose(); m.dispose(); } }
  function updateLabels(x, z) { LABELS.ticks++; LABELS.shown = pickLabels(gridQuery(LABELS.grid, x, z, 60), x, z, 60, LABELS.pool.length); LABELS.pool.forEach((m, i) => { const it = LABELS.shown[i]; m.visible = !!it; if (it) { const { w, h } = plateSize(it.t); m.material = labelMat(it.t); m.scale.set(w, h, 1); m.position.set(it.x, it.y, it.z); m.rotation.y = it.rotY; } }); trimLabelMats(); }
  ```

  `trimLabelMats` is byte-identical to today's apart from the comment; it is repeated here so the block can be pasted whole.

- [ ] **Step 4: Hook.** On line 961 replace the `__mm.labels` line with:

  ```js
  window.__mm.labels = () => LABELS.shown.map(l => ({ t: l.t, x: l.x, z: l.z, y: l.y, rotY: l.rotY, d: +l.d.toFixed(1) }));
  ```

  `__mm.labelSprites`, `__mm.labelTick`, `__mm.labelCache` (lines 962-964) stay as they are — `LABELS.pool` is still the pool they read.

- [ ] **Step 5: Sanity in the browser (foreground).** `python3 -m pytest prototype/tests/test_smoke.py -q -x` — empty console in both layouts (an import error in `world.js` or a typo in the block above shows up here first).

- [ ] **Step 6: Push the branch, then the slow checks (foreground, generous timeout):**

  ```bash
  git add prototype/index.html
  git commit -m "feat(buildings): house numbers as blue plates on the street-side wall (#71)"
  git push -u origin feature/71-house-number-plates
  python3 -m pytest prototype/tests/test_street_labels.py -q
  python3 -m pytest prototype/tests/test_debug.py prototype/tests/test_row_houses.py -q
  node --test prototype/tests/
  ```

  All green. If `test_house_plates_sit_on_the_street_wall_and_vanish_far` reports a plate farther than 0.15 m from the ring, the projection picked a wall of the rectangle instead of the ring: check that `drawsGable(b)` is `false` for 6a–6d (`roof: 'flat'`) and that `ringFaces` received `b.ring`, not `b.rect`. If the `y` assertion fails by exactly the roof height, `it.y` was not set before `gridAdd`. Do not loosen the tolerances.

## Task 4 — visual check for a human (screenshots)

**Files:**
- Create: `docs/ai-notes/screenshots/2026-10-03-house-plates/bodenacker-6.png`, `row-house-4.png`

The plate's size, colour and the chosen side are a judgement call; a person decides from two pictures. The helper script lives outside the repo and is not committed.

- [ ] **Step 1: Save this as `/tmp/shoot_plates.py` and run it in the foreground from the repo root** (`python3 /tmp/shoot_plates.py`; it serves the repo itself, like `conftest.py`):

  ```python
  import http.server, math, socket, threading
  from functools import partial
  from pathlib import Path
  from playwright.sync_api import sync_playwright

  ROOT = Path.cwd(); OUT = ROOT / "docs/ai-notes/screenshots/2026-10-03-house-plates"; OUT.mkdir(parents=True, exist_ok=True)
  s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
  httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
  threading.Thread(target=httpd.serve_forever, daemon=True).start()
  # (car x, car z, heading): facing +x is 0, facing +z (south) is pi/2. Chase camera: 9 m behind, 3.4 m up.
  SHOTS = {
      "bodenacker-6.png": (2018.0, -372.0, 0.0),          # on the Badweg, looking east at the west wall of 6a–6d (plates 6a..6d, 15 m apart)
      "row-house-4.png": (2037.0, -458.0, math.pi / 2),   # north of 4a–4f, looking south at its street-side wall (plates 6 m apart)
  }
  with sync_playwright() as p:
      br = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
      page = br.new_page(viewport={"width": 960, "height": 540})
      page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
      page.goto(f"http://127.0.0.1:{port}/prototype/index.html")
      page.wait_for_selector("#startbtn", timeout=240000); page.click("#startbtn")
      for name, (x, z, th) in SHOTS.items():
          page.evaluate(f"() => window.__mm.place({x}, {z}, {th})")
          page.wait_for_timeout(8000)                                    # headless renders well under 1 fps; let the chase camera settle
          page.screenshot(path=str(OUT / name))
      br.close()
  httpd.shutdown()
  ```

  If a shot shows the camera inside a tree or a wall, move the car 4 m sideways (change `z` for the first shot, `x` for the second) and retake.

- [ ] **Step 2: Look at both PNGs.** Expected: blue plates with white digits near eye level on the wall facing the car, none over a roof; on 6a–6d the plates read `6a` … `6d` from left to right, ~15 m apart; on 4a–4f six plates ~6 m apart on the wall nearest the street. If a plate is mirrored (digits reversed), the mesh faces into the wall: the sign of `rotY` in `addrPlates` is wrong — fix `Math.atan2(p.nx, p.nz)` (not `(p.nz, p.nx)`) in Task 1 and rerun its tests. If a plate is unreadably small at 960 × 540, note it in the PR for the reviewer rather than changing the size: A6 is a human decision.

- [ ] **Step 3: Commit the two PNGs only:**

  ```bash
  git add docs/ai-notes/screenshots/2026-10-03-house-plates/
  git commit -m "docs(buildings): screenshots of the house-number plates for review (#71)"
  rm /tmp/shoot_plates.py
  ```

## Task 5 — changelog and PR

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]`)

- [ ] **Step 1:** Under `## [Unreleased]` add a `### Changed` section (above `### Fixed` if present, below `### Added`) with one player-facing line:

  ```markdown
  ### Changed

  - House numbers no longer float over the roofs. They hang on the wall facing the street as blue Swiss plates with white digits at door height — one plate per entrance on the row houses (6a, 6b, …). They are small, like real plates: drive past the street side to read them.
  ```

- [ ] **Step 2: Commit and push:**

  ```bash
  git add CHANGELOG.md
  git commit -m "docs(changelog): house numbers as plates on the facade (#71)"
  git push
  ```

- [ ] **Step 3: Open the PR** against `main`: title `feat(buildings): house numbers on the façade instead of floating above the roof (#71)`. Body: Summary (the spec's Goal), Changes (Tasks 1-5), Testing (`node --test prototype/tests/`, `pytest prototype/tests/test_street_labels.py`, `test_smoke.py`, `test_debug.py`, `test_row_houses.py`, the two screenshots embedded with relative links), Checklist. State the two human decisions the screenshots are for: plate size (A6) and the chosen side on the eight row-house blocks whose nearest road is on the smooth side (spec, Consequences). `Closes #71`.

## Verification summary

- `node --test prototype/tests/` green; the `addrLabels` test is gone, eight `#71` tests are in.
- `python3 -m pytest prototype/tests/test_street_labels.py prototype/tests/test_smoke.py prototype/tests/test_debug.py prototype/tests/test_row_houses.py -q` green, run in the foreground.
- `grep -n "addrLabels" prototype/ -r` finds nothing; `grep -n "roofTop" prototype/world.js prototype/debug.js` still finds the export and its debug use.
- Two screenshots committed and linked from the PR.
