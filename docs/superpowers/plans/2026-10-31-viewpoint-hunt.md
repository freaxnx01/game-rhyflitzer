# Viewpoint hunt (#508) Implementation Plan

**Goal:** a fifth mode **Viewpoints** / **Aussichtspunkte** (mode id `view`): four hand-picked panorama spots in the
Hochrhein world. Follow the arrow, stand there, face the sight, press **X**: 100 points plus up to 50 for aim. All four →
result screen with points, time and (phase 2) the in-game photo album.
Spec: `docs/superpowers/specs/2026-10-31-viewpoint-hunt-design.md`.

**Precondition: #551 (Cruise mode) is merged.** This plan edits the code as the #551 plan
(`docs/superpowers/plans/2026-10-31-cruise-mode.md`) leaves it and uses its names: `MODES` (`startscreen.js`),
`startModeFrom(search, raceless)`, `lastModeFrom(stored, raceless)`, `allowedModes`, `RACELESS_MODES`, `hasCheckpoints`,
`START_MODE`, `#cruisebtn`, `MODE_BTN`, `pauseButtonsFor`, the `?mode=` URL parameter. If `grep -n "startModeFrom" startscreen.js`
finds nothing, #551 is not merged: stop and report, do not implement #551 here.
**#538 (Umami)** is generic over `MODES`: nothing to add. Only if `trackModeEnd` exists in `index.html` (i.e. #538 is
merged), `endView` calls `trackModeEnd('finished')` right after `SFX.finish();`, like `endHunt`.

**Phases.** Phase 1 (Tasks 1-7) is the playable mode and ships on its own. Phase 2 (Tasks 8-10) adds the album. If one
pipeline run cannot finish both, open the PR after Phase 1 (the changelog entry of Task 7 stands alone) and leave
Phase 2 for a second run on the same issue.

**Files**
- Create: `viewpoints.js`, `tests/viewpoints.test.mjs`, `tests/test_viewpoints.py`.
- Modify: `startscreen.js`, `strings.js`, `index.html`, `CHANGELOG.md`, `tests/startscreen.test.mjs`,
  `tests/test_start_screen.py`, `tests/test_carselect.py`, `tests/test-map.json`.
- Overlap with #551: `startscreen.js`, `strings.js`, `index.html`, `CHANGELOG.md`, `tests/startscreen.test.mjs`,
  `tests/test_start_screen.py`, `tests/test_carselect.py` (all edited by #551 first; this plan edits the #551 result).

**Global constraints**
- The game lives at the repo root; tests in `tests/`.
- No new key binding. X (`KeyX`) is the existing photo key: it passes on foot (`foot.js:88`), is blocked in the loco
  (`train.js:199`) and takes a photo in the pause menu (`pause.js:34`); none of that changes. Pause-menu photos never score.
- X keeps downloading the PNG in every mode (`savePhoto`), the view mode included.
- Viewpoint names are proper names: plain strings in `viewpoints.js`, never translated, always written with
  `textContent` / `toast()` (plain text), never `innerHTML`.
- Never weaken an existing test. Only the structural bar lists change (a new button).
- Run tests: `node --test tests/*.test.mjs`, then only the Playwright files of this plan, in the foreground:
  `pytest tests/test_viewpoints.py tests/test_start_screen.py tests/test_carselect.py -x`.
  Commit and push the branch before starting the Playwright run.

---

# Phase 1 - the mode

## Task 1 - Pure viewpoint rules in `viewpoints.js` (TDD)

- [ ] **Step 1: Write the failing test** `tests/viewpoints.test.mjs`:

```js
// #508: the viewpoint hunt's pure rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW, VIEWPOINT_DEFS, viewpointsFor, resolveViewpoints, standsAt, standingAt, aimError, shotPoints, maxPoints } from '../viewpoints.js';

const RAD = Math.PI / 180;
const vp = { id: 'a', n: 'A', subjectN: 'S', x: 0, z: 0, r: 10, minY: -Infinity, sx: 100, sz: 0 };
const facing = (deg, extra = {}) => ({ x: 0, y: 0, z: 0, dx: Math.cos(deg * RAD), dz: Math.sin(deg * RAD), ...extra });

test('VIEWPOINT_DEFS: Hochrhein has the four hand-picked viewpoints, Rheinblick at the issue coordinates', () => {
  assert.deepEqual(VIEWPOINT_DEFS.hochrhein.map(d => d.id), ['rheinblick', 'plattform', 'fridolinsbruecke', 'muensterplatz']);
  assert.deepEqual(VIEWPOINT_DEFS.hochrhein[0].at, { x: -1515.1, z: 870.4 });
  assert.equal(VIEWPOINT_DEFS.hochrhein[1].at, 'plattform');
});

test('viewpointsFor: only built-in regions with a list have viewpoints', () => {
  assert.equal(viewpointsFor({ id: 'hochrhein', generated: false }).length, 4);
  assert.deepEqual(viewpointsFor({ id: 'ehrendingen', generated: false }), []);
  assert.deepEqual(viewpointsFor({ id: 'hochrhein', generated: true }), []);
});

test('resolveViewpoints: landmark keys and fixed points resolve, a missing landmark drops the viewpoint', () => {
  const defs = [
    { id: 'one', n: 'One', at: 'a', r: 5, aboveGround: 5, subject: 's', subjectN: 'S' },
    { id: 'two', n: 'Two', at: { x: 7, z: 8 }, r: 3, subject: { x: 9, z: 10 }, subjectN: 'T' },
    { id: 'three', n: 'Three', at: 'a', r: 3, subject: 'missing', subjectN: 'M' },
  ];
  const got = resolveViewpoints(defs, { a: { x: 1, z: 2 }, s: { x: 5, z: 6 } }, () => 10);
  assert.deepEqual(got, [
    { id: 'one', n: 'One', subjectN: 'S', x: 1, z: 2, r: 5, minY: 15, sx: 5, sz: 6 },
    { id: 'two', n: 'Two', subjectN: 'T', x: 7, z: 8, r: 3, minY: -Infinity, sx: 9, sz: 10 },
  ]);
  assert.deepEqual(resolveViewpoints(defs, undefined, () => 0).map(v => v.id), ['two']);
});

test('standsAt: inside the radius and high enough', () => {
  assert.equal(standsAt(vp, facing(0, { x: 9.9 })), true);
  assert.equal(standsAt(vp, facing(0, { x: 10.1 })), false);
  const deck = { ...vp, minY: 5 };
  assert.equal(standsAt(deck, facing(0, { y: 5.7 })), true);
  assert.equal(standsAt(deck, facing(0, { y: 0.2 })), false);
});

test('standingAt: the first open viewpoint the pose stands at, else -1', () => {
  const b = { ...vp, id: 'b', x: 500 };
  assert.equal(standingAt([b, vp], [false, false], facing(0)), 1);
  assert.equal(standingAt([b, vp], [false, true], facing(0)), -1);
});

test('aimError: degrees between the camera and the subject, across the +-180 seam', () => {
  assert.equal(Math.round(aimError(vp, facing(0))), 0);
  assert.equal(Math.round(aimError(vp, facing(90))), 90);
  const behind = { ...vp, sx: -100, sz: 1 };   // subject at about 179.4 deg
  assert.ok(aimError(behind, facing(-179)) < 2);
});

test('shotPoints: 150 dead on, less when off, 0 past the aim limit or away from the spot', () => {
  assert.equal(shotPoints(vp, facing(0)), 150);
  assert.equal(shotPoints(vp, facing(15)), 125);
  assert.equal(shotPoints(vp, facing(VIEW.aimDeg - 0.5)), 101);   // just inside the limit (exactly 30 deg is float-fragile)
  assert.equal(shotPoints(vp, facing(VIEW.aimDeg + 1)), 0);
  assert.equal(shotPoints(vp, facing(0, { x: 50 })), 0);
});

test('maxPoints: 150 per viewpoint', () => {
  assert.equal(maxPoints([vp, vp, vp, vp]), 600);
});
```

- [ ] **Step 2: Run** `node --test tests/viewpoints.test.mjs` - fails (no module).
- [ ] **Step 3: Implement** `viewpoints.js`:

```js
// viewpoints.js (#508): the viewpoint hunt -- the hand-picked panorama spots, where a photo counts and what it scores.
// Pure: no DOM, no three.js. Unit-tested with `node --test tests/*.test.mjs`.
// World metres, x east, z south (origin: data/world_<region>.json). Names are proper names: never translated.

export const VIEW = { aimDeg: 30, base: 100, bonus: 50, endS: 2 };

// stand `at` (a landmark key of the world's anchors.landmarks, or {x, z}) within r metres, at least `aboveGround` metres up
// (the Plattform deck), and face `subject` (a landmark key or {x, z})
export const VIEWPOINT_DEFS = {
  hochrhein: [
    { id: 'rheinblick', n: 'Rheinblick Stein', at: { x: -1515.1, z: 870.4 }, r: 25, subject: 'fridolinsbruecke', subjectN: 'Fridolinsbrücke' },   // #508: the car park above the Rhine, LV95 2638266 / 1265917
    { id: 'plattform', n: 'Plattform Sisslerfeld', at: 'plattform', r: 6, aboveGround: 5, subject: 'dsmChimney', subjectN: 'DSM-Kamin' },   // the deck (5.735 m, plattform.js), on foot via the stair (#413)
    { id: 'fridolinsbruecke', n: 'Fridolinsbrücke', at: 'fridolinsbruecke', r: 40, subject: 'holzbruecke', subjectN: 'Holzbrücke' },
    { id: 'muensterplatz', n: 'Münsterplatz', at: { x: -1290.3, z: -91.4 }, r: 30, subject: 'muenster', subjectN: 'Fridolinsmünster' },
  ],
};

export function viewpointsFor(region) {
  return region.generated ? [] : VIEWPOINT_DEFS[region.id] || [];
}

const pointOf = (ref, landmarks) => (typeof ref === 'string' ? landmarks[ref] : ref);

// a world without one of the landmarks simply has one viewpoint fewer
export function resolveViewpoints(defs, landmarks = {}, groundAt) {
  const out = [];
  for (const d of defs) {
    const at = pointOf(d.at, landmarks), subject = pointOf(d.subject, landmarks);
    if (!at || !subject) continue;
    const minY = d.aboveGround === undefined ? -Infinity : groundAt(at.x, at.z) + d.aboveGround;
    out.push({ id: d.id, n: d.n, subjectN: d.subjectN, x: at.x, z: at.z, r: d.r, minY, sx: subject.x, sz: subject.z });
  }
  return out;
}

// pose = { x, y, z } of the player plus the camera's horizontal direction { dx, dz }
export function standsAt(vp, pose) {
  return Math.hypot(pose.x - vp.x, pose.z - vp.z) <= vp.r && pose.y >= vp.minY;
}

export function standingAt(spots, shot, pose) {
  return spots.findIndex((vp, i) => !shot[i] && standsAt(vp, pose));
}

export function aimError(vp, pose) {
  const want = Math.atan2(vp.sz - pose.z, vp.sx - pose.x), have = Math.atan2(pose.dz, pose.dx);
  const d = Math.abs(want - have) % (2 * Math.PI);
  return (d > Math.PI ? 2 * Math.PI - d : d) * 180 / Math.PI;
}

export function shotPoints(vp, pose) {
  if (!standsAt(vp, pose)) return 0;
  const err = aimError(vp, pose);
  return err > VIEW.aimDeg ? 0 : VIEW.base + Math.round(VIEW.bonus * (1 - err / VIEW.aimDeg));
}

export const maxPoints = (spots) => spots.length * (VIEW.base + VIEW.bonus);
```

- [ ] **Step 4: Run** `node --test tests/viewpoints.test.mjs` - all pass. Commit `feat(modes): viewpoint rules in viewpoints.js (#508)`.

## Task 2 - The `view` mode in `startscreen.js` (TDD)

- [ ] **Step 1: Write the failing tests.** In `tests/startscreen.test.mjs` (as #551 left it): change the MODES test to

```js
test('MODES are cruise, the three race modes and the viewpoint hunt in bar order', () => {
  assert.deepEqual(MODES, ['cruise', 'trial', 'blitz', 'hunt', 'view']);
});
```

  and append:

```js
test('startModeFrom: ?mode=view only where the world has viewpoints', () => {
  assert.equal(startModeFrom('?mode=view', false, true), 'view');
  assert.equal(startModeFrom('?mode=view', false, false), 'cruise');
  assert.equal(startModeFrom('?mode=view', false), 'cruise');
  assert.equal(startModeFrom('?mode=view', true, true), 'cruise');
  assert.equal(startModeFrom('?mode=trial', false, true), 'trial');
});

test('lastModeFrom: a stored view needs viewpoints', () => {
  assert.equal(lastModeFrom('view', false, true), 'view');
  assert.equal(lastModeFrom('view', false, false), 'cruise');
  assert.equal(lastModeFrom('hunt', true, true), 'hunt');
});

test('modeTextKey and hasCheckpoints know the viewpoint hunt', () => {
  assert.equal(modeTextKey('view', { intro: 'intro' }), 'viewIntro');
  assert.equal(hasCheckpoints('view'), false);
});
```

- [ ] **Step 2: Run** `node --test tests/startscreen.test.mjs` - fails.
- [ ] **Step 3: Implement** in `startscreen.js` (#551's functions get an optional third parameter; existing calls keep working):

```js
export const MODES = ['cruise', 'trial', 'blitz', 'hunt', 'view'];
// #551: a generated world without a race has no checkpoints, so only these two make sense there
const RACELESS_MODES = ['cruise', 'hunt'];

// #508: the viewpoint hunt needs a world with hand-picked viewpoints (viewpoints.js)
const allowedModes = (raceless, hasViewpoints) => (raceless ? RACELESS_MODES : MODES).filter(m => m !== 'view' || hasViewpoints);

export function startModeFrom(search, raceless, hasViewpoints = false) {
  const wanted = new URLSearchParams(search).get('mode');
  return allowedModes(raceless, hasViewpoints).includes(wanted) ? wanted : 'cruise';
}

export function lastModeFrom(stored, raceless, hasViewpoints = false) {
  return allowedModes(raceless, hasViewpoints).includes(stored) ? stored : 'cruise';
}
```

  and in `modeTextKey` add `if (mode === 'view') return 'viewIntro';` next to the cruise line. Keep #551's comments.
- [ ] **Step 4: Run** `node --test tests/startscreen.test.mjs` - all pass. Commit `feat(modes): view mode in startscreen.js (#508)`.

## Task 3 - Strings (en + de)

- [ ] In `strings.js` add to **both** language blocks (next to #551's `cruise` keys):

```js
  // en
  view: 'Viewpoints',
  modeView: (r) => `Viewpoints · ${r}`,
  viewIntro: 'The finest views of the region. Follow the arrow, stand at the viewpoint, face the sight and press X. A well-aimed photo scores more.',
  viewStart: 'Find the viewpoints. Photo with X.',
  viewsLabel: 'viewpoints',
  viewTarget: (n) => `Viewpoint: ${n}`,
  viewAimTarget: (n) => `Aim at: ${n} · X`,
  viewMiss: 'Photo taken, but there is no viewpoint here. Follow the arrow.',
  viewAim: (n) => `Photo taken. Turn towards ${n} and press X again.`,
  viewScored: (n, pts, k, total) => `${n}: +${pts} points (${k}/${total})`,
  viewAllShot: 'All viewpoints photographed!',
  viewPoints: (pts, max) => `${pts} / ${max} points`,
  viewFinishedText: 'Every viewpoint photographed. Again for better-aimed photos.',
  // de
  view: 'Aussichtspunkte',
  modeView: (r) => `Aussichtspunkte · ${r}`,
  viewIntro: 'Die schönsten Aussichten der Region. Folge dem Pfeil, stell Dich auf den Aussichtspunkt, schau zum Motiv und drück X. Ein gut gezieltes Foto gibt mehr Punkte.',
  viewStart: 'Finde die Aussichtspunkte. Foto mit X.',
  viewsLabel: 'Aussichtspunkte',
  viewTarget: (n) => `Aussichtspunkt: ${n}`,
  viewAimTarget: (n) => `Ziel: ${n} · X`,
  viewMiss: 'Foto gemacht, aber hier ist kein Aussichtspunkt. Folge dem Pfeil.',
  viewAim: (n) => `Foto gemacht. Dreh Dich zu ${n} und drück nochmals X.`,
  viewScored: (n, pts, k, total) => `${n}: +${pts} Punkte (${k}/${total})`,
  viewAllShot: 'Alle Aussichtspunkte fotografiert!',
  viewPoints: (pts, max) => `${pts} / ${max} Punkte`,
  viewFinishedText: 'Alle Aussichtspunkte fotografiert. Nochmals für besser gezielte Fotos.',
```

- [ ] Run `node --test tests/strings.test.mjs` (key parity, arity, no ß) - passes. Commit `feat(modes): viewpoint strings (#508)`.

## Task 4 - Wire the mode into `index.html`

All edits name the function or line they change; keep the surrounding code unchanged. Line numbers drift after #551/#538:
find each place by the quoted code.

- [ ] **Import** (next to the `./startscreen.js` import):
  `import { VIEW, viewpointsFor, resolveViewpoints, standingAt, shotPoints, maxPoints } from './viewpoints.js';   // #508`
  (`nearestPresent` is already imported from `./presents.js` and is reused: it is generic over `{x, z}` spots.)
- [ ] **Markup** (start bar, after `#huntbtn`, before `#carbtn`):

```html
        <button id="viewbtn" class="btn" type="button" disabled data-i18n="view">Viewpoints</button>
```

- [ ] **CSS** in the phone media block (`@media (max-width:600px)`, where #551 added `#cruisebtn{grid-column:1/-1}`), append
  `#viewbtn:not([hidden])~#carbtn{grid-column:1/-1}` (hunt + view share a row, the car button gets the full next row).
- [ ] **State** (right after the `PRESENT_CANDS` line in the race section):

```js
// #508: the viewpoint hunt -- only the OSM world carries the landmark anchors the viewpoints stand on
const VIEWPOINTS = L ? resolveViewpoints(viewpointsFor(REGION), L.anchors.landmarks, terrainH) : [];
let VIEW_RUN = { shot: [], pts: [], endIn: 0 };
function startViewRun() { VIEW_RUN = { shot: VIEWPOINTS.map(() => false), pts: VIEWPOINTS.map(() => 0), endIn: 0 }; }
```

- [ ] **Start mode**: `startModeFrom(location.search, RACELESS)` becomes `startModeFrom(location.search, RACELESS, VIEWPOINTS.length > 0)`;
  in `const SHOWN = { mode: lastModeFrom(…, RACELESS) }` pass `VIEWPOINTS.length > 0` as the third argument too.
- [ ] **`startRace`**: after `startHuntRun(hunt, rng);` add `startViewRun();`; at the end, after `if (hunt) toast(tr('huntStart'), TOAST_S.event);`
  add `if (mode === 'view') toast(tr('viewStart'), TOAST_S.event);`.
- [ ] **`resetMode`**: append `startViewRun();` (every way back to the start screen clears the run).
- [ ] **`modeKey`**: add `R.mode === 'view' ? 'modeView' :` in front of the hunt test.
- [ ] **`renderModeLine`**: `const hunt = R.mode === 'hunt', view = R.mode === 'view', …`; the counter label becomes
  `tr(hunt ? 'presentsLabel' : view ? 'viewsLabel' : 'checkpointsLabel')` and the pips
  `setPipCount(hunt ? HUNT_RUN.spots.length : view ? VIEWPOINTS.length : CPS.length)`.
- [ ] **`updatePips`**: `const on = R.mode === 'hunt' ? HUNT_RUN.found : R.mode === 'view' ? VIEW_RUN.shot : cpObjs.map(c => c.done);`
- [ ] **`stepRace`**: after #551's cruise line and next to `if (R.mode === 'hunt') { stepHunt(dt); return; }` add
  `if (R.mode === 'view') { stepView(dt); return; }`. New functions below `stepHunt`:

```js
// #508: the clock runs from the first movement; the arrow leads to the nearest open viewpoint, and once there to its subject
function stepView(dt) {
  if (R.state === 'armed' && Math.hypot(P.vx, P.vz) > 0.5) R.state = 'racing';
  if (R.state === 'racing') R.t += dt;
  if (VIEW_RUN.endIn > 0) { VIEW_RUN.endIn -= dt; if (VIEW_RUN.endIn <= 0) showViewResult(); }
  R.target = R.state === 'finished' ? null : viewTarget(shotPose());
}
function viewTarget(pose) {
  const here = standingAt(VIEWPOINTS, VIEW_RUN.shot, pose);
  if (here >= 0) { const v = VIEWPOINTS[here]; return { x: v.sx, z: v.sz, n: v.subjectN, i: here, view: 'aim' }; }
  const i = nearestPresent(VIEWPOINTS, VIEW_RUN.shot, P.x, P.z);
  return i < 0 ? null : { x: VIEWPOINTS[i].x, z: VIEWPOINTS[i].z, n: VIEWPOINTS[i].n, i, view: 'go' };
}
const SHOT_DIR = new THREE.Vector3();
// where the photo is taken from (the player: car, walker or helicopter) and where the camera looks
function shotPose() { camera.getWorldDirection(SHOT_DIR); return { x: P.x, y: P.y, z: P.z, dx: SHOT_DIR.x, dz: SHOT_DIR.z }; }
// X in the viewpoint hunt: scores once at an open viewpoint when aimed at its subject; the note replaces the "Photo taken" toast
function viewShot() {
  if (R.state !== 'armed' && R.state !== 'racing') return;
  const pose = shotPose(), i = standingAt(VIEWPOINTS, VIEW_RUN.shot, pose);
  if (i < 0) { photoNote = tr('viewMiss'); return; }
  const pts = shotPoints(VIEWPOINTS[i], pose);
  if (!pts) { photoNote = tr('viewAim', VIEWPOINTS[i].subjectN); return; }
  scoreView(i, pts);
}
function scoreView(i, pts) {
  VIEW_RUN.shot[i] = true; VIEW_RUN.pts[i] = pts; R.done++; updatePips(); SFX.present();
  photoNote = tr('viewScored', VIEWPOINTS[i].n, pts, R.done, VIEWPOINTS.length);
  if (R.done === VIEWPOINTS.length) endView();
}
function endView() { stopAuto('reset'); R.state = 'finished'; SFX.finish(); R.last = { mode: 'view', t: R.t, pts: VIEW_RUN.pts.reduce((a, b) => a + b, 0), max: maxPoints(VIEWPOINTS) }; VIEW_RUN.endIn = VIEW.endS; }
function showViewResult() { VIEW_RUN.endIn = 0; if (R.state !== 'finished' || R.mode !== 'view') return; endFoot(); /* the Plattform is shot on foot: no pointer lock behind the result (#365) */ $('result').hidden = false; renderOverlay(); $('overlay').hidden = false; }
```

  (#538 merged → `endView` gets `trackModeEnd('finished');` after `SFX.finish();`.)
- [ ] **Photo** (`// ---------- photo (#113) ----------`): add `let photoNote = null;   // #508: the viewpoint hunt's word on this photo, shown instead of "Photo taken"`
  next to `let photoPending`, and change `savePhoto`:

```js
function savePhoto(blob) {
  const note = photoNote; photoNote = null;
  if (!blob) { toast(tr('photoFailed')); return; }
  …   // the download lines stay as they are
  toast(note || tr('photoSaved'), note ? TOAST_S.event : TOAST_S.info);
}
```

- [ ] **X key** (main keydown handler): `if (e.code === 'KeyX' && canPhoto($('overlay').hidden)) photoPending = true;` becomes
  `if (e.code === 'KeyX' && canPhoto($('overlay').hidden)) { photoPending = true; if (R.mode === 'view') viewShot(); }`.
  The pause menu's `PAUSE_KEYS.photo` stays as it is (no scoring while paused).
- [ ] **HUD target name** (`hud()`): `$('cpname').textContent = R.target.view ? tr(R.target.view === 'aim' ? 'viewAimTarget' : 'viewTarget', R.target.n) : R.target.hunt ? …` (rest unchanged).
- [ ] **Minimap** (`drawMap`): after #551's `else if (R.mode === 'hunt') { … }` branch add `else if (R.mode === 'view') drawViewMarks(v);` and below `drawMap`:

```js
// #508: the open viewpoints as cyan squares, the arrow's target ringed yellow
function drawViewMarks(v) { VIEWPOINTS.forEach((s, i) => { if (VIEW_RUN.shot[i]) return; const [cx, cy] = mapPt(v, s.x, s.z); mg.beginPath(); mg.rect(cx - 6, cy - 6, 12, 12); mg.fillStyle = '#5fd0ff'; mg.fill(); mg.lineWidth = 2; mg.strokeStyle = R.target && R.target.view && R.target.i === i ? '#ffc61a' : '#1c1f26'; mg.stroke(); }); }
```

- [ ] **Start screen**: `MODE_BTN` gains `viewbtn: 'view'` (after `huntbtn`). Next to the `RACELESS` hide line add
  `if (!VIEWPOINTS.length) $('viewbtn').hidden = true;   // #508: only a world with viewpoints offers the hunt`.
  Click handler next to the hunt's: `$('viewbtn').onclick = () => { SFX.start(); startRace('view'); };`
- [ ] **`renderOverlay`**: add `$('viewbtn').textContent = tr(done && R.mode === 'view' ? 'retry' : 'view');`
- [ ] **`modeText`**: in the finished branch, `mode === 'hunt' ? 'huntFinishedText' :` gets `mode === 'view' ? 'viewFinishedText' :` after it.
- [ ] **`resultHtml`**: first line inside, after the `timeUp` test:
  `if (last.mode === 'view') return `<small>${tr('viewAllShot')}</small>${tr('viewPoints', last.pts, last.max)}<small>${tr('time')} ${fmt(last.t)}</small>`;`
- [ ] **Test hooks** (next to `window.__mm.hunt`):

```js
window.__mm.views = () => ({ mode: R.mode, state: R.state, shot: R.done, total: VIEWPOINTS.length, spots: VIEWPOINTS.map(s => ({ id: s.id, x: s.x, z: s.z, sx: s.sx, sz: s.sz })), pts: [...VIEW_RUN.pts], target: R.target && R.target.view ? { view: R.target.view, n: R.target.n, i: R.target.i } : null, pose: shotPose(), last: R.last ? { ...R.last } : null });
window.__mm.viewScore = (i, pts) => scoreView(i, pts);   // tests: score viewpoint i without getting there (the Plattform needs the stair)
window.__mm.viewSetEndIn = (s) => { VIEW_RUN.endIn = s; };   // tests: skip the 2 s before the result screen
```

- [ ] `node --test tests/*.test.mjs` - all pass. Commit `feat(modes): viewpoint hunt, photos at panorama spots score points (#508)`.

## Task 5 - Playwright `tests/test_viewpoints.py`

- [ ] Create (the OSM world loads; only the terrain is blocked, like `tests/test_start_screen.py`):

```python
"""#508: the viewpoint hunt. The OSM world loads (the viewpoints stand on its landmarks); terrain blocked.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.views && document.querySelector('#worldstatus')?.textContent"
T = 240000
AIMED = """(id) => { const v = window.__mm.views(), s = v.spots.find(q => q.id === id), p = v.pose;
  const want = Math.atan2(s.sz - p.z, s.sx - p.x), have = Math.atan2(p.dz, p.dx);
  let d = Math.abs(want - have) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d < 0.3; }"""


def boot(p, server, query="", init=None):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US", accept_downloads=True).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    if init:
        page.add_init_script(init)
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def start_view(page):
    page.click("#viewbtn")
    page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)


def test_query_preselects_the_viewpoint_hunt_and_the_hud_leads_to_a_viewpoint(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?mode=view")
        before = page.evaluate("() => ({ focus: document.activeElement.id, shown: !document.querySelector('#viewbtn').hidden, label: document.querySelector('#viewbtn').textContent })")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.wait_for_function("() => window.__mm.views().target", timeout=T)
        v = page.evaluate("() => window.__mm.views()")
        hud = page.evaluate("() => ({ line: document.querySelector('#tl .mode').textContent, total: document.querySelector('#cpt').textContent, pips: document.querySelector('#pips').children.length, name: document.querySelector('#cpname').textContent })")
        b.close()
    assert before == {"focus": "viewbtn", "shown": True, "label": "Viewpoints"}, before
    assert v["mode"] == "view" and v["total"] == 4 and v["shot"] == 0, v
    assert [s["id"] for s in v["spots"]] == ["rheinblick", "plattform", "fridolinsbruecke", "muensterplatz"]
    assert v["target"]["view"] == "go", v
    assert hud["line"] == "Viewpoints · Hochrhein" and hud["total"] == "4" and hud["pips"] == 4, hud
    assert hud["name"].startswith("Viewpoint: "), hud
    assert errors == []


def test_a_photo_at_rheinblick_aimed_at_the_bridge_scores_once(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_view(page)
        page.evaluate("""() => { const s = window.__mm.views().spots.find(q => q.id === 'rheinblick');
            window.__mm.place(s.x, s.z, Math.atan2(s.sz - s.z, s.sx - s.x)); }""")
        page.wait_for_function("() => window.__mm.views().target && window.__mm.views().target.view === 'aim'", timeout=T)
        page.wait_for_function(AIMED, arg="rheinblick", timeout=T)   # the chase camera swings in behind the car
        with page.expect_download(timeout=120000):
            page.keyboard.press("KeyX")
        page.wait_for_function("() => window.__mm.toast().text.includes('Rheinblick Stein: +')", timeout=T)
        first = page.evaluate("() => window.__mm.views()")
        with page.expect_download(timeout=120000):
            page.keyboard.press("KeyX")
        page.wait_for_function("() => window.__mm.toast().text.includes('no viewpoint here')", timeout=T)
        second = page.evaluate("() => window.__mm.views()")
        b.close()
    assert first["shot"] == 1 and 100 <= first["pts"][0] <= 150, first
    assert second["shot"] == 1 and second["pts"] == first["pts"], second
    assert errors == []


def test_far_from_any_viewpoint_x_only_takes_the_photo(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_view(page)
        with page.expect_download(timeout=120000):
            page.keyboard.press("KeyX")
        page.wait_for_function("() => window.__mm.toast().text.includes('no viewpoint here')", timeout=T)
        v = page.evaluate("() => window.__mm.views()")
        b.close()
    assert v["shot"] == 0 and v["state"] in ("armed", "racing"), v
    assert errors == []


def test_all_viewpoints_end_the_run_with_points_and_time(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_view(page)
        page.evaluate("() => { for (let i = 0; i < 4; i++) window.__mm.viewScore(i, 120); }")
        assert page.evaluate("() => window.__mm.views().state") == "finished"
        page.evaluate("() => window.__mm.viewSetEndIn(0.01)")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        got = page.evaluate("() => ({ result: document.querySelector('#result').textContent, again: document.querySelector('#viewbtn').textContent, last: window.__mm.views().last })")
        b.close()
    assert "All viewpoints photographed!" in got["result"] and "480 / 600 points" in got["result"], got
    assert got["again"] == "Again" and got["last"]["mode"] == "view" and got["last"]["pts"] == 480, got
    assert errors == []


def test_ehrendingen_has_no_viewpoints_and_falls_back_to_cruise(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?region=ehrendingen&mode=view")
        got = page.evaluate("() => ({ hidden: document.querySelector('#viewbtn').hidden, focus: document.activeElement.id, total: window.__mm.views().total })")
        b.close()
    assert got == {"hidden": True, "focus": "cruisebtn", "total": 0}, got
    assert errors == []
```

- [ ] `tests/test-map.json`: add `"viewpoints.js": ["test_viewpoints.py"],` next to `"presents.js"`.
- [ ] Commit `test(modes): viewpoint hunt (#508)`.

## Task 6 - Keep the bar tests in step (structural lists only)

- [ ] `tests/test_start_screen.py` (as #551 left it): `BAR` gains `"viewbtn"` before `"carbtn"`. In
  `test_bar_order_focus_order_and_enter_starts` the Tab order after `cruisebtn` becomes
  `["startbtn", "blitzbtn", "huntbtn", "viewbtn", "carbtn"]` (five presses; the OSM world is loaded there, so the view button shows).
  `test_phone_layout_and_screenshots` stays unchanged (trial/blitz share a row, hunt is below).
- [ ] `tests/test_carselect.py`: the bar-children list becomes `["cruisebtn", "startbtn", "blitzbtn", "huntbtn", "viewbtn", "carbtn"]`
  (it lists every child, hidden ones too; that file blocks the world JSON, so `#viewbtn` is hidden there).
- [ ] Check for more full-bar lists: `grep -rn "huntbtn\", \"carbtn" tests/*.py` - every hit must contain `viewbtn`.
- [ ] Run `node --test tests/*.test.mjs`, push, then (foreground)
  `pytest tests/test_viewpoints.py tests/test_start_screen.py tests/test_carselect.py -x`. Commit `test: viewpoint button in the bar lists (#508)`.

## Task 7 - Changelog (phase 1)

- [ ] Under `## [Unreleased]` → `### Added`, with the go-live time:

```markdown
- `YYYY-MM-DD HH:MM` New mode **Viewpoints**: four panorama spots, from the car park above the Rhine with the view to Bad Säckingen to the deck of the Plattform Sisslerfeld (on foot, up the spiral stair). Follow the arrow, stand at the spot, face the sight and press <kbd>X</kbd>: up to 150 points per photo, the better aimed the more.
```

- [ ] Commit `docs(changelog): viewpoint hunt (#508)`.

---

# Phase 2 - the in-game album

## Task 8 - Album rules in `viewpoints.js` (TDD)

- [ ] **Step 1: Write the failing tests** (append to `tests/viewpoints.test.mjs`, extend the import with `ALBUM, parseAlbum, albumWith, thumbSize`):

```js
const IDS = ['rheinblick', 'plattform'];
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('parseAlbum: keeps valid entries of known viewpoints, drops everything else', () => {
  assert.deepEqual(parseAlbum(null, IDS), {});
  assert.deepEqual(parseAlbum('{broken', IDS), {});
  assert.deepEqual(parseAlbum('[1,2]', IDS), {});
  const raw = JSON.stringify({
    rheinblick: { img: JPEG, pts: 140, at: 1 },
    plattform: { img: 'data:image/png;base64,AAAA', pts: 120, at: 2 },
    stranger: { img: JPEG, pts: 150, at: 3 },
  });
  assert.deepEqual(parseAlbum(raw, IDS), { rheinblick: { img: JPEG, pts: 140, at: 1 } });
});

test('parseAlbum: rejects script URLs, markup, oversize images and non-numbers', () => {
  const bad = (e) => parseAlbum(JSON.stringify({ rheinblick: e }), IDS);
  assert.deepEqual(bad({ img: 'javascript:alert(1)', pts: 1, at: 1 }), {});
  assert.deepEqual(bad({ img: JPEG + '"><img src=x>', pts: 1, at: 1 }), {});
  assert.deepEqual(bad({ img: JPEG.slice(0, 23) + 'A'.repeat(ALBUM.maxLen), pts: 1, at: 1 }), {});
  assert.deepEqual(bad({ img: JPEG, pts: '1', at: 1 }), {});
});

test('albumWith: a better or equal photo replaces, a worse one does not', () => {
  const a = { rheinblick: { img: JPEG, pts: 130, at: 1 } };
  assert.equal(albumWith(a, 'rheinblick', { img: JPEG, pts: 120, at: 2 }), a);
  assert.equal(albumWith(a, 'rheinblick', { img: JPEG, pts: 130, at: 2 }).rheinblick.at, 2);
  assert.equal(albumWith(a, 'plattform', { img: JPEG, pts: 101, at: 3 }).plattform.pts, 101);
});

test('thumbSize: 320 px wide at most, aspect kept', () => {
  assert.deepEqual(thumbSize(1280, 720), { w: 320, h: 180 });
  assert.deepEqual(thumbSize(200, 100), { w: 200, h: 100 });
});
```

- [ ] **Step 2: Run** `node --test tests/viewpoints.test.mjs` - fails.
- [ ] **Step 3: Implement** (append to `viewpoints.js`):

```js
// the album (phase 2): per viewpoint the best photo as a small JPEG in localStorage. Read back as untrusted data.
export const ALBUM = { key: 'mm.viewAlbum', width: 320, quality: 0.8, maxLen: 60000 };
const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

const validEntry = (e) => !!e && typeof e.img === 'string' && e.img.length <= ALBUM.maxLen && JPEG_DATA_URL.test(e.img)
  && typeof e.pts === 'number' && Number.isFinite(e.pts) && typeof e.at === 'number' && Number.isFinite(e.at);

export function parseAlbum(raw, ids) {
  let o;
  try { o = JSON.parse(raw); } catch (e) { return {}; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  for (const id of ids) if (validEntry(o[id])) out[id] = { img: o[id].img, pts: o[id].pts, at: o[id].at };
  return out;
}

export function albumWith(album, id, entry) {
  const old = album[id];
  return old && old.pts > entry.pts ? album : { ...album, [id]: entry };
}

export function thumbSize(w, h, maxW = ALBUM.width) {
  const s = Math.min(1, maxW / w);
  return { w: Math.round(w * s), h: Math.round(h * s) };
}
```

- [ ] **Step 4: Run** - passes. Commit `feat(modes): viewpoint album rules (#508)`.

## Task 9 - Album in `index.html` and `strings.js`

- [ ] **Strings** (both blocks): en `albumTitle: 'Your album'`, `albumPts: (p) => `${p} points``, `albumMissing: 'not yet'`;
  de `albumTitle: 'Dein Album'`, `albumPts: (p) => `${p} Punkte``, `albumMissing: 'noch nicht'`.
- [ ] **Import**: extend the `./viewpoints.js` import with `ALBUM, parseAlbum, albumWith, thumbSize`.
- [ ] **Capture** (photo section): add `let albumPending = -1;   // #508: the viewpoint the next capture also files in the album`;
  in `viewShot` replace `scoreView(i, pts);` with `scoreView(i, pts); albumPending = i;` (the `viewScore` test hook does not file
  photos); `capturePhoto` becomes

```js
function capturePhoto() { const sink = photoSink || savePhoto; photoSink = null; photoPending = false; if (albumPending >= 0) { fileAlbumPhoto(albumPending, captureThumb()); albumPending = -1; } canvas.toBlob(sink, 'image/png'); }
// #508: same task as the render, so the WebGL canvas is still readable (no preserveDrawingBuffer)
function captureThumb() { const t = thumbSize(canvas.width, canvas.height), c = document.createElement('canvas'); c.width = t.w; c.height = t.h; c.getContext('2d').drawImage(canvas, 0, 0, t.w, t.h); return c.toDataURL('image/jpeg', ALBUM.quality); }
function loadAlbum() { try { return parseAlbum(localStorage.getItem(ALBUM.key), VIEWPOINTS.map(v => v.id)); } catch (e) { return {}; } }
function fileAlbumPhoto(i, img) { if (img.length > ALBUM.maxLen) return; const album = albumWith(loadAlbum(), VIEWPOINTS[i].id, { img, pts: VIEW_RUN.pts[i], at: Date.now() }); try { localStorage.setItem(ALBUM.key, JSON.stringify(album)); } catch (e) { } }
```

- [ ] **Result screen**: in `renderOverlay`, `if (done) $('result').innerHTML = resultHtml(R.last);` becomes
  `if (done) { $('result').innerHTML = resultHtml(R.last); if (R.last.mode === 'view') renderAlbum(); }` (so a language switch
  redraws it too), and below `renderOverlay`:

```js
// #508: one frame per viewpoint, photo or empty; DOM calls only, the stored strings never reach innerHTML
function renderAlbum() {
  const album = loadAlbum(), box = document.createElement('div'), head = document.createElement('h3');
  box.id = 'album'; head.textContent = tr('albumTitle'); box.append(head);
  for (const v of VIEWPOINTS) {
    const e = album[v.id], fig = document.createElement('figure'), cap = document.createElement('figcaption');
    if (e) { const img = document.createElement('img'); img.src = e.img; img.alt = v.n; fig.append(img); } else fig.classList.add('empty');
    cap.textContent = `${v.n} · ${e ? tr('albumPts', e.pts) : tr('albumMissing')}`;
    fig.append(cap); box.append(fig);
  }
  $('result').append(box);
}
```

- [ ] **CSS** (next to the other `#result` rules):
  `#album{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px;text-align:left}#album h3{grid-column:1/-1;margin:0;font-size:16px}#album figure{margin:0}#album img,#album .empty::before{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border:2px solid var(--ink)}#album .empty::before{content:'';border-style:dashed;opacity:.5}#album figcaption{font-size:13px}   /* #508 */`
- [ ] `node --test tests/*.test.mjs` - all pass. Commit `feat(modes): in-game photo album for the viewpoints (#508)`.

## Task 10 - Album tests and changelog

- [ ] In `tests/test_viewpoints.py`, `test_a_photo_at_rheinblick_aimed_at_the_bridge_scores_once`: before `b.close()` add
  `album = page.evaluate("() => JSON.parse(localStorage.getItem('mm.viewAlbum') || '{}')")` and after the existing asserts
  `assert album["rheinblick"]["img"].startswith("data:image/jpeg;base64,") and album["rheinblick"]["pts"] == first["pts"][0], album.keys()`.
- [ ] Append:

```python
SEED = """localStorage.setItem('mm.viewAlbum', JSON.stringify({
  rheinblick: { img: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', pts: 140, at: 1 },
  plattform: { img: 'javascript:alert(1)', pts: 150, at: 2 } }));"""


def test_the_result_screen_shows_the_album_with_empty_frames(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, init=SEED)
        start_view(page)
        page.evaluate("() => { for (let i = 0; i < 4; i++) window.__mm.viewScore(i, 120); window.__mm.viewSetEndIn(0.01); }")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        got = page.evaluate("""() => [...document.querySelectorAll('#album figure')].map(f => ({
            img: !!f.querySelector('img'), empty: f.classList.contains('empty'), cap: f.querySelector('figcaption').textContent }))""")
        b.close()
    assert len(got) == 4, got
    assert got[0] == {"img": True, "empty": False, "cap": "Rheinblick Stein · 140 points"}, got
    assert got[1] == {"img": False, "empty": True, "cap": "Plattform Sisslerfeld · not yet"}, got   # the script URL was dropped
    assert errors == []
```

- [ ] Changelog: append to the Task 7 entry (or, in a second run, a new `### Added` line):
  `Every scored photo also lands in your **album** (kept in the browser, the best photo per viewpoint), shown when all viewpoints are done.`
- [ ] Run `node --test tests/*.test.mjs`, push, then (foreground) `pytest tests/test_viewpoints.py -x`.
  Commit `test(modes): viewpoint album (#508)` and `docs(changelog): viewpoint album (#508)`.
