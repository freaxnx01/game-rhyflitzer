"""#76: rail bridges over roads become decks, the road dips into a cut underneath, level crossings stay level."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# both Laufenburgerstrasse track bridges (OSM w35583301, w1496246793) exactly as the pipeline writes them
LAUFENBURGER = [[[1546.7, 633.0], [1580.3, 626.0]], [[1580.7, 619.1], [1547.5, 626.1]]]
CROSS = (1569.7, 625.0)
LEVEL = [(1857.6, 566.8), (1228.0, 564.0)]          # railway=level_crossing nodes 651841741 and near 1327351950
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


def served_world() -> str:
    """Before the #76 rebuild main's world has no railBridges: move the two known bridge pieces out of rail, as the pipeline does."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    if "railBridges" not in w:
        assert all(p in w["rail"] for p in LAUFENBURGER), "Laufenburgerstrasse bridge pieces not found in rail"
        w["rail"] = [p for p in w["rail"] if p not in LAUFENBURGER]
        w["railBridges"] = [{"pts": p, "layer": 1} for p in LAUFENBURGER]
    return json.dumps(w)


def run(server, script):
    body = served_world()
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=240000)
        page.wait_for_function("() => window.__mm && window.__mm.crossings && window.__mm.place", timeout=240000)
        page.click("#startbtn", timeout=180000)
        out = script(page)
        b.close()
    assert errors == [], errors
    return out


@needs_world
def test_laufenburgerstrasse_underpass(server):
    def script(page):
        r = {"xs": page.evaluate("() => window.__mm.crossings()")}
        page.evaluate(f"() => window.__mm.place({CROSS[0]}, 628.2)")
        page.wait_for_timeout(500)
        r["under"] = page.evaluate("() => window.__mm.car()")
        r["deck"] = page.evaluate("() => window.__mm.ground(1569.7, 628.2, 1e4)")
        r["on_deck"] = page.evaluate("() => window.__mm.sim(1552, 631.9, Math.atan2(-7, 33.6), 6, 2, [])")   # coast ~12 m: holding W runs off the 34 m deck
        r["drive"] = page.evaluate("() => window.__mm.sim(1565.5, 675, Math.atan2(619.9 - 675, 1569.8 - 1565.5), 12, 6)")
        r["level"] = page.evaluate(f"() => {json.dumps(LEVEL)}.map(([x, z]) => window.__mm.cutDepth(x, z))")
        r["hits"] = page.evaluate("() => [window.__mm.rayHits(1569.7, 645), window.__mm.rayHits(1569.7, 628.2)]")
        return r
    r = run(server, script)
    print(json.dumps(r, indent=1))
    here = [c for c in r["xs"] if math.hypot(c["x"] - CROSS[0], c["z"] - CROSS[1]) < 15]
    assert len(here) == 2 and all(c["road"] == "Laufenburgerstrasse" for c in here), here
    assert all(c["clearance"] >= 4.45 for c in here), here
    assert all(c["railGap"] < 0.3 for c in here), here
    assert not r["under"]["bridge"] and r["deck"] - r["under"]["y"] >= 1.2 + 4.45 - 0.05, (r["under"], r["deck"])
    assert r["on_deck"]["bridge"] and r["on_deck"]["y"] > r["deck"] - 1.0, r["on_deck"]
    assert r["drive"]["z"] < 600 and not r["drive"]["bridge"], r["drive"]              # drove under both decks
    assert r["level"] == [0, 0]
    assert not any(math.hypot(c["x"] - x, c["z"] - z) < 30 for c in r["xs"] for x, z in LEVEL)
    ramp, deck = r["hits"]
    assert ramp["roadOsm"] >= ramp["grass"] - 0.005, ramp                              # grass stays under the road in the cut
    assert deck["stone"] - deck["roadOsm"] >= 1.2 + 4.45 - 0.1, deck                   # the drawn deck clears the drawn road


@needs_world
def test_every_underpass_has_headroom(server):
    xs = run(server, lambda page: page.evaluate("() => window.__mm.crossings()"))
    print(json.dumps(xs, indent=1))
    assert len(xs) >= 2
    # #119: a cut capped by a junction or road-piece end keeps the side road connected and only has to let a car through
    bad = [c for c in xs if (c["clearance"] < (2.0 if c["capped"] else 4.45) and c["depth"] < 5.99) or c["railGap"] >= 0.3]
    assert not bad, bad
    print("capped:", [(c["road"], round(c["clearance"], 2), c["capped"]) for c in xs if c["capped"]])


@needs_world
def test_trough_walls(server):
    """#119: stone walls line the Laufenburgerstrasse cut on both sides; they stop a car in the trough and on the ground beside
    it, not one on the rail deck above; one run per side for the two decks; the road stays the top surface in the trough."""
    def script(page):
        ws = page.evaluate("() => window.__mm.walls()")
        near = [w for w in ws if math.hypot(w["x"] - CROSS[0], w["z"] - CROSS[1]) < 60]
        under = min((w for w in near if w["under"]), key=lambda w: math.hypot(w["x"] - CROSS[0], w["z"] - CROSS[1]))
        open_ = max((w for w in near if not w["under"]), key=lambda w: w["top"] - w["floor"])
        at = lambda w, d: (w["x"] - w["nx"] * d, w["z"] - w["nz"] * d)            # d m from the wall centre towards the road
        r = {"near": near}
        x, z = at(under, 1.5); r["trough"] = page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {under['floor'] + 0.1})")
        r["deck"] = page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {under['top'] + 1.2})")
        x, z = at(open_, -1.5); r["parapet"] = page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {open_['top'] - 0.9})")
        # across the road in the trough: x of the road centre from the drive line (1565.5, 675) -> (1569.8, 619.9)
        r["across"] = page.evaluate("""() => [-0.5, 0, 0.5].flatMap((f) => [640, 632, 625].map((z) => {
            const x = 1565.5 + (675 - z) * 4.3 / 55.1, h = window.__mm.rayHits(x + f * 4.5, z); return [h.grass, h.roadOsm]; }))""")
        return r
    r = run(server, script)
    near = r["near"]
    assert {w["side"] for w in near} == {-1, 1}, near
    assert any(w["under"] for w in near) and any(not w["under"] for w in near)
    for a in near:                                                                      # the two decks share one wall run per side
        assert not any(b is not a and b["side"] == a["side"] and math.hypot(b["x"] - a["x"], b["z"] - a["z"]) < 1.0 for b in near), a
    assert math.hypot(r["trough"]["dx"], r["trough"]["dz"]) > 0.01, r["trough"]           # the wall stops a car in the trough
    assert math.hypot(r["deck"]["dx"], r["deck"]["dz"]) < 0.01, r["deck"]                 # but not one on the deck above it
    assert math.hypot(r["parapet"]["dx"], r["parapet"]["dz"]) > 0.01, r["parapet"]       # the parapet stops a car beside the trough
    for grass, road in r["across"]:
        assert road is not None and (grass is None or grass <= road + 0.005), r["across"]
