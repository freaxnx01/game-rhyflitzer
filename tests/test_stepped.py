"""#875: stepped capture -- __mm.tick advances the game and the camera path by an exact fixed
step, freezes everything between ticks, and hands back the canvas without the HUD.
Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# a two-point path, 40 m apart at speed 20 = 2 s of flight, no ease: the camera is still
# flying at tick 60 (t = 1 s), so a frozen t and two different grabs are both meaningful
LOAD_PATH = """() => {
  __mm.campath.clear();
  __mm.campath.add();
  const p = __mm.campath.get().points[0];
  return __mm.campath.load({
    format: 'rhyflitzer-campath', version: 1, region: __mm.region, speed: 20, ease: 0,
    points: [{ ...p }, { ...p, x: p.x + 40 }],
  });
}"""


def start_hand(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 480, "height": 270}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page, errors


def test_stepped_mode_ticks_the_path_in_exact_steps_and_freezes_between(server):
    with sync_playwright() as p:
        b, page, errors = start_hand(p, server)
        loaded = page.evaluate(LOAD_PATH)
        on = page.evaluate("() => __mm.stepped(true)")
        page.evaluate("() => __mm.campath.play()")
        grab30 = grab60 = None
        for i in range(60):   # tick 30 lands at t = 0.5 s, tick 60 at t = 1 s
            grab = page.evaluate("(dt) => __mm.tick(dt, { grab: 'png' })", 1 / 60)
            if i == 29:
                grab30 = grab
                t30 = page.evaluate("() => __mm.campath.state().t")
            elif i == 59:
                grab60 = grab
        t60 = page.evaluate("() => __mm.campath.state().t")
        page.wait_for_timeout(1000)   # a real second without a tick: nothing may move
        t_waited = page.evaluate("() => __mm.campath.state().t")
        off = page.evaluate("() => __mm.stepped(false)")
        page.wait_for_function(f"() => __mm.campath.state().t > {t60!r}", timeout=120000)   # the loop runs again
        try:
            page.evaluate("() => __mm.tick(1/60)")
            threw = None
        except PlaywrightError as e:
            threw = str(e)
        b.close()
    assert errors == [], errors
    assert loaded == {"ok": True}, loaded
    assert on == {"stepped": True}, on
    assert abs(t30 - 0.5) < 1e-6, t30        # 30 exact 1/60 s steps, no clamp
    assert abs(t60 - 1.0) < 1e-6, t60
    assert grab30.startswith("data:image/png;base64,"), grab30[:40]
    assert grab60.startswith("data:image/png;base64,"), grab60[:40]
    assert grab30 != grab60                  # the camera flew on between the two grabs
    assert t_waited == t60, (t60, t_waited)  # frozen without ticks, to the bit
    assert off == {"stepped": False}, off
    assert threw and "tick needs stepped mode" in threw, threw
