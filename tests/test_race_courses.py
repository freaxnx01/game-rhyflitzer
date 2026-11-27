"""#1117: a new race takes the next course, Restart keeps it, best times are per course, the settings switch draws
a random course, and both multiplayer devices race the host's course. Real OSM world (the extra courses exist
only there). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from conftest import start_ready
from test_multiplayer_cruise import pair_world_fixture, ready_both  # noqa: F401  (fixture)
from test_multiplayer_lobby import connect

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
T = 120000


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}, locale="de-CH").new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(start_ready(), timeout=600000)
    return b, page, errors


def course(page):
    return page.evaluate("() => window.__mm.course()")


def race_again(page):
    page.evaluate("() => window.__mm.finishNow()")
    page.wait_for_selector("#overlay:not([hidden])", timeout=T)
    page.click("#startbtn")
    page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)


def test_rotation_restart_and_best_per_course(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        assert course(page)["ids"] == ["classic", "eiken", "twoBridges", "mumpf", "bergsee"]
        page.hover("#startbtn")                                             # the slot shows the hovered mode's text
        assert page.text_content("#ovtext").startswith("Sisseln")           # course 1 keeps the region intro
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        first = course(page)
        assert first["id"] == "classic"
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_selector("#overlay:not([hidden])", timeout=T)
        page.hover("#startbtn")
        assert page.text_content("#ovtext").startswith("Münsterplatz erreicht")   # course 1's own finished text
        assert "Strecke «Eiken»" in page.text_content("#ovtext")             # the next course's name before the start
        page.click("#startbtn")
        page.wait_for_function("() => window.__mm.course().id === 'eiken'", timeout=T)
        second = course(page)
        assert second["cps"] != first["cps"] and second["finish"] != first["finish"]
        assert "Eiken" in page.inner_html("#toast")
        page.click("#pausebtn")
        page.click("#pauserestart")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        assert course(page)["id"] == "eiken"                                # Restart keeps the course
        for want in ["twoBridges", "mumpf", "bergsee", "classic"]:
            race_again(page)
            assert course(page)["id"] == want
        stored = page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('mm.best2'))")
        assert "mm.best2" in stored and "mm.best2.eiken" in stored         # best times per course, course 1 under today's key
        page.reload()
        page.wait_for_function(start_ready(), timeout=600000)
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        assert course(page)["id"] == "eiken"                                # the rotation survives a reload
        b.close()
    assert errors == []


def test_random_switch_draws_a_seeded_course_without_best(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        page.click("#settingsbtn")
        page.select_option("#setcourse", "random")
        page.click("#settingsback")
        page.click("#startbtn")
        page.wait_for_function("() => document.getElementById('overlay').hidden", timeout=T)
        c = course(page)
        assert c["id"] == "random" and isinstance(c["seed"], int) and len(c["cps"]) == 5
        page.evaluate("() => window.__mm.finishNow()")
        page.wait_for_selector("#overlay:not([hidden])", timeout=T)
        assert "keine Bestzeit" in page.text_content("#result")
        b.close()
    assert errors == []


def test_multiplayer_guest_races_the_host_course(pair_world):
    host, guest, errors = pair_world
    host.evaluate("() => localStorage.setItem('mm.courseIdx.hochrhein', '0')")   # the host's next course is Eiken
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race", timeout=T)
    h, g = course(host), course(guest)
    assert h["id"] == g["id"] == "eiken"
    assert h["cps"] == g["cps"] and h["finish"] == g["finish"]
    assert errors == []
