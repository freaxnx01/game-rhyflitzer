"""#767: a line-143 Postauto drives in from the east map edge and shows its number. Slow (Playwright): run in the foreground.

Like test_bus_stops / test_postauto_umlauf the test owns the clock: a fake browser clock, paused once the page is ready,
then stepped in 250 ms slices with the F3 panel at 60x time-lapse. Real-time Postauto assertions are flaky on slow renderers."""
import json

import pytest
from playwright.sync_api import sync_playwright

from test_bus_stops import TT, hhmm, open_paused, set_fleet_clock

TRIPS = json.loads(TT.read_text(encoding="utf-8"))["trips"] if TT.exists() else []
INBOUND = [t for t in TRIPS if t["line"] == "143" and t["fromOutside"] and len(t["calls"]) >= 9]
needs_143 = pytest.mark.skipif(not INBOUND, reason="the committed timetable has no line 143 yet (#767: maintainer rebuild)")
BREITENACHER = "8572416"


@needs_143
def test_line_143_enters_from_the_east_with_its_number(server):
    trip = INBOUND[len(INBOUND) // 2]                       # a midday trip
    key = f'{trip["route"]}:{trip["calls"][0][2]}'           # postauto.js tripKey
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            # placed 3 min before Breitenacher, the bus drives in from the east edge under the fake clock
            set_fleet_clock(page, hhmm(trip["calls"][0][1] - 180), 60)
            bus = None
            for _ in range(400):
                page.clock.run_for(250)
                bus = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key and x["led"]), None)
                if bus:
                    break
            assert bus, "the 143 bus never appeared under the stepped clock"
            assert bus["line"] == "143" and bus["led"] == {"line": "143", "dest": trip["to"], "thanks": None}   # #894: the led state gained the rear display's thanks text (None until the stop)
            stops = [s for s in page.evaluate("() => window.__mm.busStops()") if s["uic"] == BREITENACHER]
            assert stops and all(s["rows"] for s in stops)
            page.keyboard.press("F3")
            for _ in range(40):
                page.clock.run_for(250)
                if page.evaluate("() => [...document.querySelectorAll('#debugparows button')].some(r => r.textContent.includes('143'))"):
                    break
            else:
                pytest.fail("the F3 Postauto list shows no line 143 row")
            page.evaluate("() => document.getElementById('startbtn').click()")   # the start overlay would swallow the Tab hold (#346)
            page.clock.run_for(250)
            page.keyboard.down("Tab")
            page.clock.run_for(250)
            assert page.evaluate("() => window.__mm.mapBuses().full")
            marks = page.evaluate("() => window.__mm.mapBuses().marks")
            assert any(m["key"] == key and m["label"] == "143" for m in marks), marks
            page.keyboard.up("Tab")
            assert not errors, errors
        finally:
            b.close()
