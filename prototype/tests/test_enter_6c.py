"""#411 stage 1: entering Bodenackerstrasse 6c. Slow (Playwright): run in the foreground."""
import math
import re
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 960, "height": 540})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.bodenacker6 && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def hall_point(page, a, b):
    """World x, z of the hall frame point (a into the building, b to the right) -- stairhall.js's frame."""
    return page.evaluate("""([a, b]) => { const i = window.__mm.interior(), e = i.entrance, d = i.porch.d, th = e.th, c = Math.cos(th), s = Math.sin(th);
        const ox = e.x + c * d, oz = e.z + s * d; return [ox + c * a - s * b, oz + s * a + c * b, th]; }""", [a, b])


def stand(page, a, b, face=0.0, level=None):
    """Put the walker at the hall point (a, b), facing the hall's heading + face, on the given level (None: the terrain)."""
    x, z, th = hall_point(page, a, b)
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [x, z, th + face])
    if level is not None:
        page.evaluate("(k) => window.__mm.setFootY(window.__mm.interior().levels[k])", level)
    return x, z, th


def key(page, name, ms=150):
    page.keyboard.press(name)
    page.wait_for_timeout(ms)


def foot_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.footSim(s, h)", [secs, list(hold)])


def interior(page):
    return page.evaluate("() => window.__mm.interior()")


@needs_world
def test_e_opens_the_door_and_the_hall_is_reachable_on_foot(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        info = page.evaluate("() => ({ e: window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance, d: window.__mm.bodenacker6().porches.find(p => p.house === '6c').d })")
        e, d = info["e"], info["d"]
        # the car 12 m in front of the door, then out; the walker is put 1.2 m in front of the door, facing in
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 1.2, z - Math.sin(th) * 1.2, th)", [e["x"], e["z"], e["th"]])
        outside = interior(page)
        page.wait_for_function("() => window.__mm.enterables.prompt() === 'bodenackerstrasse-6c'", timeout=120000)   # the prompt needs one rendered frame (stepEnter); headless draws under 1 fps
        toast = page.evaluate("() => window.__mm.toast()")
        key(page, "e", 300)
        foot_sim(page, 1.2)
        opened = interior(page)
        foot_sim(page, 3.5, ["KeyW"])                      # in through the porch, into the hall (the back wall stops it)
        inside = interior(page)
        key(page, "f", 200)                                 # F: no hover indoors
        hover = page.evaluate("() => window.__mm.foot().hover")
        b.close()
    assert errors == []
    assert outside["hall"] is True and outside["area"] == "out" and outside["indoors"] is False, outside
    assert toast["shown"] is False, toast   # #445: the on-foot hint has made way for the prompt
    assert opened["door"] > 0.9, opened
    assert inside["area"] == "tower" and inside["indoors"] is True and inside["floor"] == 0, inside
    assert abs(inside["y"] - inside["levels"][0]) < 0.05, inside
    assert re.fullmatch(r"6c · (EG|ground floor)", inside["label"]) and inside["hidden"] is False, inside
    assert hover is False


@needs_world
def test_the_hall_is_built_near_and_gone_far_and_the_window_looks_out(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        page.wait_for_function("() => window.__mm.interior().built", timeout=120000)   # the build needs one rendered frame (stepInterior); headless draws under 1 fps
        near = interior(page)
        built = page.evaluate("() => window.__mm.interiorCount()")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 90, z - Math.sin(th) * 90, th)", [e["x"], e["z"], e["th"]])
        foot_sim(page, 0.5)
        far = interior(page)
        # look straight out through the window of the 3rd-floor landing
        stand(page, 0.7, 0.0, math.pi, level=3)             # on the 3rd-floor landing, facing out of the building
        foot_sim(page, 0.2)
        ray = page.evaluate("() => window.__mm.interiorRay()")
        b.close()
    assert errors == []
    assert near["built"] is True and far["built"] is False, (near, far)
    assert built["meshes"] > 0
    assert ray["dist"] is None or ray["dist"] > 4, ray      # nothing of the building is in the way: the window is a hole


@needs_world
def test_the_hall_front_wall_stays_behind_the_facade(server):
    """#453: the hall's front wall on the façade line z-fought with the façade (flicker from the street); it is set back."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 30, z - Math.sin(th) * 30, th)", [e["x"], e["z"], e["th"]])
        page.wait_for_function("() => window.__mm.interior().built", timeout=120000)   # built from 40 m, in the car too
        gap = page.evaluate("() => window.__mm.interiorFaceA()")
        b.close()
    assert errors == []
    assert gap >= 0.02, gap


@needs_world
def test_from_the_porch_the_doorway_looks_into_the_hall_not_onto_the_facade(server):
    """#467: the façade ran on behind the porch, windows and all, across the hall's doorway; it is cut open there."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        far = interior(page)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        page.wait_for_function("() => window.__mm.interior().built", timeout=120000)
        stand(page, -0.8, 0.0, 0.0, level=0)                # in the porch, facing into the building
        foot_sim(page, 0.2)
        ray = page.evaluate("() => window.__mm.interiorRay()")
        near = interior(page)
        b.close()
    assert errors == []
    assert ray["role"] != "bodenacker" and (ray["dist"] is None or ray["dist"] > 1.5), ray
    assert far["plug"] is True and near["plug"] is False, (far, near)   # the dark backing only while the hall is not built


@needs_world
def test_lift_to_the_fifth_floor_and_to_the_roof(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        stand(page, 0.7, 0.4, math.pi / 2, level=0)         # on the EG landing, facing the lift (to the right)
        foot_sim(page, 0.3)
        key(page, "e", 200)                                 # call the lift (it stands at the EG: the door just opens)
        page.evaluate("() => window.__mm.interiorSim(1.5)")
        foot_sim(page, 1.0, ["KeyW"])                       # into the cabin
        in_cabin = interior(page)
        key(page, "5", 200)                                 # the fifth floor
        foot_sim(page, 9)                                   # the trip takes 7.06 s (door + 12.65 m at 2.5 m/s + door); the door's 4 s hold from the arrival must still cover the step-out below
        at5 = interior(page)
        foot_sim(page, 1.0, ["KeyS"])                       # out onto the landing
        out5 = interior(page)
        stand(page, 0.7, 0.4, math.pi / 2, level=5)         # the door has shut behind the walker: back by the gap, call the lift again
        foot_sim(page, 0.3)
        key(page, "e", 200)
        page.evaluate("() => window.__mm.interiorSim(1.5)")
        foot_sim(page, 1.0, ["KeyW"])                       # back in
        key(page, "d", 200)                                 # D = Dach
        foot_sim(page, 20)
        atroof = interior(page)
        b.close()
    assert errors == []
    assert in_cabin["pad"] is True and in_cabin["lift"]["at"] == 0, in_cabin
    assert at5["lift"]["at"] == 5 and abs(at5["y"] - at5["levels"][5]) < 0.1, at5
    assert re.fullmatch(r"6c · (5\. OG|5th floor)", at5["label"]), at5
    assert out5["area"] == "tower" and abs(out5["y"] - out5["levels"][5]) < 0.1, out5
    assert atroof["floor"] == 10 and abs(atroof["y"] - atroof["levels"][10]) < 0.1, atroof


@needs_world
def test_roof_door_and_the_roof_edge_cannot_be_crossed(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        stand(page, 0.7, 0.4, math.pi / 2, level=0)
        foot_sim(page, 0.3)
        key(page, "e", 200)
        page.evaluate("() => window.__mm.interiorSim(1.5)")
        foot_sim(page, 1.0, ["KeyW"])
        key(page, "d", 200)
        foot_sim(page, 20)                                  # to the roof
        lobby = interior(page)
        stand(page, 0.8, -0.2, -math.pi / 2, level=10)      # in the roof lobby, facing the door in the left wall
        foot_sim(page, 1.5, ["KeyW"])                       # through the door
        outside = interior(page)
        foot_sim(page, 12, ["KeyW"])                        # on towards the edge: the rail must stop it
        edge = interior(page)
        key(page, "f", 200)
        hover = page.evaluate("() => window.__mm.foot().hover")
        b.close()
    assert errors == []
    assert lobby["levels"][9] < lobby["levels"][10] - 1.0, lobby   # the 9th landing lies under the roof even where the door sits above the block's lowest ground
    assert lobby["floor"] == 10, lobby
    assert outside["area"] == "out" and abs(outside["y"] - outside["levels"][10]) < 0.1, outside
    assert abs(edge["y"] - edge["levels"][10]) < 0.1, edge   # still on the roof, not fallen
    assert re.fullmatch(r"6c · (Dach|roof)", edge["label"]) and hover is False, edge


@needs_world
def test_the_6c_roof_housing_is_white_not_black(server):
    """#453: the housing over the stair tower had no vertex colours, so the default style drew it black from afar."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        tint = page.evaluate("() => window.__mm.housingTint()")
        b.close()
    assert errors == []
    assert tint is not None and tint >= 0.9, tint


@needs_world
def test_the_shut_porch_door_stops_the_walker_without_e(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        e = page.evaluate("() => window.__mm.bodenacker6().porches.find(p => p.house === '6c').entrance")
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 12, z - Math.sin(th) * 12, th)", [e["x"], e["z"], e["th"]])
        key(page, "z", 300)
        page.evaluate("([x, z, th]) => window.__mm.place(x - Math.cos(th) * 4, z - Math.sin(th) * 4, th)", [e["x"], e["z"], e["th"]])
        foot_sim(page, 4.0, ["KeyW"])                       # straight at the shut door, never pressing E
        shut = interior(page)
        b.close()
    assert errors == []
    assert shut["area"] != "tower" and shut["door"] == 0, shut


@needs_world
def test_the_block_stands_on_the_door_level_and_the_hall_uses_the_facade_pitch(server):   # #445
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        info = page.evaluate("""() => { const L = window.__mm.bodenacker6(), e = L.porches.find(p => p.house === '6c').entrance, i = window.__mm.interior();
            const lowest = Math.min(...L.ring.map(([x, z]) => window.__mm.probe(x, z).terrain));
            return { floors: L.floors, door: window.__mm.probe(e.x, e.z).terrain, lowest, levels: i.levels }; }""")
        b.close()
    assert errors == []
    assert abs(info["floors"]["floors"][0] - info["door"]) < 0.01, info                  # the EG is the terrain at the door, not the ring's lowest sample
    assert info["door"] - info["lowest"] > 1.0, info                                     # (which lies well below it: the slope the skirt covers)
    assert abs(info["floors"]["pitch"] - 2.53) < 0.01, info
    for k in range(10):
        assert abs(info["levels"][k] - info["floors"]["floors"][k]) < 1e-6, (k, info)   # the landings are the façade's storeys
    assert info["levels"][9] + 2.5 < info["levels"][10], info                            # the 9th landing has full headroom under the roof
