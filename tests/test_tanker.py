"""#1103: the Rhy Tanker's trailer swings behind the truck, straightens on a straight road, starts straight on every pick and
stays straight on a parked depot copy. Slow (Playwright): run in the foreground."""
import math

from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

DEPOT_X, DEPOT_Z = 832.3, -107.5


def pick_tanker(page):
    page.evaluate("async () => { await window.__mm.loadVehicle('tanker'); window.__mm.setVehicle(window.__mm.vehicles().tanker); }")
    wait_frames(page)


def test_trailer_swings_to_the_inside_straightens_and_starts_straight_on_every_pick(server):
    """A steady left circle settles the trailer's heading to the right of the truck's, so its tail lies on the inside, the left
    (phi > 0, the node turned by -phi about +y) with the wheels rolling; straight on brings it back to about 0; a right circle
    mirrors it; picking the tanker again starts it at 0."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        pick_tanker(page)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        start = page.evaluate("() => window.__mm.trailer()")
        page.evaluate("() => window.__mm.sim(0, 0, 0, 12, 8, ['KeyW', 'KeyA'])")
        left = page.evaluate("() => window.__mm.trailer()")
        page.evaluate("() => window.__mm.sim(0, 0, 0, 12, 14, ['KeyW'])")
        straight = page.evaluate("() => window.__mm.trailer()")
        page.evaluate("() => window.__mm.sim(0, 0, 0, 12, 8, ['KeyW', 'KeyD'])")
        right = page.evaluate("() => window.__mm.trailer()")
        pick_tanker(page)
        picked = page.evaluate("() => window.__mm.trailer()")
        b.close()
    assert start == {"phi": 0, "wheelTurn": 0, "rotY": 0}, start
    assert left["phi"] > 0.05 and left["rotY"] < -0.05 and left["wheelTurn"] > 0, left   # the tail swings to the inside of a left turn
    assert abs(straight["phi"]) < 0.05, straight
    assert right["phi"] < -0.05 and right["rotY"] > 0.05, right
    assert picked["phi"] == 0 and picked["rotY"] == 0, picked
    assert not errors, errors


def test_reversing_folds_the_trailer_up_to_the_clamp_and_never_past_it(server):
    """Backing up with steering folds the trailer towards the jackknife clamp (70 degrees) and no further."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        pick_tanker(page)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        page.evaluate("() => window.__mm.sim(0, 0, 0, 0, 0.1, [])")
        phis = []
        for _ in range(8):
            page.evaluate("() => window.__mm.sim(0, 0, 0, -2, 2, ['KeyS', 'KeyA'])")
            phis.append(abs(page.evaluate("() => window.__mm.trailer().phi")))
        b.close()
    assert max(phis) >= 0.5, phis
    assert all(x <= 70 * math.pi / 180 + 1e-9 for x in phis), phis
    assert not errors, errors


def test_depot_parked_tanker_keeps_its_trailer_straight_and_every_slot_stays_inside_the_strip(server):
    """The depot fits the 18 m combination in the low row, its footprint inside the strip; the parked copy's trailer node is straight."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        page.evaluate("() => window.__mm.sim(%s, %s, 0, 0, 0.1, [])" % (DEPOT_X, DEPOT_Z))
        page.wait_for_function("() => window.__mm.depot().slots.length > 0", timeout=120000)
        slots = page.evaluate("() => window.__mm.depot().slots")
        slot = next(s for s in slots if s["id"] == "tanker")
        page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.1, [])", [slot["x"], slot["z"]])
        page.wait_for_function("() => window.__mm.depot().slots.some(s => s.id === 'tanker' && s.model === 'gltf')", timeout=240000)
        built = next(s for s in page.evaluate("() => window.__mm.depot().slots") if s["id"] == "tanker")
        b.close()
    z_low, z_high = DEPOT_Z - 15, DEPOT_Z + 15
    for s in slots:
        cz = s["z"] - math.sin(s["th"]) * s["off"]
        assert z_low - 1e-6 <= cz - s["span"] / 2 and cz + s["span"] / 2 <= z_high + 1e-6, s
    assert slot["span"] > 18 and slot["l"] < 10.5, slot   # the footprint is the combination, the solid the truck
    assert built["trailerY"] == 0, built
    assert not errors, errors
