"""#241: the Holzbrücke follows its S-shaped line, stands on six piers and carries three chapels."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

pytestmark = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def bridge_line():
    """The bridge's OSM line, from the Stein (eastern) end."""
    w = json.loads(WORLD.read_text(encoding="utf-8")); hb = w["anchors"]["landmarks"]["holzbruecke"]
    road = min((r for r in w["roads"] if r.get("bridge")), key=lambda r: min(math.dist((hb["x"], hb["z"]), p) for p in r["pts"]))
    return road["pts"] if road["pts"][0][0] >= road["pts"][-1][0] else road["pts"][::-1]


def at(pts, t, s=0.0):
    """([x, z], heading) at arc length t along pts, s metres to one side of the line."""
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if acc + seg >= t or b is pts[-1]:
            u = (t - acc) / seg; ux, uz = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
            return [a[0] + (b[0] - a[0]) * u + uz * s, a[1] + (b[1] - a[1]) * u - ux * s], math.atan2(uz, ux)
        acc += seg


@pytest.fixture(scope="module")
def bridge(server):
    pts = bridge_line(); length = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    inside = [(t, s) for t in range(10, int(length) - 9, 5) for s in (-2.2, 2.2)]
    outside = [(t, s) for t in range(60, 141, 10) for s in (-4.5, 4.5)]
    starts = [(t, *at(pts, t)) for t in (5, 40, 70, 120)]
    msgs = []
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.on("pageerror", lambda e: msgs.append((str(e), "")))
        page.on("console", lambda m: msgs.append((m.text, m.location.get("url", ""))) if m.type in ("error", "warning") else None)
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        counts = page.evaluate("() => window.__mm.counts.holzbruecke || null")
        ground = lambda ps: page.evaluate(f"() => {json.dumps([at(pts, t, s)[0] for t, s in ps])}.map(([x, z]) => window.__mm.ground(x, z, 1e4))")
        g_in, g_out = ground(inside), ground(outside)
        runs = [(t, [x, z], page.evaluate(f"() => window.__mm.sim({x}, {z}, {th}, 15, 3)")) for t, (x, z), th in starts]
        br.close()
    # own-page messages only, as in test_smoke.load: the terrain 404 is on purpose, third-party resources are not under test
    own = [t for t, u in msgs if "terrain_hochrhein.mmh" not in u and (not u or u.startswith(server))]
    return {"counts": counts, "inside": list(zip(inside, g_in)), "outside": list(zip(outside, g_out)), "runs": runs, "msgs": own}


def test_six_piers_three_chapels_and_a_frame_every_five_metres(bridge):
    assert bridge["counts"] is not None, "window.__mm.counts.holzbruecke is not set"
    assert bridge["counts"]["piers"] == 6
    assert bridge["counts"]["chapels"] == 3
    assert bridge["counts"]["frames"] >= 40


def test_deck_follows_the_line(bridge):
    """2.2 m either side of the line is deck all the way; 4.5 m either side over the Rhine is water, so the deck is not just wider."""
    holes = [(ts, g) for ts, g in bridge["inside"] if g <= -1]
    widened = [(ts, g) for ts, g in bridge["outside"] if g >= -1]
    assert holes == [], holes
    assert widened == [], widened


def test_car_crosses_every_bend(bridge):
    """Started on the line at 15 m/s with the gas held, the car runs through the bends at 32, 56, 82 and 141 m without stopping on a
    rail joint and without ending in the Rhine."""
    for t, start, r in bridge["runs"]:
        assert r["y"] > -1, (t, r)                                          # not in the river
        assert math.dist(start, (r["x"], r["z"])) > 35 and r["speed"] > 10, (t, r)   # kept going


def test_no_console_errors(bridge):
    assert bridge["msgs"] == []
