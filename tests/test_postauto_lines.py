"""#808: Postautos of lines 134 and 135 show number and destination. Fake clock like test_postauto_143.py. Slow: foreground."""
import json

import pytest
from playwright.sync_api import sync_playwright

from test_bus_stops import TT, hhmm, open_paused, set_fleet_clock

TRIPS = json.loads(TT.read_text(encoding="utf-8"))["trips"] if TT.exists() else []


@pytest.mark.parametrize("line", ["134", "135"])
def test_bus_shows_its_number_and_destination(server, line):
    own = [t for t in TRIPS if t["line"] == line]
    if not own:
        pytest.skip(f"the committed timetable has no line {line} yet (#808: maintainer rebuild)")
    trip, dests = own[len(own) // 2], {t["to"] for t in own}
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            set_fleet_clock(page, hhmm(trip["calls"][0][1] - 120), 60)
            bus = None
            for _ in range(400):
                page.clock.run_for(250)
                bus = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["line"] == line and x["led"]), None)
                if bus:
                    break
            assert bus, f"no line {line} bus appeared under the stepped clock"
            assert bus["led"]["line"] == line and bus["led"]["dest"] in dests
            assert not errors, errors
        finally:
            b.close()
