"""#553: every vehicle stands on the DSM car park in Sisseln; drive or walk up to one, press E, drive on in it.
Hand-traced layout (world + terrain blocked): no data files needed, deterministic.
Slow (Playwright): run in the foreground."""
import math

from playwright.sync_api import sync_playwright

from test_carselect import ARGS, MMH_ROUTE, T, wait_frames

DEPOT_JS = "() => window.__mm.depot()"
AT_DEPOT = "() => window.__mm.sim(832.3, -107.5, 0, 0, 0.1, [])"
# #807: the depot keeps at most DEPOT.nearMax (6) real models alive; every other slot shows a box
NEAR_BUILT = "() => { const d = window.__mm.depot(); return d.slots.length === window.__mm.carsel().count && d.real === Math.min(6, d.slots.filter(s => s.id !== window.__mm.carsel().id).length) && d.slots.every(s => s.model); }"
# every slot placed means a box or a real model stands there; a slot's model arrives only when the player is near it
ALL_PLACED = "() => { const d = window.__mm.depot(); return d.slots.length === window.__mm.carsel().count && d.slots.every(s => s.model); }"
HYPER_GLTF = "() => window.__mm.depot().slots.some(s => s.id === 'hyper' && s.model === 'gltf')"


def open_page(p, server, query="", block_world=True):
    """block_world: the J list needs the OSM world's landmarks; everything else runs on the hand layout."""
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.depot && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errors


def depot(page):
    return page.evaluate(DEPOT_JS)


def test_depot_builds_only_the_nearest_models_and_frees_them(server):
    """#807: at the depot only the nearest DEPOT.nearMax slots hold a real model, the rest boxes; 600 m away
    every real model and every glTF file the depot loaded itself is given back."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        before = page.evaluate("() => window.__mm.carStats()")
        driven = page.evaluate("() => window.__mm.carsel().id")
        # the baseline 232 m short of the depot, its slots laid out as boxes and no real model yet: the scenery east of the
        # depot (signs, posts) is first drawn when the camera looks that way and stays resident, so a start-screen baseline
        # would count it as a leak
        page.evaluate("() => window.__mm.sim(600, -107.5, 0, 0, 0.1, [])")
        page.wait_for_function("() => { const d = window.__mm.depot(); return d.slots.length > 0 && d.real === 0 && d.slots.every(s => s.model === 'box'); }", timeout=T)
        page.wait_for_function("() => { const d = window.__mm.cam().d; return d[0] < -6 && Math.abs(d[2]) < 0.5; }", timeout=120000)   # the chase cam is behind the car, looking east
        wait_frames(page, 5)
        gpu0 = page.evaluate("() => window.__mm.gpu()")
        page.evaluate(AT_DEPOT)
        page.wait_for_function(NEAR_BUILT, timeout=240000)
        d = depot(page)
        page.evaluate("() => window.__mm.sim(832.3 - 600, -107.5, 0, 0, 0.1, [])")
        page.wait_for_function("() => window.__mm.depot().real === 0 && window.__mm.depot().cached.length === 0", timeout=T)
        wait_frames(page, 3)
        gpu1 = page.evaluate("() => window.__mm.gpu()")
        after = page.evaluate("() => window.__mm.carStats()")
        b.close()
    assert all(s["shown"] and s["solid"] for s in d["slots"] if s["id"] != driven), d
    assert all(not s["shown"] and not s["solid"] for s in d["slots"] if s["id"] == driven), d   # its slot is empty (if it has one)
    assert sum(s["model"] == "gltf" for s in d["slots"]) == d["real"] <= 6, d
    assert all(s["model"] == "box" for s in d["slots"] if s["model"] != "gltf"), d
    assert gpu1["geometries"] <= gpu0["geometries"] + 5 and gpu1["textures"] <= gpu0["textures"] + 2, (gpu0, gpu1)
    assert after == before, (before, after)
    assert not errors, errors


def test_parked_cars_are_solid_and_far_ones_hidden(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(ALL_PLACED, timeout=240000)
        d = depot(page)
        high = [s for s in d["slots"] if abs(s["th"] + math.pi / 2) < 1e-9 and s["id"] != "hatchback"]
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


def slots_by_id(page):
    return {s["id"]: s for s in depot(page)["slots"]}


def test_parked_paint_ignores_later_repaints(server):
    """Choose car's swiss repaint must not reach the parked copies (deep-cloned materials): the hyper keeps its factory blue."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(ALL_PLACED, timeout=240000)
        hyper = slots_by_id(page)["hyper"]                           # #807: stand at its nose, so the hyper is in the near set
        page.evaluate("(s) => window.__mm.sim(s.x + Math.cos(s.th) * (s.l / 2 + 2), s.z + Math.sin(s.th) * (s.l / 2 + 2), s.th + Math.PI, 0, 0.2, [])", hyper)
        page.wait_for_function(HYPER_GLTF, timeout=240000)
        before = slots_by_id(page)["hyper"]
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=T)
        page.click("#cspaints button[data-paint=swiss]")
        driven = page.evaluate("() => window.__mm.carsel().bodyColor")
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.carsel().open", timeout=T)
        after = slots_by_id(page)["hyper"]
        b.close()
    assert driven == "e0322d", driven                                # the driven hatchback took the swiss paint
    assert before["paint"] == "#2266dd", before                      # the Rhy Hyper's factory racing blue
    assert after["paint"] == "#2266dd", after
    assert not errors, errors


def test_a_depot_evicted_vehicle_loads_again_in_choose_car(server):
    """#807: eviction takes the id out of WANTED too, so Choose car can fetch the file a second time."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(ALL_PLACED, timeout=240000)
        hyper = slots_by_id(page)["hyper"]
        page.evaluate("(s) => window.__mm.sim(s.x + Math.cos(s.th) * (s.l / 2 + 2), s.z + Math.sin(s.th) * (s.l / 2 + 2), s.th + Math.PI, 0, 0.2, [])", hyper)
        page.wait_for_function(HYPER_GLTF, timeout=240000)
        page.evaluate("() => window.__mm.sim(832.3 - 600, -107.5, 0, 0, 0.1, [])")
        page.wait_for_function("() => window.__mm.depot().cached.length === 0", timeout=T)
        evicted = page.evaluate("() => window.__mm.gltfVehicle('hyper').state")
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=T)
        page.click('#csgarage button[data-id="hyper"]')
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.gltfVehicle('hyper').state === 'ready' && window.__mm.carsel().id === 'hyper'", timeout=T)
        b.close()
    assert evicted == "idle", evicted
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


def test_e_in_the_car_boards_the_parked_vehicle(server):
    """Boards the hypercar before its model is loaded; the hatchback goes home, the hypercar's slot empties."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function(HYPER_MODEL, timeout=T)
        board_from_car(page, "hyper")
        d = depot(page)
        b.close()
    slot = {s["id"]: s for s in d["slots"]}
    assert slot["hatchback"]["shown"] and slot["hatchback"]["solid"], slot["hatchback"]
    assert not slot["hyper"]["shown"] and not slot["hyper"]["solid"], slot["hyper"]
    assert not errors, errors


def test_boarding_on_foot(server):
    """Z next to the strip, walk up: the key bar offers E 'get in', E boards, the hatchback goes home."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function("() => window.__mm.depot().slots.some(s => s.model)", timeout=T)
        target = min((s for s in depot(page)["slots"] if s["id"] != "hatchback" and abs(s["th"] + math.pi / 2) < 1e-9),
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
        wait_frames(page)                                            # depot().near is read live, the prompt is written by stepEnter in the loop
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
    assert slot["hatchback"]["shown"] and slot["hatchback"]["solid"], slot["hatchback"]
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
    assert got == {"id": "hatchback", "near": None}, got
    assert not errors, errors


def test_too_fast_shows_no_prompt(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        page.evaluate(AT_DEPOT)
        page.wait_for_function("() => window.__mm.depot().slots.some(s => s.model)", timeout=T)
        s = min((x for x in depot(page)["slots"] if x["id"] != "hatchback" and abs(x["th"] + math.pi / 2) < 1e-9),
                key=lambda x: math.hypot(x["x"] - 832.3, x["z"] + 107.5))
        qx, qz = s["x"] + math.cos(s["th"]) * (s["l"] / 2 + 2), s["z"] + math.sin(s["th"]) * (s["l"] / 2 + 2)
        th = math.atan2(s["z"] - qz, s["x"] - qx)
        # 10 m/s, 2 m off the nose; near is read in the same evaluate: every box is solid from the start (#807), so the
        # frames the loop runs between two evaluates crash the car into the slot and it stands still there
        fast, near_fast = page.evaluate(f"() => {{ const f = window.__mm.sim({qx}, {qz}, {th}, 10, 0.05, []); return [f, window.__mm.depot().near]; }}")
        page.evaluate(f"() => window.__mm.sim({fast['x']}, {fast['z']}, {th}, 0, 0.05, [])")
        near_stopped = depot(page)["near"]
        b.close()
    assert near_fast is None, (near_fast, fast)
    assert near_stopped == s["id"], (near_stopped, fast, s)
    assert not errors, errors


# ---------- Task 5: the J list row ----------
def test_j_list_jumps_to_the_depot(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, block_world=False)
        page.click("#startbtn", timeout=180000)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        page.keyboard.type("depot")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelector('#jump').hidden", timeout=T)
        pos = page.evaluate("() => ({ x: window.__mm.car().x, z: window.__mm.car().z, on: window.__mm.depot().on })")
        b.close()
    assert math.hypot(pos["x"] - 832.3, pos["z"] + 107.5) < 80, pos
    assert pos["on"] is True, pos
    assert not errors, errors


def test_no_depot_row_in_ehrendingen(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?region=ehrendingen", block_world=False)
        page.click("#startbtn", timeout=180000)
        page.keyboard.press("KeyJ")
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=T)
        got = page.evaluate("() => ({ names: window.__mm.jumpList().map(r => r.n), on: window.__mm.depot().on })")
        b.close()
    assert "Fahrzeug-Depot" not in got["names"], got
    assert got["on"] is False, got
    assert not errors, errors
