# PostAuto line 143 Implementation Plan (#767)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` syntax.

**Goal:** Line 143 (Stein-Säckingen – Sisseln Breitenacher – east map edge towards Kaisten/Laufenburg) runs by the weekday timetable next to line 133; stop signs and the Fahrplantafel show the right lines; #763's Umlauf keeps its "no two buses on one terminus stand" guarantee with 143's data.

**Architecture:** Line selection stays data-driven (`anchors.json` `bus.lines`). `pipeline/world_bus.py` gets two rules: drop stops whose node lies beyond the map, and keep one route per line and in-map stop sequence (the lowest relation id, which `timetable.py` already assigns the trips to). The game logic is already line- and cut-aware; two display spots in `index.html` move into pure helpers in `busstop.js`. One condition is added to #763's `linkTrips`. Data is rebuilt by the maintainer locally.

**Tech Stack:** Python 3 pipeline (pyosmium, shapely, pytest in `pipeline/.venv`), vanilla ES modules, `node --test`, Playwright (one targeted file).

**Spec:** `docs/superpowers/specs/2026-11-08-postauto-line-143-design.md`.

## Dependency

**Lands after #763.** Before Task 4, check on `main`: `grep -n "export function linkTrips" postauto.js` and the timetable-wide test from #763 (`grep -rn "NoTwoBusesStandOnTheSameTerminusAtOnce" tests/`). If either is missing, do Tasks 1-3 and 5-6, skip Task 4, and say in the PR body that Task 4 waits for #763. Do not implement the Umlauf yourself. If #763's merged code differs from its plan (names, file of the test), apply Task 4's rule to the merged code.

## Global Constraints

- Buildless, no new dependency, no new asset. `postauto.js` and `busstop.js` stay pure (no DOM, no three.js). `pipeline/timetable.py` is not changed.
- Files: `pipeline/anchors.json`, `pipeline/world_bus.py`, `pipeline/tests/test_bus.py`, `pipeline/tests/test_bus_golden.py`, `docs/11-pipeline-osm.md`, `busstop.js`, `index.html`, `tests/busstop.test.mjs`, `postauto.js` + #763's test file (Task 4 only), `tests/test_postauto.py`, `tests/test_postauto_map.py`, `tests/test_bus_stops.py`, `tests/test_postauto_143.py` (new), `CHANGELOG.md`.
- **Do not touch `data/`.** The data rebuild (Task 7) needs `pipeline/cache/osm/hochrhein.osm.pbf`, the swisstopo/LWB caches and `pipeline/cache/gtfs/gtfs_fp2026_20261104.zip`, which the CI runner does not have; the maintainer runs it locally and pushes the data to the same PR (spec A11).
- Data-dependent assertions branch on "line 143 is in the committed data" so CI is green before and after the data commit (spec A12). Never change any other existing assertion to make it green; the two #763 test changes in Task 4 follow from the spec's rule change (A6, A7) and are named there.
- TDD: failing test first, then the code.
- Tests: pipeline `cd pipeline && ./.venv/bin/python -m pytest -q`; JS `node --test tests/`. Playwright **only** `python3 -m pytest tests/test_postauto_143.py -x`, once, in the foreground with a generous timeout (it skips without 143 data). Never `run_in_background`, not the whole suite.
- Any run against the real extract or GTFS: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`; exit 137 → run on odroid-plus-pve, never raise the cap.
- Commit and push after each task (Conventional Commits, `(#767)` in the subject).

## File Structure

| File | Responsibility |
|---|---|
| `pipeline/world_bus.py` | `_stops` drops stops beyond the map (`stop-outside`); `_unique_variants` keeps one route per line + stop sequence (`duplicate-variant`) |
| `pipeline/anchors.json` | `bus.lines` = `["133", "143"]` |
| `busstop.js` | `stopEnds(i, n, cut)`, `sheetLines(rows)` |
| `index.html` | `buildBusStops` uses `stopEnds`; `busStop` passes `sheetLines(rows)` to `timetableTex(label)` |
| `postauto.js` | (#763's) `linkTrips`: no link across another same-line arrival |
| `tests/test_postauto_143.py` | a 143 bus enters from the east, display / F3 / full-map label show 143 |

### Task 1: Stops beyond the map and one route per in-map variant (`world_bus.py`)

**Files:** `pipeline/world_bus.py`, `pipeline/tests/test_bus.py`

**Interfaces:**
- `_stops(route, data, part, clip, tree, widths, stats)` (new `clip` parameter, passed from `build`).
- `_unique_variants(routes: list[dict], stats: Counter) -> list[dict]`, called at the end of `build`.
- New stats keys: `stop-outside`, `duplicate-variant`.

- [ ] **Write the failing tests** (append to `pipeline/tests/test_bus.py`; `_data`, `ROAD` are the file's helpers):

```python
def test_build_drops_stops_beyond_the_map_edge():
    # #767: Ritanne's stop node lies 10.7 m past the east edge and used to snap onto the clipped line's end
    d = _data([(0, 0), (1000, 0)], [21, 22],
              {21: ((790, 3), {"name": "In", "uic_ref": "8500001"}),
               22: ((810, 3), {"name": "Out", "uic_ref": "8500002"})})
    (r,), stats = wb.build(d, ROAD, shapely.box(-10, -50, 800, 50))
    assert r["cut"] == [False, True]
    assert [s["uic"] for s in r["stops"]] == ["8500001"] and stats["stop-outside"] == 1


def test_build_keeps_one_route_per_line_and_in_map_stops():
    # #767: two OSM variants of 143 per direction are the same line inside the map; the lowest id is kept
    routes = [wb.Route(700, {"ref": "143"}, [1], [21], []), wb.Route(701, {"ref": "143"}, [1], [21], []),
              wb.Route(702, {"ref": "133"}, [1], [21], [])]
    d = wb.BusData(routes=routes, way_nodes={1: [0, 1]},
                   node_xy={0: (0, 0), 1: (1000, 0), 21: (200, 0)},
                   node_tags={21: {"name": "A", "uic_ref": "8500001"}})
    out, stats = wb.build(d, ROAD, shapely.box(-10, -500, 2000, 500))
    assert [r["id"] for r in out] == [700, 702] and stats["duplicate-variant"] == 1
```

- [ ] **Run** `cd pipeline && ./.venv/bin/python -m pytest tests/test_bus.py -q` — Expected: the two new tests FAIL (stop 22 kept at s = 800; route 701 kept).

- [ ] **Implement** in `pipeline/world_bus.py`:

In `_stops`, add the `clip` parameter and, right after the `if uic in seen or node not in data.node_xy: continue` line and before `seen.add(uic)`:

```python
        if not clip.covers(shapely.Point(data.node_xy[node])):   # #767: beyond the map edge (143's Ritanne)
            stats["stop-outside"] += 1
            continue
```

New function above `build`:

```python
def _unique_variants(routes: list[dict], stats: Counter) -> list[dict]:
    """#767: of several relations of one line with the same in-map stops (143 has two per direction, via Kaisten
    village or direct, identical inside the map) only the first is kept - routes come sorted by relation id, and it
    is the one timetable._route_of gives those trips to, so the others would run no bus but draw stops and lines."""
    kept, seen = [], set()
    for route in routes:
        key = (route["line"], tuple(s["uic"] for s in route["stops"]))
        if key in seen:
            stats["duplicate-variant"] += 1
            continue
        seen.add(key)
        kept.append(route)
    return kept
```

In `build`: pass `clip` to `_stops(route, data, part, clip, tree, widths, stats)` and return `_unique_variants(out, stats), stats`. Update the `build` docstring: "… Of several pieces only the longest is kept (#682, A9); of several relations of a line with the same in-map stops only the first (#767)."

- [ ] **Run** `cd pipeline && ./.venv/bin/python -m pytest -q` — Expected: all PASS (the golden tests skip without the extract or still pass on 133).

- [ ] **Commit** `feat(pipeline): drop bus stops beyond the map and duplicate route variants (#767)`, push.

### Task 2: Line 143 in the anchors, golden tests, docs

**Files:** `pipeline/anchors.json`, `pipeline/tests/test_bus_golden.py`, `docs/11-pipeline-osm.md`

- [ ] **Write the failing golden test** (append to `pipeline/tests/test_bus_golden.py`; it skips without the extract, so on the runner it does not fail — locally with the extract it does until the anchors change):

```python
def test_line_143_routes_leave_the_map_east(routes):
    r143 = {i: r for i, r in routes.items() if r["line"] == "143"}
    assert sorted(r143) == [9093371, 11533937]                   # one route per direction (#767 A2)
    out, back = r143[9093371], r143[11533937]
    assert out["cut"] == [False, True] and back["cut"] == [True, False]
    for r in (out, back):
        assert 7000 < r["len"] < 9000 and len(r["stops"]) == 9
        assert "8580562" not in [s["uic"] for s in r["stops"]]  # Ritanne lies beyond the east edge (A3)
    assert out["stops"][0]["uic"] == "8572748" and out["stops"][-1]["uic"] == "8572416"
    assert back["stops"][0]["uic"] == "8572416" and back["stops"][-1]["uic"] == "8572748"
```

Scope the existing `test_line_133_routes` to line 133 (it asserted the *whole* route set, which now holds both lines; the 133 expectations are unchanged):

```python
def test_line_133_routes(routes):
    r133 = {i: r for i, r in routes.items() if r["line"] == "133"}
    assert sorted(r133) == [11533940, 11533941]
    for r in r133.values():
        assert r["cut"] == [False, False] and 7000 < r["len"] < 14000
        assert len(r["stops"]) == 11
    assert routes[11533940]["stops"][0]["uic"] == "8500583" and routes[11533940]["stops"][-1]["uic"] == "8572748"
    assert routes[11533941]["stops"][0]["uic"] == "8572748" and routes[11533941]["stops"][-1]["uic"] == "8500583"
```

In `test_timetable_matches_the_world`, after the 133 block, add the 143 block (present only after the maintainer's rebuild, A12):

```python
    t143 = [x for x in t["trips"] if x["line"] == "143"]
    if t143:   # #767: data rebuilt with line 143 (gtfs_fp2026_20261104.zip, --date 2026-11-10)
        assert len(t143) == 83 and dict(Counter(x["route"] for x in t143)) == {11533937: 42, 9093371: 41}
        assert sum(x["fromOutside"] for x in t143) == 42 and sum(x["toOutside"] for x in t143) == 40
        for x in t143:
            assert all(c[0] in stops[x["route"]] for c in x["calls"])
            times = [v for c in x["calls"] for v in c[1:]]
            assert times == sorted(times)
```

- [ ] **Change** `pipeline/anchors.json:48` to `"bus": { "lines": ["133", "143"] },`.

- [ ] **Run** `cd pipeline && ./.venv/bin/python -m pytest -q` (locally with the extract under the memory cap: `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q`) — Expected: all PASS; on the runner the golden tests skip.

- [ ] **Docs** in `docs/11-pipeline-osm.md`, paragraph "**Bus routes and timetable (#682).**": the anchors example becomes `"bus": { "lines": ["133", "143"] }`; after "(both `false` for 133, …)" add "; line 143 (#767) leaves the map at the east edge towards Kaisten and Laufenburg, so its routes are `[false, true]` and `[true, false]`"; after the sentence on stops without `uic_ref` add: "A stop whose node lies **beyond the map** is dropped and counted (`stop-outside`; 143's Ritanne, 10.7 m past the east edge). Of several relations of one line with **the same in-map stop sequence** only the lowest relation id is kept (`duplicate-variant`): 143 has two relations per direction (via Kaisten village or direct) that are identical inside the map, and the timetable cut gives all their trips to the first one anyway." In the timetable paragraph, after the Neuchâtel sentence add: "The same rule drops the second PostAuto \"143\" in Lauterbrunnen."

- [ ] **Commit** `feat(pipeline): add PostAuto line 143 to the Hochrhein bus lines (#767)`, push.

### Task 3: Stop signs and Fahrplantafel know their lines (`busstop.js`, `index.html`)

**Files:** `busstop.js`, `index.html`, `tests/busstop.test.mjs`

**Interfaces:**
- `stopEnds(i, n, cut) -> boolean`: `i === n - 1 && !(cut && cut[1])`.
- `sheetLines(rows) -> string`: the rows' distinct `line`s, sorted with `localeCompare`, joined by one space.
- `timetableTex(label)` in `index.html` (was `timetableTex()`).

- [ ] **Write the failing tests** (`tests/busstop.test.mjs`; add `stopEnds, sheetLines` to the import from `../busstop.js`):

```js
test('stopEnds_LastStopOfARouteThatEndsInTheMap_EndsThere', () => {
  assert.equal(stopEnds(10, 11, [false, false]), true);
  assert.equal(stopEnds(9, 11, [false, false]), false);
  assert.equal(stopEnds(8, 9, undefined), true);            // no cut flags: ends at its last stop
});
test('stopEnds_LastInMapStopOfARouteThatLeavesTheMap_DoesNotEnd', () => {
  assert.equal(stopEnds(8, 9, [false, true]), false);       // 143 at Breitenacher drives on to Kaisten
  assert.equal(stopEnds(8, 9, [true, false]), true);
});
test('sheetLines_RowsOfTwoLines_EachLineOnceSorted', () => {
  assert.equal(sheetLines([{ line: '143', dest: 'A' }, { line: '133', dest: 'B' }, { line: '143', dest: 'C' }]), '133 143');
  assert.equal(sheetLines([{ line: '133', dest: 'B' }]), '133');
  assert.equal(sheetLines([]), '');
});
```

Update the two world-data tests at the end of the file:
- In `all 20 stop points lay out clear …`: `assert.equal(byKey.size, L.busRoutes.some((r) => r.line === '143') ? 24 : 20);` (rename the test to `world_hochrhein: every stop point lays out clear of every standing bus and every road`).
- In `every stop has at least one row …`: replace `last: i === br.stops.length - 1` by `last: stopEnds(i, br.stops.length, br.cut)`, and append:

```js
  if (L.busRoutes.some((r) => r.line === '143')) {   // #767: after the data rebuild
    for (const { st, calls: c } of calls.values()) if (st.uic === '8572416') assert.deepEqual(stopRows(c), [{ line: '143', dest: 'Laufenburg, Bahnhof' }, { line: '143', dest: 'Stein-Säckingen, Bahnhof' }]);
    for (const { st, calls: c } of calls.values()) if (st.uic === '8572748') assert.deepEqual(stopRows(c), [{ line: '133', dest: 'Frick, Bahnhof' }, { line: '143', dest: 'Laufenburg, Bahnhof' }]);
  }
```

- [ ] **Run** `node --test tests/busstop.test.mjs` — Expected: the three new tests FAIL (not exported); the world-data tests pass on today's data.

- [ ] **Implement** in `busstop.js`, after `stopRows`:

```js
// a route ends at its last stop only when it ends inside the map; a cut route (#767: 143 at Breitenacher) drives on
export const stopEnds = (i, n, cut) => i === n - 1 && !(cut && cut[1]);

// the Fahrplantafel header (#767): the stop's own lines, once each
export const sheetLines = (rows) => [...new Set(rows.map((r) => r.line))].sort((a, b) => a.localeCompare(b)).join(' ');
```

In `index.html`:
- the `busstop.js` import (line ~731): add `stopEnds, sheetLines`.
- `buildBusStops` (line ~5847): `last: i === R.stops.length - 1` → `last: stopEnds(i, R.stops.length, br.cut)`.
- `timetableTex()` (line ~987) → `timetableTex(label)`, and its `g.fillText('133', 8, 14)` → `g.fillText(label, 8, 14)`.
- `busStop` (line ~2054): `timetableTex()` → `timetableTex(sheetLines(rows))`.

- [ ] **Run** `node --test tests/` — Expected: all PASS.

- [ ] **Commit** `fix(postauto): stop signs list a line that leaves the map, timetable sheet shows the stop's lines (#767)`, push.

### Task 4: #763's Umlauf with two lines (only after #763 is merged)

**Files:** `postauto.js`, #763's tests (`tests/postauto.test.mjs` or `tests/postauto-umlauf.test.mjs`, wherever `linkTrips_` and `timetable_NoTwoBusesStandOnTheSameTerminusAtOnce_` live)

- [ ] **Gate:** `grep -n "export function linkTrips" postauto.js`. No hit → skip this task, note it in the PR body ("Task 4 waits for #763").

- [ ] **Write the failing test** (next to #763's `linkTrips_` tests, using its `leg(line, from, to, arr, dep)` helper):

```js
test('linkTrips_AnotherArrivalBeforeTheDeparture_TheLaterBusTakesIt', () => {
  // #767: 143 at Stein-Säckingen, 06:08 and 06:18 arrivals, 06:22 departure -- the 06:08 bus must not wait across the 06:18 one
  const a1 = leg('143', '1', '3', 1000, 800), a2 = leg('143', '1', '3', 1600, 1400), b = leg('143', '3', '1', 2000, 1900);
  const m = linkTrips([a1, a2, b]);
  assert.equal(m.has(tripKey(a1)), false);
  assert.equal(m.get(tripKey(a2)), b);
});
```

and change #763's two-candidate test to the new rule (spec A6; a2 arrives between a1 and b1, so a1 no longer takes b1):

```js
test('linkTrips_TwoCandidates_TheLastArrivalBeforeADepartureTakesIt', () => {
  const a1 = leg('133', '1', '3', 1000, 800), a2 = leg('133', '1', '3', 1100, 900);
  const b1 = leg('133', '3', '1', 1200, 1250), b2 = leg('133', '3', '1', 1400, 1450);
  const m = linkTrips([a1, a2, b1, b2]);
  assert.equal(m.get(tripKey(a2)), b1); assert.equal(m.has(tripKey(a1)), false); assert.equal(m.size, 1);
});
```

- [ ] **Run** `node --test tests/postauto.test.mjs` (or #763's file) — Expected: both FAIL on #763's rule.

- [ ] **Implement** in `linkTrips`: right after the candidate `b` is picked (before `next.set`), skip `a` when another arrival of its line lies in between:

```js
    // #767: a bus does not wait across another arrival of its line at that stop; the later bus takes the departure
    const between = (t) => t !== a && t.line === a.line && !t.toOutside && String(t.calls[t.calls.length - 1][0]) === uic
      && lastArr(t) > lastArr(a) && lastArr(t) < firstDep(b);
    if (trips.some(between)) continue;
```

(keep `if (!b) continue;` before it). Everything else in #763's rule stays.

- [ ] **Adapt #763's timetable-wide test** (spec A7):
  - `standingAtTerminus`: count a standing bus only at a real terminus —
    ```js
    const first = b.k === 0 && !b.trip.fromOutside, last = b.k === b.calls.length - 1 && !b.trip.toOutside;   // #767: 143's Breitenacher is a through stop
    if (b.phase === 'stand' && (first || last)) by.set(b.calls[b.k].uic, (by.get(b.calls[b.k].uic) ?? 0) + 1);
    ```
  - the runs bound: collect `seen` only for line 133 (`if (b.trip.line === '133') seen.add(b.key)`), keep `<= 4`.
  - `synthRoutes`: build each synthetic route from the route's trip **with the most calls** (143's short trips have 7 and 2 calls; a route built from one of them would drop the full trips via `tripCalls`).

- [ ] **Run** `node --test tests/` — Expected: all PASS on today's data (133 only; the 133 links are the same 6). The real check with 143 runs in Task 7.

- [ ] **Commit** `fix(postauto): no Umlauf across another arrival at the terminus, ready for line 143 (#767)`, push.

### Task 5: Playwright tests for two lines

**Files:** `tests/test_postauto.py`, `tests/test_postauto_map.py`, `tests/test_bus_stops.py`, `tests/test_postauto_143.py` (new)

- [ ] **Make the existing files line-agnostic** (they use `trips[0]`, which becomes a 143 trip after the rebuild; spec A13). In each, add after `TT`/`needs_data`: `LINES = {t["line"] for t in json.loads(TT.read_text(encoding="utf-8"))["trips"]} if TT.exists() else set()`.
  - `tests/test_postauto.py:37`: `assert bus["line"] in LINES and bus["led"]["line"] == bus["line"] and bus["led"]["dest"]`; `:57`: `assert bus["led"]["line"] in LINES and bus["led"]["dest"]`.
  - `tests/test_postauto_map.py:38`: `assert all(m["line"] in LINES and m["label"] is None for m in got["marks"])`; `:47`: `marks.every(m => m.label === m.line)`.
  - `tests/test_bus_stops.py`: `assert len(stops) == (24 if "143" in LINES else 20) and all(s["shelter"] for s in stops)`.

- [ ] **Write** `tests/test_postauto_143.py`:

```python
"""#767: a line-143 Postauto drives in from the east map edge and shows its number. Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
TRIPS = json.loads(TT.read_text(encoding="utf-8"))["trips"] if TT.exists() else []
INBOUND = [t for t in TRIPS if t["line"] == "143" and t["fromOutside"] and len(t["calls"]) >= 9]
needs_143 = pytest.mark.skipif(not INBOUND, reason="the committed timetable has no line 143 yet (#767: maintainer rebuild)")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
BREITENACHER = "8572416"


def hhmm(secs):
    secs = int(secs) % 86400
    return f"{secs // 3600:02d}:{secs // 60 % 60:02d}"


@needs_143
def test_line_143_enters_from_the_east_with_its_number(server):
    trip = INBOUND[len(INBOUND) // 2]                       # a midday trip
    key = f'{trip["route"]}:{trip["calls"][0][2]}'           # postauto.js tripKey
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html?patime={hhmm(trip['calls'][0][1] - 180)}")
        page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
        # the load can take minutes of real time: set the fleet clock again once ready (F3 "Setzen", like test_bus_stops.py),
        # 3 min before Breitenacher -- the window opened ~4 min before (2.9 km in from the edge at 12 m/s), the bus is ~750 m in
        page.evaluate("""(t) => {
            const sel = document.getElementById('debugpaspeed'); sel.value = '1'; sel.dispatchEvent(new Event('change'));
            document.getElementById('debugpatime').value = t; document.getElementById('debugpasetgo').click();
        }""", hhmm(trip["calls"][0][1] - 180))
        page.wait_for_function("(k) => window.__mm.postauto().buses.some(x => x.key === k && x.led)", arg=key, timeout=120000)
        bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key)
        assert bus["line"] == "143" and bus["led"] == {"line": "143", "dest": trip["to"]}
        assert bus["phase"] == "drive" and bus["k"] == 0
        stops = [s for s in page.evaluate("() => window.__mm.busStops()") if s["uic"] == BREITENACHER]
        assert stops and bus["x"] > min(s["x"] for s in stops)                  # still east of Breitenacher
        page.keyboard.press("F3")
        page.wait_for_function("() => [...document.querySelectorAll('#debugparows button')].some(r => r.textContent.includes('143 →'))", timeout=120000)
        page.click("#startbtn")   # the start overlay would swallow the Tab hold (#346)
        page.wait_for_function("() => document.getElementById('overlay').hidden")
        page.keyboard.down("Tab")
        page.wait_for_function("(k) => window.__mm.mapBuses().full && window.__mm.mapBuses().marks.some(m => m.key === k && m.label === '143')", arg=key, timeout=30000)
        page.keyboard.up("Tab")
        assert not errors, errors
        b.close()
```

- [ ] **Commit and push first**, then **run** in the foreground: `python3 -m pytest tests/test_postauto_143.py -x` (timeout ≥ 10 min). Expected on today's data: 1 skipped. Do not run the other Playwright files.

- [ ] **Commit** `test(postauto): line-agnostic Postauto browser tests, a line-143 check (#767)` (if anything changed after the run), push.

### Task 6: Changelog

**Files:** `CHANGELOG.md`

- [ ] Under `## [Unreleased]` → `### Added`, at the top, with `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `YYYY-MM-DD HH:MM` **PostAuto line 143** now runs too, about every half hour from early morning until late evening: from **Stein-Säckingen Bahnhof** past Novartis, Syngenta and DSM to **Sisseln Unterdorf** and **Sisseln Breitenacher**, then on towards **Kaisten and Laufenburg** — it leaves the map at the eastern edge and comes back in from there. Unterdorf and Breitenacher get bus stops; the signs at the stops both lines share list **133 and 143**.
```

- [ ] **Commit** `docs(changelog): PostAuto line 143 (#767)`, push.

### Task 7: Rebuild the data (maintainer, local caches)

**Files:** generated `data/world_hochrhein.json`, `data/timetable_hochrhein.json`

The CI runner has no caches: an agent without them skips this task and says so in the PR body (spec A11). Run on the agent box, each step under the cap; exit 137 → that step on odroid-plus-pve.

- [ ] **Step 1: Rebuild the world**

```bash
cd pipeline
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build \
    --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json \
    --fields cache/lwb/hochrhein.geojson --dsm-heights cache
```

Expected: `bus routes 4 {...}` with `duplicate-variant: 2`, `stop-outside` > 0, no `gaps`, no `outside`.

- [ ] **Step 2: Cut the timetable** (same feed and date as #682, so the counts in the tests hold):

```bash
cd pipeline
systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python timetable.py \
    --gtfs cache/gtfs/gtfs_fp2026_20261104.zip --world ../data/world_hochrhein.json \
    --date 2026-11-10 --out ../data/timetable_hochrhein.json
```

Expected: `wrote 97 trips`, no `unmatched`; a logged Friday difference for line 143 (84 trips) is fine.

- [ ] **Step 3: Verify**: `cd pipeline && ./.venv/bin/python -m pytest -q` (golden + data tests, under the cap), `node --test tests/` (busstop world-data tests now expect 24 points and the 143 rows; #763's timetable-wide test runs over both lines), then `python3 -m pytest tests/test_postauto_143.py -x` in the foreground. If a new stop point (Unterdorf, Breitenacher) gets no shelter or #763's check reports a time, report it — do not loosen the test.

- [ ] **Step 4: Commit**

```bash
git add data/world_hochrhein.json data/timetable_hochrhein.json
git commit -m "chore(data): rebuild world and timetable with PostAuto line 143 (#767)"
git push
```

**Verify (acceptance):** golden: 143 = 9093371 `[false, true]` + 11533937 `[true, false]`, 9 stops each, no Ritanne; timetable 83 trips of 143 (42/41) and 14 of 133; 24 stop points, Breitenacher sign shows both 143 directions, Stein-Säckingen shows 133 → Frick and 143 → Laufenburg, Fahrplantafel header "133 143" at shared stops; after #763 no two buses on one terminus stand over the whole timetable; in the game a 143 bus enters from the east with "143" on its display, in the F3 list and on the full map.
