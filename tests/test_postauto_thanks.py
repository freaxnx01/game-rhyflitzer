"""#800: a Postauto's rear display thanks the player for waiting while it pulls out of a stop. Slow (Playwright):
run in the foreground."""
import json
import math

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

        # fine-grained (one frame at a time) stepping from here: the departure and the 4 s thank-you window are
        # both too short to survive being sampled only once per page.clock.run_for(250) chunk
        depart_s, pose = None, None
        for _ in range(300):
            page.clock.run_for(16)
            cur = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key), None)
            if not cur:
                continue
            if cur["phase"] == "drive":
                if depart_s is None:
                    depart_s = cur["s"]
                if cur["s"] - depart_s >= 16:   # back in its lane (busOffset's pull-out blend is done by 15 m)
                    pose = cur
                    break
        assert pose, "the bus never drove clear of the stop"

        before = next(d for d in page.evaluate("() => window.__mm.postautoDisplay().buses") if d["key"] == key)
        assert before["split"], "the rear quad did not split off its own material"
        front_before, rear_before = before["frontMap"], before["rearMap"]

        # place the player 15 m behind the bus, in its lane
        th = pose["th"]
        px, pz = pose["x"] - 15 * math.cos(th), pose["z"] - 15 * math.sin(th)
        page.evaluate("([x, z, t]) => window.__mm.place(x, z, t)", [px, pz, th])

        thanked = None
        for _ in range(60):
            page.clock.run_for(16)
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
        for _ in range(30):
            page.clock.run_for(16)
            cur = next((x for x in page.evaluate("() => window.__mm.postauto().buses") if x["key"] == key), None)
            if cur and not (cur["led"] and cur["led"].get("thanks")):
                ended = True
                break
        assert ended, "the thank-you never cleared"

        after = next(d for d in page.evaluate("() => window.__mm.postautoDisplay().buses") if d["key"] == key)
        assert after["frontMap"] == front_before, "the front display changed after the thank-you cleared"

        assert not errors
        b.close()
