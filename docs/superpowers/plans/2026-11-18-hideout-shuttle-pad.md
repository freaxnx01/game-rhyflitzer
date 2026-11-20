# Space Shuttle on its launch pad in the Artemis II room (#622) Implementation Plan

**Goal:** star room 2 of the hideout (ring 1) holds, besides the Artemis II stack and the Orion capsule, the Space
Shuttle stack on its launch pad (the pad of #811, reused unchanged): Artemis moves to room-frame `(0, +100)`, the pad
stands at `(−20, −110)` turned 45°; everything is solid, the car drives on gravel round Artemis and the capsule and
through the flame trench under the rocket; nothing is downloaded; the spoke stays unsigned.

**Spec:** `docs/superpowers/specs/2026-11-18-hideout-shuttle-pad-design.md` (numbers, placement, assumptions).

**Architecture:** no new file. `rooms.js` gets `spots` and `second` on `ROOMS[2]` and passes shifted centres to the
unchanged `artemisPlacement` / `shuttlePlacement`; room 2 gets its own gravel set instead of the 95 m loop;
`index.html` builds the Artemis meshes at the rocket's spot and calls `roomShuttle` for room 2 as well.

**Deadline:** merged Monday evening 2026-11-23, live Tuesday 2026-11-24 15:15. One pipeline run; cut the look, never
the colliders or the tests.

**Global constraints:**

- Buildless browser game: no `package.json`, no new dependencies, no framework, `const`/`let` only. No model file, no
  `CREDITS.md`, README, licence or `strings.js` change. Do not touch `shuttle.js`, `shuttlemesh.js`, `artemis.js`,
  `artemismesh.js`.
- TDD: write the failing test, run it red, implement, run green. Never edit a test to make it pass — the test
  rewrites below *are* the specified change and come first.
- Node tests: `node --test tests/rooms.test.mjs` per task; at the end `node --test tests/*.test.mjs` (all green).
- Browser test: run **only** `pytest tests/test_hideout.py -k artemis_room`, in the **foreground**, never
  `run_in_background`, generous `timeout`. Never the full Playwright suite. Commit and push the branch **before**
  starting the Playwright run.
- `CHANGELOG.md`: one hand-written, player-facing entry under `[Unreleased]` → `### Added` (Task 5). Never run
  `git cliff -o`.
- Commit per task (Conventional Commits, scope `hideout`, footer `Refs #622`; the last commit `Closes #622`);
  commit and push after every task; open a draft PR after the first task. Branch `feature/622-shuttle-pad`.
- Imports already present in `tests/rooms.test.mjs`: `ARTEMIS` (line 243), `SHUTTLE, stackFrame, padLayout` (line
  395). ES imports are hoisted: use them above their line, do **not** import them a second time.

Files: changed `rooms.js`, `index.html`, `tests/rooms.test.mjs`, `tests/test_hideout.py`, `CHANGELOG.md`.

---

### Task 1: the two spots on room 2 (`rooms.js`: `ROOMS[2]`, `roomLayout`)

**Files:** `tests/rooms.test.mjs` (rewrite the first room-2 test at lines 245-251, adjust line 402), `rooms.js` (`ROOMS[2]` at line 25, placement lines 152 and 158, return at line 191, header comment).

**Failing tests** (replace `roomLayout_Room2HoldsTheArtemisStackOnTheCentre_AndTheCapsuleBesideIt_UnsignedLikeTheOthers`;
and in the ring-2 test change `for (const R of [...rooms, ...rooms2].filter(r => r !== shuttleRoom)) assert.equal(R.shuttle, null);`
to `.filter(r => r !== shuttleRoom && r !== artemis)`):

```js
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
test('roomLayout_Room2_ArtemisMovesAside_TheShuttlePadStandsOnTheOtherSide_NextRoomsUnchanged', () => {
  assert.equal(ROOMS[2].object, ARTEMIS); assert.equal(ROOMS[2].second, SHUTTLE); assert.equal(ROOMS[2].signed, false);
  assert.deepEqual(ROOMS[2].spots, { artemis: [0, 100], second: [-20, -110] });
  assert.deepEqual(NEXT_ROOMS, [7, 2, 6, 3, 5, 4]);
  assert.deepEqual([artemis.tower.x, artemis.tower.z], artemis.centre); assert.deepEqual(artemis.feet, []); assert.equal(artemis.hull.length, 0); assert.equal(artemis.basin, null);
  assert.ok(near([artemis.artemis.rocket.x, artemis.artemis.rocket.z], toWorld(artemis, 0, 100)), 'Artemis at b = +100');
  assert.ok(near([artemis.artemis.capsule.x, artemis.artemis.capsule.z], toWorld(artemis, ARTEMIS.capsule.at[0], 100 + ARTEMIS.capsule.at[1])), 'the capsule keeps its offset from the stack');
  assert.ok(near([artemis.shuttle.stack.x, artemis.shuttle.stack.z], toWorld(artemis, -20, -110)), 'the pad at (-20, -110)');
  const d = artemis.shuttle.stack.th - Math.atan2(artemis.frame.f[1], artemis.frame.f[0]); assert.ok(Math.abs(Math.atan2(Math.sin(d), Math.cos(d)) - SHUTTLE.turn) < 1e-6, 'turned 45 degrees');
  assert.equal(artemis.shuttle.colliders.length, 11); assert.equal(artemis.artemis.colliders.length, 5);
  assert.ok(artemis.towerView && !blocked(artemis, artemis.towerView.x, artemis.towerView.z));
  for (const R of rooms.filter(r => r.k !== 2)) { assert.equal(R.artemis, null); assert.equal(R.shuttle, null); }
});
```

Run `node --test tests/rooms.test.mjs` → red (`ROOMS[2].second` is `undefined`).

**Implementation:** in `rooms.js`, `ROOMS[2]` gets `second: SHUTTLE, spots: { artemis: [0, 100], second: [-20, -110] }` (comment `// #622: the Space Shuttle pad on the left, Artemis II and the Orion capsule moved aside to the right`).
In `roomLayout`, one small helper above the placements: `const spot = (name) => (room.spots && room.spots[name]) ? loc(...room.spots[name]) : centre;`.
Line 152: pass `centre: spot('artemis')` to `artemisPlacement`. Line 158: the shuttle branch is
`const shuttleObject = room.object && room.object.orbiter ? room.object : room.second;` then
`const shuttle = (shuttleObject && shuttleObject.orbiter) ? shuttlePlacement({ centre: spot('second'), frame: { f, v }, y: Y }, shuttleObject) : null;`
(ring 2 room 7 has no `spots`, so `spot('second')` is its centre as before). Update the header comment of `rooms.js`
(Artemis II room also holds the Shuttle pad). `NEXT_ROOMS` stays.

Run `node --test tests/rooms.test.mjs`: the new test is green; the three old room-2 tests (lines 253-267) are
still red on purpose — they are rewritten in Task 2. Commit `feat(hideout): room 2 holds the Shuttle pad, Artemis II moves aside (#622)`; push; open the draft PR.

### Task 2: solid objects and the gravel of room 2 (`rooms.js`: paths)

**Files:** `tests/rooms.test.mjs` (replace the two tests at lines 253-267), `rooms.js` (lines 179-182).

**Failing tests** (replace `roomLayout_Room2_MountCoreAndCapsuleAreSolid_…` and `roomLayout_Room2_ThreePaths_…`):

```js
const onPad = (R, a, b) => { const { x: X, z: Z } = stackFrame(R.frame.f, R.frame.v, SHUTTLE.turn), [sx, sz] = toWorld(R, -20, -110); return [sx + X[0] * a + Z[0] * b, sz + X[1] * a + Z[1] * b]; };
test('roomLayout_Room2_BothObjectsAreSolid_TheTrenchTheLawnBetweenAndTheOldCentreAreFree', () => {
  const D = ARTEMIS.deck.w / 2, C = ARTEMIS.capsule, H = SHUTTLE.pad.hard, L = padLayout(SHUTTLE);
  assert.ok(blocked(artemis, ...toWorld(artemis, 0, 100)), 'the Artemis core'); assert.ok(blocked(artemis, ...toWorld(artemis, 0, 100 + D - 1)), 'the mount edge');
  assert.ok(blocked(artemis, ...toWorld(artemis, C.at[0], 100 + C.at[1])), 'the capsule');
  for (const [a, b] of [[23, -19], [-20, 30], [L.fss.x, L.fss.z], [L.water.x, L.water.z]]) assert.ok(blocked(artemis, ...onPad(artemis, a, b)), `the hardstand / tower / water at ${a},${b}`);
  for (let b = -H.d / 2 - 10; b <= H.d / 2 + 10; b += 5) assert.ok(!blocked(artemis, ...onPad(artemis, 0, b)), `the trench is open at ${b}, right under the rocket`);
  assert.ok(!blocked(artemis, ...artemis.centre), 'the old centre is free lawn');
  for (const [a, b] of [[0, 100 + D + CAR_R + 2], [-D - CAR_R - 2, 100], [-30, 20], [0, 30], [50, -20]]) assert.ok(!blocked(artemis, ...toWorld(artemis, a, b)), `free at ${a},${b}`);
});

test('roomLayout_Room2_FivePaths_AllDrivable_AndTheCarReachesTheTrenchBothArtemisSidesAndTheCapsule', () => {
  assert.equal(artemis.paths.length, 5);
  const [entry, trench, ring, way, capRing] = artemis.paths;
  assert.ok(near(entry.pts[1], toWorld(artemis, -95, 0)), 'the entry ends at the junction');
  assert.ok(near(trench.pts[0], toWorld(artemis, -95, 0)) && near(trench.pts[1], onPad(artemis, 0, 60)) && near(trench.pts[2], onPad(artemis, 0, -60)), 'junction, near mouth, far mouth');
  assert.equal(ring.pts.length, 33); for (const [x, z] of ring.pts) assert.ok(Math.abs(Math.hypot(x - artemis.artemis.rocket.x, z - artemis.artemis.rocket.z) - 45) < 1e-6);
  assert.ok(near(way.pts[0], toWorld(artemis, -95, 0)) && near(way.pts[1], toWorld(artemis, -45, 100)));
  assert.equal(capRing.hw, ARTEMIS.capsule.ring.hw); assert.equal(capRing.pts.length, 33);
  for (const p of artemis.paths) for (const [x, z] of p.pts) assert.ok(!blocked(artemis, x, z), 'every path point is drivable');
  const r = reach(artemis), cell = (a, b) => r.seen.has(Math.round(a / r.step) + ',' + Math.round(b / r.step));
  assert.ok(cell(...toLocal(artemis, ...onPad(artemis, 0, 60))) && cell(...toLocal(artemis, ...onPad(artemis, 0, 0))) && cell(...toLocal(artemis, ...onPad(artemis, 0, -60))), 'both trench mouths and the middle');
  assert.ok(!cell(0, 100), 'the Artemis core is solid');
  assert.ok(cell(0, 100 + 16) && cell(0, 100 - 16) && cell(16, 100) && cell(-16, 100), 'all round the Artemis mount');
  const [ca, cb] = ARTEMIS.capsule.at; assert.ok(cell(ca - 12, 100 + cb) && cell(ca + 12, 100 + cb) && cell(ca, 100 + cb + 12) && cell(ca, 100 + cb - 12), 'all round the capsule'); assert.ok(r.seen.size > 4000);
});
```

`toLocal` is defined at line 13 of the test file. Run → red (`paths.length` is 3).

**Implementation:** in `rooms.js` lines 179-182: when `room.spots` is set the generic 95 m loop is not used —
`paths = [{ pts: [start, end], hw: 4 }]` with `end = at(HALF - 95, 0)` as today (`(−95, 0)`), then push, in this order:
the trench way `[end, trenchMouth(+60), trenchMouth(−60)]` (stack-frame points `(0, ±60)` on the pad's spot, via
`stackFrame(f, v, shuttleObject.turn)` — the way is `shuttle`-driven, so build it next to the shuttle placement and keep it a pure
list of points), the Artemis ring (33-point circle, radius 45 round the rocket's spot, `hw` 4), the way
`[end, loc(-45, 100)]`, and finally the existing capsule ring (`artemis.ring`, `hw` `room.object.capsule.ring.hw`).
Keep functions small: one helper `spotPaths(...)` returning those four extra paths. A room without `spots` keeps its
paths exactly as today (rooms 0, 1, 3, 5, 6, 7 — their tests must stay green unchanged).

Run `node --test tests/rooms.test.mjs` → green, then `node --test tests/*.test.mjs` → green. Commit `feat(hideout): gravel to the trench, Artemis and the capsule in room 2 (#622)`; push.

### Task 3: build both in room 2 (`index.html`)

**Files:** `index.html` (`roomArtemis` at lines 4040-4046, nothing else if `roomMeshes` already calls both).

No node test applies (three.js scene code; verified by Task 4). `roomMeshes` (line 4003) calls `roomShuttle` when
`R.shuttle` is set, and room 2 now has one — no change there. In `roomArtemis` replace `const A = R.artemis, [cx, cz] = R.centre, y = R.y, a = R.portal.th;`
by `const A = R.artemis, { x: cx, z: cz } = A.rocket, y = R.y, a = R.portal.th;` so the slab and the mount follow the
rocket (`orientedBox(..., cx, cz, ...)` already uses them); the capsule already uses `A.capsule`. Update the
`roomArtemis` / `roomShuttle` comments (both stand in room 2). `__mm.artemis()` and `__mm.shuttle()` need no change.

Verify: `node --test tests/*.test.mjs` still green; load `python3 -m http.server 8000` and check by eye is **not**
needed here — Task 4 does it. Commit `feat(hideout): build the Shuttle pad and Artemis at their spots in room 2 (#622)`; push.

### Task 4: the browser test (`tests/test_hideout.py`, one test)

**Files:** `tests/test_hideout.py` (`test_artemis_room_builds_the_rocket_and_capsule_on_entering_without_a_download`, lines 1211-1236).

Change the existing test, same name (the spec's "targeted Playwright test"):

```python
        s = page.evaluate("() => window.__mm.shuttle()")
        push = page.evaluate("""() => { const t = window.__mm.below().tower, th = window.__mm.spoke(2, 0).th, f = [Math.cos(th), Math.sin(th)], v = [-f[1], f[0]], p = (a, b) => window.__mm.pushAt(t.x + f[0] * a + v[0] * b, t.z + f[1] * a + v[1] * b, -600);
          const c = window.__mm.artemis().capsule, st = window.__mm.shuttle().stack, x = [Math.cos(st.th), Math.sin(st.th)], z = [-x[1], x[0]], q = (a, b) => window.__mm.pushAt(st.x + x[0] * a + z[0] * b, st.z + x[1] * a + z[1] * b, -600);
          return { core: p(0, 100), mount: p(0, 111), beside: p(0, 130), capsule: window.__mm.pushAt(c.x, c.z, -600), ring: p(-50, 156), hardstand: q(23, -19), tower: q(-31.5, 6), trench: q(0, 0), oldCentre: p(0, 0) }; }""")
```

and the final assertions become: `a["built"] == 2 and a["colliders"] == 5` (rocket spot within 1e-6 of
`tower + f·0 + v·100` is covered by the Node test), `s["built"] == 2 and s["colliders"] == 11 and 3000 <= s["tris"] <= 60000 and s["look"] == "meadow" and s["lawn"] is True`,
`all(hypot(push[k]) > 0.5 for k in ("core", "mount", "capsule", "hardstand", "tower"))` and
`all(hypot(push[k]) < 0.01 for k in ("beside", "ring", "trench", "oldCentre"))`. The screenshot camera stays at
`towerView` (both objects in view); take one more at `a = −160` for the portal view. The existing `.glb` assertion stays.

Push first (Task 3's commit is pushed), then run in the **foreground**: `pytest tests/test_hideout.py -k artemis_room`
with `timeout` 600000. Fix the code, never the probes' meaning. Commit `test(hideout): room 2 browser test covers both objects (#622)`; push.

### Task 5: the CHANGELOG entry

**Files:** `CHANGELOG.md`.

Get the time with `TZ=Europe/Zurich date '+%F %H:%M'` and add one line at the top of `[Unreleased]` → `### Added`
(newest first, keys in `<kbd>`, 1–3 bold keywords):

```markdown
- `<YYYY-MM-DD HH:MM>` The **Artemis II room** now also holds a **Space Shuttle on its launch pad**, life size: the orbiter on its orange tank between the two boosters, on the platform over the **flame trench** (drive through it, right under the rocket), with the tower, its arms, the swung-back service structure and the water tower. **Artemis II** and the **Orion capsule** moved aside to the other side of the room; gravel leads to the trench, round the rocket and round the capsule.
```

Verify: `node --test tests/*.test.mjs` green; `git diff --stat` shows only `rooms.js`, `index.html`, the two test files and
`CHANGELOG.md`. Commit `docs(changelog): Space Shuttle pad in the Artemis II room (#622)` with the footer `Closes #622`; push. In the PR
description: RED/GREEN evidence per task, the Playwright result and the screenshot path.
