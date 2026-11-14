# Multiplayer: funny default player names (plan, #979)

> Carry out task by task. Spec: `docs/superpowers/specs/2026-11-14-mp-funny-default-names-design.md`. Requires #980 on `main`.

**Goal:** the connect dialog opens with a funny name; a typed name stays; the host renames a colliding generated name.

**Architecture:** pure `netnames.js` (pool parsing, pick, unique pick); `hello` gets `custom`; `admitHello` takes an optional
rename policy; `index.html` prefills in `openMp` and applies the rule in `netTakeName` / `netHostHello`.

## Global constraints

- Files: `netnames.js` (new), `netcodec.js`, `netrace.js`, `index.html`, `strings.js`, `tests/netnames.test.mjs` (new),
  `tests/netcodec.test.mjs`, `tests/netrace.test.mjs`, `tests/test_multiplayer_lobby.py`, `CHANGELOG.md`.
- Existing `admitHello(lobby, name, running)` callers and tests keep working (the fourth argument is optional).
- Run `node --test tests/netnames.test.mjs tests/netcodec.test.mjs tests/netrace.test.mjs tests/strings.test.mjs`, then only
  `tests/test_multiplayer_lobby.py` (foreground, `PW_CDP_ENDPOINT=http://192.168.1.120:9223`). No full suite. Red after 3 attempts: stop.
- German strings: `Du`, umlauts. Push before the browser run.

### Task 1: names module and pools

**Files:** `tests/netnames.test.mjs`, `netnames.js`, `strings.js`

- [ ] **Step 1: Failing test** `tests/netnames.test.mjs`:

```js
// #979: funny default player names. Pure module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePool, funnyName, uniqueFunnyName } from '../netnames.js';
import { STRINGS } from '../strings.js';
import { NAME_MAX } from '../netcodec.js';

const POOL = ['Turbo Tony', 'Pedal Pete', 'Idle Ida'];

test('pools_bothLanguages_fourteenShortDistinctNames', () => {
  for (const lang of ['en', 'de']) {
    const pool = parsePool(STRINGS[lang].mpFunnyNames);
    assert.equal(pool.length, 14, lang);
    assert.equal(new Set(pool.map((n) => n.toLowerCase())).size, 14, lang);
    assert.ok(pool.every((n) => n.length >= 3 && n.length <= 17 && n.length + 2 <= NAME_MAX), lang);
  }
});

test('funnyName_rndPicksByIndex', () => {
  assert.equal(funnyName(POOL, () => 0), 'Turbo Tony');
  assert.equal(funnyName(POOL, () => 0.99), 'Idle Ida');
});

test('uniqueFunnyName_takenIgnoringCase_picksAFreeOne', () => {
  for (let i = 0; i < 20; i++) assert.notEqual(uniqueFunnyName(POOL, ['turbo tony', ' PEDAL PETE ']), 'Turbo Tony');
  assert.equal(uniqueFunnyName(POOL, ['turbo tony', 'Pedal Pete']), 'Idle Ida');
});

test('uniqueFunnyName_poolExhausted_numberedSuffix', () => {
  const name = uniqueFunnyName(POOL, [...POOL, 'Turbo Tony 2'], () => 0);
  assert.equal(name, 'Turbo Tony 3');
});
```

- [ ] **Step 2: Implement** `netnames.js` (red first):

```js
// netnames.js — #979: funny default names for the multiplayer dialog. Pure module; the pool text lives in strings.js.
import { NAME_MAX } from './netcodec.js';

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const isTaken = (taken, name) => taken.some((t) => same(t, name));

export const parsePool = (text) => String(text).split('|').map((n) => n.trim()).filter(Boolean);
export const funnyName = (pool, rnd = Math.random) => pool[Math.floor(rnd() * pool.length)];

// uniqueFunnyName(pool, taken, rnd) — a pool name nobody has; with the pool used up, one with " 2", " 3" ... appended
export function uniqueFunnyName(pool, taken, rnd = Math.random) {
  const free = pool.filter((n) => !isTaken(taken, n));
  if (free.length) return funnyName(free, rnd);
  const base = funnyName(pool, rnd);
  let n = 2;
  while (isTaken(taken, `${base} ${n}`)) n++;
  return `${base} ${n}`.slice(0, NAME_MAX);
}
```

- [ ] **Step 3: Pools.** `strings.js` en, after `mpNamePlaceholder`: `mpFunnyNames: 'Turbo Tony|Pedal Pete|Roundabout Rita|Pothole Paul|Rhine Rocket|Idle Ida|Blinker Bea|Speedy Sam|Nitro Nelly|Fender Fred|Full-Throttle Flo|Handbrake Hank|Gearbox Gina|Slipstream Sue'`;
  de: `mpFunnyNames: 'Turbo-Toni|Gaspedal-Gerda|Kreisel-Kurt|Pannen-Paul|Rhy-Rocket|Leerlauf-Lars|Blinker-Bea|Schlagloch-Sämi|Tempo-Tamara|Benzin-Beni|Vollgas-Vreni|Rückspiegel-Rolf|Nitro-Nelly|Kolbe-Köbi'`.
  Remove `mpNeedName` from both languages. Run `node --test tests/netnames.test.mjs tests/strings.test.mjs`. Commit `feat(multiplayer): funny default name pools (#979)`.

### Task 2: hello flag and host-side rename

**Files:** `tests/netcodec.test.mjs`, `netcodec.js`, `tests/netrace.test.mjs`, `netrace.js`

- [ ] **Step 1: Failing tests.** `tests/netcodec.test.mjs` line 41 becomes
  `assert.deepEqual(P({ type: 'hello', name: '  Kicsi\x07 ' }), { type: 'hello', name: 'Kicsi', custom: false });` plus
  `assert.deepEqual(P({ type: 'hello', name: 'Ben', custom: true }), { type: 'hello', name: 'Ben', custom: true });` and
  `assert.equal(P({ type: 'hello', name: 'Ben', custom: 'yes' }).custom, false);`. Add to `tests/netrace.test.mjs` (import `uniqueFunnyName` not needed):

```js
// #979: a generated name that collides gets another one; a typed name stays
const POOL = ['Turbo Tony', 'Pedal Pete', 'Idle Ida'];
test('admitHello_autoNameCollides_hostGivesAnotherPoolName', () => {
  const l = createLobby('hochrhein', 'Turbo Tony');
  const added = admitHello(l, 'turbo tony', false, { custom: false, pool: POOL });
  const name = added.lobby.players[1].name;
  assert.ok(POOL.includes(name) && name !== 'Turbo Tony', name);
});

test('admitHello_typedNameCollides_nameStays', () => {
  const l = createLobby('hochrhein', 'Anna');
  assert.equal(admitHello(l, 'Anna', false, { custom: true, pool: POOL }).lobby.players[1].name, 'Anna');
  assert.equal(admitHello(l, 'Anna', false).lobby.players[1].name, 'Anna', 'no policy: unchanged');
});

test('admitHello_autoNameFree_unchanged', () => {
  const l = createLobby('hochrhein', 'Anna');
  assert.equal(admitHello(l, 'Idle Ida', false, { custom: false, pool: POOL }).lobby.players[1].name, 'Idle Ida');
});
```

- [ ] **Step 2: Implement** (red first). `netcodec.js` hello validator:
  `hello: (m) => { const name = cleanName(m.name); return name ? { type: 'hello', name, custom: m.custom === true } : null; },`.
  `netrace.js`: import `uniqueFunnyName` from `./netnames.js`; replace `admitHello` with

```js
// admitHello(lobby, name, running, { custom, pool, rnd }) — ... as before; a non-custom name that clashes (any case) with a
// name in the lobby is swapped for a free pool name (#979); a custom name always stays
export function admitHello(lobby, name, running, { custom = true, pool = [], rnd } = {}) {
  if (running) return { deny: 'started' };
  const taken = lobby.players.map((p) => p.name);
  const clash = taken.some((t) => t.trim().toLowerCase() === name.trim().toLowerCase());
  const final = !custom && clash && pool.length ? uniqueFunnyName(pool, taken, rnd) : name;
  return addPlayer(lobby, final) || { deny: 'full' };
}
```

  Run the node tests; commit `feat(multiplayer): the host renames a colliding generated name (#979)`.

### Task 3: dialog (`index.html`)

- [ ] **Step 1: State and imports.** Import `funnyName, parsePool` from `./netnames.js`. Add to `NET`:
  `autoName: null,      // the generated name sitting in the field, or null` and `nameCustom: false,`.
  Add `const namePool = () => parsePool(tr('mpFunnyNames'));` next to `storedMpName`.
- [ ] **Step 2: Prefill** in `openMp`: replace `$('mpname').value = storedMpName();` with
  `NET.autoName = storedMpName() ? null : funnyName(namePool()); $('mpname').value = storedMpName() || NET.autoName;`.
- [ ] **Step 3: Take the name.** Replace `netTakeName` with:

```js
function netTakeName() {
  const typed = cleanName($('mpname').value);
  NET.nameCustom = typed !== null && typed !== NET.autoName;
  NET.name = typed || funnyName(namePool());
  $('mpname').value = NET.name;
  if (NET.nameCustom) try { localStorage.setItem(MP_NAME_KEY, NET.name); } catch (e) { /* a private window keeps nothing */ }
  return NET.name;
}
```

  It no longer returns null: in `netHostStart` use `const name = netTakeName();` without the guard; in `netGuestAnswer` call
  `netTakeName();` without `if (!...) return`. Delete the now-unused `mpNeedName` text check.
- [ ] **Step 3b: Hello.** The guest's hello (in `netPeerState`, `state === 'open'`) becomes
  `{ type: 'hello', name: NET.name, custom: NET.nameCustom }`. `netHostMessage`: `netHostHello(peerId, msg.name, msg.custom)`;
  `netHostHello(peerId, name, custom)` calls `admitHello(NET.lobby, name, !!NET.session, { custom, pool: namePool() })`.
- [ ] **Step 4: Browser test.** In `tests/test_multiplayer_lobby.py` give `connect(host, guest, named=True)` a flag that skips the two
  `fill("#mpname", ...)` lines when False, and append:

```python
def test_default_names_are_filled_and_unique(pair):
    """#979: no typing needed; the lobby holds two different, non-empty names."""
    host, guest, errors = pair
    connect(host, guest, named=False)
    found = names(host)
    assert len(found) == 2 and len(set(n.lower() for n in found)) == 2 and all(found), found
    assert names(guest) == found and not errors
```

  Run the node tests and `tests/test_multiplayer_lobby.py`.
- [ ] **Step 5: CHANGELOG** `[Unreleased]` / `### Added`, player voice, dated like neighbours: Im Mehrspieler ist schon ein **lustiger Name** eingetragen; wer einen eigenen tippt, behält ihn. Commit `feat(multiplayer): funny default player names (#979)`; push.
