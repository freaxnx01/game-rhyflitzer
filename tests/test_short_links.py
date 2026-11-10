"""The /nfz/ short link (NFZ article) forwards to the game with the UTM tags Umami counts as the source.
The landing page is stubbed, so the game itself never loads. Slow (Playwright): run in the foreground."""
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

STUB = "<!doctype html><title>landed</title>"


def test_nfz_short_link_forwards_to_the_game_with_utm_tags(server):
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        page.route(lambda url: url.startswith(server) and urlsplit(url).path == "/",
                   lambda r: r.fulfill(status=200, content_type="text/html", body=STUB))
        page.goto(f"{server}/nfz/")
        page.wait_for_function("() => document.title === 'landed'", timeout=30000)
        assert page.url == f"{server}/?utm_source=nfz&utm_medium=artikel"
        b.close()
