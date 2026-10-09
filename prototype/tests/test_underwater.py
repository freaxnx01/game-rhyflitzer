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
    page = b.new_context(locale=locale, viewport={"width": 480, "height": 270}).new_page()   # small, like test_smoke: the game clock runs on headless frames (dt <= 0.05 s)
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


# #101 review of the first attempt (PR #155): the sink path must be tested from the surface, not from __mm.place (which puts the
# car straight onto the bed), and a car on the bed must follow a RISING bed back to the shore, not stay at its lowest height.
SOUTH_BANK = (863.6, -647.7 + 117)        # 10 m outside the hand river's south edge, on the bank
TRACE = """([x, z, th, v, n, dt, hold]) => { window.__mm.sim(x, z, th, v, 0, []); const out = [];
  for (let i = 0; i < n; i++) { const s = window.__mm.step(dt, hold), c = window.__mm.car(); out.push({ ...s, ground: c.ground, water: c.water, splash: c.splash }); }
  return out; }"""


def trace(page, x, z, th, v, n, dt, hold):
    return page.evaluate(TRACE, [x, z, th, v, n, dt, hold])


def test_sinks_from_the_surface_onto_the_bed(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        # from the south bank north (th = -pi/2, -z) into the river at 40 m/s, no gas: the hand bank is at the 0 m surface and the bed
        # shelves at 0.3, so a slow car just rolls down it; a fast one leaves it at the shoreline and sinks through the water
        tr = trace(page, *SOUTH_BANK, -1.5707963, 40, 40, 0.1, [])
        b.close()
    wet = [s for s in tr if s["water"] is not None]
    assert wet, tr
    assert any(s["y"] > s["ground"] + 1 for s in wet), tr                               # in the water but well above the bed
    sinking = [s for s in wet if s["y"] > s["ground"] + 0.15]
    assert len(sinking) >= 2, tr                                                        # it takes a few samples to sink...
    for a, c in zip(sinking, sinking[1:]):
        assert c["y"] < a["y"] and a["y"] - c["y"] <= 3 * 0.1 + 1e-6, (a, c)             # ...down at no more than UW.sink (3 m/s)
    last = tr[-1]
    assert last["water"] is not None and abs(last["y"] - last["ground"]) < 0.05 and last["ground"] < -1, last   # settled on the bed
    assert last["speed"] < 1, last                                                      # and the water braked it


def test_follows_the_rising_bed_out_of_the_river(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        # from mid-river (bed 6 m) straight south (th = pi/2, +z) with gas: up the shelving bed to the bank
        tr = trace(page, *MID_RHINE, 1.5707963, 0, 80, 0.5, ["KeyW"])
        b.close()
    wet = [s for s in tr if s["water"] is not None]
    assert len(wet) > 5, tr
    for s in wet:
        assert abs(s["y"] - s["ground"]) < 0.3, (s, tr)                                 # on the bed all the way, never buried in it
    assert min(s["ground"] for s in wet) <= -5.5 and max(s["y"] for s in wet) > -1, tr   # climbed from the deep middle to the shallows
    assert tr[-1]["water"] is None and tr[-1]["z"] > MID_RHINE[1] + 107, tr[-1]          # and out onto the bank
