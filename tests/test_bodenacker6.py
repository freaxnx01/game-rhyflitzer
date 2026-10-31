"""#410: the Bodenackerstrasse 6 model. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

BLOCK_ID = 171822634   # Bodenackerstrasse 6a–6d, Sisseln (OSM); ten storeys per the federal building register
PORCH_US = [-23.2, -10.6, 4.3, 19.1]


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def block():
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    return next(b for b in w["buildings"] if b["id"] == BLOCK_ID)


def frame_of(layout):
    """The block's own frame (bodenacker6.js): world = centre + R(rot)·(u, v), +v east towards the street."""
    f = layout["frame"]; cx, cz, rot = f["cx"], f["cz"], f["rot"]; c, s = math.cos(rot), math.sin(rot)
    to_world = lambda u, v: (cx + u * c - v * s, cz + u * s + v * c)
    to_local = lambda x, z: ((x - cx) * c + (z - cz) * s, -(x - cx) * s + (z - cz) * c)
    return to_world, to_local


def facade_v(body, u, side):
    """The body ring's v at local u on the given side (+1 street/east, -1 back/west): where a ray has to aim."""
    vs = []
    for i in range(len(body)):
        (u0, v0), (u1, v1) = body[i], body[(i + 1) % len(body)]
        if (u0 <= u <= u1) or (u1 <= u <= u0):
            vs.append(v0 + (v1 - v0) * (0 if u1 == u0 else (u - u0) / (u1 - u0)))
    assert vs, f"the body ring does not cross u {u}"
    return max(vs) if side > 0 else min(vs)


@needs_world
def test_block_is_drawn_from_the_model_with_four_porches_and_stairs(server):
    with sync_playwright() as p:
        br, page = open_page(p, server)
        counts = page.evaluate("() => window.__mm.counts")
        layout = page.evaluate("() => window.__mm.bodenacker6()")
        roles = page.evaluate("() => window.__mm.roles()")
        br.close()
    assert counts["bodenacker6"] == 1, counts
    assert len(layout["porches"]) == 4, layout["porches"]
    assert len(layout["stairs"]) == 4, layout["stairs"]
    for porch, u in zip(layout["porches"], PORCH_US):
        assert abs(porch["u"] - u) < 0.3, porch
    assert "glass" in roles, roles


@needs_world
def test_facades_by_side_and_the_roof_housing_is_plain(server):
    b = block(); h = b["h"]
    with sync_playwright() as p:
        br, page = open_page(p, server)
        layout = page.evaluate("() => window.__mm.bodenacker6()")
        to_world, _ = frame_of(layout)
        body = layout["body"]
        porches = sorted(layout["porches"], key=lambda x: x["u"])
        stairs = sorted(layout["stairs"], key=lambda x: x["u"])
        hit = lambda x, z, tx, tz, up: page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z}, {tx}, {tz}, {up})")

        v_street = facade_v(body, -3.0, +1)          # between porches 2 and 3: plain street wall
        x, z = to_world(-3.0, v_street + 12.0); tx, tz = to_world(-3.0, v_street - 1.0)
        street = hit(x, z, tx, tz, 5)

        v_back = facade_v(body, 0.0, -1)             # from the west: the loggia tile
        x, z = to_world(0.0, v_back - 12.0); tx, tz = to_world(0.0, v_back + 1.0)
        back = hit(x, z, tx, tz, 5)

        stair = stairs[2]                             # third entrance from the south = 6c's stair (u 4.3): housing above the roof
        x, z = to_world(stair["u"], stair["vFront"] + 12.0); tx, tz = to_world(stair["u"], stair["vFront"] - 1.0)
        # the aim height is the housing's mid-height above the terrain at the target (the ground rises ~2 m over the ring's base)
        up_housing = ((layout["floors"]["roof"] + layout["floors"]["housingTop"]) / 2
                      - page.evaluate(f"() => window.__mm.probe({tx}, {tz})")["terrain"])
        housing = hit(x, z, tx, tz, up_housing)

        porch = porches[2]                             # its porch: a glass side light in the street pane, beside the door leaf
        u_light = porch["u"] + (porch["entrance"]["w"] / 2 + porch["w"] / 2) / 2
        x, z = to_world(u_light, porch["v1"] + 12.0); tx, tz = to_world(u_light, porch["v1"] - 1.0)
        pane = hit(x, z, tx, tz, 1.5)
        br.close()
    assert street == "bodenacker", street
    assert back == "bodenackerLoggia", back
    assert housing == "plasterWhite", housing
    assert pane == "glass", pane


PARAPET = 0.5   # BODENACKER6.parapet: the white band between the eaves and the roof slab


def ray_from(wall, out=12.0, into=1.0):
    """A horizontal ray from `out` m in front of a layout wall's midpoint to `into` m behind it (outward = right of a→b, bodenacker6.js)."""
    (ax, az), (bx, bz) = wall["a"], wall["b"]; length = math.hypot(bx - ax, bz - az)
    nx, nz = -(bz - az) / length, (bx - ax) / length; mx, mz = (ax + bx) / 2, (az + bz) / 2
    return mx + nx * out, mz + nz * out, mx - nx * into, mz - nz * into


@needs_world
def test_top_storey_is_one_face_not_the_parapet_band_too(server):
    """#453: the parapet band reached 2 m down over the top storey, coplanar with the façade: z-fighting while the camera moves."""
    with sync_playwright() as p:
        br, page = open_page(p, server)
        layout = page.evaluate("() => window.__mm.bodenacker6()")
        fl = layout["floors"]; eaves = fl["roof"] - PARAPET
        longest = lambda face: max((w for w in layout["walls"] if w["face"] == face),
                                   key=lambda w: math.hypot(w["b"][0] - w["a"][0], w["b"][1] - w["a"][1]))

        def roles_at(wall, y):
            x, z, tx, tz = ray_from(wall)
            up = y - page.evaluate(f"() => window.__mm.probe({tx}, {tz})")["terrain"]
            return page.evaluate(f"() => window.__mm.wallRolesAt({x}, {z}, {tx}, {tz}, {up})")

        top = eaves - fl["pitch"] / 2
        street, back, end = (roles_at(longest(f), top) for f in ("street", "back", "end"))
        band = roles_at(longest("street"), eaves + PARAPET / 2)
        br.close()
    assert street == ["bodenacker"], street
    assert back == ["bodenackerLoggia"], back
    assert end == ["bodenacker"], end
    assert band == ["plasterWhite"], band   # the band itself stays, above the eaves


def test_hand_layout_has_no_bodenacker_model(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, block_world=True)
        counts = page.evaluate("() => window.__mm.counts")
        br.close()
    assert counts.get("bodenacker6", 0) == 0