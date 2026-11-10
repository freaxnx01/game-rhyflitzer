# The churches of Stein as swissBUILDINGS3D landmarks (#715): implementation plan

**Goal:** both churches of Stein (`kirche-bruder-klaus-stein`, `reformierte-kirche-stein`, exported in PR#714) load through the
#649 landmark loader, collide, are listed in J, and the misplaced placeholder "Kirche Stein" is gone.

**Spec:** [docs/superpowers/specs/2026-11-07-kirchen-stein-landmarks-design.md](../specs/2026-11-07-kirchen-stein-landmarks-design.md)

**Global constraints:**
- Buildless, no new dependency. `chlandmarks.js` and `landmarks.js` stay pure.
- Do not touch `assets/landmarks/`, `landmarks.yaml`, `landmarks.lock.json` or `data/world_hochrhein.json`.
- Tests: `node --test tests/` and Playwright **only** `tests/test_ch_landmarks.py` and `tests/test_jump.py` (foreground, generous
  timeout). Not the whole Playwright suite.
- Commit and push after each task.
- CHANGELOG under `[Unreleased]`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`.

### Task 1: REPLACES and the collider rectangle in chlandmarks.js

**Files:** `chlandmarks.js`, `tests/chlandmarks.test.mjs`

- [ ] **Write the failing tests** (append; extend `INDEX` in a local copy, do not change the existing tests):

```js
const INDEX3 = { origin: LM, landmarks: { ...INDEX.landmarks,
  'kirche-bruder-klaus-stein': { file: 'kirche-bruder-klaus-stein.glb', bounds: { min: [-1441.34, 14.68, 883.74], max: [-1399.91, 36.46, 929.24] } },
  'reformierte-kirche-stein': { file: 'reformierte-kirche-stein.glb', bounds: { min: [-1410.64, 15.63, 990.39], max: [-1376.15, 35.46, 1022.79] } } } };

test('REPLACES_ChurchesOfStein_BruderKlausReplacesItsBox_ReformedHasItsOwnRect', () => {
  assert.deepEqual(REPLACES['kirche-bruder-klaus-stein'], { osm: 407386050, region: 'hochrhein' });
  assert.deepEqual(REPLACES['reformierte-kirche-stein'], { osm: null, region: 'hochrhein', rect: [-1177.97, 795.86, 34.75, 26.71, -2.7343] });
});

test('chLandmarksFor_hochrhein_placesAllThree_andPassesTheRectThrough', () => {
  const placed = chLandmarksFor(INDEX3, 'hochrhein', WORLD, 284);
  assert.deepEqual(placed.map(c => c.id), ['fridolinskapelle-sisseln', 'kirche-bruder-klaus-stein', 'reformierte-kirche-stein']);
  const ref = placed.find(c => c.id === 'reformierte-kirche-stein');
  assert.equal(ref.osm, null);
  assert.deepEqual(ref.rect, [-1177.97, 795.86, 34.75, 26.71, -2.7343]);
  assert.ok(Math.abs(ref.top - (35.46 - 4)) < 1e-9, ref.top);
  assert.equal('rect' in placed.find(c => c.id === 'kirche-bruder-klaus-stein'), false);
});
```

- [ ] `node --test tests/chlandmarks.test.mjs`: the new tests fail.
- [ ] **Implement** in `chlandmarks.js`:

```js
export const REPLACES = {
  'fridolinskapelle-sisseln': { osm: 171822707, region: 'hochrhein' },   // building=chapel, Schulhausstrasse 6.1, Sisseln
  'kirche-bruder-klaus-stein': { osm: 407386050, region: 'hochrhein' },  // #715: Kath. Kirche Hl. Bruder Klaus, Schulstrasse 5, Stein
  // #715: Reformierte Kirche, Gartenstrasse 9, Stein (w88836292): not in the world file (#716), so no box to replace; rect = its
  // collider, the OSM footprint through pipeline world_buildings.roof() (world frame [cx, cz, w, d, rot])
  'reformierte-kirche-stein': { osm: null, region: 'hochrhein', rect: [-1177.97, 795.86, 34.75, 26.71, -2.7343] },
};
```

  and in `chLandmarksFor` return
  `[{ id, file: lm.file, offset, top: lm.bounds.max[1] + offset.y, osm: r.osm, ...(r.rect ? { rect: r.rect } : {}) }]`.
- [ ] Run: passes. `node --test tests/`: all green. Commit `feat(landmarks): the churches of Stein in REPLACES (#715)`, push.

### Task 2: the J list

**Files:** `landmarks.js`, `tests/landmarks.test.mjs`, `tests/test_jump.py`

- [ ] **Update the tests first** (the spec replaces one entry with two):
  - `tests/landmarks.test.mjs`, "LANDMARK_INFO holds …": length `33`; in the building list insert
    `['Kirche Bruder Klaus', 'Stein', 407386050]` after `['Aqualon Therme', 'Bad Säckingen', 92039355]`; add
    `assert.deepEqual(LANDMARK_INFO.filter(l => l.gemeinde === 'Stein').map(l => l.name), ['Kirche Bruder Klaus', 'Reformierte Kirche', 'Bahnhof Stein-Säckingen']);`
    and `assert.equal(LANDMARK_INFO.some(l => l.anchor === 'steinChurch'), false);`
  - "#46 entries resolve …": the anchorless entries now include `Kirche Bruder Klaus` (a building, so it needs its square in the
    `buildings` fixture) and `Reformierte Kirche` (an `at`), both Gemeinde Stein, sorted after the Bad Säckingen entries and before
    `Reservoir Hübel`. Adjust the fixture and `expected` to that, nothing else.
  - `tests/test_jump.py::test_arrows_move_the_selection_and_click_jumps`: the Stein list is now Kirche Bruder Klaus, Reformierte
    Kirche, Bahnhof Stein-Säckingen, Random spot. Expected sequence: start `Kirche Bruder Klaus`; Down → `Reformierte Kirche`;
    Down → `Bahnhof Stein-Säckingen`; Down, Down (Random spot, then wrap) → `Kirche Bruder Klaus`; Up → `Random spot`. The click on
    the Bahnhof stays as it is.
- [ ] `node --test tests/landmarks.test.mjs`: fails.
- [ ] **Implement** in `landmarks.js`, replacing the `Kirche Stein` line:

```js
  { name: 'Kirche Bruder Klaus', gemeinde: 'Stein', building: 407386050 },        // #715: Kath. Kirche Hl. Bruder Klaus, Schulstrasse 5 (the swissBUILDINGS3D model stands on this box)
  { name: 'Reformierte Kirche', gemeinde: 'Stein', at: [-1177.97, 795.86] },      // #715: Gartenstrasse 9 (w88836292, not in the world file, #716): its rect centre
```

- [ ] `node --test tests/`: all green. Commit `feat(jump): both churches of Stein in the J list (#715)`, push.

### Task 3: colliders, placeholder out (index.html, anchors.json)

**Files:** `index.html`, `pipeline/anchors.json`, `tests/test_ch_landmarks.py`

- [ ] **Write the failing Playwright tests** in `tests/test_ch_landmarks.py`:
  - `test_flat_osm_box_is_replaced`: `assert sorted(replaced) == [171822707, 407386050]`.
  - New tests (reuse `open_world`, `_inside`, `_ring_dist`, `needs_world`):

```python
CHURCHES = {"kirche-bruder-klaus-stein": (-1201.67, 696.04), "reformierte-kirche-stein": (-1177.97, 795.86)}   # rect centres
REFORMED_RECT = [-1177.97, 795.86, 34.75, 26.71, -2.7343]


@needs_world
def test_churches_of_stein_stand_on_their_footprints(server):
    """#715: both models sit over their OSM footprints (box centre within 6 m of the rect centre: the towers pull the box) and on the terrain."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            page.wait_for_function("() => ['kirche-bruder-klaus-stein', 'reformierte-kirche-stein'].every(id => (window.__mm.counts.chLandmarks?.placed || []).includes(id))", timeout=120000)
            out = {}
            for lm in CHURCHES:
                box = page.evaluate(f"() => window.__mm.landmarkBox('{lm}')")
                cx, cz = (box["min"][0] + box["max"][0]) / 2, (box["min"][2] + box["max"][2]) / 2
                out[lm] = (cx, cz, box, page.evaluate(f"() => window.__mm.ground({cx}, {cz})"))
        finally:
            b.close()
    for lm, (cx, cz, box, ground) in out.items():
        assert math.hypot(cx - CHURCHES[lm][0], cz - CHURCHES[lm][1]) < 6, (lm, cx, cz)
        assert 14 <= box["max"][1] - ground <= 22, (lm, box, ground)   # towers: 17.4 m (Bruder Klaus) and 16.2 m (reformed) measuredHeight
        assert box["min"][1] <= ground + 0.5, (lm, box, ground)


@needs_world
def test_car_stops_at_the_reformed_church(server):
    """#715: the reformed church has no OSM building in the world file; its own rect keeps it solid."""
    cx, cz, w, d, rot = REFORMED_RECT
    c, s = math.cos(rot), math.sin(rot)
    ring = [[cx + c * sx * w / 2 - s * sz * d / 2, cz + s * sx * w / 2 + c * sz * d / 2] for sx, sz in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    start_x, start_z = cx - c * (w / 2 + 8), cz - s * (w / 2 + 8)   # 8 m outside the rect along its long axis, driving at it
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            r = page.evaluate(f"() => window.__mm.sim({start_x}, {start_z}, {rot}, 0, 4)")
        finally:
            b.close()
    assert r["speed"] < 1, r
    assert not _inside(ring, r["x"], r["z"]), r


def test_placeholder_church_is_gone():
    """#715: the hand-made 'Kirche Stein' at (-812.8, 406.4) is not built any more."""
    root = Path(__file__).parents[1]
    assert "steinChurch" not in json.loads((root / "pipeline" / "anchors.json").read_text(encoding="utf-8"))["landmarks"]
    assert "steinChurch" not in (root / "index.html").read_text(encoding="utf-8")
```

  Before relying on `window.__mm.sim(x, z, th, …)`, read its signature in `index.html` (the chapel test calls it as
  `sim(x, z, heading, 0, 4)`); if the heading convention differs, start the car so it drives into the rect.
- [ ] Run `python -m pytest tests/test_ch_landmarks.py` in the foreground: the new and changed tests fail.
- [ ] **Implement:**
  - `index.html`, where `CH_LM_BY_OSM` is filled: `CH_LM_BY_OSM = new Map(CH_LM.filter(c => c.osm != null).map(c => [c.osm, c]));`
  - Right after it (before the house loop), the own colliders:

```js
  // #715: a landmark without an OSM building in the world file (the Reformierte Kirche, #716) is solid as its own rect up to its top
  for (const c of CH_LM) if (c.rect) { const [x, z, w, d, rot] = c.rect; pushOBB({ x, z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot), h: Math.max(terrainH(x, z) + 3, c.top) }); }
```

  - `index.html`: delete the line `if (at('steinChurch')) church(at('steinChurch').x, at('steinChurch').z, at('steinChurch').rot, false);`
    (keep `church()` itself: the Münster still uses it).
  - `pipeline/anchors.json`: delete the `"steinChurch": …` line. Run `cd pipeline && python -m pytest tests/test_anchors.py -q` to
    make sure nothing else expects it.
- [ ] Run `python -m pytest tests/test_ch_landmarks.py tests/test_jump.py` in the foreground: all pass. `node --test tests/`: all pass.
- [ ] CHANGELOG under `[Unreleased]` → `### Changed`:
  ``- `<timestamp>` The **churches of Stein** now stand where they really are, with their real shape and towers (swisstopo 3D buildings): the **Kirche Bruder Klaus** on the Schulstrasse and the **Reformierte Kirche** on the Gartenstrasse. The made-up church on the field by the Münchwilerstrasse is gone; <kbd>J</kbd> → Stein lists both churches.``
- [ ] Commit `feat(landmarks): the churches of Stein in the game, placeholder gone (#715)`, push.
