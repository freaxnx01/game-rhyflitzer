"""#36: flat OSM buildings collide where their walls are drawn, not as their minimum rectangle.
Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
CLEAR = 2.2   # sample points keep this far from every drawn wall: compact radius 1.69 (1.3 after #69) + 0.5 m


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


def _rect_ring(rect):
    cx, cz, w, d, a = rect; c, s = math.cos(a), math.sin(a)
    return [(cx + c * u * w / 2 - s * v * d / 2, cz + s * u * w / 2 + c * v * d / 2) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def _drawn_from_ring(b):
    """osmBuilding: the gable path draws a box of b.rect; every other building extrudes b.ring."""
    return not (b["roof"] == "gable" and not (b.get("hsrc") == "dsm" and b.get("rh", 9) < 0.6))


def _drawn(b):
    return b["ring"] if _drawn_from_ring(b) else _rect_ring(b["rect"])


def notch_points(world, step=3.0):
    """Points inside a ring building's minimum rectangle that are clear of every drawn footprint by CLEAR metres."""
    cell, grid = 64, {}
    for b in world["buildings"]:
        xs, zs = zip(*_rect_ring(b["rect"]))
        for i in range(int(min(xs) // cell) - 1, int(max(xs) // cell) + 2):
            for j in range(int(min(zs) // cell) - 1, int(max(zs) // cell) + 2):
                grid.setdefault((i, j), []).append(b)
    pts = []
    for b in world["buildings"]:
        if not _drawn_from_ring(b):
            continue
        cx, cz, w, d, a = b["rect"]; c, s = math.cos(a), math.sin(a)
        for u in [k * step - w / 2 for k in range(int(w // step) + 1)]:
            for v in [k * step - d / 2 for k in range(int(d // step) + 1)]:
                x, z = cx + c * u - s * v, cz + s * u + c * v
                near = grid.get((int(x // cell), int(z // cell)), [])
                if all(not _inside(_drawn(o), x, z) and _ring_dist(_drawn(o), x, z) > CLEAR for o in near):
                    pts.append([round(x, 2), round(z, 2)])
    return pts


def open_world(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    return b, page


@needs_world
def test_lane_between_two_buildings_is_drivable(server):
    """Second playtest repro (2026-10-03, debug panel): x -1392.0, z -466.9, bearing 151 deg, between 91591385 and
    718216439. Their walls are 7.99 m apart but their rectangles only 2.54 m: the car stood still at full gas."""
    th = math.atan2(-math.cos(math.radians(151)), math.sin(math.radians(151)))   # inverse of bearing() in index.html
    with sync_playwright() as p:
        b, page = open_world(p, server)
        r = page.evaluate(f"() => window.__mm.sim(-1392.0, -466.9, {th}, 0, 3)")
        b.close()
    assert math.hypot(r["x"] + 1392.0, r["z"] + 466.9) > 20, r   # today 0.05 m; free driving ~38 m


@needs_world
def test_car_stops_at_the_drawn_wall(server):
    """First repro (#36, towards Bahnhof Sisseln): the long low building 209002925. Driving east at its west wall the
    car must stop with its collision circle on the drawn wall, not metres in front of it (today 4.4 m short)."""
    bld = next(x for x in _world()["buildings"] if x["id"] == 209002925)
    z0 = 1365.0
    ring = bld["ring"]
    wall = min(x0 + (z0 - za) * (x1 - x0) / (z1 - za)
               for (x0, za), (x1, z1) in zip(ring, ring[1:] + ring[:1]) if (za > z0) != (z1 > z0))
    with sync_playwright() as p:
        b, page = open_world(p, server)
        rad = page.evaluate("() => { const v = window.__mm.vehicle(); return v.collision.r * v.scale; }")
        r = page.evaluate(f"() => window.__mm.sim(1410, {z0}, 0, 0, 4)")
        b.close()
    assert r["speed"] < 1, r
    assert abs(r["x"] + rad - wall) < 0.3, (r, rad, wall)


@needs_world
def test_no_invisible_building_colliders_region_wide(server):
    """Region-wide: a car resting in the open part of any building's rectangle, clear of every drawn wall, is not
    pushed. Today all 23,353 such points are (559 buildings reach > 1 m beyond their walls). A lamp post or another
    small solid prop may stand at a few of them, hence the 1 % tolerance (0.16 % measured with the fix)."""
    pts = notch_points(_world())
    assert len(pts) > 10000, len(pts)
    with sync_playwright() as p:
        b, page = open_world(p, server)
        pushed = page.evaluate("(pts) => pts.filter(([x, z]) => { const d = window.__mm.pushAt(x, z); return Math.hypot(d.dx, d.dz) > 0.01; }).length", pts)
        b.close()
    assert pushed < 0.01 * len(pts), (pushed, len(pts))
