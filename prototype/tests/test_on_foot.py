"""#202 on foot: Z gets out of the stopped car and back in next to it, the walker walks with gravity, F toggles hover
(Space up, Shift down), the car's colliders stop the walker, and a get-out makes a race run not count.
Hand-traced layout (world + terrain blocked): no data files needed. footSim steps the walker headless (a headless frame is slow).
Slow (Playwright): run in the foreground."""
import math

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SISSELN = (1780, 560)   # a vertex of the hand Bahnhofstrasse and checkpoint 1 (Bahnhof Sisseln)
ROAD = (1810, 610)      # on the same Bahnhofstrasse, 56 m past checkpoint 1 (Sisseln, trigger radius 7 m): its toast cannot replace a "Stop first"


def open_hand(p, server, start="#startbtn"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click(start)
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
        x, z = ROAD
        page.evaluate(f"() => window.__mm.sim({x}, {z}, 0, 10, 0.05, [])")   # rolling at ~10 m/s
        press_z(page)
        moving = {"foot": foot(page)["on"], "toast": toast(page)}
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        page.wait_for_function(f"() => Math.abs(window.__mm.foot().carMesh.x - {x}) < 0.01", timeout=60000)   # the mesh catches up with the placement (a slow renderer draws it a frame late)
        press_z(page)
        out = foot(page)
        page.wait_for_function("() => Math.abs(window.__mm.foot().cam.y - window.__mm.foot().y - 1.7) < 0.05", timeout=120000)   # the eye has eased down
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


def test_a_get_out_makes_the_run_not_count_and_checkpoints_wait_for_the_car(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = SISSELN
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")   # the car takes checkpoint 1 (Bahnhof Sisseln)
        page.wait_for_function("() => window.__mm.blitz().done === 1", timeout=60000)
        press_z(page)
        assert foot(page)["on"] is True
        cx, cz = page.evaluate("() => window.__mm.blitz().cps[1]")   # checkpoint 2 (Sisslerfeld)
        page.evaluate(f"() => window.__mm.place({cx}, {cz}, 0)")     # the walker stands right in it
        foot_sim(page, 0.5)
        state = page.evaluate("() => ({ flags: window.__mm.raceFlags(), done: window.__mm.blitz().done })")
        b.close()
    assert errors == []
    assert state["flags"]["walked"] is True, state
    assert state["done"] == 1, state                           # checkpoint 2 waits for the car


def test_mouse_look_turns_and_pitches_and_a_lost_lock_pauses_once(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = SISSELN
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        th0 = foot(page)["th"]
        looked = page.evaluate("() => window.__mm.footLook(200, -200)")
        page.evaluate("() => window.__mm.footUnlock()")
        page.wait_for_timeout(200)
        paused = page.evaluate("() => !document.querySelector('#pause').hidden")
        page.keyboard.press("Escape"); page.wait_for_timeout(200)   # resume
        press_z(page)                                               # back in (still beside the car)
        page.evaluate("() => window.__mm.footUnlock()")             # the unlock after getting in must not pause
        page.wait_for_timeout(200)
        after_in = page.evaluate("() => ({ paused: !document.querySelector('#pause').hidden, foot: window.__mm.foot().on })")
        b.close()
    assert errors == []
    assert looked["th"] > th0 and looked["pitch"] > 0, looked
    assert paused is True
    assert after_in == {"paused": False, "foot": False}, after_in


def test_n_held_on_foot_doubles_the_walking_speed(server):
    """#404: N is nitro on foot; the car stays parked and nothing else reacts to it."""
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        press_z(page)
        a = foot(page); foot_sim(page, 1, ["KeyW"]); b1 = foot(page)
        plain = math.hypot(b1["x"] - a["x"], b1["z"] - a["z"])
        foot_sim(page, 1, ["KeyW", "KeyN"]); c = foot(page)
        fast = math.hypot(c["x"] - b1["x"], c["z"] - b1["z"])
        b.close()
    assert 4.0 < plain < 5.0, plain
    assert abs(fast - 2 * plain) < 0.5, (plain, fast)
    assert errors == []


FAKE_LOCK = """() => { const gl = document.getElementById('gl'); window.__lockCalls = 0; let held = null;
  Object.defineProperty(document, 'pointerLockElement', { get: () => held, configurable: true });
  gl.requestPointerLock = () => { window.__lockCalls++; held = gl; document.dispatchEvent(new Event('pointerlockchange')); };
  document.exitPointerLock = () => { held = null; document.dispatchEvent(new Event('pointerlockchange')); }; }"""   # headless Chromium cannot lock the pointer


def test_a_double_click_on_foot_beams_and_never_takes_the_mouse(server):   # #403
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        page.evaluate(FAKE_LOCK)
        px, py = page.evaluate("() => { for (let y = 700; y > 380; y -= 20) for (const x of [400, 640, 880]) if (window.__mm.beamPick(x, y)) return [x, y]; return [0, 0]; }")
        pick = page.evaluate("([x, y]) => window.__mm.beamPick(x, y)", [px, py])
        page.mouse.dblclick(px, py)
        page.wait_for_timeout(700)
        double = page.evaluate("() => ({ calls: window.__lockCalls, beam: window.__mm.beam(), foot: window.__mm.foot().on })")
        press_z(page)
        page.mouse.click(640, 360)
        page.wait_for_timeout(100)
        early = page.evaluate("() => window.__lockCalls")
        page.wait_for_timeout(600)
        single = page.evaluate("() => ({ calls: window.__lockCalls, foot: window.__mm.foot().on })")
        b.close()
    assert errors == []
    assert pick is not None
    assert double["calls"] == 0 and double["beam"] is not None and double["foot"] is False, double   # the car was beamed, the walk ended
    assert early == 0 and single == {"calls": 1, "foot": True}, (early, single)                     # a single click still grabs the mouse, after the delay


def test_j_and_f1_on_foot_let_the_mouse_go_and_keep_their_dialog(server):   # #365
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        res = {}
        for key, dialog in (("KeyJ", "#jump"), ("F1", "#help")):
            page.evaluate(FAKE_LOCK)
            page.evaluate("() => document.getElementById('gl').requestPointerLock()")
            page.keyboard.press(key)
            page.wait_for_timeout(200)
            res[key] = page.evaluate("([d]) => ({ locked: !!document.pointerLockElement, open: !document.querySelector(d).hidden, paused: !document.querySelector('#pause').hidden, foot: window.__mm.foot().on })", [dialog])
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
        b.close()
    assert errors == []
    for key in res:
        assert res[key] == {"locked": False, "open": True, "paused": False, "foot": True}, (key, res[key])


def test_time_up_on_foot_ends_the_walk_and_lets_the_mouse_go(server):   # #365
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server, start="#blitzbtn")
        x, z = ROAD
        page.keyboard.down("KeyW")                                           # armed -> racing
        page.wait_for_function("() => window.__mm.blitz().left < 90", timeout=120000)
        page.keyboard.up("KeyW")
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        page.evaluate(FAKE_LOCK)
        page.evaluate("() => document.getElementById('gl').requestPointerLock()")
        page.evaluate("() => window.__mm.blitzSetLeft(0.15)")
        page.wait_for_function("() => window.__mm.blitz().timeUp", timeout=120000)
        after = page.evaluate("() => ({ foot: window.__mm.foot().on, locked: !!document.pointerLockElement, result: !document.querySelector('#result').hidden, paused: !document.querySelector('#pause').hidden })")
        b.close()
    assert errors == []
    assert after == {"foot": False, "locked": False, "result": True, "paused": False}, after


def test_b_held_on_foot_looks_back_and_snaps_forward_again(server):   # #408
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        x, z = ROAD
        page.evaluate(f"() => window.__mm.place({x}, {z}, 0)")
        press_z(page)
        page.wait_for_function("() => Math.abs(window.__mm.foot().cam.y - window.__mm.foot().y - 1.7) < 0.05", timeout=120000)
        ahead = page.evaluate("() => window.__mm.cam().look")
        page.keyboard.down("KeyB")
        page.wait_for_function("(a) => { const d = window.__mm.cam().look; return d[0] * a[0] + d[2] * a[2] < -0.5; }", arg=ahead, timeout=120000)
        held = {"look": page.evaluate("() => window.__mm.cam().look"), "foot": foot(page)["on"], "th": foot(page)["th"]}
        page.keyboard.up("KeyB")
        page.wait_for_function("(a) => { const d = window.__mm.cam().look; return d[0] * a[0] + d[2] * a[2] > 0.5; }", arg=ahead, timeout=120000)
        b.close()
    assert errors == []
    assert held["foot"] is True and abs(held["th"]) < 0.01, held        # still on foot, the heading (and so the walking direction) unchanged
