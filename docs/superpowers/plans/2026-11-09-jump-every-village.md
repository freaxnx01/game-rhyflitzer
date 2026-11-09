# Every village and its station in the J list, CH and DE apart (#782) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** J reaches every village of the Hochrhein world and its station, with the Gemeinde chips split into a `CH` and a `DE` row.

**Architecture:** data and one pure helper (`chipRows`) in `landmarks.js`, the German list wired per region in `regions.js`,
and `index.html` `renderJump` drawing the chips in country rows and the country after each row's Gemeinde.

**Tech Stack:** vanilla ES modules, `node --test`, Playwright (pytest).

**Spec:** `docs/superpowers/specs/2026-11-09-jump-every-village-design.md`

## Global Constraints

- Buildless: no `package.json`, no new dependency, no framework.
- Node tests: `node --test tests/*.test.mjs` (the glob). Playwright **only** `tests/test_jump.py`, in the foreground, never
  `run_in_background`, generous timeout. Commit and push before running it.
- Coordinates and ids exactly as in the spec tables; do not re-measure or round.
- `CH` / `DE` labels are not translated.
- The drive (O) and navi (I) modes and the Ehrendingen / generated regions look exactly as today.
- CHANGELOG under `[Unreleased]`, timestamp `TZ=Europe/Zurich date '+%F %H:%M'`, 1–3 bold keywords, for the player.

## Review Focus

- A world that lacks one of the new buildings (e.g. an older world file): the entry is skipped by `landmarkEntries` as today,
  and a Gemeinde left with no entry gets no chip (covered: `chipRows` takes the *present* Gemeinden from `gemeindenOf`).
- The Enterable chip on: rows still carry `· CH` / `· DE`, and the Gemeinde chips still compose with it (Task 2 test).
- Search by village name ("frick") finds both Frick entries (Task 1 test).
- Phone width: the CH row wraps inside its row and never pushes the DE label onto the CH line (Task 2: each country row is its
  own block).
- `window.__mm.jumpList()` keeps `g` as the bare Gemeinde name; only the visible label gets the country (Task 2 test).

---

### Task 1: data, `chipRows`, region wiring

**Files:**
- Modify: `landmarks.js` (`GEMEINDEN`, new `GEMEINDEN_DE`, `LANDMARK_INFO`, new `chipRows`)
- Modify: `regions.js` (`gemeindenDe` on every region, including the generated one at ~line 47)
- Test: `tests/landmarks.test.mjs`, `tests/regions.test.mjs`

**Interfaces:**
- Produces: `export const GEMEINDEN_DE: string[]`;
  `export function chipRows(present: string[], de: string[]): { country: 'CH' | 'DE' | null, gemeinden: string[] }[]`;
  `REGION.gemeindenDe: string[]` (Hochrhein `GEMEINDEN_DE`, all others `[]`).

- [ ] **Step 1: Write the failing tests** (`tests/landmarks.test.mjs`; import `GEMEINDEN_DE`, `chipRows`)

  - Update the existing "LANDMARK_INFO holds …" test: `LANDMARK_INFO.length` `45`; the `GEMEINDEN` assertion becomes
    `['Wallbach', 'Zuzgen', 'Mumpf', 'Hellikon', 'Obermumpf', 'Bad Säckingen', 'Stein', 'Münchwilen', 'Schupfart', 'Eiken', 'Sisseln', 'Oeschgen', 'Frick', 'Murg']`;
    the `building` list gains `['Bahnhof Mumpf', 'Mumpf', 1556606688]` (before Bad Säckingen's) and
    `['Bahnhof Frick', 'Frick', 164951714]` (last). Nothing else in that test changes.

```js
test('#782: every village has its entries, west to east, stations included', () => {
  const by = g => LANDMARK_INFO.filter(l => l.gemeinde === g).map(l => [l.name, l.at || l.building]);
  assert.deepEqual(by('Wallbach'), [['Dorfzentrum Wallbach', [-3984.9, -1744.8]]]);
  assert.deepEqual(by('Zuzgen'), [['Lohnberg', [-3721.1, 2697.5]]]);
  assert.deepEqual(by('Mumpf'), [['Dorfzentrum Mumpf', [-3484.8, 596.6]], ['Bahnhof Mumpf', 1556606688]]);
  assert.deepEqual(by('Hellikon'), [['Dorfzentrum Hellikon', [-3142.8, 4582.5]]]);
  assert.deepEqual(by('Obermumpf'), [['Dorfzentrum Obermumpf', [-2160.9, 2378.8]]]);
  assert.deepEqual(by('Oeschgen'), [['Dorfzentrum Oeschgen', [3788.1, 3471.3]]]);
  assert.deepEqual(by('Frick'), [['Dorfzentrum Frick', [4040.6, 4762.8]], ['Bahnhof Frick', 164951714]]);
  assert.deepEqual(by('Murg'), [['Dorfzentrum Murg', [4361.6, -689.8]], ['Bahnhof Murg (Baden)', [3877.0, -347.8]], ['Rothaus', [2581.9, -838.3]]]);
  for (const g of GEMEINDEN) assert.ok(LANDMARK_INFO.some(l => l.gemeinde === g), `${g} has an entry`);
});

test('#782: every building id in LANDMARK_INFO exists in the Hochrhein world file', () => {
  const ids = new Set(JSON.parse(readFileSync(new URL('../data/world_hochrhein.json', import.meta.url), 'utf8')).buildings.map(b => b.id));
  for (const l of LANDMARK_INFO.filter(l => l.building)) assert.ok(ids.has(l.building), `${l.name} w${l.building}`);
});

test('#782: "frick" finds both Frick entries', () => {
  const e = landmarkEntries(LANDMARK_INFO, {}, [{ id: 164951714, ring: [[3490, 4780], [3510, 4780], [3510, 4790]] }]);
  assert.deepEqual(filterLandmarks(e, 'frick', null).map(r => r.n), ['Dorfzentrum Frick', 'Bahnhof Frick']);
});

test('#782: GEMEINDEN_DE are the German Gemeinden, all in GEMEINDEN', () => {
  assert.deepEqual(GEMEINDEN_DE, ['Wallbach', 'Bad Säckingen', 'Murg']);
  for (const g of GEMEINDEN_DE) assert.ok(GEMEINDEN.includes(g), g);
});

test('chipRows_TwoCountries_SplitsKeepingOrderAndDropsEmptyRows', () => {
  assert.deepEqual(chipRows(['Wallbach', 'Mumpf', 'Bad Säckingen', 'Stein', 'Murg'], GEMEINDEN_DE),
    [{ country: 'CH', gemeinden: ['Mumpf', 'Stein'] }, { country: 'DE', gemeinden: ['Wallbach', 'Bad Säckingen', 'Murg'] }]);
  assert.deepEqual(chipRows(['Stein', 'Eiken'], GEMEINDEN_DE), [{ country: 'CH', gemeinden: ['Stein', 'Eiken'] }]);
  assert.deepEqual(chipRows([], GEMEINDEN_DE), []);
});

test('chipRows_NoGermanList_OneUnlabelledRow', () => {
  assert.deepEqual(chipRows(['Ehrendingen'], []), [{ country: null, gemeinden: ['Ehrendingen'] }]);
});
```

  Import `readFileSync` from `node:fs` if the file does not already. The existing test "#47: Flugplatz Schupfart sits in its
  own Gemeinde" (~line 288) builds entries without buildings, so the new `at` entries now appear in it: its expected
  `gemeindenOf` becomes
  `['Wallbach', 'Zuzgen', 'Mumpf', 'Hellikon', 'Obermumpf', 'Bad Säckingen', 'Stein', 'Münchwilen', 'Schupfart', 'Eiken', 'Oeschgen', 'Frick', 'Murg']`
  (Sisseln has only anchor/building entries). Change nothing else in it.

  `tests/regions.test.mjs`: assert `REGIONS.hochrhein.gemeindenDe === GEMEINDEN_DE`, `REGIONS.ehrendingen.gemeindenDe` deep-equals
  `[]`, and the generated region object deep-equals `[]` for `gemeindenDe` (use the same helper the existing generated-region
  test uses).

- [ ] **Step 2: Run, expect failures**

  Run: `node --test tests/landmarks.test.mjs tests/regions.test.mjs`
  Expected: FAIL (`GEMEINDEN_DE` / `chipRows` not exported, length 33 ≠ 45).

- [ ] **Step 3: Implement**

  - `landmarks.js`: `GEMEINDEN` and `GEMEINDEN_DE` exactly as in the test; the 12 entries from the spec table appended inside
    their Gemeinde's position in `LANDMARK_INFO` (order inside the array does not affect sorting across Gemeinden, but keep the
    file grouped west → east like today). One short comment per new block: `// #782: village centre = OSM place node, J snaps to the nearest road`.
  - `chipRows(present, de)`: if `de` is empty → `present.length ? [{ country: null, gemeinden: present }] : []`; else the CH row
    (`present` not in `de`) then the DE row (`present` in `de`), each kept only when non-empty.
  - `regions.js`: import `GEMEINDEN_DE`; Hochrhein `gemeindenDe: GEMEINDEN_DE`, Ehrendingen and the generated region
    `gemeindenDe: []`.

- [ ] **Step 4: Run, expect pass**

  Run: `node --test tests/*.test.mjs`
  Expected: all pass.

- [ ] **Step 5: Commit and push**

```bash
git add landmarks.js regions.js tests/landmarks.test.mjs tests/regions.test.mjs
git commit -m "feat(jump): every village and its station in the J list data (#782)"
git push
```

### Task 2: J dialog in CH / DE rows

**Files:**
- Modify: `index.html` (`renderJump` ~line 5540, the `#jump .chips` CSS ~line 88, the `landmarks.js` import ~line 759)
- Modify: `CHANGELOG.md`
- Test: `tests/test_jump.py`

**Interfaces:**
- Consumes: `chipRows(present, de)`, `REGION.gemeindenDe` (Task 1).

- [ ] **Step 1: Update and write the failing Playwright tests** (`tests/test_jump.py`)

  - `CHIPS` (~line 35) becomes the J button texts in DOM order (the `CH` / `DE` labels are `<b>`, not buttons):
    `["All", "Enterable", "Zuzgen", "Mumpf", "Hellikon", "Obermumpf", "Stein", "Münchwilen"] + (["Schupfart"] if WORLD47 else []) + ["Eiken", "Sisseln", "Oeschgen", "Frick", "Wallbach", "Bad Säckingen", "Murg"]`.
    The assertion at ~line 97 becomes `assert chips == CHIPS` with the comment
    `# #782: Enterable moved up beside All; then the CH row, then the DE row`. Any other test that builds on `CHIPS`
    positionally is adjusted the same way.
  - `ALL_ROWS` (~line 38) gets `+ 12` with the comment `# #782: 10 village/halt points + Bahnhof Frick + Bahnhof Mumpf`.
  - New test:

```python
@needs_world
def test_chips_in_ch_and_de_rows_and_frick_station_is_reachable(server):
    """#782: the Gemeinde chips sit in a CH row and a DE row; each row label shows the country; J reaches the Bahnhof Frick."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        try:
            page.keyboard.press("KeyJ")
            labels = page.eval_on_selector_all("#jumpchips .crow", "rs => rs.map(r => [r.dataset.country, [...r.querySelectorAll('button')].map(b => b.dataset.g)])")
            assert [c for c, _ in labels] == ["CH", "DE"]
            assert labels[1][1] == ["Wallbach", "Bad Säckingen", "Murg"]
            page.click('#jumpchips button[data-g="Frick"]')
            assert rows(page)[:2] == [{"n": "Dorfzentrum Frick", "g": "Frick"}, {"n": "Bahnhof Frick", "g": "Frick"}]   # g stays bare
            assert page.text_content("#jumplist li:nth-child(2) span") == "Frick · CH"
            page.click("#jumpchips button[data-enterable]")
            spans = page.eval_on_selector_all("#jumplist li span", "ss => ss.map(s => s.textContent)")
            page.click("#jumpchips button[data-enterable]")
            page.click('#jumpchips button[data-g="All"]')
            jump_via_dialog(page, "bahnhof frick")
            c = car(page)
        finally:
            b.close()
    assert all(s.endswith((" · CH", " · DE")) for s in spans if s), spans
    bx, bz = building_mean(164951714)
    assert math.hypot(c["x"] - bx, c["z"] - bz) < 60, c
```

  Use the module's existing helpers (`open_page`, `rows`, `car`, `building_mean`, `jump_via_dialog`); if `car` returns other
  key names, adapt the two lookups, nothing else. Other existing tests stay as they are unless they assert the chip list or
  `ALL_ROWS`.

- [ ] **Step 2: Commit and push the tests, then run them in the foreground, expect failures**

  Run: `python3 -m pytest tests/test_jump.py -x -q` (foreground, timeout ≥ 600 s)
  Expected: FAIL on the chip order / missing `.crow`.

- [ ] **Step 3: Implement in `index.html`**

  - Import `chipRows` with the other `landmarks.js` names.
  - In `renderJump`, J mode only (`!drive`): chips = the `All` button, the `Enterable` button, then for each
    `chipRows(gemeindenOf(JUMP_ENTRIES, REGION.gemeinden), REGION.gemeindenDe)` row a
    `<div class="crow" data-country="CH|DE">` (no `data-country` and no label when `country` is null) holding
    `<b>CH</b>` / `<b>DE</b>` and that row's Gemeinde buttons (same `data-g` / `on` markup as today). Drive/navi keep today's
    single `placeChips` markup unchanged.
  - List rows: when `REGION.gemeindenDe.length` and `r.g` is in `REGION.gemeinden` and the row is not `soon` / `street`, the
    span shows `esc(r.g) + ' · ' + (REGION.gemeindenDe.includes(r.g) ? 'DE' : 'CH')`. `window.__mm.jumpList` is unchanged.
  - CSS next to `#jump .chips`: `#jump .chips .crow{display:flex;flex-wrap:wrap;gap:6px;flex-basis:100%;align-items:center}#jump .chips .crow b{width:2.2em;color:#8b93a3;font-size:12px}`.
    The click handler already uses `closest('button')`, so it needs no change.
  - `CHANGELOG.md`, `[Unreleased]` → `### Added`, newest first:
    ``- `<timestamp>` <kbd>J</kbd> now reaches **every village** in the world, from Wallbach and Mumpf to Frick and Murg, with the **Bahnhof Frick**, Mumpf and Murg; the villages are split into a **CH** and a **DE** row, and each entry says which side of the Rhine it is on.``

- [ ] **Step 4: Run, expect pass**

  Run: `node --test tests/*.test.mjs` then `python3 -m pytest tests/test_jump.py -q` (foreground)
  Expected: all pass.

- [ ] **Step 5: Commit and push**

```bash
git add index.html CHANGELOG.md tests/test_jump.py
git commit -m "feat(jump): Gemeinde chips in a CH and a DE row, country on every entry (#782)"
git push
```
