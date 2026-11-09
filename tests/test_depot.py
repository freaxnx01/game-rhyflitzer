"""#553: every vehicle stands on the DSM car park in Sisseln; drive or walk up to one, press E, drive on in it.
Hand-traced layout (world + terrain blocked): no data files needed, deterministic.
Slow (Playwright): run in the foreground."""
import math

from playwright.sync_api import sync_playwright

from test_carselect import ARGS, MMH_ROUTE, T, wait_frames

DEPOT_JS = "() => window.__mm.depot()"
AT_DEPOT = "() => window.__mm.sim(832.3, -107.5, 0, 0, 0.1, [])"
ALL_BUILT = "() => { const d = window.__mm.depot(); return d.slots.length === window.__mm.carsel().count && d.slots.every(s => s.model === 'gltf' || s.id === window.__mm.carsel().id); }"


def open_page(p, server, query=""):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.depot && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errors


def depot(page):
    return page.evaluate(DEPOT_JS)


def test_depot_builds_every_vehicle_and_leaves_the_driven_car_alone(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        before = page.evaluate("() => window.__mm.carStats()")
        page_count = len(page.evaluate("() => window.__mm.carGallery().ids"))
        page.evaluate(AT_DEPOT)
        page.wait_for_function(ALL_BUILT, timeout=240000)
        d = depot(page)
        after = page.evaluate("() => window.__mm.carStats()")
        b.close()
    me = [s for s in d["slots"] if s["id"] == "compact"][0]
    assert d["on"] and len(d["slots"]) == page_count, d
    assert not me["shown"] and not me["solid"], me                       # the driven car's slot is empty
    assert all(s["shown"] and s["solid"] for s in d["slots"] if s["id"] != "compact"), d
    assert after == before, (before, after)
    assert not errors, errors


def test_parked_cars_are_solid_and_far_ones_hidden(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(ALL_BUILT, timeout=240000)
        d = depot(page)
        high = [s for s in d["slots"] if abs(s["th"] + math.pi / 2) < 1e-9 and s["id"] != "compact"]
        target = min(high, key=lambda s: math.hypot(s["x"] - 832.3, s["z"] + 107.5))
        th = math.atan2(target["z"] + 107.5, target["x"] - 832.3)
        res = page.evaluate(f"() => window.__mm.sim(832.3, -107.5, {th}, 15, 2, [])")   # straight at the slot, no gas
        page.evaluate("() => window.__mm.sim(832.3 - 350, -107.5, 0, 0, 0.1, [])")      # 350 m west: far
        far = depot(page)
        b.close()
    # carReach from where the car ended: outside the slot's box (the collider pushed it back), but it reached the box
    c, s = math.cos(target["th"]), math.sin(target["th"])
    dx, dz = res["x"] - target["x"], res["z"] - target["z"]
    lx, lz = abs(dx * c + dz * s), abs(-dx * s + dz * c)
    reach = math.hypot(max(0.0, lx - target["l"] / 2), max(0.0, lz - target["w"] / 2))
    assert 0 < reach < 4 and res["speed"] < 5, (res, target, reach)
    assert all(s["shown"] is False for s in far["slots"]), far
    assert not errors, errors


def test_parked_paint_ignores_later_repaints(server):
    """Choose car's swiss repaint must not reach the parked copies (deep-cloned materials): the hyper keeps its factory blue."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(ALL_BUILT, timeout=240000)
        before = {s["id"]: s for s in depot(page)["slots"]}["hyper"]
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=T)
        page.click("#cspaints button[data-paint=swiss]")
        driven = page.evaluate("() => window.__mm.carsel().bodyColor")
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.carsel().open", timeout=T)
        after = {s["id"]: s for s in depot(page)["slots"]}["hyper"]
        b.close()
    assert driven == "e0322d", driven                                # the driven compact took the swiss paint
    assert before["paint"] == "#2266dd", before                      # the Rhy Hyper's factory racing blue
    assert after["paint"] == "#2266dd", after
    assert not errors, errors


# ---------- Task 4: boarding with E ----------
HYPER_MODEL = "() => window.__mm.depot().slots.some(s => s.id === 'hyper' && s.model)"


def board_from_car(page, target):
    """Stand still 2 m in front of the target's nose, wait for the prompt, press E."""
    s = [s for s in page.evaluate(DEPOT_JS)["slots"] if s["id"] == target][0]
    page.evaluate("(s) => window.__mm.sim(s.x + Math.cos(s.th) * (s.l / 2 + 2), s.z + Math.sin(s.th) * (s.l / 2 + 2), s.th + Math.PI, 0, 0.2, [])", s)
    page.wait_for_function(f"() => window.__mm.depot().near === '{target}'", timeout=T)
    page.keyboard.press("KeyE")
    page.wait_for_function(f"() => window.__mm.carsel().id === '{target}'", timeout=T)
    wait_frames(page)


def slots_by_id(page):
    return {s["id"]: s for s in depot(page)["slots"]}


def test_e_in_the_car_boards_the_parked_vehicle(server):
    """Boards the hypercar before its model is loaded; the compact goes home, the hypercar's slot empties."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(HYPER_MODEL, timeout=T)
        board_from_car(page, "hyper")
        d = depot(page)
        b.close()
    slot = {s["id"]: s for s in d["slots"]}
    assert slot["compact"]["shown"] and slot["compact"]["solid"], slot["compact"]
    assert not slot["hyper"]["shown"] and not slot["hyper"]["solid"], slot["hyper"]
    assert not errors, errors


def test_boarding_on_foot(server):
    """Z next to the strip, walk up: the key bar offers E 'get in', E boards, the compact goes home."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function("() => window.__mm.depot().slots.some(s => s.model)", timeout=T)
        target = min((s for s in depot(page)["slots"] if s["id"] != "compact" and abs(s["th"] + math.pi / 2) < 1e-9),
                     key=lambda s: math.hypot(s["x"] - 832.3, s["z"] + 107.5))
        nose = (target["x"] + math.cos(target["th"]) * target["l"] / 2, target["z"] + math.sin(target["th"]) * target["l"] / 2)
        q = (target["x"] + math.cos(target["th"]) * (target["l"] / 2 + 2), target["z"] + math.sin(target["th"]) * (target["l"] / 2 + 2))
        page.evaluate(f"() => window.__mm.sim({target['x'] + 4}, -107.5, {-math.pi / 2}, 0, 0.1, [])")
        page.keyboard.press("KeyZ")                                  # get out on the aisle, clear of the rows
        page.wait_for_function("() => window.__mm.foot().on", timeout=T)
        f = page.evaluate("() => window.__mm.foot()")
        turn = math.atan2(q[1] - f["z"], q[0] - f["x"]) - f["th"]     # aim the walker at the nose + 2 m
        turn = (turn + math.pi) % (2 * math.pi) - math.pi
        page.evaluate(f"() => window.__mm.footLook({turn / 0.0025}, 0)")
        page.evaluate("([s, h]) => window.__mm.footSim(s, h)", [math.hypot(q[0] - f["x"], q[1] - f["z"]) / 4.5, ["KeyW"]])
        page.wait_for_function(f"() => window.__mm.depot().near === '{target['id']}'", timeout=T)
        bar = page.evaluate("() => window.__mm.keybar()")
        prompt = page.evaluate("() => document.querySelector('#prompt').textContent")
        page.keyboard.press("KeyE")
        page.wait_for_function(f"() => window.__mm.carsel().id === '{target['id']}'", timeout=T)
        wait_frames(page)
        d = depot(page)
        on_foot = page.evaluate("() => window.__mm.foot().on")
        b.close()
    assert bar["action"] == "board" and "get in" in bar["text"], bar
    assert "get in" in prompt, prompt
    assert on_foot is False
    slot = {s["id"]: s for s in d["slots"]}
    assert slot["compact"]["shown"] and slot["compact"]["solid"], slot["compact"]
    assert not slot[target["id"]]["shown"] and not slot[target["id"]]["solid"], slot[target["id"]]
    assert not errors, errors


def test_boarding_during_a_run_marks_it_swapped(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?mode=trial")
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(HYPER_MODEL, timeout=T)
        board_from_car(page, "hyper")
        flags = page.evaluate("() => window.__mm.raceFlags()")
        b.close()
    assert flags["swapped"] is True, flags
    assert not errors, errors


def test_e_elsewhere_in_the_car_does_nothing(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate("() => window.__mm.sim(1810, 610, 0, 0, 0.1, [])")   # the Bahnhofstrasse, far from the depot
        page.keyboard.press("KeyE")
        wait_frames(page)
        got = page.evaluate("() => ({ id: window.__mm.carsel().id, near: window.__mm.depot().near })")
        b.close()
    assert got == {"id": "compact", "near": None}, got
    assert not errors, errors


def test_too_fast_shows_no_prompt(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function("() => window.__mm.depot().slots.some(s => s.model)", timeout=T)
        s = min((x for x in depot(page)["slots"] if x["id"] != "compact" and abs(x["th"] + math.pi / 2) < 1e-9),
                key=lambda x: math.hypot(x["x"] - 832.3, x["z"] + 107.5))
        qx, qz = s["x"] + math.cos(s["th"]) * (s["l"] / 2 + 2), s["z"] + math.sin(s["th"]) * (s["l"] / 2 + 2)
        th = math.atan2(s["z"] - qz, s["x"] - qx)
        fast = page.evaluate(f"() => window.__mm.sim({qx}, {qz}, {th}, 10, 0.05, [])")   # 10 m/s, 2 m off the nose
        near_fast = depot(page)["near"]
        page.evaluate(f"() => window.__mm.sim({fast['x']}, {fast['z']}, {th}, 0, 0.05, [])")
        near_stopped = depot(page)["near"]
        b.close()
    assert near_fast is None, (near_fast, fast)
    assert near_stopped == s["id"], (near_stopped, fast, s)
    assert not errors, errors
