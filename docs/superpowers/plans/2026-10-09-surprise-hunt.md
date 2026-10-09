# Surprise hunt — implementation plan (#108, first slice)

Spec: `docs/superpowers/specs/2026-10-09-surprise-hunt-design.md`. Read it first; its decision table is the contract. Line numbers below are `prototype/index.html` on `main` @ `7c2989e` and will drift — search the quoted code, not the number.

**Goal.** A **Surprise hunt** button on the start screen hides five glowing gift boxes on roads 150–900 m from the start (new places every run). The arrow and minimap lead to the nearest one; each box pops with confetti and a jingle and gives one of four harmless surprises (super jump, 6 s turbo, 10 s moon gravity, free repair). The fifth box ends the run with "All presents found!", the time and a best time. The time trial is unchanged.

## Global Constraints

- Buildless vanilla JS; no packages, no bundler. `prototype/presents.js` is a pure ES module (no DOM, no three.js) so `node --test` imports it.
- Every new UI text goes through `tr()` with an `en` and a `de` entry in `prototype/strings.js`; `strings.test.mjs` fails on a missing key, a mismatched arity or a `ß`. German addresses the player with capitalised `Du`.
- Surgical edits to `index.html`: only `R`, `startRace`, `updatePips`, `stepRace` (one early-return line), `finish` (one field), `resultHtml`, `renderOverlay`, `restartRace`, `toMainMenu`, `rerenderAll`, `stepCar` (three small edits), `hud` (two small edits), `drawMap`, `SFX` (one method), the start-screen markup line and `__mm` hooks, plus new hunt functions next to the race code. Match the file's dense one-statement-per-line style.
- **Task 0 decides the merge shape with #128 (Blitz).** If Blitz already landed, `R.mode`, `startRace(mode)`, `renderModeLine()` and `R.last.mode` exist: extend them with a `'hunt'` branch, do not add a second copy.
- Tests: `node --test prototype/tests/*.test.mjs`; Playwright under pytest. **Browser tests run in the foreground, never `run_in_background`, under a memory cap**, and only the affected files: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_hunt.py prototype/tests/test_pause.py prototype/tests/test_i18n.py -x -q`.
- Commit and push the branch **before** the browser run.
- Branch `feature/108-surprise-hunt`, Conventional Commits, PR to `main`, `Closes #108`.

## Review Focus

- Trial path unchanged: `startRace()` without argument, checkpoint pillars visible, boxes hidden, `mm.best2` untouched, `R.target` / `cpTarget` as before.
- Surprise timers never tick while paused (`loop()` skips `stepRace` while `PAUSE.on`; keep the tick inside `stepHunt`).
- Turbo acts only while gas is held (`P.nitro = nitro || (turbo && gas)`), never drives the car by itself.
- `renderModeLine()` runs after `applyStaticStrings()` in `rerenderAll()`.
- A box under a bridge is not collected from the deck (4 m vertical rule); no pickup while `FLY.on`.

## File map

| File | Change |
|---|---|
| `prototype/presents.js` | **new** — `HUNT`, `SURPRISES`, `PRESENT_ROAD_CLASSES`, `presentCandidates`, `pickPresentSpots`, `seededRng`, `nextSurprise`, `tickSurprises`, `gravityScale`, `nearestPresent`, `canCollect`, `isNewHuntBest`, `confettiBurst`, `stepConfetti` |
| `prototype/tests/presents.test.mjs` | **new** — node tests |
| `prototype/strings.js` | 12 new keys, en + de |
| `prototype/index.html` | button, box + confetti objects, `SFX.present`, `R.mode`/`R.huntBest`, `startRace(mode)`, `stepHunt`, `collectPresent`, `applySurprise`, `endHunt`, `showHuntResult`, `renderModeLine`, `stepCar` turbo/gravity, HUD, minimap, result, hooks |
| `prototype/tests/test_hunt.py` | **new** — Playwright, hand layout |
| `CHANGELOG.md` | one `Added` entry |

---

### Task 0: Branch, baseline, Blitz check

1. `git checkout -b feature/108-surprise-hunt` from an up-to-date `main`.
2. `node --test prototype/tests/*.test.mjs` — green; note the count.
3. `grep -n "R.mode\|renderModeLine\|blitz.js" prototype/index.html`.
   - **No hits** (Blitz not landed): follow this plan as written; it introduces `R.mode`, `startRace(mode)`, `renderModeLine()`, `R.last.mode`.
   - **Hits** (Blitz landed): keep Blitz's definitions. Where this plan says "replace `startRace`" / "add `renderModeLine`", instead add a `'hunt'` branch to Blitz's version (hide/show the boxes, `HUNT_RUN` reset, mode labels). The button order in `.row` is Start, Blitz, Surprise hunt, Style. In `renderOverlay`, each mode button reads Retry only when `R.mode` is its own mode.
4. verify: tests green, decision noted in the PR body.

### Task 1: Pure module `presents.js` (TDD)

**Files:** create `prototype/tests/presents.test.mjs`, then `prototype/presents.js`.

**Step 1 — write the failing test** `prototype/tests/presents.test.mjs`:

```js
// #108: the surprise hunt's pure rules. node --test, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUNT, SURPRISES, presentCandidates, pickPresentSpots, seededRng, nextSurprise, tickSurprises, gravityScale, nearestPresent, canCollect, isNewHuntBest, confettiBurst, stepConfetti } from '../presents.js';

// a 2 km street grid every 100 m, each street split into 50 m segments
const grid = () => { const roads = [], line = (f) => Array.from({ length: 41 }, (_, k) => f(-1000 + k * 50)); for (let i = -10; i <= 10; i++) { roads.push({ cls: 'residential', pts: line(t => [i * 100, t]) }); roads.push({ cls: 'residential', pts: line(t => [t, i * 100]) }); } return roads; };

test('presentCandidates: segment midpoints of drivable, non-bridge, ground-level roads', () => {
  const roads = [
    { cls: 'residential', pts: [[0, 0], [10, 0], [10, 20]] },
    { cls: 'motorway', pts: [[0, 0], [100, 0]] },
    { cls: 'footway', pts: [[0, 0], [100, 0]] },
    { cls: 'primary', bridge: true, pts: [[0, 0], [100, 0]] },
    { cls: 'tertiary', layer: 1, pts: [[0, 0], [100, 0]] },
    { n: 'Hauptstrasse', w: 9, pts: [[0, 50], [40, 50]] },   // hand layout: no cls
  ];
  assert.deepEqual(presentCandidates(roads), [[5, 0], [10, 10], [20, 50]]);
});

test('pickPresentSpots: five spots in the ring, spaced, deterministic per seed', () => {
  const cands = presentCandidates(grid()), start = { x: 0, z: 0 };
  const a = pickPresentSpots(cands, start, seededRng(1)), b = pickPresentSpots(cands, start, seededRng(1)), c = pickPresentSpots(cands, start, seededRng(2));
  assert.equal(a.length, HUNT.count);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const p of a) { const d = Math.hypot(p.x, p.z); assert.ok(d >= HUNT.minR && d <= HUNT.maxR, `ring ${d}`); }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) >= HUNT.gap);
});

test('pickPresentSpots: relaxes the gap, then the radius, when the ring is sparse', () => {
  const cands = [[200, 0], [260, 0], [320, 0], [380, 0], [1500, 0]];
  const spots = pickPresentSpots(cands, { x: 0, z: 0 }, seededRng(3));
  assert.equal(spots.length, 5);
  assert.ok(spots.some(p => p.x === 1500));
});

test('pickPresentSpots: returns what exists when even the fallback cannot reach five', () => {
  assert.equal(pickPresentSpots([[200, 0]], { x: 0, z: 0 }, seededRng(1)).length, 1);
});

test('seededRng: deterministic, in [0, 1)', () => {
  const r1 = seededRng(42), r2 = seededRng(42);
  for (let i = 0; i < 100; i++) { const v = r1(); assert.equal(v, r2()); assert.ok(v >= 0 && v < 1); }
});

test('nextSurprise: the first four draws are the four kinds, then the bag refills', () => {
  const rng = seededRng(7); let bag = []; const ids = [];
  for (let i = 0; i < 5; i++) { const r = nextSurprise(bag, rng); ids.push(r.surprise.id); bag = r.bag; }
  assert.deepEqual([...ids.slice(0, 4)].sort(), SURPRISES.map(s => s.id).sort());
  assert.ok(SURPRISES.some(s => s.id === ids[4]));
});

test('tickSurprises: counts down to zero, never below; pure', () => {
  const t0 = { turbo: 1, moon: 0.5 };
  assert.deepEqual(tickSurprises(t0, 0.75), { turbo: 0.25, moon: 0 });
  assert.deepEqual(t0, { turbo: 1, moon: 0.5 });
});

test('gravityScale: moon gravity only while its timer runs', () => {
  const moon = SURPRISES.find(s => s.id === 'moon');
  assert.equal(gravityScale({ turbo: 0, moon: 0 }), 1);
  assert.equal(gravityScale({ turbo: 0, moon: 3 }), moon.gravity);
});

test('nearestPresent: nearest not-yet-found box, -1 when all are found', () => {
  const spots = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 50, z: 0 }];
  assert.equal(nearestPresent(spots, [false, false, false], 90, 0), 1);
  assert.equal(nearestPresent(spots, [false, true, false], 90, 0), 2);
  assert.equal(nearestPresent(spots, [true, true, true], 90, 0), -1);
});

test('canCollect: within 7 m and 4 m of height, in a run, never while flying', () => {
  const box = { x: 0, z: 0, y: 10 };
  assert.equal(canCollect(box, { x: 5, z: 0, y: 10 }, 'racing', false), true);
  assert.equal(canCollect(box, { x: 5, z: 0, y: 10 }, 'armed', false), true);
  assert.equal(canCollect(box, { x: 8, z: 0, y: 10 }, 'racing', false), false);
  assert.equal(canCollect(box, { x: 0, z: 0, y: 15 }, 'racing', false), false);   // on a deck above the box
  assert.equal(canCollect(box, { x: 0, z: 0, y: 10 }, 'racing', true), false);    // helicopter
  assert.equal(canCollect(box, { x: 0, z: 0, y: 10 }, 'finished', false), false);
});

test('isNewHuntBest: first finish or faster', () => {
  assert.equal(isNewHuntBest(null, 200), true);
  assert.equal(isNewHuntBest(180, 200), false);
  assert.equal(isNewHuntBest(180, 170), true);
});

test('confetti: a burst flies up and out, then falls and expires', () => {
  const parts = confettiBurst(80, seededRng(5));
  assert.equal(parts.length, 80);
  assert.ok(parts.every(p => p.vy > 0 && p.life > 0));
  let left = parts; for (let i = 0; i < 60; i++) left = stepConfetti(left, 0.05);
  assert.equal(left.length, 0);
  const one = stepConfetti([{ x: 0, y: 0, z: 0, vx: 1, vy: 5, vz: 0, life: 1, c: 0 }], 0.1)[0];
  assert.ok(one.x > 0 && one.y > 0 && one.vy < 5 && one.life < 1);
});

test('SURPRISES: four kinds with the spec values', () => {
  const by = Object.fromEntries(SURPRISES.map(s => [s.id, s]));
  assert.deepEqual(Object.keys(by).sort(), ['hop', 'moon', 'repair', 'turbo']);
  assert.equal(by.turbo.secs, 6); assert.equal(by.moon.secs, 10); assert.equal(by.moon.gravity, 0.35);
  assert.ok(by.hop.vy > 0 && by.hop.vy < 9);   // lands below the 9 m/s damage threshold (stepCar)
});

test('HUNT: the spec table', () => {
  assert.deepEqual(HUNT, { count: 5, minR: 150, maxR: 900, gap: 200, minGap: 50, maxRScale: 3, pickup: 7, pickupDy: 4, celebrate: 1.5 });
});
```


**Step 2 — run, expect failure:** `node --test prototype/tests/presents.test.mjs` → `Cannot find module '../presents.js'`.

**Step 3 — implement** `prototype/presents.js`:

```js
// #108: pure rules for the surprise hunt -- no DOM, no three.js. Unit-tested with `node --test prototype/tests/*.test.mjs`.

export const HUNT = { count: 5, minR: 150, maxR: 900, gap: 200, minGap: 50, maxRScale: 3, pickup: 7, pickupDy: 4, celebrate: 1.5 };

// every kind is good news (spec A3); hop.vy lands below stepCar's 9 m/s damage threshold
export const SURPRISES = [
  { id: 'hop', vy: 8.5 },
  { id: 'turbo', secs: 6 },
  { id: 'moon', secs: 10, gravity: 0.35 },
  { id: 'repair' },
];

export const PRESENT_ROAD_CLASSES = new Set(['residential', 'tertiary', 'secondary', 'primary', 'unclassified', 'living_street']);

// OSM roads carry cls / layer / bridge; hand-traced roads carry none of them and all count
export function presentCandidates(roads) {
  const out = [];
  for (const r of roads) {
    if (r.bridge || (r.layer || 0) !== 0) continue;
    if (r.cls && !PRESENT_ROAD_CLASSES.has(r.cls)) continue;
    for (let i = 0; i < r.pts.length - 1; i++) out.push([(r.pts[i][0] + r.pts[i + 1][0]) / 2, (r.pts[i][1] + r.pts[i + 1][1]) / 2]);
  }
  return out;
}

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function pickOnce(pool, start, minR, maxR, gap, count) {
  const out = [];
  for (const [x, z] of pool) {
    const d = Math.hypot(x - start.x, z - start.z);
    if (d < minR || d > maxR) continue;
    if (out.some(p => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    out.push({ x, z });
    if (out.length === count) break;
  }
  return out;
}

// shuffle once, then relax: gap halves down to minGap, then the radius grows x1.5 up to maxRScale
export function pickPresentSpots(cands, start, rng, rules = HUNT) {
  const pool = shuffled(cands, rng);
  let best = [];
  for (let scale = 1; scale <= rules.maxRScale; scale *= 1.5) {
    for (let gap = rules.gap; gap >= rules.minGap; gap /= 2) {
      const got = pickOnce(pool, start, rules.minR, rules.maxR * scale, gap, rules.count);
      if (got.length === rules.count) return got;
      if (got.length > best.length) best = got;
    }
  }
  return best;
}

// mulberry32: a small seeded generator, so tests can fix the draw
export function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a shuffled bag of the four kinds, refilled when empty: the first four boxes are four different surprises
export function nextSurprise(bag, rng) {
  const full = bag.length ? bag : shuffled(SURPRISES.map(s => s.id), rng);
  const [id, ...rest] = full;
  return { surprise: SURPRISES.find(s => s.id === id), bag: rest };
}

export function tickSurprises(timers, dt) {
  return { turbo: Math.max(0, timers.turbo - dt), moon: Math.max(0, timers.moon - dt) };
}

export function gravityScale(timers) {
  return timers.moon > 0 ? SURPRISES.find(s => s.id === 'moon').gravity : 1;
}

export function nearestPresent(spots, found, x, z) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < spots.length; i++) {
    if (found[i]) continue;
    const d = Math.hypot(spots[i].x - x, spots[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// as checkpoints: in 'armed' or 'racing', not while flying; the height rule keeps a box under a bridge from being taken off the deck
export function canCollect(spot, car, raceState, flying, rules = HUNT) {
  if (flying || (raceState !== 'armed' && raceState !== 'racing')) return false;
  return Math.hypot(spot.x - car.x, spot.z - car.z) < rules.pickup && Math.abs(spot.y - car.y) < rules.pickupDy;
}

export function isNewHuntBest(best, t) {
  return best === null || t < best;
}

// c: index into the four box colours; positions relative to the box
export function confettiBurst(n, rng) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, s = 3 + rng() * 5;
    out.push({ x: 0, y: 2, z: 0, vx: Math.cos(a) * s, vy: 7 + rng() * 6, vz: Math.sin(a) * s, life: 1.5 + rng() * 0.5, c: i % 4 });
  }
  return out;
}

export function stepConfetti(parts, dt) {
  return parts.filter(p => p.life > dt).map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, z: p.z + p.vz * dt, vx: p.vx * 0.98, vy: p.vy - 9 * dt, vz: p.vz * 0.98, life: p.life - dt }));
}
```

**Step 4 — run:** `node --test prototype/tests/*.test.mjs` → all green (old count + the new tests).

**Step 5 — commit:** `feat(modes): pure rules for the surprise hunt (#108)`.

verify: `node --test prototype/tests/*.test.mjs` green.

### Task 2: Strings (en + de)

**Files:** `prototype/strings.js`.

**Step 1 — failing check:** add a test to `prototype/tests/strings.test.mjs`:

```js
test('#108: the surprise hunt has its texts in both languages', () => {
  for (const key of ['hunt', 'modeHunt', 'presentsLabel', 'presentTarget', 'huntStart', 'presentToast', 'surpriseHop', 'surpriseTurbo', 'surpriseMoon', 'surpriseRepair', 'huntAllFound', 'huntFinishedText']) {
    assert.ok(key in STRINGS.en, key); assert.ok(key in STRINGS.de, key);
  }
  assert.equal(translate('en', 'surpriseTurbo', 6), 'Turbo for 6 seconds!');
  assert.equal(translate('de', 'surpriseMoon', 10), 'Mondschwerkraft für 10 Sekunden!');
  assert.match(translate('de', 'presentToast', 2, 5, 'x'), /^Geschenk 2\/5/);
});
```

Run `node --test prototype/tests/strings.test.mjs` → fails.

**Step 2 — add to `en`** (after `cpToast`):

```js
  // ---- surprise hunt (#108) ----
  hunt: 'Surprise hunt',
  modeHunt: 'Surprise hunt · Hochrhein',
  presentsLabel: 'presents',
  presentTarget: 'Nearest present',
  huntStart: 'Find the 5 presents! Follow the arrow.',
  presentToast: (number, total, line) => `Present ${number}/${total}<br>${small(line)}`,
  surpriseHop: 'Boing! Super jump!',
  surpriseTurbo: (secs) => `Turbo for ${secs} seconds!`,
  surpriseMoon: (secs) => `Moon gravity for ${secs} seconds!`,
  surpriseRepair: 'Free repair: good as new!',
  huntAllFound: 'All presents found!',
  huntFinishedText: 'You found every present. Play again: they hide somewhere else every time.',
```

**and to `de`** (after its `cpToast`):

```js
  // ---- Überraschungsjagd (#108) ----
  hunt: 'Überraschungsjagd',
  modeHunt: 'Überraschungsjagd · Hochrhein',
  presentsLabel: 'Geschenke',
  presentTarget: 'Nächstes Geschenk',
  huntStart: 'Finde die 5 Geschenke! Folge dem Pfeil.',
  presentToast: (number, total, line) => `Geschenk ${number}/${total}<br>${small(line)}`,
  surpriseHop: 'Boing! Supersprung!',
  surpriseTurbo: (secs) => `Turbo für ${secs} Sekunden!`,
  surpriseMoon: (secs) => `Mondschwerkraft für ${secs} Sekunden!`,
  surpriseRepair: 'Gratis-Reparatur: wie neu!',
  huntAllFound: 'Alle Geschenke gefunden!',
  huntFinishedText: 'Du hast alle Geschenke gefunden. Nochmals spielen: Sie verstecken sich jedes Mal woanders.',
```

**Step 3:** `node --test prototype/tests/*.test.mjs` → green. Commit `feat(i18n): surprise hunt texts in en and de (#108)`.

verify: strings tests green (equal keys, arity, no `ß`).

### Task 3: Scene objects — boxes, confetti, jingle

**Files:** `prototype/index.html`.

1. Import (next to the `pause.js` import, `:246`):

```js
import { HUNT, SURPRISES, presentCandidates, pickPresentSpots, seededRng, nextSurprise, tickSurprises, gravityScale, nearestPresent, canCollect, isNewHuntBest, confettiBurst, stepConfetti } from './presents.js';
```

2. After `const finishG = …` (`:1087`), add the five boxes and the confetti points:

```js
// #108: the surprise hunt's gift boxes (built once, hidden outside a hunt) and one reusable confetti cloud
const GIFT_COLOURS = [0xe0322d, 0x2f7de0, 0x3fb950, 0xa34fd6];
const giftBeamMat = new THREE.MeshBasicMaterial({ color: 0xff5fb0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
const presentObjs = Array.from({ length: HUNT.count }, (_, i) => { const g = new THREE.Group(), box = new THREE.Group(); const ribbon = new THREE.MeshLambertMaterial({ color: 0xffc61a }); box.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), new THREE.MeshLambertMaterial({ color: GIFT_COLOURS[i % 4] }))); box.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 0.45), ribbon), new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.5, 2.5), ribbon)); const bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 8, 16), ribbon); bow.position.y = 1.45; box.add(bow); box.position.y = 1.6; const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 40, 16, 1, true), giftBeamMat); beam.position.y = 20; g.add(box, beam); g.visible = false; scene.add(g); return { g, box }; });
const confetti = (() => { const n = 80, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); const colours = new Float32Array(n * 3), c = new THREE.Color(); for (let i = 0; i < n; i++) { c.setHex(GIFT_COLOURS[i % 4]); colours.set([c.r, c.g, c.b], i * 3); } geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.45, vertexColors: true })); pts.visible = false; pts.frustumCulled = false; scene.add(pts); return { pts, parts: [], n }; })();
function burstConfetti(x, y, z, rng) { confetti.parts = confettiBurst(confetti.n, rng); confetti.pts.position.set(x, y, z); confetti.pts.visible = true; }
function drawConfetti(dt) { if (!confetti.parts.length) { confetti.pts.visible = false; return; } confetti.parts = stepConfetti(confetti.parts, dt); const a = confetti.pts.geometry.attributes.position; for (let i = 0; i < confetti.n; i++) { const p = confetti.parts[i]; a.setXYZ(i, p ? p.x : 0, p ? p.y : -1e4, p ? p.z : 0); } a.needsUpdate = true; }
```

3. In `SFX` (after `finish()`, `:1224`):

```js
    present() { [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.12, 'triangle', 0.2, i * 0.07)); },
```

4. Reload the page manually (`python3 -m http.server 8000`) only if you want a look; no automated step here. Commit `feat(modes): gift boxes, confetti and a jingle for the surprise hunt (#108)`.

verify: `node --test prototype/tests/*.test.mjs` still green; page has no new console error at load (checked in Task 5).

### Task 4: Mode wiring in `index.html`

**Files:** `prototype/index.html`. (If Task 0 found Blitz, merge into its functions instead of replacing.)

1. **Markup** (`:202-203`): between `#startbtn` and `#stylebtn2` add

```html
      <button id="huntbtn" class="btn" type="button" data-i18n="hunt">Surprise hunt</button>
```

   (`data-i18n` gives the first render; `renderOverlay` overrides it after a hunt.)

2. **Race state** (`:1385-1386`): replace the `R` line and add the hunt best and run state:

```js
const R = { state: 'ready', mode: 'trial', t: 0, best: null, huntBest: null, done: 0, shortcut: false, target: null };
try { const b = localStorage.getItem('mm.best2'); if (b) R.best = +b; } catch (e) { }
try { const b = localStorage.getItem('mm.huntBest'); if (b) R.huntBest = +b; } catch (e) { }
const PRESENT_CANDS = presentCandidates(ROADS);
let HUNT_RUN = { spots: [], found: [], bag: [], rng: Math.random, endIn: 0 }, SURP = { turbo: 0, moon: 0 };
```

3. **`startRace`** (`:1393`): give it the mode, show the right objects, reset the hunt:

```js
function startRace(mode = 'trial', rng = Math.random) { R.mode = mode; const hunt = mode === 'hunt'; for (const c of cpObjs) { c.done = false; c.pillar.material = cpMat; c.ring.visible = true; c.g.visible = !hunt; } finishG.visible = false; R.done = 0; R.t = 0; R.shortcut = false; R.jumped = false; R.auto = false; R.flown = false; R.state = 'armed'; P.dmg = 0; P.safe = [START.x, START.z, START.th]; resetCar(); camPos.set(START.x + 12, P.y + 5, START.z); SURP = { turbo: 0, moon: 0 }; startHuntRun(hunt, rng); $('overlay').hidden = true; $('result').hidden = true; renderModeLine(); updatePips(); if (hunt) toast(tr('huntStart'), TOAST_S.event); }
function startHuntRun(hunt, rng) { const spots = hunt ? pickPresentSpots(PRESENT_CANDS, START, rng).map(s => ({ ...s, y: groundH(s.x, s.z) })) : []; HUNT_RUN = { spots, found: spots.map(() => false), bag: [], rng, endIn: 0 }; presentObjs.forEach((o, i) => { const s = spots[i]; o.g.visible = !!s; if (s) o.g.position.set(s.x, s.y, s.z); }); confetti.parts = []; }
function renderModeLine() { const hunt = R.mode === 'hunt'; $('tl').querySelector('.mode').textContent = tr(hunt ? 'modeHunt' : 'mode'); $('tl').querySelector('[data-i18n="checkpointsLabel"]').textContent = tr(hunt ? 'presentsLabel' : 'checkpointsLabel'); }
```

4. **`updatePips`** (`:1394`):

```js
function updatePips() { const on = R.mode === 'hunt' ? HUNT_RUN.found : cpObjs.map(c => c.done); $('cpn').textContent = R.done; [...$('pips').children].forEach((d, i) => d.classList.toggle('on', !!on[i])); }
```

5. **`stepRace`** (`:1396`): first statement inside the function body:

```js
if (R.mode === 'hunt') { stepHunt(dt); return; }
```

   and add the hunt step functions right after `stepRace`:

```js
function stepHunt(dt) { if (R.state === 'armed' && Math.hypot(P.vx, P.vz) > 0.5) R.state = 'racing'; if (R.state === 'racing') R.t += dt; SURP = tickSurprises(SURP, dt); animatePresents(dt); drawConfetti(dt); if (HUNT_RUN.endIn > 0) { HUNT_RUN.endIn -= dt; if (HUNT_RUN.endIn <= 0) showHuntResult(); } const i = nearestPresent(HUNT_RUN.spots, HUNT_RUN.found, P.x, P.z); R.target = i < 0 ? null : { ...HUNT_RUN.spots[i], n: '', i, hunt: true }; if (i >= 0 && canCollect(HUNT_RUN.spots[i], P, R.state, FLY.on)) collectPresent(i); }
function animatePresents(dt) { const now = performance.now() / 1000; presentObjs.forEach((o, i) => { if (!o.g.visible) return; o.box.rotation.y += dt * 1.2; o.box.position.y = 1.6 + Math.sin(now * 2 + i) * 0.3; }); }
function collectPresent(i) { const s = HUNT_RUN.spots[i]; HUNT_RUN.found[i] = true; presentObjs[i].g.visible = false; R.done++; updatePips(); burstConfetti(s.x, s.y, s.z, HUNT_RUN.rng); SFX.present(); const r = nextSurprise(HUNT_RUN.bag, HUNT_RUN.rng); HUNT_RUN.bag = r.bag; applySurprise(r.surprise); toast(tr('presentToast', R.done, HUNT_RUN.spots.length, surpriseLine(r.surprise)), TOAST_S.event); if (R.done === HUNT_RUN.spots.length) endHunt(); }
function surpriseLine(s) { return s.id === 'hop' ? tr('surpriseHop') : s.id === 'turbo' ? tr('surpriseTurbo', s.secs) : s.id === 'moon' ? tr('surpriseMoon', s.secs) : tr('surpriseRepair'); }
function applySurprise(s) { if (s.id === 'hop') { if (!FLY.on) { P.y += 0.3; P.vy = s.vy; } } else if (s.id === 'turbo') SURP.turbo = s.secs; else if (s.id === 'moon') SURP.moon = s.secs; else P.dmg = 0; }
// the clock stops at the last box; the result screen follows after a short celebration (spec: HUNT.celebrate)
function endHunt() { stopAuto('reset'); R.state = 'finished'; SFX.finish(); const t = R.t, clean = !R.jumped && !R.auto && !R.flown; let rec = false; if (clean && isNewHuntBest(R.huntBest, t)) { rec = R.huntBest !== null; R.huntBest = t; try { localStorage.setItem('mm.huntBest', String(t)); } catch (e) { } } R.last = { t, rec, mode: 'hunt' }; HUNT_RUN.endIn = HUNT.celebrate; }
function showHuntResult() { HUNT_RUN.endIn = 0; if (R.state !== 'finished' || R.mode !== 'hunt') return; $('result').hidden = false; renderOverlay(); $('overlay').hidden = false; }
```

6. **`finish()`** (`:1397`): `R.last = { t, rec }` → `R.last = { t, rec, mode: 'trial' }`.

7. **`resultHtml`** (`:1398`): branch on the mode, guard a missing best:

```js
function resultHtml({ t, rec, mode }) { const hunt = mode === 'hunt', best = hunt ? R.huntBest : R.best; return `<small>${tr(rec ? 'newRecord' : hunt ? 'huntAllFound' : 'finished')}</small>${fmt(t)}<small>${R.jumped ? tr('notCountedJump') : ''}${R.auto ? tr('notCountedAuto') : ''}${R.flown ? tr('notCountedHeli') : ''}${!hunt && R.shortcut ? tr('viaHolz') : ''}${tr('bestLower')} ${best === null ? '—' : fmt(best)}</small>`; }
```

   (The trial's `fmt(null)` → `NaN` case is pre-existing; this guard fixes it for both modes as a side effect of the shared function — call it out in the PR.)

8. **`renderOverlay`** (`:1400`):

```js
function renderOverlay() { const done = R.state === 'finished', hunt = R.mode === 'hunt'; $('ovtext').textContent = tr(done ? (hunt ? 'huntFinishedText' : 'finishedText') : 'intro'); $('startbtn').textContent = tr(done && !hunt ? 'retry' : 'start'); $('huntbtn').textContent = tr(done && hunt ? 'retry' : 'hunt'); if (done) $('result').innerHTML = resultHtml(R.last); }
$('huntbtn').onclick = () => { SFX.start(); startRace('hunt'); };
```

   Careful: `renderOverlay` also runs from `rerenderAll()` while a hunt's celebration is still on screen (state `'finished'`, overlay hidden) — harmless, it only writes texts.

9. **Pause / menu** (`:1408-1409`): `function restartRace() { closePause(); startRace(R.mode); }`; in `toMainMenu` add `HUNT_RUN.endIn = 0;` and `renderModeLine();` (keep `R.mode`).

10. **`rerenderAll`** (`:1456`): append `renderModeLine();` as the last call.

11. **`stepCar`** (`:1347-1358`):
    - after the `const ap = …, hb = …;` line, the `P.gas = gas; P.air = air; P.nitro = nitro;` statement (`:1349`) becomes `P.gas = gas; P.air = air; P.nitro = nitro || (SURP.turbo > 0 && gas) ? 1 : 0;`
    - `:1352`: `const top = nitro ? D.topNitro : D.top; if (gas) vf += (nitro ? D.accelNitro : D.accel)` → use `P.nitro` in both places.
    - `:1358`: `P.vy -= 22 * dt;` → `P.vy -= 22 * gravityScale(SURP) * dt;`
    The flames (`flames.visible = !!P.nitro …`) follow automatically.

12. **`hud`** (`:1522`):
    - `$('best').textContent = tr('best', R.best === null ? null : fmt(R.best)…)` → use `const hb = R.mode === 'hunt' ? R.huntBest : R.best;` and `tr('best', hb === null ? null : fmt(hb).replace(/<[^>]+>/g, ''))`.
    - `#cpname`: `R.target.i < 0 ? tr('finishTarget', …) : tr('cpTarget', …)` → `R.target.hunt ? tr('presentTarget') : R.target.i < 0 ? tr('finishTarget', R.target.n) : tr('cpTarget', R.target.i + 1, R.target.n)`.

13. **`drawMap`** (`:1487`): wrap the `CPS.forEach(…)` and the finish-square draw in `if (R.mode !== 'hunt') { … }`, and in the hunt draw the boxes:

```js
else HUNT_RUN.spots.forEach((s, i) => { if (HUNT_RUN.found[i]) return; const [cx, cy] = mapPt(v, s.x, s.z); mg.beginPath(); mg.arc(cx, cy, 6, 0, 7); mg.fillStyle = '#ff5fb0'; mg.fill(); mg.lineWidth = 2; mg.strokeStyle = R.target && R.target.i === i ? '#ffc61a' : '#1c1f26'; mg.stroke(); });
```

   (The finish-square draw is the `const [fx, fy] = mapPt(v, FINISH.x, FINISH.z)` … `strokeRect` part; keep the car-arrow draw outside the branch — split the `const [fx, fy] = …, [px, py] = …` declaration so `px, py` stay unconditional.)

14. **Test hooks** (next to `__mm.finishNow`, `:1458`):

```js
window.__mm.hunt = () => ({ mode: R.mode, state: R.state, found: R.done, total: HUNT_RUN.spots.length, spots: HUNT_RUN.spots.map(s => [s.x, s.z, s.y]), timers: { ...SURP }, gravity: gravityScale(SURP), dmg: P.dmg, best: R.huntBest, last: R.last ? { ...R.last } : null, cpsVisible: cpObjs.every(c => c.g.visible), boxesVisible: presentObjs.filter(o => o.g.visible).length });
window.__mm.startHunt = (seed) => { SFX.start(); startRace('hunt', seededRng(seed)); };
window.__mm.surprise = (id) => applySurprise(SURPRISES.find(s => s.id === id));
```

15. Commit `feat(modes): surprise hunt mode (#108)` and **push the branch now**, before Task 5.

verify: `node --test prototype/tests/*.test.mjs` green; `grep -n "startRace(" prototype/index.html` shows the trial callers unchanged (`startRace()` from `#startbtn`).

### Task 5: Browser test `test_hunt.py` (hand layout)

**Files:** create `prototype/tests/test_hunt.py`.

**Step 1 — write the test** (copy `open_page` from `test_pause.py`, it blocks the world JSON and `.mmh`):

```python
"""#108: the surprise hunt. Hand-traced layout (world + terrain blocked): deterministic and fast.
Slow (Playwright): run in the foreground under a memory cap."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.hunt && document.querySelector('#worldstatus')?.textContent"
T = 120000


def open_page(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale=locale).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def collect(page, k):
    """Teleport onto spot k and let a few frames run."""
    page.evaluate("(k) => { const [x, z] = window.__mm.hunt().spots[k]; window.__mm.place(x, z); }", k)
    page.wait_for_function(f"() => window.__mm.hunt().found > {k}", timeout=T)


def test_hunt_button_starts_a_hunt_with_five_spots(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        assert page.text_content("#huntbtn") == "Surprise hunt"
        page.click("#huntbtn")
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "hunt" and h["total"] == 5 and h["found"] == 0
        assert h["boxesVisible"] == 5 and not h["cpsVisible"]
        assert "Find the 5 presents" in page.text_content("#toast")
        assert page.text_content("#tl .mode") == "Surprise hunt · Hochrhein"
        assert errors == []
        b.close()


def test_spots_differ_by_seed_and_sit_on_roads(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("window.__mm.startHunt(1)"); a = page.evaluate("window.__mm.hunt().spots")
        page.evaluate("window.__mm.startHunt(2)"); c = page.evaluate("window.__mm.hunt().spots")
        assert a != c
        for x, z, _y in a:
            page.evaluate("([x, z]) => window.__mm.place(x, z)", [x, z])
            assert page.evaluate("window.__mm.roadDist()") < 1
        b.close()


def test_collecting_all_five_ends_with_a_result_and_a_best(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("localStorage.removeItem('mm.huntBest')")
        page.evaluate("window.__mm.startHunt(3)")
        kinds = []
        for k in range(5):
            collect(page, k)
            assert page.text_content("#toast").startswith(f"Present {k + 1}/5")
            kinds.append(page.text_content("#toast").split("/5", 1)[1])   # the surprise line, without "Present n/5"
        assert len(set(kinds[:4])) == 4
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        assert "All presents found!" in page.text_content("#result") or "New record!" in page.text_content("#result")
        assert page.text_content("#huntbtn") == "Retry" and page.text_content("#startbtn") == "Start"
        assert page.evaluate("localStorage.getItem('mm.huntBest')") is not None
        assert errors == []
        b.close()


def test_a_box_is_not_collected_from_30_m_away(server):
    """The flying and height rules are unit-tested in presents.test.mjs (canCollect); here only the wiring."""
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("window.__mm.startHunt(4)")
        page.evaluate("() => { const [x, z] = window.__mm.hunt().spots[0]; window.__mm.place(x + 30, z); }")
        page.wait_for_timeout(300)
        assert page.evaluate("window.__mm.hunt().found") == 0
        b.close()


def test_surprises_change_the_car(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.evaluate("window.__mm.startHunt(5)")
        page.evaluate("window.__mm.surprise('moon')")
        assert page.evaluate("window.__mm.hunt().gravity") == 0.35
        page.evaluate("window.__mm.surprise('repair')")
        assert page.evaluate("window.__mm.hunt().dmg") == 0
        page.evaluate("window.__mm.surprise('turbo')")
        assert page.evaluate("window.__mm.hunt().timers.turbo") > 5
        page.keyboard.press("Escape")  # pause freezes the timers
        t1 = page.evaluate("window.__mm.hunt().timers.turbo"); page.wait_for_timeout(500)
        assert page.evaluate("window.__mm.hunt().timers.turbo") == t1
        page.keyboard.press("Escape")
        page.evaluate("window.__mm.surprise('hop')")
        page.wait_for_function("() => { const c = window.__mm.car(); return c.y > c.ground + 0.3; }", timeout=T)
        b.close()


def test_pause_restart_starts_a_new_hunt(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.click("#huntbtn")
        page.keyboard.press("Escape"); page.click("#pauserestart")
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "hunt" and h["found"] == 0 and h["total"] == 5
        b.close()


def test_german_labels_survive_a_language_switch(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server, locale="de-CH")
        page.evaluate("localStorage.removeItem('gg-lang')")
        page.click("#huntbtn")
        assert page.text_content("#tl .mode") == "Überraschungsjagd · Hochrhein"
        page.evaluate("window.ggSetLang('en')")
        assert page.text_content("#tl .mode") == "Surprise hunt · Hochrhein"
        assert page.text_content("#cpname") in ("Nearest present", "")  # hud writes it next frame
        b.close()


def test_trial_is_unchanged(server):
    with sync_playwright() as p:
        b, page, _ = open_page(p, server)
        page.click("#startbtn")
        h = page.evaluate("window.__mm.hunt()")
        assert h["mode"] == "trial" and h["cpsVisible"] and h["boxesVisible"] == 0
        assert page.text_content("#tl .mode") == "Time trial · Hochrhein"
        b.close()
```

   Adjust selectors and timing to what the page really does (e.g. `#pauserestart` needs the pause menu open; `__mm.place` resets speed, so the 'armed' → 'racing' transition may need one `__mm.sim` step — boxes are collected in `'armed'` too, so the result path does not depend on it). Do **not** weaken an assertion to make it pass; fix the implementation.

**Step 2 — commit, push, then run in the foreground:**

```bash
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_hunt.py prototype/tests/test_pause.py prototype/tests/test_i18n.py -x -q
```

   If a test fails 3 times, stop and report what is going wrong (CLAUDE.md).

verify: all three files pass; `node --test prototype/tests/*.test.mjs` green.

### Task 6: Changelog and PR

1. `CHANGELOG.md` → `## [Unreleased]` → `### Added`:

```markdown
- A new game mode for younger drivers: **Surprise hunt**. Five glowing gift boxes hide on the roads around the start, in different places every time. Follow the arrow, drive into a box, and it bursts into confetti with a surprise: a super jump, six seconds of turbo, ten seconds of moon gravity, or a free repair. Find all five to see your time; the best one is kept. In German the mode is called „Überraschungsjagd".
```

2. Commit `docs(changelog): surprise hunt (#108)`, push, open the PR `feat(modes): surprise hunt — five presents, five surprises` with `Closes #108`, the Task 0 decision (Blitz landed or not), the `NaN` best side fix, and the test commands run.

verify: PR open, CI green.
