"""#900: the camera path flies the loaded waypoints with the HUD off and hands the camera back afterwards.
Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# a short path that starts at the camera and ends 120 m east of it: 1 s of flight, no ease, so a
# headless renderer (which draws about a frame a second, dt clamped to 0.05) still finishes it in time
LOAD_PATH = """() => {
  __mm.campath.clear();
  __mm.campath.add();
  const p = __mm.campath.get().points[0];
  return __mm.campath.load({
    format: 'rhyflitzer-campath', version: 1, region: __mm.region, speed: 8, ease: 0,
    points: [{ ...p }, { ...p, x: p.x + 60, dt: 0.5 }, { ...p, x: p.x + 120, z: p.z + 40, dt: 0.5 }],
  });
}"""


def start_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 480, "height": 270})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page, errors


def test_playing_a_loaded_path_hides_the_hud_and_gives_the_camera_back(server):
    with sync_playwright() as p:
        b, page, errors = start_hand(p, server)
        loaded = page.evaluate(LOAD_PATH)
        hud_before = page.evaluate("() => document.body.classList.contains('hud-off')")
        car_before = page.evaluate("() => __mm.car()")
        page.evaluate("() => __mm.campath.play({ record: false })")
        # caught in flight: the clock runs and the HUD is off
        page.wait_for_function("() => __mm.campath.state().t > 0 && document.body.classList.contains('hud-off')", timeout=120000)
        page.wait_for_function("() => __mm.campath.state().playing === false", timeout=120000)
        hud_after = page.evaluate("() => document.body.classList.contains('hud-off')")
        toast_hidden = page.evaluate("() => document.body.classList.contains('campath-play')")
        car_after = page.evaluate("() => __mm.car()")
        # the chase camera has the car back in frame again, instead of standing at the path's far end
        page.wait_for_function("() => { const d = __mm.cam().d; return Math.hypot(d[0], d[1], d[2]) < 40; }", timeout=120000)
        state = page.evaluate("() => __mm.campath.state()")
        b.close()
    assert errors == []
    assert loaded == {"ok": True}, loaded
    assert hud_after == hud_before, (hud_before, hud_after)
    assert toast_hidden is False
    assert state["count"] == 3, state
    assert round(car_after["x"], 3) == round(car_before["x"], 3), (car_before, car_after)
    assert round(car_after["z"], 3) == round(car_before["z"], 3), (car_before, car_after)


def test_a_file_that_is_not_a_camera_path_changes_nothing(server):
    with sync_playwright() as p:
        b, page, errors = start_hand(p, server)
        page.evaluate(LOAD_PATH)
        bad = page.evaluate("() => __mm.campath.load({ format: 'x', version: 1, points: [] })")
        state = page.evaluate("() => __mm.campath.state()")
        b.close()
    assert errors == []
    assert bad == {"error": "format"}, bad
    assert state["count"] == 3, state          # the path that was loaded before is untouched
