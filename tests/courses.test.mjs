// tests/courses.test.mjs — #1117: race courses that change from race to race
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_STORE, COURSE_MODES, courseModeFrom, HOCHRHEIN_COURSES, courseList, nextCourseIndex, courseBestKey } from '../courses.js';

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
