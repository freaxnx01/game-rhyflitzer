"""#1248: the whole-map road-vs-ground scan on the drawn triangles (groundscan.js). Slow: foreground, OSM world only."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

import road_scan_report as rs

ROOT = Path(__file__).parents[1]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.roadScan && document.querySelector('#worldstatus')?.textContent"
GREEN = ["grass", "field", "meadow"]
ROAD = ["road", "roadOsm"]   # __mm.rayHits has no motorway role
NEAR = 12   # groundscan.js SCAN.near
# grassOverRoad's measured spots (#290) plus open ground, a field and a junction near Sisseln
POINTS = [[-2978.85, 610.72], [-2231.9, 705.4], [1075.85, 1181.1], [1599.56, 962.82], [2632.99, -1038.57],
          [-1219.25, 536.25], [271, 417.74], [1559.75, 1974], [1780, 560], [3500, 3000], [1528, 409]]


@pytest.fixture(scope="module")
def page(server):
    if not (WORLD.exists() and MMH.exists()):
        pytest.skip("run pipeline/osm.py build and terrain.py first")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        pg = browser.new_page(viewport={"width": 320, "height": 180})
        pg.goto(f"{server}/index.html")
        pg.wait_for_function(READY, timeout=240000)
        pg.wait_for_selector("#mmhstatus.real", timeout=240000)
        yield pg
        browser.close()


def highest_ray(hits, roles):
    ys = [hits[r] for r in roles if hits.get(r) is not None]
    return max(ys) if ys else None


@pytest.mark.parametrize("roles", [GREEN, ROAD], ids=["green", "road"])
def test_index_heights_match_the_raycaster(page, roles):
    tops = page.evaluate("([roles, pts]) => window.__mm.indexTop(roles, pts)", [roles, POINTS])
    rays = [highest_ray(page.evaluate("([x, z]) => window.__mm.rayHits(x, z)", pt), roles) for pt in POINTS]
    assert sum(r is not None for r in rays) >= 5, rays   # the points must reach drawn surfaces at all
    for pt, top, ray in zip(POINTS, tops, rays):
        assert (top is None) == (ray is None), (pt, top, ray)
        if ray is not None:
            assert abs(top - ray) < 0.001, (pt, top, ray)


def diff_known(spots, known, r=NEAR):
    close = lambda a, b: ((a["x"] - b["x"]) ** 2 + (a["z"] - b["z"]) ** 2) ** 0.5 <= r
    return [s for s in spots if not any(close(s, k) for k in known)], [k for k in known if not any(close(s, k) for s in spots)]


def test_no_new_grass_over_road_spots(page):
    """Every non-bridge road, every 4 m, centre and both edges: drawn grass, field or meadow must not stand over the
    drawn road. Known spots (tests/road_scan_known.json) do not fail; new ones are listed for the nightly issue."""
    res = page.evaluate("() => window.__mm.roadScan(4)")
    print({k: res[k] for k in ("ms", "probes", "done", "worst")}, len(res["spots"]), "spots")
    assert res["probes"] > 200000, res["probes"]          # 420.7 km of non-bridge road x 3 / 4 m ~ 315,000 (2026-11-27)
    # A probe counts only where both a road and a green surface are drawn. 38 % of them have no road surface in the
    # scanned roles at all: a third of the non-bridge roads (1,215 of 3,658) are `modern` and go into the time layer's
    # own mesh (index.html:2900), and `roadPlain`/`gravel` are not scanned roles -- the roles stay the ones
    # __mm.grassOverRoad uses. Measured 61.7 % on 2026-11-27; the Raycaster finds no road at those probes either, so
    # this guard only catches a scan that stops reaching surfaces.
    assert res["done"] >= 0.5 * res["probes"], (res["done"], res["probes"])
    assert res["ms"] < 120000, res["ms"]
    fresh, gone = diff_known(res["spots"], rs.load_known())
    if gone:
        print(rs.failure_message([], gone))
    assert not fresh, rs.failure_message(fresh, gone)
