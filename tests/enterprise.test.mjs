// #491: the Enterprise-D room -- pure. node --test tests/enterprise.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTERPRISE, enterprisePlacement, enterpriseHover, letteringFrame, SPACE_LOOK, HOLODECK, starField, DEDICATION, dedicationPlacement, ringMean, columnIndex, columnExtent } from '../enterprise.js';

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

test('enterprisePlacement_CentreOfTheRoom_25MUp_BowAtThePortalYawed30DegreesRight', () => {
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

test('enterpriseHover_SineBob_1_5MOver14s_ZeroAtStart', () => {
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

test('ENTERPRISE_bakedLettering_CoversTheRedRegistryColumn', () => {
  const column = { x: [825, 838], y: [236, 352] }, margin = 3;   // the measured registry in the shipped texture (2026-11-01), independent of the rect under test
  const [r] = ENTERPRISE.bakedLettering; assert.equal(ENTERPRISE.bakedLettering.length, 1); assert.equal(r.size, 1024);
  assert.ok(r.x0 <= column.x[0] - margin && r.x1 >= column.x[1] + margin, `x ${r.x0}-${r.x1} must cover 825-838 with a ${margin} px margin`);
  assert.ok(r.y0 <= column.y[0] - margin && r.y1 >= column.y[1] + margin, `y ${r.y0}-${r.y1} must cover 236-352 with a ${margin} px margin`);
  assert.ok(r.x1 - r.x0 < 40 && r.y1 - r.y0 < 140, 'no wider than the lettering');
});

test('ringMean_InnerRectOfOneColourInARingOfAnother_ReturnsTheRing', () => {
  const w = 10, h = 10, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([200, 0, 0, 255], i * 4);                          // red everywhere ...
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < 2 || x > 7 || y < 2 || y > 7) px.set([90, 100, 110, 255], (y * w + x) * 4);   // ... grey ring
  assert.deepEqual(ringMean(px, w, h, { x0: 3, y0: 3, x1: 6, y1: 6 }, 1).map(Math.round), [200, 0, 0], 'a ring inside the red is red');
  assert.deepEqual(ringMean(px, w, h, { x0: 2, y0: 2, x1: 7, y1: 7 }, 1).map(Math.round), [90, 100, 110], 'the ring just outside is grey');
});

test('ENTERPRISE_drape_DenserGridLargerOffset', () => {
  const D = ENTERPRISE.drape;
  // the drape's math (roomLettering): each vertex ray-casts a 3 x 3 cluster `spread` m apart and rides `offset` m off the
  // extreme hit -- so offset/spread must be positive to lift the plane and widen the cluster at all
  assert.ok(D.offset > 0, 'the plane is lifted off the hull'); assert.ok(D.spread > 0, 'the ray cluster spans round each vertex');
  // a denser grid is what hugs the hull between the decals' own corners -- assert it against the decals it has to hug: PlaneGeometry(d.w, d.h, seg[0], seg[1])
  // lays (seg + 1) vertices across each decal, so seg must resolve finer than the decals' own extents
  for (const d of ENTERPRISE.lettering) {
    assert.ok(D.seg[0] >= d.w / 2, `${d.text}: seg x ${D.seg[0]} resolves finer than one vertex per 2 m of its ${d.w} m width`);
    assert.ok(D.seg[1] >= d.h / 2, `${d.text}: seg y ${D.seg[1]} resolves finer than one vertex per 2 m of its ${d.h} m height`);
  }
  // and denser than the coarsest grid that would still be called a grid (one vertex per decal edge)
  assert.ok((D.seg[0] + 1) * (D.seg[1] + 1) > ENTERPRISE.lettering.length, 'more vertices than decals, not one quad per plane');
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
test('dedicationPlacement_JustInsideThePortal_RightOfTheLane_FacingTheWayIn', () => {
  const d = dedicationPlacement(room), [px, pz] = room.portal.c, { f, v } = room.frame;
  const a = (d.x - px) * f[0] + (d.z - pz) * f[1], b = (d.x - px) * v[0] + (d.z - pz) * v[1];
  close(a, DEDICATION.a); close(b, DEDICATION.b);
  assert.ok(a > 20 && a < 80, 'seen from the spawn point (20 m in), well clear of the ship'); assert.ok(b > 8, 'beside the lane, not on it');
  close(Math.cos(d.face), -f[0], 1e-9); close(Math.sin(d.face), -f[1], 1e-9);   // the plaque's front faces the portal
  assert.equal(d.y, room.y);
  assert.equal(d.colliders.length, 1); const c = d.colliders[0];
  assert.deepEqual([c.x, c.z, c.c, c.s], [d.x, d.z, f[0], f[1]]); close(c.hd, DEDICATION.w / 2); assert.ok(c.hw >= DEDICATION.depth / 2 && c.hw < 1);
  close(c.h, room.y + DEDICATION.lift + DEDICATION.h);
});

test('DEDICATION_ReadablePanel_FromTheCar', () => {
  assert.ok(DEDICATION.w >= 6 && DEDICATION.w <= 12 && DEDICATION.h >= 3 && DEDICATION.h <= DEDICATION.w);
  assert.ok(DEDICATION.lift >= 0.5 && DEDICATION.lift + DEDICATION.h <= 8, 'at eye height from the car, not over it');
});

// #607: the drape asks "how high is the hull right under (x, z)" tens of thousands of times; a vertical ray against all 42,600 saucer
// triangles froze the load for seconds, so the triangles are bucketed in xz cells once and a column only tests its cell's few
test('columnExtent_ReturnsTheLowestAndHighestHullUnderAPoint_OrNullBesideIt', () => {
  // two horizontal squares (two triangles each) over x, z in [0, 10]: one at y = 2, one at y = 7; a slanted triangle elsewhere
  const sq = (y) => [0, y, 0, 10, y, 0, 10, y, 10, 0, y, 0, 10, y, 10, 0, y, 10];
  const tris = new Float32Array([...sq(2), ...sq(7), 20, 0, 0, 30, 10, 0, 20, 0, 10]);
  const idx = columnIndex(tris, 4);
  const near = (e, lo, hi) => e && Math.abs(e.lo - lo) < 1e-6 && Math.abs(e.hi - hi) < 1e-6;
  assert.ok(near(columnExtent(idx, 5, 5), 2, 7));
  assert.ok(near(columnExtent(idx, 9.5, 0.5), 2, 7), 'near a corner, in another cell than the centre');
  assert.equal(columnExtent(idx, 15, 5), null, 'nothing beneath');
  const s = columnExtent(idx, 25, 2); assert.ok(Math.abs(s.lo - 5) < 1e-6 && s.lo === s.hi, `the slope interpolates: ${JSON.stringify(s)}`);
});

test('columnIndex_EachCellHoldsOnlyTheTrianglesOverIt', () => {
  const tris = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 100, 0, 100, 101, 0, 100, 100, 0, 101]);
  const idx = columnIndex(tris, 4), sizes = [...idx.cells.values()].map(c => c.length);
  assert.equal(Math.max(...sizes), 1, 'two far-apart triangles never share a cell'); assert.equal(idx.cells.size, 2);
});
