"""#712: Postauto stops stand beside the kerb, clear of the standing bus. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
needs_data = pytest.mark.skipif(not TT.exists(), reason="run the #682 timetable cut first")
# SwiftShader renders ~1 fps at full size, which makes the fleet's fixed-dt simulation crawl; the 320x200 viewport
# runs ~8 fps so the bus reaches its stop inside the timeout. A frame gap > PA.resync (5 s) re-places the fleet by
# wall time, past the stop -- the warm-up load keeps the bus.glb parse out of the way, and a miss (some other stall)
# is retried on the next trip that calls at Rütti.
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
RUETTI = "8582522"   # Industriezone Rütti: the bus stands across the kerb line here (spec table)
BUS_L, BUS_W = 12.2, 2.55


def hhmm(secs):
    secs = int(secs) % 86400
    return f"{secs // 3600:02d}:{secs // 60 % 60:02d}"


def clearance(px, pz, bus):
    dx, dz = px - bus["x"], pz - bus["z"]
    c, s = math.cos(bus["th"]), math.sin(bus["th"])
    u, v = dx * c + dz * s, -dx * s + dz * c
    return max(abs(u) - BUS_L / 2, abs(v) - BUS_W / 2)


@needs_data
def test_stops_lay_out_clear_of_the_standing_bus_at_ruetti(server):
    trips = json.loads(TT.read_text(encoding="utf-8"))["trips"]
    calls = sorted(((t["route"], i, c[2]) for t in trips for i, c in enumerate(t["calls"]) if c[0] == RUETTI),
                   key=lambda x: x[2])
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": 320, "height": 200}, locale="en-US")
        warm = ctx.new_page()   # warm-up: fetch and parse bus.glb before the clock matters
        warm.goto(f"{server}/index.html?patime=05:00")
        warm.wait_for_function("() => window.__mm && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
        warm.wait_for_timeout(30000)
        warm.close()
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        assert not errors
        bus = None
        for route, k, arr in calls[:2]:   # a stall after the call time re-places the fleet past the stop; one retry
            # patime has minute resolution: arr-40 lands in the minute before the Rütti call, so the fleet's
            # time-based first placement puts the bus a few hundred metres short; it brakes in from there, and the
            # last metres are slow under SwiftShader (the sim runs at frame rate), so the poll waits long
            page.goto(f"{server}/index.html?patime={hhmm(arr - 40)}", timeout=120000)
            page.wait_for_function("() => window.__mm && window.__mm.busStops && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
            try:
                page.wait_for_function(
                    f"() => window.__mm.postauto().buses.some(x => x.phase === 'stand' && x.k === {k} && x.route === '{route}')",
                    timeout=360000)
            except Exception:
                continue   # a stall re-placed the fleet past the stop; the next trip calls again
            bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses")
                       if x["phase"] == "stand" and x["k"] == k and x["route"] == route)
            break
        assert bus, "no bus stood at Industriezone Rütti within 2 trips"
        stops = page.evaluate("() => window.__mm.busStops()")
        assert len(stops) == 20 and all(s["shelter"] for s in stops)
        assert all(s["rows"] for s in stops), "every sign has at least one line row"
        frick = next(s for s in stops if s["uic"] == "8500583")
        assert [r["dest"] for r in frick["rows"]] == ["Stein-Säckingen, Bahnhof"]
        assert not any("postauto" in (s["name"] + " ".join(r["dest"] for r in s["rows"])).lower() for s in stops), "no brand text on the signs"
        stop = next(s for s in stops if s["uic"] == RUETTI)
        for px, pz in [stop["pole"], *stop["shelter"]["corners"]]:
            assert clearance(px, pz, bus) >= 0.5 - 1e-6, (stop["name"], px, pz, bus)
        assert not errors
        b.close()