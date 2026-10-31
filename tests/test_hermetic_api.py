"""#348: the gallery route every browser test gets (hermetic_api.py). The pure tests use fakes; the last one opens the game."""
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

import hermetic_api

ROOT = Path(__file__).parents[1]
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ROUTED = [(hermetic_api.GALLERY, hermetic_api.answer_empty_gallery)]


class FakeContext:
    def __init__(self):
        self.routes = []

    def route(self, url, handler):
        self.routes.append((url, handler))


class FakePage:
    def __init__(self):
        self.context = FakeContext()


class FakeRoute:
    def __init__(self):
        self.fulfilled = None

    def fulfill(self, **kwargs):
        self.fulfilled = kwargs


def test_new_context_routes_the_gallery_on_the_context_it_returns():
    made = FakeContext()
    new_context = hermetic_api.hermetic_new_context(lambda self, *args, **kwargs: made)
    assert new_context(object(), viewport={"width": 1, "height": 1}) is made
    assert made.routes == ROUTED


def test_new_page_routes_the_gallery_on_the_page_context():
    made = FakePage()
    new_page = hermetic_api.hermetic_new_page(lambda self, *args, **kwargs: made)
    assert new_page(object()) is made
    assert made.context.routes == ROUTED


def test_the_wrappers_pass_their_arguments_through():
    seen, browser = [], object()

    def original(self, *args, **kwargs):
        seen.append((self, args, kwargs))
        return FakePage()

    hermetic_api.hermetic_new_page(original)(browser, 1, locale="de-CH")
    assert seen == [(browser, (1,), {"locale": "de-CH"})]


def test_the_gallery_is_an_empty_list_a_cross_origin_page_may_read():
    route = FakeRoute()
    hermetic_api.answer_empty_gallery(route)
    assert route.fulfilled == {"status": 200, "headers": {"Access-Control-Allow-Origin": "*"},
                               "content_type": "application/json", "body": "[]"}


def test_the_routed_url_is_the_game_s_gallery_url():
    worlds_js = (ROOT / "worlds.js").read_text(encoding="utf-8")
    host = re.search(r"export const WORLD_HOST = '([^']+)'", worlds_js).group(1)
    assert hermetic_api.GALLERY == f"{host}/api/gallery"   # galleryUrl() in gallery.js


def test_a_page_without_its_own_gallery_route_boots_without_console_errors(server):
    """The test_holzbruecke.py view (#353): no gallery stub of its own, and the own-page console messages stay empty."""
    msgs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.on("pageerror", lambda e: msgs.append((str(e), "")))
        page.on("console", lambda m: msgs.append((m.text, m.location.get("url", ""))) if m.type in ("error", "warning") else None)
        page.goto(f"{server}/index.html")
        page.wait_for_function("() => Array.isArray(window.__mm && window.__mm.gallery)", timeout=180000)
        gallery = page.evaluate("() => window.__mm.gallery")
        b.close()
    # the same own-page filter as test_holzbruecke.py: the terrain 404 is on purpose, third-party resources are not under test
    own = [t for t, u in msgs if "terrain_hochrhein.mmh" not in u and (not u or u.startswith(server))]
    assert gallery == []
    assert own == []