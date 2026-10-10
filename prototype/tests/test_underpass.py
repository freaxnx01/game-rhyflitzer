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
# a skewed deck (Hauptstrasse Stein, sin ~0.55) and one capped by a side road (Kapfstrasse / Bahnhofstrasse), as in main's rail
HAUPTSTRASSE_STEIN = [[[-198.0, 1090.1], [-212.2, 1088.3], [-230.1, 1086.6]], [[-195.4, 1094.2], [-210.8, 1092.2], [-227.0, 1090.7]]]
KAPFSTRASSE = [[[-4037.9, 541.8], [-4023.8, 550.2]], [[-4025.0, 554.1], [-4040.0, 544.9]]]
LEVEL = [(1857.6, 566.8)]          # railway=level_crossing node 651841741
# (1228, 564), the DSM crossing, is in the Südspange cutting since #42: its tracks are on a deck
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


def served_world() -> str:
    """Before the #76 rebuild main's world has no railBridges: move the two known bridge pieces out of rail, as the pipeline does."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    if "railBridges" not in w:
        assert all(p in w["rail"] for p in LAUFENBURGER), "Laufenburgerstrasse bridge pieces not found in rail"
        w["rail"] = [p for p in w["rail"] if p not in LAUFENBURGER]
        w["railBridges"] = [{"pts": p, "layer": 1} for p in LAUFENBURGER]
    return json.dumps(w)


def run(server, script, body=None):
    body = body or served_world()
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
    assert r["level"] == [0]
    assert not any(math.hypot(c["x"] - x, c["z"] - z) < 30 for c in r["xs"] for x, z in LEVEL)
    ramp, deck = r["hits"]
    assert ramp["roadOsm"] >= ramp["grass"] - 0.005, ramp                              # grass stays under the road in the cut
    assert deck["stone"] - deck["roadOsm"] >= 1.2 + 4.45 - 0.1, deck                   # the drawn deck clears the drawn road


@needs_world
def test_every_underpass_has_headroom(server):
    xs = run(server, lambda page: page.evaluate("() => window.__mm.crossings()"))
    print(json.dumps(xs, indent=1))
    assert len(xs) >= 2
    # #120: side roads descend with the cut, so nothing caps it any more and every underpass has the full headroom
    bad = [c for c in xs if (c["clearance"] < 4.45 and c["depth"] < 5.99) or c["railGap"] >= 0.3]
    assert not bad, bad
    assert not [c for c in xs if c["capped"]], [(c["road"], c["capped"]) for c in xs if c["capped"]]
    assert not [c for c in xs if c["unsettled"]], [(c["road"], c["x"], c["z"]) for c in xs if c["unsettled"]]   # review of #156
    print("arms:", [(c["road"], c["arms"]) for c in xs])


# #119 capped these; with #120 their side roads descend instead (crossing positions on the rebuilt world)
FORMER_CAPS = {"Kapfstrasse": (-4032, 548), "unnamed road by Bahndammstrasse": (-886, 1207),
               "Hauptstrasse Stein": (-212, 1090), "Laufenburgerstrasse north": (1571, 1811)}


@needs_world
def test_side_roads_descend_with_the_cut(server):
    """#120: at the four places #119 capped, the side roads joining inside the cut descend with it. Every arm starts at the
    floor of the road it leaves, climbs without a step and meets the ground where it ends; a car drives up out of one."""
    def script(page):
        arms = page.evaluate("() => window.__mm.arms()")
        rohrmatt = [(a, k) for a in arms if a["road"] == "Rohrmatt" for k in (0, 1)]
        assert rohrmatt, f"no Rohrmatt arm in the rebuilt world: {sorted({a['road'] for a in arms})}"
        a, k = max(rohrmatt, key=lambda p: p[0]["reach"][p[1]])
        prof = a["sides"][k]; (x0, z0), (x1, z1) = prof[0][3:5], prof[min(5, len(prof) - 1)][3:5]
        drive = page.evaluate(f"() => window.__mm.sim({x0}, {z0}, {math.atan2(z1 - z0, x1 - x0)}, 6, 4)")
        return {"arms": arms, "drive": drive, "from": [x0, z0]}
    r = run(server, script)
    arms = r["arms"]
    print(json.dumps([(a["road"], a["crossing"], round(a["f0"], 2), a["grade"], a["reach"], a["stop"]) for a in arms]))
    for name, (x, z) in FORMER_CAPS.items():
        assert any(math.hypot(a["crossing"][0] - x, a["crossing"][1] - z) < 15 for a in arms), name
    for a in arms:
        for k, prof in enumerate(a["sides"]):
            assert prof[0][1] <= a["f0"] + 0.2, (a["road"], prof[0])                        # starts at the floor it leaves
            for p, q in zip(prof, prof[1:]):
                assert abs(q[1] - p[1]) <= 0.3, (a["road"], p, q)                           # no step along the arm
            if a["stop"][k] == "ground":
                assert prof[-1][5] >= prof[-1][2] - 0.3, (a["road"], prof[-1])             # its own floor has climbed out to the ground by its end
    d = r["drive"]
    assert math.hypot(d["x"] - r["from"][0], d["z"] - r["from"][1]) >= 15 and d["speed"] > 2, d   # up and out of the trough


@needs_world
def test_arms_out_of_budget_run_out_to_the_ground(server):
    """Review of #156: an arm that ends on its budget is still below the ground there. Past its end the road must not step
    back up to the uncut ground: the cut's depth (uncut mesh - terrain) shrinks by at most 0.3 m per metre and is gone
    within 30 m. Measured on the depth, not the height, so a road that climbs steeply on its own is not blamed on the cut."""
    arms = run(server, lambda page: page.evaluate("() => window.__mm.arms()"))
    budget = [(a, k) for a in arms for k in (0, 1) if a["stop"][k] == "budget"]
    print(json.dumps([(a["road"], a["crossing"], a["reach"][k], [[s, round(m - t, 2)] for s, t, m in a["past"][k]]) for a, k in budget]))
    assert budget, "no arm ends on its budget any more: the case this test guards is gone from the world"
    for a, k in budget:
        past = a["past"][k]
        assert past[-1][0] > a["reach"][k] + 5, (a["road"], a["reach"][k], past[-1])            # the road goes on past the end
        for (s0, t0, m0), (s1, t1, m1) in zip(past, past[1:]):
            assert abs((m1 - t1) - (m0 - t0)) <= 0.3 * (s1 - s0) + 1e-6, (a["road"], a["crossing"], s0, m0 - t0, s1, m1 - t1)
        assert past[-1][2] - past[-1][1] <= 0.05, (a["road"], a["crossing"], past[-1])              # back on the ground


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


def dseg(x, z, pts):
    best = math.inf
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        vx, vz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / ((vx * vx + vz * vz) or 1e-9)))
        best = min(best, math.hypot(x - ax - t * vx, z - az - t * vz))
    return best


@needs_world
def test_walls_follow_skewed_decks_and_leave_side_roads_open(server):
    """#119, review of #121: a wall piece is under a deck where the deck itself passes over it, not where the road's centre
    line is under the deck -- at a skewed crossing the two are metres apart. Under a deck the wall stops at the deck's
    underside and a car on the deck drives over it; beside a deck it carries the parapet. No wall stands in a side road."""
    w = json.loads(served_world())
    extra = HAUPTSTRASSE_STEIN + KAPFSTRASSE
    if any(p in w["rail"] for p in extra):                                               # main's world before the #119 rebuild
        assert all(p in w["rail"] for p in extra), "Hauptstrasse Stein / Kapfstrasse bridge pieces not found in rail"
        w["rail"] = [p for p in w["rail"] if p not in extra]
        w["railBridges"] += [{"pts": p, "layer": 1} for p in extra]
    decks = [b["pts"] for b in w["railBridges"]]
    # per wall piece: the deck surface right above it, and a car on the track (the deck's centre line) above the piece
    ws = run(server, lambda page: page.evaluate("""(decks) => window.__mm.walls().map((w) => {
        let best = null; for (const pts of decks) for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((w.x - ax) * vx + (w.z - az) * vz) / (vx * vx + vz * vz)));
          const x = ax + vx * t, z = az + vz * t, d = Math.hypot(w.x - x, w.z - z); if (!best || d < best.d) best = { d, x, z }; }
        const g = window.__mm.ground(w.x, w.z, 1e4), gt = window.__mm.ground(best.x, best.z, 1e4);
        return { ...w, deckTop: g, pushDeck: w.under ? window.__mm.pushAt(best.x, best.z, gt + 0.1) : null }; })""", decks), json.dumps(w))
    haupt = [x for x in ws if math.hypot(x["x"] + 212, x["z"] - 1090) < 30]
    assert {x["side"] for x in haupt if x["under"]} == {-1, 1}, haupt                    # the skewed deck has walls under it on both sides
    for x in ws:
        d = min(dseg(x["x"], x["z"], p) for p in decks)
        if d <= 2.75:                                                                   # the deck surface is right above the piece
            assert x["under"], (d, x)
            assert x["top"] <= x["deckTop"] - 0.25, (d, x)                                # stays under the deck surface (at a deck end the ground behind may top the underside)
            assert math.hypot(x["pushDeck"]["dx"], x["pushDeck"]["dz"]) < 0.01, (d, x)   # a car on the track passes over it
        elif d >= 2.75 + 1.5:
            assert not x["under"], (d, x)
        for r in w["roads"]:
            assert dseg(x["x"], x["z"], r["pts"]) >= r["w"] / 2 + 1.0, (r["n"], x)        # no wall in a road's corridor
        # review of #156: the whole piece, ends included, keeps 0.25 m of slack to that bound for every other road (walls are
        # trimmed there on a 0.25 m sampling, so a trim threshold equal to the asserted bound leaves pieces sitting right on it)
        ends = [(x["x"] + k * math.cos(x["rot"]) * x["len"] / 2, x["z"] + k * math.sin(x["rot"]) * x["len"] / 2) for k in (-1, 1)]
        for r in (r for k, r in enumerate(w["roads"]) if k != x["road"]):            # road = its index in the world
            for ex, ez in ends:
                assert dseg(ex, ez, r["pts"]) >= r["w"] / 2 + 1.0 + 0.25, (r["n"], round(dseg(ex, ez, r["pts"]) - r["w"] / 2, 3), x)


@needs_world
def test_no_open_cut_faces(server):
    """#120: wherever a cut network lowers the ground by more than 0.3 m outside every road corridor, a trough wall stands
    -- along the side roads and at the corners where they leave the cut road's trough.

    One kind of point is not counted (world.js sharedTrough, unit-tested on its own): a point whose two nearest road
    corridors face each other across it with their edges less than margin + wall + margin (4 m) apart. The issue's other
    rule -- no wall in any road's corridor -- makes a wall impossible there: the two roads share one trough and there is no
    bank between them to retain. In the world this is the ~30 m where Bahndammstrasse and the service road beside it run
    1.85-2.84 m apart (64 points; PR #156 comment "Status: test_side_roads_descend_with_the_cut green", option (a), chosen
    by the user). Junction corners do not qualify (their roads meet, they do not face each other); nothing else is relaxed."""
    r = run(server, lambda page: page.evaluate("() => window.__mm.openCutFaces()"))
    print(json.dumps({k: v for k, v in r.items() if k != "troughPts"}))
    assert r["checked"] > 0, r
    assert r["count"] == 0, r
