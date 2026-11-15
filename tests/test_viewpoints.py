"""#508: the viewpoint hunt. The OSM world loads (the viewpoints stand on its landmarks); terrain blocked.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from conftest import start_ready

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = start_ready("views")
T = 240000
AIMED = """(id) => { const v = window.__mm.views(), s = v.spots.find(q => q.id === id), p = v.pose;
  const want = Math.atan2(s.sz - p.z, s.sx - p.x), have = Math.atan2(p.dz, p.dx);
  let d = Math.abs(want - have) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d < 0.3; }"""


def boot(p, server, query="", init=None):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US", accept_downloads=True).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    if init:
        page.add_init_script(init)
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def start_view(page):
    page.click("#viewbtn")
    page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)


def test_query_preselects_the_viewpoint_hunt_and_the_hud_leads_to_a_viewpoint(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?mode=view")
        before = page.evaluate("() => ({ focus: document.activeElement.id, shown: !document.querySelector('#viewbtn').hidden, label: document.querySelector('#viewbtn').textContent })")
        page.keyboard.press("Enter")
        page.wait_for_function("() => document.querySelector('#overlay').hidden", timeout=T)
        page.wait_for_function("() => window.__mm.views().target", timeout=T)
        v = page.evaluate("() => window.__mm.views()")
        hud = page.evaluate("() => ({ line: document.querySelector('#tl .mode').textContent, total: document.querySelector('#cpt').textContent, pips: document.querySelector('#pips').children.length, name: document.querySelector('#cpname').textContent })")
        b.close()
    assert before == {"focus": "viewbtn", "shown": True, "label": "Viewpoints"}, before
    assert v["mode"] == "view" and v["total"] == 4 and v["shot"] == 0, v
    assert [s["id"] for s in v["spots"]] == ["rheinblick", "plattform", "fridolinsbruecke", "muensterplatz"]
    assert v["target"]["view"] == "go", v
    assert hud["line"] == "Viewpoints · Hochrhein" and hud["total"] == "4" and hud["pips"] == 4, hud
    assert hud["name"].startswith("Viewpoint: "), hud
    assert errors == []


def test_a_photo_at_rheinblick_aimed_at_the_bridge_scores_once(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_view(page)
        page.evaluate("""() => { const s = window.__mm.views().spots.find(q => q.id === 'rheinblick');
            window.__mm.place(s.x, s.z, Math.atan2(s.sz - s.z, s.sx - s.x)); }""")
        page.wait_for_function("() => window.__mm.views().target && window.__mm.views().target.view === 'aim'", timeout=T)
        page.wait_for_function(AIMED, arg="rheinblick", timeout=T)   # the chase camera swings in behind the car
        with page.expect_download(timeout=120000):
            page.keyboard.press("KeyX")
        page.wait_for_function("() => window.__mm.toast().text.includes('Rheinblick Stein: +')", timeout=T)
        first = page.evaluate("() => window.__mm.views()")
        with page.expect_download(timeout=120000):
            page.keyboard.press("KeyX")
        page.wait_for_function("() => window.__mm.toast().text.includes('no viewpoint here')", timeout=T)
        second = page.evaluate("() => window.__mm.views()")
        album = page.evaluate("() => JSON.parse(localStorage.getItem('mm.viewAlbum') || '{}')")
        b.close()
    assert first["shot"] == 1 and 100 <= first["pts"][0] <= 150, first
    assert second["shot"] == 1 and second["pts"] == first["pts"], second
    assert album["rheinblick"]["img"].startswith("data:image/jpeg;base64,") and album["rheinblick"]["pts"] == first["pts"][0], album.keys()
    assert errors == []


def test_far_from_any_viewpoint_x_only_takes_the_photo(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_view(page)
        with page.expect_download(timeout=120000):
            page.keyboard.press("KeyX")
        page.wait_for_function("() => window.__mm.toast().text.includes('no viewpoint here')", timeout=T)
        v = page.evaluate("() => window.__mm.views()")
        b.close()
    assert v["shot"] == 0 and v["state"] in ("armed", "racing"), v
    assert errors == []


def test_all_viewpoints_end_the_run_with_points_and_time(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_view(page)
        page.evaluate("() => { for (let i = 0; i < 4; i++) window.__mm.viewScore(i, 120); }")
        assert page.evaluate("() => window.__mm.views().state") == "finished"
        page.evaluate("() => window.__mm.viewSetEndIn(0.01)")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        got = page.evaluate("() => ({ result: document.querySelector('#result').textContent, again: document.querySelector('#viewbtn').textContent, last: window.__mm.views().last })")
        b.close()
    assert "All viewpoints photographed!" in got["result"] and "480 / 600 points" in got["result"], got
    assert got["again"] == "Again" and got["last"]["mode"] == "view" and got["last"]["pts"] == 480, got
    assert errors == []


def test_ehrendingen_has_no_viewpoints_and_falls_back_to_cruise(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?region=ehrendingen&mode=view")
        got = page.evaluate("() => ({ hidden: document.querySelector('#viewbtn').hidden, focus: document.activeElement.id, total: window.__mm.views().total })")
        b.close()
    assert got == {"hidden": True, "focus": "cruisebtn", "total": 0}, got
    assert errors == []


SEED = """localStorage.setItem('mm.viewAlbum', JSON.stringify({
  rheinblick: { img: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', pts: 140, at: 1 },
  plattform: { img: 'javascript:alert(1)', pts: 150, at: 2 } }));"""


def test_the_result_screen_shows_the_album_with_empty_frames(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, init=SEED)
        start_view(page)
        page.evaluate("() => { for (let i = 0; i < 4; i++) window.__mm.viewScore(i, 120); window.__mm.viewSetEndIn(0.01); }")
        page.wait_for_function("() => !document.querySelector('#overlay').hidden", timeout=T)
        got = page.evaluate("""() => [...document.querySelectorAll('#album figure')].map(f => ({
            img: !!f.querySelector('img'), empty: f.classList.contains('empty'), cap: f.querySelector('figcaption').textContent }))""")
        b.close()
    assert len(got) == 4, got
    assert got[0] == {"img": True, "empty": False, "cap": "Rheinblick Stein · 140 points"}, got
    assert got[1] == {"img": False, "empty": True, "cap": "Plattform Sisslerfeld · not yet"}, got   # the script URL was dropped
    assert errors == []
