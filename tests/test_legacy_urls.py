"""#577: old /prototype/ links keep reaching the game, through prototype/index.html and, for deeper paths, 404.html.
The landing pages are stubbed, so the game itself never loads. Slow (Playwright): run in the foreground."""
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).parents[1]
STUB = "<!doctype html><title>landed</title>"


def open_page(p, server):
    b = p.chromium.launch()
    page = b.new_page()
    # the redirect targets: answered with a stub so only the address is checked, not the game behind it
    page.route(lambda url: url.startswith(server) and urlsplit(url).path in ("/", "/deep/page.html"),
               lambda r: r.fulfill(status=200, content_type="text/html", body=STUB))
    return b, page


def test_prototype_link_forwards_to_the_root_with_query_and_hash(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.goto(f"{server}/prototype/?region=ehrendingen&vehicle=bus#x")
        page.wait_for_function("() => document.title === 'landed'", timeout=30000)
        assert page.url == f"{server}/?region=ehrendingen&vehicle=bus#x"
        b.close()


def test_a_deeper_prototype_link_forwards_through_the_404_page(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        # GitHub Pages answers a missing path with 404.html; the local server has no such fallback, so the route plays it
        not_found = (ROOT_DIR / "404.html").read_text(encoding="utf-8")
        page.route(f"{server}/prototype/deep/page.html*",
                   lambda r: r.fulfill(status=404, content_type="text/html", body=not_found))
        # a fulfilled page counts as public address space, so Chrome blocks its module from the LAN test server (private
        # network access); serving the module through the route too keeps both in one space, as on the live HTTPS site
        page.route(f"{server}/legacy.js", lambda r: r.fulfill(status=200, content_type="text/javascript",
                                                              body=(ROOT_DIR / "legacy.js").read_text(encoding="utf-8")))
        page.goto(f"{server}/prototype/deep/page.html?world=0123456789ab#y")
        page.wait_for_function("() => document.title === 'landed'", timeout=30000)
        assert page.url == f"{server}/deep/page.html?world=0123456789ab#y"
        b.close()


def test_the_404_page_without_an_old_link_offers_the_game(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        not_found = (ROOT_DIR / "404.html").read_text(encoding="utf-8")
        page.route(f"{server}/missing.html", lambda r: r.fulfill(status=404, content_type="text/html", body=not_found))
        page.goto(f"{server}/missing.html")
        page.wait_for_timeout(500)
        assert urlsplit(page.url).path == "/missing.html"
        assert page.get_attribute("a", "href") == "/"
        b.close()
