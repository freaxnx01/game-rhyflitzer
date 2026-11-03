"""The Rhy Blaze's 3D model (assets/blaze.glb), its blue lights and its siren. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

STATS_JS = "() => window.__mm.carStats()"


def load_blaze(page):
    g = page.evaluate("async () => { await window.__mm.loadVehicle('blaze'); return window.__mm.gltfVehicle('blaze'); }")
    page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().blaze)")
    wait_frames(page)
    return g


def test_blaze_model_builds_true_to_size_with_lamps_and_blue_lights(server):
    """The fire engine is 7.27 m long, 3.05 m high to the blue lights, 3.07 m wide with the mirrors; four wheel nodes, two of them
    steering; one head and one tail lamp material; two blue light groups, dark while the siren is off; fixed livery."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        g = load_blaze(page)
        stats = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        yaw = page.evaluate("() => window.__mm.wheelYaw()")
        siren = page.evaluate("() => window.__mm.siren()")
        b.close()
    assert g["state"] == "ready", g
    assert stats["triangles"] <= 16000, stats
    assert abs(size["l"] - 7.27) <= 0.05 and abs(size["h"] - 3.05) <= 0.05 and abs(size["w"] - 3.07) <= 0.06, size
    assert g["wheels"] == 4 and len(yaw["front"]) == 2 and len(yaw["rear"]) == 2, (g, yaw)
    assert g["lamps"]["head"] == 1 and g["lamps"]["tail"] == 1, g
    assert "Beacon0" in g["materials"] and "Beacon1" in g["materials"] and "Paint" not in g["materials"], g
    assert siren["on"] is False and siren["beacons"] == [0.1, 0.1] and siren["voice"] is None, siren
    assert not errors, errors


def test_blaze_key_2_switches_blue_lights_and_siren(server):
    """2 switches on the siren: the two sides flash in turn and the voice changes tone; 2 again switches both off. In the compact
    the key only says there is no siren."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        load_blaze(page)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        page.keyboard.press("Digit2")
        seen = page.evaluate("""() => { const beacons = new Set(), tones = new Set(); for (let i = 0; i < 120; i++) { window.__mm.driveSim(1 / 60); const s = window.__mm.siren(); beacons.add(s.beacons.join('/')); if (s.voice) tones.add(s.voice.freq); } return { on: window.__mm.siren().on, beacons: [...beacons].sort(), tones: [...tones].sort((a, b) => a - b) }; }""")
        page.keyboard.press("Digit2")
        wait_frames(page)
        off = page.evaluate("() => window.__mm.siren()")
        page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().compact)")
        page.keyboard.press("Digit2")
        compact = page.evaluate("() => ({ on: window.__mm.siren().on, toast: document.querySelector('#toast')?.textContent ?? '' })")
        b.close()
    assert seen["on"] is True and seen["beacons"] == ["0.1/0.1", "0.1/3", "3/0.1"] and seen["tones"] == [440, 587], seen
    assert off["on"] is False and off["voice"] is None and off["beacons"] == [0.1, 0.1], off
    assert compact["on"] is False and "no siren" in compact["toast"], compact
    assert not errors, errors
