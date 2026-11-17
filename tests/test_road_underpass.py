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
        return {"xs": page.evaluate("() => window.__mm.roadCrossings()"),
                "here": page.evaluate(f"() => window.__mm.cutDepth({LOHGERBE[0]}, {LOHGERBE[1]})"),
                "werder": page.evaluate("(ps) => ps.map(([x, z]) => window.__mm.cutDepth(x, z))", werder)}
    r = run(server, script)
    assert len(werder) > 20, len(werder)
    assert not [c for c in r["xs"] if near(c, LOHGERBE)], [c for c in r["xs"] if near(c, LOHGERBE)]
    assert r["here"] == 0, r["here"]
    assert max(r["werder"]) == 0, max(r["werder"])


@needs_world
def test_deck_seats_stay(server):
    """The bank roads keep their ground, so the second seat pass seats every baseline deck as on main."""
    gb = run(server, lambda page: page.evaluate("() => window.__mm.genericBridges()"))
    seats = {b["id"]: (b["h0"], b["h1"]) for b in gb if b["id"] in SEATS}
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


def guard_road_ids(world, deck_ids):
    """Per deck id, the ids of the ground roads that end on that deck's ends (world.js deckGuards)."""
    decks = {r["id"]: r["pts"] for r in world["roads"] if r.get("bridge") and r["id"] in deck_ids}
    out = {}
    for d, pts in decks.items():
        ends = [pts[0], pts[-1]]
        out[d] = {r["id"] for r in world["roads"] if not r.get("bridge")
                  and any(math.hypot(p[0] - e[0], p[1] - e[1]) <= 0.5 for p in (r["pts"][0], r["pts"][-1]) for e in ends)}
    return out


@needs_world
def test_rutistrasse_portal(server):
    """Under the A3 the Rütistrasse runs between trough walls on both sides, under a solid deck box that clears the road;
    the walls stop a car in the trough, not one on the deck. No road-cut wall stands in a road that is not its deck's bank road."""
    world = json.loads(WORLD.read_text(encoding="utf-8"))

    def script(page):
        xs = page.evaluate("() => window.__mm.roadCrossings()")
        walls = page.evaluate("() => window.__mm.roadWalls()")
        out = {"xs": xs, "walls": walls, "sites": {}}
        for d, p in RUTI_DECKS.items():
            c = next(c for c in xs if c["deckId"] == d and near(c, p))
            deck = page.evaluate(f"() => window.__mm.ground({c['x']}, {c['z']}, 1e4)")
            top = page.evaluate(f"() => window.__mm.rayHits({c['x']}, {c['z']})")
            low = page.evaluate(f"() => window.__mm.rayHits({c['x']}, {c['z']}, {deck - 1.3})")
            here = [w for w in walls if math.hypot(w["x"] - c["x"], w["z"] - c["z"]) < 8]
            pushes = []
            for w in (w for w in here if w["under"]):
                x, z = w["x"] - w["nx"] * 1.5, w["z"] - w["nz"] * 1.5
                pushes.append({"side": w["side"], "trough": page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {w['floor'] + 0.1})"),
                               "deck": page.evaluate(f"() => window.__mm.pushAt({x}, {z}, {w['top'] + 1.2})")})
            out["sites"][d] = {"deck": deck, "top": top, "low": low, "here": here, "pushes": pushes}
        return out
    r = run(server, script)
    for d, s in r["sites"].items():
        print(d, "deck", round(s["deck"], 2), "stone", s["top"].get("stone"), "road", s["low"].get("roadOsm"), "walls", len(s["here"]))
        assert s["top"]["stone"] is not None and s["low"]["roadOsm"] is not None, (d, s["top"], s["low"])
        assert s["top"]["stone"] - s["low"]["roadOsm"] >= 1.2 + 4.45 - 0.1, (d, s["top"], s["low"])   # the drawn deck box clears the drawn road
        assert {w["side"] for w in s["here"] if w["under"]} == {-1, 1}, (d, s["here"])
        for p in s["pushes"]:
            assert math.hypot(p["trough"]["dx"], p["trough"]["dz"]) > 0.01, (d, p)                    # the wall stops a car in the trough
            assert math.hypot(p["deck"]["dx"], p["deck"]["dz"]) < 0.01, (d, p)                        # but not one on the deck above it
    # no road-cut wall piece (both ends) in the corridor of a ground road other than its own and its decks' bank roads
    cut_decks = {c["deckId"] for c in r["xs"] if c["depth"] > 0}
    guards = guard_road_ids(world, cut_decks)
    deck_pts = {r_["id"]: r_["pts"] for r_ in world["roads"] if r_.get("bridge") and r_["id"] in cut_decks}
    assert r["walls"], "no road-cut walls"
    for w in r["walls"]:
        allowed = {g for d, pts in deck_pts.items() if dseg(w["x"], w["z"], pts) < 40 for g in guards[d]}
        ends = [(w["x"] + k * math.cos(w["rot"]) * w["len"] / 2, w["z"] + k * math.sin(w["rot"]) * w["len"] / 2) for k in (-1, 1)]
        for k, rd in enumerate(world["roads"]):
            if rd.get("bridge") or k == w["road"] or rd["id"] in allowed:
                continue
            for ex, ez in ends:
                assert dseg(ex, ez, rd["pts"]) >= rd["w"] / 2 + 1.0, (rd["id"], rd.get("n"), round(dseg(ex, ez, rd["pts"]) - rd["w"] / 2, 3), w)


def dseg(x, z, pts):
    best = math.inf
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        vx, vz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / ((vx * vx + vz * vz) or 1e-9)))
        best = min(best, math.hypot(x - ax - t * vx, z - az - t * vz))
    return best


@needs_world
def test_no_ground_spikes_under_road_decks(server):
    """At every road underpass the cut floor is level across the corridor out to the wall face (hw + margin): the band between
    the road edge and the wall foot lies at the road -- no disc or kept bank ground standing up beside it under the deck."""
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    widths = {r["id"]: r["w"] for r in world["roads"]}

    def script(page):
        xs = [c for c in page.evaluate("() => window.__mm.roadCrossings()") if c["depth"] > 0]
        probes = []
        for c in xs:
            p, hw, reach = (c["x"], c["z"]), widths[c["roadId"]] / 2, widths[c["deckId"]] / 2 + 2
            pts = lower_road(c["roadId"], p)
            for s in [k * 0.5 for k in range(-int(reach * 2), int(reach * 2) + 1)]:   # under the deck and 2 m past it, every 0.5 m
                (cx, cz), (ax, az) = along(pts, p, [s, s + 0.5])
                l = math.hypot(ax - cx, az - cz) or 1
                nx, nz = -(az - cz) / l, (ax - cx) / l
                for side in (-1, 1):
                    for o in (0.25, 0.5, 0.75):                        # road edge .. wall face (margin 1 m)
                        probes.append([c["roadId"], c["deckId"], s, side, o, cx, cz, cx + nx * side * (hw + o), cz + nz * side * (hw + o), c["deck"]])
        return page.evaluate("""(ps) => ps.map(([rid, d, s, side, o, cx, cz, x, z, deck]) => {
            const road = window.__mm.ground(cx, cz, deck - 3); return [rid, d, s, side, o, road, window.__mm.ground(x, z, road + 1), +x.toFixed(2), +z.toFixed(2)]; })""", probes)
    r = run(server, script)
    # o 0.25 (what the wheels touch): the level floor, road + 0.3 at every crossing. o 0.5 / 0.75 (towards the wall foot, which
    # troughPiece samples at 0.75): the cut lowers patch vertices only out to lat = hw + margin + wall - PATCH_BLEED (1.59 m past
    # the road edge, #156), so a mesh point just past it keeps the bank's height and its 1 m triangles slope it inward, up to
    # PATCH_BLEED. Every rail underpass shares this; bound = the worst rail value of this same probe (every __mm.crossings()
    # record with depth > 0, its rail deck and lower road, 2026-11-17) rounded up to 0.1 m:
    # 0.5: 0.854 (Königsweg, 4612.6 / 5567.8), 0.75: 1.434 (Hauptstrasse, 2389.9 / 2653.5). The road worst at 0.75, Fricktalstraße /
    # Mumpferfährstraße (-2249.3 / 77.8, +1.451), is the same mesh limit in a deeper cut.
    BOUND = {0.25: 0.3, 0.5: 0.9, 0.75: 1.5}
    bad = [q for q in r if q[6] > q[5] + BOUND[q[4]]]
    worst = {}
    for q in r:
        k = (q[0], q[1])
        if k not in worst or q[6] - q[5] > worst[k][6] - worst[k][5]:
            worst[k] = q
    print(len(r), "probes; worst per crossing:", json.dumps(list(worst.values())))
    assert len(worst) == EXPECTED, sorted(worst)
    assert not bad, (len(bad), bad[:10])


def nearest_on(pts, x, z):
    """(distance, arc length, point) of the nearest point on pts to (x, z)."""
    best, acc = (math.inf, 0.0, pts[0]), 0.0
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); t = max(0.0, min(1.0, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (L * L or 1)))
        q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])); d = math.hypot(x - q[0], z - q[1])
        if d < best[0]:
            best = (d, acc + t * L, q)
        acc += L
    return best


def through(pts, x, z):
    """pts, run on through (x, z) when that is one of its ends: joined with the world road that continues most nearly straight."""
    roads = [r["pts"] for r in json.loads(WORLD.read_text(encoding="utf-8"))["roads"] if not r.get("bridge")]
    for flip in (False, True):
        p = pts[::-1] if flip else pts
        if math.hypot(p[0][0] - x, p[0][1] - z) > 0.5:
            continue
        ux, uz = p[1][0] - p[0][0], p[1][1] - p[0][1]
        best = None
        for q in roads:
            for qq in (q, q[::-1]):
                if math.hypot(qq[-1][0] - x, qq[-1][1] - z) <= 0.5 and qq != p[::-1] and len(qq) > 1:
                    vx, vz = qq[-1][0] - qq[-2][0], qq[-1][1] - qq[-2][1]
                    c = (ux * vx + uz * vz) / ((math.hypot(ux, uz) * math.hypot(vx, vz)) or 1)
                    if best is None or c > best[0]:
                        best = (c, qq)
        return (best[1] + p[1:]) if best else p
    return pts


@needs_world
def test_junctions_in_a_road_underpass_follow_the_floor(server):
    """A junction disc or road end cap on a road-cut arm's lowered road lies on the cut floor: at its centre and around it
    (0.8 x radius) no higher than the arm's floor at its centre line there + 0.3, and a car driving through it at 50 km/h neither tips nor brakes."""
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    discs = [(x, z, r) for x, z, r in world["junctions"]]
    discs += [(p[0], p[1], r["w"] / 2 + 0.3) for r in world["roads"] if not r.get("bridge") for p in (r["pts"][0], r["pts"][-1])]

    def script(page):
        arms = page.evaluate("() => window.__mm.roadArms()")
        found, out = [], {"points": [], "drives": []}
        for k, a in enumerate(arms):
            a["k"] = k
        for x, z, rad in discs:
            for a in arms:
                d, t, _ = nearest_on(a["pts"], x, z)
                if d <= a["hw"] and a["span"][0] <= t <= a["span"][1] and (x, z) not in [(f[0], f[1]) for f in found]:
                    found.append((x, z, rad, a))
        for x, z, rad, a in found:
            ps = [(x, z)] + [(x + 0.8 * rad * math.cos(k * math.pi / 3), z + 0.8 * rad * math.sin(k * math.pi / 3)) for k in range(6)]
            for px, pz in ps:
                # the cut road surface there: the floor, at its centre line, of the road-cut arm whose road passes nearest to the point
                # (around a junction the point can lie on the joining road, which climbs away from the junction on its own arm)
                near = min(arms, key=lambda b: nearest_on(b["pts"], px, pz)[0])
                _, _, q = nearest_on(near["pts"], px, pz)
                floor = page.evaluate(f"() => window.__mm.roadArmFloor({near['k']}, {q[0]}, {q[1]})")
                if floor is None:
                    continue
                g = page.evaluate(f"() => window.__mm.ground({px}, {pz}, {floor + 3})")
                out["points"].append([a["road"], round(x, 1), round(z, 1), round(px, 2), round(pz, 2), floor, g])
            route = through(a["pts"], x, z)
            (sx, sz), (ex, ez) = along(route, (x, z), [-30, 30])                  # 30 m before the junction to 30 m after, on the chord
            th = math.atan2(ez - sz, ex - sx)
            y0 = page.evaluate(f"() => {{ const f = window.__mm.roadArmFloor({a['k']}, {sx}, {sz}); return window.__mm.ground({sx}, {sz}, f === null ? 1e4 : f + 3); }}")
            dmg0 = page.evaluate(f"() => {{ window.__mm.setDamage(0); window.__mm.sim({sx}, {sz}, {th}, 13.9, 0.25, ['KeyW'], {y0}); return window.__mm.damage().dmg; }}")
            steps = []
            while len(steps) < 40 and (not steps or math.hypot(steps[-1]["x"] - sx, steps[-1]["z"] - sz) < 60):   # 30 m before to 30 m after
                s = page.evaluate("() => ({ ...window.__mm.step(0.25), pose: window.__mm.carPose().rot, dmg: window.__mm.damage().dmg })")
                steps.append(s)
            out["drives"].append({"road": a["road"], "at": [round(x, 1), round(z, 1)], "from": [sx, sz, th, y0], "dmg0": dmg0, "steps": steps})
        out["n"] = len(found)
        return out
    r = run(server, script)
    print("discs on lowered arms:", r["n"])
    bad = [p for p in r["points"] if p[6] > p[5] + 0.3]
    print("worst points:", sorted(r["points"], key=lambda p: p[5] - p[6])[:5])
    assert r["n"] > 0
    assert not bad, (len(bad), bad[:10])
    for dv in r["drives"]:
        st = [s for s in dv["steps"] if math.hypot(s["x"] - dv["at"][0], s["z"] - dv["at"][1]) <= 30]   # the junction's +-30 m
        assert len(st) >= 6, dv
        sp = [s["speed"] for s in st]
        print(dv["road"], dv["at"], dv["from"], "speed", [round(v, 1) for v in sp], "roll/pitch max", round(max(max(abs(s["pose"][0]), abs(s["pose"][2])) for s in st), 3), "dmg", st[-1]["dmg"])
        assert all(b >= a - 2.5 for a, b in zip(sp, sp[1:])), dv
        assert max(max(abs(s["pose"][0]), abs(s["pose"][2])) for s in st) < 0.2, dv
        assert st[-1]["dmg"] <= dv["dmg0"], dv
