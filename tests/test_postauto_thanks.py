"""#800: a Postauto's rear display thanks the player for waiting while it pulls out of a stop. Slow (Playwright):
run in the foreground."""
import json

from playwright.sync_api import sync_playwright

from test_bus_stops import open_paused, set_fleet_clock, hhmm, TT, needs_data, RUETTI


@needs_data
def test_waiting_behind_a_departing_bus_thanks_on_the_rear_only(server):
    trips = json.loads(TT.read_text(encoding="utf-8"))["trips"]
    route, k, arr = min(((t["route"], i, c[2]) for t in trips for i, c in enumerate(t["calls"]) if c[0] == RUETTI),
                        key=lambda x: x[2])
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # fast-forward (as in the Rütti stop test) until the bus stands at the stop
        set_fleet_clock(page, hhmm(arr - 60), 60)
        bus = None
        for _ in range(400):
            page.clock.run_for(250)
            found = [x for x in page.evaluate("() => window.__mm.postauto().buses")
                     if x["phase"] == "stand" and x["k"] == k and str(x["route"]) == str(route)]
            if found:
                bus = found[0]
                break
        assert bus, "no bus stood at Industriezone Rütti under the stepped clock"
        key = bus["key"]

        # still at 60x through the rest of the dwell (one 16 ms frame is about a fleet second), then back to 1x the moment
        # it pulls out (setFactor keeps the fleet time): at 60x the bus leaves the 40 m / 10 s thank-you window between two
        # samples on a slow renderer, and 1x through the whole dwell is too many frames for the hosted runner
        cur = bus
        for _ in range(200):
            page.clock.run_for(16)
            cur = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key), cur)
            if cur["phase"] == "drive":
                break
        assert cur["phase"] == "drive", "the bus never left the stop"
        page.evaluate("""() => { const sel = document.getElementById('debugpaspeed'); sel.value = '1'; sel.dispatchEvent(new Event('change')); }""")
        depart_s, pose = cur["s"], None
        for _ in range(150):   # 15 s of fleet time: the pull-out is done by 16 m
            page.clock.run_for(100)
            cur = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key), None)
            if cur and cur["phase"] == "drive" and cur["s"] - depart_s >= 16:   # back in its lane (busOffset's blend is done by 15 m)
                pose = cur
                break
        assert pose, "the bus never drove clear of the stop"

        before = next(d for d in page.evaluate("() => window.__mm.postautoDisplay().buses") if d["key"] == key)
        assert before["split"], "the rear quad did not split off its own material"
        assert before["rearW"] > 2.0 and 0.25 < before["rearH"] < 0.4, "the rear display is not stretched to the front display's width"
        front_before, rear_before = before["frontMap"], before["rearMap"]

        # wait until the bus is 15 m further on, then put the player where the bus itself stood (in its lane, 15 m
        # behind): along the heading would miss the lane on a bend (3.2 m off at Rütti, thankLane is 2.5 m)
        cur = pose
        for _ in range(50):
            page.clock.run_for(100)
            cur = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key), cur)
            if cur["s"] - pose["s"] >= 15:
                break
        assert cur["s"] - pose["s"] >= 15, "the bus did not drive on after pulling out"
        page.evaluate("([x, z, t]) => window.__mm.place(x, z, t)", [pose["x"], pose["z"], pose["th"]])

        thanked = None
        for _ in range(40):
            page.clock.run_for(100)
            cur = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key), None)
            if cur and cur["led"] and cur["led"].get("thanks"):
                thanked = cur
                break
        assert thanked, "the bus never thanked the player after departing"
        assert thanked["led"]["thanks"] == "Thank you!"

        mid = next(d for d in page.evaluate("() => window.__mm.postautoDisplay().buses") if d["key"] == key)
        assert mid["rearMap"] != rear_before, "the rear texture did not change for the thank-you"
        assert mid["frontMap"] == front_before, "the front display changed too"

        ended = False
        for _ in range(80):   # thankSecs is 4 s
            page.clock.run_for(100)
            cur = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key), None)
            if cur and not (cur["led"] and cur["led"].get("thanks")):
                ended = True
                break
        assert ended, "the thank-you never cleared"

        after = next(d for d in page.evaluate("() => window.__mm.postautoDisplay().buses") if d["key"] == key)
        assert after["frontMap"] == front_before, "the front display changed after the thank-you cleared"

        assert not errors
        b.close()
