"""#846: the fenced ostrich paddock at the Straussenfarm Sisseln -- a fence the car cannot pass, eight ostriches
that flee from the player, distance culling, and the J entry. Real world file, terrain blocked (deterministic
heights). Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_carselect import ARGS, MMH_ROUTE, T, wait_frames
from test_jump import rows as jump_rows

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
OSTRICHES_JS = "() => window.__mm.ostriches()"


def open_page(p, server):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.ostriches && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    wait_frames(page)
    return b, page, errors


@needs_world
def test_paddock_built_with_eight_birds_inside(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        d = page.evaluate(OSTRICHES_JS)
        b.close()
    assert d["on"] is True, d
    assert d["count"] == 8, d
    assert d["solids"] > 100, d
    assert all(x["inside"] for x in d["birds"]), d
    assert not errors, errors


@needs_world
def test_shown_only_near_the_farm(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate("() => window.__mm.place(2345, -318, 1.5)")
        wait_frames(page, 3)
        near = page.evaluate(OSTRICHES_JS)["visible"]
        page.evaluate("() => window.__mm.place(1500, 400, 0)")
        wait_frames(page, 3)
        far = page.evaluate(OSTRICHES_JS)["visible"]
        b.close()
    assert near is True, "the paddock is hidden in front of the farm"
    assert far is False, "the paddock is still shown 1 km away"
    assert not errors, errors


@needs_world
def test_birds_flee_from_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        d = page.evaluate(OSTRICHES_JS)
        b0 = d["birds"][0]
        ux, uz = 2380 - b0["x"], -422 - b0["z"]                      # the car between the bird and the centre,
        dist = math.hypot(ux, uz) or 1                              # so it has the whole paddock to run into
        car = (b0["x"] + ux / dist * 8, b0["z"] + uz / dist * 8)
        page.evaluate(f"() => window.__mm.place({car[0]}, {car[1]}, 0)")
        fled = False
        for _ in range(12):                                          # poll every 10 frames, ~120 frames of loop
            wait_frames(page, 10)
            b1 = page.evaluate(OSTRICHES_JS)["birds"][0]
            if b1["state"] == "flee" and math.hypot(b1["x"] - car[0], b1["z"] - car[1]) > 8:
                fled = True
                break
        b.close()
    assert fled, "bird 0 never fled to a greater distance"
    assert not errors, errors


@needs_world
def test_fence_stops_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        res = page.evaluate("() => window.__mm.sim(2405, -300, -Math.PI / 2, 15, 2, [])")   # northbound into the A-B side
        b.close()
    assert res["z"] > -321, f"the car crossed the fence (z {res['z']:.1f})"
    assert not errors, errors


@needs_world
def test_jump_list_has_the_farm(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        page.click('#jumpchips button[data-g="Sisseln"]')
        names = [r["n"] for r in jump_rows(page)]
        b.close()
    assert "Straussenfarm Sisseln" in names, names
    assert not errors, errors


@needs_world
def test_trees_and_props_keep_out_of_the_paddock(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        d = page.evaluate(OSTRICHES_JS)
        pts = [(2380, -422)] + [(x["x"], x["z"]) for x in d["birds"]]
        blocked = page.evaluate("(pts) => pts.map(([x, z]) => window.__mm.ostriches().free(x, z, 1))", pts)
        b.close()
    assert not any(blocked), f"free() allowed placement inside the paddock: {blocked}"
    assert not errors, errors
