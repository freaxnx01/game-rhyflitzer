"""#711: Postauto marks on the minimap and the full map. Slow (Playwright): run in the foreground."""
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
def test_postauto_on_the_map(server):
    trip = json.loads(TT.read_text(encoding="utf-8"))["trips"][0]
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, hhmm(trip["calls"][1][2] + 60))
        page.wait_for_function("() => window.__mm.postauto().buses.length > 0 && window.__mm.mapBuses().marks.length > 0", timeout=120000)
        buses = page.evaluate("() => window.__mm.postauto().buses")
        got = page.evaluate("() => window.__mm.mapBuses()")
        assert len(got["marks"]) == len(buses)
        assert all(m["line"] == "133" and m["label"] is None for m in got["marks"])   # minimap: no label
        m = got["marks"][0]
        if 0 <= m["px"] <= 800 and 0 <= m["py"] <= 400:
            yellow = page.evaluate("""([x, y]) => { const d = document.getElementById('map').getContext('2d').getImageData(Math.round(x) - 6, Math.round(y) - 6, 12, 12).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 170 && d[i + 2] < 60) n++; return n; }""", [m["px"], m["py"]])
            assert yellow > 5
        page.click("#startbtn")   # the start overlay would swallow the Tab hold (#346)
        page.wait_for_function("() => document.getElementById('overlay').hidden")
        page.keyboard.down("Tab")
        page.wait_for_function("() => window.__mm.mapBuses().full", timeout=10000)
        assert page.evaluate("() => window.__mm.mapBuses().marks.every(m => m.label === '133')")
        page.keyboard.up("Tab")
        assert errors == []
        b.close()
