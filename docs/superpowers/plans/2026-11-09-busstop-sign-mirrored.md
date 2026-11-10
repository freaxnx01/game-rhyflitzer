# Bus stop sign mirrored text (#795) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** The Haltestellentafel reads correctly from the road and from behind. Spec: `docs/superpowers/specs/2026-11-09-busstop-sign-mirrored-design.md`.

**Root cause:** `index.html:2111` single DoubleSide plane whose front face looks away from the road (local +z, `busstop.js:46`); the road side shows its back, mirrored.

**Constraints:** buildless, no new deps; Playwright only targeted, in the foreground under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`; never `run_in_background`.

## Task 1: Pure face definition with failing test

**Files:** `busstop.js`, `tests/busstop.test.mjs`

- [ ] **Step 1: Write the failing test** (append to `tests/busstop.test.mjs`, add `SIGN_FACES` to the import):

```js
// plane normal after rotation.y = r is (sin r, 0, cos r); the group puts local +z away from the road (stopLayout n)
test('SIGN_FACES: one face looks toward the road, one away, none is double-sided', () => {
  const nz = SIGN_FACES.map((f) => Math.cos(f.rotY));
  assert.equal(SIGN_FACES.length, 2);
  assert.ok(nz.some((v) => near(v, -1)), 'a face toward the road (-z local)');
  assert.ok(nz.some((v) => near(v, 1)), 'a face away from the road (+z local)');
  assert.ok(SIGN_FACES.every((f) => f.z < 0), 'both in front of the pole line, behind the frame');
});

test('SIGN_FACES: for every stop yaw the road-side face normal points at the road', () => {
  for (const rot of [0, 1, 2.5, -2]) {
    const lay = stopLayout({ x: 0, z: 0, rot }, [], []);
    const away = [-Math.sin(lay.yaw), Math.cos(lay.yaw)];                  // world direction of local +z
    const road = SIGN_FACES.find((f) => Math.cos(f.rotY) < 0);
    const nLocal = [Math.sin(road.rotY), Math.cos(road.rotY)];             // (x, z) local
    const c = Math.cos(-lay.yaw), s = Math.sin(-lay.yaw);                  // three.js rotation.y = -yaw
    const w = [nLocal[0] * c + nLocal[1] * s, -nLocal[0] * s + nLocal[1] * c];
    assert.ok(w[0] * away[0] + w[1] * away[1] < -0.999);
  }
});
```

- [ ] **Step 2:** `node --test tests/busstop.test.mjs` fails (SIGN_FACES missing).
- [ ] **Step 3: Implement** in `busstop.js`:

```js
// #795: the Haltestellentafel is printed on both sides. Local +z points away from the road, so the road face is
// turned by PI; both are single-sided, a DoubleSide plane shows its back mirrored. z is behind the frame at -0.05.
export const SIGN_FACES = [{ z: -0.052, rotY: Math.PI }, { z: -0.048, rotY: 0 }];
```

- [ ] **Step 4:** the node test passes; run the whole `node --test tests/busstop.test.mjs`.
- [ ] **Step 5:** commit `test(busstop): pin the sign face orientation (#795)` then the implementation commit.

## Task 2: Use the faces in `busStop()`

**Files:** `index.html` (import line 788, `busStop` line 2111)

- [ ] **Step 1:** add `SIGN_FACES` to the import from `./busstop.js`.
- [ ] **Step 2:** replace the single sign mesh with one built once and shared material:

```js
const signMat = new THREE.MeshBasicMaterial({ map: stopSignTex(name, rows) });   // FrontSide: a DoubleSide back would be mirrored (#795)
for (const f of SIGN_FACES) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), signMat); sign.position.set(-0.5, 2.5, f.z); sign.rotation.y = f.rotY; sign.userData.signFace = true; g.add(sign); }
```

- [ ] **Step 3:** commit `fix(postauto): bus stop signs read correctly from the road (#795)`.

## Task 3: Targeted browser check

**Files:** `tests/test_bus_stops.py`

- [ ] **Step 1:** add a test to the existing Playwright file reusing its page setup (and the hand-traced world if the full OSM world OOMs; the stop must exist there, see `index.html:2501` Breitenacher). Through `window.__mm` collect the sign meshes (`userData.signFace`) of a stop and assert: two faces, none DoubleSide, and the world normal of the road face has dot < 0 with the stop's away-from-road direction `[-sin(yaw), cos(yaw)]` (`window.__mm.busStops()[i].yaw`). Expose a read-only `window.__mm.stopSignFaces = () => [...]` (world normal, side) next to `busStops` (`index.html:4803`) if no hook exists.
- [ ] **Step 2:** run only that test, foreground, capped:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_bus_stops.py -k sign -x`
- [ ] **Step 3:** confirm it fails on the pre-fix commit (road face dot > 0), passes after.

## Task 4: CHANGELOG

**Files:** `CHANGELOG.md`

- [ ] **Step 1:** under `## [Unreleased]` → `### Fixed` (create the heading if missing), newest first, Swiss time (`TZ=Europe/Zurich date '+%Y-%m-%d %H:%M'`), 1-3 bold keywords, player-facing English:
  `- \`<timestamp>\` The **PostAuto stop signs** read correctly now: the **stop name** and the **line rows** were mirrored when you drove past, and the back of the sign is printed the right way round too.`
- [ ] **Step 2:** commit `docs(changelog): mirrored stop signs fixed (#795)`; open the PR with `Closes #795`.
