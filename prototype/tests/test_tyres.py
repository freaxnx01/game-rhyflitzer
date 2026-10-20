"""#416: tyre stacks collapse with real physics (crashcat). Placed with the debug hook __mm.tyres; a car driven through them at 50 km/h
knocks most tyres over, they come to rest, and reset stands them up again. Hand-traced layout. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
KMH50 = 50 / 3.6


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 640, "height": 360}, locale="en-US").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page, errors


def wait_engine(page):
    page.wait_for_function("() => window.__mm.tyreState() && window.__mm.tyreState().engine === 'ready'", timeout=T)


def test_a_car_at_50_kmh_knocks_the_stacks_over_and_reset_stands_them_up(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        page.evaluate("() => window.__mm.place(1236.5, -127, 0)")
        assert page.evaluate("() => window.__mm.tyreState()") is None, "nothing is built until a set is placed"
        page.evaluate("() => window.__mm.tyres(1236.5 + 14, -127, 0)")
        wait_engine(page)
        fresh = page.evaluate("() => window.__mm.tyreState()")
        page.evaluate("() => window.__mm.step(5, [])")
        still = page.evaluate("() => window.__mm.tyreState()")
        page.evaluate(f"() => window.__mm.sim(1236.5, -127, 0, {KMH50}, 2.2, ['KeyW'])")
        hit = page.evaluate("() => window.__mm.tyreState()")
        page.evaluate("() => window.__mm.sim(1236.5 - 60, -127, 0, 0, 20, [])")      # the car leaves; the tyres roll out
        rest = page.evaluate("() => window.__mm.tyreState()")
        thuds = page.evaluate("() => window.__mm.sfxTyres()")
        page.evaluate("() => window.__mm.tyreReset()")
        back = page.evaluate("() => window.__mm.tyreState()")
        b.close()
    assert fresh["count"] >= 40 and fresh["awake"] == 0 and fresh["displaced"] == 0, fresh
    assert still["awake"] == 0 and still["displaced"] == 0, still
    assert hit["displaced"] > fresh["count"] / 2, hit
    assert rest["awake"] == 0 and rest["upright"] < rest["count"], rest
    assert thuds["count"] >= 1, thuds
    assert back["displaced"] == 0 and back["upright"] == back["count"] and back["awake"] == 0, back
    assert not errors, errors
