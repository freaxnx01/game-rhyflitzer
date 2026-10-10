"""#163: the car's ground shadow is a soft decal sized from the car, lying on the ground and shifted away from the sun.
Hand-traced layout (world + terrain blocked): deterministic, no data files. Every read waits for two drawn frames
(drawShadow runs in the loop). Slow (Playwright): run in the foreground, under a memory cap."""
import math

import pytest
from playwright.sync_api import sync_playwright

from test_vehicles import open_hand, open_hand_query, wait_frames, wait_settled

SHADOW_JS = "() => window.__mm.shadow()"
MARGIN = 0.5


def shadow(page):
    wait_frames(page, 2)
    return page.evaluate(SHADOW_JS)


def test_shadow_is_sized_from_the_car(server):
    """#163: compact 4.66 x 2.18 m -> quad 5.29 x 3.0 m with a dark core shorter than the car; the old disc was 5.2 m solid."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        size = page.evaluate("() => window.__mm.carSize()")
        s = shadow(page)
        b.close()
    assert s["visible"] is True, s
    assert s["size"][0] == pytest.approx(size["l"] * 0.92 + 2 * MARGIN, abs=0.02), (s, size)
    assert s["size"][1] == pytest.approx(size["w"] * 0.92 + 2 * MARGIN, abs=0.02), (s, size)
    assert s["size"][0] - 2 * MARGIN < size["l"], (s, size)
    assert s["shift"][0] == pytest.approx(0.465, abs=0.01) and s["shift"][1] == pytest.approx(0.31, abs=0.01), s
    assert s["pos"][1] == pytest.approx(s["ground"] + 0.04, abs=1e-6), s


def test_delorean_shadow_is_shorter(server):
    """#163: the DeLorean (4.27 m) gets a shorter quad than the compact: measured, not drawn."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        compact = shadow(page)["size"]
        b.close()
        b, page, errors = open_hand_query(p, server, "?vehicle=delorean")
        delorean = shadow(page)["size"]
        b.close()
    assert errors == []
    assert delorean[0] < compact[0] - 0.3, (compact, delorean)


def test_shadow_lies_on_the_ramp(server):
    """#163: on the jump ramp the quad pitches with the slope and sits on the ground, not at the flat ground height."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        r = page.evaluate("() => window.__mm.ramp()")
        mx, mz = (r["x0"] + r["x1"]) / 2, (r["z0"] + r["z1"]) / 2
        page.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [mx, mz])
        page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.05, [])", [mx, mz])
        s = shadow(page)
        ground = page.evaluate("([x, z]) => window.__mm.ground(x, z, 1e4)", [mx, mz])
        b.close()
    pitch = math.atan(r["h"] / (r["x1"] - r["x0"]))
    assert s["rot"][2] == pytest.approx(pitch, abs=0.03), (s, pitch)
    assert abs(s["pos"][1] - 0.04 - ground) < 0.1, (s, ground)


def test_the_quad_rolls_with_the_ground(server):
    """#163: parked across the jump ramp (heading +z), the ramp's rise toward +x is on the car's left, so the quad's
    right edge must come out lower than its left. Read off the mesh's own world transform, not the Euler we wrote,
    so the rotation order and the sign of the roll are both covered."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        r = page.evaluate("() => window.__mm.ramp()")
        mx, mz = (r["x0"] + r["x1"]) / 2, (r["z0"] + r["z1"]) / 2
        page.evaluate("([x, z]) => window.__mm.place(x, z, Math.PI / 2)", [mx, mz])
        page.evaluate("([x, z]) => window.__mm.sim(x, z, Math.PI / 2, 0, 0.05, [])", [mx, mz])
        s = shadow(page)
        b.close()
    roll = math.atan(r["h"] / (r["x1"] - r["x0"]))
    assert s["edge"][1] < s["edge"][0], s
    assert s["edge"][0] - s["edge"][1] == pytest.approx(s["size"][1] * math.sin(roll), abs=0.15), (s, roll)
    assert abs(s["rot"][2]) < 0.05, s


def test_helicopter_and_eye_cameras_hide_the_shadow(server):
    """#163: F takes off -> no car, no shadow; landing shows it again. The cockpit view hides it too (#37 covers V).
    F does nothing on the start screen (test_heli.py::test_f_does_nothing_on_the_start_screen), so start a run first."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.keyboard.press("KeyF")
        page.evaluate("() => window.__mm.flySim(10, [])")
        assert page.evaluate("() => window.__mm.fly().on") is True
        flying = shadow(page)["visible"]
        page.keyboard.press("KeyF")
        page.wait_for_function("() => !window.__mm.fly().on", timeout=120000)
        page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.05, [])", page.evaluate("() => { const c = window.__mm.car(); return [c.x, c.z]; }"))
        landed = shadow(page)["visible"]
        page.keyboard.press("KeyC")
        page.keyboard.press("KeyC")
        cockpit = shadow(page)["visible"]
        b.close()
    assert flying is False and landed is True and cockpit is False, (flying, landed, cockpit)


def test_style_sets_the_base_opacity(server):
    """#163: original 0.55 (the only shadow), smooth 0.3 (a contact darkening under the real shadow-map shadow)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        original = shadow(page)["opacity"]
        page.keyboard.press("KeyT")
        smooth = shadow(page)["opacity"]
        b.close()
    assert original == pytest.approx(0.55, abs=1e-6) and smooth == pytest.approx(0.3, abs=1e-6), (original, smooth)


def test_rebuilds_keep_the_texture_count(server):
    """#163: bakeShadow disposes the previous map, so vehicle round trips leave renderer.info.memory.textures unchanged.
    wait_settled first, like test_vehicles.py::test_rebuilds_free_gpu_memory: the world keeps uploading textures as its
    meshes first enter the frustum. The count is read after one warm-up round trip, because the DeLorean's own model
    brings one texture the compact does not have -- a one-time step that is there on main too, and not the shadow's."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().compact)")
        wait_frames(page, 2)
        wait_settled(page)
        counts = []
        for _ in range(3):
            page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().delorean)")
            wait_frames(page, 3)
            page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().compact)")
            wait_frames(page, 3)
            counts.append(page.evaluate("() => window.__mm.gpu().textures"))
        b.close()
    assert counts[0] > 0, counts
    assert counts[1:] == counts[:-1], counts


def test_a_ground_step_beside_the_car_does_not_tilt_the_shadow(server):
    """Review of #163: heading up the jump ramp 0.5 m inside its side edge, the right-hand roll sample lands on the terrain
    1.7 m below the ramp (a step, not a slope). The quad must stay level across the car (the step sample is rejected),
    keep the ramp's pitch along the car, and never tilt past SHADOW.maxTilt either way."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        r = page.evaluate("() => window.__mm.ramp()")
        mx, ez = (r["x0"] + r["x1"]) / 2, r["z1"] - 0.5
        page.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [mx, ez])
        page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.05, [])", [mx, ez])
        s = shadow(page)
        step = page.evaluate("([x, z]) => window.__mm.ground(x, z + 1, 1e4) - window.__mm.ground(x, z, 1e4)", [mx, ez])
        b.close()
    assert step < -1.0, step                                       # the fixture really is a step: the right sample is well below the car
    pitch = math.atan(r["h"] / (r["x1"] - r["x0"]))
    assert abs(s["rot"][0]) <= 0.5 and abs(s["rot"][2]) <= 0.5, s
    assert s["rot"][0] == pytest.approx(0, abs=1e-9), s           # roll rejected, not just clamped
    assert s["edge"][0] == pytest.approx(s["edge"][1], abs=1e-6), s
    assert s["rot"][2] == pytest.approx(pitch, abs=0.03), (s, pitch)


def test_the_shadow_stays_under_the_car_far_from_the_origin(server):
    """Review of #163: the sun offset is the light's direction, not sun.position. camTail keeps the sun at a fixed offset
    from the car, so a world point as the direction would drag the shadow metres away, growing with the car's x and z.
    Drive a stretch and compare the mesh against the car itself: the offset is the same hand's width everywhere."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        c0 = page.evaluate("() => window.__mm.car()")
        page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 6)", [c0["x"], c0["z"]])
        car = page.evaluate("() => window.__mm.car()")
        s = shadow(page)
        b.close()
    assert math.hypot(car["x"] - c0["x"], car["z"] - c0["z"]) > 30, (c0, car)
    assert max(abs(car["x"]), abs(car["z"])) > 300, car            # far enough out that a world point and a direction differ by metres
    assert s["pos"][0] - car["x"] == pytest.approx(0.465, abs=0.02), (s, car)
    assert s["pos"][2] - car["z"] == pytest.approx(0.31, abs=0.02), (s, car)
    assert s["pos"][0] - car["x"] == pytest.approx(s["shift"][0], abs=1e-6) and s["pos"][2] - car["z"] == pytest.approx(s["shift"][1], abs=1e-6), s
