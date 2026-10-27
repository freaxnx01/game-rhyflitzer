"""#462: the steam loco at Bahnhof Sisseln: board on foot, ride the real track, switches, smoke, sound. Slow (Playwright): foreground."""
import math
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
    page.wait_for_function("() => window.__mm && window.__mm.train && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def board(page):
    """Get out of the car, walk (placed) up to the loco's cab side and press Z."""
    page.keyboard.press("z"); page.wait_for_function("() => window.__mm.foot().on", timeout=60000)
    t = page.evaluate("() => window.__mm.train()")
    side = t["th"] + math.pi / 2
    page.evaluate("([x, z]) => window.__mm.place(x, z)", [t["x"] + math.cos(side) * 3.0, t["z"] + math.sin(side) * 3.0])
    page.keyboard.press("z"); page.wait_for_function("() => window.__mm.train().on", timeout=60000)


@needs_world
def test_the_loco_stands_on_the_track_at_sisseln_and_z_boards_it(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        t0 = page.evaluate("() => window.__mm.train()")
        board(page)
        t1 = page.evaluate("() => window.__mm.train()")
        car0 = page.evaluate("() => window.__mm.carPose().pos")
        page.evaluate("() => window.__mm.trainSim(10, ['KeyW'])")
        t2 = page.evaluate("() => window.__mm.train()")
        car1 = page.evaluate("() => window.__mm.carPose().pos")
        sfx = page.evaluate("() => window.__mm.sfx()")
        page.evaluate("() => window.__mm.trainSim(8.5, ['KeyS'])")   # 10 m/s down to rest (8.33 s); Z only gets out below 0.5 m/s
        page.keyboard.press("z"); page.wait_for_function("() => !window.__mm.train().on && window.__mm.foot().on", timeout=60000)
        out = page.evaluate("() => ({ ...window.__mm.foot(), t: window.__mm.train() })")
        b.close()
    assert errors == []
    assert t0["placed"] and t0["railDist"] < 0.5 and math.hypot(t0["x"] - 1854.2, t0["z"] - 685.8) < 200, t0
    assert t1["on"] and not t1["foot"], t1
    assert math.hypot(t2["x"] - t1["x"], t2["z"] - t1["z"]) > 20 and t2["railDist"] < 0.5 and t2["kmh"] > 20, t2
    assert car0 == car1, "the parked car stays put while the loco drives"
    assert sfx["engine"] == 0, sfx
    assert out["on"] and math.hypot(out["x"] - out["t"]["x"], out["z"] - out["t"]["z"]) < 6, out


@needs_world
def test_z_near_the_car_still_gets_in_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        page.keyboard.press("z"); page.wait_for_function("() => window.__mm.foot().on", timeout=60000)
        page.keyboard.press("z"); page.wait_for_function("() => !window.__mm.foot().on", timeout=60000)
        t = page.evaluate("() => window.__mm.train()")
        b.close()
    assert errors == [] and not t["on"], t


@needs_world
def test_a_car_reset_ends_the_train_and_leaves_the_loco_where_it_stands(server):
    """J, the map, the beam and Start all go through resetCar: back in the car, the train mode off, the loco left on the track."""
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        page.evaluate("() => window.__mm.trainSim(8, ['KeyW'])")
        before = page.evaluate("() => window.__mm.train()")
        page.evaluate("() => window.__mm.resetCar()")
        after = page.evaluate("() => ({ t: window.__mm.train(), foot: window.__mm.foot().on })")
        b.close()
    assert errors == []
    assert not after["t"]["on"] and not after["foot"], after
    assert math.hypot(after["t"]["x"] - before["x"], after["t"]["z"] - before["z"]) < 0.5 and after["t"]["kmh"] == 0, after


@needs_world
def test_q_before_a_switch_takes_the_left_branch_and_the_arrow_shows_it(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        appr = page.evaluate("() => window.__mm.trainApproaches(30)")
        a = next(x for x in appr if x["left"] != x["straight"])
        page.evaluate("(a) => window.__mm.trainPut({ edge: a.edge, s: a.s, dir: a.dir })", a)
        page.keyboard.press("q")
        page.wait_for_function("() => document.getElementById('switcharrow').textContent === '←'", timeout=120000)   # the HUD updates in the next frame; headless draws < 1 fps
        arrow = page.evaluate("() => document.getElementById('switcharrow').textContent")
        chose = page.evaluate("() => window.__mm.train().choice")
        page.evaluate("() => window.__mm.trainSim(12, ['KeyW'])")
        t = page.evaluate("() => window.__mm.train()")
        b.close()
    assert errors == []
    assert chose == -1 and arrow == "←", (chose, arrow)
    assert a["left"] in t["trail"], (t, a)   # the first edge after the switch was the left branch
    assert t["choice"] == 0, t


@needs_world
def test_r_puts_the_loco_back_at_sisseln(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        home = page.evaluate("() => window.__mm.train()")
        board(page)
        page.evaluate("() => window.__mm.trainSim(8, ['KeyW'])")
        page.keyboard.press("r")
        page.wait_for_function("() => window.__mm.train().kmh === 0", timeout=60000)
        back = page.evaluate("() => window.__mm.train()")
        b.close()
    assert errors == []
    assert back["on"] and math.hypot(back["x"] - home["x"], back["z"] - home["z"]) < 0.5, back


@needs_world
def test_steam_smoke_rises_and_h_whistles(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        board(page)
        page.evaluate("() => window.__mm.trainSim(6, ['KeyW'])")
        t = page.evaluate("() => window.__mm.train()")
        page.keyboard.press("h"); page.wait_for_timeout(200)
        w = page.evaluate("() => window.__mm.train().whistles")
        b.close()
    assert errors == []
    assert t["puffs"] > 5, t
    assert w == 1, w
