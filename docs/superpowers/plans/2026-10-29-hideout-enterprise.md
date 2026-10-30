# Enterprise NCC-1701-D room (#491) Implementation Plan

**Goal:** ring-2 room 0 (`r2room0`) shows the U.S.S. Enterprise NCC-1701-D at life size (642.5 m), hovering 25 m
over a dark holodeck floor with a glowing light-blue grid, under a star dome with a coloured nebula, lit by a
strong side key light; the car drives under the whole ship; the lettering „U.S.S. ENTERPRISE / NCC-1701-D" is
draped on the saucer top and underside; the 6 MB model is fetched on entering the room.

**Spec:** `docs/superpowers/specs/2026-10-29-hideout-enterprise-design.md` (decisions, author's calls, asset facts, ACs).

**Architecture:** pure numbers in a new `prototype/enterprise.js` (descriptor, placement, hover bob, lettering
frame, star field, looks) with `node --test`; `rooms.js` gives room 0 the object and the `space` look;
`index.html` only wires (holodeck floor, star dome, the model's hover placement and glow, draped decals, bob, hook).

**Global constraints:**

- **Requires #489 merged** (`RINGS`, `ROOMS2`, `roomLayout(k, room, ring)`, `BELOW_LOOKS`, `belowKind`, flat
  `ROOM.layouts` with ring-2 room k at index `8 + k`, `enter_cabin(page, h, level, times)`, `into_room(page, k,
  id, y)`). Line numbers are hints only; anchor every edit by identifier (`grep -n`).
- The asset is on `main` already (`prototype/assets/models/enterprise_d.glb`, LICENSE, README credit,
  `tools/prepare-enterprise.mjs`): do not rebuild or touch it.
- Buildless: no `package.json`, no dependency, no framework. `const`/`let`.
- TDD for the pure modules: failing test first, run red, implement, run green. Never edit an existing test to
  make it pass, except the two #489 tests the spec names (ring-2 rooms are no longer all empty) — Task 2 says how.
- Node: `node --test prototype/tests/<file>.test.mjs` per task, `node --test prototype/tests/*.test.mjs` at the
  end of Tasks 2 and 4.
- Browser: only `pytest prototype/tests/test_hideout.py -k enterprise`, in the **foreground**, never
  `run_in_background`, generous `timeout`. Never the full suite. Commit and push **before** the Playwright run.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added` (Task 6); never
  `git cliff -o`.
- Commit per task, Conventional Commits, scope `hideout`, push after every task; draft PR after Task 1; branch
  `feature/491-enterprise`; the last commit `Closes #491`.

---

### Task 1: the pure numbers (`prototype/enterprise.js`)

**Files:** `prototype/tests/enterprise.test.mjs` (new), `prototype/enterprise.js` (new).

**Interfaces:** `ENTERPRISE`, `enterprisePlacement(room, cfg = ENTERPRISE)` → `{ x, z, y, th }`,
`enterpriseHover(t, cfg)` → metres, `letteringFrame(side)` → `{ rx, ry }`, `SPACE_LOOK`, `HOLODECK`,
`starField(seed = 1701)` → `{ stars: [{ u, v, r, b, tint }], clouds: [{ u, v, r, colour, alpha }], band }`.

- [ ] **Step 1: write the failing tests** — `prototype/tests/enterprise.test.mjs`:

```js
// #491: the Enterprise-D room -- pure. node --test prototype/tests/enterprise.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISE, enterprisePlacement, enterpriseHover, letteringFrame, SPACE_LOOK, HOLODECK, starField } from '../enterprise.js';

const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, msg || `${a} ~ ${b}`);
const room = { centre: [100, -50], y: -1200, frame: { f: [0, 1], v: [-1, 0] }, portal: { c: [100, -550], th: Math.PI / 2 } };
// rotate a vector by rx about x then ry about y (three's Euler XYZ with rz = 0, as geometry.rotateX / rotateY apply in that order)
const rot = ([x, y, z], { rx, ry }) => { const y1 = y * Math.cos(rx) - z * Math.sin(rx), z1 = y * Math.sin(rx) + z * Math.cos(rx); return [x * Math.cos(ry) + z1 * Math.sin(ry), y1, -x * Math.sin(ry) + z1 * Math.cos(ry)]; };

test('ENTERPRISE_LifeSizeHovering_AssetFactsAndGlow', () => {
  assert.equal(ENTERPRISE.key, 'enterprise'); assert.equal(ENTERPRISE.length, 642.5); close(ENTERPRISE.h, 143.1, 0.05); assert.equal(ENTERPRISE.scale, 1);
  assert.deepEqual(ENTERPRISE.anchor, [0, 0, 0]); assert.equal(ENTERPRISE.hover, 25); close(ENTERPRISE.yaw, Math.PI / 6);
  assert.equal(ENTERPRISE.url, './assets/models/enterprise_d.glb'); assert.equal(ENTERPRISE.loadWithin, 400);
  for (const s of ['saucer', 'drive', 'nacelles', 'aux']) assert.ok(ENTERPRISE.glow[s] >= 1.6, s); assert.ok(ENTERPRISE.glow.nacelles > ENTERPRISE.glow.saucer);
  assert.equal(ENTERPRISE.hull, undefined); assert.equal(ENTERPRISE.feet, undefined);   // no colliders: nothing comes near the floor
});

test('enterprisePlacement_CentreOfTheRoom_25mUp_BowAtThePortalYawed30DegreesRight', () => {
  const p = enterprisePlacement(room);
  assert.deepEqual([p.x, p.z], room.centre); close(p.y, -1175);
  const bow = [Math.cos(p.th), Math.sin(p.th)], toPortal = [-room.frame.f[0], -room.frame.f[1]];
  close(bow[0] * toPortal[0] + bow[1] * toPortal[1], Math.cos(Math.PI / 6), 1e-9, 'bow 30 deg off the portal axis');
  close(bow[0] * room.frame.v[0] + bow[1] * room.frame.v[1], Math.sin(Math.PI / 6), 1e-9, 'turned towards +v (the right, driving in)');
  // the ship, yawed, keeps 100 m to the walls of a 1000 m room; its bow lies 222 m past the portal face
  const L = ENTERPRISE.length / 2, B = ENTERPRISE.beam / 2, c = Math.cos(p.th - room.portal.th), s = Math.sin(p.th - room.portal.th);
  assert.ok(L * Math.abs(c) + B * Math.abs(s) < 400 && L * Math.abs(s) + B * Math.abs(c) < 400);
  close(500 - L * Math.cos(Math.PI / 6), 221.8, 0.1);
});

test('enterpriseHover_SineBob_1_5mOver14s_ZeroAtStart', () => {
  close(enterpriseHover(0), 0); close(enterpriseHover(3.5), 1.5); close(enterpriseHover(10.5), -1.5); close(enterpriseHover(14), 0, 1e-9);
  assert.ok(Math.abs(enterpriseHover(123.4)) <= 1.5);
});

test('ENTERPRISE_lettering_FourDecalsOnTheSaucer_TopAndUnderside', () => {
  const L = ENTERPRISE.lettering; assert.equal(L.length, 4);
  for (const side of ['top', 'bottom']) {
    const of = L.filter(d => d.side === side); assert.deepEqual(of.map(d => d.text), ['U.S.S. ENTERPRISE', 'NCC-1701-D']);
    for (const d of of) assert.ok(d.x > 150 && d.x < 300 && d.w <= 200 && d.h >= 12, `${side} ${d.text} on the saucer forward of the bridge`);
    assert.ok(of[0].x > of[1].x, 'the name lies nearer the bow than the registry');
  }
});

test('letteringFrame_LettersUpPointToTheBow_FaceAwayFromTheHull', () => {
  for (const [side, ny] of [['top', 1], ['bottom', -1]]) {
    const F = letteringFrame(side), up = rot([0, 1, 0], F), n = rot([0, 0, 1], F);
    close(up[0], 1, 1e-9, `${side}: text up = +x`); close(Math.abs(up[1]) + Math.abs(up[2]), 0, 1e-9);
    close(n[1], ny, 1e-9, `${side}: face ${ny > 0 ? 'up' : 'down'}`); close(Math.abs(n[0]) + Math.abs(n[2]), 0, 1e-9);
  }
});

test('SPACE_LOOK_NearBlackSkyThinFog_StrongKeyLowFill', () => {
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (const k of ['fog', 'skyTop', 'skyHor']) assert.ok(Math.max(...rgb(SPACE_LOOK[k])) <= 12, `${k} near black`);
  assert.ok(SPACE_LOOK.density <= 0.0001, 'fog thin enough to keep the stars'); assert.ok(SPACE_LOOK.sun >= 2 && SPACE_LOOK.hemi <= 0.5);
  for (const k of ['fog', 'density', 'skyTop', 'skyHor', 'hemiSky', 'hemiGround', 'hemi', 'sun']) assert.ok(k in SPACE_LOOK, k);   // blendLook's keys
});

test('HOLODECK_TenMetreGrid_LightBlueOnDark', () => {
  assert.equal(HOLODECK.cell, 10); assert.equal(HOLODECK.tile, 256);
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), [lr, lg, lb] = rgb(HOLODECK.line), [gr, gg, gb] = rgb(HOLODECK.ground);
  assert.ok(lb > 200 && lb >= lg && lg > lr, 'light blue line'); assert.ok(gr + gg + gb < 40, 'dark ground');
});

test('starField_Deterministic_StarsInTheUpperHalf_ThreeNebulaClouds', () => {
  const a = starField(), b = starField();
  assert.deepEqual(a, b); assert.ok(a.stars.length >= 2000 && a.stars.length <= 2600, a.stars.length);
  for (const s of a.stars) { assert.ok(s.u >= 0 && s.u < 1 && s.v >= 0 && s.v < 0.7, 'u, v in the texture, above the floor'); assert.ok(s.r >= 0.5 && s.r <= 3 && s.b > 0 && s.b <= 1); assert.ok(['white', 'blue', 'amber'].includes(s.tint)); }
  assert.ok(a.stars.filter(s => s.r >= 2.5).length >= 20, 'some bright stars');
  assert.equal(a.clouds.length, 3); for (const c of a.clouds) { assert.ok(c.v < 0.5 && c.r > 0.05 && c.r < 0.3 && c.alpha <= 0.35); assert.match(c.colour, /^#[0-9a-f]{6}$/); }
  assert.ok(a.band.v > 0.1 && a.band.v < 0.5 && a.band.alpha <= 0.1);
  assert.notDeepEqual(starField(7).stars[0], a.stars[0], 'another seed, another sky');
});
```

- [ ] **Step 2: run red.** `node --test prototype/tests/enterprise.test.mjs` fails (module not found).
- [ ] **Step 3: implement** `prototype/enterprise.js`:

```js
// #491: the U.S.S. Enterprise NCC-1701-D in ring-2 room 0 -- pure numbers, no three.js, no DOM: the descriptor loadModel reads,
// where the ship hangs in its room, its hover bob, the lettering decals and the room's holodeck-and-stars look.
// index.html builds the meshes. Unit-tested with `node --test prototype/tests/enterprise.test.mjs`.
//
// The model (prototype/assets/models/enterprise_d.glb, tools/prepare-enterprise.mjs) is in metres: bow on +x, +y up, +z starboard,
// y = 0 at the lowest hull point (the engineering hull's underside), x = z = 0 the centre of its footprint. Measured 2026-10-29:
// 642.5 x 476.7 x 143.1 m, the saucer underside 81 .. 102 m over the lowest point, its top 123 .. 135 m forward of the bridge.
export const ENTERPRISE = {
  key: 'enterprise', h: 143.1, length: 642.5, beam: 476.7, scale: 1, anchor: [0, 0, 0],
  hover: 25,                                   // the lowest hull point over the floor: the bus and the walker pass, the hull still fills the view
  yaw: Math.PI / 6,                            // bow towards the portal, turned 30 degrees to the right: the three-quarter view on approach
  bob: { amp: 1.5, period: 14 },               // a slow hover, metres and seconds
  glow: { saucer: 1.6, drive: 1.6, aux: 1.8, nacelles: 2.6 },   // emissiveIntensity per section (the materials' extras.glow): windows, deflector, warp grilles + bussards
  // canvas text draped on the saucer (ship frame: x along the ship, the text runs across it, w metres wide, h metres tall)
  lettering: [
    { side: 'top', text: 'U.S.S. ENTERPRISE', x: 235, w: 180, h: 14 }, { side: 'top', text: 'NCC-1701-D', x: 205, w: 150, h: 20 },
    { side: 'bottom', text: 'U.S.S. ENTERPRISE', x: 235, w: 180, h: 14 }, { side: 'bottom', text: 'NCC-1701-D', x: 205, w: 150, h: 20 },
  ],
  url: './assets/models/enterprise_d.glb', loadWithin: 400,
};

// the ship's footprint centre on the room centre, `hover` m up; th = the bow's heading: back out towards the portal, turned `yaw` towards +v
export function enterprisePlacement(room, cfg = ENTERPRISE) {
  const [cx, cz] = room.centre, { f, v } = room.frame, c = Math.cos(cfg.yaw), s = Math.sin(cfg.yaw);
  const bow = [-f[0] * c + v[0] * s, -f[1] * c + v[1] * s];
  return { x: cx, z: cz, y: room.y + cfg.hover, th: Math.atan2(bow[1], bow[0]) };
}
export const enterpriseHover = (t, cfg = ENTERPRISE) => cfg.bob.amp * Math.sin(2 * Math.PI * t / cfg.bob.period);
// a PlaneGeometry (in xy, facing +z, text up = +y) turned so the letters' up points to the bow (+x) and the face away from the hull
export const letteringFrame = (side) => (side === 'top' ? { rx: -Math.PI / 2, ry: -Math.PI / 2 } : { rx: Math.PI / 2, ry: Math.PI / 2 });

// the room's look (blendLook's keys, as ROOM_LOOK): near-black sky behind the star dome, fog so thin it takes 0.6 % at 1000 m,
// the sun as a strong key light from the upper front-left of the car, a cool low hemisphere fill
export const SPACE_LOOK = { fog: '#04050a', density: 0.00008, skyTop: '#04050a', skyHor: '#04050a', hemiSky: '#8fa3c8', hemiGround: '#141a26', hemi: 0.45, sun: 2.2 };
// the holodeck floor: one 256 px tile per 10 m cell, a light-blue line on two edges, a dim half-line through the middle; a brighter rim along the walls
export const HOLODECK = { cell: 10, tile: 256, line: '#5fd0ff', sub: '#1f4a66', ground: '#05070d', rim: '#8fe0ff', rimW: 1 };

const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// the dome's texture, in texture coordinates (u round the horizon, v = 0 at the zenith, 0.5 the horizon, 1 the nadir): about 2200 stars above
// the floor, a few big ones, three nebula clouds and a faint milky band. Deterministic per seed.
export function starField(seed = 1701) {
  const r = rng(seed), stars = [];
  for (let i = 0; i < 2200; i++) { const big = r() < 0.015; stars.push({ u: r(), v: r() * 0.68, r: big ? 2.5 + r() * 0.5 : 0.5 + r() * 1.3, b: 0.35 + r() * 0.65, tint: r() < 0.7 ? 'white' : r() < 0.5 ? 'blue' : 'amber' }); }
  const clouds = [{ u: 0.22, v: 0.28, r: 0.17, colour: '#6a3fb0', alpha: 0.32 }, { u: 0.31, v: 0.2, r: 0.12, colour: '#2a8f9c', alpha: 0.28 }, { u: 0.7, v: 0.33, r: 0.2, colour: '#b03f8a', alpha: 0.22 }];
  return { stars, clouds, band: { v: 0.3, alpha: 0.08, width: 0.12 } };
}
```

- [ ] **Step 4: run green.** `node --test prototype/tests/enterprise.test.mjs`.
- [ ] **Step 5: commit.** `feat(hideout): the Enterprise-D's numbers, placement and look (#491)`; push; open the draft PR.

### Task 2: room 0 of ring 2 gets the ship and the space look (`rooms.js`)

**Files:** `prototype/tests/rooms.test.mjs` (edit two #489 tests, append), `prototype/rooms.js`.

- [ ] **Step 1: tests.** In `prototype/tests/rooms.test.mjs`, the #489 test `RINGS_Ring1AsBefore_Ring2EightEmptyRoomsTwiceAsWideAtMinus1200`
  asserts every `ROOMS2` room is empty — change only its loop line to
  `for (const r of ROOMS2.slice(1)) { assert.equal(r.object, null); assert.equal(r.name, null); }` (the
  `spokeSigns(ROOMS2)` → `[]` assertion stays: room 0 is `signed: false`). In
  `roomLayout_Ring2_ThousandMetreSquareAtItsDepth_PortalAtTheSpokeEnd` change
  `assert.equal(R.object, null); assert.equal(R.tower, null);` to
  `if (k) { assert.equal(R.object, null); assert.equal(R.tower, null); }`. Then append:

```js
// #491: the Enterprise in ring-2 room 0 -- a holodeck, no meadow
import { ENTERPRISE } from '../enterprise.js';

test('ROOMS2_RoomZero_HasTheEnterprise_UnsignedWithTheSpaceLook', () => {
  assert.equal(ROOMS2[0].object, ENTERPRISE); assert.equal(ROOMS2[0].name, 'Enterprise'); assert.equal(ROOMS2[0].signed, false); assert.equal(ROOMS2[0].look, 'space');
  assert.equal(NEXT_ROOMS2[0], 0, 'it took the first room in line');
});

test('roomLayout_SpaceLook_NoTreesNoPaths_WallsPortalSpawnAndFlyAsAnyRoom', () => {
  const R = rooms2[0], M = roomLayout(0, { id: 'r2room0', name: null, object: null }, RINGS[1]);   // the same room as a meadow
  assert.equal(R.look, 'space'); assert.equal(M.look, 'meadow');
  assert.deepEqual(R.trees, []); assert.deepEqual(R.paths, []); assert.ok(M.trees.length > 100 && M.paths.length === 2);
  assert.deepEqual(R.tower, { x: R.centre[0], z: R.centre[1] }); assert.equal(R.object, ENTERPRISE); assert.equal(R.basin, null);
  assert.equal(R.colliders.length, M.colliders.length, 'the ship adds no collider: nothing comes near the floor');
  assert.deepEqual(R.fly, M.fly); assert.deepEqual(R.portal, M.portal); assert.deepEqual(R.spawn, M.spawn);
});

test('roomLayout_SpaceLook_FreeFromTheSpawnToTheCentreAndEveryCorner', () => {
  const R = rooms2[0];
  assert.ok(!blocked(R, R.spawn.x, R.spawn.z) && !blocked(R, ...R.centre));
  for (const [a, b] of [[450, 450], [450, -450], [-450, 450], [-450, -450], [-125, 0], [0, 240]]) assert.ok(!blocked(R, ...toWorld(R, a, b)), `free at ${a}, ${b}`);
  for (const [a, b] of [[499, 0], [0, -499]]) assert.ok(blocked(R, ...toWorld(R, a, b)), `walled at ${a}, ${b}`);
});
```

- [ ] **Step 2: run red.**
- [ ] **Step 3: implement** in `prototype/rooms.js`:
  - `import { ENTERPRISE } from './enterprise.js';   // #491` after the artemis import;
  - replace the `ROOMS2` line with

```js
// #489 / #491: ring 2's eight rooms -- the Enterprise took the first; the rest are empty for now. `look`: 'meadow' (the ring-1 template)
// or 'space' (#491: a holodeck grid under a star dome, no trees, paths or clouds)
export const ROOMS2 = Array.from({ length: SPOKE.n }, (_, k) => (k === 0 ? { id: 'r2room0', name: 'Enterprise', object: ENTERPRISE, signed: false, look: 'space' } : { id: `r2room${k}`, name: null, object: null }));
```

  - in `roomLayout`, after `const Y = ring.y, HALF = ring.half;` add `const space = room.look === 'space';   // #491`;
    wrap the tree loop: `if (!space) for (const inset of TREE_ROWS) { … }`; the paths line becomes
    `const paths = space ? [] : [{ pts: [start, end], hw: 4 }, { pts: loop, hw: 4 }];` (keep `start`, `end`,
    `loop`, `reachA` as they are; the `if (artemis) paths.push(…)` line stays); in the returned object add
    `look: space ? 'space' : 'meadow',` after `half: HALF,`.
- [ ] **Step 4: run green.** `node --test prototype/tests/*.test.mjs` (rooms, room-fly, artemis, fries, Ferris,
  #489's tests all pass).
- [ ] **Step 5: commit.** `feat(hideout): the Enterprise takes ring-2 room 0 (#491)`; push.

### Task 3: credits (`strings.js`, F1 help)

**Files:** `prototype/strings.js`, `prototype/index.html`.

- [ ] **Step 1:** after `creditModelT` in **both** `en` and `de` of `prototype/strings.js`:
  en `creditEnterprise: '3D model „Enterprise D 2 8 Simple Bake Export" by HaughtyGrayAlien (Sketchfab), CC BY 4.0; decimated and compressed',`
  de `creditEnterprise: '3D-Modell „Enterprise D 2 8 Simple Bake Export" von HaughtyGrayAlien (Sketchfab), CC BY 4.0; vereinfacht und komprimiert',`.
- [ ] **Step 2:** in `prototype/index.html`, after the `<small data-i18n="creditModelT" …>` line (inside the same
  `</div>`): `<small data-i18n="creditEnterprise" style="display:block;margin-top:4px;color:var(--steel-l)"></small>`.
- [ ] **Step 3:** `node --test prototype/tests/strings.test.mjs` (en/de keys identical).
- [ ] **Step 4: commit.** `docs(hideout): credit the Enterprise-D model in the F1 help (#491)`; push.

### Task 4: wire the room (`index.html`)

**Files:** `prototype/index.html`.

- [ ] **Step 1: imports.** After `import { ARTEMIS } from './artemis.js';`:
  `import { ENTERPRISE, enterprisePlacement, enterpriseHover, letteringFrame, SPACE_LOOK, HOLODECK, starField } from './enterprise.js';   // #491`.
- [ ] **Step 2: the look.** In `fadeBelowLook` replace `const base = BELOW_LOOKS[BELOW.kind]` with
  `const base = BELOW.kind === 'room' && ROOM.layout && ROOM.layout.look === 'space' ? SPACE_LOOK : BELOW_LOOKS[BELOW.kind]`
  (`ROOM.layout` is the room built by `ensureRoom` before the level switches). In `setBelowLook` replace
  `sunSprite.visible = kind === 'room'` with `sunSprite.visible = kind === 'room' && !(ROOM.layout && ROOM.layout.look === 'space')`.
- [ ] **Step 3: room meshes.** In `roomMeshes` replace the lawn/paths/trees/clouds lines with:

```js
  if (R.look === 'space') roomSpace(group, R);   // #491: the holodeck grid and the star dome instead of the meadow
  else {
    // lawn: one plane, the grass texture tiled every 8 m (TEX.grass is the surface's grass; reuse it), turned to the room's own frame
    const lawnTex = …(unchanged)…; group.add(lawn);
    for (const p of R.paths) group.add(flatStrip(p.pts, p.hw, y + 0.08, 0xcfc3ac));
    roomTrees(group, R); roomClouds(group, R);
  }
  if (R.object === EIFFEL) roomTower(group, R); if (R.basin) roomBasin(group, R); if (R.figure) roomFigure(group, R); if (R.artemis) roomArtemis(group, R); roomPortal(group, R);
```

  (`roomTrees` and `roomClouds` move into the `else`; nothing else in the function changes.) Then add, after
  `roomClouds`:

```js
// #491: the holodeck -- one unlit plane with a 10 m grid tile (the lines glow by themselves), a brighter rim along the four walls, and the
// star dome: a sphere round the room, drawn after the global sky (renderOrder), never fogged, its texture from starField() once per build
function roomSpace(group, R) {
  const [cx, cz] = R.centre, y = R.y, a = R.portal.th, { f, v } = R.frame, H = HOLODECK;
  const tile = makeTex(H.tile, H.tile, (g, w, h) => { g.fillStyle = H.ground; g.fillRect(0, 0, w, h); g.fillStyle = H.sub; g.fillRect(0, h / 2, w, 1); g.fillRect(w / 2, 0, 1, h); g.fillStyle = H.line; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); });
  tile.repeat.set(2 * R.half / H.cell, 2 * R.half / H.cell);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * R.half, 2 * R.half), new THREE.MeshBasicMaterial({ map: tile })); floor.geometry.rotateX(-Math.PI / 2); floor.geometry.rotateY(-a); floor.position.set(cx, y, cz); floor.userData.role = 'holodeck'; group.add(floor);
  const e = R.half - H.rimW, corner = (s, t) => [cx + f[0] * s + v[0] * t, cz + f[1] * s + v[1] * t];
  group.add(flatStrip([corner(-e, -e), corner(e, -e), corner(e, e), corner(-e, e), corner(-e, -e)], H.rimW, y + 0.05, H.rim));
  const sky = starField(), tex = makeTex(2048, 1024, (g, w, h) => {
    g.fillStyle = '#03040a'; g.fillRect(0, 0, w, h);
    for (const c of sky.clouds) { const gr = g.createRadialGradient(c.u * w, c.v * h, 0, c.u * w, c.v * h, c.r * w); gr.addColorStop(0, c.colour + Math.round(c.alpha * 255).toString(16).padStart(2, '0')); gr.addColorStop(1, c.colour + '00'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    g.fillStyle = `rgba(200,210,255,${sky.band.alpha})`; g.fillRect(0, (sky.band.v - sky.band.width / 2) * h, w, sky.band.width * h);
    const tint = { white: '255,255,255', blue: '190,210,255', amber: '255,225,190' };
    for (const s of sky.stars) { g.fillStyle = `rgba(${tint[s.tint]},${s.b})`; g.beginPath(); g.arc(s.u * w, s.v * h, s.r, 0, 2 * Math.PI); g.fill(); if (s.r >= 2.5) { const gr = g.createRadialGradient(s.u * w, s.v * h, 0, s.u * w, s.v * h, s.r * 4); gr.addColorStop(0, `rgba(${tint[s.tint]},0.5)`); gr.addColorStop(1, `rgba(${tint[s.tint]},0)`); g.fillStyle = gr; g.fillRect(s.u * w - s.r * 4, s.v * h - s.r * 4, s.r * 8, s.r * 8); } }
  }, { alpha: true });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })); dome.renderOrder = 1; dome.position.set(cx, y, cz); dome.userData.role = 'stardome'; group.add(dome);
}
```

  (`makeTex` already sets `RepeatWrapping` and anisotropy; with `alpha: true` it clamps, right for the dome.)
- [ ] **Step 4: the model.** In `loadModel`, replace the three lines from `const s = O.scale || …` to
  `root.position.set(…)` (the anchor/alongV/draught placement) with:

```js
    let s;
    if (O.hover !== undefined) {   // #491: a hovering ship, already in metres -- placed by its own numbers, its sections' glow boosted
      const pl = enterprisePlacement(ROOM.layouts[k], O); s = 1; root.position.set(pl.x, pl.y, pl.z); root.rotation.y = -pl.th; root.userData.base = pl.y; root.userData.th = pl.th;
      root.traverse(o => { if (o.isMesh && o.material.userData.glow) o.material.emissiveIntensity = O.glow[o.material.userData.glow] || 1; });
    } else {
      s = O.scale || O.h / size.y; const [ax, ay, az] = O.anchor || [(box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2];
      const v = ROOM.layouts[k].frame.v, th = O.alongV ? -Math.atan2(v[1], v[0]) : 0;   // #422: a ship's long axis (model x) lies along the room's cross axis; the anchor turns with it
      root.scale.setScalar(s); root.rotation.y = th; root.position.set(cx - s * (ax * Math.cos(th) + az * Math.sin(th)), fl - s * ay - (O.draught || 0), cz - s * (-ax * Math.sin(th) + az * Math.cos(th)));   // #422: a ship sinks by its draught, to its waterline in the basin
    }
```

  (the existing `Object.assign(E, { tris, height: …, base: …, material: … })` line stays: `s` is now declared
  above it.) In `attachModel(k)` append `if (ROOMS…)` → precisely: change it to

```js
function attachModel(k) { if (ROOM.placeholder) { ROOM.group.remove(ROOM.placeholder); ROOM.placeholder = null; } ROOM.group.add(ROOM.models[k]); modelState(k).loaded = true; ROOM.states[k].placeholder = false; if (ROOM.layouts[k].object.lettering) roomLettering(k); }   // #491: the decals need the saucer
```

  In `ensureRoom` replace `for (const r of ROOMS) if (r.object) delete window.__mm.counts[r.object.key || 'eiffel'];`
  with `for (const L of ROOM.layouts) if (L.object) delete window.__mm.counts[L.object.key || 'eiffel'];` (both rings).
- [ ] **Step 5: the lettering and the bob.** After `loadModel`:

```js
// #491: „U.S.S. ENTERPRISE / NCC-1701-D" draped on the saucer, top and underside: one canvas text plane per line, its grid vertices dropped
// (top) or lifted (underside) onto the saucer mesh by rays, 0.6 m off the hull; a vertex no ray hits keeps its neighbour's height. The planes
// are children of the model root (they hover with it) and are built once per loaded model.
function roomLettering(k) {
  const root = ROOM.models[k], O = ROOM.layouts[k].object; if (root.userData.lettered) return; root.userData.lettered = true;
  const saucer = root.getObjectByName('saucer'); if (!saucer) { console.warn('Enterprise: no saucer node, no lettering'); return; }
  root.updateWorldMatrix(true, true); const ray = new THREE.Raycaster(), p = new THREE.Vector3(), local = new THREE.Vector3(), built = [];
  for (const d of O.lettering) {
    const px = Math.round(d.w * 6), py = Math.round(d.h * 6), tex = makeTex(px, py, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = `800 ${Math.round(h * 0.86)}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 2; g.strokeStyle = '#141a26'; g.strokeText(d.text, w / 2, h / 2, w * 0.96); g.fillStyle = '#d8dfe9'; g.fillText(d.text, w / 2, h / 2, w * 0.96); }, { alpha: true });
    const geo = new THREE.PlaneGeometry(d.w, d.h, 24, 4), F = letteringFrame(d.side); geo.rotateX(F.rx); geo.rotateY(F.ry); geo.translate(d.x, 0, 0);
    const pos = geo.attributes.position, up = d.side === 'top', dir = new THREE.Vector3(0, up ? -1 : 1, 0); let last = up ? O.h : 0;
    for (let i = 0; i < pos.count; i++) {
      local.set(pos.getX(i), up ? 300 : -5, pos.getZ(i)); root.localToWorld(p.copy(local)); ray.set(p, dir.clone().transformDirection(root.matrixWorld)); ray.far = 320;
      const hit = ray.intersectObject(saucer, false)[0]; if (hit) last = root.worldToLocal(hit.point.clone()).y;
      pos.setY(i, last + (up ? 0.6 : -0.6));
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.renderOrder = 2; m.userData.role = 'lettering'; root.add(m); built.push(m);
  }
  root.userData.lettering = built.length;
}
// #491: the hover bob -- the model root rides a slow sine over its placed height (enterprise.js); the decals are its children and ride along
function stepEnterprise(dt) {
  const k = ROOM.built; if (k === null) return; const O = ROOM.layouts[k].object;
  if (!O || O.hover === undefined || !ROOM.models[k] || !modelState(k).loaded) return;
  const root = ROOM.models[k]; root.userData.t = (root.userData.t || 0) + dt; root.position.y = root.userData.base + enterpriseHover(root.userData.t, O);
}
```

  In the frame step (the line starting `const t0 = performance.now(); if (R.state !== 'ready') {`), after
  `stepLift(dt);` add `stepEnterprise(dt);`.
- [ ] **Step 6: hook.** Next to `window.__mm.titanic = …`:

```js
window.__mm.enterprise = () => {   // #491: ring-2 room 0 is flat index 8 (#489); the glow per section is read off the loaded meshes
  if (!ROOM.states[8] || ROOM.built !== 8) return null;
  const m = ROOM.models[8], glow = {}; if (m) m.traverse(o => { if (o.isMesh && o.material.userData.glow) glow[o.material.userData.glow] = o.material.emissiveIntensity; });
  return { ...ROOM.states[8], hover: ENTERPRISE.hover, length: ENTERPRISE.length, y: m ? m.position.y : null, th: m ? m.userData.th : null, lettering: m ? m.userData.lettering || 0 : 0, look: ROOM.layout.look, sun: sun.intensity, hemi: hemi.intensity, sunDisc: sunSprite.visible, dome: ROOM.group.children.some(o => o.userData.role === 'stardome'), grid: ROOM.group.children.some(o => o.userData.role === 'holodeck'), glow: m ? glow : null };
};
```

  (`ROOM.states[8]` and `ROOM.models[8]`: ring-2 room 0's flat index, #489.)
- [ ] **Step 7: verify.** `node --test prototype/tests/*.test.mjs`; open the page: empty console on the surface;
  `grep -n "roomTrees(group, R)" prototype/index.html` shows the call only inside the meadow `else`.
- [ ] **Step 8: commit.** `feat(hideout): the Enterprise-D hovers over a holodeck under the stars (#491)`; push.

### Task 5: targeted browser test (`test_hideout.py -k enterprise`)

**Files:** `prototype/tests/test_hideout.py`.

- [ ] **Step 1: the test**, after the #489 ring-2 tests:

```python
@needs_world
def test_enterprise_room_holodeck_stars_and_the_ship_hovering_over_the_car(server, tmp_path):
    """#491: ring-2 spoke 0 builds the holodeck room and fetches enterprise_d.glb then; the ship hovers 25 m up, bow to the portal, with
    its lettering; the car drives under it; the look is the space one. Leaves a screenshot from under the saucer in tmp_path."""
    with sync_playwright() as p:
        br, page, errors = open_page(p, server)
        requests = []
        page.on("request", lambda r: requests.append(r.url) if r.url.endswith("enterprise_d.glb") else None)
        h = page.evaluate("() => window.__mm.hideout()")
        enter_cabin(page, h, "ring", FREIGHT_SLOW_DWELL); page.wait_for_function(PAD_SHOWN, timeout=120000)
        page.keyboard.press("Digit2"); page.wait_for_function(RIDE_DONE, arg="ring2", timeout=240000)
        assert page.evaluate("() => window.__mm.enterprise()") is None and requests == []
        into_room(page, 0, "r2room0", -1200)
        page.wait_for_function("() => window.__mm.enterprise() && window.__mm.enterprise().loaded === true", timeout=240000)
        page.wait_for_timeout(500)
        e = page.evaluate("() => window.__mm.enterprise()"); below = page.evaluate("() => window.__mm.below()")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, e = window.__mm.enterprise(), c = Math.cos(e.th), s = Math.sin(e.th);
          const ship = (x, z) => window.__mm.pushAt(t.x + x * c - z * s, t.z + x * s + z * c, -1200);   // ship frame -> world
          const th = window.__mm.spoke(0, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], room = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -1200);
          return { centre: ship(0, 0), hull: ship(-125, 0), saucer: ship(125, 0), bow: ship(300, 0), corner: room(450, 450), corner2: room(-450, -450), wall: room(499, 0) }; }""")
        under = page.evaluate("() => { const t = window.__mm.below().tower, e = window.__mm.enterprise(), x = 150; return { x: t.x + x * Math.cos(e.th), z: t.z + x * Math.sin(e.th), th: e.th + Math.PI }; }")
        page.evaluate(f"() => window.__mm.sim({under['x']}, {under['z']}, {under['th']}, 0, 1.5, [], -1200)")
        page.set_viewport_size({"width": 1280, "height": 720}); page.wait_for_timeout(1500)
        page.screenshot(path=str(tmp_path / "enterprise-under-the-saucer.png"))
        br.close()
    print("screenshot:", tmp_path / "enterprise-under-the-saucer.png")
    assert errors == []
    assert len(requests) == 1 and requests[0].endswith("/prototype/assets/models/enterprise_d.glb"), requests
    assert e["placeholder"] is False and 200000 <= e["tris"] <= 260000 and abs(e["height"] - 143.1) < 0.5 and e["length"] == 642.5, e
    assert abs(e["y"] - (-1200 + 25)) <= 2.0 and e["lettering"] == 4 and e["look"] == "space", e
    assert e["dome"] is True and e["grid"] is True and e["sunDisc"] is False and e["sun"] >= 2.0 and e["hemi"] <= 0.5, e
    assert all(v >= 1.6 for v in e["glow"].values()) and e["glow"]["nacelles"] >= 2.5, e["glow"]
    assert below["level"] == "r2room0" and below["built"] == 8 and below["object"] is True and below["fog"] == "#04050a", below
    assert all(math.hypot(push[k]["dx"], push[k]["dz"]) < 0.01 for k in ("centre", "hull", "saucer", "bow", "corner", "corner2")), push
    assert math.hypot(push["wall"]["dx"], push["wall"]["dz"]) > 0.3, push
```

  `PAD_SHOWN`, `FREIGHT_SLOW_DWELL`, `enter_cabin(…, times)` and `into_room(…, y)` are #489's. The bow heading
  check (30° right of the portal axis) is the node test's; here `th` only frames the probes.
- [ ] **Step 2: commit and push first**, then run in the foreground:
  `pytest prototype/tests/test_hideout.py -k enterprise -x` (timeout ≥ 20 min: the ride, the 6 MB fetch and a
  240k-triangle room in a software renderer are slow). Fix the implementation, never the expectations (three
  attempts, then stop and report). Look at the screenshot: the underside lettering must read `U.S.S. ENTERPRISE`
  and `NCC-1701-D` the right way round with the grid below; if the letters are mirrored, the `letteringFrame`
  node test is wrong about three's rotation order — fix `letteringFrame` and its test together and say so.
- [ ] **Step 3: commit.** `test(hideout): the Enterprise room in the browser (#491)`; push.

### Task 6: CHANGELOG

**Files:** `CHANGELOG.md`.

- [ ] **Step 1:** get the time: `TZ=Europe/Zurich date '+%F %H:%M'`.
- [ ] **Step 2:** under `## [Unreleased]` → `### Added`, newest first (create `### Added` if it is missing):

```markdown
- `YYYY-MM-DD HH:MM` **Ring 2** has its first room: the **U.S.S. Enterprise NCC-1701-D**, 642 m long at life size, **hovers** over a dark **holodeck** floor with a glowing blue grid under a **star-filled sky** with a coloured nebula. Take the lift to Ring 2 and the first spoke on the right; drive under the saucer and the engineering hull, read the name on the hull, or fly round it with <kbd>F</kbd>. 3D model „Enterprise D 2 8 Simple Bake Export" by HaughtyGrayAlien (Sketchfab), CC BY 4.0, decimated and compressed.
```

- [ ] **Step 3: commit.** `docs(changelog): the Enterprise-D room (#491)` with the footer `Closes #491`; push; mark
  the PR ready for review. Never merge.
