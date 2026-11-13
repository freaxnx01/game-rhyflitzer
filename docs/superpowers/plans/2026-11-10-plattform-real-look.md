# Plattform real look Implementation Plan (#855)

> Spec: `docs/superpowers/specs/2026-11-10-plattform-real-look-design.md`. TDD: node tests first; one Playwright test at the end.

**Goal:** the tower reads like the real one: white matte roof with fascia and rafter teeth, purlins/rafters/hips/braces under the roof, 72 solid spruce slats with gaps continuing 1.1 m above the deck as a parapet with a handrail ring, thick light treads.
**Architecture:** pure helpers `coreSlats`, `roofRafters` in `plattform.js`; geometry edits inside `plattformTower` (`index.html:1870-1908`); everything stays merged in the existing roles (`timber` = `roofFlat`).
**Do not change:** `PLATTFORM` values, `plattformWalk`, `plattformCoreCollider`, any `addOBB`/`addSolid`, the yard. No packages. `const`/`let`. Run only `node --test tests/plattform.test.mjs` and the one new Playwright test. Never commit video stills.

## Task 1: `coreSlats` (test first)
Files: `tests/plattform.test.mjs`, `plattform.js`.

- [ ] Failing tests (append to `tests/plattform.test.mjs`, add `coreSlats, roofRafters, SLAT, HANDRAIL` to the import):
```js
test('coreSlats_72At5Deg_DoorSlatsStartAtLintel', () => {
  const s = coreSlats();
  assert.equal(s.length, 72);
  assert.ok(s.every((q, i) => near(q.phi, i * 5)));
  const door = s.filter(q => q.y0 > 0);
  assert.equal(door.length, 7);   // 345..360 and 0..15 deg, inclusive edges
  assert.ok(door.every(q => near(q.y0, 2.2)));
});
test('coreSlats_RailRange_ContinuesToUnderTheHandrail', () => {
  const s = coreSlats(), top = 5.735 + 1.1 - HANDRAIL.h;
  const parapet = s.filter(q => near(q.y1, top));
  assert.equal(parapet.length, 46);   // 230..355 and 0..95
  assert.ok(s.filter(q => near(q.y1, 5.735)).length === 26);
  assert.ok(s.find(q => near(q.phi, 100)).y1 === 5.735 && near(s.find(q => near(q.phi, 95)).y1, top));
});
```
- [ ] Implement in `plattform.js` (after `plattformYard`):
```js
// #855: the core as single spruce slats, one per angle: from the ground (the door lintel inside the door) up to the deck, and
// inside the rail range (the parapet round the stair opening) on up to the underside of the handrail ring
export const SLAT = { w: 0.09, d: 0.06 }, HANDRAIL = { h: 0.1, half: 0.07 };
const inArc = (phi, from, to) => { const a = ((phi - from) % 360 + 360) % 360; return a < to - from; };
export function coreSlats(P = PLATTFORM, n = 72) {
  const { core, deck } = P, out = [];
  for (let i = 0; i < n; i++) {
    const phi = i * 360 / n, off = ((phi + 180) % 360 + 360) % 360 - 180;
    const y0 = Math.abs(off) <= core.door.half ? core.door.h : 0;
    const y1 = inArc(phi, deck.railFrom, deck.railTo) ? deck.y + deck.rail - HANDRAIL.h : deck.y;
    out.push({ phi, y0, y1 });
  }
  return out;
}
```
- [ ] `node --test tests/plattform.test.mjs` green. Commit `feat(plattform): coreSlats helper (#855)`.

## Task 2: `roofRafters` (test first)
Files: same.

- [ ] Failing tests:
```js
test('roofRafters_15PerFace_RunFromEaveToHip', () => {
  const r = roofRafters(), ri = 12.10 / (2 * Math.sqrt(3));
  assert.equal(r.length, 45);
  for (const f of [0, 1, 2]) {
    const face = r.filter(q => q.face === f);
    assert.equal(face.length, 15);
    assert.ok(near(face[7].u, 0) && near(face[7].d, ri));          // the middle rafter reaches the apex line
    assert.ok(near(face[0].u, -5.6) && face[0].d > 0 && face[0].d < ri);
    assert.ok(face.every(q => Math.abs(q.u) <= 12.10 / 2));
  }
});
```
- [ ] Implement:
```js
// #855: the rafters under each roof face, perpendicular to the eave: u = offset along the eave from the face centre,
// d = the horizontal run inward from the eave to the hip (the rafter rises d * tan(pitch))
export const RAFTER = { pitch: 0.8, t: 0.12, drop: 0.2, tail: 0.25 };
export function roofRafters(P = PLATTFORM, pitch = RAFTER.pitch) {
  const side = P.roof.side, ri = side / (2 * Math.sqrt(3)), m = Math.floor(side / pitch), out = [];
  for (let face = 0; face < 3; face++) for (let j = 0; j < m; j++) {
    const u = (j - (m - 1) / 2) * pitch;
    out.push({ face, u, d: ri * (1 - Math.abs(u) / (side / 2)) });
  }
  return out;
}
```
- [ ] Green. Commit `feat(plattform): roofRafters helper (#855)`.

## Task 3: geometry in `plattformTower`
Files: `index.html` (`plattformTower` only, plus the import line of `plattform.js` and the hook at `index.html:4957`).

- [ ] Import `coreSlats, roofRafters, SLAT, HANDRAIL, RAFTER` where `PLATTFORM` is imported.
- [ ] Add constants at the top of `plattformTower`: `const ROOF_WHITE = '#efece4', sheath = col('#e6d2a0');`
- [ ] Delete the `battens` helper and its two calls (`index.html:1877-1882, 1896-1897`). Replace with slats:
```js
  coreSlats().forEach((s, i) => { const g = new THREE.BoxGeometry(SLAT.w, s.y1 - s.y0, SLAT.d); g.translate(0, (s.y1 - s.y0) / 2, 0); g.rotateY(-(facing + s.phi * RAD)); const [sx, sz] = f.polar(s.phi, core.r); g.translate(sx, b + s.y0, sz); colorize(g, i % 2 ? spruce.clone().multiplyScalar(0.94) : spruce); push(timber, g); });
```
  (box built along x, so after `rotateY(-(facing + phi))` its width lies on the tangent; check once in the browser that the slats are tangential, flip the sign if not.)
- [ ] Handrail ring after the slats:
```js
  const railG = new THREE.ExtrudeGeometry(flat(sectorPoly(f, deck.railFrom, deck.railTo, core.r - HANDRAIL.half, core.r + HANDRAIL.half)), { depth: HANDRAIL.h, bevelEnabled: false }); railG.rotateX(-Math.PI / 2); railG.translate(0, b + deck.y + deck.rail - HANDRAIL.h, 0); colorize(railG, beam); push(timber, railG);
```
  `sectorPoly` is already exported from `plattform.js`; import it.
- [ ] Treads (`index.html:1898`): height `0.09`, translate `b + t.y - 0.045`, radius `core.r - 0.03`, colour `spruce`.
- [ ] Roof skin: `colorize(roofG, col(ROOF_WHITE))`; the `under` cone: `colorize(under, sheath)`.
- [ ] Fascia, purlins, hips, braces, rafters — add after the roof:
```js
  const rtri = f.triangle(roof.side), mid = ([ax, az], [bx, bz]) => [(ax + bx) / 2, (az + bz) / 2];
  for (let i = 0; i < 3; i++) { const a = rtri[i], c = rtri[(i + 1) % 3], [mx, mz] = mid(a, c), len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    box(len, 0.18, 0.06, mx, b + roof.eaves - 0.18, mz, Math.atan2(c[1] - a[1], c[0] - a[0]), spruce, timber, [1, 1], 0);   // fascia
    bar(a[0], roof.eaves - RAFTER.drop, a[1], x, apex - RAFTER.drop, z, 0.16, beam);   // hip rafter
    const nx = (mx - x) / Math.hypot(mx - x, mz - z), nz = (mz - z) / Math.hypot(mx - x, mz - z), tx = -nz, tz = nx;   // outward normal and tangent of this eave
    for (const r of roofRafters().filter(q => q.face === i)) { const ex = mx + tx * r.u, ez = mz + tz * r.u;
      bar(ex + nx * RAFTER.tail, roof.eaves - RAFTER.drop - RAFTER.tail, ez + nz * RAFTER.tail, ex - nx * r.d, roof.eaves + r.d - RAFTER.drop, ez - nz * r.d, RAFTER.t, spruce); }
  }
  for (let i = 0; i < 3; i++) { const a = tri[i], c = tri[(i + 1) % 3], [mx, mz] = mid(a, c), len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    box(len, 0.36, 0.24, mx, b + roof.eaves - 0.36, mz, Math.atan2(c[1] - a[1], c[0] - a[0]), beam, timber, [1, 1], 0); }   // purlin on the posts
  for (const [px, pz] of tri) for (let i = 0; i < 3; i++) { const a = rtri[i], c = rtri[(i + 1) % 3], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz;
    const t = ((px - a[0]) * dx + (pz - a[1]) * dz) / l2; if (t <= 0 || t >= 1) continue;   // only the two edges this post faces
    const qx = a[0] + t * dx, qz = a[1] + t * dz; if (Math.hypot(qx - px, qz - pz) > 2.5) continue;
    bar(px, roof.eaves - 1.8, pz, qx, roof.eaves - 0.3, qz, 0.14, beam); }   // brace post -> eave
```
  `tri` is the existing 6 m post triangle; `apex` is already computed above the roof.
- [ ] `PLAT = { frame: f, base: b, walk: plattformWalk(f, b), look: { roof: ROOF_WHITE, slats: 72, rafters: 45 } };` with the counts taken from the arrays actually iterated (`coreSlats().length`, `roofRafters().length`), not literals.
- [ ] Hook (`index.html:4957`): add `look: PLAT.look` to the returned object.
- [ ] Commit `feat(world): Plattform with white roof, rafters, slats and parapet (#855)`.

## Task 4: Playwright test and daylight check
Files: `tests/test_plattform_stair.py`.

- [ ] Append:
```python
@needs_world
def test_the_tower_wears_the_real_look(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        look = page.evaluate("() => window.__mm.plattform().look")
        b.close()
    assert errors == []
    assert look == {"roof": "#efece4", "slats": 72, "rafters": 45}
```
- [ ] Run only `python -m pytest tests/test_plattform_stair.py -k real_look` (foreground, generous timeout).
- [ ] Browser check in daylight (set the clock to noon via the existing time controls): roof reads white from the helicopter, slats show gaps from the stair, parapet and handrail round the opening, rafter teeth under the eave, braces on every post, no z-fighting on the treads or deck hole. Fix tangent sign / small offsets only; no dimension changes.
- [ ] `CHANGELOG.md` `[Unreleased]`, Added: "Die Plattform Sisslerfeld sieht jetzt aus wie das Original: weisses Dach, Sparren und Pfetten unter dem Dach, Streben an den Pfosten, Lattenwand mit Lücken und Brüstung mit Handlauf um den Treppenausstieg, dickere helle Stufen."
- [ ] Commit, push, PR `feat(world): Plattform Sisslerfeld closer to the real tower (#855)`.
