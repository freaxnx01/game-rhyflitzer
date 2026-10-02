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
        t0 = page.evaluate("() => window.__mm.labelTick()")
        page.wait_for_function(f"() => window.__mm.labelTick() > {t0}", timeout=60000)   # updateLabels really ran
        signs = page.evaluate("() => window.__mm.stationSigns()")
        labels = page.evaluate("() => window.__mm.labels()")
        br.close()
    assert sorted(s["t"] for s in signs) == sorted(STATIONS.values())
    assert labels == []


@needs_world
def test_label_material_cache_stays_bounded(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    for i, b in enumerate(w["buildings"]):
        b["addr"] = f"n{i}"                                              # every building its own distinct number
    stops = w["buildings"][::len(w["buildings"]) // 16][:16]             # spread across the whole map
    seen, sizes = set(), []
    with sync_playwright() as p:
        br, page = open_page(p, server, world=w)
        cap = page.evaluate("() => window.__mm.labelCache().cap")
        for b in stops:
            page.evaluate(f"() => window.__mm.place({b['rect'][0] + 2}, {b['rect'][1]})")
            page.wait_for_function(f"() => window.__mm.labels().some(l => l.t === '{b['addr']}')", timeout=60000)
            seen |= {l["t"] for l in page.evaluate("() => window.__mm.labels()")}
            c = page.evaluate("() => window.__mm.labelCache()")
            sizes.append(c["size"]); assert c["live"], c                 # every visible sprite still holds a cached material
        br.close()
    assert len(seen) > cap, (len(seen), cap)                             # the drive really overflows the cache
    assert max(sizes) <= cap, sizes
