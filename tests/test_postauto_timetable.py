"""#801: the PostAuto timetable opens at a stop's board and from the pause menu. Slow (Playwright): run in the foreground."""
import json

from playwright.sync_api import sync_playwright

from test_bus_stops import TT, needs_data, open_paused, set_fleet_clock

UNTERDORF = "8572417"


def next_dep(trips, uic, now):
    deps = [c[2] for t in trips for i, c in enumerate(t["calls"])
            if c[0] == uic and (i < len(t["calls"]) - 1 or t["toOutside"])]
    return min(deps, key=lambda d: (d - now) % 86400)


def run(page, ms=500):
    for _ in range(ms // 250):
        page.clock.run_for(250)


@needs_data
def test_timetable_at_the_stop_and_from_pause(server):
    trips = json.loads(TT.read_text(encoding="utf-8"))["trips"]
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        set_fleet_clock(page, "14:07", 1)
        page.evaluate("() => document.getElementById('startbtn').click()")
        run(page)
        page.keyboard.press("KeyZ")   # on foot
        run(page)
        stop = [s for s in page.evaluate("() => window.__mm.busStops()") if s["uic"] == UNTERDORF][0]
        page.evaluate("([x, z]) => window.__mm.place(x + 1, z)", stop["pole"])
        run(page)
        assert page.evaluate("() => window.__mm.timetable().near") == UNTERDORF
        page.keyboard.press("KeyE")
        tt = page.evaluate("() => window.__mm.timetable()")
        assert tt["open"] and tt["view"] == "stop" and tt["uic"] == UNTERDORF
        now = page.evaluate("() => window.__mm.postauto().clock")
        want = page.evaluate("(s) => new Intl.DateTimeFormat(navigator.language, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(s * 1000))",
                             next_dep(trips, UNTERDORF, now) % 86400)
        assert want in tt["text"]
        page.keyboard.press("KeyZ")   # swallowed while open
        assert page.evaluate("() => window.__mm.foot().on")
        page.evaluate("() => document.querySelector('#ttlines button').click()")   # page.click waits on rAF: the clock is paused
        tt = page.evaluate("() => window.__mm.timetable()")
        assert tt["view"] == "line"
        page.keyboard.press("ArrowRight")
        assert page.evaluate("() => window.__mm.timetable().page") == 1
        page.keyboard.press("Escape")
        assert not page.evaluate("() => window.__mm.timetable().open")
        page.keyboard.press("Escape")   # pause
        run(page)
        page.evaluate("() => document.getElementById('pausetimetable').click()")
        tt = page.evaluate("() => window.__mm.timetable()")
        assert tt["open"] and tt["from"] == "pause" and tt["view"] == "line"
        page.keyboard.press("Escape")
        assert page.evaluate("() => !window.__mm.timetable().open && window.__mm.pause().on")
        assert errors == []
        b.close()
