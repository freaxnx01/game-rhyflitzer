# Refused multiplayer finish: hold the gate until the car leaves (#1169) Implementation Plan

**Goal:** after the host refuses a guest's finish (`cpno -1`), the guest does not ask again every frame
while it is still inside the finish radius. The gate stays shut until the car has left the 7 m radius once.

**Architecture:** a pure helper `finishHeld(held, dist)` in `netrace.js` (node-tested). `index.html`
sets `NET.race.finishHold` in `netReopenCp(-1)`, and `stepRace` updates and respects it.

**Spec:** `docs/superpowers/specs/2026-11-24-mp-refused-finish-loop-design.md` (measured cause: `cpno`
1 → 109 in 6 s, `state` flipping `racing`/`finished`; `index.html:6329` re-fires after `index.html:7251`).

## Global constraints

- Buildless vanilla JS. No new files except tests; no packages.
- Do **not** change `test_a_refused_finish_brings_markers_and_arrow_back`. Its assertion is correct.
- Run only `node --test tests/netrace.test.mjs` and the one Playwright file
  `tests/test_multiplayer_race_finish.py`, in the foreground, under a memory cap:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_multiplayer_race_finish.py`.
  Never the full suite.
- Commit and push the branch before the Playwright run.

## Files

- Modify `netrace.js`: add and export `finishHeld` next to `nearPoint` (around line 131).
- Modify `index.html`: the import at line 1048, `stepRace` (line 6329), `netReopenCp` (line 7251).
- Modify `tests/netrace.test.mjs`: import and test `finishHeld`.
- Modify `tests/test_multiplayer_race_finish.py`: add one new test (the existing two stay as they are).
- Modify `CHANGELOG.md`: one entry under `[Unreleased]`.

## Task 1: `finishHeld` helper (TDD, node)

**Interfaces:** `export function finishHeld(held, dist)` returns a boolean: `held && dist < RACE.radius`.

- [ ] **Write the failing test.** In `tests/netrace.test.mjs`, add `finishHeld` to the import list
  from `'../netrace.js'` and append:

```js
test('finishHeld_heldInsideRadius_staysHeld_leavingReleases', () => {
  assert.equal(finishHeld(true, 0), true);                    // parked in the gate after a refusal
  assert.equal(finishHeld(true, RACE.radius - 0.01), true);   // still inside
  assert.equal(finishHeld(true, RACE.radius), false);         // left the radius: the gate opens again
  assert.equal(finishHeld(true, 50), false);
  assert.equal(finishHeld(false, 0), false);                  // never held: nothing to hold
});
```

- [ ] **Run it, expect a failure:** `node --test tests/netrace.test.mjs` (the import has no `finishHeld`).
- [ ] **Implement** in `netrace.js`, right after `nearPoint`:

```js
// #1169: after a refused finish the gate stays shut for this car until it has left the finish radius once,
// otherwise a guest parked in the gate asks the host again on every step.
export function finishHeld(held, dist) { return held && dist < RACE.radius; }
```

- [ ] **Run again, expect pass:** `node --test tests/netrace.test.mjs`.
- [ ] Commit: `fix(multiplayer): finishHeld helper for a refused finish (#1169)`.

## Task 2: wire the hold into `index.html`

- [ ] **Write the failing Playwright test** in `tests/test_multiplayer_race_finish.py`, appended at
  the end of the file:

```python
def test_a_refused_finish_is_asked_once_while_parked_in_the_gate(pair):
    """#1169: after a refusal the guest still stands in the gate; it must not re-finish (and get refused) every step."""
    host, guest, errors = pair
    start_race(host, guest)
    cps = guest.evaluate(NET_RACE)["cps"]
    for i in range(len(cps)):
        guest.evaluate("(i) => window.__mm.netMarkCpDone(i)", i)
    fx, fz = guest.evaluate(NET_RACE)["finish"]
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [fx, fz])
    guest.wait_for_function("() => window.__mm.netRace().cpno >= 1", timeout=T)
    guest.wait_for_timeout(3000)   # before the fix: ~18 refusals per second here
    back = guest.evaluate(NET_RACE)
    assert back["cpno"] == 1
    assert back["state"] == "racing"
    assert back["finishVisible"] is True and back["arrowShown"] is True
    assert all(back["cpVisible"])
    assert errors == []
```

- [ ] Do not run it yet (one Playwright run at the end of the task covers red→green expectations;
  before the fix it fails with `cpno` far above 1).
- [ ] **Import:** add `finishHeld` to the `from './netrace.js'` import at `index.html:1048`
  (after `nearPoint`).
- [ ] **`netReopenCp(-1)`** (`index.html:7251`): inside the `if (R.state === 'finished') { ... }` block,
  after `finishG.visible = true;`, add `NET.race.finishHold = true;`. The line becomes:

```js
  if (i === -1) { if (R.state === 'finished') { R.state = 'racing'; setNetFinished(false); for (const c of cpObjs) c.g.visible = true; finishG.visible = true; NET.race.finishHold = true; } return; }   // #837 part d: the finish opens again; #1169: held until the car leaves the gate
```

- [ ] **`stepRace`** (`index.html:6329`), two edits on that one line:
  1. Replace `R.target = best;` with
     `if (best.i < 0 && NET.race?.finishHold) NET.race.finishHold = finishHeld(true, bd);   /* #1169: a refused finish reopens only after leaving the gate */ R.target = best;`
  2. Replace `else if (best.i < 0 && bd < 7 && R.state === 'racing') {` with
     `else if (best.i < 0 && bd < 7 && R.state === 'racing' && !NET.race?.finishHold) {`
- [ ] Check: `grep -n "finishHold" index.html` shows exactly 3 hits (set in `netReopenCp`, update and
  guard in `stepRace`). `netStartSession` builds a fresh `NET.race` object, so no reset is needed.
- [ ] Commit: `fix(multiplayer): a refused finish waits until the car leaves the gate (#1169)`, then push.
- [ ] **Verify (foreground, capped):**
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_multiplayer_race_finish.py`
  with a generous timeout (up to 600 s). All three tests pass.

## Task 3: changelog

- [ ] Under `## [Unreleased]` in `CHANGELOG.md` (the `### Fixed` subsection; create it if missing),
  newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `<timestamp>` Multiplayer race: when the host **refuses your finish**, the gate no longer re-triggers with the finish sound over and over while you stand in it; drive out and back in to try again.
```

- [ ] Commit: `docs(changelog): refused finish no longer loops (#1169)`, push.
