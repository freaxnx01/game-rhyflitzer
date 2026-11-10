# Roundabout exit signal (#680) Implementation Plan

**Goal:** the autopilot signals right when leaving a roundabout, from the previous exit (first exit: from the entry), and not at the entry.

**Architecture:** only `routeSignals` / `ringRuns` in `route.js` change; tests in `tests/route.test.mjs`; one assertion in `tests/test_autopilot.py`. Spec: `docs/superpowers/specs/2026-11-05-roundabout-exit-signal-design.md`.

**Global constraints:** vanilla JS, no new packages. Tests run with `node --test tests/route.test.mjs` only (no full suite, no Playwright run except the single test named in Task 3). CHANGELOG entry in player voice.

## Task 1: failing tests (TDD)

**Files:** `tests/route.test.mjs`

- [ ] Replace the test `routeSignals_RoundaboutExit_SideFollowsTheRingDirection` (`:181-185`) and adjust `routeSignals_RouteThroughRoundabout_BlinksOnlyAtTheExit` (`:170`, change `assert.equal(blinkerAt(sigs, 100), null, 'not at the entry')` to `assert.equal(blinkerAt(sigs, 99), null, 'not before the entry')` and drop nothing else).
- [ ] Add a counter-clockwise ring helper and the new tests after `roundaboutRoute`:

```js
// a counter-clockwise ring (Rechtsverkehr: angle decreases on the x-east / z-south map), entered from the east arm,
// left after `exitNo` quarter turns; joints at the three arm vertices like a real graph route
const ccwPt = (k) => { const a = -k / 32 * Math.PI * 2; return [Math.round(Math.cos(a) * 12000) / 1000, Math.round(Math.sin(a) * 12000) / 1000]; };
const CCW_RING = road(Array.from({ length: 33 }, (_, k) => ccwPt(k % 32)), 'primary');
const ccwRoute = (exitNo) => {
  const pts = [[112, 0], ccwPt(0)], rd = [road([[112, 0], ccwPt(0)], 'primary')];
  for (let k = 1; k <= exitNo * 8; k++) { pts.push(ccwPt(k)); rd.push(CCW_RING); }
  const e = ccwPt(exitNo * 8), out = [e[0] * 9, e[1] * 9];
  pts.push(out); rd.push(road([e, out], 'primary'));
  const cum = cumulative(pts);
  const joints = [{ s: cum[1], deg: 3 }];   // the entry arm
  for (let k = 1; k <= exitNo; k++) joints.push({ s: cum[1 + k * 8], deg: 3 });   // the arm at every quarter turn, the last one is the exit
  return { pts, cum, road: rd, len: cum[cum.length - 1], joints };
};

for (const n of [1, 2, 3]) {
  test(`routeSignals_CounterClockwiseRingExit${n}_SignalsRight`, () => {
    const sigs = routeSignals(ccwRoute(n));
    assert.equal(sigs.length, 1);
    assert.equal(sigs[0].side, 'right');
  });
}

test('routeSignals_RingExit1_StartsAtTheEntry', () => {
  const r = ccwRoute(1), sg = routeSignals(r)[0];
  assert.equal(sg.from, r.cum[1]);
  assert.equal(blinkerAt([sg], r.cum[1] - 1), null);
  assert.equal(blinkerAt([sg], r.cum[1] + 1), 'right');
});

test('routeSignals_RingExit3_StartsAtThePreviousExit', () => {
  const r = ccwRoute(3), sg = routeSignals(r)[0];
  assert.equal(sg.from, r.cum[1 + 2 * 8]);   // the arm of exit 2
  assert.equal(blinkerAt([sg], r.cum[1 + 2 * 8] - 1), null);
  assert.equal(blinkerAt([sg], r.cum[1 + 2 * 8] + 1), 'right');
  assert.equal(sg.to, sg.s + AUTO.signalAfter);
});
```

- [ ] Add `cumulative` to the import list on line 3 (`route.js` exports it).
- [ ] Run `node --test tests/route.test.mjs`; expect the new tests red (`side` is `'left'`, `from` is `s - 15`).

## Task 2: implement in route.js

**Files:** `route.js`

- [ ] `ringRuns` (`:211-221`): stop computing the direction; keep the passed junctions instead:

```js
// Stretches of the route that run around a roundabout: { sIn, sOut }
function ringRuns(route) {
  const runs = [];
  for (let i = 0; i < route.road.length; i++) {
    if (!isRoundabout(route.road[i])) continue;
    let k = i;
    while (k + 1 < route.road.length && route.road[k + 1] === route.road[i]) k++;
    runs.push({ sIn: route.cum[i], sOut: route.cum[k + 1] });
    i = k;
  }
  return runs;
}

// Where the exit signal of a ring run goes on: at the previous exit the route passes (an arm of degree 3+ inside the run), else at the entry
function ringSignalStart(route, run) {
  const passed = route.joints.filter((j) => j.deg >= 3 && j.s > run.sIn + 0.5 && j.s < run.sOut - 0.5);
  return passed.length ? passed[passed.length - 1].s : run.sIn;
}
```

- [ ] Delete `headingChange` (`:199-208`, with its comment line).
- [ ] In `routeSignals` replace the ring push (`:233`) with:

```js
    out.push({ s: r.sOut, side: 'right', from: ringSignalStart(route, r), to: r.sOut + AUTO.signalAfter });
```

  and update the comment above the function: "on a roundabout only when leaving it: always right (Swiss rule, Art. 41b VRV), from the previous exit or the entry".
- [ ] Remove `roundaboutSignalBefore: 15,` from `AUTO` (`:26`).
- [ ] Run `node --test tests/route.test.mjs`; all green, including the old `RouteEndingInsideTheRing` and `RouteStartingInsideTheRing` tests.

## Task 3: Playwright assertion, changelog

**Files:** `tests/test_autopilot.py`, `CHANGELOG.md`

- [ ] `tests/test_autopilot.py:111`: replace `assert exit_signal["to"] - exit_signal["from"] == 25` with

```python
        assert exit_signal["side"] == "right", exit_signal
        assert exit_signal["from"] < exit_signal["s"] and exit_signal["to"] - exit_signal["s"] == 10
```

  The `inside` check on line 112 stays as it is. Run only this test: `python3 -m pytest tests/test_autopilot.py -k leaving_a_roundabout -x` in the foreground (needs the world file; skip if `needs_world` skips).
- [ ] `CHANGELOG.md` under `## [Unreleased]` / `### Fixed` (create the heading if missing), player voice, with the `` `YYYY-MM-DD HH:MM` `` prefix the file uses:

```markdown
- `2026-11-05 HH:MM` The autopilot now signals **right** when it leaves a roundabout, as in Swiss traffic: no signal on the way in, and on the way out the blinker goes on from the previous exit (for the first exit from the entry) until just after the exit. Before, it signalled left on almost every exit.
```

- [ ] Verify: `node --test tests/route.test.mjs` green; `git diff --stat` shows only `route.js`, the two test files and `CHANGELOG.md`.
- [ ] Commit `fix(navigation): signal right when leaving a roundabout (#680)`, open the PR with `Closes #680`.
