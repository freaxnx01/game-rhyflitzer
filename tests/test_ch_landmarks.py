"""#649: the Fridolinskapelle Sisseln as a swissBUILDINGS3D landmark (first of the programme #652).
Slow (Playwright): run in the foreground. The landmark needs the measured terrain, so the .mmh is NOT routed away."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
CHAPEL = "fridolinskapelle-sisseln"   # assets/landmarks/index.json key
OSM_RECT_CENTRE = (1744.18, -424.69)   # rect centre of way 171822707, the OSM building the model replaces


def _world():
    return json.loads(WORLD.read_text(encoding="utf-8"))


def _seg_dist(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dz * dz
    t = 0 if not l2 else max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / l2))
    return math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)


def _ring_dist(ring, x, z):
    return min(_seg_dist(x, z, ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring)))


def _inside(ring, x, z):
    c = False
    for i in range(len(ring)):
        (x0, z0), (x1, z1) = ring[i], ring[(i + 1) % len(ring)]
        if (z0 > z) != (z1 > z) and x < x0 + (z - z0) * (x1 - x0) / (z1 - z0):
            c = not c
    return c


def open_world(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    return b, page


@needs_world
def test_chapel_model_stands_on_its_footprint_and_terrain(server):
    """The model sits over its OSM footprint (box centre within 3 m of the rect centre of way 171822707), tops out
    19-23 m above the ground there (the turret, 21 m) and does not float above the terrain."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            page.wait_for_function(
                f"() => (window.__mm.counts.chLandmarks?.placed || []).includes('{CHAPEL}')", timeout=120000)
            box = page.evaluate(f"() => window.__mm.landmarkBox('{CHAPEL}')")
            cx = (box["min"][0] + box["max"][0]) / 2
            cz = (box["min"][2] + box["max"][2]) / 2
            ground = page.evaluate(f"() => window.__mm.ground({cx}, {cz})")
        finally:
            b.close()
    assert math.hypot(cx - OSM_RECT_CENTRE[0], cz - OSM_RECT_CENTRE[1]) < 3, (cx, cz)
    top = box["max"][1]
    assert 19 <= top - ground <= 23, (top, ground)
    assert box["min"][1] <= ground + 0.5, box["min"][1]


@needs_world
def test_flat_osm_box_is_replaced(server):
    """The flat OSM box 171822707 draws nothing (the model stands in its place) and keeps its collider as its ring."""
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            replaced = page.evaluate("() => window.__mm.counts.chLandmarks.replaced")
        finally:
            b.close()
    assert replaced == [171822707]


@needs_world
def test_car_stops_at_the_chapel(server):
    """The chapel stays solid as its ring (#36 pattern): driving west along the lane east of the chapel (nothing
    else within 12 m), the car stops outside the ring, its collision circle touching it (the tilted east wall
    deflects it a little along the wall, so which wall or corner it stops at is left open)."""
    ring = next(x for x in _world()["buildings"] if x["id"] == 171822707)["ring"]
    a, b2 = max(zip(ring, ring[1:] + ring[:1]), key=lambda e: max(e[0][0], e[1][0]))   # the east wall, greatest x
    z0 = (a[1] + b2[1]) / 2
    wall = a[0] + (b2[0] - a[0]) * (z0 - a[1]) / (b2[1] - a[1])
    with sync_playwright() as p:
        b, page = open_world(p, server)
        try:
            rad = page.evaluate("() => { const v = window.__mm.vehicle(); return v.collision.r * v.scale; }")
            r = page.evaluate(f"() => window.__mm.sim({wall + 7}, {z0}, Math.PI, 0, 4)")
        finally:
            b.close()
    assert r["speed"] < 1, r
    assert not _inside(ring, r["x"], r["z"]), r
    assert _ring_dist(ring, r["x"], r["z"]) <= rad + 0.5, (r, rad)   # stopped at the chapel, not anywhere in the lane
