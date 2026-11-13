"""#712: Postauto stops stand beside the kerb, clear of the standing bus. Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
TT = ROOT / "data" / "timetable_hochrhein.json"
needs_data = pytest.mark.skipif(not TT.exists(), reason="run the #682 timetable cut first")
# The bus stands at Rütti only by driving in: the timetable has arr == dep there, so no placement is ever "inside the
# dwell" (placeTrip re-places a clock past the call as already driving on), and the real-time run depended on SwiftShader
# frame gaps staying under PA.resync (5 s) for the minute before the call -- a gap re-places the fleet past the stop. The
# test therefore owns the clock: a fake browser clock, paused once the page is ready, then stepped in 16 ms frames with
# the F3 panel at 60x time-lapse (a frame is ~1 fleet second, sub-stepped; the jump limit scales with the factor).
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


def open_paused(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 320, "height": 200}, locale="en-US")
    page.clock.install()
    page.goto(f"{server}/index.html?patime=05:00", timeout=120000)
    page.wait_for_function("() => window.__mm && window.__mm.busStops && window.__mm.postauto && window.__mm.postauto().ready", timeout=240000)
    page.clock.pause_at(page.evaluate("() => Date.now()") + 1000)
    return b, page


def set_fleet_clock(page, patime, factor):
    page.evaluate("""([t, f]) => {
        const sel = document.getElementById('debugpaspeed'); sel.value = String(f); sel.dispatchEvent(new Event('change'));
        document.getElementById('debugpatime').value = t; document.getElementById('debugpasetgo').click();
    }""", [patime, factor])


@needs_data
def test_stops_lay_out_clear_of_the_standing_bus_at_ruetti(server):
    trips = json.loads(TT.read_text(encoding="utf-8"))["trips"]
    route, k, arr = min(((t["route"], i, c[2]) for t in trips for i, c in enumerate(t["calls"]) if c[0] == RUETTI),
                        key=lambda x: x[2])
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # placed 60-119 s before the call (patime has minute resolution), the bus drives in under the fake clock
        set_fleet_clock(page, hhmm(arr - 60), 60)
        bus = None
        for _ in range(400):   # 400 x 250 ms = 100 s of fake time = 100 frames; the bus needs ~60-120 fleet s
            page.clock.run_for(250)
            found = [x for x in page.evaluate("() => window.__mm.postauto().buses")
                     if x["phase"] == "stand" and x["k"] == k and str(x["route"]) == str(route)]
            if found:
                bus = found[0]
                break
        assert bus, "no bus stood at Industriezone Rütti under the stepped clock"
        stops = page.evaluate("() => window.__mm.busStops()")
        world = json.loads((ROOT / "data" / "world_hochrhein.json").read_text(encoding="utf-8"))
        points = {(s["uic"], s["x"], s["z"]) for r in world["busRoutes"] for s in r["stops"]}
        assert len(stops) == len(points)        # one pole per stop point, whatever lines run (#808)
        assert all(s["shelter"] or s["name"] == "Stein-Säckingen Bahnhof" for s in stops)   # #808 A8
        assert all(s["rows"] for s in stops), "every sign has at least one line row"
        dests = [r["dest"] for r in next(s for s in stops if s["uic"] == "8500583")["rows"]]
        assert "Stein-Säckingen, Bahnhof" in dests and "Frick, Bahnhof" not in dests
        assert not any("postauto" in (s["name"] + " ".join(r["dest"] for r in s["rows"])).lower() for s in stops), "no brand text on the signs"
        stop = next(s for s in stops if s["uic"] == RUETTI)
        for px, pz in [stop["pole"], *stop["shelter"]["corners"]]:
            assert clearance(px, pz, bus) >= 0.5 - 1e-6, (stop["name"], px, pz, bus)
        assert not errors
        b.close()


@needs_data
def test_car_stops_at_a_shelter_instead_of_driving_through(server):
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        stop = next(s for s in page.evaluate("() => window.__mm.busStops()") if s["uic"] == RUETTI)
        sx, sz, yaw = stop["shelter"]["x"], stop["shelter"]["z"], stop["yaw"]
        nx, nz = -math.sin(yaw), math.cos(yaw)                     # away from the road, through the shelter
        hd = 1.8 / 2
        start = (sx - nx * (hd + 8), sz - nz * (hd + 8))           # on the road side, nose at the shelter
        page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [*start, math.atan2(nz, nx)])
        page.evaluate("() => window.__mm.driveSim(4, ['ArrowUp'])")
        car = page.evaluate("() => window.__mm.car()")
        depth = (car["x"] - sx) * nx + (car["z"] - sz) * nz        # along n from the shelter centre
        moved = (car["x"] - start[0]) * nx + (car["z"] - start[1]) * nz
        b.close()
    assert moved > 3, f"the car did not drive towards the shelter ({moved:.2f} m)"
    assert depth < -hd, f"the car centre is {depth:.2f} m along n -- inside or past the shelter (face at {-hd})"

@needs_data
def test_stop_signs_face_the_road_and_are_single_sided(server):
    """#795: the road-side face must look at the road (a DoubleSide back face reads mirrored); no face is double-sided."""
    with sync_playwright() as p:
        b, page = open_paused(p, server)
        stops = page.evaluate("() => window.__mm.busStops()")
        built = page.evaluate("() => window.__mm.stopSignFaces()")
        b.close()
    assert built, "no stop sign was built"
    checked = 0
    for stop in stops:
        match = [s for s in built if abs(s["x"] - stop["pole"][0]) < 1e-3 and abs(s["z"] - stop["pole"][1]) < 1e-3]
        assert len(match) == 1, stop["name"]
        faces = match[0]["faces"]
        assert len(faces) == 2, stop["name"]
        assert all(f["side"] == 0 for f in faces), "FrontSide (0), not DoubleSide (2)"
        away = (-math.sin(stop["yaw"]), math.cos(stop["yaw"]))      # world direction away from the road
        dots = sorted(f["nx"] * away[0] + f["nz"] * away[1] for f in faces)
        assert dots[0] < -0.999 and dots[1] > 0.999, (stop["name"], dots)
        checked += 1
    assert checked == len(stops)
