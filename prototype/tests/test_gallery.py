"""#170: the Worlds row on the start screen against a stubbed /api/gallery. Slow (Playwright): run in the foreground."""
import json
import re

import pytest
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 240000
ID1, ID2 = "0123456789ab", "ba9876543210"
CORS = {"Access-Control-Allow-Origin": "*"}
TWO = [{"id": ID1, "title": "Rheinfelden", "description": "Old town and the Rhine"}, {"id": ID2, "title": "Lägern", "description": "Ridge road"}]


def boot(p, server, host, status, body):
    """The start screen with /api/gallery answered by (status, body); returns once the page has settled on the answer."""
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 480, "height": 270})
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/api/gallery", lambda r: r.fulfill(status=status, headers=CORS, content_type="application/json", body=body))
    page.goto(f"{server}/prototype/index.html?worldhost={host}")
    page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=T)
    page.wait_for_function("() => Array.isArray(window.__mm.gallery)", timeout=T)
    return b, page


def open_worlds(page):
    """#346: the Worlds row moved into the Worlds dialog behind the start screen's World button."""
    page.click("#worldbtn")
    page.wait_for_function("() => !document.querySelector('#worlds').hidden", timeout=T)


def test_gallery_row_lists_worlds_and_opens_one(server, world_host):
    url, _ = world_host
    with sync_playwright() as p:
        b, page = boot(p, server, url, 200, json.dumps(TWO))
        open_worlds(page)
        assert page.is_visible("#worldsrow") and page.evaluate("() => window.__mm.gallery") == [ID1, ID2]
        assert page.evaluate("() => [...document.querySelectorAll('#worldsbtns button')].map(b => b.textContent)") == ["Rheinfelden", "Lägern"]
        assert page.evaluate("() => document.querySelector('#worldslabel').textContent") == "Worlds"
        page.hover("#worldsbtns button >> nth=0")
        assert page.text_content("#worldsdesc") == "Old town and the Rhine"
        page.route(re.compile(rf".*/prototype/index\.html\?.*world={ID1}"), lambda r: r.fulfill(status=200, content_type="text/html", body="<title>stub</title>"))
        page.click("#worldsbtns button >> nth=0")                  # #346: selecting is free, only DRIVE HERE reloads
        page.click("#drivebtn", no_wait_after=True)
        page.wait_for_url(re.compile(rf"[?&]world={ID1}"), wait_until="commit", timeout=T)
        b.close()


def test_gallery_text_is_text(server, world_host):
    url, _ = world_host
    title, desc = "<img src=x onerror=window.__pwn=1>", "<script>window.__pwn=1</script>"
    with sync_playwright() as p:
        b, page = boot(p, server, url, 200, json.dumps([{"id": ID1, "title": title, "description": desc}]))
        open_worlds(page)
        assert page.text_content("#worldsbtns button") == title
        page.hover("#worldsbtns button")
        assert page.text_content("#worldsdesc") == desc
        assert page.evaluate("() => window.__pwn") is None and page.locator("#worldsbtns img").count() == 0
        b.close()


@pytest.mark.parametrize("status, body", [(200, "[]"), (500, "{}"), (200, "not json"), (200, '{"a": 1}')])
def test_empty_or_broken_gallery_changes_nothing(server, world_host, status, body):
    url, _ = world_host
    with sync_playwright() as p:
        b, page = boot(p, server, url, status, body)
        assert page.is_visible("#startbtn")
        open_worlds(page)
        assert page.evaluate("() => window.__mm.gallery") == [] and page.locator("#worldsbtns button").count() == 0
        assert page.is_visible("#buildworld")   # the way to the editor stays, even without a gallery
        assert page.is_visible("#worldsempty")  # #346: and says so
        assert page.get_attribute("#region-hochrhein", "aria-pressed") == "true"
        b.close()


def test_worlds_row_ends_with_the_editor_link(server, world_host):
    url, _ = world_host
    with sync_playwright() as p:
        b, page = boot(p, server, url, 200, json.dumps(TWO))
        open_worlds(page)
        last = page.evaluate("() => { const r = document.querySelector('#worldsrow'); return [...r.querySelectorAll('button, a')].map(e => e.id || e.textContent).at(-1); }")
        assert last == "buildworld"
        assert page.get_attribute("#buildworld", "href") == "../editor.html"
        assert page.text_content("#buildworld") == "+ Build your own world…"
        page.evaluate("() => window.ggSetLang('de')")
        assert page.text_content("#buildworld") == "+ Eigene Welt bauen…"
        b.close()
