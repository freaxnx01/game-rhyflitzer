"""#236: the Hatchback. Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames
from test_lights import start_hand as start_lights, wait_lights
from test_photo import NAME_RE, start_hand as start_photo
from test_vehicles import open_hand as open_hand_plain
from test_wheels import START, drive

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


def hatch_hand(p, server):
    """The hand-traced page (no world, 320 x 180) with the hatchback loaded and built."""
    b, page = open_hand_plain(p, server)
    load(page)
    use_hatchback(page)
    return b, page


def test_hatchback_drives_wheels_roll_and_only_the_fronts_steer(server):
    gas = "() => window.__mm.sim(1882.9, -292.2, Math.PI, 0, 4).speed"
    with sync_playwright() as p:
        b, page = open_hand_plain(p, server)
        compact = page.evaluate(gas)
        load(page)
        use_hatchback(page)
        hatch = page.evaluate(gas)
        tops = page.evaluate("() => [window.__mm.vehicles().compact.drive.top, window.__mm.vehicle().drive.top]")
        right = drive(page, "KeyD")
        straight = drive(page, "KeyW", 1.5)
        rolled = drive(page, "KeyW", 0.5)
        b.close()
    assert len(right["front"]) == 2 and len(right["rear"]) == 2, right
    assert all(y < -0.2 for y in right["front"]), right
    assert all(abs(y) < 1e-6 for y in right["rear"]), right
    assert rolled["spin"] != straight["spin"], (straight, rolled)
    assert tops[1] > tops[0] and hatch > compact * 1.03, (compact, hatch, tops)   # livelier than the compact: higher top speed, stronger pull


SEQUENCE = """() => {
  const m = window.__mm;
  m.setDamage(0.95);
  const safe = [...m.damage().safe];
  m.sim(1236.5, -127, Math.PI, 15, 1.6, []);
  const hit = m.damage();
  m.wreckSim(1.5);
  const mid = m.damage(), car = m.car();
  m.wreckSim(1.6);
  return { safe, hit, mid, car, end: m.damage() };
}"""


def test_hatchback_damage_smokes_and_wrecks_at_one_hundred_percent(server):
    with sync_playwright() as p:
        b, page = hatch_hand(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        r = page.evaluate(SEQUENCE)
        after = page.evaluate("() => window.__mm.gltfVehicle().wheels")
        b.close()
    assert r["hit"]["wrecked"] and r["hit"]["dmg"] == 1 and r["hit"]["wheelsOff"] == 4, r["hit"]
    assert r["mid"]["smoke"] > 0, r["mid"]
    assert max(abs(w["x"] - r["car"]["x"]) + abs(w["z"] - r["car"]["z"]) for w in r["mid"]["wheels"]) > 2, "the wheels flew off the car"
    assert not r["end"]["wrecked"] and r["end"]["dmg"] == 0 and r["end"]["wheelsOff"] == 0, r["end"]
    assert after == 4 and not errors, (after, errors)


def test_hatchback_lights_follow_the_switches(server):
    with sync_playwright() as p:
        b, page = start_lights(p, server)
        load(page)
        use_hatchback(page)
        wait_lights(page)
        lamps = page.evaluate("() => window.__mm.gltfVehicle().lamps")
        page.keyboard.press("KeyL")
        page.wait_for_function("() => window.__mm.gltfVehicle().lamps.headLevel === 2.0", timeout=120000)
        page.keyboard.press("KeyL")
        page.wait_for_function("() => window.__mm.gltfVehicle().lamps.headLevel === 0.35", timeout=120000)
        page.evaluate("() => window.__mm.step(2, ['KeyW'])")
        page.keyboard.down("KeyS")
        page.wait_for_function("() => window.__mm.gltfVehicle().lamps.tailLevel === 2.4", timeout=120000)
        page.keyboard.up("KeyS")
        b.close()
    assert lamps["head"] >= 1 and lamps["tail"] >= 1, lamps


def test_hatchback_shadow_and_photo_and_mirror_work(server):
    with sync_playwright() as p:
        b, page = start_photo(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        load(page)
        use_hatchback(page)
        wait_frames(page, 3)
        size = page.evaluate("() => window.__mm.carSize()")
        shadow = page.evaluate("() => window.__mm.shadow()")
        page.keyboard.press("KeyC")
        page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 2 && window.__mm.mirror().visible", timeout=120000)
        with page.expect_download(timeout=120000) as info:
            page.keyboard.press("KeyX")
        name = info.value.suggested_filename
        toast = page.evaluate("() => window.__mm.toast()")
        b.close()
    assert shadow["visible"] is True, shadow
    assert shadow["size"][0] == pytest.approx(size["l"] * 0.92 + 1.0, abs=0.02), (shadow, size)
    assert shadow["size"][1] == pytest.approx(size["w"] * 0.92 + 1.0, abs=0.02), (shadow, size)
    assert NAME_RE.match(name) and toast["text"] == "Photo taken", (name, toast)   # the PNG itself is test_photo.py's business
    assert not errors, errors
