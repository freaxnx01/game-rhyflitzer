# Host knock rate limit (#1179) - implementation plan

Goal: the host drops a guest `knock` that arrives less than 60 ms after an accepted one of the same slot and sound. Spec: `docs/superpowers/specs/2026-11-24-mp-host-knock-rate-limit-design.md`.

Files: modify `netsync.js`, `index.html`, `tests/netsync.test.mjs`. No CHANGELOG entry (not player-visible).

Interface: `export const KNOCK_GAP_MS = 60; export function knockAllowed(seen, slot, sound, now) -> boolean`.

## Task 1 - the pure gate (TDD)

- [ ] Write the failing tests in `tests/netsync.test.mjs` (add `KNOCK_GAP_MS, knockAllowed` to the `../netsync.js` import):

```js
test('knockAllowed_firstKnock_allowedAndRecorded', () => {
  const seen = {};
  assert.equal(KNOCK_GAP_MS, 60);
  assert.equal(knockAllowed(seen, 1, 'bin', 1000), true);
});

test('knockAllowed_withinGap_dropped_notRecorded', () => {
  const seen = {};
  knockAllowed(seen, 1, 'bin', 1000);
  assert.equal(knockAllowed(seen, 1, 'bin', 1059), false);
  assert.equal(knockAllowed(seen, 1, 'bin', 1060), true);   // measured from the last accepted one, not the dropped one
});

test('knockAllowed_otherSoundOrSlot_gatedIndependently', () => {
  const seen = {};
  knockAllowed(seen, 1, 'bin', 1000);
  assert.equal(knockAllowed(seen, 1, 'lamp', 1001), true);
  assert.equal(knockAllowed(seen, 2, 'bin', 1001), true);
});

test('knockAllowed_nonFiniteTime_dropped', () => {
  assert.equal(knockAllowed({}, 1, 'bin', NaN), false);
});
```

  The function does not validate sound names, so any string works in the tests.
- [ ] Run `node --test tests/netsync.test.mjs`; the new tests fail (missing export).
- [ ] Implement in `netsync.js` after `hearGain`:

```js
// ---- #1179: the host's own gate on a relayed knock ----
export const KNOCK_GAP_MS = 60;   // the same gap netSendKnock keeps per sound
// knockAllowed(seen, slot, sound, now) — true (and records now) if this slot's knock of this sound is at least KNOCK_GAP_MS after
// the last accepted one. `seen` is the caller's plain object; a refused knock is not recorded.
export function knockAllowed(seen, slot, sound, now) {
  if (!Number.isFinite(now)) return false;
  const key = slot + ':' + sound;
  if (now - (seen[key] ?? -Infinity) < KNOCK_GAP_MS) return false;
  seen[key] = now;
  return true;
}
```

- [ ] Run `node --test tests/netsync.test.mjs`; pass.

## Task 2 - wire it into the host

- [ ] `index.html:1051`: add `knockAllowed` to the `./netsync.js` import list.
- [ ] Next to `let knockSentAt = {};` (`index.html:7438`) add `let knockSeen = {};   // #1179: the host's per-slot, per-sound knock gate`.
- [ ] In the `knock` branch of `netHostMessage` (`index.html:6982`) insert, before `netHearKnock(id, ...)`:
  `if (!knockAllowed(knockSeen, id, msg.s, performance.now())) { NET.bad++; return; }   // #1179: a flood is neither played nor relayed`
- [ ] In `netEndSession` (`index.html:7279`) make the line `knockSentAt = {}; knockSeen = {};`.
- [ ] `node --check netsync.js`; grep the three index.html edits (the inline module has no node runner).

## Task 3 - verify

- [ ] `node --test tests/netsync.test.mjs tests/netcodec.test.mjs`; all green. No Playwright run (the gate is node-tested, the wiring is four lines).
- [ ] Commit `fix(multiplayer): host rate-limits relayed knock messages (#1179)` with `Closes #1179`.
