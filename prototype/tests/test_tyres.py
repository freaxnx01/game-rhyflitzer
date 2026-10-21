"""#416: the Crash-Platz's tyre stacks collapse with real physics (crashcat). Jump to the yard, drive into the stacks at 50 km/h: most
tyres are knocked over and come to rest; "Set up props" (F3) and a jump to the yard stand them up again. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_knock import jump_to_yard, needs_world, open_page

T = 120000
KMH50 = 50 / 3.6


def wait_engine(page):
    page.wait_for_function("() => window.__mm.tyreState() && window.__mm.tyreState().engine === 'ready'", timeout=T)


def drive_into_stacks(page):
    st = page.evaluate("() => window.__mm.yard().tyreStacks")
    x = st[0]["x"]
    z = sum(s["z"] for s in st) / len(st)
    return page.evaluate(f"() => window.__mm.sim({x - 8}, {z}, 0, {KMH50}, 1.6, ['KeyW'])")


@needs_world
def test_the_yard_tyre_stacks_collapse_when_hit_and_set_up_props_restores_them(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        assert page.evaluate("() => window.__mm.tyreState()") is None, "nothing is built away from the Crash-Platz"
        stacks = page.evaluate("() => window.__mm.yard().tyreStacks")
        assert len(stacks) >= 3 and all(s["n"] == 8 for s in stacks), stacks
        jump_to_yard(page)
        wait_engine(page)
        fresh = page.evaluate("() => window.__mm.tyreState()")
        page.evaluate("() => window.__mm.step(3, [])")
        still = page.evaluate("() => window.__mm.tyreState()")
        drive_into_stacks(page)
        hit = page.evaluate("() => window.__mm.tyreState()")
        page.evaluate("() => window.__mm.sim(%f, %f, 0, 0, 20, [])" % (stacks[0]["x"] - 60, stacks[0]["z"]))
        rest = page.evaluate("() => window.__mm.tyreState()")
        thuds = page.evaluate("() => window.__mm.sfxTyres()")
        page.keyboard.press("F3")
        page.click("#knockreset")
        back = page.evaluate("() => window.__mm.tyreState()")
        # a second knock, then a jump to the yard stands them up again
        jump_to_yard(page)
        drive_into_stacks(page)
        assert page.evaluate("() => window.__mm.tyreState().displaced") > 0
        jump_to_yard(page)
        jumped = page.evaluate("() => window.__mm.tyreState()")
        b.close()
    assert fresh["count"] == 8 * len(stacks) and fresh["awake"] == 0 and fresh["displaced"] == 0, fresh
    assert still["awake"] == 0 and still["displaced"] == 0, still
    assert hit["displaced"] > fresh["count"] / 3, hit
    assert rest["upright"] < rest["count"], rest
    assert thuds["count"] >= 1, thuds
    assert back["displaced"] == 0 and back["upright"] == back["count"] and back["awake"] == 0, back
    assert jumped["displaced"] == 0 and jumped["awake"] == 0, jumped
