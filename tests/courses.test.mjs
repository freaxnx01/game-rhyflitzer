// tests/courses.test.mjs — #1117: race courses that change from race to race
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_STORE, COURSE_MODES, courseModeFrom, HOCHRHEIN_COURSES, courseList, nextCourseIndex, courseBestKey, RANDOM, nearestFirstLength, randomCourse } from '../courses.js';
import { seededRng } from '../presents.js';

const CPS = [1, 2, 3, 4, 5].map((i) => ({ n: `C${i}`, x: i * 100, z: 0 }));
const FIN = { n: 'F', x: 0, z: 900 };

test('courseModeFrom_storedValue_turnUnlessRandom', () => {
  assert.deepEqual(COURSE_STORE, { mode: 'mm.courseMode', idx: 'mm.courseIdx' });
  assert.deepEqual(COURSE_MODES, ['turn', 'random']);
  assert.equal(courseModeFrom(null), 'turn');
  assert.equal(courseModeFrom('turn'), 'turn');
  assert.equal(courseModeFrom('random'), 'random');
  assert.equal(courseModeFrom('x'), 'turn');
});

test('HOCHRHEIN_COURSES_fourCourses_fiveCheckpointsEach', () => {
  assert.deepEqual(HOCHRHEIN_COURSES.map((c) => c.id), ['eiken', 'twoBridges', 'mumpf', 'bergsee']);
  assert.deepEqual(HOCHRHEIN_COURSES.map((c) => c.key), ['courseEiken', 'courseTwoBridges', 'courseMumpf', 'courseBergsee']);
  for (const c of HOCHRHEIN_COURSES) {
    assert.equal(c.cps.length, 5, c.id);
    for (const p of [...c.cps, c.finish]) assert.ok(typeof p.n === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z), c.id);
    const all = [...c.cps, c.finish];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) >= 300, `${c.id} ${all[i].n}/${all[j].n}`);
  }
  assert.equal(HOCHRHEIN_COURSES[3].finish.n, 'Bergsee');
});

test('courseList_hochrheinOsm_classicThenFour', () => {
  const list = courseList('hochrhein', true, CPS, FIN);
  assert.deepEqual(list.map((c) => c.id), ['classic', 'eiken', 'twoBridges', 'mumpf', 'bergsee']);
  assert.equal(list[0].key, 'courseClassic');
  assert.equal(list[0].cps, CPS);
  assert.equal(list[0].finish, FIN);
});

test('courseList_otherRegionOrHandWorld_classicOnly', () => {
  assert.deepEqual(courseList('ehrendingen', true, CPS, FIN).map((c) => c.id), ['classic']);
  assert.deepEqual(courseList('hochrhein', false, CPS, FIN).map((c) => c.id), ['classic']);
  assert.deepEqual(courseList('world:abc', true, CPS, FIN).map((c) => c.id), ['classic']);
});

test('courseList_noCheckpoints_empty', () => {
  assert.deepEqual(courseList('world:abc', true, [], FIN), []);
});

test('nextCourseIndex_storedIndex_nextWrapping', () => {
  assert.equal(nextCourseIndex(null, 5), 0);
  assert.equal(nextCourseIndex('', 5), 0);
  assert.equal(nextCourseIndex('0', 5), 1);
  assert.equal(nextCourseIndex('3', 5), 4);
  assert.equal(nextCourseIndex('4', 5), 0);
  assert.equal(nextCourseIndex('7', 5), 0);
  assert.equal(nextCourseIndex('-1', 5), 0);
  assert.equal(nextCourseIndex('1.5', 5), 0);
  assert.equal(nextCourseIndex('0', 1), 0);
});

test('courseBestKey_classicKeepsBase_randomNone', () => {
  assert.equal(courseBestKey('mm.best2', 'classic'), 'mm.best2');
  assert.equal(courseBestKey('mm.best2', 'eiken'), 'mm.best2.eiken');
  assert.equal(courseBestKey('mm.blitzBest', 'bergsee'), 'mm.blitzBest.bergsee');
  assert.equal(courseBestKey('mm.best2', 'random'), null);
});

const straight = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const START = { x: 0, z: 0 };
// a 7 x 7 grid of named points 500 m apart around the start
const POOL = [];
for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i || j) POOL.push({ n: `P${i}_${j}`, x: i * 500, z: j * 500 });

test('nearestFirstLength_followsTheArrowOrder', () => {
  const cps = [{ x: 300, z: 0 }, { x: 100, z: 0 }], fin = { x: 300, z: 400 };
  assert.equal(nearestFirstLength(START, cps, fin, straight), 100 + 200 + 400);
});

test('randomCourse_sameSeed_sameCourse', () => {
  const ref = 6000;
  const a = randomCourse(POOL, START, seededRng(42), straight, ref), b = randomCourse(POOL, START, seededRng(42), straight, ref);
  assert.ok(a);
  assert.deepEqual(a, b);
  assert.equal(a.id, 'random');
  assert.equal(a.key, 'courseRandom');
  assert.equal(a.cps.length, 5);
});

test('randomCourse_rules_gapRadiusAndLength', () => {
  const ref = 6000;
  for (let seed = 1; seed <= 20; seed++) {
    const c = randomCourse(POOL, START, seededRng(seed), straight, ref);
    assert.ok(c, `seed ${seed}`);
    const all = [...c.cps, c.finish];
    for (const q of all) assert.ok(straight(q, START) <= RANDOM.radius, `seed ${seed} radius`);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(straight(all[i], all[j]) >= RANDOM.minGap, `seed ${seed} gap`);
    const len = nearestFirstLength(START, c.cps, c.finish, straight);
    assert.ok(len >= RANDOM.lo * ref && len <= RANDOM.hi * ref, `seed ${seed} length ${len}`);
  }
});

test('randomCourse_pointsKeepTheirNames', () => {
  const c = randomCourse(POOL, START, seededRng(7), straight, 6000);
  for (const q of [...c.cps, c.finish]) assert.ok(POOL.some((p) => p.n === q.n && p.x === q.x && p.z === q.z));
});

test('randomCourse_impossible_null', () => {
  assert.equal(randomCourse(POOL.slice(0, 4), START, seededRng(1), straight, 6000), null);   // fewer than six points
  assert.equal(randomCourse(POOL, START, seededRng(1), straight, 100), null);                // no course that short
  assert.equal(randomCourse(POOL, START, seededRng(1), () => Infinity, 6000), null);          // no route
});

// a line of 13 points 200 m apart: closer than minGap to its neighbours, so the greedy pick depends on the
// shuffled order -- an unlucky order finds only five points where another order finds six
const LINE = [];
for (let i = 0; i < 13; i++) LINE.push({ n: `L${i}`, x: i * 200, z: 0 });

test('randomCourse_clusteredPool_reshufflesAfterAFailedDraw', () => {
  const ref = 2400;
  for (let seed = 1; seed <= 20; seed++) {
    const c = randomCourse(LINE, START, seededRng(seed), straight, ref);
    assert.ok(c, `seed ${seed}`);
    const all = [...c.cps, c.finish];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(straight(all[i], all[j]) >= RANDOM.minGap, `seed ${seed} gap`);
  }
});

test('randomCourse_doesNotReorderThePool', () => {
  const copy = POOL.map((q) => ({ ...q }));
  randomCourse(POOL, START, seededRng(3), straight, 6000);
  assert.deepEqual(POOL, copy);
});
