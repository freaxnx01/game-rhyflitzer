"""#103: the Güggeli food truck stands on the Bahnhof Eiken car park as a solid, painted van.
Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def _anchor():
    if not WORLD.exists():
        return None
    return json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"].get("foodTruck")


TRUCK = _anchor()
needs_truck = pytest.mark.skipif(TRUCK is None, reason="world not rebuilt for #103 (Task 4 of docs/superpowers/plans/2026-10-03-food-truck-eiken.md)")


def open_page(p, server):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    return br, page


@needs_truck
def test_truck_is_built_once_and_its_hatch_side_is_painted(server):
    """The model counts itself, and a ray from 12 m north of the centre (heading 0: the hatch side) hits the painted
    'hall' body, not a textured sign and not nothing."""
    x, z = TRUCK["x"], TRUCK["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        assert page.evaluate("() => window.__mm.counts.foodTruck") == 1
        role = page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z - 12}, {x}, {z})")
        br.close()
    assert role == "hall", role


@needs_truck
def test_truck_stops_the_car(server):
    """Driving east at the truck from 25 m west at 12 m/s for 3 s (36 m without an obstacle), the car must be stopped
    and never come out on the far side."""
    x, z = TRUCK["x"], TRUCK["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        r = page.evaluate(f"() => window.__mm.sim({x - 25}, {z}, 0, 12, 3)")
        br.close()
    assert r["x"] < x, r
