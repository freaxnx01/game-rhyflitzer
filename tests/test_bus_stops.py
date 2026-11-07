"""#712: Postauto stops stand beside the kerb, clear of the standing bus. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
needs_data = pytest.mark.skipif(not TT.exists(), reason="run the #682 timetable cut first")
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
    trip = next(t for t in trips if any(c[0] == RUETTI for c in t["calls"]))
    k, call = next((i, c) for i, c in enumerate(trip["calls"]) if c[0] == RUETTI)
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 1280, "height": 720}, locale="en-US")
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.clock.install()
        page.goto(f"{server}/index.html?patime={hhmm(call[2] - 40)}")
        page.wait_for_function("() => window.__mm && window.__mm.busStops && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
        stops = page.evaluate("() => window.__mm.busStops()")
        assert len(stops) == 20 and all(s["shelter"] for s in stops)
        assert all(s["rows"] for s in stops), "every sign has at least one line row"
        frick = next(s for s in stops if s["uic"] == "8500583")
        assert [r["dest"] for r in frick["rows"]] == ["Stein-Säckingen, Bahnhof"]
        assert not any("postauto" in (s["name"] + " ".join(r["dest"] for r in s["rows"])).lower() for s in stops), "no brand text on the signs"
        page.wait_for_function(f"() => window.__mm.postauto().buses.some(x => x.phase === 'stand' && x.k === {k})", timeout=180000)
        page.clock.set_fixed_time(page.evaluate("() => Date.now()"))
        bus = next(x for x in page.evaluate("() => window.__mm.postauto().buses") if x["phase"] == "stand" and x["k"] == k)
        stop = next(s for s in stops if s["uic"] == RUETTI)
        for px, pz in [stop["pole"], *stop["shelter"]["corners"]]:
            assert clearance(px, pz, bus) >= 0.5 - 1e-6, (stop["name"], px, pz, bus)
        assert not errors
        b.close()