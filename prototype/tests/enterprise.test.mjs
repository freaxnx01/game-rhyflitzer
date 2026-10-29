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