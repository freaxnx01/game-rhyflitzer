"""#707: the Postauto section in the F3 debug panel. Slow (Playwright): run in the foreground."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
needs_data = pytest.mark.skipif(not TT.exists(), reason="run the #682 timetable cut first")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def hhmm(secs):
    secs = int(secs) % 86400
    return f"{secs // 3600:02d}:{secs // 60 % 60:02d}"


def open_at(p, server, patime):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/index.html?patime={patime}")
    page.wait_for_function("() => window.__mm && window.__mm.sim && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
    return b, page, errors


@needs_data
def test_f3_lists_buses_and_follow_returns_to_car(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.length > 0", timeout=120000)
        page.keyboard.press("F3")
        # a row per bus, and the clock names its source: the ?patime= value the clock runs on
        page.wait_for_function("() => { const st = window.__mm.postauto(); return st.panel.rows > 0 && st.panel.rows === st.buses.length; }", timeout=120000)
        shown = page.evaluate("() => ({ clock: window.__mm.postauto().panel.clock, given: new URLSearchParams(location.search).get('patime') })")
        assert shown["given"] in shown["clock"]
        page.click("#startbtn")   # the start overlay covers the panel; a row is only clickable in the game
        page.wait_for_function("() => document.getElementById('overlay').hidden")
        car0 = page.evaluate("() => window.__mm.debug().pos")
        page.locator("#debugparows button[data-key]").first.click()
        # headless renders under 1 fps and the loop clamps dt: poll the end state -- follow set and the camera
        # (__mm.cam().d hangs off P, the player the debug panel reports) within 30 m of the followed bus
        page.wait_for_function("""() => {
            const st = window.__mm.postauto();
            if (!st.follow) return false;
            const bus = st.buses.find(x => x.key === st.follow);
            if (!bus) return false;
            const pos = window.__mm.debug().pos, d = window.__mm.cam().d;
            return Math.hypot(pos.x + d[0] - bus.x, pos.z + d[2] - bus.z) < 30;
        }""", timeout=120000)
        car1 = page.evaluate("() => window.__mm.debug().pos")
        assert abs(car1["x"] - car0["x"]) < 0.5 and abs(car1["z"] - car0["z"]) < 0.5   # the car stayed where it was
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.postauto().follow === null", timeout=120000)
        assert not page.evaluate("() => window.__mm.pause().on")   # the first Esc ends the follow, it does not pause
        assert not errors
        b.close()
