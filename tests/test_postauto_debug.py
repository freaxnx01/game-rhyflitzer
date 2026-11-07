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


def open_at(p, server, patime, pasp=None):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    query = f"patime={patime}" + (f"&pasp={pasp}" if pasp else "")
    page.goto(f"{server}/index.html?{query}")
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


@needs_data
def test_f3_sets_clock_and_time_lapse(server):
    """#726: Setzen/Echtzeit/Zeitraffer from the panel; typing must not drive the car."""
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    set_to = hhmm(trip["calls"][1][2] + 60)   # a time this trip is mid-drive, so the fleet is never empty
    set_at = trip["calls"][1][2] + 60
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][0][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.length > 0", timeout=120000)
        page.keyboard.press("F3")
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden")
        # Setzen: typing (arrows steer, Space is the handbrake) applies on Enter and leaves the field
        car0 = page.evaluate("() => window.__mm.pause()")
        page.focus("#debugpatime")
        page.fill("#debugpatime", set_to)
        page.keyboard.press("ArrowUp")
        page.keyboard.press("Space")
        page.keyboard.press("Enter")
        car1 = page.evaluate("() => window.__mm.pause()")
        assert abs(car1["x"] - car0["x"]) < 0.5 and abs(car1["z"] - car0["z"]) < 0.5   # no key reached the car
        page.wait_for_function("() => window.__mm.postauto().buses.length > 0", timeout=120000)   # re-placed at the new time
        clock1 = page.evaluate("() => window.__mm.postauto().clock")
        assert abs(((clock1 - set_at) % 86400 + 86400) % 86400) < 5   # the fleet clock jumps there, then runs on
        assert page.evaluate("() => new URLSearchParams(location.search).get('patime')") == set_to
        # Zeitraffer 10x: the clock runs at 10x without a jump, the bus drives on (no re-place), the URL carries pasp
        buses1 = {x["key"]: x["s"] for x in page.evaluate("() => window.__mm.postauto().buses")}
        page.select_option("#debugpaspeed", "10")
        page.wait_for_timeout(2000)
        page.wait_for_function("() => document.getElementById('debugpaclock').textContent.includes('10×')", timeout=120000)
        st = page.evaluate("() => window.__mm.postauto()")
        clock2 = st["clock"]
        assert 15 <= ((clock2 - clock1) % 86400 + 86400) % 86400 <= 30   # 2 s real at 10x = ~20 s fleet
        now = {x["key"]: x["s"] for x in st["buses"]}
        shared = [k for k in buses1 if k in now]
        assert shared and all(now[k] >= buses1[k] for k in shared)
        assert page.evaluate("() => new URLSearchParams(location.search).get('pasp')") == "10"
        assert "10×" in st["panel"]["clock"]
        # Echtzeit: back to the Europe/Zurich wall clock, the URL params go, the panel text follows
        page.click("#debugpawall")
        page.wait_for_function("() => new URLSearchParams(location.search).get('patime') === null && new URLSearchParams(location.search).get('pasp') === null")
        page.wait_for_function("() => document.getElementById('debugpaclock').textContent.includes('real time')", timeout=120000)   # locale en-US
        assert not errors
        b.close()


@needs_data
def test_f3_url_init_combines_patime_and_pasp(server):
    """#726: ?patime=07:30&pasp=10 starts at that time AND runs at 10x -- the factor is not dropped."""
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    set_at = trip["calls"][1][2] + 60   # a time this trip is mid-drive, so the fleet is never empty
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(set_at), pasp=10)
        page.wait_for_function("() => window.__mm.postauto().buses.length > 0", timeout=120000)
        clock1 = page.evaluate("() => window.__mm.postauto().clock")
        # no jump: the clock runs on from patime at 10x, so at most 10x the real load/elapsed
        # seconds are on top -- a jump or a wrong base (wall time) is far outside this bound
        assert ((clock1 - set_at) % 86400 + 86400) % 86400 < 600
        # the time-lapse factor from the URL is live: the clock advances 10x the real elapsed
        # (sample performance.now() alongside -- headless load times vary, a fixed window does not)
        s1 = page.evaluate("() => ({ c: window.__mm.postauto().clock, p: performance.now() })")
        page.wait_for_timeout(2000)
        s2 = page.evaluate("() => ({ c: window.__mm.postauto().clock, p: performance.now() })")
        delta = ((s2["c"] - s1["c"]) % 86400 + 86400) % 86400
        expect10 = (s2["p"] - s1["p"]) / 1000 * 10
        assert abs(delta - expect10) < 5   # 10x, not 1x (the dropped-factor regression reads ~expect10/10)
        # the panel reflects both: the source time and the factor, the select is at 10x
        page.keyboard.press("F3")
        page.wait_for_function("() => window.__mm.postauto().panel.rows > 0", timeout=120000)
        st = page.evaluate("() => window.__mm.postauto()")
        assert "10×" in st["panel"]["clock"]
        assert page.evaluate("() => document.getElementById('debugpaspeed').value") == "10"
        assert page.evaluate("() => new URLSearchParams(location.search).get('pasp')") == "10"
        assert not errors
        b.close()
