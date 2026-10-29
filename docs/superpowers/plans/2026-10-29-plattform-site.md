# Plattform Sisslerfeld on its real site (Parzelle 1765, Geuerenstrasse) Implementation Plan

**Goal:** Move the Plattform Sisslerfeld about 470 m to where it really stands, on Parzelle 1765 "Oberes Sisslerfeld" (Münchwilen AG) just south of the Geuerenstrasse. Its entrance then faces **north** (the road). Give it its real surroundings from the KSL situation plan: a rectangular gravel yard with 6 parking spaces instead of the gravel disc.

**Why:** the anchor came from the map pin on plattform-sisslerfeld.com, which sits on Parzelle 182, on the street Breitenloh. The KSL plan (03.06.2026, not in the repo) and the cadastral survey (geo.admin identify / SearchServer, layer `ch.kantone.cadastralwebmap-farbe`) put the tower on Parzelle 1765. That is consistent with the game world: at the new point the Geuerenstrasse centre line runs 10 m north of the tower centroid (KSL: road edge, then 4.00 m to the concrete triangle, then 3.47 m to its centroid), and there is no building within 70 m.

**Measured site** (LV95, from the parcel polygon and the KSL dimensions):

- Tower centroid E **2640086.1**, N **1266360.0**, WGS84 lon **7.97111003**, lat **47.54674064**.
- Game (origin e0 2639781.3458, n0 1266787.0805; x = E − e0, z = n0 − N): **x 304.75, z 427.08**.

**Global constraints (`CLAUDE.md`):**

- The stack is buildless, with no new dependency.
- Node tests run as `node --test prototype/tests/*.test.mjs`.
- Playwright runs in the foreground only, one file: `python3 -m pytest prototype/tests/test_plattform_stair.py -x`.
- Commit and push after every task.
- The Häring/KSL plans stay out of the repo.
- CHANGELOG: one hand-written entry under `[Unreleased]`, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`.
- Branch: `fix/plattform-site` from `main`.

---

### Task 1: the anchor

**Files:** `pipeline/anchors.json`, `data/world_hochrhein.json`, `prototype/tests/landmarks.test.mjs`

- [ ] **Failing test first.** In `landmarks.test.mjs`, test `#94 world sanity…`, change the Plattform part to:

```js
  const plattformRoad = nearestRoad(w.roads, ...by('Plattform Sisslerfeld').jump);
  assert.ok(plattformRoad.d < 3, `Plattform jump spot is ${plattformRoad.d.toFixed(1)} m off the nearest road`);
  assert.equal(plattformRoad.n, 'Geuerenstrasse');
  const p = w.anchors.landmarks.plattform, j = by('Plattform Sisslerfeld').jump;
  assert.ok(Math.hypot(j[0] - p.x, j[1] - p.z) >= 15, 'Plattform jump spot is clear of the tower');
  assert.ok(Math.hypot(p.x - 304.75, p.z - 427.08) < 0.5, 'the tower stands on Parzelle 1765 (#526)');
  assert.equal(nearestRoad(w.roads, p.x, p.z).n, 'Geuerenstrasse', 'the nearest road to the tower is the Geuerenstrasse');
```

  Run `node --test prototype/tests/landmarks.test.mjs`. It fails, because the anchor is still at 53.8 / 855.7.
- [ ] `pipeline/anchors.json`, entry `plattform`: set `"lonlat": [7.97111003, 47.54674064]`. Replace `src` with: `"Parzelle 1765 Münchwilen (cadastral survey via geo.admin) and the KSL situation plan 03.06.2026: tower centroid 4 m + 3.47 m south of the Geuerenstrasse edge; the website's map pin (7.96773785, 47.54290085) was on Parzelle 182, Breitenloh"`.
- [ ] `data/world_hochrhein.json`: the generated anchor is the one string `"plattform":{"x":53.8,"z":855.7,"kind":"reserved","h":11,"rot":0.0}`. Re-running `pipeline/osm.py build` needs network, numpy and pyproj; run it only if it works on the runner. Otherwise replace exactly that string, and nothing else in the file, with `"plattform":{"x":304.75,"z":427.08,"kind":"reserved","h":11,"rot":0.0}`. That matches what the pipeline's `lv95_to_game` produces for the new lonlat. Check with `git diff --stat data/world_hochrhein.json`: a one-line change.
- [ ] Task 2's jump fix is also needed before the test is green. Do Task 2, then run the test.

### Task 2: the J jump spot

**Files:** `prototype/landmarks.js`

- [ ] The entry `Plattform Sisslerfeld` becomes:

```js
  { name: 'Plattform Sisslerfeld', gemeinde: 'Münchwilen', anchor: 'plattform', jump: [330.0, 418.6], look: [304.75, 427.08] },   // #94 / #526: the tower stands on Parzelle 1765 south of the Geuerenstrasse; J lands 25 m east of it on the Geuerenstrasse, looking at it
```

  (The Geuerenstrasse runs (288, 416) → (353, 420) in `data/world_hochrhein.json`, so at x = 330 it is at z ≈ 418.6.)
- [ ] Run `node --test prototype/tests/landmarks.test.mjs`, then the full node suite. All green.
- [ ] Commit and push: `fix(world): the Plattform Sisslerfeld stands on Parzelle 1765 by the Geuerenstrasse (#526)`

### Task 3: the gravel yard and parking from the KSL plan

**Files:** `prototype/plattform.js`, `prototype/tests/plattform.test.mjs`, `prototype/index.html`

Frame units: `u` points from the tower centroid to the entrance side (the road, north), `v` to the right (east). In KSL numbers the yard is 26 m E–W (5 m parking + 6 m aisle + 11 m tower zone + 4 m) by 20 m N–S, and its north edge is the road edge.

- [ ] **Failing test** (append to `plattform.test.mjs`):

```js
test('plattformYard_KslPlan_GravelRectAndSixParkingSpaces', () => {
  const y = plattformYard(plattformFrame(0, 0, 0));
  assert.equal(y.gravel.length, 4);
  const us = y.gravel.map(p => p[0]), vs = y.gravel.map(p => p[1]);   // facing 0: u = x, v = z
  assert.ok(near(Math.max(...us), PLATTFORM.yard.u1) && near(Math.min(...us), PLATTFORM.yard.u0));
  assert.ok(near(Math.max(...vs) - Math.min(...vs), 26), 'the yard is 26 m wide');
  assert.equal(y.parking.length, 6);
  for (const s of y.parking) assert.equal(s.length, 4);
});
```

  (Add `plattformYard` to the import.) Run it; it fails.
- [ ] **Implement** in `plattform.js`. Add to `PLATTFORM`:

```js
  yard: { u0: -12.5, u1: 7.47, v0: -16.5, v1: 9.5 },        // KSL: north edge = the road edge (4 m + inradius 3.47 north of the centroid), 20 m deep, 26 m wide
  parking: { n: 6, w: 2.5, d: 5, v0: -16.5, u1: 2.47 },     // KSL: 6 spaces 2.50 x 5.00 along the west edge, below a 5 m strip at the road
```

  and the function:

```js
// the KSL situation plan's yard: the gravel rectangle and the six parking spaces, as world polygons
export function plattformYard(frame, P = PLATTFORM) {
  const { yard: g, parking: k } = P;
  const rect = (u0, u1, v0, v1) => [frame.toWorld(u1, v0), frame.toWorld(u1, v1), frame.toWorld(u0, v1), frame.toWorld(u0, v0)];
  const parking = Array.from({ length: k.n }, (_, i) => rect(k.u1 - (i + 1) * k.w, k.u1 - i * k.w, k.v0, k.v0 + k.d));
  return { gravel: rect(g.u0, g.u1, g.v0, g.v1), parking };
}
```

- [ ] **`index.html`, `plattformTower`:** replace the gravel disc (`CircleGeometry` r 9) with the yard. Draw the gravel rectangle as a flat polygon on the terrain (+0.03 m, material `'gravel'`, colour as the old disc). Draw the parking spaces as thin white lines on it (+0.035 m; reuse the line style of the existing parking lots if there is a helper, otherwise thin boxes). The concrete triangle stays on top (+0.04 m). No colliders for the yard.
- [ ] Node suite green. Commit and push: `feat(world): the Plattform's gravel yard and parking as in the KSL plan (#526)`

### Task 4: browser check and CHANGELOG

- [ ] Run `python3 -m pytest prototype/tests/test_plattform_stair.py -x` in the foreground. The stair tests must stay green at the new site.
- [ ] `CHANGELOG.md` under `[Unreleased]`: ``- `<timestamp>` The **Plattform Sisslerfeld** now stands where it really is, south of the **Geuerenstrasse** on the open Sisslerfeld, with its entrance to the north and its **gravel yard** with six parking spaces.``
- [ ] Open the PR `fix(world): Plattform Sisslerfeld on its real site (#526)` with `Closes #526`. The visual check (view north from the deck over the open Sisslerfeld to the Black Forest hills, no hall next to the tower) is a **human verification step**: list it as outstanding, do not claim it.
