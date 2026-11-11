"""#538: what the game tells Umami. window.umami is stubbed by an init script, the real g.js is fulfilled empty, so the
tests never reach the real Umami. Hand-traced layout (world and terrain blocked): fast and deterministic."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"
STUB = ("window.__umami = []; window.umami = { track: (a, b) => { window.__umami.push(typeof a === 'function' "
        "? { pageview: a({ website: 'w', url: location.pathname + location.search, title: 'T' }) } : { name: a, data: b }); } };")


def boot(p, server, query=""):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US")
    ctx.add_init_script(STUB)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/stats.freaxnx01.ch/**", lambda r: r.fulfill(status=200, content_type="text/javascript", body=""))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html{query}")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def calls(page):
    return page.evaluate("() => window.__umami")


def named(page, name):
    return [c["data"] for c in calls(page) if c.get("name") == name]


def test_pageview_keeps_only_the_path_and_campaign_tags_and_game_ready_names_the_query_vehicle(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?vehicle=delorean&world=secret123&utm_source=nfz")
        pv = [c["pageview"] for c in calls(page) if "pageview" in c]
        ready = named(page, "game-ready")
        everything = str(calls(page)); b.close()
    assert not errors
    assert len(pv) == 1 and pv[0]["url"] == "/index.html?utm_source=nfz"
    assert len(ready) == 1 and ready[0]["vehicle"] == "delorean" and ready[0]["vehicle_source"] == "query"
    assert ready[0]["region"] in ("hochrhein", "ehrendingen", "world")
    assert "secret123" not in everything


def test_start_sends_mode_start_and_a_garage_swap_sends_vehicle(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, "?vehicle=delorean")
        page.click("#carbtn"); page.click("#csnext")
        page.wait_for_function("() => window.__umami.some((c) => c.name === 'vehicle')", timeout=10000)
        vehicle = named(page, "vehicle")
        page.click("#csback"); page.click("#startbtn")
        page.wait_for_function("() => window.__umami.some((c) => c.name === 'mode-start')", timeout=10000)
        start = named(page, "mode-start"); b.close()
    assert not errors
    assert len(vehicle) == 1 and vehicle[0]["previous"] == "delorean" and vehicle[0]["vehicle"] != "delorean"
    assert len(start) == 1 and start[0]["previous"] == "none" and start[0]["mode"] != "unknown"
    assert start[0]["vehicle"] == vehicle[0]["vehicle"]


def test_a_blocked_umami_never_breaks_the_game(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/stats.freaxnx01.ch/**", lambda r: r.abort())
        page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/index.html")
        page.wait_for_function(READY, timeout=240000)
        page.click("#startbtn"); page.wait_for_timeout(500); b.close()
    assert not errors
