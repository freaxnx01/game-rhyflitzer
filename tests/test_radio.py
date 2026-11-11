"""#735: the car radio and the menu music in a real browser. Hand layout (terrain and world blocked), autoplay allowed.
The SRF 3 stream is never reached: hermetic_api aborts *.srg-ssr.ch, and the stub tests answer it with a local mp3.
#841: the menu-music tests also run one load without the autoplay flag (blocked: silent until the first key).
#856: over CDP (PW_CDP_ENDPOINT) the launch flag does not apply: open_game presses Shift once, the load-start test is skipped.
Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from conftest import GPU
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
SRF = "https://stream.srg-ssr.ch/srgssr/srf3/mp3/128"
STUB_MP3 = (ROOT / "assets/music/california-snares-and-synths.mp3").read_bytes()
T = 120000


def over_cdp():
    """#856: with PW_CDP_ENDPOINT the browser is connected over CDP, so the launch flags in ARGS (autoplay policy) never apply."""
    return GPU["endpoint"] is not None


def stub_srf(page, hits):
    def answer(route):
        hits.append(route.request.url)
        route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Content-Type": "audio/mpeg"}, body=STUB_MP3)
    page.route(SRF, answer)


def open_game(p, server, srf_hits=None, touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 390, "height": 844} if touch else {"width": 1280, "height": 720}, has_touch=touch)
    page = ctx.new_page()
    errors, music = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda r: music.append(r.url) if "/assets/music/" in r.url else None)
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    if srf_hits is not None:
        stub_srf(page, srf_hits)
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.radio && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    if over_cdp():
        page.keyboard.press("Shift")   # #856: no autoplay flag over CDP; one user activation lets the radio play
    return b, page, errors, music


def radio(page):
    return page.evaluate("() => window.__mm.radio()")


def start_run(page):
    page.click("#startbtn", timeout=180000)
    page.wait_for_function("() => window.__mm.radio().inRun", timeout=T)


def test_over_cdp_reflects_the_gpu_endpoint(monkeypatch):
    import conftest
    monkeypatch.setitem(conftest.GPU, "endpoint", "http://192.168.1.120:9223")
    assert over_cdp()
    monkeypatch.setitem(conftest.GPU, "endpoint", None)
    assert not over_cdp()


def test_menu_music_starts_during_loading(server):
    if over_cdp():
        pytest.skip("#856: asserts the menu track is fetched at load start, before any gesture; needs the autoplay launch flag, which a CDP-connected browser ignores")
    with sync_playwright() as p:
        b, page, errors, music = open_game(p, server)
        assert any("menu-running-title.mp3" in u for u in music), music     # fetched at load start, autoplay allowed
        page.keyboard.press("Shift")
        page.wait_for_function("() => window.__mm.radio().playing.menu", timeout=T)
        page.click("#musicbtn")
        page.wait_for_function("() => !window.__mm.radio().menuOn", timeout=T)
        assert page.evaluate("() => localStorage.getItem('mm.menuMusic')") == "0"
        assert "Music: off" in page.inner_text("#musicbtn") or "Musik: aus" in page.inner_text("#musicbtn")
        assert errors == [], errors
        b.close()


def test_menu_music_off_fetches_nothing_while_loading(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script("localStorage.setItem('mm.menuMusic', '0')")
        page, music = ctx.new_page(), []
        page.on("request", lambda r: music.append(r.url) if "/assets/music/" in r.url else None)
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.radio && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.wait_for_timeout(1500)
        assert music == [], music
        b.close()


def test_menu_music_blocked_autoplay_waits_for_the_first_key(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=[a for a in ARGS if "autoplay" not in a])
        ctx = b.new_context(viewport={"width": 1280, "height": 720})
        page, errors = ctx.new_page(), []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.radio && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.wait_for_timeout(500)
        assert not page.evaluate("() => window.__mm.radio().playing.menu")   # the refusal stays silent
        page.keyboard.press("Shift")
        page.wait_for_function("() => window.__mm.radio().playing.menu", timeout=T)
        assert errors == [], errors
        b.close()


def test_keys_drive_the_radio_and_show_the_display(server):
    with sync_playwright() as p:
        b, page, errors, music = open_game(p, server)
        start_run(page)
        page.wait_for_function("() => window.__mm.radio().playing.fm && !window.__mm.radio().playing.menu", timeout=T)
        t = page.evaluate("() => window.__mm.toast()")
        assert "Cool Rider" in t["text"] and t["shown"], t
        assert page.evaluate("() => document.getElementById('toast').classList.contains('radio')")
        page.keyboard.press("8")
        assert radio(page)["track"] == 1 and "Neon Afterglow" in page.evaluate("() => window.__mm.toast().text")
        page.keyboard.press("7")
        assert radio(page)["track"] == 0
        for _ in range(5):                              # Review Focus 1: rapid skips while loading never throw
            page.keyboard.press("8")
        assert radio(page)["track"] == 1
        vol = radio(page)["vol"]
        page.keyboard.press("0")
        assert radio(page)["vol"] == vol + 1
        page.keyboard.press("Shift+0")                  # Review Focus 2: Shift+0 is not the radio
        assert radio(page)["vol"] == vol + 1
        page.keyboard.press("5")
        page.wait_for_function("() => !window.__mm.radio().on && !window.__mm.radio().playing.fm", timeout=T)
        assert page.evaluate("() => localStorage.getItem('mm.radio')") == "0"
        shown = page.evaluate("() => window.__mm.toast()")   # the fade runs on game time (dt clamped, under 1 fps headless): assert the 3 s budget, not the wall clock
        assert "Radio off" in shown["text"] and 0 < shown["left"] <= 3, shown
        assert errors == [], errors
        b.close()


def test_srf3_plays_the_stubbed_stream(server):
    with sync_playwright() as p:
        hits = []
        b, page, errors, music = open_game(p, server, srf_hits=hits)
        start_run(page)
        page.keyboard.press("6")
        page.wait_for_function("() => window.__mm.radio().playing.srf && !window.__mm.radio().playing.fm", timeout=T)
        r = radio(page)
        assert r["station"] == "srf3" and r["src"]["srf"] == "https://stream.srg-ssr.ch/srgssr/srf3/mp3/128", r
        assert hits and all(u.startswith("https://stream.srg-ssr.ch/") for u in hits), hits
        assert "SRF 3 live" in page.evaluate("() => window.__mm.toast().text")
        page.keyboard.press("8")                        # no tracks on a live station: the display only
        assert radio(page)["track"] == 0
        assert errors == [], errors
        b.close()


def test_srf3_failure_falls_back_to_rhyflitzer_fm(server):
    with sync_playwright() as p:
        b, page, errors, music = open_game(p, server)   # no stub: hermetic_api aborts the stream
        start_run(page)
        page.keyboard.press("6")
        page.wait_for_function("() => window.__mm.radio().failed === 1 && window.__mm.radio().station === 'fm'", timeout=T)
        page.wait_for_function("() => window.__mm.radio().playing.fm", timeout=T)
        assert "SRF 3" in page.evaluate("() => window.__mm.toast().text")
        assert page.evaluate("() => localStorage.getItem('mm.radioStation')") == "fm"
        assert errors == [], errors
        b.close()


def test_pause_pauses_and_resumes_the_radio(server):
    with sync_playwright() as p:
        hits = []
        b, page, errors, music = open_game(p, server, srf_hits=hits)
        start_run(page)
        page.keyboard.press("6")
        page.wait_for_function("() => window.__mm.radio().playing.srf", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.radio().held && !window.__mm.radio().playing.srf", timeout=T)
        page.keyboard.press("Escape")
        page.wait_for_function("() => !window.__mm.radio().held && window.__mm.radio().playing.srf", timeout=T)   # Review Focus 4: live again
        assert len(hits) >= 2, hits                     # the stream was reloaded on resume
        assert errors == [], errors
        b.close()


def test_touch_radio_panel(server):
    with sync_playwright() as p:
        b, page, errors, music = open_game(p, server, touch=True)
        start_run(page)
        boxes = page.evaluate("""() => { const r = (s) => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null;
            const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
            return { radio: r('#radiobtn'), pause: r('#pausebtn'), tr: r('#tr'), br: r('#br'), menu: r('#tMenu') }; }""")
        assert boxes["radio"], boxes
        ov = lambda a, c: c and not (a[2] <= c[0] or c[2] <= a[0] or a[3] <= c[1] or c[3] <= a[1])
        for k in ("pause", "tr", "br", "menu"):
            assert not ov(boxes["radio"], boxes[k]), (k, boxes)
        page.tap("#radiobtn")
        assert page.is_visible("#radiopanel")
        page.tap("#radiopanel [data-radio=next]")
        assert radio(page)["track"] == 1
        page.tap("#radiopanel [data-radio=up]")
        assert radio(page)["vol"] == 7
        page.tap("#radiobtn")
        assert not page.is_visible("#radiopanel")
        assert errors == [], errors
        b.close()


def test_desktop_has_no_radio_widget(server):
    with sync_playwright() as p:
        b, page, errors, music = open_game(p, server)
        start_run(page)
        assert not page.is_visible("#radiobtn") and not page.is_visible("#radiopanel")
        b.close()
