# Game: Umami stats (#538) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The main game tells the self-hosted Umami (`stats.freaxnx01.ch`) which vehicle is chosen (start, every change, incl. `?vehicle=`), which mode is started and ended, how the player moves (car, foot, heli, train, hideout, building), jumps, and the language, without cookies, positions or the query string, honouring Do-Not-Track, and never breaking the game when the script is blocked.

**Architecture:** A pure root module `analytics.js` (tracker with a start-up queue, `pageUrl`, shapers, a settle-and-dedup change reporter) imported by the game module in `index.html`. A 1 s `setInterval` samples game state into two change reporters; the only edits to existing game functions are one-line appends (`startRace`, `finish`, `endHunt`, `timeUp`, `toMainMenu`, `placeOnRoad`). Mode tracking is generic over `MODES` (`startscreen.js:4`), so Cruising (#551) needs nothing.

**Tech Stack:** Vanilla ES modules, buildless; Node 24 `node --test`; one Playwright (Python) file.

**Spec:** `docs/superpowers/specs/2026-10-31-game-umami-analytics-design.md`

## Global Constraints

- Buildless: no `package.json`, no bundler, no new dependency. `analytics.js` has no DOM and no three.js imports.
- Never send: any x / z / lat / lon, the query string, the world id (a generated world is region `world`), typed text, times unrounded. No cookies, nothing written to localStorage by analytics.
- Every call into `window.umami` is inside try/catch; a missing or blocked `umami` is a silent no-op.
- Do not edit `editor/analytics.js` or `editor/*`.
- Surgical edits in `index.html`: it is one-line-per-function code with many open PRs; append to the lines named below, do not reformat.
- German text: real umlauts, `ss` for ß, capitalised Du/Dein where addressed. `strings.js` `en` and `de` must keep exactly the same keys.
- Do not run the full Playwright suite (about 2 h). Run: `node --test tests/*.test.mjs` and `pytest tests/test_analytics.py tests/test_about.py tests/test_about_tabs.py -x` in the foreground (never `run_in_background`).
- Commit and push the branch before the Playwright run.

## File Structure

- Create `analytics.js` (pure module, about 110 lines)
- Create `tests/analytics.test.mjs`
- Create `tests/test_analytics.py`
- Modify `index.html` (import, tag, wiring block, six one-line appends, About paragraph)
- Modify `strings.js` (`aboutPrivacy`, `aboutPrivacyLink` in `en` and `de`)
- Modify `about.js` (`ABOUT_LINKS.privacy`), `tests/about.test.mjs` (the agreed key list)
- Modify `README.md` (`## Datenschutz / Privacy`), `CHANGELOG.md`, `tests/test-map.json`

---

### Task 1: `analytics.js` and its node tests (TDD)

**Files:**
- Create: `analytics.js`
- Create: `tests/analytics.test.mjs`

**Interfaces (all exported from `analytics.js`):**
`createTracker({ getUmami, maxQueue }) -> { track(...args), settle() }`, default instance `track`, `settle`, `trackPageview()`; `pageUrl(loc)`, `pageviewProps(props)`; `createChangeReporter({ send, name, initial, settleMs, max, shape }) -> { update(value, nowMs), flush() }`; shapers `roundSeconds`, `regionId`, `vehicleSource`, `vehicleData`, `activityOf`, `activityData`, `modeData`, `modeEndData`, `jumpData`; constants `MAX_TEXT`, `SETTLE_MS`, `MAX_QUEUE`, `MAX_CHANGES`.

- [ ] **Step 1: Write the failing test**

Create `tests/analytics.test.mjs`:

```js
// #538: what the game tells Umami. Pure; node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTracker, pageUrl, pageviewProps, createChangeReporter, roundSeconds, regionId, vehicleSource, vehicleData,
  activityOf, activityData, modeData, modeEndData, jumpData, MAX_TEXT,
} from '../analytics.js';

const MODES = ['trial', 'blitz', 'hunt'];
const fakeUmami = () => { const calls = []; return { calls, track: (...a) => calls.push(a) }; };

test('tracker: sends straight to umami when it is there', () => {
  const u = fakeUmami(), t = createTracker({ getUmami: () => u });
  t.track('x', { a: 1 });
  assert.deepEqual(u.calls, [['x', { a: 1 }]]);
});

test('tracker: events before umami exists wait, settle() flushes them in order', () => {
  let u; const t = createTracker({ getUmami: () => u });
  t.track('a'); t.track('b', { n: 2 });
  u = fakeUmami(); t.settle();
  assert.deepEqual(u.calls, [['a'], ['b', { n: 2 }]]);
});

test('tracker: settle() without umami drops the queue and later calls are a silent no-op', () => {
  const t = createTracker({ getUmami: () => undefined });
  t.track('a'); t.settle(); t.track('b');
  assert.doesNotThrow(() => t.settle());
});

test('tracker: umami arriving before settle() is flushed before the next event', () => {
  let u; const t = createTracker({ getUmami: () => u });
  t.track('a'); u = fakeUmami(); t.track('b');
  assert.deepEqual(u.calls.map((c) => c[0]), ['a', 'b']);
});

test('tracker: the queue is capped', () => {
  let u; const t = createTracker({ getUmami: () => u, maxQueue: 3 });
  for (let i = 0; i < 10; i++) t.track(`e${i}`);
  u = fakeUmami(); t.settle();
  assert.equal(u.calls.length, 3);
});

test('tracker: a throwing umami and a getter that throws never escape', () => {
  const boom = { track: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => createTracker({ getUmami: () => boom }).track('x'));
  assert.doesNotThrow(() => createTracker({ getUmami: () => { throw new Error('x'); } }).track('x'));
  assert.doesNotThrow(() => createTracker({ getUmami: () => ({}) }).track('x'));   // no .track function
});

test('pageUrl: the path plus utm tags only, never the world id, vehicle or dev flag', () => {
  assert.equal(pageUrl({ pathname: '/', search: '?world=abc123&vehicle=mini&dev=1' }), '/');
  assert.equal(pageUrl({ pathname: '/', search: '?utm_source=nfz&utm_medium=print&utm_campaign=okt&world=abc' }), '/?utm_source=nfz&utm_medium=print&utm_campaign=okt');
  assert.equal(pageUrl({ pathname: '/editor/', search: '' }), '/editor/');
  assert.ok(pageUrl({ pathname: '/', search: `?utm_source=${'x'.repeat(200)}` }).length <= '/?utm_source='.length + MAX_TEXT);
});

test('pageviewProps keeps umami props and replaces the url', () => {
  globalThis.location = { pathname: '/', search: '?world=secret' };
  try { assert.deepEqual(pageviewProps({ website: 'w', url: '/?world=secret', referrer: 'r' }), { website: 'w', url: '/', referrer: 'r' }); }
  finally { delete globalThis.location; }
});

test('roundSeconds: steps of 5, bad input is 0', () => {
  assert.equal(roundSeconds(62.4), 60); assert.equal(roundSeconds(63), 65); assert.equal(roundSeconds(-1), 0);
  assert.equal(roundSeconds(NaN), 0); assert.equal(roundSeconds(undefined), 0);
});

test('regionId: a generated world is just "world", never its id', () => {
  assert.equal(regionId({ id: 'hochrhein' }), 'hochrhein');
  assert.equal(regionId({ id: 'world:abc123', worldId: 'abc123', generated: true }), 'world');
  assert.equal(regionId(undefined), 'unknown');
});

test('vehicleSource: query beats stored beats default; an unknown ?vehicle= is ignored', () => {
  const ids = ['compact', 'mini'];
  assert.equal(vehicleSource('?vehicle=mini', '{"id":"compact"}', ids), 'query');
  assert.equal(vehicleSource('?vehicle=nope', '{"id":"compact"}', ids), 'stored');
  assert.equal(vehicleSource('', null, ids), 'default');
});

test('vehicleData / jumpData: cut to MAX_TEXT, empty means none / unknown', () => {
  assert.deepEqual(vehicleData('mini', 'compact'), { vehicle: 'mini', previous: 'compact' });
  assert.equal(vehicleData('mini', null).previous, 'none');
  assert.equal(jumpData('x'.repeat(200)).target.length, MAX_TEXT);
  assert.deepEqual(jumpData(''), { target: 'unknown' });
});

test('activityOf: train beats hideout beats building beats foot beats heli, else car', () => {
  const base = { train: false, level: 'surface', indoors: false, house: '6c', foot: false, fly: false };
  assert.equal(activityOf(base), 'car');
  assert.equal(activityOf({ ...base, fly: true }), 'heli');
  assert.equal(activityOf({ ...base, foot: true, fly: true }), 'foot');
  assert.equal(activityOf({ ...base, foot: true, indoors: true }), 'building:6c');
  assert.equal(activityOf({ ...base, foot: true, indoors: true, level: 'ring1' }), 'hideout');
  assert.equal(activityOf({ ...base, train: true, level: 'ring1' }), 'train');
});

test('activityData: kind, from and the place of a building', () => {
  assert.deepEqual(activityData('foot', 'car'), { activity: 'foot', from: 'car' });
  assert.deepEqual(activityData('building:6c', 'foot'), { activity: 'building', from: 'foot', place: '6c' });
  assert.deepEqual(activityData('car', 'building:6c'), { activity: 'car', from: 'building' });
});

test('modeData is generic over the MODES list: a new mode counts, a stranger is "unknown"', () => {
  assert.deepEqual(modeData('blitz', MODES, null), { mode: 'blitz', previous: 'none' });
  assert.deepEqual(modeData('trial', MODES, 'hunt'), { mode: 'trial', previous: 'hunt' });
  assert.equal(modeData('cruising', MODES, null).mode, 'unknown');
  assert.equal(modeData('cruising', [...MODES, 'cruising'], 'trial').mode, 'cruising');
  assert.equal(modeData('trial', MODES, 'whatever').previous, 'none');
});

test('modeEndData: rounded seconds, known outcomes only', () => {
  assert.deepEqual(modeEndData({ mode: 'trial', outcome: 'finished', seconds: 123.4 }, MODES), { mode: 'trial', outcome: 'finished', seconds: 125 });
  assert.equal(modeEndData({ mode: 'trial', outcome: 'quit', seconds: 1 }, MODES).outcome, 'unknown');
  assert.equal(modeEndData({ mode: 'x', outcome: 'timeup', seconds: 1 }, MODES).mode, 'unknown');
});

const reporter = (opts = {}) => { const sent = []; const r = createChangeReporter({ send: (n, d) => sent.push([n, d]), name: 'vehicle', initial: 'compact', shape: vehicleData, ...opts }); return { r, sent }; };

test('change reporter: a value that holds for the settle time is sent once', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.update('mini', 1000); assert.equal(sent.length, 0);
  r.update('mini', 2000); r.update('mini', 3000);
  assert.deepEqual(sent, [['vehicle', { vehicle: 'mini', previous: 'compact' }]]);
});

test('change reporter: browsing through values sends only the one that held', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.update('delorean', 500); r.update('bus', 1000); r.update('bus', 3100);
  assert.deepEqual(sent.map((s) => s[1].vehicle), ['bus']);
});

test('change reporter: flicker back to the last sent value sends nothing', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.update('compact', 500); r.update('compact', 5000);
  assert.equal(sent.length, 0);
});

test('change reporter: flush() sends the pending value at once, once', () => {
  const { r, sent } = reporter();
  r.update('mini', 0); r.flush(); r.flush();
  assert.equal(sent.length, 1);
});

test('change reporter: at most max events per page view', () => {
  const { r, sent } = reporter({ max: 2 });
  for (let i = 0; i < 6; i++) { r.update(i % 2 ? 'a' : 'b', i * 10000); r.update(i % 2 ? 'a' : 'b', i * 10000 + 2500); }
  assert.equal(sent.length, 2);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/analytics.test.mjs`
Expected: FAIL, `Cannot find module '../analytics.js'`.

- [ ] **Step 3: Write the module**

Create `analytics.js`:

```js
// #538: what the game tells Umami (self-hosted, stats.freaxnx01.ch). Never breaks the game: blocked, offline or missing umami = silent no-op.
// Coarse by design: ids of public things (vehicle, mode, region, house, landmark label), times rounded to 5 s. Never a position, the world id, the query string or anything typed.
export const MAX_TEXT = 60, STEP_S = 5, SETTLE_MS = 2000, MAX_QUEUE = 50, MAX_CHANGES = 200;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'], OUTCOMES = ['finished', 'timeup', 'abandoned'];

const text = (v) => String(v ?? '').trim().slice(0, MAX_TEXT);

// g.js is a deferred classic script and the game a deferred module that runs first: events wait here until umami exists.
// settle() (window load) flushes them if it is there and drops them if not; after that a missing umami is a plain no-op.
export function createTracker({ getUmami = () => globalThis.umami, maxQueue = MAX_QUEUE } = {}) {
  const queue = []; let settled = false;
  const live = () => { const u = getUmami(); return u && typeof u.track === 'function' ? u : null; };
  const deliver = (u, args) => { try { u.track(...args); } catch (e) { /* analytics must never break the game */ } };
  const drain = (u) => { for (const args of queue.splice(0)) deliver(u, args); };
  function track(...args) {
    try {
      const u = live();
      if (u) { drain(u); deliver(u, args); } else if (!settled && queue.length < maxQueue) queue.push(args);
    } catch (e) { /* see above */ }
  }
  function settle() {
    settled = true;
    try { const u = live(); if (u) drain(u); else queue.length = 0; } catch (e) { /* see above */ }
  }
  return { track, settle };
}

// Path plus the three campaign tags only: ?world= (a share link maps to a person), ?vehicle=, ?dev= never leave the page.
export function pageUrl(loc) {
  const from = new URLSearchParams(loc.search ?? ''), keep = new URLSearchParams();
  for (const key of UTM_KEYS) { const value = text(from.get(key)); if (value) keep.set(key, value); }
  const query = keep.toString();
  return `${loc.pathname}${query ? `?${query}` : ''}`;
}
export const pageviewProps = (props) => ({ ...props, url: pageUrl(globalThis.location) });

const shared = createTracker();
export const track = shared.track, settle = shared.settle;
export const trackPageview = () => track(pageviewProps);   // Umami's callback form; auto-tracking is off in index.html

export const roundSeconds = (t, step = STEP_S) => (Number.isFinite(t) && t >= 0 ? Math.round(t / step) * step : 0);
export const regionId = (region) => (region?.generated ? 'world' : text(region?.id) || 'unknown');   // a generated world's id is never sent

export function vehicleSource(search, stored, ids) {
  const match = /[?&]vehicle=([^&]*)/.exec(search ?? '');
  if (match && ids.includes(match[1])) return 'query';
  return stored ? 'stored' : 'default';
}
export const vehicleData = (value, previous) => ({ vehicle: text(value), previous: text(previous) || 'none' });
export const jumpData = (name) => ({ target: text(name) || 'unknown' });

// how the player moves right now; a building carries its id after the colon
export function activityOf({ train, level, indoors, house, foot, fly }) {
  if (train) return 'train';
  if (level && level !== 'surface') return 'hideout';
  if (indoors) return `building:${text(house)}`;
  if (foot) return 'foot';
  if (fly) return 'heli';
  return 'car';
}
export function activityData(value, previous) {
  const [kind, place] = String(value).split(':'), [from] = String(previous ?? 'car').split(':');
  return place ? { activity: kind, from, place: text(place) } : { activity: kind, from };
}

// generic over the MODES list of startscreen.js: a mode added there (Cruising, #551) is counted with no change here
export const modeData = (mode, modes, previous) => ({ mode: modes.includes(mode) ? mode : 'unknown', previous: modes.includes(previous) ? previous : 'none' });
export const modeEndData = ({ mode, outcome, seconds }, modes) => ({ mode: modes.includes(mode) ? mode : 'unknown', outcome: OUTCOMES.includes(outcome) ? outcome : 'unknown', seconds: roundSeconds(seconds) });

// Driven by the caller's clock (no timers): a value that holds for settleMs and differs from the last sent one is sent once.
export function createChangeReporter({ send = track, name, initial = null, settleMs = SETTLE_MS, max = MAX_CHANGES, shape = (value, previous) => ({ value, previous }) } = {}) {
  let sent = initial, pending = null, count = 0;
  function emit(value) {
    if (count >= max) return;
    count++; const previous = sent; sent = value; send(name, shape(value, previous));
  }
  function update(value, nowMs) {
    if (value === sent) { pending = null; return; }
    if (!pending || pending.value !== value) pending = { value, since: nowMs };
    if (nowMs - pending.since >= settleMs) { const { value: v } = pending; pending = null; emit(v); }
  }
  function flush() {
    if (!pending) return;
    const { value } = pending; pending = null; emit(value);
  }
  return { update, flush };
}
```

- [ ] **Step 4: Run it to see it pass, then the whole node suite**

Run: `node --test tests/analytics.test.mjs` then `node --test tests/*.test.mjs`
Expected: all PASS. If a test fails after 3 attempts, stop and report; do not weaken a test.

- [ ] **Step 5: Commit**

```bash
git add analytics.js tests/analytics.test.mjs
git commit -m "feat(analytics): pure Umami module for the game (#538)"
```

---

### Task 2: Wire the game (`index.html`)

**Files:**
- Modify: `index.html` (import after line 666; the pageview/settle statements right after the last `import`; one block before `requestAnimationFrame(loop);` at about line 4732; one-line appends in `startRace` (4182), `finish` (4199), `endHunt` (4197), `timeUp` (4200), `toMainMenu` (4335), `placeOnRoad` (3341); the script tag after `./i18n.js` at about line 4775)

Line numbers are from `origin/main` on 2026-10-31 and will have moved: find each by its function name.

- [ ] **Step 1: Check for name clashes, then import**

Run `grep -n "umamiTrack\|\bactivityOf\b\|\bjumpData\b\|\bregionId\b\|\bmodeData\b\|\bvehicleData\b" index.html`. Expected: no hit. Add after the `import ... from './startscreen.js';` line:

```js
import { track as umamiTrack, settle as umamiSettle, trackPageview, createChangeReporter, activityOf, activityData, vehicleData, vehicleSource, modeData, modeEndData, jumpData, regionId } from './analytics.js';   // #538
```

Directly after the last `import` line of the module (the one for `./enterables.js`, plus any added since) add:

```js
trackPageview(); if (document.readyState === 'complete') umamiSettle(); else addEventListener('load', umamiSettle, { once: true });   // #538: the pageview waits in the queue for g.js
```

- [ ] **Step 2: Add the bookkeeping block**

Immediately before the line `requestAnimationFrame(loop);` (the module's last statement, after `function loop`) add. `startRace` is not called during module start-up (`grep -n "startRace(" index.html`: only click handlers, `restartRace` and `window.__mm.startHunt`), so the `STATS` constant is initialised before any call:

```js
// #538: Umami bookkeeping. Coarse ids only (see analytics.js). Vehicle and activity are sampled once a second (the interval also runs while the pause menu freezes the loop, where a car swap happens); modes and jumps are one-line calls from startRace, finish, endHunt, timeUp, toMainMenu and placeOnRoad.
const STATS = { lastMode: null, vehicle: createChangeReporter({ name: 'vehicle', initial: CHOICE.id, shape: vehicleData }), activity: createChangeReporter({ name: 'activity', initial: 'car', shape: activityData }) };
function trackModeStart(mode) { STATS.vehicle.flush(); umamiTrack('mode-start', { ...modeData(mode, MODES, STATS.lastMode), region: regionId(REGION), vehicle: CHOICE.id }); STATS.lastMode = mode; }
function trackModeEnd(outcome) { umamiTrack('mode-end', modeEndData({ mode: R.mode, outcome, seconds: R.t }, MODES)); }
umamiTrack('game-ready', { region: regionId(REGION), lang: window.GG_LANG || 'en', vehicle: CHOICE.id, vehicle_source: vehicleSource(location.search, (() => { try { return localStorage.getItem('mm.car'); } catch (e) { return null; } })(), Object.keys(VEHICLES)), mode: SHOWN.mode, touch: matchMedia('(pointer: coarse)').matches ? 'yes' : 'no' });
setInterval(() => { const now = performance.now(); STATS.vehicle.update(CHOICE.id, now); STATS.activity.update(activityOf({ train: TRAIN.on, level: LEVELS.id, indoors: INT.indoors, house: INT.house, foot: FOOT.on, fly: FLY.on }), now); }, 1000);
addEventListener('gg-langchange', (e) => umamiTrack('lang', { lang: e.detail.lang }));
```

- [ ] **Step 3: One-line appends in existing functions**

Edit with exact, unique matches; each is an insertion, nothing else on those lines changes:

- `startRace`: `if (RACELESS) mode = 'hunt'; R.mode = mode;` becomes `if (RACELESS) mode = 'hunt'; R.mode = mode; trackModeStart(mode);`
- `finish`: the first statements `function finish() { stopAuto('reset'); R.state = 'finished'; SFX.finish();` become `... SFX.finish(); trackModeEnd('finished');`
- `endHunt`: same insertion after `SFX.finish();`
- `timeUp`: `R.state = 'finished'; R.timeUp = true;` becomes `R.state = 'finished'; R.timeUp = true; trackModeEnd('timeup');`
- `toMainMenu`: `function toMainMenu() { closePause();` becomes `function toMainMenu() { if (R.state === 'racing' || R.state === 'armed') trackModeEnd('abandoned'); closePause();` (before `resetMode()` wipes `R.mode`)
- `placeOnRoad`: `function placeOnRoad(x, z, th, name) { const wasBelow` becomes `function placeOnRoad(x, z, th, name) { umamiTrack('jump', jumpData(name)); const wasBelow`

`R.state` is `'armed'` after `startRace` and `'racing'` once running (`index.html:4182`, `4728`); confirm with `grep -n "R.state = '" index.html`.

- [ ] **Step 4: The script tag**

After `<script src="./i18n.js"></script>` add:

```html
<!-- Umami analytics (self-hosted, server in Germany). Auto-tracking is off and the query is excluded: the game URL can carry ?world=<id>, which must not reach the stats. See analytics.js. -->
<script defer src="https://stats.freaxnx01.ch/g.js" data-website-id="35f395c0-a1ba-4706-ad56-7c95fcc0169f" data-domains="rhyflitzer.freaxnx01.ch,github.freaxnx01.ch" data-auto-track="false" data-exclude-search="true" data-exclude-hash="true" data-do-not-track="true"></script>
```

- [ ] **Step 5: Check by hand, no browser run**

`node --check` does not parse inline modules; instead run `node --test tests/*.test.mjs` (nothing may break) and `grep -c "umamiTrack\|trackModeStart\|trackModeEnd" index.html` (expect the 6 appends plus the block). The browser check is Task 4.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(analytics): count vehicle, mode, activity and jumps in the game (#538)"
```

---

### Task 3: Privacy notice (About dialog, README) and strings

**Files:**
- Modify: `strings.js`, `about.js`, `tests/about.test.mjs`, `index.html` (About "The game" panel), `README.md`

- [ ] **Step 1: Failing test first**

In `tests/about.test.mjs` add `'privacy'` to the sorted key list in the `ABOUT_LINKS` test (`line 6`, between `'plattform'` and `'source'`: the list is sorted alphabetically, so after `'plattform'`) and add:

```js
assert.equal(ABOUT_LINKS.privacy, 'https://github.com/freaxnx01/game-rhyflitzer#datenschutz--privacy');
```

Run `node --test tests/about.test.mjs`: FAIL.

- [ ] **Step 2: `about.js` and strings**

In `about.js` `ABOUT_LINKS` add `privacy: 'https://github.com/freaxnx01/game-rhyflitzer#datenschutz--privacy',` (after `plattform`). In `strings.js` add next to `aboutGame` in `en`:

```js
  aboutPrivacy: 'Anonymous statistics: the game counts with Umami (self-hosted on a server in Germany) which car and mode are chosen, how you get around (car, on foot, helicopter, steam loco, hideout), where you jump to, and the rounded length of a race. No cookies, no personal data, no exact positions. Browsers with "Do Not Track" are not counted. If the script is blocked, nothing changes.',
  aboutPrivacyLink: 'Privacy',
```

and in `de` next to its `aboutGame`:

```js
  aboutPrivacy: 'Anonyme Statistik: Das Spiel zählt mit Umami (selbst gehostet auf einem Server in Deutschland), welches Auto und welcher Modus gewählt werden, wie man sich fortbewegt (Auto, zu Fuss, Helikopter, Dampflok, Hideout), wohin gesprungen wird und die gerundete Dauer eines Rennens. Keine Cookies, keine persönlichen Daten, keine genauen Positionen. Browser mit „Do Not Track“ werden nicht gezählt. Ist das Skript blockiert, ändert sich nichts.',
  aboutPrivacyLink: 'Datenschutz',
```

- [ ] **Step 3: About panel markup**

In `index.html`, panel `aboutpanel-game`, after the `aboutInspired` paragraph add:

```html
      <p data-i18n="aboutPrivacy"></p>
      <p><a data-link="privacy" data-i18n="aboutPrivacyLink"></a></p>
```

(`data-link` hrefs are filled by the existing loop `for (const a of document.querySelectorAll('#about a[data-link]'))`.)

- [ ] **Step 4: README**

Replace the two paragraphs under `## Datenschutz / Privacy` (de, then en) with ones that cover the game and the editor. German:

> Das Spiel und der Region-Editor (`editor/`) zählen Besuche mit **Umami**, selbst gehostet auf einem Server in **Deutschland** (`stats.freaxnx01.ch`). Es werden keine Cookies gesetzt und keine personenbezogenen Daten gespeichert. Im **Spiel** werden gezählt: das gewählte Fahrzeug und dessen Wechsel, der gestartete Spielmodus und sein Ende (Zeit auf 5 Sekunden gerundet), die Fortbewegung (Auto, zu Fuss, Helikopter, Dampflok, Hideout, Gebäude), Sprungziele, die Sprache sowie Region, Gerätetyp und Herkunftsseite (Referrer, Kampagnen-Tags `utm_*`). Im **Editor**: die Namen der Gemeinden des Rahmens, seine Grösse und die Lage seines Mittelpunkts auf etwa 5 km gerundet, nie die genauen Koordinaten und nie die Welt-ID. Weder im Spiel noch im Editor wird die Adresszeile mit Abfrageteil (`?world=`, `?bbox=`) übermittelt. Die IP-Adresse wird nicht gespeichert, sondern nur kurzzeitig für die Bestimmung von Land und Region verwendet. Browser mit „Do Not Track" werden nicht gezählt. Wird das Skript blockiert, läuft alles unverändert weiter.

English:

> The game and the region editor (`editor/`) count visits with **Umami**, self-hosted on a server in **Germany** (`stats.freaxnx01.ch`). No cookies are set and no personal data is stored. In the **game** it counts: the chosen vehicle and changes of it, the started game mode and its end (time rounded to 5 seconds), how you get around (car, on foot, helicopter, steam loco, hideout, building), jump targets, the language, plus region, device type and referrer (campaign tags `utm_*`). In the **editor**: the names of the frame's Gemeinden, its size and the position of its centre rounded to about 5 km, never the exact coordinates and never the world id. Neither the game nor the editor sends the address with its query part (`?world=`, `?bbox=`). The IP address is not stored, only used briefly to determine country and region. Browsers with „Do Not Track" are not counted. If the script is blocked, everything runs unchanged.

- [ ] **Step 5: Run and commit**

Run `node --test tests/*.test.mjs` (the strings parity test, `tests/strings.test.mjs`, and the about test must pass).

```bash
git add strings.js about.js tests/about.test.mjs index.html README.md
git commit -m "docs(privacy): tell players what the game counts (#538)"
```

---

### Task 4: Browser test, test map, changelog

**Files:**
- Create: `tests/test_analytics.py`
- Modify: `tests/test-map.json`, `CHANGELOG.md`

- [ ] **Step 1: The Playwright file**

Create `tests/test_analytics.py` (pattern: `tests/test_about.py` boot, `tests/test_editor.py:78` stub). Run in the foreground:

```python
"""#538: what the game tells Umami. window.umami is stubbed by an init script, the real g.js is fulfilled empty, so the
tests never reach the real Umami. Hand-traced layout (world and terrain blocked): fast and deterministic."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
STUB = ("window.__umami = []; window.umami = { track: (a, b) => { window.__umami.push(typeof a === 'function' "
        "? { pageview: a({ website: 'w', url: location.pathname + location.search, title: 'T' }) } : { name: a, data: b }); } };")


def boot(p, server, query=""):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    ctx.add_init_script(STUB)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/stats.freaxnx01.ch/**", lambda r: r.fulfill(status=200, content_type="text/javascript", body=""))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def calls(page):
    return page.evaluate("() => window.__umami")


def named(page, name):
    return [c["data"] for c in calls(page) if c.get("name") == name]


def test_pageview_keeps_only_the_path_and_campaign_tags_and_game_ready_names_the_query_vehicle(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?vehicle=delorean&world=secret123&utm_source=nfz")
        pv = [c["pageview"] for c in calls(page) if "pageview" in c]
        ready = named(page, "game-ready")
        everything = str(calls(page)); b.close()
    assert not errors
    assert len(pv) == 1 and pv[0]["url"] == "/index.html?utm_source=nfz"
    assert len(ready) == 1 and ready[0]["vehicle"] == "delorean" and ready[0]["vehicle_source"] == "query"
    assert ready[0]["region"] in ("hochrhein", "ehrendingen", "world")
    assert "secret123" not in everything


def test_start_sends_mode_start_and_a_garage_swap_sends_vehicle(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?vehicle=compact")
        page.click("#carbtn"); page.click("#csnext")
        page.wait_for_function("() => window.__umami.some((c) => c.name === 'vehicle')", timeout=10000)
        vehicle = named(page, "vehicle")
        page.click("#csback"); page.click("#startbtn")
        page.wait_for_function("() => window.__umami.some((c) => c.name === 'mode-start')", timeout=10000)
        start = named(page, "mode-start"); b.close()
    assert not errors
    assert len(vehicle) == 1 and vehicle[0]["previous"] == "compact" and vehicle[0]["vehicle"] != "compact"
    assert len(start) == 1 and start[0]["previous"] == "none" and start[0]["mode"] != "unknown"
    assert start[0]["vehicle"] == vehicle[0]["vehicle"]


def test_a_blocked_umami_never_breaks_the_game(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/stats.freaxnx01.ch/**", lambda r: r.abort())
        page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function(READY, timeout=240000)
        page.click("#startbtn"); page.wait_for_timeout(500); b.close()
    assert not errors
```

Run: `pytest tests/test_analytics.py -x` (foreground, generous timeout), then `pytest tests/test_about.py tests/test_about_tabs.py -x`.

- [ ] **Step 2: Test map**

Add to `tests/test-map.json`: `"analytics.js": ["test_analytics.py"],`.

- [ ] **Step 3: Changelog**

Under `## [Unreleased]` `### Added` (newest first, in the voice and `YYYY-MM-DD HH:MM` format of the neighbours) add: ``- `<date time>` The game now counts **anonymously** which car and mode are chosen, how people get around and where they jump to, so we can see where visitors get stuck. No cookies, no personal data, no exact positions, and nothing changes if you block it; details under **About** and in the README.``

- [ ] **Step 4: Full node suite, commit, push**

Run `node --test tests/*.test.mjs`. Then:

```bash
git add tests/test_analytics.py tests/test-map.json CHANGELOG.md
git commit -m "test(analytics): browser check for the game's Umami events (#538)"
```

Open the PR per the repo's flow (`feat(analytics): extend the Umami integration to the game`, `Closes #538`).

## Manual follow-up after merge (maintainer, not a task)

On `stats.freaxnx01.ch` (Umami): confirm website `35f395c0-a1ba-4706-ad56-7c95fcc0169f` exists and its **Domain** field lists `rhyflitzer.freaxnx01.ch` (the editor tag already sends under it; the tag's `data-domains` is the client-side filter, the dashboard's Domain is for display). If the game should get its own website instead, create it and replace `data-website-id` in `index.html` (and `editor/index.html` if the editor should follow). In the dashboard filter by hostname `rhyflitzer.freaxnx01.ch` and path `/` for the game vs `/editor/`. Events appear under Events after the first visit: `game-ready`, `vehicle`, `mode-start`, `mode-end`, `activity`, `jump`, `lang`. Newspaper links should carry `?utm_source=nfz` to show up as a campaign.
