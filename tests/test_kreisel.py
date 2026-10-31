"""#222: the Smile-Kreisel's apron and island reach down to the ground on every side (no floating disc).
Real world and terrain. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.kreisel && document.querySelector('#worldstatus')?.textContent"


def test_kreisel_apron_and_island_reach_below_the_lowest_ground_under_them(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 320, "height": 180})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html")
        page.wait_for_function(READY, timeout=300000)
        got = page.evaluate("() => window.__mm.kreisel()")
        b.close()
    assert got, "the world has a roundabout"
    for k in got:
        assert k["bottom"] <= k["low"] - 0.2, ("apron", k)
        assert k["ibottom"] <= k["ilow"] - 0.2, ("island", k)
    assert errors == []
