# Hear the other player's horn and knocks (#1112) Implementation Plan

Spec: `docs/superpowers/specs/2026-11-23-mp-remote-horn-knock-design.md`. Buildless; no new dependency; `sound.js` is not touched
(#1130 owns it). `index.html` is long single-line code: use exact-string edits, keep every edit inside the named function.
Rebase on `main` first (PR#1147 changed `encodePose`). Do not edit `cloneStageVehicle`/`buildNetCar` or the lobby code.
Tests: node `--test` for the pure parts, then ONE Playwright test (`tests/test_multiplayer_cruise.py`, existing `pair` fixture);
do not run the full ~2 h browser suite.

## Task 1: horn bit and `hearGain` (pure, TDD)

Files: `netsync.js`, `netcodec.js`, `tests/netsync.test.mjs`, `tests/netcodec.test.mjs`.

- [ ] Write the failing tests.

```js
// tests/netsync.test.mjs (add HEAR_NEAR, HEAR_FAR, hearGain to the import)
test('hearGain_distance_fullNearSilentFar', () => {
  assert.equal(hearGain(0), 1); assert.equal(hearGain(HEAR_NEAR), 1);
  assert.equal(hearGain(HEAR_FAR), 0); assert.equal(hearGain(HEAR_FAR + 50), 0);
  assert.equal(hearGain(NaN), 0); assert.equal(hearGain(-5), 1);
  const a = hearGain(40), b = hearGain(80);
  assert.ok(a > b && b > 0 && a < 1);
});
test('FLAG_horn_bit6', () => { assert.equal(FLAG.horn, 64); });

// tests/netcodec.test.mjs: replace line 93 (bit 6 is now the horn) and add the round trip
assert.equal(parsePose(bad((v) => v.setUint8(32, 0b10000000))), null);       // reserved flag bit (7)
test('encodePose_hornBit_roundTrips', () => {
  const p = parsePose(encodePose({ ...POSE, flags: 1 | 64 }));
  assert.equal(p.flags, 65);
  assert.equal(new DataView(encodePose({ ...POSE, flags: 0xff })).getUint8(32), 0x7f);   // bit 7 is still never sent
});
```

- [ ] Run `node --test tests/netsync.test.mjs tests/netcodec.test.mjs`; the new tests fail.
- [ ] `netsync.js`: `FLAG = { ..., nitro: 32, horn: 64 }`; add
  `export const HEAR_NEAR = 12, HEAR_FAR = 160;` and
  `export function hearGain(d) { if (!Number.isFinite(d)) return 0; const t = clamp((d - HEAR_NEAR) / (HEAR_FAR - HEAR_NEAR), 0, 1); return (1 - t) * (1 - t); }`
  with a one-line comment (a query: pure).
- [ ] `netcodec.js`: line 48 `v.setUint8(32, p.flags & 0x7f);   // bit 7 is reserved and must stay 0`; `parsePose`: `if (flags & 0x80) return null;`
  and fix the two comments that say "bits 6-7".
- [ ] Run both test files green, then `node --test tests/*.test.mjs`. Commit `feat(multiplayer): horn pose bit and hearing falloff (#1112)`.

## Task 2: `knock` message (pure, TDD)

Files: `netcodec.js`, `knock.js`, `tests/netcodec.test.mjs`, `tests/knock.test.mjs`.

- [ ] Failing tests in `tests/netcodec.test.mjs`:

```js
test('parseMessage_knock_validated', () => {
  assert.deepEqual(parseMessage('{"type":"knock","s":"glass","l":0.6}', CTX), { type: 'knock', s: 'glass', l: 0.6 });
  assert.deepEqual(parseMessage('{"type":"knock","s":"lamp","l":1,"id":2}', CTX), { type: 'knock', s: 'lamp', l: 1, id: 2 });
  for (const m of ['{"type":"knock","s":"boom","l":0.5}', '{"type":"knock","s":"glass","l":2}', '{"type":"knock","s":"glass"}',
    '{"type":"knock","s":"glass","l":0.5,"id":4}', '{"type":"knock","s":"glass","l":0.5,"id":"1"}', '{"type":"knock","l":0.5}'])
    assert.equal(parseMessage(m, CTX), null, m);
});
```

- [ ] `knock.js`: export `export const KNOCK_SOUNDS = [...new Set(Object.values(KINDS).map((k) => k.sound))]` (primary sounds only: clatter,
  wood, clang, glass, clothes, hydrant, lamp). In `knock()` call `deps.knocked?.(sound, level)` right after each of the two primary `play(...)`
  calls (`play('lamp', ...)` and `play(k.sound, ...)`); destructure `knocked` from `deps`. Add to `tests/knock.test.mjs` a test that every
  `KINDS[*].sound` is in `KNOCK_SOUNDS` and `KNOCK_SOUNDS` contains `'lamp'`.
- [ ] `netcodec.js`: import `KNOCK_SOUNDS` from `./knock.js` (pure, no DOM; check `knock.js` has no top-level THREE import, else duplicate the
  list in `netcodec.js` and assert equality in the knock test). Add to `VALIDATORS`:
  `knock: (m) => (KNOCK_SOUNDS.includes(m.s) && finite(m.l) && m.l >= 0 && m.l <= 1 && (m.id === undefined || (Number.isInteger(m.id) && m.id >= 0 && m.id < MAX_PLAYERS)) ? (m.id === undefined ? { type: 'knock', s: m.s, l: m.l } : { type: 'knock', s: m.s, l: m.l, id: m.id }) : null)`.
- [ ] `node --test tests/*.test.mjs` green. Commit `feat(multiplayer): knock message and primary-knock hook (#1112)`.

## Task 3: wire it in `index.html`

Files: `index.html` only. No new unit test (DOM-bound); verified in Task 4.

- [ ] Sender horn: add `const HORN = { until: 0 };` near `poseFlags` (`:7249`). In the key handler `SFX.horn()` call (`:4742`, the only
  caller; the touch `data-cmd="KeyH"` goes through the same handler) add `HORN.until = performance.now() + VEH.sound.horn.dur * 1000;`
  before it. `poseFlags()`: `| (performance.now() < HORN.until ? FLAG.horn : 0)`. `HORN` is declared with `const` above its first use: do not
  use `$(` before declarations (TDZ rule in this file).
- [ ] `SFX` object, after `horn()` (`:4819`):
  `hornAt(horn, g) { if (muted || holds.size || g < 0.02) return; const a = ctx(); playHorn(a, a.master, { ...horn, gain: horn.gain * g }, a.currentTime); },`
- [ ] Remote playback helpers next to `stepNetCars`:

```js
const NETHEARD = { horn: 0, knock: 0, last: null };
const netGainTo = (id) => { const e = NETCARS.get(id); return e && e.mesh ? hearGain(Math.hypot(e.mesh.position.x - P.x, e.mesh.position.z - P.z)) : 0; };
function netHearHorn(entry, id) { const g = netGainTo(id); if (g < 0.02) return; SFX.hornAt(VEHICLES[entry.car]?.sound?.horn || VEH.sound.horn, g); NETHEARD.horn++; NETHEARD.last = { kind: 'horn', id, g }; }
function netHearKnock(id, s, l) { const g = netGainTo(id); if (g < 0.02) return; SFX.knock(s, l * g); NETHEARD.knock++; NETHEARD.last = { kind: s, id, g }; }
```

  `stepNetCars` (`:7385`), after the flames block, inside the per-car loop: `const horning = !!(pose.flags & FLAG.horn); if (horning && !entry.horning) netHearHorn(entry, id); entry.horning = horning;`.
  Add `horning: false` to `newNetCar`'s object. Import `hearGain` in the existing `netsync.js` import line (the first
  `import` that lists `FLAG`).
- [ ] Sender knock:

```js
let knockSentAt = {};
function netSendKnock(s, l) {
  if (!NET.session || !NET.link) return;
  const now = performance.now(); if (now - (knockSentAt[s] ?? -1e9) < 60) return; knockSentAt[s] = now;
  if (NET.role === 'H') { for (const peerId of NET.slots.keys()) NET.link.send(peerId, { type: 'knock', s, l, id: NET.you }); }
  else NET.link.send(HOST_ID, { type: 'knock', s, l });
}
```

  Pass `knocked: netSendKnock` in the `createKnock({...})` call (`:2529`); it is a function declaration, so hoisting makes the early reference
  safe (the call happens only after a session exists).
- [ ] Relay and receive. `netHostMessage` (`:6957`), after the `ping` line: `if (msg.type === 'knock') { netHearKnock(id, msg.s, msg.l); for (const other of NET.slots.keys()) if (other !== peerId) NET.link.send(other, { type: 'knock', s: msg.s, l: msg.l, id }); return; }`
  (`id` is the slot from `NET.slots.get(peerId)`; any `id` in the guest's message is ignored). `netGuestMessage` (`:6994`): at its top
  `if (msg.type === 'knock') { if (msg.id !== undefined && msg.id !== NET.you && NET.lobby?.players.some((p) => p.id === msg.id)) netHearKnock(msg.id, msg.s, msg.l); else NET.bad++; return; }`.
  Reset `knockSentAt = {}` where the session ends (`netEndSession`).
- [ ] Hooks: `window.__mm.netHeard = () => ({ ...NETHEARD }); window.__mm.netKnock = (s, l) => netSendKnock(s, l);` next to `netCars` (`:7522`).
- [ ] Add a CHANGELOG `[Unreleased]` entry (hand-written, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`):
  "You now hear the other player's **horn** and the props they **knock over** when they are near, quieter the further away."
- [ ] Commit `feat(multiplayer): hear the other player's horn and knocks (#1112)`; push the branch BEFORE Task 4.

## Task 4: one two-browser test

Files: `tests/test_multiplayer_cruise.py` (copy the setup of `test_remote_car_shows_nitro_flames_while_the_sender_holds_nitro`, `:110`).

- [ ] Test `test_remote_horn_and_knock_are_heard_within_range`: connect, ready both, start, wait for the guest offset and a visible built
  host car (as in the nitro test). Assert `guest.evaluate("window.__mm.netHeard()")` has `horn == 0`. Host: `host.keyboard.press("KeyH")`; guest
  `wait_for_function("() => window.__mm.netHeard().horn >= 1", polling=250, timeout=T)`. Then send a knock from the host's real sender path through a new test hook next to `netSend` (`:7521`):
  `window.__mm.netKnock = (s, l) => netSendKnock(s, l)` (add it in Task 3). `host.evaluate("window.__mm.netKnock('glass', 0.8)")`; guest
  `wait_for_function("() => window.__mm.netHeard().knock >= 1")` and `last.kind == 'glass'`. Both cars spawn on the same start grid, well within 160 m. End with `errors == []`.
- [ ] Run only this test: `pytest tests/test_multiplayer_cruise.py -k horn_and_knock`. Then `node --test tests/*.test.mjs`.
- [ ] Commit `test(multiplayer): remote horn and knock are heard (#1112)`.

## Self-review checklist

- `parsePose` still refuses bit 7; the own horn/knock unchanged; no edits to `sound.js`; no `cloneStageVehicle`/lobby edits.
- A forged `id` in a guest-sent `knock` is ignored (host re-stamps); a relayed `knock` without `id` at a guest counts in `NET.bad`.
- The console stays empty in the Playwright test (`errors == []`).
