"""#1044: roads under road bridges pass under them in a cut, like the rail underpasses."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
RUTI = [[-871.0, 1071.3], [-876.8, 1120.3], [-879.7, 1149.8]]        # w31970306 + w31970308
RUTI_DECKS = {51687867: (-873.4, 1091.4), 51688069: (-874.8, 1103.1)}
SEATS = {51687867: (21.50, 21.21), 51688069: (21.10, 21.49), 107186388: (55.59, 54.56), 107186377: (54.33, 56.11),
         4985551: (22.65, 23.75), 4988444: (21.93, 22.78), 25976772: (0.04, 0.04)}   # main, 2026-11-17
EXPECTED = 12
# capped even with the deck and its bank roads kept out of the network: dropped, the site stays as on main
DROPPED = {(345612508, 107186377): (3908.5, 4036.9), (345612508, 107186388): (3913.7, 4024.3),   # Gartenstrasse: footbridge w138786586 starts in the cut
           (1238831069, 1382546970): (1797.0, 1010.1),                                           # service road: dead end w925856926 in the cut
           (162941411, 162987100): (-1550.0, -324.2)}                                            # Lohgerbe: Werderstrasse meets its bank road's far end
NO_TERRAIN = {331388063: (-2882.8, -238.0), 319322059: (-3530.7, -1955.9)}   # lower road id -> crossing (Jurastrasse, Basler Strasse)
LOHGERBE = (-1550.0, -324.2)
LOHGERBE_DECK_END = (-1571.2, -345.1)
WERDER = (967940928, 153992480)   # Werderstrasse, at the far end of Lohgerbe's bank road w91453296
OFFSETS = list(range(-30, 31, 5))
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")


def run(server, script):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=240000)
        page.wait_for_function("() => window.__mm && window.__mm.crossings && window.__mm.place", timeout=240000)
        page.click("#startbtn", timeout=180000)
        out = script(page)
        b.close()
    assert errors == [], errors
    return out


def near(c, p, d=2.0):
    return math.hypot(c["x"] - p[0], c["z"] - p[1]) < d


def seg_dist(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / ((dx * dx + dz * dz) or 1)))
    return math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)


def lower_road(road_id, p):
    """The piece of the world file's road road_id that passes nearest to p."""
    roads = [r for r in json.loads(WORLD.read_text(encoding="utf-8"))["roads"] if r["id"] == road_id]
    return min(roads, key=lambda r: min(seg_dist(*p, a, b) for a, b in zip(r["pts"], r["pts"][1:])))["pts"]


def along(pts, p, offsets):
    """Points offsets m along pts from its nearest point to p (clamped to the polyline)."""
    segs, s0, best, acc = list(zip(pts, pts[1:])), 0.0, math.inf, 0.0
    for a, b in segs:
        L = math.hypot(b[0] - a[0], b[1] - a[1]); d = seg_dist(*p, a, b)
        if d < best:
            t = max(0.0, min(1.0, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L or 1)))
            best, s0 = d, acc + t * L
        acc += L
    out, total = [], acc
    for o in offsets:
        s, acc = max(0.0, min(total, s0 + o)), 0.0
        for a, b in segs:
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if acc + L >= s or (a, b) == segs[-1]:
                t = (s - acc) / (L or 1); out.append([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); break
            acc += L
    return out


def ruti_at(z):
    """x on RUTI at z (RUTI runs monotonically in z; extrapolated along the end segments)."""
    for a, b in zip(RUTI, RUTI[1:]):
        if z <= b[1] or b == RUTI[-1]:
            return a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0])


@needs_world
def test_every_road_underpass_has_headroom(server):
    xs = run(server, lambda page: page.evaluate("() => window.__mm.roadCrossings()"))
    print(json.dumps(xs, indent=1))
    cut = [c for c in xs if c["depth"] > 0]
    assert len(cut) == EXPECTED, [(c["roadId"], c["deckId"], c["x"], c["z"]) for c in cut]
    assert not [c for c in cut if c["clearance"] < 4.45 and c["depth"] < 5.99], cut
    assert not [c for c in cut if c["water"] is not None], cut   # the water bound raised only Lohgerbe, which is dropped
    assert not [c for c in xs if c["capped"]], [(c["roadId"], c["x"], c["z"], c["capped"]) for c in xs if c["capped"]]
    assert not [c for c in xs if c["unsettled"]], [(c["roadId"], c["x"], c["z"]) for c in xs if c["unsettled"]]
    assert not [c for c in xs if c["guardDepth"] > 0.05], [(c["deckId"], c["guardDepth"]) for c in xs if c["guardDepth"] > 0.05]
    assert not [c for c in xs if c["depth"] == 0 and c["clearance"] < 4.45], [c for c in xs if c["depth"] == 0]


@needs_world
def test_capped_crossings_are_dropped(server):
    def script(page):
        return {"xs": page.evaluate("() => window.__mm.roadCrossings()"),
                "cd": page.evaluate("(ps) => ps.map(([x, z]) => window.__mm.cutDepth(x, z))", list(DROPPED.values()))}
    r = run(server, script)
    print(r["cd"])
    for p, cd in zip(DROPPED.values(), r["cd"]):
        assert not [c for c in r["xs"] if near(c, p) and c["depth"] > 0], p
        assert cd == 0, (p, cd)


@needs_world
def test_no_cut_where_the_terrain_has_no_data(server):
    probes = {rid: along(lower_road(rid, p), p, OFFSETS) for rid, p in NO_TERRAIN.items()}

    def script(page):
        return {"xs": page.evaluate("() => window.__mm.roadCrossings()"), "walls": page.evaluate("() => window.__mm.roadWalls()"),
                "probes": {rid: page.evaluate("(ps) => ps.map(([x, z]) => [x, z, window.__mm.cutDepth(x, z), window.__mm.ground(x, z, -1e4)])", ps)
                           for rid, ps in probes.items()}}
    r = run(server, script)
    print(json.dumps(r["probes"], indent=1))
    for rid, p in NO_TERRAIN.items():
        assert not [c for c in r["xs"] if near(c, p)], (rid, [c for c in r["xs"] if near(c, p)])
        assert not [q for q in r["probes"][rid] if q[2] != 0], (rid, r["probes"][rid])
        bad = [q for o, q in zip(OFFSETS, r["probes"][rid]) if abs(o) <= 15 and abs(q[3] - 0.04) > 0.02]   # past 15 m Jurastrasse reaches measured terrain
        assert not bad, (rid, bad)
        assert not [w for w in r["walls"] if math.hypot(w["x"] - p[0], w["z"] - p[1]) < 30], rid


@needs_world
def test_lohgerbe_stays_as_it_was(server):
    """Lowering Lohgerbe would take Werderstrasse down with it, and with it the deck's bank road and seat: no cut, the site as on main."""
    werder = [q for r in json.loads(WORLD.read_text(encoding="utf-8"))["roads"] if r["id"] in WERDER
              for q in along(r["pts"], r["pts"][0], range(0, 400)) if math.hypot(q[0] - LOHGERBE_DECK_END[0], q[1] - LOHGERBE_DECK_END[1]) <= 40]

    def script(page):
        return {"xs": page.evaluate("() => window.__mm.roadCrossings()"), "seats": page.evaluate("() => window.__mm.genericBridges()"),
                "here": page.evaluate(f"() => window.__mm.cutDepth({LOHGERBE[0]}, {LOHGERBE[1]})"),
                "werder": page.evaluate("(ps) => ps.map(([x, z]) => window.__mm.cutDepth(x, z))", werder)}
    r = run(server, script)
    assert len(werder) > 20, len(werder)
    assert not [c for c in r["xs"] if near(c, LOHGERBE)], [c for c in r["xs"] if near(c, LOHGERBE)]
    assert r["here"] == 0, r["here"]
    assert max(r["werder"]) == 0, max(r["werder"])
    seats = {b["id"]: (b["h0"], b["h1"]) for b in r["seats"] if b["id"] in SEATS}
    print("seats:", seats)
    assert set(seats) == set(SEATS), seats
    bad = {i: (seats[i], SEATS[i]) for i in SEATS if abs(seats[i][0] - SEATS[i][0]) > 0.1 or abs(seats[i][1] - SEATS[i][1]) > 0.1}
    assert not bad, bad


@needs_world
def test_rutistrasse_stays_level_under_the_a3(server):
    profile = [[ruti_at(z), z] for z in range(1060, 1141)]

    def script(page):
        xs = page.evaluate("() => window.__mm.roadCrossings()")
        here = {d: [c for c in xs if c["deckId"] == d and near(c, p)] for d, p in RUTI_DECKS.items()}
        roads = {d: [page.evaluate(f"() => window.__mm.ground({c['x']}, {c['z']}, {c['deck']} - 2)") for c in cs] for d, cs in here.items()}
        prof = page.evaluate("(ps) => ps.map(([x, z]) => window.__mm.ground(x, z, 18))", profile)
        drive = [page.evaluate("() => window.__mm.sim(-871.3, 1074, Math.atan2(49, -5.8), 13.9, 0.25)")]
        for _ in range(23):
            drive.append(page.evaluate("() => window.__mm.step(0.25)"))
        return {"here": here, "roads": roads, "prof": prof, "drive": drive}
    r = run(server, script)
    print(json.dumps({"here": r["here"], "roads": r["roads"]}, indent=1))
    print("profile:", [round(h, 2) for h in r["prof"]])
    print("drive:", [(round(d["z"], 1), round(d["y"], 2), d["bridge"]) for d in r["drive"]])
    for d in RUTI_DECKS:
        here, roads = r["here"][d], r["roads"][d]
        assert len(here) == 1, (d, here)
        assert here[0]["clearance"] >= 4.45, here
        assert abs(roads[0] - 16.0) <= 0.5, (d, roads)
    assert max(r["prof"]) <= 17.0, max(r["prof"])
    steps = [abs(b - a) for a, b in zip(r["prof"], r["prof"][1:])]
    assert max(steps) <= 0.3, max(steps)
    assert r["drive"][-1]["z"] >= 1135, r["drive"][-1]
    assert max(d["y"] for d in r["drive"] if d["z"] <= 1140) <= 17.5, r["drive"]   # past z 1140 the road climbs the natural hill
    assert not any(d["bridge"] for d in r["drive"]), r["drive"]
