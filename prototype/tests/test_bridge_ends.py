"""#227: generic bridge ends meet their banks -- no launch off the Sägeweg bridge over the Sissle (w80728459).
Measured terrain only. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

DATA = Path(__file__).parents[2] / "data"
pytestmark = pytest.mark.skipif(not ((DATA / "world_hochrhein.json").exists() and (DATA / "terrain_hochrhein.mmh").exists()),
                                reason="run pipeline/osm.py build and terrain.py first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# Sägeweg centre line: w700036726 (west) -> bridge w80728459 -> w80728460 -> w1532972168 (east)
LINE = [(1756.8, 1165.2), (1805.9, 1160.0), (1825.8, 1155.0), (1852.1, 1148.3), (1865.7, 1144.9), (1870.5, 1143.8), (1885.6, 1142.9)]
WEST_END, EAST_END = (1825.8, 1155.0), (1852.1, 1148.3)


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
        pg.goto(f"{server}/prototype/index.html")
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


@pytest.mark.parametrize("v", [22, 32])
@pytest.mark.parametrize("start,toward", [((1885.6, 1142.9), WEST_END), ((1756.8, 1165.2), EAST_END)], ids=["westbound", "eastbound"])
def test_drive_over_the_saegeweg_bridge_without_a_jump(page, v, start, toward):
    th = math.atan2(toward[1] - start[1], toward[0] - start[0])
    trace = drive(page, start[0], start[1], th, 4.0, v)
    air = [r["y"] - r["ground"] for r in trace]
    assert max(air) <= 0.3, max(zip(air, trace), key=lambda a: a[0])         # 2026-10-15: 22.3 m westbound, 5.4 m eastbound


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
