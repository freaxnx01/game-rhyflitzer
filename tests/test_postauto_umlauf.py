"""#763: the Postauto that arrives at a terminus turns and runs the line's next trip. Slow (Playwright): run in the foreground."""
import json
import math

from playwright.sync_api import sync_playwright

from test_bus_stops import TT, hhmm, needs_data, open_paused, set_fleet_clock

FRICK = "Frick, Bahnhof"
STEIN = "Stein-Säckingen, Bahnhof"
# Like test_bus_stops: the test owns the clock. In real time a SwiftShader frame gap re-places the fleet past the
# arrival and the turn is never seen; a paused fake clock stepped in 250 ms at 60x time-lapse drives the bus in.


def first_turn_at_frick(trips):
    """the first arrival at Frick that the same line leaves again within 15 min: (arrival s, next departure s)"""
    arrivals = sorted(t["calls"][-1][1] for t in trips if t["to"] == FRICK)
    departures = sorted(t["calls"][0][2] for t in trips if t["to"] == STEIN)
    return next((a, d) for a in arrivals for d in departures if 0 <= d - a <= 900)


@needs_data
def test_bus_arriving_at_frick_turns_and_shows_the_next_destination(server):
    arr, _ = first_turn_at_frick(json.loads(TT.read_text(encoding="utf-8"))["trips"])
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            set_fleet_clock(page, hhmm(arr - 60), 60)   # placed 60-119 fleet s before the arrival, it drives in
            key, turned, gaps = None, None, []
            for _ in range(600):   # 600 x 250 ms of fake time
                page.clock.run_for(250)
                buses = page.evaluate("() => window.__mm.postauto().buses")
                stands = [(x["x"], x["z"]) for x in buses if x["phase"] == "stand"]
                gaps += [math.dist(a, c) for i, a in enumerate(stands) for c in stands[i + 1:]]
                if key is None:
                    key = next((x["key"] for x in buses if x["to"] == FRICK), None)
                bus = next((x for x in buses if x["key"] == key), None) if key else None
                if bus and bus["to"] == STEIN:
                    turned = bus
                    break
            assert key, "no bus to Frick under the stepped clock"
            assert turned, "the bus that arrived at Frick never turned to Stein-Säckingen"
            assert turned["leg"] >= 1 and turned["legs"] >= 2
            led = None
            for _ in range(40):
                page.clock.run_for(250)
                mesh = page.evaluate("(key) => window.__mm.postautoDisplay().buses.find(x => x.key === key) ?? null", key)
                if mesh and mesh["own"] and mesh["led"]["dest"] == STEIN:
                    led = mesh["led"]
                    break
            assert led, "the display did not switch to the new destination"
            assert len(gaps) == 0 or min(gaps) >= 8, f"two standing buses closer than 8 m: {min(gaps)}"
            assert not errors, errors
        finally:
            b.close()
