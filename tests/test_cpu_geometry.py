"""#323: after the world is built, the merged roles keep only `position` on the CPU and the merge sources are released;
every CPU reader (beam pick, the role raycasts, the style switch) still works. Hand-traced layout. Slow: foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 120000
READY = "() => window.__mm && window.__mm.sim && window.__mm.cpuGeometry && document.querySelector('#worldstatus')?.textContent"
SISSELN = (1780, 560)   # hand Bahnhofstrasse vertex
GROUND = (1000, 420)    # screen point on terrain below the settled chase camera (tests/test_beam.py)


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
        assert page.evaluate("() => window.__mm.cpuGeometry().roles.grass.other") == 0
        top = page.evaluate(f"() => window.__mm.topAt({SISSELN[0]}, {SISSELN[1]})")
        hits = page.evaluate(f"() => window.__mm.rayHits({SISSELN[0]}, {SISSELN[1]})")
        pick = page.evaluate(f"() => window.__mm.beamPick({GROUND[0]}, {GROUND[1]})")
        for k in ("smooth", "original"):
            page.evaluate(f"() => window.__mm.setStyle('{k}')")
            wait_frames(page, 3)
        b.close()
    assert top is not None and top["role"], top
    assert any(v is not None for v in hits.values()), hits
    assert pick is not None and "x" in pick and "z" in pick, pick
    assert errors == [], errors
