# Race courses that change from race to race (#1117) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new race (Zeitfahren, Blitz, multiplayer race) takes the next of five Hochrhein courses, or a seeded
random course when the settings switch says so; the course name shows before the start; best times are kept per
course; every multiplayer device races the host's course.

**Architecture:** A new pure module `courses.js` holds the four extra courses, the rotation, the best-time keys and
the seeded random draw (A* length injected). `index.html` keeps `CPS` / `FINISH` as the live course and moves the
existing five checkpoint objects and the finish gate when a course is applied. The multiplayer `start` message
carries `course` (index) or `seed`; `CODE_VERSION` goes to 5.

**Tech Stack:** vanilla JS ES modules, `node --test` for pure modules, one Playwright file for the wiring.

**Spec:** `docs/superpowers/specs/2026-11-27-race-courses-design.md`

## Global constraints

- Buildless: no package.json, no new dependency.
- Pure modules (`courses.js`, `netcodec.js`, `strings.js`) stay free of DOM and three.js.
- Course 1 (`classic`) keeps today's localStorage keys (`REGION.bestKey`, `mm.blitzBest`) and today's texts.
- Every course has exactly five checkpoints (`cpObjs` is built once with five, `index.html:3693`).
- Strings in `strings.js` in **both** `en` and `de` with the same arity (`tests/strings.test.mjs`).
- Browser tests: run in the foreground, only the new file plus the directly affected ones (see Task 7).
- Commit after every task with a Conventional Commit referencing #1117.

## File structure

- Create `courses.js` — course data and pure rules.
- Create `tests/courses.test.mjs` — node tests for `courses.js`.
- Modify `netcodec.js` — `CODE_VERSION` 5, `parseStart` with `course` / `seed`, `COURSE_WIRE_MAX`.
- Modify `tests/netcodec.test.mjs`, `tests/joinhandoff.test.mjs`, `tests/test_join_handoff.py`,
  `tests/test_multiplayer_lobby.py` — `R4` → `R5`, race start with course/seed.
- Modify `strings.js` — new keys en + de; `tests/strings.test.mjs` — one test.
- Modify `index.html` — course state, apply/pick, startRace, finish/result/mode text, toast, settings row, MP wiring,
  `__mm.course`.
- Create `tests/test_race_courses.py` — browser test.
- Modify `CHANGELOG.md`.

---

### Task 1: `courses.js` — data, rotation, best keys

**Files:**
- Create: `courses.js`
- Test: `tests/courses.test.mjs`

**Interfaces:**
```js
export const COURSE_STORE: { mode: 'mm.courseMode', idx: 'mm.courseIdx' }
export const COURSE_MODES: ['turn', 'random']
export function courseModeFrom(stored: string|null): 'turn'|'random'
export const HOCHRHEIN_COURSES: Array<{ id, key, cps: [{n,x,z}]×5, finish: {n,x,z} }>   // courses 2-5
export function courseList(regionId, osm: boolean, cps, finish): Course[]
export function nextCourseIndex(stored: string|null, count: number): number
export function courseBestKey(baseKey: string, id: string): string|null
```

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/courses.test.mjs`
Expected: FAIL, `Cannot find module '../courses.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// courses.js (#1117): the race courses -- the region's own course plus four more on the Hochrhein, the rotation,
// the best-time keys and the seeded random draw. Pure: no DOM, no three.js, so node --test imports it.
// Coordinates are game metres of the OSM world (data/world_hochrhein.json), measured 2026-11-27 (spec table).
export const COURSE_STORE = Object.freeze({ mode: 'mm.courseMode', idx: 'mm.courseIdx' });
export const COURSE_MODES = ['turn', 'random'];
export const courseModeFrom = (stored) => (stored === 'random' ? 'random' : 'turn');

const p = (n, x, z) => ({ n, x, z });
const BAHNHOF_SISSELN = p('Bahnhof Sisseln', 1938.5, 530.4), SISSLERFELD = p('Sisslerfeld', 88.9, 406.4);
const GETEC = p('GETEC Park Stein', -563.9, -431.8), STEIN_DORF = p('Stein Dorf', -934.7, 520.7);
const BAHNHOF_STEIN = p('Bahnhof Stein-Säckingen', -1368.2, 988.3), PLATTFORM = p('Plattform Sisslerfeld', 330.0, 418.6);
const REF_KIRCHE = p('Reformierte Kirche Stein', -1178.0, 795.9), GALLUSTURM = p('Gallusturm', -1254.8, -408.5);
const SMILE = p('Smile-Kreisel', 1270.0, -148.0);

export const HOCHRHEIN_COURSES = [
  { id: 'eiken', key: 'courseEiken', cps: [p('LANDI-Turm', 1832.7, 627.7), p('Bahnhof Eiken', 1709.8, 1936.5), p('Güggeli-Foodtruck', 1921.6, 2249.8), PLATTFORM, REF_KIRCHE], finish: GALLUSTURM },
  { id: 'twoBridges', key: 'courseTwoBridges', cps: [SMILE, SISSLERFELD, GETEC, GALLUSTURM, REF_KIRCHE], finish: p('Schloss Schönau', -1378.0, -5.6) },
  { id: 'mumpf', key: 'courseMumpf', cps: [SMILE, PLATTFORM, STEIN_DORF, BAHNHOF_STEIN, p('Dorfzentrum Mumpf', -3484.8, 596.6)], finish: p('Bahnhof Bad Säckingen', -1381.9, -558.6) },
  { id: 'bergsee', key: 'courseBergsee', cps: [p('Straussenfarm Sisseln', 2345.0, -318.0), BAHNHOF_SISSELN, PLATTFORM, STEIN_DORF, p('Aqualon Therme', -1996.1, -1083.2)], finish: p('Bergsee', -2281.8, -2179.9) },
];

// the region's own course first; the four Hochrhein courses only on the OSM Hochrhein world (the hand fallback uses other coordinates)
export function courseList(regionId, osm, cps, finish) {
  if (!cps.length) return [];
  const own = { id: 'classic', key: 'courseClassic', cps, finish };
  return regionId === 'hochrhein' && osm ? [own, ...HOCHRHEIN_COURSES] : [own];
}

// the index after the stored one (the last course started), wrapping; 0 when nothing valid is stored
export function nextCourseIndex(stored, count) {
  const n = Number(stored);
  const valid = stored !== null && stored !== '' && Number.isInteger(n) && n >= 0 && n < count;
  return valid ? (n + 1) % count : 0;
}

// course 1 keeps today's key, so no stored best time is lost; a random course has none
export function courseBestKey(baseKey, id) {
  if (id === 'random') return null;
  return id === 'classic' ? baseKey : `${baseKey}.${id}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/courses.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add courses.js tests/courses.test.mjs
git commit -m "feat(race): course data, rotation and per-course best keys (#1117)"
```

### Task 2: `courses.js` — course length and the seeded random draw

**Files:**
- Modify: `courses.js`
- Test: `tests/courses.test.mjs`

**Interfaces:**
```js
export const RANDOM: { radius: 4000, minGap: 300, lo: 0.75, hi: 1.25, tries: 200 }
export function nearestFirstLength(start: {x,z}, cps: {x,z}[], finish: {x,z}, legLen: (a,b) => number): number
export function randomCourse(pool: {n,x,z}[], start: {x,z}, rng: () => number, legLen, ref: number): Course|null
```

- [ ] **Step 1: Write the failing test**

Append to `tests/courses.test.mjs` (extend the import line with `RANDOM, nearestFirstLength, randomCourse`, and
import `seededRng` from `../presents.js`):

```js
import { seededRng } from '../presents.js';

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

test('randomCourse_doesNotReorderThePool', () => {
  const copy = POOL.map((q) => ({ ...q }));
  randomCourse(POOL, START, seededRng(3), straight, 6000);
  assert.deepEqual(POOL, copy);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/courses.test.mjs`
Expected: FAIL, `RANDOM` / `nearestFirstLength` / `randomCourse` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `courses.js`:

```js
// the random draw (#1117): within `radius` m of the start, `minGap` m apart, length lo..hi x course 1's
export const RANDOM = Object.freeze({ radius: 4000, minGap: 300, lo: 0.75, hi: 1.25, tries: 200 });

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// the length in the order the arrow guides: always the nearest open checkpoint (stepRace), then the finish
export function nearestFirstLength(start, cps, finish, legLen) {
  let cur = start, total = 0;
  const left = [...cps];
  while (left.length) {
    let k = 0;
    for (let i = 1; i < left.length; i++) if (dist(cur, left[i]) < dist(cur, left[k])) k = i;
    const next = left.splice(k, 1)[0];
    total += legLen(cur, next);
    cur = next;
  }
  return total + legLen(cur, finish);
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function sixApart(points, start) {
  const six = [];
  for (const q of points) {
    if (dist(q, start) > RANDOM.radius || six.some((s) => dist(s, q) < RANDOM.minGap)) continue;
    six.push(q);
    if (six.length === 6) return six;
  }
  return null;
}

// deterministic for a given pool order and rng: the same seed gives every device the same course
export function randomCourse(pool, start, rng, legLen, ref) {
  for (let t = 0; t < RANDOM.tries; t++) {
    const six = sixApart(shuffled(pool, rng), start);
    if (!six) return null;
    const cps = six.slice(0, 5).map(({ n, x, z }) => ({ n, x, z })), finish = (({ n, x, z }) => ({ n, x, z }))(six[5]);
    const len = nearestFirstLength(start, cps, finish, legLen);
    if (len >= RANDOM.lo * ref && len <= RANDOM.hi * ref) return { id: 'random', key: 'courseRandom', cps, finish };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/courses.test.mjs`
Expected: PASS (13 tests). If `randomCourse_rules_gapRadiusAndLength` finds no course for a seed, the grid fixture
is too sparse for the length window: do **not** widen `RANDOM`; check the shuffle consumes `rng` per try.

- [ ] **Step 5: Commit**

```bash
git add courses.js tests/courses.test.mjs
git commit -m "feat(race): seeded random course with a length window (#1117)"
```

### Task 3: `netcodec.js` — course or seed in the race start, `CODE_VERSION` 5

**Files:**
- Modify: `netcodec.js:7` (`CODE_VERSION`), `netcodec.js:200-205` (`parseStart`)
- Test: `tests/netcodec.test.mjs`, `tests/joinhandoff.test.mjs`, `tests/test_join_handoff.py`,
  `tests/test_multiplayer_lobby.py`

**Interfaces:**
```js
export const CODE_VERSION = 5;
export const COURSE_WIRE_MAX = 7;
// parseMessage({type:'start', mode:'race', t0, now, course}) -> { type:'start', mode:'race', t0, now, course }
// parseMessage({type:'start', mode:'race', t0, now, seed})   -> { type:'start', mode:'race', t0, now, seed }
```

- [ ] **Step 1: Write the failing test**

In `tests/netcodec.test.mjs` replace the two `start` lines of `parseMessage_raceMessages` (line 172-173) with:

```js
  assert.deepEqual(P({ type: 'start', mode: 'race', t0: 5000, now: 1000, course: 2 }), { type: 'start', mode: 'race', t0: 5000, now: 1000, course: 2 });
  assert.deepEqual(P({ type: 'start', mode: 'race', t0: 5000, now: 1000, seed: 4294967295 }), { type: 'start', mode: 'race', t0: 5000, now: 1000, seed: 4294967295 });
  assert.equal(P({ type: 'start', mode: 'race', t0: 'x', now: 1, course: 0 }), null);
```

and add a test after it:

```js
// #1117: a race start names the course -- an index into the rotation or a seed for the random draw, exactly one
test('parseMessage_raceStart_courseOrSeed', () => {
  assert.equal(COURSE_WIRE_MAX, 7);
  const base = { type: 'start', mode: 'race', t0: 5000, now: 1000 };
  assert.equal(P(base), null);                                               // neither
  assert.equal(P({ ...base, course: 1, seed: 5 }), null);                    // both
  for (const course of [-1, 8, 1.5, '1', null]) assert.equal(P({ ...base, course }), null, String(course));
  for (const seed of [-1, 4294967296, 2.5, '7', null]) assert.equal(P({ ...base, seed }), null, String(seed));
  assert.deepEqual(P({ ...base, course: 0 }), { ...base, course: 0 });
  assert.deepEqual(P({ ...base, seed: 0 }), { ...base, seed: 0 });
  assert.deepEqual(P({ type: 'start', mode: 'cruise', course: 3 }), { type: 'start', mode: 'cruise' });   // a cruise ignores it
});
```

Add `COURSE_WIRE_MAX` to the file's import from `../netcodec.js`. Replace every `R4` code prefix in
`tests/netcodec.test.mjs` (lines 10, 33, 34, 161-163, 167) and `tests/joinhandoff.test.mjs:46` with `R5`, and line 27 (the "another version" probe) becomes
`h.replace(/^R5/, 'R6')`. In `tests/test_join_handoff.py` (lines 39, 88) and
`tests/test_multiplayer_lobby.py` (lines 65, 74, 176, 186, 203) replace `R4H.` / `R4G.` with `R5H.` / `R5G.`.
Find them all with `git grep -n "R4[HG.]" -- tests` (must print nothing afterwards).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/netcodec.test.mjs tests/joinhandoff.test.mjs`
Expected: FAIL (`COURSE_WIRE_MAX` undefined, codes still `R4`, start without course still parses).

- [ ] **Step 3: Write minimal implementation**

`netcodec.js:7`:

```js
export const CODE_VERSION = 5;      // the R<version> prefix: a code from another game version is refused, not misread (#1112: bit 6 became the horn bit, so old and new builds must not mix; #1191: knock names the prop; #1190: the pontoon message; #1117: the race start names its course)
```

Replace `parseStart`:

```js
export const COURSE_WIRE_MAX = 7;   // #1117: the highest course index a race start may name (five today, room for more)
const SEED_MAX = 0xffffffff;
const courseField = (m) => {
  const hasCourse = m.course !== undefined, hasSeed = m.seed !== undefined;
  if (hasCourse === hasSeed) return null;
  if (hasCourse) return Number.isInteger(m.course) && m.course >= 0 && m.course <= COURSE_WIRE_MAX ? { course: m.course } : null;
  return Number.isInteger(m.seed) && m.seed >= 0 && m.seed <= SEED_MAX ? { seed: m.seed } : null;
};

// parseStart — 'cruise' is the lobby cruise; 'race' carries the host-clock T0, the host's now for the offset, and
// the course: `course` (rotation index) or `seed` (random draw), exactly one (#1117).
function parseStart(m) {
  if (!START_MODES.includes(m.mode)) return null;
  if (m.mode !== 'race') return { type: 'start', mode: m.mode };
  const course = courseField(m);
  return finite(m.t0) && finite(m.now) && course ? { type: 'start', mode: 'race', t0: m.t0, now: m.now, ...course } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/netcodec.test.mjs tests/joinhandoff.test.mjs tests/netrace.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netcodec.js tests/netcodec.test.mjs tests/joinhandoff.test.mjs tests/test_join_handoff.py tests/test_multiplayer_lobby.py
git commit -m "feat(multiplayer): race start names its course, CODE_VERSION 5 (#1117)"
```

### Task 4: strings (en + de)

**Files:**
- Modify: `strings.js` (en block near `setStationCap` line 543 and the race strings near `finishedWorld` line 58;
  de block at the matching places, lines 1436 / 955)
- Test: `tests/strings.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('the race course strings exist in both languages (#1117)', () => {
  for (const lang of ['en', 'de']) {
    for (const k of ['setRace', 'setCourse', 'setCourseTurn', 'setCourseRandom', 'setCourseCap', 'courseClassic', 'courseEiken', 'courseTwoBridges', 'courseMumpf', 'courseBergsee', 'courseRandom', 'introCourseRandom', 'courseNextRandom', 'courseNoBest']) assert.equal(typeof STRINGS[lang][k], 'string', `${lang} ${k}`);
    assert.match(translate(lang, 'introCourse', 'Eiken', 'Gallusturm'), /Eiken.*Gallusturm/s);
    assert.match(translate(lang, 'courseToast', 'Eiken', 'Gallusturm'), /Eiken.*Gallusturm/s);
    assert.match(translate(lang, 'finishedCourse', 'Gallusturm'), /Gallusturm/);
    assert.match(translate(lang, 'courseNext', 'Mumpf'), /Mumpf/);
  }
  assert.equal(translate('de', 'setCourseTurn'), 'Im Wechsel');
  assert.equal(translate('de', 'setCourseRandom'), 'Zufällig');
  assert.equal(translate('de', 'setCourse'), 'Strecke');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/strings.test.mjs`
Expected: FAIL (`en setRace` undefined).

- [ ] **Step 3: Write minimal implementation**

en (the `small` helper is the one at `strings.js:6`):

```js
  setRace: 'Race',
  setCourse: 'Course',
  setCourseTurn: 'In turn',
  setCourseRandom: 'Random',
  setCourseCap: 'every new race takes the next course, or one drawn at random',
  courseClassic: 'Classic',
  courseEiken: 'Eiken',
  courseTwoBridges: 'Two Bridges',
  courseMumpf: 'Mumpf',
  courseBergsee: 'Bergsee',
  courseRandom: 'Random course',
  introCourse: (name, finish) => `Course «${name}»: five checkpoints in any order, then the finish at ${finish}.`,
  introCourseRandom: 'A random course: five checkpoints in any order and a finish, drawn from the landmarks. No best time on a random course.',
  courseToast: (name, finish) => `Course «${name}»<br>${small(`Finish: ${finish}`)}`,
  finishedCourse: (finish) => `${finish} reached.`,
  courseNext: (name) => `Next race: course «${name}».`,
  courseNextRandom: 'Next race: a random course.',
  courseNoBest: 'no best time on a random course',
```

de:

```js
  setRace: 'Rennen',
  setCourse: 'Strecke',
  setCourseTurn: 'Im Wechsel',
  setCourseRandom: 'Zufällig',
  setCourseCap: 'jedes neue Rennen nimmt die nächste Strecke oder eine zufällige',
  courseClassic: 'Klassiker',
  courseEiken: 'Eiken',
  courseTwoBridges: 'Zwei Brücken',
  courseMumpf: 'Mumpf',
  courseBergsee: 'Bergsee',
  courseRandom: 'Zufällige Strecke',
  introCourse: (name, finish) => `Strecke «${name}»: fünf Checkpoints in beliebiger Reihenfolge, dann das Ziel bei ${finish}.`,
  introCourseRandom: 'Eine zufällige Strecke: fünf Checkpoints in beliebiger Reihenfolge und ein Ziel, ausgelost aus den Sehenswürdigkeiten. Auf einer zufälligen Strecke gibt es keine Bestzeit.',
  courseToast: (name, finish) => `Strecke «${name}»<br>${small(`Ziel: ${finish}`)}`,
  finishedCourse: (finish) => `${finish} erreicht.`,
  courseNext: (name) => `Nächstes Rennen: Strecke «${name}».`,
  courseNextRandom: 'Nächstes Rennen: eine zufällige Strecke.',
  courseNoBest: 'keine Bestzeit auf einer zufälligen Strecke',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/strings.test.mjs tests/toast.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add strings.js tests/strings.test.mjs
git commit -m "feat(race): course strings in English and German (#1117)"
```

### Task 5: `index.html` — apply, pick and show the course (single player)

**Files:**
- Modify: `index.html` (imports ~1138, after `index.html:1962`, `startRace` 6534, `finish` 6646, `modeText` 6677,
  `resultHtml` 6672, `restartRace` 8167, `__mm` hooks ~8505)

**Interfaces:**
```js
const COURSE = { list: Course[], cur: Course|null, ref: number|null };
function applyCourse(course): void           // sets CPS/FINISH (snapped), moves cpObjs + finishG, reloads R.best / R.blitzBest
function pickCourse(): Course                 // turn: next index (stored per region); random: fresh seed
function courseFromWire({ course, seed }): Course
function startRace(mode = 'trial', rng = Math.random, course = hasCheckpoints(mode) && COURSE.list.length ? pickCourse() : null)
window.__mm.course = () => ({ id, seed, idx, mode, cps, finish, ids })
```

- [ ] **Step 1: Import**

Add after the `startscreen.js` import (`index.html:1138`):

```js
import { COURSE_STORE, courseModeFrom, courseList, nextCourseIndex, courseBestKey, nearestFirstLength, randomCourse } from './courses.js';   // #1117
```

- [ ] **Step 2: Course state and helpers**

The checkpoint objects (`cpObjs`, `finishG`, `index.html:3693-3697`) are built after the course data, and
`JUMP_ENTRIES` at `index.html:5168`; place this block **after** `autoGraph` (`index.html:5249-5255`) and before
the first `startRace` call:

```js
// ---------- #1117: race courses -- the region's own course plus four more on the Hochrhein, or a seeded random one
const COURSE = { list: courseList(REGION.id, !!L, CPS, FINISH), cur: null, ref: null };
COURSE.cur = COURSE.list[0] ?? null;
const courseMode = () => { try { return courseModeFrom(localStorage.getItem(COURSE_STORE.mode)); } catch (e) { return 'turn'; } };
const courseIdxKey = () => `${COURSE_STORE.idx}.${REGION.id}`;
function storedCourseIdx() { try { return localStorage.getItem(courseIdxKey()); } catch (e) { return null; } }
// today's road graph, whatever the local 1952 layer: the random draw must not depend on device state (spec A14)
function todayGraph() { if (!AUTOP.graphs.today) { const graph = buildGraph(eraRoads(ROADS, false)); AUTOP.graphs.today = { graph, streets: streetEntries(graph, REGION.villages) }; } return AUTOP.graphs.today.graph; }
function courseLegLen(a, b) { const g = todayGraph(), sa = snapToGraph(g, a.x, a.z, 60), sb = snapToGraph(g, b.x, b.z, 60); const r = sa && sb && findRoute(g, sa, [sb]); return r ? r.len : Infinity; }
function randomPool() { const g = todayGraph(); return JUMP_ENTRIES.filter((e) => !e.ramp && !e.wreck && !e.depot).map((e) => ({ n: e.n, x: e.j ? e.j[0] : e.x, z: e.j ? e.j[1] : e.z })).filter((q) => snapToGraph(g, q.x, q.z, 60)); }
function drawRandomCourse(seed) {
  if (!L || !COURSE.list.length) return COURSE.list[0];
  const start = { x: START.x, z: START.z }, own = COURSE.list[0];
  COURSE.ref ??= nearestFirstLength(start, own.cps, own.finish, courseLegLen);
  const c = randomCourse(randomPool(), start, seededRng(seed), courseLegLen, COURSE.ref);
  return c ? { ...c, seed } : own;   // no fitting draw: course 1
}
function pickCourse() {
  if (courseMode() === 'random') return drawRandomCourse((Math.random() * 4294967296) >>> 0);
  const idx = nextCourseIndex(storedCourseIdx(), COURSE.list.length);
  try { localStorage.setItem(courseIdxKey(), String(idx)); } catch (e) { }
  return { ...COURSE.list[idx], idx };
}
function peekCourse() { return courseMode() === 'random' ? null : COURSE.list[nextCourseIndex(storedCourseIdx(), COURSE.list.length)]; }
function courseFromWire(w) {
  if (w.seed !== undefined) return drawRandomCourse(w.seed);
  const idx = COURSE.list[w.course] ? w.course : 0;
  return { ...COURSE.list[idx], idx };
}
function loadBest(key) { if (!key) return null; try { const b = localStorage.getItem(key); return b ? +b : null; } catch (e) { return null; } }
function applyCourse(course) {
  const snap = (c) => { const [x, z] = snapRoad(c.x, c.z); return { n: c.n, x, z }; };
  CPS = course.cps.map(snap); FINISH = snap(course.finish);
  CPS.forEach((c, i) => cpObjs[i].g.position.set(c.x, groundH(c.x, c.z), c.z));
  finishG.position.set(FINISH.x, groundH(FINISH.x, FINISH.z), FINISH.z);
  COURSE.cur = course;
  R.best = loadBest(courseBestKey(REGION.bestKey, course.id)); R.blitzBest = loadBest(courseBestKey('mm.blitzBest', course.id));
}
const courseShown = () => COURSE.list.length > 1 || courseMode() === 'random';   // a one-course world in turn mode looks as it did
function toastCourse() { if (courseShown()) toastHtml(tr('courseToast', esc(tr(COURSE.cur.key)), esc(COURSE.cur.finish.n)), TOAST_S.event); }
```

Check while placing it: `eraRoads`, `streetEntries`, `buildGraph`, `snapToGraph`, `findRoute`, `seededRng`,
`esc` and `toastHtml` are all in scope there (imports at `index.html:1121`, `1176`). `REGION.id` is the region's
id (`regions.js`, `generatedRegion` gives `world:<id>`). `R` is declared at `index.html:6497`; if the block sits
above it, move only `applyCourse`'s `R.best` lines' caller order, not `R` itself (applyCourse is only called from
`startRace`, so it runs after `R` exists).

- [ ] **Step 3: Use it in `startRace` and `restartRace`**

`startRace` (`index.html:6534`): change the signature and apply the course right after `R.mode = mode;`:

```js
function startRace(mode = 'trial', rng = Math.random, course = hasCheckpoints(mode) && COURSE.list.length ? pickCourse() : null) { endDelivery(); DEL.last = null; ... if (RACELESS && mode !== 'cruise') mode = 'hunt'; R.mode = mode; if (course && hasCheckpoints(mode)) applyCourse(course);   /* #1117 */ ...
```

and at its end, after `updatePips();`: `if (course && hasCheckpoints(mode)) toastCourse();`.

`restartRace` (`index.html:8167`): `startRace(R.mode, Math.random, COURSE.cur);` (Restart keeps the course, spec A9).

- [ ] **Step 4: Best time and result per course**

In `finish()` (`index.html:6646`) replace the two `localStorage.setItem` calls and the record logic so a course
without a key never records:

```js
const bestKey = courseBestKey(R.mode === 'blitz' ? 'mm.blitzBest' : REGION.bestKey, COURSE.cur?.id ?? 'classic');
```

- Blitz branch: `if (bestKey && clean && blitzNewBest(R.blitzBest, R.left)) { ...; localStorage.setItem(bestKey, String(R.left)); }`
- trial branch: `if (bestKey && clean && (R.best === null || t < R.best)) { ...; localStorage.setItem(bestKey, String(t)); }`

In `resultHtml` (`index.html:6672`) the trial line ends with
`${COURSE.cur?.id === 'random' ? tr('courseNoBest') : `${tr('bestLower')} ${fmt(R.best)}`}` and the blitz line's
`tr('blitzBest', …)` part likewise becomes `tr('courseNoBest')` on a random course.

- [ ] **Step 5: The course name before the start and the finished text**

`modeText` (`index.html:6677`): for `trial`

```js
function courseIntro() { const next = peekCourse(); if (!next) return tr('introCourseRandom'); return next.id === 'classic' ? tr(REGION.strings.intro) : tr('introCourse', tr(next.key), next.finish.n); }
function courseFinished() { return !COURSE.cur || COURSE.cur.id === 'classic' ? tr(REGION.strings.finished) : tr('finishedCourse', COURSE.cur.finish.n); }
```

```js
function courseNextText() { const next = peekCourse(); return next ? tr('courseNext', tr(next.key)) : tr('courseNextRandom'); }
```

and in `modeText`: the `REGION.strings.finished` branch returns `courseFinished()`, followed by
`' ' + courseNextText()` when `courseShown()` (so the result screen names the course the "Again" button starts);
the `blitzFinishedText` branch gets the same suffix; a not-done `trial` returns `courseIntro()` when
`courseShown()` (otherwise `modeTextKey` as today). On a one-course world nothing changes
(`tests/test_i18n.py:208` still reads "Münsterplatz erreicht" first).

- [ ] **Step 6: Test hook**

Next to `window.__mm.finishNow` (`index.html:8505`):

```js
window.__mm.course = () => ({ id: COURSE.cur?.id ?? null, seed: COURSE.cur?.seed ?? null, idx: COURSE.cur?.idx ?? null, mode: courseMode(), cps: CPS.map((c) => [c.x, c.z]), finish: [FINISH.x, FINISH.z], ids: COURSE.list.map((c) => c.id) });   // #1117
```

- [ ] **Step 7: Run the node suite and commit**

Run: `node --test tests/` (all pure tests, a few seconds).
Expected: PASS.

```bash
git add index.html
git commit -m "feat(race): each new race takes the next course (#1117)"
```

### Task 6: settings switch and multiplayer wiring

**Files:**
- Modify: `index.html` (settings HTML 890-930, `renderSettings` 6909, handlers ~6925, `$('mprace')` 7924,
  `netRematch` 7843, `netGuestMessage` 7347, `netStartSession` 7593)

- [ ] **Step 1: Settings row**

Add a third section after the Display section (`index.html:921`, before `</div>` of `#settingspanels`):

```html
    <!-- #1117: the race course -- the five courses in turn, or a random one -->
    <section class="st-sec"><h2 data-i18n="setRace">Race</h2>
      <div class="st-row"><span class="st-label" id="setcourselabel" data-i18n="setCourse">Course</span>
        <select id="setcourse" class="btn small" aria-labelledby="setcourselabel"></select>
        <p class="st-cap" data-i18n="setCourseCap">every new race takes the next course, or one drawn at random</p></div>
    </section>
```

In `renderSettings` (rebuilt each time so the labels follow the language, like `setstation`):

```js
  const sc = $('setcourse'); sc.replaceChildren(new Option(tr('setCourseTurn'), 'turn'), new Option(tr('setCourseRandom'), 'random')); sc.value = courseMode();   // #1117
```

Handler next to `setstation`'s:

```js
$('setcourse').onchange = (e) => { try { localStorage.setItem(COURSE_STORE.mode, e.target.value); } catch (e2) { } renderSettings(); revertModeText(); };   // #1117
```

Extend `window.__mm.settings` with `course: courseMode()`.

- [ ] **Step 2: The host sends the course**

```js
const courseWire = (c) => (c.id === 'random' ? { seed: c.seed } : { course: c.idx ?? 0 });   // #1117
```

`$('mprace').onclick` and `netRematch`: pick before broadcasting and pass the pick to the own session:

```js
  const course = pickCourse(), now = performance.now(), t0 = now + RACE.countdown;
  NET.link.broadcast({ type: 'start', mode: 'race', t0, now, ...courseWire(course) });
  netStartSession('race', t0, course);
```

`netStartSession(mode = 'cruise', t0 = null, course = null)`: `startRace(race ? 'trial' : 'cruise', Math.random, race ? course ?? COURSE.list[0] : null);`.
Guest (`netGuestMessage`, the `start` branch): `netStartSession(msg.mode, msg.t0 ?? null, msg.mode === 'race' ? courseFromWire(msg) : null);`.
`createRace(NET.lobby, CPS.length)` stays after `startRace`, so it counts the new course's checkpoints.

- [ ] **Step 3: Run the node suite and commit**

Run: `node --test tests/`
Expected: PASS.

```bash
git add index.html
git commit -m "feat(race): course switch in the settings, the host sends the course (#1117)"
```

### Task 7: browser test

**Files:**
- Create: `tests/test_race_courses.py`

- [ ] **Step 1: Write the test**

```python
"""#1117: a new race takes the next course, Restart keeps it, best times are per course, the settings switch draws
a random course, and both multiplayer devices race the host's course. Real OSM world (the extra courses exist
only there). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from conftest import start_ready
from test_multiplayer_cruise import pair_world_fixture, ready_both  # noqa: F401  (fixture)
from test_multiplayer_lobby import connect

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
T = 120000


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="de-CH").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(start_ready(), timeout=600000)
    return b, page, errors


def course(page):
    return page.evaluate("() => window.__mm.course()")


def race_again(page):
    page.evaluate("() => window.__mm.finishNow()")
    page.wait_for_selector("#overlay:not([hidden])", timeout=T)
    page.click("#startbtn")
    page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)


def test_rotation_restart_and_best_per_course(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        assert course(page)["ids"] == ["classic", "eiken", "twoBridges", "mumpf", "bergsee"]
        page.hover("#startbtn")                                             # the slot shows the hovered mode's text
        assert page.text_content("#ovtext").startswith("Sisseln")           # course 1 keeps the region intro
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        first = course(page)
        assert first["id"] == "classic"
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_selector("#overlay:not([hidden])", timeout=T)
        page.hover("#startbtn")
        assert page.text_content("#ovtext").startswith("Münsterplatz erreicht")   # course 1's own finished text
        assert "Strecke «Eiken»" in page.text_content("#ovtext")             # the next course's name before the start
        page.click("#startbtn")
        page.wait_for_function("() => window.__mm.course().id === 'eiken'", timeout=T)
        second = course(page)
        assert second["cps"] != first["cps"] and second["finish"] != first["finish"]
        assert "Eiken" in page.inner_html("#toast")
        page.click("#pausebtn")
        page.click("#pauserestart")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        assert course(page)["id"] == "eiken"                                # Restart keeps the course
        for want in ["twoBridges", "mumpf", "bergsee", "classic"]:
            race_again(page)
            assert course(page)["id"] == want
        stored = page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('mm.best2'))")
        assert "mm.best2" in stored and "mm.best2.eiken" in stored         # best times per course, course 1 under today's key
        page.reload()
        page.wait_for_function(start_ready(), timeout=600000)
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        assert course(page)["id"] == "eiken"                                # the rotation survives a reload
        b.close()
    assert errors == []


def test_random_switch_draws_a_seeded_course_without_best(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        page.click("#settingsbtn")
        page.select_option("#setcourse", "random")
        page.click("#settingsback")
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        c = course(page)
        assert c["id"] == "random" and isinstance(c["seed"], int) and len(c["cps"]) == 5
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_selector("#overlay:not([hidden])", timeout=T)
        assert "keine Bestzeit" in page.text_content("#result")
        b.close()
    assert errors == []


def test_multiplayer_guest_races_the_host_course(pair_world):
    host, guest, errors = pair_world
    host.evaluate("() => localStorage.setItem('mm.courseIdx.hochrhein', '0')")   # the host's next course is Eiken
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race", timeout=T)
    h, g = course(host), course(guest)
    assert h["id"] == g["id"] == "eiken"
    assert h["cps"] == g["cps"] and h["finish"] == g["finish"]
    assert errors == []
```

If `#pauserestart`, `#pausebtn` or the `#toast` read need a different wait in practice (the toast fades), read the
toast right after the start or assert on `window.__mm.course()` only; keep the assertions, adjust the waits.

- [ ] **Step 2: Run it and the directly affected browser tests, in the foreground**

Run: `python3 -m pytest tests/test_race_courses.py tests/test_i18n.py -k "course or result_screen" -x -q`
Then: `python3 -m pytest tests/test_multiplayer_race_start.py tests/test_multiplayer_lobby.py tests/test_record.py tests/test_blitz.py -x -q`
Expected: PASS. Do not run the full suite (~2 h).

- [ ] **Step 3: Commit and push**

```bash
git add tests/test_race_courses.py
git commit -m "test(race): rotation, random switch and the host's course in multiplayer (#1117)"
git push
```

### Task 8: changelog

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]`, `### Added`; create the heading if missing, above `### Changed`)

- [ ] **Step 1: Add the entry** (timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`)

```markdown
- `YYYY-MM-DD HH:MM` Jedes neue **Rennen** fährt eine andere **Strecke**: fünf Strecken im Wechsel, vom **Klassiker** bis zum **Bergsee**, und in den **Einstellungen** auf Wunsch eine **zufällige**. Die Bestzeit zählt pro Strecke, und im Mehrspieler-Rennen fahren alle die Strecke des Gastgebers.
```

- [ ] **Step 2: Commit and push**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): race courses that change from race to race (#1117)"
git push
```
