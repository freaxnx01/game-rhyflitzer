"""The Rhy Tumbler's 3D model (assets/tumbler.glb). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_tumbler(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('tumbler'); return window.__mm.gltfVehicle('tumbler'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().tumbler)")
    wait_frames(page)
    return g


def test_tumbler_model_builds_with_four_turning_wheels_true_to_size(server):
    """The model is 4.57 m long, 1.63 m high and 2.81 m wide; four wheel nodes; one head lamp material and no tail lamp."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_tumbler(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 12000, stats
    assert abs(size["l"] - 4.57) <= 0.05 and abs(size["h"] - 1.63) <= 0.05 and abs(size["w"] - 2.81) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 0, g
    assert not errors, errors


def test_tumbler_model_swaps_in_from_the_url(server):
    """?vehicle=tumbler starts with the compact standing in and swaps the model in when it arrives."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=tumbler")
        page.wait_for_function("() => window.__mm.gltfVehicle('tumbler').state === 'ready' && window.__mm.gltfVehicle('tumbler').wheels === 4", timeout=180000)
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert abs(size["l"] - 4.57) <= 0.05, size
    assert not errors, errors


def test_tumbler_model_head_lamps_follow_the_lights(server):
    """The head lamps are a lamp material: L raises their emissive level."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_tumbler(page)
        page.click("#startbtn", timeout=180000)   # L only works while driving, not on the start screen
        wait_frames(page)
        off = page.evaluate("() => window.__mm.gltfVehicle('tumbler').lamps")
        page.keyboard.press("KeyL")
        wait_frames(page)
        on = page.evaluate("() => window.__mm.gltfVehicle('tumbler').lamps")
        b.close()
    assert on["headLevel"] > off["headLevel"], (off, on)
    assert not errors, errors


def test_nitro_flames_sit_behind_every_gltf_tail_one_centred_on_the_tumbler(server):
    """The Tumbler's jet burner is one flame on the centre line; the Knight and the fire engine get two, side by side. All sit
    behind the body, in car-local metres (x forward), so they show behind the tail; the Harvester's behind its engine, not its auger."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        seen = {}
        for vid in ("tumbler", "knight", "blaze", "harvester"):
            page.evaluate(f"async () => {{ await window.__mm.loadVehicle('{vid}'); window.__mm.setVehicle(window.__mm.vehicles().{vid}); }}")
            wait_frames(page)
            seen[vid] = {"flames": page.evaluate("() => window.__mm.nitroFlames()"), "l": page.evaluate("() => window.__mm.carSize().l")}
        b.close()
    assert [f[2] for f in seen["tumbler"]["flames"]] == [0], seen
    for vid in ("knight", "blaze"):
        zs = sorted(f[2] for f in seen[vid]["flames"])
        assert len(zs) == 2 and zs[0] == -zs[1] and zs[1] > 0, seen
    for vid, s in seen.items():
        if vid != "harvester":
            assert all(f[0] < -s["l"] / 2 + 0.2 for f in s["flames"]), (vid, s)
    # the Harvester's box reaches -6.26 m only with the unloading auger, high up: its flames sit at the engine's tail, 1.9 m up
    assert all(-4 < f[0] < -3 and f[1] == 1.9 for f in seen["harvester"]["flames"]), seen["harvester"]
    assert not errors, errors


def test_tumbler_from_the_url_appears_after_loading_even_when_the_race_already_started(server):
    """#561: ?vehicle=tumbler, race started before the glb arrived: the real model still replaces the fallback, no player action."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, query="?vehicle=tumbler")
        page.click("#startbtn", timeout=180000)
        page.wait_for_function("() => window.__mm.gltfVehicle('tumbler').state === 'ready'", timeout=180000)
        page.wait_for_function("() => window.__mm.vehicle().gltf?.id === 'tumbler' && window.__mm.carSize().l > 4.5", timeout=30000)
        b.close()
    assert not errors, errors
