# Debug panel: car dimensions and map size — implementation plan

Spec: `docs/superpowers/specs/2026-10-08-debug-car-and-map-size-design.md` · Issue #124.

**Goal:** two new F3 panel lines, `size L × W × H m` and `map W × D km · A km²`.

**Constraints (CLAUDE.md, browser-game stack):** buildless vanilla JS, no new dependency, surgical edits, TDD, `const`/`let`, pure helpers in `prototype/debug.js`. Unit tests: `node --test prototype/tests/*.test.mjs`. Playwright (`pytest`) runs in the **foreground**, only the affected file, under a cap: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_debug.py -k "size or world_map" -x`. Commit and push the branch before starting browser verification.

## Task 1 — pure formatters (TDD)

**Files:** `prototype/debug.js`, `prototype/tests/debug.test.mjs`.

- [ ] **Step 1 — write the failing test.** Add `sizeLine, mapLines` to the import list and append:

```js
test('sizeLine: length x width x height in metres, two decimals', () => {
  assert.equal(sizeLine({ l: 4.66, w: 2.18, h: 1.55 }), 'size 4.66 × 2.18 × 1.55 m');
  assert.equal(sizeLine({ l: 4.6612, w: 2.1849, h: 1.5 }), 'size 4.66 × 2.18 × 1.50 m');
});

test('mapLines: extent in km and the area in km2 from the metre values', () => {
  assert.deepEqual(mapLines(9440, 4392), ['map 9.44 × 4.39 km · 41.5 km²']);
  assert.deepEqual(mapLines(6400, 3800), ['map 6.40 × 3.80 km · 24.3 km²']);
});
```

- [ ] **Step 2 — run, expect failure:** `node --test prototype/tests/debug.test.mjs` (the import of `sizeLine` / `mapLines` fails).
- [ ] **Step 3 — implement** in `prototype/debug.js`, next to `buildingLines`:

```js
// #124: car body box (metres) and the drawn map extent (metres in, km / km2 out)
export function sizeLine(s) { return `size ${s.l.toFixed(2)} × ${s.w.toFixed(2)} × ${s.h.toFixed(2)} m`; }
export function mapLines(widthM, depthM) {
  const km = m => (m / 1000).toFixed(2);
  return [`map ${km(widthM)} × ${km(depthM)} km · ${(widthM * depthM / 1e6).toFixed(1)} km²`];
}
```

- [ ] **Step 4 — run the full node suite:** `node --test prototype/tests/*.test.mjs`, all green.
- [ ] **Step 5 — commit:** `feat(debug): format car size and map extent lines (#124)`.

## Task 2 — wire the sections into the panel

**Files:** `prototype/index.html`.

- [ ] **Step 1 — import** `sizeLine, mapLines` where the other `debug.js` names are imported (find with `grep -n "buildingLines" prototype/index.html`).
- [ ] **Step 2 — name the existing measurement.** Turn `window.__mm.carSize = () => { … };` (`index.html:1278`) into `function carSize() { …same body… }` followed by `window.__mm.carSize = carSize;`, keeping the `// #69` comment. The body is unchanged and restores `car.rotation`, so calling it from a section is safe.
- [ ] **Step 3 — add the sections** right after `debugSection(() => buildingLines(DEBUG_H.shown[0]));`:

```js
debugSection(() => [sizeLine(carSize())]);                       // #124
debugSection(() => mapLines(TGRID.GW, TGRID.GD));
```

- [ ] **Step 4 — manual check:** `python3 -m http.server 8000`, open `/prototype/index.html?debug`: both lines under the building line, no console errors.
- [ ] **Step 5 — commit:** `feat(debug): show car dimensions and map size in the F3 panel (#124)`.

## Task 3 — Playwright test

**Files:** `prototype/tests/test_debug.py`.

- [ ] **Step 1 — write the tests** (hand layout via `block_world=True`; world layout marked `@needs_world`), reusing `open_page`:

```python
def panel_lines(page):
    page.keyboard.press("F3")
    page.wait_for_function("() => window.__mm.debug().lines.length > 0", timeout=60000)
    return page.evaluate("() => window.__mm.debug().lines")


def test_panel_shows_car_size_and_hand_layout_map(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        lines = panel_lines(page)
        size = page.evaluate("() => window.__mm.carSize()")
        text = page.evaluate("() => window.__mm.debug().copy")
        br.close()
    got = next(l for l in lines if l.startswith("size "))
    l, w, h = (float(v) for v in got[5:-2].split(" × "))
    assert (l, w, h) == (pytest.approx(size["l"], abs=0.02), pytest.approx(size["w"], abs=0.02), pytest.approx(size["h"], abs=0.02)), got
    assert "map 6.40 × 3.80 km · 24.3 km²" in lines, lines
    assert "size " in text and "map " in text


@needs_world
def test_panel_shows_world_map_extent(server):
    with sync_playwright() as p:
        br, page = open_page(p, server)
        lines = panel_lines(page)
        br.close()
    assert "map 9.44 × 4.39 km · 41.5 km²" in lines, lines
```

- [ ] **Step 2 — run foreground, capped** (command in the constraints above). Expected: pass.
- [ ] **Step 3 — run the whole `test_debug.py` once** (capped, foreground) to prove the existing tests are untouched.
- [ ] **Step 4 — commit:** `test(debug): car size and map extent lines (#124)`.

## Task 4 — changelog

**Files:** `CHANGELOG.md`.

- [ ] Under `## [Unreleased]` → `### Added`, append in the file's player voice: „Das Debug-Panel (**F3**) zeigt jetzt die Abmessungen des Autos (Länge × Breite × Höhe in Metern) und die Grösse der Karte (Länge × Breite in km, Fläche in km²).“
- [ ] Commit: `docs(changelog): debug panel shows car and map size (#124)`.

## Done when

`node --test prototype/tests/*.test.mjs` is green, the two new Playwright tests pass, the existing `test_debug.py` tests still pass, the page loads with an empty console, and the PR body says `Closes #124`.
