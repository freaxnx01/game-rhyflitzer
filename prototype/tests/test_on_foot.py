"""#202 on foot: Z gets out of the stopped car and back in next to it, the walker walks with gravity, F toggles hover
(Space up, Shift down), the car's colliders stop the walker, and a get-out makes a race run not count.
Hand-traced layout (world + terrain blocked): no data files needed. footSim steps the walker headless (a headless frame is slow).
Slow (Playwright): run in the foreground."""
import math

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)   # a vertex of the hand Bahnhofstrasse and checkpoint 1 (Bahnhof Sisseln)


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")
    return b, page, errors


def foot(page):
    return page.evaluate("() => window.__mm.foot()")


def foot_sim(page, secs, hold=()):
    return page.evaluate("([s, h]) => window.__mm.footSim(s, h)", [secs, list(hold)])


def toast(page):
    return page.evaluate("() => document.querySelector('#toast').textContent")


def press_z(page):
    page.keyboard.press("z")
    page.wait_for_timeout(200)


def test_z_gets_out_and_back_in_next_to_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = SISSELN
        page.evaluate(f"() => window.__mm.sim({x}, {z}, 0, 10, 0.05, [])")   # rolling at ~10 m/s
        press_z(page)
        moving = {"foot": foot(page)["on"], "toast": toast(page)}
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        out = foot(page)
        page.wait_for_function("() => window.__mm.foot().cam.y > window.__mm.foot().y + 1.5", timeout=60000)
        out_cam = foot(page)
        out_toast = toast(page)
        walked = foot_sim(page, 3, ["KeyS"])   # walk backwards, away from the car's side
        press_z(page)
        far = {"foot": foot(page)["on"], "toast": toast(page)}
        foot_sim(page, 3, ["KeyW"])            # back to where you got out
        press_z(page)
        back = foot(page)
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        page.keyboard.press("KeyR")
        page.wait_for_timeout(200)
        reset = foot(page)
        b.close()
    assert errors == []
    assert moving["foot"] is False and "Stop" in moving["toast"], moving
    assert out["on"] is True and out["hover"] is False, out
    assert abs(out["car"]["x"] - x) < 0.01 and abs(out["car"]["z"] - z) < 0.01, out
    assert 1.0 < math.hypot(out["x"] - x, out["z"] - z) < 3.0, out          # beside the car
    assert out_cam["carVisible"] is True, out_cam
    assert abs(out_cam["cam"]["y"] - out_cam["y"] - 1.7) < 0.05, out_cam    # first person at eye height
    assert "Z" in out_toast, out_toast
    assert abs(walked["carMesh"]["x"] - x) < 0.01, walked                   # the car stayed where it stopped
    assert far["foot"] is True and ("car" in far["toast"] or "Auto" in far["toast"]), far
    assert back["on"] is False and abs(back["x"] - x) < 0.01 and abs(back["z"] - z) < 0.01, back
    assert reset["on"] is False, reset                                      # R puts you back in the car


def test_walls_stop_the_walker_and_hover_lands_on_the_roof(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        o = page.evaluate(f"() => window.__mm.nearestSolid({SISSELN[0]}, {SISSELN[1]})")
        assert o is not None
        sx, sz = o["x"] + o["c"] * (o["hw"] + 6), o["z"] + o["s"] * (o["hw"] + 6)   # 6 m out from the +x face
        th = math.atan2(-o["s"], -o["c"])                                            # facing the box
        page.evaluate(f"() => window.__mm.place({SISSELN[0]}, {SISSELN[1]}, 0)")   # park the car away from the box
        press_z(page)
        assert foot(page)["on"] is True
        page.evaluate(f"() => window.__mm.place({sx}, {sz}, {th})")   # on foot, place moves P, i.e. the walker
        hit = foot_sim(page, 4, ["KeyW"])
        page.keyboard.press("KeyF")
        page.wait_for_timeout(100)
        climb = (o["h"] - hit["y"]) / 6 + 1
        up = foot_sim(page, climb, ["Space"])
        over = foot_sim(page, 0.4, ["KeyW"])   # 4.4 m in over the roof (hover speed 11 m/s)
        page.keyboard.press("KeyF")
        page.wait_for_timeout(100)
        landed = foot_sim(page, 3)
        b.close()
    assert errors == []

    def local_x(s):
        dx, dz = s["x"] - o["x"], s["z"] - o["z"]
        return dx * o["c"] + dz * o["s"]

    assert local_x(hit) >= o["hw"] + 0.35 - 0.05, (hit, o)                 # stopped at the wall
    assert up["hover"] is True and up["y"] > o["h"], (up, o)
    assert local_x(over) < o["hw"], (over, o)                               # over the roof now
    assert landed["hover"] is False and abs(landed["y"] - o["h"]) < 0.05, (landed, o)   # standing on it, not inside
