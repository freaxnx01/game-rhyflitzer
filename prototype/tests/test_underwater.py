"""#101 the underwater Rhine: a real bed, the car stays and drives down there, the look under the surface, fish and wrecks.
Hand-traced layout (world + terrain blocked): deterministic, water level 0. (863.6, -647.7) is the middle of the hand
Rhine (riverDist -107: the hand river is 42 px x 2.54 = 106.7 m to each bank; bed 6 m); the south bank (+z) is 107 m away.
Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MID_RHINE = (863.6, -647.7)


def open_hand(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(locale=locale, viewport={"width": 1280, "height": 720}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def car(page):
    return page.evaluate("() => window.__mm.car()")


def bed(page, x, z):
    return page.evaluate("([x, z]) => window.__mm.bed(x, z)", [x, z])


def text(page, sel):
    return page.evaluate("(s) => document.querySelector(s).textContent", sel)


def test_bed_shelves_from_the_shore_to_six_metres_and_is_drawn(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        mid = bed(page, *MID_RHINE)
        shore = bed(page, 863.6, -647.7 + 105.7)       # 1 m inside the hand river's south edge (hw 106.7 m)
        b.close()
    assert mid["water"] == 0 and mid["depth"] == 6 and mid["ground"] == -6
    assert mid["drawn"] is not None and abs(mid["drawn"] - mid["ground"]) < 0.6, mid   # the grass mesh is lowered to the bed
    assert shore["water"] == 0 and 0 <= shore["depth"] < 1.0, shore                      # no cliff at the shoreline


def test_car_sinks_to_the_bed_and_stays(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 5", timeout=180000)
        c = car(page)
        b.close()
    assert c["water"] == 0 and c["splash"] > 5, c            # no reset at 2.8 s
    assert c["submerged"] is True and abs(c["y"] - c["ground"]) < 0.3 and c["ground"] <= -5.5, c   # lying on the bed


def test_drives_on_the_bed_at_walking_pace(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        start = page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 0.1, [])", list(MID_RHINE))   # drop it, let it settle 0.1 s
        s = page.evaluate("([x, z]) => window.__mm.sim(x, z, 0, 0, 6, ['KeyW'])", list(MID_RHINE))
        b.close()
    assert s["speed"] <= 12.5, s                              # a fifth of the compact's 60 m/s top; with the drag it settles near 6 m/s
    assert s["speed"] > 1.5 and s["x"] - MID_RHINE[0] > 8, s   # but it does move


def test_drives_out_at_the_bank(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        # from mid-river straight south (th = pi/2, +z) for 40 s: 107 m of bed at ~6 m/s, then the gravel bank
        s = page.evaluate("([x, z]) => window.__mm.sim(x, z, Math.PI / 2, 0, 40, ['KeyW'])", list(MID_RHINE))
        c = car(page)
        b.close()
    assert c["water"] is None and s["z"] > MID_RHINE[1] + 107, (s, c)   # out of the water, on the bank


@pytest.mark.parametrize("locale,expected", [("en-US", "Drive up to the bank, or press R for the road."), ("de-CH", "Fahr ans Ufer hoch, oder drück R für die Strasse.")])
def test_hint_after_three_seconds_in_the_game_language(server, locale, expected):
    with sync_playwright() as p:
        b, page = open_hand(p, server, locale)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 0.6", timeout=180000)
        first = text(page, "#toast")
        page.wait_for_function("() => window.__mm.car().splash > 3.3", timeout=180000)
        second = text(page, "#toast")
        b.close()
    assert first in ("Sleep with the fishes!", "Grüss mir die Fische!")
    assert second == expected


def test_r_puts_the_car_back_on_the_road(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 1", timeout=180000)
        page.keyboard.press("KeyR")
        page.wait_for_function("() => window.__mm.car().water === null", timeout=60000)
        c = car(page)
        b.close()
    assert c["splash"] == 0 and c["submerged"] is False


def underwater(page):
    return page.evaluate("() => window.__mm.underwater()")


def test_look_follows_the_camera(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        dry = underwater(page)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.underwater().on", timeout=180000)
        wet = underwater(page)
        cam = page.evaluate("() => window.__mm.cam()")
        page.keyboard.press("KeyR")
        page.wait_for_function("() => !window.__mm.underwater().on", timeout=60000)
        back = underwater(page)
        b.close()
    assert dry["on"] is False and dry["fogDensity"] is None                 # original style: linear fog, no density
    assert wet["on"] is True and abs(wet["fogDensity"] - 0.035) < 1e-6 and wet["waterDoubleSide"] is True
    assert cam["d"][1] < 6, cam                                            # the chase cam came down with the car (under the 0 m surface)
    assert back["on"] is False and back["fogDensity"] is None


def test_t_underwater_keeps_the_murk(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.underwater().on", timeout=180000)
        page.keyboard.press("KeyT")
        page.wait_for_timeout(500)
        u = underwater(page)
        b.close()
    assert u["on"] is True and abs(u["fogDensity"] - 0.035) < 1e-6


def test_bubbles_rise_only_in_the_water(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        dry = underwater(page)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", list(MID_RHINE))
        page.wait_for_function("() => window.__mm.car().splash > 1", timeout=180000)
        wet = underwater(page)
        b.close()
    assert dry["bubbles"]["visible"] is False
    assert wet["bubbles"]["visible"] is True and wet["bubbles"]["count"] == 24 and wet["bubbles"]["maxY"] <= 0.05
