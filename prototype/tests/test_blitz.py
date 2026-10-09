"""#128: Blitz mode — the clock counts down from 90 s, each checkpoint adds 60 s, a rank letter at the finish,
"Time's up" when the clock runs out. Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
READY = "() => window.__mm && window.__mm.blitz && document.querySelector('#worldstatus')?.textContent"
T = 120000


def open_page(p, server, locale="en-US"):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale=locale).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def blitz(page):
    return page.evaluate("() => window.__mm.blitz()")


def text(page, sel):
    return page.text_content(sel).strip()


def test_blitz_button_starts_a_countdown_that_checkpoints_top_up(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        assert text(page, "#blitzbtn") == "Blitz"
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        s = blitz(page)
        assert s["mode"] == "blitz" and s["left"] == 90 and s["timeUp"] is False
        assert text(page, "#tl .mode") == "Blitz · Hochrhein" and text(page, "#tr .lbl") == "Time left"
        assert text(page, "#time").startswith("01:30")                      # armed: the clock has not moved
        x, z = s["cps"][0]
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [x, z])         # within 7 m of checkpoint 1
        page.wait_for_function("() => window.__mm.blitz().done === 1", timeout=T)
        s = blitz(page)
        assert 149.5 <= s["left"] <= 150                                     # +60 s, still armed so no countdown
        assert "+60 s" in page.evaluate("() => window.__mm.toast().text")    # #toast is CSS-uppercased; textContent keeps the real case
        assert text(page, "#cpn") == "1"
        assert errors == []
        b.close()


def test_the_clock_counts_down_only_while_racing_and_ends_the_run_at_zero(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.evaluate("() => window.__mm.blitzSetLeft(3)")
        page.keyboard.down("KeyW")                                           # the car moves: armed → racing
        page.wait_for_function("() => window.__mm.blitz().left < 3", timeout=T)
        page.wait_for_function("() => document.querySelector('#time').classList.contains('low')", timeout=T)
        page.wait_for_function("() => window.__mm.blitz().timeUp", timeout=T)
        page.keyboard.up("KeyW")
        s = blitz(page)
        assert s["left"] == 0 and s["rank"] is None
        assert not page.evaluate("() => document.getElementById('overlay').hidden")
        r = text(page, "#result")
        assert "Time's up" in r and "0 / 5 checkpoints" in r
        assert page.evaluate("() => localStorage.getItem('mm.blitzBest')") is None
        assert text(page, "#blitzbtn") == "Retry" and text(page, "#startbtn") == "Start"
        assert errors == []
        b.close()


def test_finishing_gives_a_rank_and_saves_the_best_time_left(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.evaluate("() => window.__mm.blitzSetLeft(75)")
        page.evaluate("() => window.__mm.finishNow()")
        s = blitz(page)
        assert s["rank"] == "A" and s["timeUp"] is False
        r = text(page, "#result")
        assert "Rank" in r and "01:15" in r
        assert page.evaluate("() => +localStorage.getItem('mm.blitzBest')") == 75
        assert "Best left 01:15" in text(page, "#best")
        page.click("#blitzbtn")                                              # Retry restarts Blitz
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        s = blitz(page)
        assert s["mode"] == "blitz" and s["left"] == 90 and s["done"] == 0
        assert errors == []
        b.close()


def test_a_cheated_finish_shows_the_rank_but_keeps_no_best(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.keyboard.press("KeyJ"); page.keyboard.press("Enter")   # a jump to the first row sets R.jumped and closes the dialog
        page.wait_for_function("() => window.__mm.raceFlags().jumped", timeout=T)
        page.evaluate("() => window.__mm.finishNow()")
        assert blitz(page)["rank"] in ("S", "A", "B", "C")
        assert "not counted" in text(page, "#result")
        assert page.evaluate("() => localStorage.getItem('mm.blitzBest')") is None
        assert errors == []
        b.close()


def test_abandoning_a_blitz_run_returns_the_start_screen_to_the_time_trial(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.keyboard.down("KeyW")                                           # racing, so the abandon dialog appears
        page.wait_for_function("() => window.__mm.blitz().left < 90", timeout=T)
        page.keyboard.up("KeyW")
        page.keyboard.press("Escape"); page.click("#pausemenu")
        if page.is_visible("#abandonok"): page.click("#abandonok")
        page.wait_for_function("() => !document.getElementById('overlay').hidden", timeout=T)
        s = blitz(page)
        assert s["mode"] == "trial" and s["left"] == 0 and s["timeUp"] is False
        assert text(page, "#tl .mode") == "Time trial · Hochrhein" and text(page, "#tr .lbl") == "Time"
        page.wait_for_function("() => document.querySelector('#time').textContent.startsWith('00:00')", timeout=T)   # hud() redraws behind the overlay
        assert text(page, "#tr .lbl") == "Time" and text(page, "#best").startswith("Best ") and not text(page, "#best").startswith("Best left")
        assert errors == []
        b.close()


def test_the_time_trial_is_untouched_and_german_labels_switch_mid_run(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        s = blitz(page)
        assert s["mode"] == "trial" and text(page, "#tl .mode") == "Time trial · Hochrhein" and text(page, "#tr .lbl") == "Time"
        page.keyboard.press("Escape"); page.click("#pausemenu")                # back to the start screen
        if page.is_visible("#abandonok"): page.click("#abandonok")             # only asked while 'racing'; 'armed' goes straight back
        page.wait_for_function("() => !document.getElementById('overlay').hidden", timeout=T)
        page.click("#blitzbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        page.evaluate("() => window.ggSetLang('de')")
        assert text(page, "#tl .mode") == "Blitz · Hochrhein" and text(page, "#tr .lbl") == "Restzeit"
        assert errors == []
        b.close()
