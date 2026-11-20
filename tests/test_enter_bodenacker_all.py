"""#1099: every one of the four entrances of Bodenackerstrasse 6 opens and leads into its own stair hall.
Slow (Playwright): run in the foreground."""
import math
import re
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

HOUSES = ["6a", "6b", "6c", "6d"]


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 960, "height": 540})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.bodenacker6 && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def key(page, name, ms=150):
    page.keyboard.press(name)
    page.wait_for_timeout(ms)


def foot_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.footSim(s, h)", [secs, list(hold)])


def interior(page, house=None):
    return page.evaluate("(h) => window.__mm.interior(h)", house)


def entrance_of(page, house):
    return page.evaluate("(h) => window.__mm.bodenacker6().porches.find(p => p.house === h).entrance", house)


def stand_outside(page, entrance, metres):
    """Put the walker `metres` m in front of the porch door, facing in."""
    page.evaluate("([x, z, th, m]) => window.__mm.place(x - Math.cos(th) * m, z - Math.sin(th) * m, th)",
                  [entrance["x"], entrance["z"], entrance["th"], metres])


def stand_in_hall(page, house, a, b, face=0.0, level=None):
    """Put the walker at the hall point (a into the building, b to the right) of this house -- stairhall.js's frame."""
    x, z, th = page.evaluate("""([h, a, b]) => { const i = window.__mm.interior(h), e = i.entrance, d = i.porch.d, th = e.th, c = Math.cos(th), s = Math.sin(th);
        const ox = e.x + c * d, oz = e.z + s * d; return [ox + c * a - s * b, oz + s * a + c * b, th]; }""", [house, a, b])
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [x, z, th + face])
    if level is not None:
        page.evaluate("([h, k]) => window.__mm.setFootY(window.__mm.interior(h).levels[k])", [house, level])


def walk_in(page, house):
    """E at this house's porch, then in through the porch into the stair hall. Returns (opened, inside)."""
    stand_outside(page, entrance_of(page, house), 1.5)
    foot_sim(page, 0.2)
    # the prompt needs one rendered frame (stepEnter); headless draws under 1 fps, and all four porches share the one entry id
    page.wait_for_function("(h) => window.__mm.enterables.prompt() === 'bodenackerstrasse-6c' && window.__mm.enterables.promptHouse() === h", arg=house, timeout=120000)
    key(page, "e", 300)
    foot_sim(page, 1.2)
    opened = interior(page, house)
    foot_sim(page, 2.5, ["KeyW"])
    inside = page.evaluate("(h) => ({ ...window.__mm.interior(h), cur: window.__mm.interiorHouse(), meshes: window.__mm.interiorCount(h).meshes })", house)
    return opened, inside


@needs_world
def test_every_entrance_opens_on_e_and_leads_into_its_own_stair_hall(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        stand_outside(page, entrance_of(page, "6a"), 12)
        key(page, "z", 300)                                  # out of the car once; the walker then steps from porch to porch
        opened, inside = {}, {}
        for house in HOUSES:
            opened[house], inside[house] = walk_in(page, house)
        b.close()
    assert errors == []
    for house in HOUSES:
        o, i = opened[house], inside[house]
        assert o["door"] > 0.9, (house, o)
        assert i["cur"] == house, (house, i)
        assert i["area"] == "tower" and i["indoors"] is True and i["floor"] == 0, (house, i)
        assert abs(i["y"] - i["levels"][0]) < 0.05, (house, i)
        assert re.fullmatch(r"6 · (EG|ground floor)", i["label"]) and i["hidden"] is False, (house, i)
        assert i["meshes"] > 0, (house, i)                   # the hall of the house the walker is in is built


@needs_world
def test_only_the_current_houses_interior_is_built(server):
    """The anti-goal: four halls in the walkways, but at most one interior group of meshes at a time."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        stand_outside(page, entrance_of(page, "6d"), 12)
        key(page, "z", 300)
        walk_in(page, "6d")
        in_6d = page.evaluate("() => ({ house: window.__mm.interiorHouse(), ...window.__mm.interiorCount() })")
        others = page.evaluate("(hs) => hs.map(h => window.__mm.interiorCount(h).meshes)", ["6a", "6b", "6c"])
        b.close()
    assert errors == []
    assert in_6d["house"] == "6d" and in_6d["meshes"] > 0, in_6d
    assert others == [0, 0, 0], others                       # no second group: only the current house is built


@needs_world
def test_the_lift_of_6a_rides_to_the_roof_and_the_display_names_no_house(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        stand_outside(page, entrance_of(page, "6a"), 12)
        key(page, "z", 300)
        walk_in(page, "6a")
        stand_in_hall(page, "6a", 0.7, 0.4, math.pi / 2, level=0)   # on the EG landing, facing the lift (to the right)
        foot_sim(page, 0.3)
        key(page, "e", 200)                                  # call the lift (it stands at the EG: the door just opens)
        page.evaluate("() => window.__mm.interiorSim(1.5)")
        foot_sim(page, 1.0, ["KeyW"])                        # into the cabin
        in_cabin = interior(page, "6a")
        key(page, "d", 200)                                  # D = Dach
        foot_sim(page, 20)
        atroof = page.evaluate("() => ({ ...window.__mm.interior(), cur: window.__mm.interiorHouse() })")
        b.close()
    assert errors == []
    assert in_cabin["pad"] is True and in_cabin["lift"]["at"] == 0, in_cabin
    assert atroof["cur"] == "6a", atroof
    assert atroof["floor"] == 10 and abs(atroof["y"] - atroof["levels"][10]) < 0.1, atroof
    assert re.fullmatch(r"6 · (Dach|roof)", atroof["label"]), atroof
