# Race courses that change from race to race (#1117)

## Intent

Every race today runs the same five checkpoints and the same finish: `CPS` / `FINISH` come from the region
(`index.html:1948-1957`, OSM world: `L.anchors.cps` / `L.anchors.finish` from `pipeline/anchors.json`). A tester
asked on 2026-11-20 that a new race should not always be the same course.

The Hochrhein region gets **five fixed courses** that take turns, one per new race, plus a settings switch for a
**random** course drawn from the region's landmarks. Both single-player race modes and the multiplayer race use it.
Every device in a multiplayer race drives the same course: the host picks it and sends it in the `start` message.

## Decisions (maintainer, 2026-11-27)

- **Fixed rotation + random:** five fixed, hand-picked courses (checkpoints + finish) that rotate in turn, one per
  new race; plus a random option.
- **Random is a settings switch:** "Strecke: Im Wechsel / Zufällig" in the settings dialog. Im Wechsel = the five
  courses in order. Zufällig = checkpoints and finish drawn from a pool (landmarks / jump targets), with a seed so
  every device in a multiplayer race gets the same course.
- **Modes:** single-player race and multiplayer race. In multiplayer the host picks the course and sends it.
- **No course menu:** the next course comes automatically; its name is shown before the start.
- **Course list:** proposed here (table below), today's course stays course 1. The maintainer confirms the list
  before dispatch.

## The five Hochrhein courses (proposal, to be confirmed)

All start at today's start (`anchors.json` `start`, the Hallenbad Sissila, game `[1882.9, -292.2]`). Checkpoints can
be driven in any order (`stepRace` targets the nearest open one, `index.html:6542`); the length is the A* route
(`route.js` `findRoute`, today's roads) from the start through the checkpoints in that nearest-first order, then to
the finish. Measured 2026-11-27 with a data probe against `data/world_hochrhein.json`.

| # | Name (de / en) | Checkpoints | Finish | Approx. length |
|---|---|---|---|---|
| 1 | Klassiker / Classic | Bahnhof Sisseln, Sisslerfeld, GETEC Park Stein, Stein Dorf, Bahnhof Stein-Säckingen | Münsterplatz Bad Säckingen | 13.3 km |
| 2 | Eiken / Eiken | LANDI-Turm, Bahnhof Eiken, Güggeli-Foodtruck, Plattform Sisslerfeld, Reformierte Kirche Stein | Gallusturm | 12.2 km |
| 3 | Zwei Brücken / Two Bridges | Smile-Kreisel, Sisslerfeld, GETEC Park Stein, Gallusturm, Reformierte Kirche Stein | Schloss Schönau | 12.8 km |
| 4 | Mumpf / Mumpf | Smile-Kreisel, Plattform Sisslerfeld, Stein Dorf, Bahnhof Stein-Säckingen, Dorfzentrum Mumpf | Bahnhof Bad Säckingen | 13.5 km |
| 5 | Bergsee / Bergsee | Straussenfarm Sisseln, Bahnhof Sisseln, Plattform Sisslerfeld, Stein Dorf, Aqualon Therme | Bergsee | 12.1 km |

Game coordinates (x, z) of every point, the source the implementation copies verbatim:

| Point | x | z | Source |
|---|---|---|---|
| Bahnhof Sisseln | 1938.5 | 530.4 | `anchors.json` cps[0] |
| Sisslerfeld | 88.9 | 406.4 | `anchors.json` cps[1] |
| GETEC Park Stein | -563.9 | -431.8 | `anchors.json` cps[2] |
| Stein Dorf | -934.7 | 520.7 | `anchors.json` cps[3] |
| Bahnhof Stein-Säckingen | -1368.2 | 988.3 | `anchors.json` cps[4] |
| LANDI-Turm | 1832.7 | 627.7 | landmark `landiTurm` |
| Bahnhof Eiken | 1709.8 | 1936.5 | building 199241726 centroid |
| Güggeli-Foodtruck | 1921.6 | 2249.8 | landmark `foodTruck` |
| Plattform Sisslerfeld | 330.0 | 418.6 | J landing (`landmarks.js` `jump`) |
| Reformierte Kirche Stein | -1178.0 | 795.9 | `landmarks.js` `at` |
| Gallusturm | -1254.8 | -408.5 | building 25835477 centroid |
| Schloss Schönau | -1378.0 | -5.6 | building 390621357 centroid |
| Smile-Kreisel | 1270.0 | -148.0 | landmark `smileKreisel` |
| Dorfzentrum Mumpf | -3484.8 | 596.6 | `landmarks.js` `at` |
| Bahnhof Bad Säckingen | -1381.9 | -558.6 | building 25049518 centroid |
| Straussenfarm Sisseln | 2345.0 | -318.0 | `landmarks.js` `at` |
| Aqualon Therme | -1996.1 | -1083.2 | building 92039355 centroid |
| Bergsee | -2281.8 | -2179.9 | J landing (`landmarks.js` `jump`, Am Bergsee) |

Checks on the proposal (data probe, no browser):

- Every leg has an A* route on today's road graph.
- Every point lies within 60 m of a drivable road (graph snap 0-56 m), so `snapRoad` (`index.html:1953`) puts it
  on the road as it does for course 1.
- Points are at least 378 m apart within a course (the pipeline's own race uses 300 m, `pipeline/race.py:20`).
- No point is a `modern` landmark (DSM-Kamin, Volg, Kirche Bruder Klaus and the Fahrzeug-Depot were left out), so
  each landmark the checkpoint names also stands in the 1952 layer.
- Lengths 12.1-13.5 km against 13.3 km for course 1.

## What changes

### New pure module `courses.js`

No DOM, no three.js (like `route.js`, `settings.js`), so `node --test` imports it.

- `HOCHRHEIN_COURSES`: courses 2-5 as `{ id, key, cps: [{ n, x, z }] × 5, finish: { n, x, z } }`, coordinates from
  the table above. `key` is the strings.js key of the course name.
- `courseList(regionId, osm, cps, finish)`: `[]` when `cps` is empty (a raceless world); otherwise the region's own
  course as `{ id: 'classic', key: 'courseClassic', cps, finish }`, followed by `HOCHRHEIN_COURSES` only when
  `regionId === 'hochrhein'` and the OSM world is loaded (`osm`). The hand fallback world (`L` null) uses other
  coordinates (`W()`), so it keeps course 1 only.
- `COURSE_STORE = { mode: 'mm.courseMode', idx: 'mm.courseIdx' }` and `courseModeFrom(stored)` ('random' or
  'turn', default 'turn').
- `nextCourseIndex(stored, count)`: the index after the stored one, wrapping; 0 when nothing valid is stored.
- `courseBestKey(baseKey, id)`: `baseKey` for `classic` (today's best times stay course 1's), `${baseKey}.${id}`
  for the other fixed courses, `null` for `random`.
- `nearestFirstLength(start, cps, finish, legLen)`: the course length in the order the arrow guides (nearest open
  checkpoint first, then the finish), with an injected `legLen(a, b)`.
- `randomCourse(pool, start, rng, legLen, ref)`: deterministic for a given pool order and `rng`. Shuffles the pool
  (Fisher-Yates with `rng`), takes the first six points that lie within `RANDOM.radius` of the start and at least
  `RANDOM.minGap` apart; five checkpoints and the last as finish. Accepted when its `nearestFirstLength` lies within
  `[RANDOM.lo × ref, RANDOM.hi × ref]`; otherwise the next shuffle, up to `RANDOM.tries`. Returns
  `{ id: 'random', key: 'courseRandom', cps, finish }` or `null`.
- `RANDOM = { radius: 4000, minGap: 300, lo: 0.75, hi: 1.25, tries: 200 }`.

### Game (`index.html`)

- **State:** `COURSE = { list, cur }`, built after `CPS` / `FINISH` are final (`index.html:1954-1962`).
- **Apply a course:** `applyCourse(course)` sets `CPS` / `FINISH` from the course, through `snapRoad`, moves each
  `cpObjs[i].g` and `finishG` to the new point and ground height, and reloads `R.best` / `R.blitzBest` from
  `courseBestKey`. Every course has five checkpoints, the number `cpObjs` was built with (`index.html:3693`).
- **Pick a course:** `pickCourse()`: in `turn` mode the next index (`nextCourseIndex`), stored per region under
  `mm.courseIdx.<region id>`; in `random` mode a fresh 32-bit seed and `randomCourse(... seededRng(seed) ...)`, falling
  back to course 1 when it returns `null`. `courseFromWire({ course, seed })` resolves the same thing from the
  multiplayer message.
- **When it changes:** `startRace(mode, rng, course)` gets a third parameter. When the mode has checkpoints
  (`hasCheckpoints`, `startscreen.js:34`) and the list is not empty, it applies `course`, which defaults to
  `pickCourse()`. So every new race from the start screen, the result screen, the car selection or the multiplayer
  lobby takes the next course; `restartRace` (pause menu "Restart", `index.html:8167`) passes `COURSE.cur` and
  keeps the course.
- **Random pool:** `JUMP_ENTRIES` (not the era-filtered list) without the ramp, the wreck and the depot entries, at
  their J landing (`j`) where they have one, kept when `snapToGraph` on **today's** road graph finds a road within
  60 m. Leg lengths use A* on today's graph too, whatever the local era layer, and `ref` is course 1's
  `nearestFirstLength` on the same graph. Neither the pool nor the lengths depend on the device state, so the
  seed gives every device the same course.
- **Name before the start:** when the region has more than one course or the switch is on random, the trial's
  start-screen text (`modeText`, `index.html:6677`) introduces the next course instead of the region intro:
  `introCourse(name, finish)` / `introCourseRandom`. Course 1 keeps today's region intro. At the start of every
  race with checkpoints a toast names the course and its finish (`courseToast`).
- **Finished text:** after a non-classic course the result text is `finishedCourse(finish)`; course 1 keeps the
  region's `finishedText`. When the region has more than one course (or random is on), the finished text is followed
  by the next course's name (`courseNext(name)` / `courseNextRandom`), so the result screen names the course its
  "Again" button starts.
- **Best times:** per course (`courseBestKey`). A random course has no best time: `finish()` saves nothing and the
  result shows `courseNoBest` instead of the best line.
- **Settings:** a new section "Race / Rennen" with a row "Course / Strecke" and a `<select>` with "In turn / Im
  Wechsel" and "Random / Zufällig", stored in `mm.courseMode`, like the radio station select
  (`index.html:906-908`).
- **Test hooks:** `__mm.course()` returns `{ id, seed, idx, mode, cps, finish, ids }`.

### Multiplayer (`netcodec.js`, `index.html`)

- The host picks the course with `pickCourse()` when it presses Race (`#mprace`, `index.html:7924`) or Rematch
  (`netRematch`, `index.html:7843`) and adds it to the `start` message: `course: <index>` in turn mode, `seed:
  <u32>` in random mode.
- `parseStart` (`netcodec.js:201`) accepts a race start only with exactly one of `course` (integer
  `0..COURSE_WIRE_MAX`, 7) or `seed` (integer `0..0xFFFFFFFF`), and returns it.
- `netStartSession(mode, t0, wire)` passes the resolved course to `startRace`; the host uses its own pick. A guest
  whose list is shorter than the index (should not happen in the same region) falls back to course 1.
- `CODE_VERSION` 4 → 5 (`netcodec.js:7`): an older build would ignore the field and race course 1 while the host
  races another, so old and new builds must not join each other.

### Strings (`strings.js`, en + de)

`setRace`, `setCourse`, `setCourseTurn`, `setCourseRandom`, `setCourseCap`, `courseClassic`, `courseEiken`,
`courseTwoBridges`, `courseMumpf`, `courseBergsee`, `courseRandom`, `introCourse(name, finish)`,
`introCourseRandom`, `courseToast(name, finish)`, `finishedCourse(finish)`, `courseNext(name)`, `courseNextRandom`,
`courseNoBest`.

## Assumptions

- **A1** [confirmed] Five fixed courses that rotate, plus a random option. Maintainer: "5 feste Strecken und
  zusätzlich Auswahl 'Zufällig'".
- **A2** [confirmed] Random is a settings switch "Strecke: Im Wechsel / Zufällig", the random course drawn from a
  pool with a seed so every multiplayer device gets the same course. Maintainer: "Schalter in den Einstellungen".
- **A3** [confirmed] Single-player race and multiplayer race; in multiplayer the host picks the course and sends
  it. Maintainer: "Rennen + Mehrspieler-Rennen".
- **A4** [confirmed] No course menu; the next course comes automatically and its name is shown before the start.
  Maintainer: "Automatisch, Name anzeigen".
- **A5** [confirmed] The spec proposes the five courses, today's course stays course 1, the maintainer confirms.
  Maintainer: "Ich schlage vor, Du bestätigst".
- **A6** [confirmed] (user 2026-11-27: «Ja, so übernehmen») The five courses in the table above (names, checkpoints, finishes). Rejected: courses through Murg
  or Rothaus on the German side east of Bad Säckingen (25 km: the only Rhine crossings are at Bad Säckingen), and
  courses with `modern` landmarks (they do not stand in 1952). Evidence: data probe 2026-11-27, lengths 12.1-13.5 km
  vs 13.3 km for course 1.
- **A7** [high] All courses share today's start; only checkpoints and finish change. Rejected: a start per course.
  `START` also places the multiplayer grid (`raceGrid`, `index.html:7603`) and the respawn; the issue asks only
  about checkpoints and finish.
- **A8** [high] "Race" means both checkpoint modes, Zeitfahren (`trial`) and Blitz: both read the same `CPS` /
  `FINISH` (`hasCheckpoints`, `startscreen.js:34`). Rejected: Blitz staying on course 1, which would need two sets
  of checkpoint objects.
- **A9** [confirmed] (user 2026-11-27: «Nochmal = nächste Strecke») A new race is any `startRace` that is not the pause menu's Restart: the result screen's "Again"
  button takes the next course, Restart keeps the current one. The "Again" label stays. Rejected: "Again" repeating
  the same course, which would let a player who only presses "Again" never see another course.
- **A10** [high] Best times per course; course 1 keeps today's keys (`mm.best2`, `mm.blitzBest`), so no record
  is lost. Rejected: one best time for all courses (meaningless across different lengths).
- **A11** [confirmed] (user 2026-11-27: «Keine Bestzeit») A random course has no best time and no "new record". Rejected: a best time keyed by seed (each
  seed is raced once). Evidence: `finish()` `index.html:6646` writes one key per mode.
- **A12** [high] The rotation index is stored per region (`mm.courseIdx.<id>`) and survives a reload; a fresh
  profile starts at course 1. Rejected: in-memory only (a reload would always restart at course 1).
- **A13** [high] Random draws from `JUMP_ENTRIES` minus ramp, wreck and depot, within 4 km of the start, 300 m
  apart, length within 75-125 % of course 1. Rejected: no length check (probe: 8.5-45.8 km for 40 seeds without it).
  Evidence: data probe 2026-11-27 (pool of 30, A* 0.5 ms per leg, 40 seeds in 120 ms).
- **A14** [high] The random draw uses today's road graph and the unfiltered entries on every device, so the seed
  alone fixes the course. Rejected: the era-dependent graph (`autoGraph`, `index.html:5249`); the era layer is not
  synced between devices.
- **A15** [high] Multiplayer sends `course` or `seed` in the existing `start` message and bumps `CODE_VERSION` to
  5. Rejected: a separate `course` message (one more message to order against `start`). Evidence: `parseStart`
  `netcodec.js:201`, the #1190 bump `netcodec.js:7`.
- **A16** [high] A world without checkpoints (a generated world without a race, `CPS = []`, `index.html:1961`) has
  no course list; it is raceless (`RACELESS`) and never starts a checkpoint mode. Ehrendingen, a generated world
  with a race and the hand fallback have only course 1 in turn mode; random works wherever the OSM world is loaded.
- **A17** [high] Course 1 keeps the region intro and finished texts; other courses get generic texts that name the
  course and its finish. Rejected: hand-written intros per course (more strings than the change needs).

## Consequences

- Course points snap with `snapRoad`, which honours the local era layer, exactly as course 1 does today: in a
  multiplayer race a host and a guest in different layers can see a checkpoint a few metres apart (unchanged from
  today).
- Props placed at load keep away from course 1's points only (`free`, `index.html:2122`). Course points sit on
  roads, where props are not placed anyway.
- Browser tests that start more than one race in one page now get course 2 on the second race; tests that read
  checkpoints through `__mm` follow automatically.
- A multiplayer invite from an older build (`R4…`) is refused with the version error until both sides reload.
- The Worlds dialog's best line (`bestKeyFor`, `startscreen.js:50`) keeps showing course 1's best time.

## Non-goals

- No course menu and no course editor.
- No new start positions, no change to the checkpoint count (five) or to the Blitz timing.
- No courses for Ehrendingen or generated worlds beyond their own course 1 and the random option.

## Anti-goals

- Losing a stored best time of today's course.
- Two devices in one multiplayer race driving different checkpoints.
- A random course with a checkpoint off the road network or a leg without a route.
