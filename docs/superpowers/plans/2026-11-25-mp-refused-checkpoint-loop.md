# Refused multiplayer checkpoint: hold it until the car leaves (#1184) Implementation Plan

**Goal:** after the host refuses a guest's checkpoint pass (`cpno i`), the guest does not pass it again every
frame while still inside the 7 m radius. The checkpoint stays shut until the car has left the radius once.

**Architecture:** reuse `finishHeld(held, dist)` from `netrace.js` (#1169, no change there). `index.html` keeps
a `Set` of held checkpoint indices in `NET.race.cpHold`: `netReopenCp` adds, `stepRace` releases and respects.

**Spec:** `docs/superpowers/specs/2026-11-25-mp-refused-checkpoint-loop-design.md` (measured: with the host
having no near pose, `ev:cp` 107 in 4 s and `cpno` 107; cause `index.html:6416` re-fires after `index.html:7337`).

## Global constraints

- Buildless vanilla JS. No new files except tests; no packages. `netrace.js` stays untouched.
- Do not change existing tests. Run only `tests/test_multiplayer_race_cp.py` and
  `tests/test_multiplayer_race_finish.py`, in the foreground, under a memory cap:
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_multiplayer_race_cp.py tests/test_multiplayer_race_finish.py`
  Never the full suite, never `run_in_background`.
- Commit and push the branch before the Playwright run.

## Files

- Modify `index.html`: `stepRace` (line 6416, one very long line), `netReopenCp` (lines 7337-7343).
- Modify `tests/test_multiplayer_race_cp.py`: add one test at the end (existing tests stay).
- Modify `CHANGELOG.md`: one entry under `[Unreleased]`.

## Task 1: failing Playwright test

**Interfaces:** none. The test patches `RTCDataChannel.prototype.send` on the guest so the host gets no pose
records and refuses every `cp` (the real-world laggy-link case). It counts `cp` messages by channel label
`ev` and `type` `cp`, as measured in the spec.

- [ ] **Write the failing test**, appended to `tests/test_multiplayer_race_cp.py` (it already imports
  `T`, the `pair` fixture and defines `start_race`; check the file's top and reuse its imports; add `import json`
  only if missing):

```python
COUNT_CP_AND_DROP_POSES = """() => { window.__cpSent = 0; window.__dropPoses = true;
  const original = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (d) {
    if (typeof d === 'string' && (m => m.type === 'cp' && m.i === 0)(JSON.parse(d))) window.__cpSent++;
    if (window.__dropPoses && typeof d !== 'string') return;   // binary pose records: the host never sees a near pose
    return original.call(this, d);
  }; }"""


def test_a_refused_checkpoint_is_asked_once_while_parked_in_it(pair):
    """#1184: after a refusal the guest still stands in the checkpoint; it must not re-pass (and get refused) every step."""
    host, guest, errors = pair
    start_race(host, guest)
    cps = guest.evaluate("() => window.__mm.netRace().cps")
    guest.evaluate(COUNT_CP_AND_DROP_POSES)
    x, z = cps[0]
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
    guest.wait_for_function("() => window.__mm.netRace().cpno >= 1", timeout=T)
    guest.wait_for_timeout(3000)   # before the fix: about 27 refusals per second here
    parked = guest.evaluate("() => ({ n: window.__mm.netRace().cpno, sent: window.__cpSent, open: !window.__mm.netRace().done[0], visible: window.__mm.netRace().cpVisible[0] })")
    assert parked == {"n": 1, "sent": 1, "open": True, "visible": True}
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x + 60, z])   # leave the 7 m radius (60 m from every checkpoint), then come back: one new ask
    guest.wait_for_timeout(500)
    guest.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [x, z])
    guest.wait_for_function("() => window.__mm.netRace().cpno >= 2", timeout=T)
    guest.wait_for_timeout(2000)
    again = guest.evaluate("() => ({ n: window.__mm.netRace().cpno, sent: window.__cpSent })")
    assert again == {"n": 2, "sent": 2}
    assert errors == []
```

  Note: the patch counts only `cp` messages for checkpoint 0, and 60 m east of checkpoint 0 is far from
  every checkpoint, so `cpno` counts refusals of checkpoint 0 only.

- [ ] **Run it, expect a failure** (`n` far above 1): the pytest command from Global constraints, but only
  `tests/test_multiplayer_race_cp.py -k refused_checkpoint`.

## Task 2: wire the hold into `index.html`

- [ ] **`netReopenCp`** (`index.html:7337-7343`): in the `i >= 0` path, after `R.done--; updatePips(); finishG.visible = false;`
  add the hold. The tail of the function becomes:

```js
  c.done = false; c.pillar.material = cpMat; c.ring.visible = true;
  R.done--; updatePips(); finishG.visible = false;
  (NET.race.cpHold ??= new Set()).add(i);   // #1184: held until the car leaves this checkpoint, like the finish (#1169)
```

- [ ] **`stepRace`** (`index.html:6416`), two edits on that line:
  1. Insert directly before `let best = null, bd = 1e9;`:
     `if (NET.race?.cpHold?.size) for (const i of [...NET.race.cpHold]) if (!finishHeld(true, Math.hypot(CPS[i].x - P.x, CPS[i].z - P.z))) NET.race.cpHold.delete(i);   /* #1184: a refused checkpoint reopens only after leaving it */ `
  2. Replace `if (best.i >= 0 && bd < 7) {` with
     `if (best.i >= 0 && bd < 7 && !NET.race?.cpHold?.has(best.i)) {`
- [ ] Check: `grep -n "cpHold" index.html` shows exactly 3 hits (add in `netReopenCp`, release and guard in
  `stepRace`). `finishHeld` is already imported at `index.html:1048`.
- [ ] Commit: `fix(multiplayer): a refused checkpoint waits until the car leaves it (#1184)`, then push.
- [ ] **Verify (foreground, capped, generous timeout up to 600 s):** the pytest command from Global
  constraints. All tests in both files pass, including the new one.

## Task 3: changelog

- [ ] Under `## [Unreleased]` in `CHANGELOG.md`, in the matching `### Fixed` subsection (create it if missing),
  newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `<timestamp>` Multiplayer race: when the host **refuses your checkpoint**, it no longer re-triggers with the pass sound over and over while you stand in it; drive out and back in to try again.
```

- [ ] Commit: `docs(changelog): refused checkpoint no longer loops (#1184)`, push.
