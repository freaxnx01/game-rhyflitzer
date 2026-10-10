"""#45: facade texture on the Bodenackerstrasse row houses. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

ROW_IDS = {512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913,
           171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933, 171822799}
OTHER_ID = 171822634   # Bodenackerstrasse 6a–6d: next door, a–d address range, eight storeys — not a row house


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def outside_long_face(b, out=12.0):
    """A point `out` m outside the +z face of b.rect (box frame: local (lx, lz) → world via rot) and the footprint centre."""
    cx, cz, w, d, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
    lx, lz = 0.0, d / 2 + out
    return cx + lx * c - lz * s, cz + lx * s + lz * c, cx, cz


def outside_gable_end(b, out=12.0):
    """A point `out` m outside the +x face of b.rect (the gable end: the ridge runs along w) and the footprint centre."""
    cx, cz, w, d, rot = b["rect"]; c, s = math.cos(rot), math.sin(rot)
    lx, lz = w / 2 + out, 0.0
    return cx + lx * c - lz * s, cz + lx * s + lz * c, cx, cz


@needs_world
def test_row_houses_carry_the_facade_role_and_the_neighbour_does_not(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in w["buildings"]}
    present = sorted(i for i in ROW_IDS if i in by_id)
    assert len(present) == 16, present
    with sync_playwright() as p:
        br, page = open_page(p, server)
        counts = page.evaluate("() => window.__mm.counts")
        roles = page.evaluate("() => window.__mm.roles()")
        hits = {}
        for i in present + [OTHER_ID]:
            x, z, tx, tz = outside_long_face(by_id[i])
            hits[i] = page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z}, {tx}, {tz})")
        br.close()
    assert counts["rowHouses"] == 16, counts
    assert "rowHouse" in roles, roles
    assert all(hits[i] == "rowHouse" for i in present), hits
    assert hits[OTHER_ID] not in (None, "rowHouse"), hits[OTHER_ID]


GABLE_CONTROL_ID = 171822877   # Lerchenweg 11: gable path (h 3.0, rh 5.7), not a row house — its gable end stays plain 'wall'


@needs_world
def test_pitched_row_houses_have_rowhouse_gable_ends_and_other_gables_do_not(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in w["buildings"]}
    pitched = sorted(i for i in ROW_IDS if i in by_id and by_id[i]["roof"] == "gable" and by_id[i]["rh"] >= 0.6)
    assert len(pitched) >= 1, "no row house takes the gable path in this world build"
    with sync_playwright() as p:
        br, page = open_page(p, server)
        hits = {}
        for i in pitched + [GABLE_CONTROL_ID]:
            b = by_id[i]; x, z, tx, tz = outside_gable_end(b)
            up = b["h"] + 0.4 * b["rh"]           # inside the end triangle: above the box top, below the ridge
            hits[i] = page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z}, {tx}, {tz}, {up})")
        br.close()
    assert all(hits[i] == "rowHouse" for i in pitched), hits
    assert hits[GABLE_CONTROL_ID] == "wall", hits[GABLE_CONTROL_ID]


def test_hand_layout_has_no_row_houses(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        counts = page.evaluate("() => window.__mm.counts")
        roles = page.evaluate("() => window.__mm.roles()")
        br.close()
    assert counts.get("rowHouses", 0) == 0
    assert "rowHouse" not in roles
