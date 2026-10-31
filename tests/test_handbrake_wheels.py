"""#542: the wheels stay on the ground in a handbrake turn and in handbrake donuts. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

SINK_M = 0.03   # the slide may sink a wheel this much deeper than plain driving does, no more


def test_handbrake_donut_keeps_the_wheels_on_the_ground(server):
    """Full speed, then handbrake with full lock for four seconds: the lean sinks no wheel deeper than driving straight does.
    Straight driving is the baseline, not 0: the car stands on the ground under its centre, and the road under a wheel can be
    a few centimetres higher (camber, edges)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        straight = page.evaluate("() => window.__mm.driveSim(4, ['ArrowUp'])")
        donut = page.evaluate("() => window.__mm.driveSim(4, ['ArrowUp', 'ArrowLeft', 'ControlLeft'])")
        b.close()
    assert straight["speed"] > 15, straight
    assert donut["roll"] > 0.05, donut   # the body still leans in the slide
    assert donut["worst"] >= straight["worst"] - SINK_M, (straight, donut)
    assert not errors, errors
