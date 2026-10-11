# Minimap Gemeinde labels Implementation Plan

**Goal:** every Gemeinde (Münchwilen included) is named on the minimap.
**Spec:** `docs/superpowers/specs/2026-10-11-minimap-gemeinde-labels-design.md`
**Local-only:** no. No world rebuild: names come from `VILLAGES`, four new constants are added.
**Tests:** `node --test prototype/tests/*.test.mjs` plus ONE Playwright file, `python -m pytest prototype/tests/test_minimap_labels.py`. Never run the full ~2 h suite.
**Note:** #226 edits the same `mapStatic` painter line (motorway ref). Dispatch one after the other, or expect a trivial rebase.

### Task 1: place-node centres for the four missing Gemeinden (data probe)

**Files:** `prototype/world.js` (`VILLAGES`), `prototype/tests/world.test.mjs`

- [ ] Look up the OSM place nodes (`place=village` or `town`) of Gipf-Oberfrick, Kaisten, Wegenstetten and Zuzgen (Overpass `node["place"~"village|town"]["name"="Zuzgen"]` within the world bbox 7.905,47.5,8.03,47.572 widened to the south extension; or the `hochrhein.osm.pbf` if present). Convert each with `geo.Frame(*DEFAULT_ORIGIN).to_game` (needs `pip install -r pipeline/requirements.txt`).
- [ ] Rough expected positions (from the boundary lines, for a sanity check): Zuzgen about (-3900, 2500), Kaisten about (3500, 1300), Gipf-Oberfrick about (1200, 5300), Wegenstetten about (-2000, 5200). A converted centre more than 1.5 km from these is wrong.
- [ ] Write the failing test: every Gemeinde name in `world_hochrhein.json` `boundaries[].names` has a `VILLAGES` entry:

```js
test('VILLAGES covers every Gemeinde that has a boundary line', () => {
  const world = JSON.parse(readFileSync(new URL('../../data/world_hochrhein.json', import.meta.url), 'utf8'));
  const names = new Set(world.boundaries.flatMap(b => b.names.map(n => n.toUpperCase())));
  const have = new Set(VILLAGES.map(v => v.t));
  assert.deepEqual([...names].filter(n => !have.has(n)), []);
});
```

  (add `readFileSync` from `node:fs` and `VILLAGES` to the file's imports if absent). Red: lists the four.
- [ ] Append the four entries to `VILLAGES` with `r: 450` and the node id in the trailing comment, as the #47 lines do. Green. Commit `feat(world): villages for Gipf-Oberfrick, Kaisten, Wegenstetten, Zuzgen (#228)`.

### Task 2: `minimapNames` in world.js (TDD)

**Files:** `prototype/world.js`, `prototype/tests/world.test.mjs`

- [ ] Failing test:

```js
test('minimapNames: all villages, anchor labels only when not a village name', () => {
  const villages = [{ t: 'STEIN', x: 1, z: 2, r: 450 }, { t: 'MÜNCHWILEN', x: 3, z: 4, r: 350 }];
  const anchors = [{ t: 'STEIN', x: 9, z: 9 }, { t: 'RHEIN', x: 5, z: 6 }];
  assert.deepEqual(minimapNames(villages, anchors), [
    { t: 'STEIN', x: 1, z: 2 }, { t: 'MÜNCHWILEN', x: 3, z: 4 }, { t: 'RHEIN', x: 5, z: 6 },
  ]);
});
```

- [ ] Implement beside `villageLabels`:

```js
// #228: the minimap names every village at its place node; a hand-placed anchor label stays only if it is not a village (RHEIN, HOLZBRÜCKE)
export function minimapNames(villages, anchorLabels) {
  const own = new Set(villages.map(v => v.t));
  return [...villages.map(({ t, x, z }) => ({ t, x, z })), ...anchorLabels.filter(l => !own.has(l.t)).map(({ t, x, z }) => ({ t, x, z }))];
}
```

- [ ] Green. Commit `feat(minimap): pure minimapNames (#228)`.

### Task 3: draw it, hook, Playwright, CHANGELOG

**Files:** `prototype/index.html`, `prototype/tests/test_minimap_labels.py` (new), `CHANGELOG.md`

- [ ] `index.html`: add `minimapNames` to the `./world.js` import (anchor: `import { makeGrid, gridAdd, ...`). In the `mapStatic` block replace `for (const lb of L.anchors.labels) g.fillText(...)` by a loop over `MAP_NAMES`, declared at module level just before it: `const MAP_NAMES = L ? minimapNames(REGION.villages, L.anchors.labels) : [];`. Hand-layout `else` branch untouched.
- [ ] Hook beside `window.__mm.mapPixel`: `window.__mm.minimapNames = () => MAP_NAMES.map(l => ({ ...l }));`
- [ ] New `test_minimap_labels.py`, modelled on `open_page` in `test_boundaries.py` (real world, `.mmh` blocked, wait for `__mm.hud`): assert `__mm.minimapNames()` contains `MÜNCHWILEN`, `EIKEN` and `ZUZGEN`; each text appears once (no doubled SISSELN); `RHEIN` and `HOLZBRÜCKE` are still there; every name lies inside the map extent (`__mm.worldToMap` inside 0..800 / 0..400). Hand layout (world 404): `minimapNames()` is `[]`.
- [ ] Run only that file, foreground, `timeout=600000`, never `run_in_background`.
- [ ] CHANGELOG `### Added`, timestamped: `` `2026-10-11 HH:MM` The minimap names every village now: Münchwilen, Mumpf, Murg, Wallbach, Eiken, Obermumpf, Oeschgen, Hellikon, Frick and the rest sit where the village is, not just Bad Säckingen, Stein and Sisseln. Zuzgen, Kaisten, Wegenstetten and Gipf-Oberfrick are new on the map and in the sky. ``
- [ ] `node --test prototype/tests/*.test.mjs`. Commit `feat(minimap): label every Gemeinde (#228)`. Closes #228.
