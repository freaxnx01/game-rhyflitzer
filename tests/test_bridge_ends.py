"""#227: generic bridge ends meet their banks -- no launch off the Sägeweg bridge over the Sissle (w80728459).
Measured terrain only. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

DATA = Path(__file__).parents[1] / "data"
pytestmark = pytest.mark.skipif(not ((DATA / "world_hochrhein.json").exists() and (DATA / "terrain_hochrhein.mmh").exists()),
                                reason="run pipeline/osm.py build and terrain.py first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# Sägeweg centre line: w700036726 (west) -> bridge w80728459 -> w80728460 -> w1532972168 (east)
LINE = [(1756.8, 1165.2), (1805.9, 1160.0), (1825.8, 1155.0), (1852.1, 1148.3), (1865.7, 1144.9), (1870.5, 1143.8), (1885.6, 1142.9)]
WEST_END, EAST_END = (1825.8, 1155.0), (1852.1, 1148.3)
# `__mm.sim` holds one heading, so a drive is a straight chord. The 61.7 m from the bend at (1805.9, 1160.0) to (1865.7, 1144.9) is
# straight within 3 cm and holds both deck ends, so a car driven along it stays on the carriageway. The chords from the issue's own
# start points (1885.6, 1142.9) / (1756.8, 1165.2) run up to 3.5 m off it, over bare field: they hit a pre-existing 0.40 m step at
# (1821.3, 1153.8), where the approach road's drawn ribbon ends 0.40 m above the terrain under it. Measured 2026-10-16, that sample is
# 25.9097 on this branch and 25.9097 on main -- a road-drape step, not a bridge end, and the one that still launched the car there.
STRAIGHT = (LINE[1], LINE[4])
ON_ROAD = 1.5                                 # m off the centre line: half a 3 m carriageway


def resample(pts, step=1.0):
    out = []
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, z1 - z0) / step))
        out += [(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n) for i in range(n)]
    return out + [pts[-1]]


@pytest.fixture(scope="module")
def page(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={"width": 320, "height": 180})
        pg.goto(f"{server}/index.html")
        pg.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        pg.wait_for_selector("#mmhstatus.real", timeout=240000)
        yield pg
        b.close()


def profile(page, pts):
    return page.evaluate(f"() => {json.dumps(pts)}.map(([x, z]) => window.__mm.ground(x, z, 1e4))")


def drive(page, x, z, th, secs, v):
    js = (f"() => [...Array({round(secs * 10)}).keys()].map(k => {{ const r = window.__mm.sim({x}, {z}, {th}, {v}, (k + 1) / 10); "
          f"const c = window.__mm.car(); return {{ ...r, ground: c.ground }}; }})")
    return page.evaluate(js)


def near_bridge(pts):
    return [p for p in pts if min(math.dist(p, WEST_END), math.dist(p, EAST_END)) <= 10 or WEST_END[0] <= p[0] <= EAST_END[0]]


def test_saegeweg_ground_has_no_step_at_the_deck_ends(page):
    g = profile(page, near_bridge(resample(LINE)))
    rises = [abs(b - a) for a, b in zip(g, g[1:])]
    worst = max(range(len(rises)), key=rises.__getitem__)
    assert rises[worst] <= 0.35, (worst, g[max(0, worst - 4):worst + 5])     # 2026-10-15: 0.82 (west) and 1.04 (east) in one metre


def off_road(x, z):
    """metres from the Sägeweg centre line"""
    def seg(a, b):
        dx, dz = b[0] - a[0], b[1] - a[1]
        t = max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
        return math.dist((x, z), (a[0] + dx * t, a[1] + dz * t))
    return min(seg(a, b) for a, b in zip(LINE, LINE[1:]))


def saegeweg_span(page):
    """x from the west deck end to the east one, each pushed out by that end's fill run: the ground the bridge owns"""
    b = next(b for b in page.evaluate("() => window.__mm.genericBridges()")
             if min(math.dist(p, WEST_END) for p in b["pts"]) < 1 and min(math.dist(p, EAST_END) for p in b["pts"]) < 1)
    return WEST_END[0] - max(b["run0"], b["run1"]), EAST_END[0] + max(b["run0"], b["run1"])


def on_road(trace):
    return [r for r in trace if off_road(r["x"], r["z"]) <= ON_ROAD]         # past the straight stretch the chord leaves the road


@pytest.mark.parametrize("v", [22, 32])
@pytest.mark.parametrize("start,toward", [(STRAIGHT[1], STRAIGHT[0]), (STRAIGHT[0], STRAIGHT[1])], ids=["westbound", "eastbound"])
def test_drive_over_the_saegeweg_bridge_without_a_jump(page, v, start, toward):
    """on the deck and over both seated ends -- the ground #227 moves"""
    lo, hi = saegeweg_span(page)
    th = math.atan2(toward[1] - start[1], toward[0] - start[0])
    on = on_road(drive(page, start[0], start[1], th, 4.0, v))
    span = [r for r in on if lo <= r["x"] <= hi]
    assert min(r["x"] for r in span) <= WEST_END[0] and max(r["x"] for r in span) >= EAST_END[0], [(r["x"], r["z"]) for r in span]
    air = [r["y"] - r["ground"] for r in span]
    assert max(air) <= 0.3, max(zip(air, span), key=lambda a: a[0])          # 2026-10-15: 22.3 m westbound, 5.4 m eastbound


@pytest.mark.parametrize("v", [22, 32])
def test_the_bank_road_west_of_the_bridge_is_no_worse_than_before(page, v):
    """The drawn road ribbon carries a pre-existing 0.15 m bump at the bank top 4.4 m west of the deck, where it ends 0.17 m over
    the terrain: 25.397 / 25.481 / 25.551 / 25.502 at x = 1819.00 / 1820.46 / 1821.43 / 1822.89, the same on main and here
    (2026-10-16, measured with the fill excluded). Filling a bank can level a dip, never a bump, so a car crossing it at 110 km/h
    still hops about a metre. #227 must not add to that."""
    th = math.atan2(STRAIGHT[0][1] - STRAIGHT[1][1], STRAIGHT[0][0] - STRAIGHT[1][0])
    air = [r["y"] - r["ground"] for r in on_road(drive(page, STRAIGHT[1][0], STRAIGHT[1][1], th, 4.0, v))]
    assert max(air) <= 1.1, max(air)                                        # main 2026-10-16: 21.7 m (22 m/s), 17.3 m (32 m/s)


def test_the_fill_past_an_end_is_land_and_the_sissle_keeps_its_water(page):
    """The fill reaches at most its run past an end, on the land side, so `waterLevelAt` reports no water there -- as it did for the
    flat deck plateau before it. The Sissle beside the deck must not be swallowed with it."""
    land = [(1828.0, 1154.4), (1823.0, 1155.7), (1855.0, 1147.6), (1857.0, 1147.1)]       # on the deck, and in the fill past each end
    probes = page.evaluate(f"() => {json.dumps(land + [(1839.0, 1141.5), (1839.0, 1161.5)])}.map(([x, z]) => window.__mm.probe(x, z).water)")
    assert probes[:len(land)] == [None] * len(land), probes
    assert all(w is not None for w in probes[len(land):]), probes               # the stream 10 m either side of the deck


def test_fewer_bridge_ends_rise_more_than_a_metre_in_one_metre(page):
    """the survey from the spec: every OSM road bridge end, 0.5 m inside the deck, then 0..12 m straight on"""
    world = json.loads((DATA / "world_hochrhein.json").read_text(encoding="utf-8"))
    ends = []
    for r in (r for r in world["roads"] if r["bridge"]):
        p = r["pts"]
        for a, b in ((p[0], p[1]), (p[-1], p[-2])):
            d = math.dist(a, b) or 1
            ends.append({"x": a[0], "z": a[1], "ux": (a[0] - b[0]) / d, "uz": (a[1] - b[1]) / d})
    js = """(E) => E.map(e => [-0.5, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(d => window.__mm.ground(e.x + e.ux * d, e.z + e.uz * d, 1e4)))"""
    seqs = page.evaluate(js, ends)
    big = sum(1 for s in seqs if max(b - a for a, b in zip(s, s[1:])) > 1.0)
    assert big < 36, big                                                        # 2026-10-15: 36 of 238 ends
