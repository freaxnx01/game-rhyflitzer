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
