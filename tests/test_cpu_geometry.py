"""#323: after the world is built, the merged roles keep only `position` on the CPU and the merge sources are released;
every CPU reader (beam pick, the role raycasts, the style switch) still works. Hand-traced layout. Slow: foreground."""
import math

from playwright.sync_api import sync_playwright

from test_beam import settle_camera

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
READY = "() => window.__mm && window.__mm.sim && window.__mm.cpuGeometry && document.querySelector('#worldstatus')?.textContent"
SISSELN = (1780, 560)   # hand Bahnhofstrasse vertex
GROUND = (1000, 420)    # screen point on terrain below the settled chase camera (tests/test_beam.py)
# The layout is hand-traced, so the surfaces under those two points are fixed. A raycast that reads the merged
# `position` with the wrong topology still returns a hit, just on a triangle that isn't there -- so the hits are
# checked against where the surface actually is, never only for being non-null: `window.__mm.ground()` is the
# analytic height the builders drape the meshes on, computed without touching any BufferGeometry.
BAHNHOFSTRASSE_Y = 17.02   # the roadPlain ribbon over the Sisseln vertex
BEAM_SPOT = (1876.93, -300.05)   # terrain ~9 m in front of the start car, picked through GROUND


def open_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def wait_frames(page, n=3):
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function(f"() => window.__frames.n >= {n}", timeout=T)


def test_merged_roles_keep_only_positions_on_the_cpu(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        wait_frames(page, 5)
        g = page.evaluate("() => window.__mm.cpuGeometry()")
        b.close()
    assert g["partsLeft"] == 0, g
    assert g["builtOther"] > 0, g
    assert g["retainedOther"] <= 0.1 * g["builtOther"], g          # roles never drawn yet may still hold theirs
    for role in ("grass", "roadOsm", "roadPlain"):
        if role in g["roles"]:
            assert g["roles"][role]["other"] == 0, (role, g["roles"][role])
            assert g["roles"][role]["position"] > 0, (role, g["roles"][role])
    assert errors == [], errors


def test_cpu_readers_still_work_after_the_arrays_are_freed(server):
    with sync_playwright() as p:
        b, page, errors = open_hand(p, server)
        wait_frames(page, 5)
        settle_camera(page)   # the beam pick reads the chase camera, which eases in over the first frames
        assert page.evaluate("() => window.__mm.cpuGeometry().roles.grass.other") == 0
        top = page.evaluate(f"() => window.__mm.topAt({SISSELN[0]}, {SISSELN[1]})")
        hits = page.evaluate(f"() => window.__mm.rayHits({SISSELN[0]}, {SISSELN[1]})")
        surface = page.evaluate(f"() => window.__mm.ground({SISSELN[0]}, {SISSELN[1]}, 2000)")
        pick = page.evaluate(f"() => window.__mm.beamPick({GROUND[0]}, {GROUND[1]})")
        assert pick is not None, "GROUND is not on the terrain any more"
        beamed = page.evaluate(f"() => window.__mm.topAt({pick['x']}, {pick['z']})")
        beamed_surface = page.evaluate(f"() => window.__mm.ground({pick['x']}, {pick['z']}, 2000)")
        for k in ("smooth", "original"):
            page.evaluate(f"() => window.__mm.setStyle('{k}')")
            wait_frames(page, 3)
        b.close()
    assert top["role"] == "roadPlain", top                                  # the ribbon, not the bare terrain under it
    assert abs(top["y"] - surface) < 0.01, (top, surface)
    assert abs(top["y"] - BAHNHOFSTRASSE_Y) < 0.1, top
    assert hits["grass"] is not None and hits["road"] is not None, hits
    assert surface - 0.1 <= hits["grass"] < surface, (hits, surface)        # bare terrain, ~50 mm under the ribbon
    assert abs(hits["road"] - surface) < 0.05, (hits, surface)
    assert math.hypot(pick["x"] - BEAM_SPOT[0], pick["z"] - BEAM_SPOT[1]) < 0.5, pick
    assert beamed["role"] == "grass" and abs(beamed["y"] - beamed_surface) < 0.01, (beamed, beamed_surface)
    assert errors == [], errors
