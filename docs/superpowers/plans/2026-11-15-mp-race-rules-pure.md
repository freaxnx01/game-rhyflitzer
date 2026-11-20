# #837 part a: race rules and messages (pure), plan

**Goal:** pure race logic and wire format; parts b–d only wire it up. Node tests only.
**Spec:** `docs/superpowers/specs/2026-11-15-multiplayer-race-rules-design.md`.
**Files:** `netrace.js`, `netcodec.js`, `tests/netrace.test.mjs`, `tests/netcodec.test.mjs`.
**Constraints:** pure (no DOM/three.js); return new objects, never mutate input; never throw on peer input.

## Task 1: `raceGrid` (netrace.js)

Failing test:

```js
import { raceGrid, createRace, acceptCp, acceptFinish, dropRacer, tickRace, standings, boardRows, nearPoint, RACE } from '../netrace.js';
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
test('raceGrid_twoAbreast_rowsBack', () => {
  [[0, -2], [0, 2], [-8, -2], [-8, 2]].forEach(([x, z], slot) => assert.ok(near(raceGrid([0, 0, 0], slot), [x, z, 0])));
});
```

Implement:

```js
export const RACE = { countdown: 4000, dnf: 60000, radius: 7, slack: 15, maxMs: 3600000, row: 8, half: 2 };
export function raceGrid([x, z, th], slot) {
  const back = RACE.row * Math.floor(slot / 2), side = slot % 2 ? RACE.half : -RACE.half;
  return [x - Math.cos(th) * back - Math.sin(th) * side, z - Math.sin(th) * back + Math.cos(th) * side, th];
}
```


## Task 2: race state, checkpoints and finish

Racer `{ id, name, times, mask, st }`; race `{ cps, firstFin, over, racers }`.

Failing tests:

```js
const lobby2 = { region: 'hochrhein', cls: 'all', players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }] };
test('acceptCp_onlyNewRealNearAndRunning', () => {
  let r = createRace(lobby2, 3);
  for (const a of [[1, 0, 5000, false], [1, 3, 5000, true], [9, 0, 5000, true]]) assert.equal(acceptCp(r, ...a).ok, false);   // far, no cp 3, no racer 9
  r = acceptCp(r, 1, 2, 5000, true).race;                            // any order
  assert.equal(acceptCp(r, 1, 2, 6000, true).ok, false);            // already passed
  r = acceptCp(r, 1, 0, 4000, true).race;                            // earlier t is clamped up
  assert.deepEqual(r.racers[1].times, [5000, 5000]);
});
test('acceptFinish_needsAllCps_thenFin', () => {
  let r = createRace(lobby2, 1);
  assert.equal(acceptFinish(r, 0, 9000, true, 100).ok, false);
  r = acceptCp(r, 0, 0, 3000, true).race;
  r = acceptFinish(r, 0, 9000, true, 100).race;
  assert.deepEqual([r.racers[0].st, r.racers[0].times, r.firstFin, r.over], ['fin', [3000, 9000], 100, false]);
  r = dropRacer(r, 1);
  assert.deepEqual([r.racers[1].st, r.over], ['dnf', true]);
});
test('tickRace_dnfSixtySecondsAfterFirstFinish', () => {
  let r = acceptFinish(acceptCp(createRace(lobby2, 1), 0, 0, 1, true).race, 0, 2, true, 1000).race;
  assert.equal(tickRace(r, 60999).over, false);
  r = tickRace(r, 61000);
  assert.deepEqual([r.racers[1].st, r.over], ['dnf', true]);
});
```

Implement:

```js
const settle = (race) => ({ ...race, over: race.racers.every((p) => p.st !== 'run') });
const withRacer = (race, id, change) => settle({ ...race, racers: race.racers.map((p) => (p.id === id ? change(p) : p)) });
const runner = (race, id) => race.racers.find((p) => p.id === id && p.st === 'run');
const okTime = (t) => Number.isFinite(t) && t >= 0 && t <= RACE.maxMs;
const stamp = (p, t) => [...p.times, Math.max(p.times[p.times.length - 1] ?? 0, t)];
export function createRace(lobby, cps) {
  return { cps, firstFin: null, over: false, racers: lobby.players.map((p) => ({ id: p.id, name: p.name, times: [], mask: 0, st: 'run' })) };
}
// near: the host found a buffered pose of that racer close enough
export function acceptCp(race, id, i, t, near) {
  const p = runner(race, id);
  if (!p || !near || !okTime(t) || !Number.isInteger(i) || i < 0 || i >= race.cps || p.mask & (1 << i)) return { ok: false, race };
  return { ok: true, race: withRacer(race, id, (q) => ({ ...q, times: stamp(q, t), mask: q.mask | (1 << i) })) };
}
export function acceptFinish(race, id, t, near, now) {
  const p = runner(race, id);
  if (!p || !near || !okTime(t) || p.mask !== (1 << race.cps) - 1) return { ok: false, race };
  const next = withRacer(race, id, (q) => ({ ...q, times: stamp(q, t), st: 'fin' }));
  return { ok: true, race: { ...next, firstFin: race.firstFin ?? now } };
}
export function dropRacer(race, id) { return runner(race, id) ? withRacer(race, id, (q) => ({ ...q, st: 'dnf' })) : race; }
export function tickRace(race, now) {
  if (race.firstFin === null || now - race.firstFin < RACE.dnf) return race;
  return settle({ ...race, racers: race.racers.map((p) => (p.st === 'run' ? { ...p, st: 'dnf' } : p)) });
}
// nearPoint(poses, pt) — a buffered pose within radius + slack of the point (x/z only)
export function nearPoint(poses, pt) { return poses.some((q) => Math.hypot(q.x - pt.x, q.z - pt.z) <= RACE.radius + RACE.slack); }
```

## Task 3: `standings` and `boardRows`

Failing test:

```js
test('standings_order_ties_gaps', () => {
  const rows = [
    { id: 0, name: 'A', times: [1000], st: 'run' },
    { id: 1, name: 'B', times: [900, 2000], st: 'run' },
    { id: 2, name: 'C', times: [800, 1900, 5000], st: 'fin' },
    { id: 3, name: 'D', times: [1000], st: 'run' },
  ];
  const s = standings(rows);
  assert.deepEqual(s.map((r) => r.id), [2, 1, 0, 3]);              // fin, more passes, tie → lower id
  assert.deepEqual(s.map((r) => r.pos), [1, 2, 3, 4]);
  assert.deepEqual(s.map((r) => r.gap), [-100, 100, 100, 0]);      // B 2000 vs C 1900; A 1000 vs B 900; D vs A
  assert.equal(standings([{ id: 0, name: 'A', times: [], st: 'run' }])[0].gap, null);
  assert.deepEqual(standings([{ id: 0, name: 'A', times: [], st: 'dnf' }, { id: 1, name: 'B', times: [], st: 'run' }]).map((r) => r.id), [1, 0]);
});
test('boardRows_dropsMask', () => assert.deepEqual(boardRows(createRace(lobby2, 1))[0], { id: 0, name: 'A', times: [], st: 'run' }));
```

Implement:

```js
const GROUP = { fin: 0, run: 1, dnf: 2 };
const last = (r) => r.times[r.times.length - 1] ?? Infinity;
function compare(a, b) {
  if (GROUP[a.st] !== GROUP[b.st]) return GROUP[a.st] - GROUP[b.st];
  if (a.st !== 'fin' && a.times.length !== b.times.length) return b.times.length - a.times.length;
  if (a.st !== 'dnf' && last(a) !== last(b)) return last(a) - last(b);
  return a.id - b.id;
}
const gapTo = (r, ahead) => (r.times.length && ahead.times.length >= r.times.length ? last(r) - ahead.times[r.times.length - 1] : null);
export function standings(rows) {
  const s = [...rows].sort(compare).map((r, k) => ({ ...r, pos: k + 1, gap: null }));
  for (let k = 1; k < s.length; k++) s[k].gap = gapTo(s[k], s[k - 1]);
  if (s.length > 1 && s[1].gap !== null) s[0].gap = -s[1].gap;
  return s;
}
export function boardRows(race) { return race.racers.map(({ id, name, times, st }) => ({ id, name, times, st })); }
```

## Task 4: messages (netcodec.js)

Append to `tests/netcodec.test.mjs` (its `P` helper; the existing race-without-`t0` refusal stays green):

```js
test('parseMessage_raceMessages', () => {
  assert.deepEqual(P({ type: 'start', mode: 'race', t0: 5000, now: 1000 }), { type: 'start', mode: 'race', t0: 5000, now: 1000 });
  assert.equal(P({ type: 'start', mode: 'race', t0: 'x', now: 1 }), null);
  assert.deepEqual(P({ type: 'cp', i: 2, t: 4100 }), { type: 'cp', i: 2, t: 4100 });
  for (const bad of [{ i: 16, t: 1 }, { i: 1.5, t: 1 }, { i: 0, t: -1 }, { i: 0, t: 3600001 }]) assert.equal(P({ type: 'cp', ...bad }), null);
  assert.deepEqual(P({ type: 'finish', t: 9 }), { type: 'finish', t: 9 });
  assert.deepEqual(P({ type: 'cpno', i: -1 }), { type: 'cpno', i: -1 });
  assert.deepEqual(P({ type: 'back', x: 1 }), { type: 'back' });
});
test('parseMessage_board', () => {
  const row = { id: 0, name: 'A', times: [1, 2], st: 'run' };
  assert.deepEqual(P({ type: 'board', over: false, rows: [row] }), { type: 'board', over: false, rows: [row] });
  for (const bad of [{ ...row, times: [2, 1] }, { ...row, st: 'won' }, { ...row, id: 4 }, { ...row, times: Array(18).fill(1) }, { ...row, name: '' }])
    assert.equal(P({ type: 'board', over: false, rows: [bad] }), null);
  assert.equal(P({ type: 'board', over: false, rows: [row, row] }), null);   // duplicate id
  assert.equal(P({ type: 'board', over: 1, rows: [row] }), null);
});
```

Implement: `START_MODES = ['cruise', 'race']` (update its comment), plus:

```js
const RACE_MS = 3600000, CP_MAX = 15, TIMES_MAX = 17, ST = ['run', 'fin', 'dnf'];
const raceTime = (t) => finite(t) && t >= 0 && t <= RACE_MS;
const cpIndex = (i, lo) => Number.isInteger(i) && i >= lo && i <= CP_MAX;
function parseStart(m) {
  if (!START_MODES.includes(m.mode)) return null;
  if (m.mode !== 'race') return { type: 'start', mode: m.mode };
  return finite(m.t0) && finite(m.now) ? { type: 'start', mode: 'race', t0: m.t0, now: m.now } : null;
}
function parseRow(r) {
  if (!r || typeof r !== 'object' || !Number.isInteger(r.id) || r.id < 0 || r.id >= MAX_PLAYERS) return null;
  const name = cleanName(r.name);
  if (!name || !ST.includes(r.st) || !Array.isArray(r.times) || r.times.length > TIMES_MAX) return null;
  if (!r.times.every((t, k) => raceTime(t) && (k === 0 || t >= r.times[k - 1]))) return null;
  return { id: r.id, name, times: [...r.times], st: r.st };
}
function parseBoard(m) {
  if (typeof m.over !== 'boolean' || !Array.isArray(m.rows) || m.rows.length < 1 || m.rows.length > MAX_PLAYERS) return null;
  const rows = m.rows.map(parseRow);
  if (rows.some((r) => r === null) || new Set(rows.map((r) => r.id)).size !== rows.length) return null;
  return { type: 'board', over: m.over, rows };
}
// VALIDATORS: start: parseStart (replaces the old), board: parseBoard, back: () => ({ type: 'back' }),
// cp: (m) => (cpIndex(m.i, 0) && raceTime(m.t) ? { type: 'cp', i: m.i, t: m.t } : null),
// finish: (m) => (raceTime(m.t) ? { type: 'finish', t: m.t } : null),
// cpno: (m) => (cpIndex(m.i, -1) ? { type: 'cpno', i: m.i } : null),
```


## Task 5: full node suite

`node --test tests/*.test.mjs` green. Commit `feat(multiplayer): race rules and messages, pure (#837 part a)`. Not player-visible: no CHANGELOG entry.
