"""#236: the Hatchback. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load(page):
    return page.evaluate("async () => { await window.__mm.loadVehicle('hatchback'); return window.__mm.gltfVehicle(); }")


def use_hatchback(page):
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().hatchback)")
    wait_frames(page)


def test_hatchback_builds_with_four_turning_wheels_and_stays_in_budget(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load(page)
        use_hatchback(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["meshes"] <= 24 and stats["triangles"] <= 25000, stats
    assert abs(size["l"] - 4.46) <= 0.03, size
    assert g["wheels"] == 4, g
    assert not any("mazda" in m.lower() for m in g["materials"]), g["materials"]
    assert len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, yaw
    assert not errors, errors


def test_hatchback_paint_swatch_recolours_the_body(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load(page)
        use_hatchback(page)
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=120000)
        page.evaluate("() => window.__mm.carsel()")
        page.click('#cspaints button[data-paint="ice"]')
        wait_frames(page)
        g = page.evaluate("() => window.__mm.gltfVehicle()")
        compact = page.evaluate("() => window.__mm.carMats().body.color")
        b.close()
    assert g["paintColor"] == "#7fd1ff", g
    assert compact == "#7fd1ff", compact
    assert not errors, errors


def open_held(p, server, query="", stored=None):
    """open_page, but the hatchback file is held back until the test releases it: the loading state stays observable."""
    held = []
    b, page, errors = open_page(p, server, query=query, stored=stored, before=lambda pg: pg.route("**/hatchback.glb", lambda r: held.append(r)))
    return b, page, errors, held


def wait_state(page, state):
    page.wait_for_function(f"() => window.__mm.gltfVehicle().state === '{state}'", timeout=120000)


def release(page, held):
    while not held:
        page.wait_for_timeout(50)
    held[0].continue_()


def test_highlighting_the_hatchback_loads_it_lazily_and_holds_the_race_button(server):
    with sync_playwright() as p:
        b, page, errors, held = open_held(p, server)
        idle = page.evaluate("() => ({ state: window.__mm.gltfVehicle().state, files: performance.getEntriesByType('resource').filter(e => e.name.includes('hatchback.glb')).length })")
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=120000)
        page.click('#csgarage button[data-id="hatchback"]')
        wait_state(page, "loading")
        loading = page.evaluate("() => ({ id: window.__mm.carsel().id, hint: document.querySelector('#csloading').hidden ? '' : document.querySelector('#csloading').textContent, race: document.querySelector('#csrace').disabled })")
        release(page, held)
        wait_state(page, "ready")
        page.wait_for_function("() => document.querySelector('#csloading').hidden && !document.querySelector('#csrace').disabled", timeout=120000)
        wait_frames(page)
        ready = page.evaluate("() => ({ sel: window.__mm.carsel(), size: window.__mm.carSize(), paint: window.__mm.gltfVehicle().paintColor })")
        b.close()
    assert idle == {"state": "idle", "files": 0}, idle
    assert loading["id"] == "hatchback" and "Hatchback" in loading["hint"] and loading["race"] is True, loading
    assert ready["sel"]["paintable"] is True and ready["sel"]["bodyColor"] == "e0322d" and ready["paint"] == "#e0322d", ready
    assert abs(ready["size"]["l"] - 4.46) <= 0.03, ready["size"]
    assert not errors, errors


def test_starting_with_the_hatchback_in_the_url_swaps_it_in_before_the_race(server):
    with sync_playwright() as p:
        b, page, errors, held = open_held(p, server, query="?vehicle=hatchback")
        before = page.evaluate("() => ({ size: window.__mm.carSize(), id: window.__mm.carsel().id })")
        release(page, held)
        wait_state(page, "ready")
        page.wait_for_function("() => Math.abs(window.__mm.carSize().l - 4.46) < 0.05", timeout=120000)
        after = page.evaluate("() => ({ size: window.__mm.carSize(), id: window.__mm.carsel().id })")
        b.close()
    assert abs(before["size"]["l"] - 4.66) <= 0.03 and before["id"] == "hatchback", before
    assert abs(after["size"]["l"] - 4.46) <= 0.03 and after["id"] == "hatchback", after
    assert not errors, errors


def test_a_failed_load_falls_back_to_the_compact_with_a_toast(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?glb=./assets/missing.glb", stored='{"id":"hatchback","paint":"navy"}')
        wait_state(page, "failed")
        page.wait_for_function("() => window.__mm.toast().shown", timeout=120000)
        got = page.evaluate("() => ({ id: window.__mm.carsel().id, toast: window.__mm.toast(), stored: JSON.parse(localStorage.getItem('mm.car')).id, size: window.__mm.carSize().l })")
        requests = []
        page.on("request", lambda r: requests.append(r.url))
        page.click("#carbtn")
        page.wait_for_function("() => window.__mm.carsel().open", timeout=120000)
        page.click('#csgarage button[data-id="hatchback"]')
        wait_frames(page)
        again = page.evaluate("() => ({ state: window.__mm.gltfVehicle().state, id: window.__mm.carsel().id })")
        b.close()
    assert got["id"] == "compact" and got["stored"] == "hatchback" and abs(got["size"] - 4.66) <= 0.03, got
    assert got["toast"]["shown"] and "Hatchback" in got["toast"]["text"], got["toast"]
    assert again == {"state": "failed", "id": "compact"}, again
    assert not [u for u in requests if "missing.glb" in u], requests
