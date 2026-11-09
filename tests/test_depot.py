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
