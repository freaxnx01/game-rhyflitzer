"""#78: the Fridolinsbrücke deck meets the roads on both banks and the car crosses without a jump. Measured terrain only: the
bug lives in the swissALTI3D bank shape (bridge removed, OSM bridge ends at the foot of the bank). Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

DATA = Path(__file__).parents[2] / "data"
pytestmark = pytest.mark.skipif(not ((DATA / "world_hochrhein.json").exists() and (DATA / "terrain_hochrhein.mmh").exists()),
                                reason="run pipeline/osm.py build and terrain.py first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
# crossing centre line (starts 14 m into Fricktalstraße: a pre-existing 0.7 m road-drape step sits at (-1494, 450)): Fricktalstraße (DE) -> w28495792 -> w319324523 -> w175815130 (reversed) -> w1382560045 -> w175815139 (reversed) (CH)
LINE = [(-1488.0, 452.4), (-1474.0, 456.8), (-1462.6, 459.1), (-1337.2, 502.4), (-1272.3, 524.1), (-1254.5, 527.5), (-1233.5, 533.5),
        (-1222.9, 536.1), (-1215.6, 536.4), (-1207.9, 534.3), (-1196.2, 526.9)]
BESIDE = (-1330.9, 483.4)                     # the Rhine 20 m beside the deck (2026-10-03: level -1.62)
CHAIN = {28495792, 319324523, 175815130, 175815131}


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


def drive(page, x, z, th, secs, v=20):
    """deterministic trace: sim re-run from the same start for 0.1, 0.2, ... secs; air = y - ground at the end of each run"""
    js = (f"() => [...Array({round(secs * 10)}).keys()].map(k => {{ const r = window.__mm.sim({x}, {z}, {th}, {v}, (k + 1) / 10); "
          f"const c = window.__mm.car(); return {{ ...r, ground: c.ground, water: c.water }}; }})")
    return page.evaluate(js)


def test_chain_and_banks(page):
    c = page.evaluate("() => window.__mm.stoneChain()")
    assert set(c["ids"]) == CHAIN, c
    assert c["approaches"] >= 3, c                                  # Fricktalstraße (2 ways) on the DE bank, the CH junction
    de, ch = c["banks"]
    assert de["x"] < ch["x"], c
    assert 6.5 < de["h"] < 8.5 and 14.5 < ch["h"] < 16.5, c          # dry run 2026-10-03: about 7.34 and 15.43


def test_deck_profile_has_no_steps(page):
    g = profile(page, resample(LINE))
    steps = [abs(b - a) for a, b in zip(g, g[1:])]
    worst = max(range(len(steps)), key=steps.__getitem__)
    assert steps[worst] <= 0.15, (worst, g[max(0, worst - 5):worst + 6])          # 2026-10-03: +2.79 at the CH end, -1.86 at the DE end
    grades = [abs(g[i + 10] - g[i]) / 10 for i in range(len(g) - 10)]
    assert max(grades) <= 0.10, max(grades)                                        # 2026-10-03: 0.5-0.7 per metre up the Stein bank


def test_deck_stands_above_the_rhine(page):
    water = page.evaluate(f"() => window.__mm.probe({BESIDE[0]}, {BESIDE[1]}).water")
    assert water is not None
    river = [p for p in resample(LINE) if -1430 < p[0] < -1280]
    assert min(profile(page, river)) >= water + 5, water                          # 2026-10-03: deck -1.66, water -1.62


def test_drive_de_to_ch_without_a_jump(page):
    trace = drive(page, -1490.0, 450.0, 0.321, 6.5)
    air = [r["y"] - r["ground"] for r in trace]
    assert max(air) <= 0.3, max(zip(air, trace), key=lambda a: a[0])             # 2026-10-03: 1.77 at the DE end, 1.94 mid-river
    assert trace[-1]["bridge"] and all(r["water"] is None for r in trace), trace[-1]


def test_drive_ch_to_de_without_a_jump(page):
    x, z = -1215.6, 536.4
    trace = drive(page, x, z, math.atan2(527.5 - z, -1254.5 - x), 2.0)
    air = [r["y"] - r["ground"] for r in trace]
    assert max(air) <= 0.3, max(zip(air, trace), key=lambda a: a[0])             # 2026-10-03: launched off the Stein bank road
    assert all(r["water"] is None for r in trace), trace[-1]


@pytest.mark.parametrize("side", [1, -1])
def test_parapets_hold_on_the_mid_piece(page, side):
    """the former generic piece w319324523 had no walls: a car steered into its side drove off into the Rhine"""
    x, z, th = -1304.75, 513.25, math.atan2(21.7, 64.9)
    r = page.evaluate(f"() => window.__mm.sim({x}, {z}, {th + side * math.radians(8)}, 15, 3)")
    c = page.evaluate("() => window.__mm.car()")
    assert r["bridge"] and c["water"] is None, (r, c)


def test_jump_spot_lands_on_the_abutment(page):
    """#79's J spot on the Swiss approach: on the abutment deck, not on the bank road buried under it, and not reported as a bridge"""
    ch = page.evaluate("() => window.__mm.stoneChain()")["banks"][1]
    page.evaluate("() => window.__mm.place(-1211.0, 535.5)")
    c = page.evaluate("() => window.__mm.car()")
    assert c["y"] >= ch["h"] - 0.5 and not c["bridge"] and c["water"] is None, (c, ch)   # 2026-10-03: y 14.23 on the bank road
