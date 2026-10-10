"""#100 pontoon bridge: U at a Rhine bank builds a crossing to the opposite bank in 3 s, U again removes it; one at a time.
OSM world, terrain blocked (water level 0, deckH 0.9). Innermattstrasse (1404.4, -425.5) in Sisseln is 20 m south of the Rhine
(208 m wide there); Murger Weg lies 74 m beyond the north bank. Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
BANK = (1404.4, -425.5)            # Innermattstrasse, 20 m from the water, facing north (-z)
NORTH = -math.pi / 2
INLAND = (1882.9, -292.2)          # the Sisseln start, 120+ m from the water
AT_BRIDGE = (-1231.6, 539.7)       # Fridolinsbrücke CH approach (primary_link), 20 m from the water, 4 m from a bridge piece


def open_world(p, server, start="#startbtn"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.pontoon && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    assert page.evaluate("() => window.__mm.layout") == "osm"
    page.click(start)
    return b, page


def place(page, xz, th):
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [xz[0], xz[1], th])


def pontoon(page):
    return page.evaluate("() => window.__mm.pontoon()")


def pontoon_sim(page, secs):
    return page.evaluate("(s) => window.__mm.pontoonSim(s)", secs)


def car(page):
    return page.evaluate("() => window.__mm.car()")


def ground(page, x, z):
    return page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [x, z])


def build(page):
    place(page, BANK, NORTH)
    page.keyboard.press("KeyU")
    st = pontoon(page)
    assert st["on"] is True and st["dir"] == 1, st
    return pontoon_sim(page, 3)


def seat_on_deck(page, x, z, th):
    """Put the car on the deck. Not __mm.place: that asks groundH with y = -Infinity ("the ground under
    any deck", so a reset lands under an overpass), and the pontoon honours the same bridgeAccepts rule,
    so place drops the car through the deck onto the river bed. __mm.sim asks from above (y = 1e4)."""
    return page.evaluate("([x, z, th]) => window.__mm.sim(x, z, th, 0, 0)", [x, z, th])


def along(st, x, z):
    """distance of (x, z) from the deck's near end a, measured along the deck"""
    a, bb, n = st["a"], st["b"], st["len"]
    return ((x - a["x"]) * (bb["x"] - a["x"]) + (z - a["z"]) * (bb["z"] - a["z"])) / n


def bearing(st):
    a, bb = st["a"], st["b"]
    return math.atan2(bb["z"] - a["z"], bb["x"] - a["x"])


@needs_world
def test_prompt_and_u_build_a_bridge_to_the_far_road(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        place(page, BANK, NORTH)
        assert pontoon(page)["prompt"] == "build"
        page.wait_for_function("() => /Pontonbrücke bauen|build a pontoon bridge/.test(document.querySelector('#prompt').textContent)", timeout=120000)
        st = build(page)
        assert st["built"] > 0.999 and st["prompt"] == "remove"   # 180 float steps of 1/60 s may stop a hair short of 1
        assert 260 <= st["len"] <= 320, st
        assert st["bOnRoad"] is True                              # Murger Weg
        assert abs(st["deckH"] - 0.9) < 1e-6
        a, bb = st["a"], st["b"]
        mid = ((a["x"] + bb["x"]) / 2, (a["z"] + bb["z"]) / 2)
        assert abs(ground(page, *mid) - st["deckH"]) < 1e-6
        th = bearing(st)
        # the deck carries the car over the water: mid-river it stands on the deck at deckH, dry
        seat_on_deck(page, *mid, th)
        assert car(page)["bridge"] is True and car(page)["water"] is None
        assert abs(car(page)["y"] - st["deckH"]) < 1e-6
        # and it drives the whole width of the Rhine (208 m here) on the deck without ever touching water,
        # from the near end across and out onto the far bank, beyond the deck's far end
        r1 = page.evaluate("([x, z, th]) => window.__mm.sim(x, z, th, 12, 6, ['KeyW'])", [a["x"], a["z"], th])
        assert car(page)["water"] is None, r1
        r2 = page.evaluate("([x, z, th, v]) => window.__mm.sim(x, z, th, v, 12, ['KeyW'])", [r1["x"], r1["z"], th, r1["speed"]])
        assert r2["bridge"] is False and car(page)["water"] is None, r2
        assert math.hypot(r2["x"] - a["x"], r2["z"] - a["z"]) > st["len"]   # across and beyond b
        b.close()


@needs_world
def test_u_again_removes_the_bridge_and_drops_a_car_on_it(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        st = build(page)
        a, bb = st["a"], st["b"]
        mid = ((a["x"] + bb["x"]) / 2, (a["z"] + bb["z"]) / 2)
        seat_on_deck(page, *mid, bearing(st))
        assert car(page)["bridge"] is True
        page.keyboard.press("KeyU")
        assert pontoon(page)["dir"] == -1
        half = pontoon_sim(page, 1.6)
        assert half["on"] is True and 0.4 < half["built"] < 0.6           # the far half is gone, the near half still stands
        assert ground(page, *mid) < 0                                       # river bed under the midpoint again
        gone = pontoon_sim(page, 2)
        assert gone["on"] is False
        page.evaluate("([x, z, th]) => window.__mm.sim(x, z, th, 0, 0.5)", [mid[0], mid[1], NORTH])
        assert car(page)["water"] is not None
        b.close()


@needs_world
def test_u_refuses_away_from_the_rhine_and_next_to_a_bridge(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        place(page, INLAND, NORTH)
        assert pontoon(page)["prompt"] is None
        page.keyboard.press("KeyU")
        st = pontoon(page)
        assert st["on"] is False and st["error"] == "noBank"
        page.wait_for_function("() => /Rheinufer|Rhine bank/.test(document.querySelector('#toast').textContent)", timeout=120000)
        place(page, AT_BRIDGE, math.pi)
        page.keyboard.press("KeyU")
        st = pontoon(page)
        assert st["on"] is False and st["error"] == "hasBridge"
        b.close()


@needs_world
def test_a_pontoon_crossing_is_not_counted_and_the_build_freezes_while_paused(server):
    with sync_playwright() as p:
        b, page = open_world(p, server)
        st = build(page)
        a, bb = st["a"], st["b"]
        seat_on_deck(page, (a["x"] + bb["x"]) / 2, (a["z"] + bb["z"]) / 2, bearing(st))
        page.wait_for_function("() => window.__mm.raceFlags().pontoon === true", timeout=120000)   # the live loop's stepRace sets it
        page.keyboard.press("KeyU")                                           # start a removal, then pause
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        built0 = pontoon(page)["built"]
        f0 = page.evaluate("() => window.__mm.pause().frame")
        page.wait_for_function("(f) => window.__mm.pause().frame >= f + 3", arg=f0, timeout=120000)
        assert pontoon(page)["built"] == built0
        b.close()


@needs_world
def test_a_pontoon_crossing_in_a_present_hunt_is_not_counted(server):
    """review of PR #193: stepRace returns early for the hunt, so R.pontoon was never set there"""
    with sync_playwright() as p:
        b, page = open_world(p, server, "#huntbtn")
        assert page.evaluate("() => window.__mm.hunt().mode") == "hunt"
        st = build(page)
        a, bb = st["a"], st["b"]
        seat_on_deck(page, (a["x"] + bb["x"]) / 2, (a["z"] + bb["z"]) / 2, bearing(st))
        page.wait_for_function("() => window.__mm.raceFlags().pontoon === true", timeout=120000)
        b.close()
