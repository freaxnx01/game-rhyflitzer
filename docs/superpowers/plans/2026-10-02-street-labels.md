# Street Names, House Numbers and Station Signs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the name of the road under the car in the HUD, float OSM house numbers over nearby buildings, and put a blue name board on both railway stations (#12).

**Architecture:** The pipeline keeps OSM address nodes (number only) and gives each world building an optional `addr` (own `addr:housenumber`, else the address nodes inside its footprint); OSM-referenced landmarks get `addr` too (Hallenbad → `2`). The prototype gets three pure helpers in `world.js` (`roadNameAt`, `addrLabels`, `pickLabels`), a HUD line `#roadname`, a pool of 40 camera-facing sprites refilled every 250 ms with the labels within 60 m, and station boards drawn by `stationAt`. The world file is rebuilt last, with measured heights, behind a guard.

**Tech Stack:** Python 3 + pyosmium + shapely (pipeline, pytest); vanilla JS + three.js in one buildless file `prototype/index.html`, pure helpers in `prototype/world.js` (`node --test`); Playwright smoke tests with pytest.

**Spec:** `docs/superpowers/specs/2026-10-02-street-labels-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Run anything heavy (world build, golden tests, Playwright suite) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>`, **in the foreground**, never `run_in_background`. Exit 137 = memory cap hit: stop and report, do not raise the cap. If `systemd-run --user` is unavailable (CI runner), run the same command without the prefix.
- `prototype/index.html`: dense one-line style (long single-line statements, short `//` comments); match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`, no build step.
- New prototype code must **not** call `rr()` or `rnd()` (the seeded RNG drives house colours and trees).
- Privacy: house numbers come from OSM only. `AddrNode` holds `id, number, x, z` — no other tag of an address node is kept. Nothing is typed in by hand. No `street` field.
- Several numbers on one footprint → distinct, natural sort, `first–last` joined with an en dash `–` (U+2013), e.g. `6a–6d`.
- Labels: within **60 m** of the car, at most **40**, refreshed every **250 ms**, one cached `SpriteMaterial` per number. Road name: nearest named road with centre-line distance ≤ `w / 2 + 1`, refreshed every **250 ms**.
- Station names exactly: `Bahnhof Stein-Säckingen`, `Bahnhof Sisseln`.
- Only new file: `prototype/tests/test_street_labels.py`. All existing tests stay unchanged and green.
- Commands: pipeline tests `cd pipeline && ./.venv/bin/python -m pytest -q`; node tests `node --test prototype/tests/*.test.mjs` (from repo root; the glob is needed on Node 24); smoke `cd pipeline && ./.venv/bin/python -m pytest ../prototype/tests/test_street_labels.py -q` (slow, several minutes, foreground).
- Commit after every task with Conventional Commits and explicit paths (`git add <paths>`, never `-A`). Push the branch **before** long verification runs.

## Review Focus

- A footprint containing an address node from a **neighbouring** building's entrance on the shared wall: `contains` excludes nodes exactly on the boundary; an off-by-a-centimetre node inside still counts. Pinned in Task 2 (`test_node_on_the_outline_or_outside_gives_no_addr`).
- A junction where two named roads overlap: the **nearest** centre line wins, not the first in the grid. Pinned in Task 4 (`roadNameAt picks the nearer of two named roads`).
- Switching from a dense quarter to open land: hidden pool sprites must really go invisible, not keep their last position. Pinned in Task 6 (far placement → `labels()` has no `6a–6d`).
- The hand-traced layout (no world file): no labels, no crash, station boards still present. Pinned in Task 7 (`test_hand_layout_signs_and_no_labels`).
- The world rebuild on a machine without the swisstopo caches silently dropping measured heights. Pinned in Task 8 (cache check + diff guard, stop before any commit).

---

## File map

- `pipeline/osm_read.py` (~L50-75 dataclasses, ~L95-100 node branch): `AddrNode`, `OsmData.addr_nodes`.
- `pipeline/world_buildings.py`: `join_numbers`, `house_number`, `build(..., addr_nodes=())` (~L58-97).
- `pipeline/anchors.py` `resolve` (~L50-60): landmark `addr`.
- `pipeline/osm.py` `build_world` (~L87-89): pass `data.addr_nodes`.
- `pipeline/tests/fixtures/mini.osm`, `test_osm_read.py`, `test_buildings.py`, `test_anchors.py`, `test_golden.py`.
- `prototype/world.js` (after `markLines`, end of file): `roadNameAt`, `addrLabels`, `pickLabels`; `prototype/tests/world.test.mjs`.
- `prototype/index.html`: CSS ~L32, markup ~L91, import ~L189, `stationAt` ~L591, groups ~L595, hand stations ~L669, OSM stations ~L699, `scene` ~L719, `HUD` ~L778, hooks ~L816-833, `hud()` ~L898.
- `prototype/tests/test_street_labels.py` (new), `docs/11-pipeline-osm.md`, `CHANGELOG.md`, `data/world_hochrhein.json` (rebuilt, Task 8).

Line numbers are from `main` @ `6d29cb8`; verify with `grep -n` before editing.

---

### Task 1: Keep OSM address nodes (number only)

**Files:**
- Modify: `pipeline/osm_read.py`, `pipeline/tests/fixtures/mini.osm`
- Test: `pipeline/tests/test_osm_read.py`

**Interfaces:**
- Produces: `osm_read.AddrNode(id: int, number: str, x: float, z: float)`; `OsmData.addr_nodes: list[AddrNode]`.

- [ ] **Step 1: Fixture.** In `mini.osm`, after node 43, add an address node inside building way 200 (lat 47.5500–47.5501, lon 7.9660–7.9662) carrying a name that must **not** be kept:

```xml
  <node id="50" lat="47.55005" lon="7.9661"><tag k="addr:housenumber" v="7"/><tag k="addr:street" v="Testweg"/><tag k="name" v="Familie Muster"/></node>
```

- [ ] **Step 2: Failing test** (append to `test_osm_read.py`):

```python
def test_address_nodes_keep_the_number_only(data):
    assert [(n.id, n.number) for n in data.addr_nodes] == [(50, "7")]
    n = data.addr_nodes[0]
    assert set(vars(n)) == {"id", "number", "x", "z"}             # privacy: no name, no street
    assert isinstance(n.x, float) and isinstance(n.z, float)
    assert 50 not in {m.id for m in data.named_nodes} | {m.id for m in data.prop_nodes}
```

- [ ] **Step 3: Run, expect FAIL** (`AttributeError: 'OsmData' object has no attribute 'addr_nodes'`):
`cd pipeline && ./.venv/bin/python -m pytest tests/test_osm_read.py -q`

- [ ] **Step 4: Implement.** In `osm_read.py` add after `PropNode`:

```python
@dataclass
class AddrNode:
    """An OSM address point: only the house number is kept (privacy, #12)."""
    id: int
    number: str
    x: float
    z: float
```

Add `addr_nodes: list = field(default_factory=list)` to `OsmData` (after `prop_nodes`). In `read()`, inside `if o.is_node():` after the prop branch:

```python
            if "addr:housenumber" in o.tags:
                x, z = frame.to_game(o.location.lon, o.location.lat)
                out.addr_nodes.append(AddrNode(o.id, o.tags["addr:housenumber"], float(x), float(z)))
```

- [ ] **Step 5: Run, expect PASS** (whole file, existing tests unchanged): `cd pipeline && ./.venv/bin/python -m pytest tests/test_osm_read.py -q`

- [ ] **Step 6: Commit**

```bash
git add pipeline/osm_read.py pipeline/tests/fixtures/mini.osm pipeline/tests/test_osm_read.py
git commit -m "feat(pipeline): keep OSM address nodes, number only (#12)"
```

---

### Task 2: `addr` on buildings

**Files:**
- Modify: `pipeline/world_buildings.py`, `pipeline/osm.py`, `docs/11-pipeline-osm.md`
- Test: `pipeline/tests/test_buildings.py`

**Interfaces:**
- Consumes: `AddrNode` (Task 1).
- Produces: `world_buildings.join_numbers(nums: list[str]) -> str | None`; `world_buildings.build(areas, roads, clip, house_dist=30.0, big_area=1000.0, exclude_ids=frozenset(), industrial=(), keep_all=(), addr_nodes=())`; building dict gets optional `"addr": str`; stats keys `addr_own`, `addr_node`.

- [ ] **Step 1: Failing tests** (append to `test_buildings.py`; `house()` builds a 12 × 9 box centred at (x, z), so `house(1, 0, 20)` spans x −6..6, z 15.5..24.5):

```python
from osm_read import AddrNode


def test_own_number_on_the_outline():
    bl, stats = B.build([house(1, 0, 20, tags={"addr:housenumber": "12"})], MAIN, CLIP)
    assert bl[0]["addr"] == "12" and stats["addr_own"] == 1


def test_address_node_inside_the_outline():
    bl, stats = B.build([house(1, 0, 20)], MAIN, CLIP, addr_nodes=[AddrNode(9, "7", 1.0, 21.0)])
    assert bl[0]["addr"] == "7" and stats["addr_node"] == 1


def test_node_on_the_outline_or_outside_gives_no_addr():
    nodes = [AddrNode(9, "7", 0.0, 40.0), AddrNode(10, "8", 6.0, 20.0)]     # 15 m away; exactly on the east wall
    bl, _ = B.build([house(1, 0, 20)], MAIN, CLIP, addr_nodes=nodes)
    assert "addr" not in bl[0]


def test_own_number_wins_over_nodes():
    bl, _ = B.build([house(1, 0, 20, tags={"addr:housenumber": "3"})], MAIN, CLIP, addr_nodes=[AddrNode(9, "7", 1.0, 21.0)])
    assert bl[0]["addr"] == "3"


def test_several_entrances_become_a_range():
    nodes = [AddrNode(i, n, 1.0 + i * 0.1, 21.0) for i, n in enumerate(["6b", "6d", "6a", "6c", "6a"])]
    bl, _ = B.build([house(1, 0, 20)], MAIN, CLIP, addr_nodes=nodes)
    assert bl[0]["addr"] == "6a–6d"


def test_join_numbers():
    assert B.join_numbers(["10", "9", "9a"]) == "9–10"
    assert B.join_numbers(["1;3"]) == "1–3"
    assert B.join_numbers(["14-18"]) == "14-18"
    assert B.join_numbers(["", "  "]) is None
```

- [ ] **Step 2: Run, expect FAIL** (`KeyError: 'addr'` / `TypeError: build() got an unexpected keyword argument 'addr_nodes'`): `cd pipeline && ./.venv/bin/python -m pytest tests/test_buildings.py -q`

- [ ] **Step 3: Implement** in `world_buildings.py`. Above `build`:

```python
def _natural(s):
    m = re.match(r"(\d+)(.*)", s)
    return (int(m.group(1)), m.group(2)) if m else (math.inf, s)


def join_numbers(nums):
    """OSM house numbers -> one label: distinct, natural order; several -> 'first–last' (#12). A ';' list counts as several."""
    u = sorted({p.strip() for n in nums for p in (n or "").split(";") if p.strip()}, key=_natural)
    if not u:
        return None
    return u[0] if len(u) == 1 else f"{u[0]}–{u[-1]}"


def house_number(tags, poly, addr_nodes, tree):
    """Own addr:housenumber first, else the address nodes strictly inside the footprint."""
    own = join_numbers([tags.get("addr:housenumber", "")])
    if own or tree is None:
        return own, "addr_own"
    return join_numbers([addr_nodes[i].number for i in tree.query(poly, predicate="contains")]), "addr_node"
```

Change the signature to `def build(areas, roads, clip, house_dist=30.0, big_area=1000.0, exclude_ids=frozenset(), industrial=(), keep_all=(), addr_nodes=()):` and after the `quarters = ...` line add:

```python
    addr_tree = STRtree([shapely.Point(n.x, n.z) for n in addr_nodes]) if addr_nodes else None
```

Replace the `out.append({...})` line with:

```python
        rec = {"id": a.id, "h": height(t), "roof": kind, "palette": pal, "rect": rect, "ring": ring}
        addr, src = house_number(t, p, addr_nodes, addr_tree)
        if addr:
            rec["addr"] = addr
            stats[src] += 1
        out.append(rec)
```

In `osm.py` `build_world`, add `addr_nodes=data.addr_nodes` to the `world_buildings.build(...)` call (keyword, after the `keep_all_boxes(...)` argument).

- [ ] **Step 4: Run, expect PASS**: `cd pipeline && ./.venv/bin/python -m pytest tests/test_buildings.py tests/test_osm_read.py -q`

- [ ] **Step 5: Docs.** In `docs/11-pipeline-osm.md`, after the **Building heights (#17)** paragraph, add:

```markdown
**House numbers (#12).** `osm_read` keeps every node with `addr:housenumber` as `AddrNode(id, number, x, z)` — the number only, no name or street. A building gets an optional `addr`: its own `addr:housenumber`, else the numbers of the address nodes strictly inside its footprint; several numbers become `first–last` (`6a–6d`). An OSM-referenced landmark gets `addr` the same way from its own tag (the Hallenbad: `2`). No `street` field is exported. Real extract: ~1,230 of 1,885 buildings numbered (+~16 KB).
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/world_buildings.py pipeline/osm.py pipeline/tests/test_buildings.py docs/11-pipeline-osm.md
git commit -m "feat(pipeline): house numbers on buildings from OSM (#12)"
```

---

### Task 3: Landmark `addr` and golden checks

**Files:**
- Modify: `pipeline/anchors.py`
- Test: `pipeline/tests/test_anchors.py`, `pipeline/tests/test_golden.py`

**Interfaces:**
- Produces: `anchors.resolve(...)["landmarks"][name]["addr"]: str` when the referenced OSM area has `addr:housenumber`.

- [ ] **Step 1: Failing unit test** (append to `test_anchors.py`):

```python
def test_landmark_area_keeps_its_house_number():
    data = OsmData(areas=[Area(170395848, True, {"building": "civic", "addr:housenumber": "2", "name": "Hallenbad"}, shapely.box(0, 0, 40, 40)),
                          Area(806132044, True, {"man_made": "chimney"}, shapely.box(100, 100, 110, 110))])
    r = anchors.resolve({"landmarks": {"hb": {"osm": "w170395848"}, "c": {"osm": "w806132044"}, "g": {"game": [1, 2]}}}, data, F)
    assert r["landmarks"]["hb"]["addr"] == "2"
    assert "addr" not in r["landmarks"]["c"] and "addr" not in r["landmarks"]["g"]
```

- [ ] **Step 2: Golden tests** (append to `test_golden.py`; they skip without the extract):

```python
def test_house_numbers_from_osm(world):
    """#12: numbers come from OSM only -- the way's own tag or address nodes inside the footprint."""
    by_id = {b["id"]: b for b in world["buildings"]}
    assert by_id[155482787]["addr"] == "438"             # own tag, Hauptstrasse 438
    assert by_id[171822862]["addr"] == "5"               # one node inside, Bodenackerstrasse 5
    assert by_id[171822634]["addr"] == "6a–6d"      # Bodenackerstrasse 6: four entrance nodes
    assert world["anchors"]["landmarks"]["hallenbad"]["addr"] == "2"
    n = sum(1 for b in world["buildings"] if "addr" in b)
    assert 1100 <= n <= 1400, n
    assert all("street" not in b for b in world["buildings"])
```

- [ ] **Step 3: Run, expect FAIL** (unit: `KeyError: 'addr'`; golden: `KeyError: 'addr'` on the Hallenbad if the extract is present, else skipped):
`cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_anchors.py tests/test_golden.py -q`

- [ ] **Step 4: Implement** in `anchors.py`. Add:

```python
def _addr_index(data):
    return {("r" if not a.from_way else "w", a.id): a.tags["addr:housenumber"] for a in data.areas if a.tags.get("addr:housenumber")}
```

In `resolve`, after `idx = _index(data)` add `addrs = _addr_index(data)`; inside the landmarks loop, after the `if "size" in e:` block:

```python
        if "osm" in e and _osm_ref(e["osm"]) in addrs:
            out["landmarks"][name]["addr"] = addrs[_osm_ref(e["osm"])]
```

- [ ] **Step 5: Run, expect PASS** (golden passes where `pipeline/cache/osm/hochrhein.osm.pbf` exists, else skips): same command as Step 3, then the full pipeline suite `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/anchors.py pipeline/tests/test_anchors.py pipeline/tests/test_golden.py
git commit -m "feat(pipeline): house number on OSM landmarks, golden checks (#12)"
```

---

### Task 4: Pure helpers in `world.js`

**Files:**
- Modify: `prototype/world.js`
- Test: `prototype/tests/world.test.mjs`

**Interfaces:**
- Produces (all exported from `prototype/world.js`):
  - `roadNameAt(cands: Iterable<{r: {n, w, pts}, i}>, x, z, margin = 1) -> string` — name of the nearest named road segment with distance ≤ `r.w / 2 + margin`, else `''`.
  - `addrLabels(buildings, landmarks = {}) -> [{ t, x, z, top }]` — one per building/landmark with `addr`; `x, z` = `rect[0], rect[1]` (landmark: `x, z`); `top` = height of the roof top above the base: building `h + rh` if `rh` is a number, else `h + 0.4 * min(rect[2], rect[3])` for `roof === 'gable'`, else `max(h, 3)`; landmark `9`.
  - `pickLabels(items, x, z, maxDist = 60, maxN = 40) -> [{ ...item, d }]` — items within `maxDist`, nearest first, at most `maxN`.

- [ ] **Step 1: Failing tests** (append to `world.test.mjs`, and add `roadNameAt, addrLabels, pickLabels` to its import list):

```js
test('roadNameAt: on a named road, off it, unnamed, nearest of two', () => {
  const a = { n: 'Hauptstrasse', w: 8, pts: [[0, 0], [100, 0]] }, b = { n: 'Bachweg', w: 4, pts: [[50, -50], [50, 50]] }, u = { n: '', w: 20, pts: [[0, 10], [100, 10]] };
  const c = [{ r: a, i: 0 }, { r: b, i: 0 }, { r: u, i: 0 }];
  assert.equal(roadNameAt(c, 20, 4.9), 'Hauptstrasse');     // w/2 + 1 = 5
  assert.equal(roadNameAt(c, 20, 5.1), '');                 // past the margin; only the unnamed road is under the car
  assert.equal(roadNameAt(c, 51, 2), 'Bachweg', 'roadNameAt picks the nearer of two named roads');
  assert.equal(roadNameAt([], 0, 0), '');
});

test('addrLabels: only numbered buildings, roof-top heights, landmarks', () => {
  const B = [{ addr: '6a–6d', h: 20, rh: 1.5, roof: 'flat', rect: [10, 20, 60, 22, 0] }, { addr: '5', h: 6, roof: 'gable', rect: [1, 2, 12, 8, 0] },
    { addr: '7', h: 2, roof: 'flat', rect: [3, 4, 10, 10, 0] }, { h: 6, roof: 'flat', rect: [0, 0, 10, 10, 0] }];
  assert.deepEqual(addrLabels(B, { hallenbad: { x: 5, z: 6, addr: '2' }, chimney: { x: 0, z: 0 } }), [
    { t: '6a–6d', x: 10, z: 20, top: 21.5 }, { t: '5', x: 1, z: 2, top: 6 + 0.4 * 8 }, { t: '7', x: 3, z: 4, top: 3 }, { t: '2', x: 5, z: 6, top: 9 }]);
  assert.deepEqual(addrLabels([]), []);
});

test('pickLabels: within 60 m, nearest first, at most 40', () => {
  const items = Array.from({ length: 100 }, (_, k) => ({ t: String(k), x: k, z: 0 }));
  const got = pickLabels(items, 0, 0);
  assert.equal(got.length, 40);
  assert.deepEqual(got.slice(0, 3).map(l => [l.t, l.d]), [['0', 0], ['1', 1], ['2', 2]]);
  assert.equal(pickLabels(items, 0, 0, 60, 100).length, 61);  // 0..60 inclusive
  assert.deepEqual(pickLabels(items, 500, 500), []);
});
```

- [ ] **Step 2: Run, expect FAIL** (`SyntaxError: The requested module '../world.js' does not provide an export named 'roadNameAt'`): `node --test prototype/tests/*.test.mjs`

- [ ] **Step 3: Implement** — append to `prototype/world.js`:

```js
// #12: name of the road under the car -- the nearest named segment whose centre line is within half its width (+ margin)
export function roadNameAt(cands, x, z, margin = 1) {
  let best = '', bd = Infinity;
  for (const { r, i } of cands) {
    if (!r.n) continue;
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0, d = Math.hypot(x - ax - dx * u, z - az - dz * u);
    if (d <= r.w / 2 + margin && d < bd) { bd = d; best = r.n; }
  }
  return best;
}
// #12: house-number labels (OSM addr) at the footprint centre; top = roof top above the base, as osmBuilding draws it (roughly)
export function addrLabels(buildings, landmarks = {}) {
  const top = b => typeof b.rh === 'number' ? b.h + b.rh : b.roof === 'gable' ? b.h + 0.4 * Math.min(b.rect[2], b.rect[3]) : Math.max(b.h, 3);
  return [...buildings.filter(b => b.addr).map(b => ({ t: b.addr, x: b.rect[0], z: b.rect[1], top: top(b) })),
          ...Object.values(landmarks).filter(l => l.addr).map(l => ({ t: l.addr, x: l.x, z: l.z, top: 9 }))];
}
export function pickLabels(items, x, z, maxDist = 60, maxN = 40) {
  const out = [];
  for (const it of items) { const d = Math.hypot(it.x - x, it.z - z); if (d <= maxDist) out.push({ ...it, d }); }
  return out.sort((a, b) => a.d - b.d).slice(0, maxN);
}
```

- [ ] **Step 4: Run, expect PASS** (all node tests): `node --test prototype/tests/*.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add prototype/world.js prototype/tests/world.test.mjs
git commit -m "feat(prototype): pure helpers for road names and house-number labels (#12)"
```

---

### Task 5: HUD line with the road name

**Files:**
- Modify: `prototype/index.html`
- Create: `prototype/tests/test_street_labels.py`

**Interfaces:**
- Consumes: `roadNameAt` (Task 4), `ROAD_GRID` (~L190, filled ~L315 with `{ r, i }`), `gridQuery`.
- Produces: `HUD.road: string`; `window.__mm.hud().road`; test helpers `open_page(p, server, block_world=False, world=None) -> (browser, page)` and constant `WORLD` in `test_street_labels.py`.

- [ ] **Step 1: Create the test file:**

```python
"""#12: road name in the HUD, house-number labels near the car, station boards. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_page(p, server, block_world=False, world=None):
    """world: a dict served instead of the file (lets a test patch fields in)."""
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    elif world is not None:
        body = json.dumps(world, ensure_ascii=False)
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def rhine_point(w):
    rh = next(x for x in w["water"] if x["name"] == "Rhein" and len(x["rings"][0]) > 20)
    ring = rh["rings"][0]
    return sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring)


@needs_world
def test_hud_names_the_road_under_the_car(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    segs = [(a, b) for r in w["roads"] if r["n"] == "Hauptstrasse" for a, b in zip(r["pts"], r["pts"][1:])]
    a, b = max(segs, key=lambda s: math.dist(*s))                       # longest Hauptstrasse segment (~475 m)
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    rx, rz = rhine_point(w)
    with sync_playwright() as p:
        br, page = open_page(p, server)
        page.evaluate(f"() => window.__mm.place({mx}, {mz})")
        page.wait_for_function("() => window.__mm.hud().road === 'Hauptstrasse'", timeout=60000)
        shown = page.inner_text("#roadname")
        page.evaluate(f"() => window.__mm.place({rx}, {rz})")
        off_road = page.evaluate("() => window.__mm.roadDist()")
        page.wait_for_function("() => window.__mm.hud().road === ''", timeout=60000)
        br.close()
    assert shown == "Hauptstrasse"
    assert off_road > 3, off_road
```

- [ ] **Step 2: Run, expect FAIL** (timeout waiting for `hud().road === 'Hauptstrasse'`, since `road` is undefined):
`cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_street_labels.py -q`

- [ ] **Step 3: Implement** in `prototype/index.html`:
  - CSS, after the `#watername{...}` line (~L32): `#roadname{font-size:15px;font-weight:700;letter-spacing:2px;color:#f5efe0;text-shadow:2px 2px 0 var(--ink);min-height:18px}`
  - Markup, after `<div id="watername"></div>` (~L91): `    <div id="roadname"></div>`
  - Import (~L189): add `roadNameAt, addrLabels, pickLabels` to the `./world.js` import list.
  - `HUD` (~L778): `const HUD = { carHidden: false, blinker: null, water: '', waterT: 0, road: '' };`
  - In `hud(dt)` (~L898) extend the 250 ms block; the old text `HUD.water = L ? waterNameNear(P.x, P.z) : ''; $('watername').textContent = HUD.water; }` becomes:
    `HUD.water = L ? waterNameNear(P.x, P.z) : ''; $('watername').textContent = HUD.water; HUD.road = roadNameAt(gridQuery(ROAD_GRID, P.x, P.z, 1), P.x, P.z); $('roadname').textContent = HUD.road; }`
  - Hook `window.__mm.hud` (~L820): add `, road: HUD.road` after `water: HUD.water`.

- [ ] **Step 4: Run, expect PASS** (same command; `1 passed`), then `node --test prototype/tests/*.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_street_labels.py
git commit -m "feat(ui): HUD names the road the car is on (#12)"
```

---

### Task 6: House-number labels near the car

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_street_labels.py`

**Interfaces:**
- Consumes: `addrLabels`, `pickLabels` (Task 4), `makeGrid`, `gridAdd`, `gridQuery`, `textTex` (~L235), `terrainH`, `scene` (~L719), `open_page`, `rhine_point`, `WORLD` (Task 5).
- Produces: `LABELS = { grid, mat: Map, pool: Sprite[40], shown: [], t: 0 }`, `updateLabels(x, z)`, `window.__mm.labels() -> [{ t, x, z, d }]`.

- [ ] **Step 1: Failing test** (append). It patches the number into the served world so it does not depend on the Task 8 rebuild:

```python
@needs_world
def test_house_numbers_appear_near_and_vanish_far(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    b = next(x for x in w["buildings"] if x["id"] == 171822634)        # Bodenackerstrasse 6
    b.setdefault("addr", "6a–6d")
    cx, cz = b["rect"][0], b["rect"][1]
    rx, rz = rhine_point(w)
    with sync_playwright() as p:
        br, page = open_page(p, server, world=w)
        page.evaluate(f"() => window.__mm.place({cx + 20}, {cz})")
        page.wait_for_function("() => window.__mm.labels().some(l => l.t === '6a–6d')", timeout=60000)
        near = page.evaluate("() => window.__mm.labels()")
        page.evaluate(f"() => window.__mm.place({rx}, {rz})")
        page.wait_for_function("() => !window.__mm.labels().some(l => l.t === '6a–6d')", timeout=60000)
        far = page.evaluate("() => window.__mm.labels()")
        visible = page.evaluate("() => window.__mm.labelSprites()")
        br.close()
    assert 1 <= len(near) <= 40 and all(l["d"] <= 60 for l in near), near
    assert all(l["d"] <= 60 for l in far) and len(far) <= 40
    assert visible == len(far)                                          # hidden pool sprites really are hidden
```

- [ ] **Step 2: Run, expect FAIL** (`TypeError: window.__mm.labels is not a function`): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_street_labels.py -q -k house_numbers`

- [ ] **Step 3: Implement** in `prototype/index.html`. Directly after `const scene = new THREE.Scene(); scene.add(decals, signs, marks);` (~L719) add:

```js
// house numbers (#12, OSM addr): camera-facing sprites over the buildings within 60 m of the car; a pool of 40, refilled every 250 ms, one material per number
const LABELS = { grid: makeGrid(64), mat: new Map(), pool: [], shown: [], t: 0 };
if (L) for (const it of addrLabels(L.buildings, L.anchors.landmarks)) { it.y = terrainH(it.x, it.z) + it.top + 1.5; gridAdd(LABELS.grid, it.x, it.z, it.x, it.z, it); }
for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(); s.scale.set(3.2, 1.2, 1); s.visible = false; LABELS.pool.push(s); scene.add(s); }
function labelMat(t) { let m = LABELS.mat.get(t); if (!m) LABELS.mat.set(t, m = new THREE.SpriteMaterial({ map: textTex(t, 256, 96, 'rgba(20,23,29,.82)', '#f5efe0', '700 64px "Barlow Condensed", sans-serif', '#f5efe0'), depthWrite: false })); return m; }
function updateLabels(x, z) { LABELS.shown = pickLabels(gridQuery(LABELS.grid, x, z, 60), x, z, 60, 40); LABELS.pool.forEach((s, i) => { const it = LABELS.shown[i]; s.visible = !!it; if (it) { s.material = labelMat(it.t); s.position.set(it.x, it.y, it.z); } }); }
```

In `hud(dt)` (~L898), right after the 250 ms water/road block, add:
`if (performance.now() - LABELS.t > 250) { LABELS.t = performance.now(); updateLabels(P.x, P.z); }`

Hooks, after the `window.__mm.hud = ...` line (~L820):

```js
window.__mm.labels = () => LABELS.shown.map(l => ({ t: l.t, x: l.x, z: l.z, d: +l.d.toFixed(1) }));
window.__mm.labelSprites = () => LABELS.pool.filter(s => s.visible).length;
```

(`textTex` builds via `function makeTex` ~L206, which returns a `THREE.CanvasTexture` — usable as a sprite `map` as is.)

- [ ] **Step 4: Run, expect PASS** (whole file, `2 passed`): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_street_labels.py -q`

- [ ] **Step 5: Commit**

```bash
git add prototype/index.html prototype/tests/test_street_labels.py
git commit -m "feat(prototype): house-number labels near the car (#12)"
```

---

### Task 7: Station name boards

**Files:**
- Modify: `prototype/index.html`
- Test: `prototype/tests/test_street_labels.py`

**Interfaces:**
- Consumes: `textTex`, `signs` group (~L595), `terrainH`, `open_page`, `WORLD`.
- Produces: `stationAt(x, z, rot, name)`; `STATION_SIGNS: [{ t, x, z }]`; `window.__mm.stationSigns()`.

- [ ] **Step 1: Failing tests** (append):

```python
STATIONS = {"stationStein": "Bahnhof Stein-Säckingen", "stationSisseln": "Bahnhof Sisseln"}


@needs_world
def test_station_boards_on_the_osm_stations(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    with sync_playwright() as p:
        br, page = open_page(p, server)
        signs = page.evaluate("() => window.__mm.stationSigns()")
        br.close()
    assert sorted(s["t"] for s in signs) == sorted(STATIONS.values())
    for key, name in STATIONS.items():
        lm = w["anchors"]["landmarks"][key]; s = next(s for s in signs if s["t"] == name)
        assert math.dist((s["x"], s["z"]), (lm["x"], lm["z"])) < 1, (s, lm)


def test_hand_layout_signs_and_no_labels(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        page.wait_for_timeout(600)
        signs = page.evaluate("() => window.__mm.stationSigns()")
        labels = page.evaluate("() => window.__mm.labels()")
        br.close()
    assert sorted(s["t"] for s in signs) == sorted(STATIONS.values())
    assert labels == []
```

- [ ] **Step 2: Run, expect FAIL** (`TypeError: window.__mm.stationSigns is not a function`): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_street_labels.py -q -k "station or hand"`

- [ ] **Step 3: Implement** in `prototype/index.html`:
  - After `const decals = new THREE.Group(), signs = new THREE.Group(), marks = new THREE.Group();` (~L595) add:
    `const STATION_SIGNS = [], STATION_NAMES = { stationStein: 'Bahnhof Stein-Säckingen', stationSisseln: 'Bahnhof Sisseln' };`
  - Replace `function stationAt(x, z, rot) {` (~L591) by `function stationAt(x, z, rot, name) {` and append, before its closing `}`: ` if (name) stationSign(name, x, z, rot, b);`
  - Add after `stationAt` (a function declaration, so hoisting covers the earlier call sites):

```js
// #12: blue Swiss station board on both long facades (signW's 'ch' style), just under the eaves
function stationSign(name, x, z, rot, b) { const mat = new THREE.MeshLambertMaterial({ map: textTex(name, 1024, 170, '#1c5fb0', '#ffffff', '700 110px "Barlow Condensed", sans-serif', '#ffffff') }); for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.5), mat); m.position.set(x - s * 4.06 * Math.sin(rot), b + 2.9, z + s * 4.06 * Math.cos(rot)); m.rotation.y = -rot + (s < 0 ? Math.PI : 0); signs.add(m); } STATION_SIGNS.push({ t: name, x, z }); }
```

  (The building box is `box(26, 6, 8, x, b - 2, z, rot, ...)`: `box` rotates by `rotateY(-rot)`, so the local `+z` façade normal is `(-sin rot, cos rot)` in world x/z, and the walls run from `b - 2` to `b + 4`.)
  - Hand stations (~L669): `for (const [px, py, rot] of [[447, 945, -0.14], [1690, 770, -0.1]]) { const [x, z] = W(px, py); stationAt(x, z, rot); }` becomes
    `for (const [px, py, rot, name] of [[447, 945, -0.14, 'Bahnhof Stein-Säckingen'], [1690, 770, -0.1, 'Bahnhof Sisseln']]) { const [x, z] = W(px, py); stationAt(x, z, rot, name); }`
  - OSM stations (~L699): `stationAt(at(k).x, at(k).z, at(k).rot);` becomes `stationAt(at(k).x, at(k).z, at(k).rot, STATION_NAMES[k]);`
  - Hook, after `window.__mm.labelSprites` (Task 6): `window.__mm.stationSigns = () => STATION_SIGNS.map(s => ({ ...s }));`

- [ ] **Step 4: Run, expect PASS** (whole file, `4 passed`): `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests/test_street_labels.py -q`

- [ ] **Step 5: Changelog.** Under `## [Unreleased]` → `### Added` in `CHANGELOG.md`, add as the first bullet:

```markdown
- The HUD now names the street you are driving on, house numbers from OpenStreetMap float above the houses around you, and both railway stations carry their blue "Bahnhof Sisseln" and "Bahnhof Stein-Säckingen" boards.
```

- [ ] **Step 6: Commit**

```bash
git add prototype/index.html prototype/tests/test_street_labels.py CHANGELOG.md
git commit -m "feat(prototype): name boards on both railway stations (#12)"
```

---

### Task 8: Rebuild the world file (with measured heights) — guarded

**Files:**
- Modify: `data/world_hochrhein.json` (generated)

**Interfaces:**
- Consumes: Tasks 1-3 (pipeline). The prototype tasks do not depend on this task.

**Push the branch first** (`git push -u origin HEAD`), so the work is safe if this step stops.

- [ ] **Step 1: Cache check — STOP if it fails.** The build needs the local caches; a CI runner usually has none of them:

```bash
cd pipeline
test -f cache/osm/hochrhein.osm.pbf \
  && [ "$(ls cache/swisssurface3d/*.tif 2>/dev/null | wc -l)" -ge 30 ] \
  && [ "$(ls cache/swissalti3d/*.tif 2>/dev/null | wc -l)" -ge 1 ] \
  && echo CACHES-OK || echo "STOP: caches missing"
```

If it prints `STOP`: do **not** run the build, do **not** touch or commit `data/world_hochrhein.json`, and do not let the build download tiles instead. Skip to Task 9 and state in the PR description: "World not rebuilt: pipeline caches missing on this machine. Run Task 8 of docs/superpowers/plans/2026-10-02-street-labels.md locally." Never commit a world built without `--dsm-heights`.

- [ ] **Step 2: Golden tests first (must pass on the real extract, not skip):**
`cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest tests/test_golden.py -q -rs`
Expected: all pass, no `SKIPPED` for `test_house_numbers_from_osm`.

- [ ] **Step 3: Build** (foreground, a few minutes):

```bash
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python osm.py build --pbf cache/osm/hochrhein.osm.pbf --mmh ../data/terrain_hochrhein.mmh --out ../data/world_hochrhein.json --dsm-heights cache
```

Expected in the log: `building heights from swissSURFACE3D: {... 'dsm': 16xx ...}` and buildings stats containing `addr_own` and `addr_node`.

- [ ] **Step 4: Guard — the world may differ from `main` only in the new fields.** (Rebuilding `main` reproduces the committed world exactly; checked 2026-10-02.)

```bash
git fetch origin main && OLD=$(mktemp) && git show origin/main:data/world_hochrhein.json > "$OLD"
OLD="$OLD" ./pipeline/.venv/bin/python - <<'EOF'
import json, os
a = json.load(open(os.environ["OLD"], encoding="utf-8")); b = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
for w in (a, b): w["params"].pop("built", None)
n = sum(1 for x in b["buildings"] if "addr" in x)
assert b["anchors"]["landmarks"]["hallenbad"].get("addr") == "2"
for x in b["buildings"]: x.pop("addr", None)
for l in b["anchors"]["landmarks"].values(): l.pop("addr", None)
assert a == b, [k for k in a if a[k] != b.get(k)]
assert sum(1 for x in a["buildings"] if x.get("hsrc") == "dsm") > 1500        # measured heights kept
assert 1100 <= n <= 1400, n
print("guard ok:", n, "numbered buildings")
EOF
ls -l "$OLD" data/world_hochrhein.json
```

Expected: `guard ok: ~1230 numbered buildings`; the new file is < 50 KB larger. If the guard fails: **STOP**, `git checkout -- data/world_hochrhein.json`, and report the differing keys.

- [ ] **Step 5: Commit**

```bash
git add data/world_hochrhein.json
git commit -m "chore(data): rebuild world with house numbers (#12)"
```

---

### Task 9: Full verification

**Files:** none changed (unless a check fails).

- [ ] **Step 1: Push, then run every suite in the foreground:**

```bash
git push
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest -q
cd .. && node --test prototype/tests/*.test.mjs
cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python -m pytest ../prototype/tests -q
```

Expected: all green; `test_smoke.py` unchanged; data-dependent tests skip only where the data files are missing, exactly as before.

- [ ] **Step 2: RNG check.** `git diff origin/main -- prototype/index.html | grep -n "rr(\|rnd()"` prints nothing.

- [ ] **Step 3: Manual playtest** (`python3 -m http.server 8000` at the repo root, open `http://localhost:8000/prototype/index.html`): empty console; the road line under the water name changes when turning from Hauptstrasse into Bodenackerstrasse and goes blank on a field; house numbers pop in/out around the car without stutter and face the camera; the Hallenbad shows `2`; both stations carry readable blue boards on both sides; the hand layout (world file blocked or missing) still loads.

- [ ] **Step 4: PR description** lists: the Hallenbad is a landmark (its number comes from `anchors`), no `street` field (unused), multi-entrance range format, and whether Task 8 ran (or why not).
