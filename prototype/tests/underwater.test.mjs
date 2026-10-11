// #101: the underwater Rhine -- pure helpers. node --test prototype/tests/underwater.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UW, bedDepth, submerged, underwaterCamY, bedSamples, shuffled, spreadSchools, makeSchool, schoolPose, SURFACE_UNDER, surfaceLook } from '../underwater.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };   // a deterministic rnd()

test('UW: the agreed constants', () => {
  assert.deepEqual(UW, { slope: 0.3, maxDepth: 6, sink: 3, drag: 1.2, topFactor: 0.2, camUnder: 0.8, fogColor: '#17505f', skyHor: '#2b7a86', fogDensity: 0.035, hemiFactor: 0.6, sunFactor: 0.5, hintAt: 3, schools: 200, schoolSpacing: 120, sampleStep: 12, shoreClear: 8 });
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

test('shuffled_GivenARnd_IsADeterministicPermutationAndLeavesTheInputAlone', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const a = shuffled(input, seq(0.1, 0.9, 0.5, 0.3, 0.7)), b = shuffled(input, seq(0.1, 0.9, 0.5, 0.3, 0.7));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

test('spreadSchools_SeedsFirst_NoTwoCloserThanSpacing_EveryPointCovered', () => {
  const pts = []; for (let x = 0; x <= 1000; x += 12) for (let z = 0; z <= 100; z += 12) pts.push([x, z]);
  const seeds = [[500, 50]];
  const got = spreadSchools(shuffled(pts, seq(0.2, 0.8, 0.4, 0.6, 0.1, 0.9, 0.3, 0.7)), 120, 500, seeds);
  assert.deepEqual(got[0], [500, 50]);
  for (let i = 1; i < got.length; i++) for (let j = 1; j < i; j++) assert.ok(Math.hypot(got[i][0] - got[j][0], got[i][1] - got[j][1]) >= 120, 'spacing');
  for (const [x, z] of pts) assert.ok(got.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 120), `covered ${x},${z}`);
});

test('spreadSchools_MoreSeedsThanMax_KeepsOnlyMax', () => {
  assert.equal(spreadSchools([[0, 0]], 10, 2, [[1, 1], [2, 2], [3, 3]]).length, 2);
});

// #217: the surface seen from the river bed must read as lit water, not a dark board
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };

test('surfaceLook_Under_IsASelfLitTeal', () => {
  assert.deepEqual(surfaceLook(true), { emissive: SURFACE_UNDER.emissive, emissiveIntensity: SURFACE_UNDER.intensity });
  assert.ok(surfaceLook(true).emissiveIntensity > 0);
});

test('surfaceLook_Dry_IsOff', () => {
  assert.deepEqual(surfaceLook(false), { emissive: '#000000', emissiveIntensity: 0 });
});

test('SURFACE_UNDER_GlowIsLighterThanTheMurkAroundIt', () => {
  assert.ok(lum(SURFACE_UNDER.emissive) * SURFACE_UNDER.intensity > lum(UW.fogColor), 'the ceiling must not be darker than the fog');
});
