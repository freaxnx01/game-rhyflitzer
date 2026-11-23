# Opponent progress list (#1119) Implementation Plan

**Goal:** in a network race the HUD lists, per opponent, `Name · 3/8 · 240 m` (passed checkpoints, metres to their next one).
**Spec:** `docs/superpowers/specs/2026-11-23-mp-opponent-progress-design.md`
**Constraints:** buildless vanilla JS, no new files besides tests, no framework. Edit only the functions named below (#1115/#1110/#1112/#1111 touch `index.html` and `strings.js` too; keep hunks small and local).
**Verify:** `node --test tests/netrace.test.mjs tests/netcodec.test.mjs`, then all `node --test tests/*.test.mjs`. One Playwright file at most: `env PW_CDP_ENDPOINT= systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_multiplayer_race_cp.py -x`.

## Task 1: board rows carry the pass mask (TDD)

**Files:** `netrace.js`, `netcodec.js`, `tests/netrace.test.mjs`, `tests/netcodec.test.mjs`

- [ ] Failing tests first. In `tests/netrace.test.mjs` (`boardRows` is already imported where used; add to the import if not):

```js
test('boardRows_includesMask', () => {
  const r = createRace(addPlayer(createLobby('hochrhein', 'A'), 'B').lobby, 4);
  const a = acceptCp(r, 0, 2, 1000, true).race;
  assert.equal(boardRows(a)[0].mask, 4);   // bit 2
  assert.equal(boardRows(a)[1].mask, 0);
});
```

In `tests/netcodec.test.mjs`, next to `parseMessage_board`:

```js
test('parseMessage_boardMask', () => {
  const row = { id: 0, name: 'A', times: [100], st: 'run', mask: 5 };
  assert.deepEqual(P({ type: 'board', over: false, rows: [row] }), { type: 'board', over: false, rows: [row] });
  for (const bad of [-1, 1.5, 1 << CP_MAX, 'x', null])
    assert.equal(P({ type: 'board', over: false, rows: [{ ...row, mask: bad }] }), null);
});
```

(`CP_MAX` must be in that file's import from `../netcodec.js`; add it if missing. The existing `parseMessage_board` test has rows without `mask` and must stay green: an absent mask stays absent.)

- [ ] Run the two files: new tests fail.
- [ ] `netrace.js`, replace `boardRows` (line ~153):

```js
// boardRows(race) — the rows of a `board` message: id, name, times, st, mask (which checkpoints were passed, for the opponent list #1119).
export function boardRows(race) { return race.racers.map(({ id, name, times, st, mask }) => ({ id, name, times, st, mask })); }
```

- [ ] `netcodec.js`, in `parseRow` (line ~203) validate and keep an optional mask. Replace its final `return`:

```js
  if (r.mask !== undefined && (!Number.isInteger(r.mask) || r.mask < 0 || r.mask >= (1 << CP_MAX))) return null;
  return r.mask === undefined ? { id: r.id, name, times: [...r.times], st: r.st } : { id: r.id, name, times: [...r.times], st: r.st, mask: r.mask };
```

- [ ] Run both files: green. If an existing `boardRows` test used `deepEqual` on the old shape, update its expected value to include `mask` (the shape change is the requirement). Commit `feat(multiplayer): board rows carry the checkpoint mask (#1119)`.

## Task 2: pure `nextCheckpoint` and `opponentRows` (TDD)

**Files:** `netrace.js`, `tests/netrace.test.mjs`

- [ ] Failing tests (add both names to the import line):

```js
const CPS3 = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 300, z: 0 }];

test('nextCheckpoint_nearestUnpassed', () => {
  assert.equal(nextCheckpoint(0b001, CPS3, { x: 290, z: 0 }), 2);   // 0 is passed, 2 is nearer than 1
  assert.equal(nextCheckpoint(0b111, CPS3, { x: 0, z: 0 }), -1);    // all passed
});

test('opponentRows_runningFinishedDnfNoPose', () => {
  const rows = [
    { id: 0, name: 'Me', times: [], st: 'run', mask: 0 },
    { id: 1, name: 'A', times: [1, 2], st: 'run', mask: 0b011 },
    { id: 2, name: 'B', times: [1, 2, 3], st: 'run', mask: 0b111 },
    { id: 3, name: 'C', times: [], st: 'dnf', mask: 0 },
  ];
  const posOf = (id) => (id === 3 ? null : { x: 0, z: 0 });
  const out = opponentRows(rows, 0, CPS3, { x: 0, z: 50 }, posOf);
  assert.deepEqual(out.map((r) => r.id), [1, 2, 3]);            // own row left out
  assert.deepEqual([out[0].done, out[0].total, out[0].dist], [2, 3, 300]);
  assert.equal(out[1].dist, 50);                                  // all passed: distance to the finish
  assert.equal(out[2].dist, null);                                // dnf / no pose
});

test('opponentRows_finished_noDistance', () => {
  const out = opponentRows([{ id: 1, name: 'A', times: [1, 2, 3, 4], st: 'fin', mask: 7 }], 0, CPS3, { x: 0, z: 0 }, () => ({ x: 0, z: 0 }));
  assert.equal(out[0].dist, null);
});
```

- [ ] Run: fail. Add to `netrace.js` after `standings`:

```js
// nextCheckpoint(mask, cps, pos) — index of the nearest checkpoint the racer has not passed (any order), or -1 when all are passed.
export function nextCheckpoint(mask, cps, pos) {
  let best = -1, bestD = Infinity;
  cps.forEach((c, i) => {
    if (mask & (1 << i)) return;
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// opponentRows(rows, you, cps, finish, posOf) — one entry per opponent for the HUD list (#1119): done/total checkpoints and the
// straight-line metres to the next target (the nearest open checkpoint, the finish once all are passed). dist is null for a racer
// who is not running or whose pose is unknown. posOf(id) returns { x, z } or null.
export function opponentRows(rows, you, cps, finish, posOf) {
  return [...rows].filter((r) => r.id !== you).sort((a, b) => a.id - b.id).map((r) => {
    const mask = r.mask ?? 0, pos = r.st === 'run' ? posOf(r.id) : null;
    const done = cps.filter((_, i) => mask & (1 << i)).length;
    let dist = null;
    if (pos) {
      const i = nextCheckpoint(mask, cps, pos), target = i < 0 ? finish : cps[i];
      dist = Math.round(Math.hypot(target.x - pos.x, target.z - pos.z));
    }
    return { id: r.id, name: r.name, st: r.st, done, total: cps.length, dist };
  });
}
```

- [ ] Run `node --test tests/netrace.test.mjs`: green. Commit `feat(multiplayer): opponent progress rows (#1119)`.

## Task 3: strings (de + en)

**Files:** `strings.js`

- [ ] In the English block next to `mpPos` (line ~871) add:

```js
  mpOpp: (name, done, total, dist) => `${name} · ${done}/${total} · ${dist}`,
  mpOppFin: (name) => `${name} · Finish`,
```

- [ ] In the German block next to `mpPos` (line ~1740) add:

```js
  mpOpp: (name, done, total, dist) => `${name} · ${done}/${total} · ${dist}`,
  mpOppFin: (name) => `${name} · im Ziel`,
```

`DNF` rows reuse the existing `mpDnf` (`${name} · ${tr('mpDnf')}`). If a test checks that en and de have identical keys, both blocks above satisfy it. Run `node --test tests/*.test.mjs`. Commit `feat(i18n): opponent progress strings (#1119)`.

## Task 4: HUD block and rendering (`index.html`)

**Files:** `index.html`, `CHANGELOG.md`

- [ ] Markup, directly after `<div id="netpos" hidden></div>` (line ~534):

```html
    <div id="netopp" hidden></div>
```

- [ ] CSS, after the `#netpos{...}` rule (line 43):

```css
#netopp{font-size:14px;font-weight:600;color:var(--steel);text-align:right}
```

- [ ] Add `nextCheckpoint, opponentRows` to the `netrace.js` import on line 1042 (only `opponentRows` is used by `index.html`; import just that).
- [ ] Add after `renderNetPos` (line ~7170):

```js
// #1119: one HUD row per opponent: passed checkpoints and metres to their next one; text only, names via textContent
const oppDist = (m) => `${m.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`;
function oppText(r) {
  if (r.st === 'fin') return tr('mpOppFin', r.name);
  if (r.st === 'dnf') return `${r.name} · ${tr('mpDnf')}`;
  return tr('mpOpp', r.name, r.done, r.total, r.dist === null ? '—' : oppDist(r.dist));
}
function renderNetOpp() {
  const el = $('netopp'), rows = NET.race?.board;
  el.hidden = !rows;
  if (!rows) return;
  const posOf = (id) => { const p = NETCARS.get(id)?.track.poses; const q = p && p[p.length - 1]; return q ? { x: q.x, z: q.z } : null; };
  const lines = opponentRows(rows, NET.you, CPS, FINISH, posOf).map((r) => { const d = document.createElement('div'); d.textContent = oppText(r); return d; });
  el.replaceChildren(...lines);
}
```

- [ ] Wire it: in `netApplyBoard` (line ~7162) call `renderNetOpp();` after `renderNetPos();`; in the `gg-langchange` handler (line ~8040) add `renderNetOpp();` after `renderNetPos();`; at session end next to `$('netpos').hidden = true;` (line ~7243) add `$('netopp').hidden = true;`.
- [ ] Throttle from the loop: in `stepNetRace` (line ~7143), as the first line inside the function body add:

```js
  if (NET.race?.board && performance.now() - (NET.oppAt ?? 0) > 250) { NET.oppAt = performance.now(); renderNetOpp(); }
```

- [ ] Add to the `window.__mm.netRace` debug hook (line ~7519) a field `opp: $('netopp').textContent` so a test can read it.
- [ ] `CHANGELOG.md` under `## [Unreleased]` / `### Added`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:
  `- \`<timestamp>\` In a multiplayer race the HUD lists each **opponent** with their **checkpoints** passed and the metres to the next one.`
- [ ] Run `node --test tests/*.test.mjs` (green). Optionally extend `tests/test_multiplayer_race_cp.py` with one assertion that `__mm.netRace().opp` contains `/ ` + the checkpoint count after the host passes a checkpoint; run only that file with the command at the top. Commit `feat(multiplayer): opponent checkpoints and distance in the HUD (#1119)`.

## Acceptance check (manual, two devices)

- [ ] Race of 2: the guest sees `Host · 0/N · <m> m` under the position line, the host sees the guest the same way.
- [ ] After a pass the count rises and the metres jump to the next checkpoint. Off-screen opponents still show.
- [ ] Finish and DNF show `im Ziel` / `Finish` and `nicht im Ziel` / `DNF`. Switching DE/EN relabels at once. The list is gone in the lobby and after Back to lobby.
