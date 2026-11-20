# Plan: other players on the minimap and Tab map (#1113)

Spec: `docs/superpowers/specs/2026-11-20-mp-map-players-design.md`. Buildless; edit `index.html` and add one module. Run only `node --test tests/netmarks.test.mjs` and `node --test tests/*.test.mjs`. No Playwright, no trial runs.

Touches: `netmarks.js` (new), `tests/netmarks.test.mjs` (new), `index.html` (`drawMap`, new `drawNetMarks`, import line, `window.__mm.mapNetCars`), `CHANGELOG.md`.

## Task 1: pure module (TDD)

Files: `netmarks.js`, `tests/netmarks.test.mjs`.

- [ ] Write the failing test `tests/netmarks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netMapMarks, netMarkLabel } from '../netmarks.js';

const VIS = 1;   // stand-in flag bit; the module takes it as a parameter
const hex = (id) => ({ swiss: '#e0322d' })[id] ?? '#1b2d5e';
const entries = new Map([
  ['a', { car: 'x', paint: 'swiss', name: 'Ann', track: 'ta' }],
  ['b', { car: 'x', paint: 'nope', name: 'Bob', track: 'tb' }],
  ['c', { car: 'x', paint: 'swiss', name: 'Cy', track: 'tc', leaving: 5 }],
  ['d', { car: null, paint: null, name: 'Di', track: 'td' }],
  ['e', { car: 'x', paint: 'swiss', name: 'Ed', track: 'te' }],
  ['f', { car: 'x', paint: 'swiss', name: 'Flo', track: 'tf' }],
]);
const poses = { ta: { x: 1, z: 2, ry: 0.5, flags: VIS }, tb: { x: 3, z: 4, ry: -1, flags: VIS }, tc: { x: 0, z: 0, ry: 0, flags: VIS }, te: null, tf: { x: 9, z: 9, ry: 0, flags: 0 } };

test('netMapMarks_mixedEntries_onlyVisibleDrivingPlayers', () => {
  const m = netMapMarks(entries, (e) => poses[e.track], hex, VIS);
  assert.deepEqual(m.map((k) => k.id), ['a', 'b']);
});
test('netMapMarks_pose_headingIsMinusRyAndColourFromPaint', () => {
  const [a, b] = netMapMarks(entries, (e) => poses[e.track], hex, VIS);
  assert.equal(a.th, -0.5); assert.equal(a.color, '#e0322d'); assert.equal(a.x, 1); assert.equal(a.z, 2);
  assert.equal(b.color, '#1b2d5e'); assert.equal(a.name, 'Ann');
});
test('netMarkLabel_fullMapOnly', () => {
  assert.equal(netMarkLabel({ name: 'Ann' }, true), 'Ann');
  assert.equal(netMarkLabel({ name: 'Ann' }, false), null);
});
```

- [ ] Run it, see it fail. Then write `netmarks.js`:

```js
// netmarks.js (#1113): pure helpers for the other players' markers on the map. No DOM, no three.js: node --test only.

// one mark per other player who drives (has a car), is not fading out, has a pose and a set visible flag.
// poseOf(entry) -> { x, z, ry, flags } | null; colorOf(paintId) -> css colour; visibleBit = FLAG.visible
export function netMapMarks(entries, poseOf, colorOf, visibleBit) {
  const marks = [];
  for (const [id, entry] of entries) {
    if (!entry.car || entry.leaving != null) continue;
    const pose = poseOf(entry);
    if (!pose || !(pose.flags & visibleBit)) continue;
    marks.push({ id, x: pose.x, z: pose.z, th: -pose.ry, color: colorOf(entry.paint), name: entry.name ?? '' });
  }
  return marks;
}

// the name is drawn on the full (Tab) map only
export const netMarkLabel = (mark, full) => (full && mark.name ? mark.name : null);
```

- [ ] Run `node --test tests/netmarks.test.mjs`: green. Commit `feat(multiplayer): pure map marks for other players (#1113)`.

## Task 2: draw them (index.html)

- [ ] Import, next to line 1078 (`busmarks.js`): `import { netMapMarks, netMarkLabel } from './netmarks.js';   // #1113`
- [ ] Add right after the closing brace of `drawPostautoMarks`:

```js
// #1113: the other players, one arrow per visible remote car in its paint colour; the name on the full map only
const netPaintHex = (id) => (PAINTS.find(p => p.id === id) ?? PAINTS[0]).hex;
function netMapMarkList() {
  if (!NET.session) return [];
  const now = hostNow();
  return netMapMarks(NETCARS, e => sampleRemote(e.track, now), netPaintHex, FLAG.visible);
}
function drawNetMarks(v) {
  for (const m of netMapMarkList()) {
    const [x, y] = mapPt(v, m.x, m.z); if (!onCanvas(x, y, mapC.width, mapC.height)) continue;
    mg.save(); mg.translate(x, y); mg.rotate(m.th); mg.beginPath(); mg.moveTo(10, 0); mg.lineTo(-7, 6); mg.lineTo(-4, 0); mg.lineTo(-7, -6); mg.closePath();
    mg.fillStyle = m.color; mg.fill(); mg.lineWidth = 2; mg.strokeStyle = '#f5efe0'; mg.stroke(); mg.restore();
    const label = netMarkLabel(m, MAP.full); if (!label) continue;
    mg.font = '800 12px "Barlow Condensed", sans-serif'; mg.textAlign = 'center'; mg.lineWidth = 3; mg.strokeStyle = '#1c1f26'; mg.strokeText(label, x, y - 10); mg.fillStyle = '#f5efe0'; mg.fillText(label, x, y - 10); mg.textAlign = 'left';
  }
}
```

- [ ] In `drawMap`, change the single fragment `drawPostautoMarks(v); const [px, py] = mapPt(v, P.x, P.z);` to `drawPostautoMarks(v); drawNetMarks(v); const [px, py] = mapPt(v, P.x, P.z);` (Edit on exactly that fragment; do not reformat the line). The own marker is drawn after, so it stays on top.
- [ ] Add after the `window.__mm.mapBuses` line: `window.__mm.mapNetCars = () => { const v = mapView(); return { full: MAP.full, marks: netMapMarkList().map(m => { const [px, py] = mapPt(v, m.x, m.z); return { id: m.id, px, py, th: m.th, color: m.color, label: netMarkLabel(m, MAP.full) }; }) }; };   // #1113: read-only, for the test`

## Task 3: changelog and check

- [ ] `CHANGELOG.md`, under `[Unreleased]` / `### Added`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`, German like the neighbouring entries: `- \`<ts>\` Im Mehrspieler siehst Du alle **Mitspieler** auf der Karte: ein Pfeil in der Farbe ihres Autos auf der **Minikarte** und der grossen Karte (<kbd>Tab</kbd>), dort zusätzlich mit Namen.`
- [ ] Run `node --test tests/*.test.mjs` (all pass). No Playwright; the interactive check is for the reviewer: two players, Tab held, arrow plus name; minimap arrow without name.
- [ ] Commit `feat(multiplayer): show all players on the minimap and the Tab map (#1113)`.
