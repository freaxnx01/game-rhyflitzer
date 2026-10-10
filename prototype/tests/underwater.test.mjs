// #101: the underwater Rhine -- pure helpers. node --test prototype/tests/underwater.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UW, bedDepth, submerged, underwaterCamY, bedSamples, makeSchool, schoolPose } from '../underwater.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };   // a deterministic rnd()

test('UW: the agreed constants', () => {
  assert.deepEqual(UW, { slope: 0.3, maxDepth: 6, sink: 3, drag: 1.2, topFactor: 0.2, camUnder: 0.8, fogColor: '#17505f', skyHor: '#2b7a86', fogDensity: 0.035, hemiFactor: 0.6, sunFactor: 0.5, hintAt: 3, schools: 14, sampleStep: 12, shoreClear: 8 });
});

test('bedDepth_Shoreline_IsZeroSoTheCarDrivesOut', () => {
  assert.equal(bedDepth(0), 0);
  assert.equal(bedDepth(5), 0, 'on land: nothing');
});

test('bedDepth_InsideTheRiver_ShelvesAtTheSlopeAndCapsAtMaxDepth', () => {
  close(bedDepth(-10), 3);
  close(bedDepth(-20), 6);
  close(bedDepth(-92), 6, 1e-9, 'the smoke test spot at riverDist -92');
});

test('submerged_CarWellUnderTheSurface_True_JustUnderOrAbove_False', () => {
  assert.equal(submerged(4.4, 5.5), true);
  assert.equal(submerged(5.2, 5.5), false);
  assert.equal(submerged(6, 5.5), false);
  assert.equal(submerged(-2, null), false, 'no water: never');
});

test('underwaterCamY_PullsTheChaseTargetUnderTheSurface_LeavesALowerOneAlone', () => {
  close(underwaterCamY(9, 5.5), 5.5 - UW.camUnder);
  close(underwaterCamY(3, 5.5), 3);
});

test('bedSamples_JitteredGridInsideTheWaterOnly', () => {
  const inside = (x, z) => x >= 0 && x < 50 && z >= 0 && z < 50;
  const pts = bedSamples([-30, -30, 80, 80], 10, inside, seq(0.5));
  assert.ok(pts.length > 0);
  for (const [x, z] of pts) assert.ok(inside(x, z), `${x},${z}`);
  assert.equal(pts.length, 25, '5 x 5 cells of 10 m inside a 50 m square, jitter 0.5 keeps them on the cell centre');
  const noWater = bedSamples([0, 0, 100, 100], 10, () => false, seq(0.5));
  assert.equal(noWater.length, 0);
});

test('makeSchool_FromTheRanges_ColourByIndex', () => {
  const s = makeSchool(100, -40, 2.5, seq(0, 1, 0.5), 2);
  assert.deepEqual(Object.keys(s).sort(), ['colour', 'n', 'omega', 'phase', 'r', 'x', 'y', 'z']);
  assert.equal(s.x, 100); assert.equal(s.z, -40);
  assert.ok(s.n >= 8 && s.n <= 14, 'fish per school');
  assert.ok(s.r >= 5 && s.r <= 12, 'radius');
  assert.ok(s.omega >= 0.3 && s.omega <= 0.6, 'rad/s');
  assert.ok(s.y >= 2.5 + 0.8 && s.y <= 2.5 + 2.5, 'swims above the bed, under the surface');
  assert.equal(s.colour, '#d88a4a', 'school 2 is the Rotfeder');
});

test('schoolPose_FishOnTheCircle_HeadingAlongTheTangent_Bobbing', () => {
  const s = { x: 0, z: 0, y: 3, r: 10, n: 4, omega: 0.5, phase: 0, colour: '#b9c3cc' };
  const p0 = schoolPose(s, 0, 0), p1 = schoolPose(s, 1, 0);
  close(Math.hypot(p0.x - s.x, p0.z - s.z), 10, 1e-9, 'on the circle');
  close(Math.hypot(p1.x - s.x, p1.z - s.z), 10);
  close(Math.atan2(p1.z - s.z, p1.x - s.x) - Math.atan2(p0.z - s.z, p0.x - s.x), Math.PI / 2, 1e-9, 'fish 1 is a quarter turn on');
  close(p0.th, Math.atan2(p0.x - s.x, -(p0.z - s.z)) , 1e-9, 'heading is the tangent (counter-clockwise seen from above)');
  assert.ok(Math.abs(p0.y - s.y) <= 0.3, 'bobs within 0.3 m');
  const later = schoolPose(s, 0, 2);
  close(Math.atan2(later.z - s.z, later.x - s.x) - Math.atan2(p0.z - s.z, p0.x - s.x), 1, 1e-9, 'omega 0.5 rad/s for 2 s');
});

test('schoolPose_GivenAnOutObject_FillsAndReturnsIt', () => {   // review: stepFish poses ~150 fish per frame, without allocating
  const s = { x: 5, z: -3, y: 2, r: 8, n: 10, omega: 0.4, phase: 1, colour: '#b9c3cc' }, out = {};
  const p = schoolPose(s, 3, 1.5, out);
  assert.equal(p, out);
  assert.deepEqual({ ...out }, { ...schoolPose(s, 3, 1.5) });
});
