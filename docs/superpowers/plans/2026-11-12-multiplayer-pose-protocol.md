# Multiplayer pose protocol Plan (#835 part a)

> Spec: `docs/superpowers/specs/2026-11-12-multiplayer-see-each-other-design.md` (sections *Clock*, *Pose record*, *Remote cars*). Builds on #834. Pure modules + netlink only: no `index.html` change (that is part b), no name tags/lamps/fade (part c), no collisions (#836), no race rules (#837).

**Goal:** the tested building blocks of the pose stream: the binary pose record and the `ping`/`pong`/`start` messages in `netcodec.js`; a new pure `netsync.js` (clock offset, pose track with interpolation/extrapolation/snap/hide, start column); binary data on netlink's existing `pose` channel.

Constraints: buildless, no packages. Pure modules: no DOM/three.js. Never throw on peer input: refusals return null. No key binding involved. Run only `node --test tests/net*.test.mjs`.

## Task 1: binary pose + new reliable messages (`netcodec.js`)
Files: `netcodec.js`, `tests/netcodec.test.mjs`.
- [ ] Append the failing tests, run them, expect FAIL:
```js
import { encodePose, parsePose, POSE_BYTES } from '../netcodec.js';
const POSE = { id: 2, seq: 65535, t: 4294967000, x: 1234.5, y: 312.25, z: -876.125, rx: 0.05, ry: -3.1, rz: -0.2, vx: 30.12, vz: -4.5, steer: 0.31, flags: 0b100011 };
test('parsePose_encoded_roundTripsWithinQuantisation', () => {
  const buf = encodePose(POSE); assert.equal(buf.byteLength, POSE_BYTES); assert.equal(POSE_BYTES, 36);
  const p = parsePose(buf);
  for (const k of ['id', 'seq', 't', 'flags']) assert.equal(p[k], POSE[k], k);
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(p[k] - POSE[k]) < 1e-3, k);
  for (const k of ['rx', 'ry', 'rz', 'steer']) assert.ok(Math.abs(p[k] - POSE[k]) <= 1e-4, k);
  for (const k of ['vx', 'vz']) assert.ok(Math.abs(p[k] - POSE[k]) <= 0.01, k);
});
test('parsePose_badRecords_null', () => {
  const bad = (patch) => { const b = encodePose(POSE), v = new DataView(b); patch(v); return b; };
  assert.equal(parsePose('x'.repeat(36)), null); assert.equal(parsePose(new ArrayBuffer(35)), null); assert.equal(parsePose(new ArrayBuffer(37)), null);
  assert.equal(parsePose(bad((v) => v.setUint8(0, 2))), null);            // unknown kind
  assert.equal(parsePose(bad((v) => v.setUint8(1, 4))), null);            // id beyond MAX_PLAYERS
  assert.equal(parsePose(bad((v) => v.setFloat32(8, NaN, true))), null);
  assert.equal(parsePose(bad((v) => v.setFloat32(16, 60000, true))), null);   // |z| > 50 km
  assert.equal(parsePose(bad((v) => v.setFloat32(12, -2000, true))), null);   // y below -1000
  assert.equal(parsePose(bad((v) => v.setInt16(26, 20000, true))), null);     // vx 200 m/s
  assert.equal(parsePose(bad((v) => v.setUint8(32, 0b1000000))), null);       // reserved flag bit
});
test('parseMessage_pingPongStart_validated', () => {
  assert.deepEqual(parseMessage('{"type":"ping","a":12.5}', CTX), { type: 'ping', a: 12.5 });
  assert.deepEqual(parseMessage('{"type":"pong","a":12.5,"b":99}', CTX), { type: 'pong', a: 12.5, b: 99 });
  assert.deepEqual(parseMessage('{"type":"start","mode":"cruise"}', CTX), { type: 'start', mode: 'cruise' });
  for (const m of ['{"type":"ping","a":"1"}', '{"type":"pong","a":1}', '{"type":"pong","a":1,"b":null}', '{"type":"start","mode":"race"}', '{"type":"start"}'])
    assert.equal(parseMessage(m, CTX), null, m);
});
```
- [ ] Implement:
  - **`POSE_BYTES = 36`.** Layout per the spec table: u8 kind=1, u8 id, u16 seq, u32 t, 3×f32 xyz, 3×i16 rot ×10000, 2×i16 v cm/s, i16 steer ×10000, u8 flags, 3 reserved; little-endian via `DataView`.
  - **`encodePose`:** clamps every int to its range and rounds.
  - **`parsePose(buf)`:**
    - It reads only `buf instanceof ArrayBuffer && byteLength === 36`.
    - Bounds: `POS_MAX = 50000`, y in [−1000, 10000], `Math.hypot(vx, vz) <= 150`, `(flags & 0xC0) === 0`.
    - It returns a fresh object.
  - **Validators:**
    - `ping`: `a` finite;
    - `pong`: `a`, `b` finite;
    - `start`: `mode === 'cruise'`, with a `START_MODES = ['cruise']` export (#837 adds `'race'`).
- [ ] PASS, commit `feat(multiplayer): binary pose record and ping/pong/start messages (#835)`.

## Task 2: clock, track, grid (`netsync.js`)
Files: `netsync.js` (new), `tests/netsync.test.mjs` (new).
- [ ] Failing test, run it, expect FAIL:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addClockSample, clockOffset, createTrack, pushPose, sampleRemote, gridPose, DELAY, EXTRAP, HIDE } from '../netsync.js';
const pose = (t, x, extra = {}) => ({ id: 1, seq: t, t, x, y: 0, z: 0, rx: 0, ry: 0, rz: 0, vx: 20, vz: 0, steer: 0, flags: 1, ...extra });
test('clockOffset_fiveSamples_median', () => {
  let c = null; assert.equal(clockOffset(c), null);
  for (const [a, b, cc] of [[0, 1000, 20], [100, 1110, 120], [200, 1500, 220], [300, 1310, 320], [400, 1409, 420], [500, 1505, 520]]) c = addClockSample(c, a, b, cc);
  assert.equal(c.length, 5); assert.equal(clockOffset(c), 1000);   // offset = b-(a+c)/2; last five 1000, 1290, 1000, 999, 995 -> median 1000, the 1290 outlier ignored
});
test('sampleRemote_betweenPoses_interpolates', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0)); pushPose(tr, pose(1050, 1)); pushPose(tr, pose(1100, 2));
  assert.equal(DELAY, 100); assert.ok(Math.abs(sampleRemote(tr, 1175).x - 1.5) < 1e-9);
});
test('sampleRemote_afterNewest_extrapolatesCapped', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0)); pushPose(tr, pose(1050, 1));
  assert.equal(EXTRAP, 250);
  assert.ok(Math.abs(sampleRemote(tr, 1250).x - (1 + 20 * 0.1)) < 1e-9);        // 100 ms past newest at 20 m/s
  assert.ok(Math.abs(sampleRemote(tr, 2000).x - (1 + 20 * 0.25)) < 1e-9);       // held at 250 ms
});
test('sampleRemote_bigGap_snapsNotSlides', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0)); pushPose(tr, pose(1050, 400));
  assert.equal(sampleRemote(tr, 1130).x, 400);
});
test('sampleRemote_yaw_shortestPath', () => {
  const tr = createTrack(); pushPose(tr, pose(1000, 0, { ry: 3.1 })); pushPose(tr, pose(1100, 0, { ry: -3.1 }));
  assert.ok(Math.abs(Math.abs(sampleRemote(tr, 1150).ry) - Math.PI) < 0.01);
});
test('sampleRemote_silentOrEmpty_null_andOldOrDuplicateDropped', () => {
  const tr = createTrack(); assert.equal(sampleRemote(tr, 0), null);
  pushPose(tr, pose(1000, 0)); assert.equal(HIDE, 3000); assert.equal(sampleRemote(tr, 4001), null);
  pushPose(tr, pose(5000, 9)); pushPose(tr, pose(5000, 9)); pushPose(tr, pose(3000, 5));
  assert.deepEqual(tr.poses.map((p) => p.t), [5000]);
});
test('gridPose_slots_columnBehindStart', () => {
  assert.deepEqual(gridPose([10, 20, 0], 0), [10, 20, 0]);
  const [x1, z1] = gridPose([10, 20, 0], 1), [x2, z2] = gridPose([10, 20, 0], 2);
  assert.ok(Math.abs(x1 - 2) < 1e-9 && Math.abs(Math.abs(z1 - 20) - 1.5) < 1e-9);
  assert.ok(Math.abs(x2 + 6) < 1e-9 && Math.sign(z2 - 20) === -Math.sign(z1 - 20));
});
```
- [ ] Implement:
  - **Constants:** `DELAY=100`, `EXTRAP=250`, `HIDE=3000`, `SNAP=25`, `KEEP=1000`, `MAX_POSES=20`, `CLOCK_N=5`, `GRID_BACK=8`, `GRID_SIDE=1.5`.
  - **`FLAG`** `= { visible: 1, head: 2, brake: 4, left: 8, right: 16, nitro: 32 }`: the spec's flag bits, used by part b's encoder and part c's lamps.
  - **`addClockSample(samples|null, a, b, c)`:** returns a new array, the last 5.
  - **`clockOffset`:** the median, or null.
  - **`createTrack()`** → `{ poses: [] }`.
  - **`pushPose`** (a command):
    - drops a duplicate `t`, or `t < newest − KEEP`;
    - inserts sorted;
    - trims to `MAX_POSES` and to `newest − KEEP`.
  - **`sampleRemote(track, now)`:**
    - `null` when empty or `now − newest.t > HIDE`;
    - `rt = now − DELAY`;
    - bracketing poses → lerp with shortest-angle `rx/ry/rz`, or the later pose when they are more than `SNAP` m apart;
    - past the newest → `+ v × min(rt − t, EXTRAP) / 1000`;
    - before the oldest → the oldest;
    - returns `{ x, y, z, rx, ry, rz, steer, flags }`.
  - **`gridPose([x, z, th], slot)`:**
    - back `GRID_BACK × slot` along `−(cos th, sin th)`;
    - lateral `(−sin th, cos th) × (slot === 0 ? 0 : slot % 2 ? GRID_SIDE : −GRID_SIDE)`;
    - same `th`.
- [ ] PASS, commit `feat(multiplayer): netsync clock, pose track and start column (#835)`.

## Task 3: binary on the pose channel (`netlink.js`)
Files: `netlink.js`.
- **`attachChannel`:** `channel.binaryType = 'arraybuffer'`. String data → `onMessage` (unchanged); `ArrayBuffer` data on the `pose` label → `onPose(peerId, data)`.
- **`createLink`:** takes `onPose = () => {}`.
- **`sendPose(peerId, buf)`:** sends on `pose` when `readyState === 'open'`, otherwise skips silently. Export it in the returned object.
- [ ] `node --test tests/netlink.test.mjs` still passes. Commit `feat(multiplayer): binary pose channel in netlink (#835)`.

