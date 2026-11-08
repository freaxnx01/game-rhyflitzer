"""#500: Postautos on line 133 by the weekday timetable. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
needs_data = pytest.mark.skipif(not TT.exists(), reason="run the #682 timetable cut first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def hhmm(secs):
    secs = int(secs) % 86400
    return f"{secs // 3600:02d}:{secs // 60 % 60:02d}"


def open_at(p, server, patime):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/index.html?patime={patime}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
    return b, page, errors


@needs_data
def test_postauto_drives_line_133_with_led(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.some(x => x.led)", timeout=120000)
        bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses") if x["led"])
        assert bus["line"] == "133" and bus["led"]["line"] == "133" and bus["led"]["dest"]
        s0 = bus["s"]
        page.wait_for_timeout(3000)
        moved = page.evaluate("() => window.__mm.postauto().buses")
        assert any(x["s"] != s0 or x["phase"] == "stand" for x in moved)
        assert not errors
        b.close()


@needs_data
def test_postauto_display_uses_the_models_own_slot(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postautoDisplay().buses.length > 0", timeout=120000)
        d = page.evaluate("() => window.__mm.postautoDisplay()")
        assert d["cachedMapWidth"] == 512            # the shared baked texture is untouched
        for bus in d["buses"]:
            assert bus["planes"] == 0                # no floating plane any more
            assert bus["displays"] == 1 and bus["own"] and bus["ownMap"] and bus["flipY"] is False
            assert bus["led"]["line"] == "133" and bus["led"]["dest"]
        assert not errors
        b.close()


@needs_data
def test_postauto_wheels_turn_and_the_floor_shows_from_inside(server):
    """#709: a driving Postauto's wheels advance, and the bus underbody gets a copy drawn from above; the shell material itself
    stays front-sided (THREE.FrontSide = 0): drawn from both sides it lines the walls too and hid the yellow (#723)."""
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.some(x => x.phase === 'drive' && x.wheelSpin !== null && x.v > 1)", timeout=120000)
        first = page.evaluate("() => window.__mm.postauto().buses.find(x => x.phase === 'drive' && x.wheelSpin !== null && x.v > 1)")
        page.wait_for_function("(k) => { const x = window.__mm.postauto().buses.find(q => q.key === k); return x && x.wheelSpin !== null && x.wheelSpin !== %s; }" % first["wheelSpin"], arg=first["key"], timeout=30000)
        floor = page.evaluate("() => window.__mm.postauto().floor")
        assert floor["faces"] > 0 and floor["shellSide"] == 0, floor   # 65 large faces, about 27 m2
        assert not errors, errors
        b.close()


@needs_data
def test_player_bounces_off_a_standing_postauto(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    # the clock would run on while SwiftShader renders; freeze it the moment the bus stands,
    # so the 60 s stand window is still open when the camera and the frames are ready
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
        page.clock.install()
        page.goto(f"{server}/index.html?patime={hhmm(trip['calls'][0][2] - 90)}")
        page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
        page.click("#startbtn")
        page.wait_for_function("() => window.__mm.postauto().buses.some(x => x.phase === 'stand' && x.k === 0)", timeout=120000)
        page.clock.set_fixed_time(page.evaluate("() => Date.now()"))   # zero-jump freeze of the patime clock
        bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses") if x["phase"] == "stand")
        # drive at the bus side-on from 15 m away; the car must end up outside the bus box
        nx, nz = -math.sin(bus["th"]), math.cos(bus["th"])
        x0, z0 = bus["x"] - nx * 15, bus["z"] - nz * 15
        page.evaluate(f"() => window.__mm.sim({x0}, {z0}, {math.atan2(nz, nx)}, 8, 3)")
        car = page.evaluate("() => window.__mm.carPose().pos")
        lateral = (car[0] - bus["x"]) * nx + (car[2] - bus["z"]) * nz
        assert lateral < -1.2   # stopped on its own side of the bus
        b.close()
