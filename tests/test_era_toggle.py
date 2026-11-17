"""#530: Ctrl+Y shows the Swiss villages as in 1952 (newer buildings hidden, colliders off) and back; the borders toggle stays put.
Needs the Hochrhein world (run pipeline/osm.py build first). Slow (Playwright): run in the foreground."""
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && window.__mm.era && document.querySelector('#worldstatus')?.textContent"
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_game(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 640, "height": 360}, locale="en-US").new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


ERA = "() => window.__mm.era()"
BORDERS = "() => window.__mm.borders().on"


def test_help_lists_ctrl_y_with_the_era_label(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 640, "height": 360}, locale="en-US").new_page()
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html", wait_until="domcontentloaded")
        label = page.evaluate("""() => document.querySelector('[data-cmd="ctrl+KeyY"] + [data-i18n="keyEra"]')?.textContent""")
        b.close()
    assert label, "help row with Ctrl+Y followed by keyEra is missing"


@needs_world
def test_ctrl_y_hides_newer_buildings_and_back(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        e0 = page.evaluate(ERA); borders0 = page.evaluate(BORDERS)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        e1 = page.evaluate(ERA); toast = page.evaluate("() => document.querySelector('#toast').textContent"); borders1 = page.evaluate(BORDERS)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        e2 = page.evaluate(ERA); borders2 = page.evaluate(BORDERS)
        b.close()
    assert e0["available"] and e0["solids"] > 1000 and e0["off"] == 0 and e0["visible"], e0
    assert e1["on"] and e1["off"] == e1["solids"] and not e1["visible"], e1
    assert "Ctrl+Y" in toast, toast
    assert borders0 == borders1 == borders2
    assert not e2["on"] and e2["off"] == 0 and e2["visible"], e2
    assert page.errors == []


@needs_world
def test_switching_back_inside_a_building_moves_the_player(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        x, z = page.evaluate("() => window.__mm.era().sample")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [x, z])
        inside_before = page.evaluate(ERA)["inside"]
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        car = page.evaluate("() => window.__mm.car()"); after = page.evaluate(ERA)
        b.close()
    assert inside_before, "the sample spot lies inside a hidden building"
    assert not after["inside"] and math.hypot(car["x"] - x, car["z"] - z) > 1, (car, x, z)
    assert page.errors == []


@needs_world
def test_style_switch_keeps_the_layer(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        before = page.evaluate(ERA)["materials"]
        page.keyboard.press("t")
        page.wait_for_function("(m) => JSON.stringify(window.__mm.era().materials) !== m", arg=__import__("json").dumps(before), timeout=60000)
        during = page.evaluate(ERA)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        after = page.evaluate(ERA)
        b.close()
    assert not during["visible"] and during["on"], during
    assert after["visible"], after
    assert page.errors == []


@needs_world
def test_delivery_refuses_the_layer_and_a_shift_switches_back(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        page.evaluate("() => window.__mm.deliveryStart(1)")
        page.wait_for_function("() => window.__mm.delivery().on", timeout=60000)
        started = page.evaluate(ERA)
        page.keyboard.press("Control+y")
        refused = page.evaluate(ERA); toast = page.evaluate("() => document.querySelector('#toast').textContent")
        b.close()
    assert not started["on"] and started["visible"], started
    assert not refused["on"], (refused, toast)
    assert page.errors == []


def modern_unique_plate():
    import json
    from collections import Counter
    bs = json.loads(WORLD.read_text(encoding="utf-8"))["buildings"]
    counts = Counter(b["addr"] for b in bs if b.get("addr"))
    return next(b["addr"] for b in bs if b.get("modern") and b.get("addr") and counts[b["addr"]] == 1)


@needs_world
def test_hidden_buildings_leave_map_plates_and_jumps(server):
    plate = modern_unique_plate()
    with sync_playwright() as p:
        b, page = open_game(p, server)
        boxes0 = page.evaluate("() => window.__mm.mapBoxes()")
        spots0 = page.evaluate("(t) => window.__mm.plateSpots(t)", plate)
        page.keyboard.press("j")
        page.wait_for_function("() => window.__mm.jumpList().length > 0", timeout=60000)
        jumps0 = page.evaluate("() => window.__mm.jumpList()")
        page.keyboard.press("Escape")
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        boxes1 = page.evaluate("() => window.__mm.mapBoxes()")
        spots1 = page.evaluate("(t) => window.__mm.plateSpots(t)", plate)
        page.keyboard.press("j")
        page.wait_for_function("() => window.__mm.jumpList().length > 0", timeout=60000)
        jumps1 = page.evaluate("() => window.__mm.jumpList()")
        page.keyboard.press("Escape")
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        boxes2 = page.evaluate("() => window.__mm.mapBoxes()")
        spots2 = page.evaluate("(t) => window.__mm.plateSpots(t)", plate)
        page.keyboard.press("j")
        page.wait_for_function("() => window.__mm.jumpList().length > 0", timeout=60000)
        jumps2 = page.evaluate("() => window.__mm.jumpList()")
        page.keyboard.press("Escape")
        b.close()
    assert boxes0 - boxes1 >= 1000, (boxes0, boxes1)
    assert len(spots0) == 1 and spots1 == [], (spots0, spots1)
    assert any(r.get("modern") for r in jumps0), "no modern J entry in the Hochrhein data: the filter would be untested"
    assert not any(r.get("modern") for r in jumps1), jumps1
    assert len(jumps1) < len(jumps0) and len(jumps2) == len(jumps0), (len(jumps0), len(jumps1), len(jumps2))
    assert boxes2 == boxes0 and spots2 == spots0
    assert page.errors == []


@needs_world
def test_about_names_the_gwr(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        page.evaluate("() => document.querySelector('#about')?.removeAttribute('hidden')")
        text = page.evaluate("() => document.querySelector('#about').textContent")
        href = page.evaluate("() => document.querySelector('#about a[data-link=gwr]').href")
        b.close()
    assert "GWR" in text and href.startswith("https://www.housing-stat.ch"), (text[:200], href)
    assert page.errors == []


@needs_world
def test_a_race_in_1952_is_flagged_and_not_clean(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        page.evaluate("() => window.__mm.startHunt(1)")
        before = page.evaluate("() => window.__mm.raceFlags()")
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        armed = page.evaluate("() => window.__mm.raceFlags()")
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        page.evaluate("() => window.__mm.startHunt(1)")
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        page.evaluate("() => window.__mm.startHunt(1)")  # armed again with the layer on
        rearmed = page.evaluate("() => window.__mm.raceFlags()")
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        page.evaluate("() => window.__mm.startHunt(1)")
        after = page.evaluate("() => window.__mm.raceFlags()")
        b.close()
    assert not before["era"] and armed["era"] and rearmed["era"] and not after["era"], (before, armed, rearmed, after)
    assert page.errors == []


@needs_world
def test_era_hides_new_roads_and_bridge_deck(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        e0 = page.evaluate(ERA)
        gx, gz = e0["goneSample"]; dx, dz = e0["deckSample"]
        road0 = page.evaluate("([x, z]) => window.__mm.era().roadMeshAt(x, z)", [gx, gz])
        deck0 = page.evaluate("([x, z]) => window.__mm.era().bridgeAt(x, z)", [dx, dz])
        mesh0 = page.evaluate("([x, z]) => window.__mm.era().meshAt(x, z)", [dx, dz])
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        road1 = page.evaluate("([x, z]) => window.__mm.era().roadMeshAt(x, z)", [gx, gz])
        deck1 = page.evaluate("([x, z]) => window.__mm.era().bridgeAt(x, z)", [dx, dz])
        mesh1 = page.evaluate("([x, z]) => window.__mm.era().meshAt(x, z)", [dx, dz])
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        road2 = page.evaluate("([x, z]) => window.__mm.era().roadMeshAt(x, z)", [gx, gz])
        deck2 = page.evaluate("([x, z]) => window.__mm.era().bridgeAt(x, z)", [dx, dz])
        b.close()
    assert e0["roadsHidden"] > 50, e0["roadsHidden"]
    assert road0 and deck0, (road0, deck0)
    assert not road1 and not deck1, (road1, deck1)
    assert mesh0 and not mesh1, (mesh0, mesh1)
    assert road2 and deck2, (road2, deck2)
    assert page.errors == []


def toast_text(page):
    return page.evaluate("() => window.__mm.toast().text")


def car_of(page):
    return page.evaluate("() => window.__mm.car()")


@needs_world
def test_era_road_gone_moves_car_off_street(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        gx, gz = page.evaluate(ERA)["goneSample"]
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [gx, gz])
        assert page.evaluate(ERA)["goneHere"], "the sample lies on a road gone in 1952"
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        toast = toast_text(page)
        car = car_of(page); e = page.evaluate(ERA)
        ground = page.evaluate("([x, z]) => window.__mm.probe(x, z).terrain", [car["x"], car["z"]])
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        car2 = car_of(page); toast2 = toast_text(page)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        toast3 = toast_text(page)
        b.close()
    assert "did not exist" in toast, toast
    assert math.hypot(car["x"] - gx, car["z"] - gz) > 3, (car, gx, gz)
    assert not e["goneHere"] and abs(car["y"] - ground) < 1.5, (e, car, ground)
    assert math.hypot(car2["x"] - car["x"], car2["z"] - car["z"]) < 1, (car, car2)
    assert "did not exist" not in toast2 and "1952" in toast2, toast2
    assert "did not exist" not in toast3, toast3
    assert page.errors == []


@needs_world
def test_era_road_gone_moves_car_off_bridge(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        dx, dz = page.evaluate(ERA)["deckSample"]
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [dx, dz])
        y0 = car_of(page)["y"]
        assert page.evaluate(ERA)["goneHere"], "the deck sample counts as a gone spot"
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        page.wait_for_timeout(2000)
        car = car_of(page); e = page.evaluate(ERA)
        page.wait_for_timeout(500)
        car_later = car_of(page)
        water = page.evaluate("([x, z]) => window.__mm.probe(x, z).water", [car["x"], car["z"]])
        b.close()
    assert not e["goneHere"], e
    assert water is None or car["y"] > water, (car, water)
    assert abs(car_later["y"] - car["y"]) < 0.3, (car, car_later)
    assert math.hypot(car["x"] - dx, car["z"] - dz) > 3, (car, dx, dz)
    assert page.errors == []


@needs_world
def test_era_road_logic_follows_layer(server):
    with sync_playwright() as p:
        b, page = open_game(p, server)
        page.keyboard.press("KeyO"); page.keyboard.type("Smile"); page.keyboard.press("Enter")
        page.wait_for_function("() => window.__mm.auto().on", timeout=60000)
        page.wait_for_function("() => window.__mm.era().buses > 0", timeout=120000)
        e0 = page.evaluate(ERA); j0 = e0["jumpableRoads"]
        page.keyboard.press("Control+y")
        page.wait_for_function("() => window.__mm.era().on", timeout=60000)
        auto = page.evaluate("() => window.__mm.auto().on"); e = page.evaluate(ERA)
        page.keyboard.press("Control+y")
        page.wait_for_function("() => !window.__mm.era().on", timeout=60000)
        j2 = page.evaluate(ERA)["jumpableRoads"]
        b.close()
    assert auto is False
    assert e0["buses"] > 0, "buses ran before the toggle"
    assert e0["jumpsOnGone"] > 0, "some J entry lands on a road gone in 1952 while the layer is off"
    assert e["jumpsOnGone"] == 0 and e["buses"] == 0, e
    assert e["jumpableRoads"] < j0 and j2 == j0, (j0, e["jumpableRoads"], j2)
    assert page.errors == []
