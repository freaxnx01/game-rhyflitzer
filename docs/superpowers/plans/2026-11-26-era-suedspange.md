# Südspange hidden in 1952 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the 1952 layer (Ctrl+Y) the Südspange, its cycle path and the four building-site signs are gone; everything else stays as it is.

**Architecture:** `pipeline/era_roads.py` hides three road ids as `"late"` and flags the four sign landmarks `modern`; `era_fields.py` leaves those landmarks alone; the committed world is re-patched; the game builds a `modern` sign into the time layer (`ERA.group`).

**Tech Stack:** Python 3 + shapely + pytest (pipeline), vanilla JS + three.js (game), Playwright (browser test).

**Spec:** `docs/superpowers/specs/2026-11-26-era-suedspange-design.md`

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Hidden road ids, verbatim: `LATE_IDS = (-42001, -42002, -42003)`. `-42004` (Geuerenstrasse) is **not** in it.
- Sign landmarks, verbatim: `SUEDSPANGE_SIGNS = ("suedspangeBaustelleOst", "suedspangeBaustelleWest", "suedspangeFahrverbotOst", "suedspangeFahrverbotWest")`.
- Reason string `"late"`; precedence bridge > late > motorway > industrial > empty.
- `modern` stays the **last** key of a road or landmark (the existing byte-stability rule, `era_roads.py` docstring).
- The grade cut (`world.grades`), the rail decks over it and today's (non-1952) game are not touched.
- Changelog entry in German, under `[Unreleased]` → `### Changed`, with timestamp `TZ=Europe/Zurich date '+%F %H:%M'`, 1–3 bold keywords.
- Run pipeline tests from `pipeline/`: `cd pipeline && python -m pytest tests/<file> -q`. Browser tests in the foreground.

## Review Focus

1. **Stale flag on re-run:** an older run left `modern` on a sign landmark while no late road is hidden any more → the flag must be removed (as `fridolinsbruecke` does).
2. **era_fields order:** `era_fields.py` run after `era_roads.py` must not clear a sign's `modern` flag set by `era_roads.py`, whether the sign lies inside the industrial site or not.
3. **Collateral flags:** re-patching the world changes `modern`/`keep1952` on no road other than the Südspange ids, and `modern` on no landmark other than the four signs.
4. **Toggle back:** after Ctrl+Y twice the signs are visible again and the J entry is back.
5. **Car on the Südspange when switching:** it is moved to an old road (existing `toggleEra` behaviour) — covered by the browser test.

---

### Task 1: `era_roads.py` hides the late roads and flags their signs

**Files:**
- Modify: `pipeline/era_roads.py` (constants near `BRIDGE_NAME` at :52; `classify` at :79-91; `apply` at :470-500; module docstring)
- Test: `pipeline/tests/test_era_roads.py`

**Interfaces:**
- Produces: `R.LATE_IDS`, `R.SUEDSPANGE_SIGNS`; `classify(...)` may return `"late"`; `apply(...)` counts include `"late"`.

- [ ] **Step 1: Write the failing tests** (append to `pipeline/tests/test_era_roads.py`; `road()` gets an `id` parameter, default 1)

```python
def road(cls, pts, n="", bridge=False, id=1):
    return {"id": id, "n": n, "cls": cls, "w": 6.0, "mark": "none", "bridge": bridge, "layer": 0, "pts": [list(p) for p in pts]}


def test_late_ids_are_modern_on_either_side_whatever_their_class():
    roads = [road("tertiary", [(100, 0), (300, 0)], n="Südspange", id=-42001),
             road("cycleway", [(100, 10), (300, 10)], id=-42002),
             road("unclassified", [(-300, 0), (-100, 0)], n="Südspange", id=-42003),
             road("unclassified", [(100, 90), (300, 90)], n="Geuerenstrasse", id=-42004)]
    assert classify(roads) == {0: "late", 1: "late", 2: "late"}


def test_late_beats_motorway_and_industrial():
    roads = [road("motorway", [(100, 0), (300, 0)], id=-42001), road("service", [(120, 150), (180, 150)], id=-42003)]
    assert classify(roads, industrial=INDUSTRIAL) == {0: "late", 1: "late"}


def _sign_world(late=True):
    lm = {name: {"x": 500.0, "z": 0.0, "kind": "baustelle", "h": None, "rot": 0.0} for name in R.SUEDSPANGE_SIGNS}
    lm["muenster"] = {"x": 600.0, "z": 0.0, "kind": "church", "h": None, "rot": 0.0}
    return {"origin": {"lat": 47.5506, "lon": 7.9671},
            "roads": [road("tertiary", [(100, 0), (300, 0)], id=-42001 if late else 7)],
            "buildings": [], "anchors": {"landmarks": lm}}


def test_apply_flags_the_suedspange_signs_and_counts_late():
    w = _sign_world()
    counts = R.apply(w, SWISS_LV95(), IND_LONLAT)
    assert counts["late"] == 1
    lm = w["anchors"]["landmarks"]
    assert all(lm[n]["modern"] is True and list(lm[n])[-1] == "modern" for n in R.SUEDSPANGE_SIGNS)
    assert "modern" not in lm["muenster"]


def test_apply_clears_a_stale_sign_flag_when_no_late_road_is_hidden():
    w = _sign_world(late=False)
    for n in R.SUEDSPANGE_SIGNS:
        w["anchors"]["landmarks"][n]["modern"] = True
    R.apply(w, SWISS_LV95(), IND_LONLAT)
    assert all("modern" not in w["anchors"]["landmarks"][n] for n in R.SUEDSPANGE_SIGNS)
```

`IND_LONLAT` is the industrial polygon `test_apply_is_idempotent_and_byte_stable` already builds inline (`[[7.99, 47.55], [7.991, 47.55], [7.991, 47.551], [7.99, 47.551], [7.99, 47.55]]`): lift it to a module constant and use it in both tests.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd pipeline && python -m pytest tests/test_era_roads.py -q`
Expected: the four new tests FAIL (`AttributeError: ... SUEDSPANGE_SIGNS` / `assert {} == {0: 'late', ...}`); the existing ones pass.

- [ ] **Step 3: Implement** in `pipeline/era_roads.py`:
  - `LATE_IDS` and `SUEDSPANGE_SIGNS` constants after `BRIDGE_NAME`, each with a one-line comment (#1150: the Südspange, built in the 2020s, and its cycle path; the signs of its building site).
  - `classify`: after the `BRIDGE_NAME` branch, `elif road.get("id") in LATE_IDS: hidden[i] = "late"` — before the Swiss-side check, so it applies on either side.
  - `apply`: next to the `fridolinsbruecke` block, for each name in `SUEDSPANGE_SIGNS` present in `anchors.landmarks`: `pop("modern")`, then set `modern = True` if any hidden road has reason `"late"`.
  - `counts`: add `"late"` to the tuple of reasons.
  - Docstring: name the late ids and the precedence bridge > late > motorway > industrial > empty.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd pipeline && python -m pytest tests/test_era_roads.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/era_roads.py pipeline/tests/test_era_roads.py
git commit -m "feat(era): hide the Südspange and its cycle path in 1952 (#1150)"
```

### Task 2: `era_fields.py` leaves the sign flags to `era_roads.py`

**Files:**
- Modify: `pipeline/era_fields.py:39` (`ROAD_LANDMARKS`)
- Test: `pipeline/tests/test_era_fields.py`

**Interfaces:**
- Consumes: `era_roads.SUEDSPANGE_SIGNS` (Task 1).

- [ ] **Step 1: Write the failing test**

```python
def test_flag_site_leaves_the_suedspange_signs_alone():
    w = _flag_world()
    lm = w["anchors"]["landmarks"]
    lm["suedspangeBaustelleOst"] = {"x": 900, "z": 50, "modern": True}    # outside the site, flagged by era_roads
    lm["suedspangeFahrverbotOst"] = {"x": 50, "z": 50}                    # inside the site, not flagged
    F.flag_site(w, SITE)
    assert lm["suedspangeBaustelleOst"]["modern"] is True
    assert "modern" not in lm["suedspangeFahrverbotOst"]
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_era_fields.py -q`
Expected: FAIL (the outside sign loses its flag, the inside one gains one).

- [ ] **Step 3: Implement:** `ROAD_LANDMARKS = ("fridolinsbruecke", *SUEDSPANGE_SIGNS)` with `from era_roads import SUEDSPANGE_SIGNS`; update the comment (flagged by era_roads, whose roads are hidden).

- [ ] **Step 4: Run both pipeline files**

Run: `cd pipeline && python -m pytest tests/test_era_fields.py tests/test_era_roads.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/era_fields.py pipeline/tests/test_era_fields.py
git commit -m "feat(era): era_fields keeps the Südspange sign flags (#1150)"
```

### Task 3: re-patch the committed world and document it

**Files:**
- Modify: `data/world_hochrhein.json` (generated), `data/README.md` (road flag `modern` paragraph), `docs/11-pipeline-osm.md` ("Roads of 1952" paragraph)

**Interfaces:**
- Consumes: Tasks 1–2.

- [ ] **Step 1: Re-patch, in order**

```bash
cd pipeline
python era_roads.py --world ../data/world_hochrhein.json
python era_fields.py --world ../data/world_hochrhein.json
```

Expected: `era_roads` prints counts with `'late': 6` (3 pieces of -42001, 1 of -42002, 2 of -42003).

- [ ] **Step 2: Prove the change is only the intended one** (script in a temp dir, not committed)

```python
import json, subprocess
old = json.loads(subprocess.check_output(["git", "show", "HEAD:data/world_hochrhein.json"]))
new = json.load(open("data/world_hochrhein.json", encoding="utf-8"))
late = {-42001, -42002, -42003}
changed = [(a["id"], a.get("modern"), b.get("modern")) for a, b in zip(old["roads"], new["roads"]) if a != b]
assert all(i in late for i, _, _ in changed) and len(changed) == 6, changed
signs = {k for k in new["anchors"]["landmarks"] if new["anchors"]["landmarks"][k] != old["anchors"]["landmarks"].get(k)}
assert signs == {"suedspangeBaustelleOst", "suedspangeBaustelleWest", "suedspangeFahrverbotOst", "suedspangeFahrverbotWest"}, signs
for key in old:
    if key not in ("roads", "anchors", "era"): assert old[key] == new[key], key
print("era.fields changed:", old["era"]["fields"] != new["era"]["fields"])
```

Expected: no assertion error. A change in `era.fields` is allowed (spec: farmland where the Südspange ran inside the site).

- [ ] **Step 3: Run the era_roads/era_fields scripts a second time** and confirm `git diff --stat data/` is unchanged by it (idempotent).

- [ ] **Step 4: Docs:** in `data/README.md` (road flag `modern`) and `docs/11-pipeline-osm.md` ("Roads of 1952"), add: the Südspange (`-42001`, `-42003`) and its cycle path (`-42002`) are hidden by id as late roads, and the four building-site signs get `modern` with them.

- [ ] **Step 5: Commit**

```bash
git add data/world_hochrhein.json data/README.md docs/11-pipeline-osm.md
git commit -m "feat(era): the Hochrhein world hides the Südspange in 1952 (#1150)"
```

### Task 4: the game hides the building-site signs in 1952

**Files:**
- Modify: `index.html` — `roadSign` (:2392-2397), the sign loop (:3227), `__mm.roadSigns` (:6189), `CHANGELOG.md`
- Test: `tests/test_era_toggle.py`

**Interfaces:**
- Consumes: the world from Task 3 (`anchors.landmarks.<sign>.modern`).
- Produces: `__mm.roadSigns()` → `[{ kind, x, z, modern?: true, shown: boolean }]`.

- [ ] **Step 1: Write the failing browser test** (append to `tests/test_era_toggle.py`)

```python
SUEDSPANGE_AT = (1300.0, 576.0)   # on -42001, the stretch over the cutting


@needs_world
def test_suedspange_and_its_signs_are_gone_in_1952(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        def names():   # the J list is filled while the dialog is open (as in test_hidden_buildings_leave_map_plates_and_jumps)
            page.keyboard.press("j")
            page.wait_for_function("() => window.__mm.jumpList().length > 0", timeout=60000)
            rows = [r["n"] for r in page.evaluate("() => window.__mm.jumpList()")]
            page.keyboard.press("Escape")
            return rows
        signs = lambda: page.evaluate("() => window.__mm.roadSigns()")
        today = (names(), signs())
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(SUEDSPANGE_AT))
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        past = (names(), signs(), car_of(page), page.evaluate(ERA))
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        back = (names(), signs())
        b.close()
    assert "Südspange Sisslerfeld" in today[0] and "Südspange Sisslerfeld" not in past[0] and "Südspange Sisslerfeld" in back[0]
    assert len(today[1]) == 4 and all(s["shown"] for s in today[1]) and all(s["shown"] for s in back[1])
    assert all(not s["shown"] and s["modern"] for s in past[1]), past[1]
    car, era = past[2], past[3]
    assert math.hypot(car["x"] - SUEDSPANGE_AT[0], car["z"] - SUEDSPANGE_AT[1]) > 3 and not era["goneHere"], (car, era)
    assert page.errors == []
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_era_toggle.py::test_suedspange_and_its_signs_are_gone_in_1952 -q`
Expected: FAIL on the signs (`KeyError: 'shown'`); the road and the J entry already pass after Task 3.

- [ ] **Step 3: Implement** in `index.html`:
  - `roadSign(kind, x, z, rot, build, panel, modern = false)`: add the group to `modern ? ERA.group : signs` and push `{ kind, x, z, ...(modern ? { modern: true } : {}) }`; `baustelleSign` / `fahrverbotSign` pass `modern` through.
  - Sign loop (:3227): pass `!!s.modern`.
  - `__mm.roadSigns`: `ROAD_SIGNS.map(s => ({ ...s, shown: !(s.modern && ERA.on) }))`, comment `#1150`.
  - `CHANGELOG.md`, `### Changed`: e.g. "Im **1952**-Modus (<kbd>Ctrl</kbd>+<kbd>Y</kbd>) ist die **Südspange** samt Radweg und Baustellenschildern verschwunden; nur ihr Einschnitt bleibt."

- [ ] **Step 4: Run the era browser tests**

Run: `python -m pytest tests/test_era_toggle.py -q`
Expected: all pass (the new one and the existing road-gone, J-plate and field tests).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/test_era_toggle.py CHANGELOG.md
git commit -m "feat(era): the Südspange's building-site signs are gone in 1952 (#1150)"
```
