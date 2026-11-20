# Lift sync loss (#1109) Implementation Plan

**Goal:** a ping that queued behind a stalled main thread no longer shifts the guest's clock, so the other player's car comes back with the first pose after a stall (the lift ride's first renders) instead of seconds later.
**Spec:** `docs/superpowers/specs/2026-11-20-lift-sync-loss-design.md`
**Constraints:** buildless, vanilla JS. Change only `addClockSample` in `netsync.js` (plus the new `RTT_MAX` constant); no `index.html` change (#1108/#1113/#1114/#1116 edit it). Playwright: foreground, only the file named here, never the full suite:
`env PW_CDP_ENDPOINT= systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/<file> -x`

## Task 1: bound the ping round trip in `addClockSample` (TDD)

**Files:** `netsync.js`, `tests/netsync.test.mjs`

- [ ] Failing tests first. In `tests/netsync.test.mjs` add `RTT_MAX` to the import on line 4, then add after `clockOffset_fiveSamples_median`:

```js
test('addClockSample_lateRoundTrip_droppedOnceAnOffsetExists', () => {
  assert.equal(RTT_MAX, 1000);
  let c = addClockSample(null, 0, 1000, 20);
  c = addClockSample(c, 100, 1110, 120);
  const stalled = addClockSample(c, 200, 9000, 8200);      // the peer stalled ~8 s: round trip 8000 ms
  assert.deepEqual(stalled, c);
  assert.equal(clockOffset(stalled), clockOffset(c));
  assert.equal(addClockSample(c, 300, 1800, 1300).length, 3);   // exactly RTT_MAX: still a sample
});

test('addClockSample_slowFirstRoundTrip_kept', () => {
  const c = addClockSample(null, 0, 5000, 4000);            // no offset yet: a slow link must still get one
  assert.equal(c.length, 1);
  assert.equal(clockOffset(c), 3000);
});

test('addClockSample_pingsQueuedBehindAStall_offsetUnchanged', () => {
  // #1109: the guest pings every 2 s; while the host's main thread is stalled (lift ride, 6-16 s) every pong comes at 16 s
  let c = null;
  for (const a of [0, 2000, 4000]) c = addClockSample(c, a, 1000 + a + 10, a + 20);   // steady: offset 1000
  const before = clockOffset(c);
  for (const a of [6000, 8000, 10000, 12000, 14000]) c = addClockSample(c, a, 17010, 16020);
  assert.equal(before, 1000);
  assert.equal(clockOffset(c), before);
});
```

- [ ] Run `node --test tests/netsync.test.mjs`: the three new tests fail (`RTT_MAX` is not exported; the stalled pongs move the median).
- [ ] In `netsync.js`, after `CLOCK_N` (line 10) add:

```js
export const RTT_MAX = 1000;     // ms: a longer ping round trip (a stalled peer) is no clock sample once one exists (#1109)
```

- [ ] Replace `addClockSample` (lines 21-26) with:

```js
// addClockSample(samples, a, b, c) — one ping/pong round: a = send time, b = host clock, c = receive time (guest ms).
// Returns a new array holding the last CLOCK_N offsets; never mutates the one it is given. A round trip longer than
// RTT_MAX is dropped once there is a sample: a pong that queued behind a stalled main thread (#1109: the lift ride's
// first renders) would move the median by seconds. The first sample is always kept, so a slow link still gets an offset.
export function addClockSample(samples, a, b, c) {
  if (samples && samples.length && c - a > RTT_MAX) return samples;
  const next = [...(samples || []), b - (a + c) / 2];
  return next.length > CLOCK_N ? next.slice(next.length - CLOCK_N) : next;
}
```

- [ ] Run `node --test tests/netsync.test.mjs`: all pass, `clockOffset_fiveSamples_median` unchanged.
- [ ] Run all node tests: `node --test tests/*.test.mjs`: all pass.
- [ ] Commit: `fix(multiplayer): ignore late ping round trips in the clock offset` with `Refs #1109`.

## Task 2: shared drive still works (Playwright, one file)

**Files:** none changed

- [ ] Run `env PW_CDP_ENDPOINT= systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_multiplayer_cruise.py -x` in the foreground: all pass (the guest still gets an offset and both cars see each other).

## Task 3: changelog

**Files:** `CHANGELOG.md`

- [ ] Under `## [Unreleased]`, in `### Fixed` (create the subsection after `### Added` if it is missing), newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `YYYY-MM-DD HH:MM` Gemeinsam fahren: Ruckelt das Spiel eines Spielers kurz (etwa beim ersten Mal im **Lift im Hübel**), taucht das andere Auto gleich danach wieder auf, statt noch Sekunden **verschwunden** oder **eingefroren** zu bleiben.
```

- [ ] Commit: `docs(changelog): lift sync loss fix` with `Closes #1109`.
