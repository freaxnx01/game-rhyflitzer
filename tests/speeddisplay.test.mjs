// #745: the Sisseln speed display -- when it lights up and what it shows. node --test tests/speeddisplay.test.mjs
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_DISPLAY, faceYaw, displayState, displayKey, panelColors } from '../speeddisplay.js';

const S = SPEED_DISPLAY, [ux, uz] = S.approach;
// a car `back` metres before the sign on the approach axis, driving towards it at `kmh`
const car = (back, kmh, extra = {}) => ({ x: S.x - ux * back, z: S.z - uz * back, vx: ux * kmh / 3.6, vz: uz * kmh / 3.6, ground: true, ...extra });

test('displayState_ApproachingUnderTheLimit_OnAndHappy', () => {
  const s = displayState(car(60, 47));
  assert.deepEqual(s, { on: true, kmh: 47, happy: true });
});

test('displayState_ApproachingOverTheLimit_OnAndSad', () => {
  const s = displayState(car(60, 63));
  assert.deepEqual(s, { on: true, kmh: 63, happy: false });
});

test('displayState_LimitIsInclusive_50HappyAnd51Sad', () => {
  assert.equal(displayState(car(40, 50)).happy, true);
  assert.equal(displayState(car(40, 51)).happy, false);
});

test('displayState_OutOfRange_Off', () => {
  assert.deepEqual(displayState(car(S.range + 1, 50)), { on: false });
  assert.equal(displayState(car(S.range - 1, 50)).on, true);
});

test('displayState_PastTheSign_Off', () => {
  assert.deepEqual(displayState(car(-5, 50)), { on: false });
});

test('displayState_ComingFromTheVillage_Off', () => {
  // 40 m on the village side, driving towards the roundabout: sees the back of the sign
  const c = { x: S.x + ux * 40, z: S.z + uz * 40, vx: -ux * 50 / 3.6, vz: -uz * 50 / 3.6, ground: true };
  assert.deepEqual(displayState(c), { on: false });
});

test('displayState_DrivingAwayInsideTheCorridor_Off', () => {
  const c = car(60, 50); c.vx = -c.vx; c.vz = -c.vz;
  assert.deepEqual(displayState(c), { on: false });
});

test('displayState_BesideTheRoad_Off', () => {
  const nx = -uz, nz = ux, c = car(60, 50);
  assert.deepEqual(displayState({ ...c, x: c.x + nx * (S.lateral + 1), z: c.z + nz * (S.lateral + 1) }), { on: false });
  assert.equal(displayState({ ...c, x: c.x + nx * (S.lateral - 1), z: c.z + nz * (S.lateral - 1) }).on, true);
});

test('displayState_Standing_Off', () => {
  assert.deepEqual(displayState(car(60, 0)), { on: false });
  assert.deepEqual(displayState(car(60, 2)), { on: false });
  assert.equal(displayState(car(60, 3)).on, true);
});

test('displayState_NotAGroundVehicle_Off', () => {
  assert.deepEqual(displayState(car(60, 50, { ground: false })), { on: false });
});

test('displayKey_OffAndOnStates', () => {
  assert.equal(displayKey({ on: false }), 'off');
  assert.equal(displayKey({ on: true, kmh: 47, happy: true }), '47:h');
  assert.equal(displayKey({ on: true, kmh: 63, happy: false }), '63:s');
});

test('panelColors_AmberDigits_GreenOrRedFace', () => {
  assert.deepEqual(panelColors({ on: true, kmh: 47, happy: true }), { digits: '#ffb000', face: '#39d353' });
  assert.deepEqual(panelColors({ on: true, kmh: 63, happy: false }), { digits: '#ffb000', face: '#ff3b30' });
});

test('faceYaw_LocalPlusZPointsAgainstTheApproach', () => {
  const yaw = faceYaw();
  // rotation.y maps local +z to (sin yaw, cos yaw)
  assert.ok(Math.abs(Math.sin(yaw) + ux) < 1e-6 && Math.abs(Math.cos(yaw) + uz) < 1e-6);
  assert.ok(Math.abs(yaw - -1.518) < 0.01);
});

// data guard: the fixed foot stands right of the Hauptstrasse at the bend, 1.0-1.5 m off the asphalt, and the
// approach axis follows the road's centre line back to the straight (spec A6, A7)
const WORLD = new URL('../data/world_hochrhein.json', import.meta.url);
test('SPEED_DISPLAY_StandsBesideTheHauptstrasse_InTheWorldFile', { skip: !fs.existsSync(WORLD) && 'run pipeline/osm.py build first' }, () => {
  const W = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
  const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
  const nearest = (x, z) => { let m = { d: Infinity, edge: Infinity, r: null }; for (const r of W.roads) for (let i = 0; i < r.pts.length - 1; i++) { const d = segDist(x, z, r.pts[i], r.pts[i + 1]); if (d - r.w / 2 < m.edge) m = { d, edge: d - r.w / 2, r }; } return m; };
  const foot = nearest(S.x, S.z);
  assert.equal(foot.r.n, 'Hauptstrasse');
  assert.ok(foot.edge >= 1.0 && foot.edge <= 1.5, `edge distance ${foot.edge}`);
  for (const back of [30, 70, 110]) {
    const p = nearest(S.x - ux * back, S.z - uz * back);
    assert.equal(p.r.n, 'Hauptstrasse', `${back} m back`);
    assert.ok(p.d <= 1.5, `${back} m back: ${p.d} m off the centre line`);
  }
});
