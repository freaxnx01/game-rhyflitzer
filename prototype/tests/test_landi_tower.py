"""#81: the LANDI silo tower by Bahnhof Sisseln stands at its anchor as a solid concrete tower.
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
    return json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"].get("landiTurm")


TOWER = _anchor()
needs_tower = pytest.mark.skipif(TOWER is None, reason="world not rebuilt for #81 (Task 4 of docs/superpowers/plans/2026-10-03-landi-tower.md)")


def open_page(p, server):
    br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
    return br, page


@needs_tower
def test_tower_is_built_once_and_its_west_wall_is_concrete(server):
    """The model counts itself, and a ray from 30 m west of the centre hits the 'stone' slab (the long side runs
    roughly north-south, so west is across the 12.6 m short side)."""
    x, z = TOWER["x"], TOWER["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        assert page.evaluate("() => window.__mm.counts.landiTurm") == 1
        role = page.evaluate(f"() => window.__mm.wallRoleAt({x - 30}, {z}, {x}, {z})")
        br.close()
    assert role == "stone", role


@needs_tower
def test_tower_stops_the_car(server):
    """Driving east at the tower from 30 m west at 15 m/s for 3 s (45 m without an obstacle), the car must be stopped by
    the tower and never come out on its far side."""
    x, z = TOWER["x"], TOWER["z"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        r = page.evaluate(f"() => window.__mm.sim({x - 30}, {z}, 0, 15, 3)")
        br.close()
    assert r["x"] < x, r
