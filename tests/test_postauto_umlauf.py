"""#763: the Postauto that arrives at a terminus turns and runs the line's next trip. Slow (Playwright): run in the foreground."""
import math
import time

from playwright.sync_api import sync_playwright

from test_postauto_debug import needs_data, open_at

FRICK = "Frick, Bahnhof"
STEIN = "Stein-Säckingen, Bahnhof"
BUS = "(key) => window.__mm.postauto().buses.find(x => x.key === key) ?? null"


@needs_data
def test_bus_arriving_at_frick_turns_and_shows_the_next_destination(server):
    with sync_playwright() as p:
        b, page, errors = open_at(p, server, "08:15", "10")
        try:
            page.wait_for_function("(to) => window.__mm.postauto().buses.some(x => x.to === to)", arg=FRICK, timeout=240000)
            key = page.evaluate("(to) => window.__mm.postauto().buses.find(x => x.to === to).key", FRICK)
            gaps, turned, deadline = [], None, time.time() + 240
            while turned is None and time.time() < deadline:   # sample often: at 10x a stop lasts only seconds of real time
                stands = page.evaluate("() => window.__mm.postauto().buses.filter(x => x.phase === 'stand').map(x => [x.x, x.z])")
                gaps += [math.dist(a, c) for i, a in enumerate(stands) for c in stands[i + 1:]]
                bus = page.evaluate(BUS, key)
                if bus and bus["to"] == STEIN:
                    turned = bus
                page.wait_for_timeout(100)
            assert turned, "the bus that arrived at Frick never turned to Stein-Säckingen"
            assert turned["leg"] >= 1 and turned["legs"] >= 2
            page.wait_for_function("""(key) => {
                const bus = window.__mm.postauto().buses.find(x => x.key === key);
                const mesh = window.__mm.postautoDisplay().buses.find(x => x.key === key);
                return !!bus && !!mesh && mesh.own && mesh.led.dest === bus.to;
            }""", arg=key, timeout=120000)
            assert len(gaps) == 0 or min(gaps) >= 8, f"two standing buses closer than 8 m: {min(gaps)}"
            assert not errors
        finally:
            b.close()
