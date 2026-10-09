"""#113: X saves the current 3D view as a PNG download.
Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
import re
import struct

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

NAME_RE = re.compile(r"^rhyflitzer-\d{8}-\d{6}\.png$")


def start_hand(p, server, query="", **ctx):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(**({"viewport": {"width": 480, "height": 270}, "accept_downloads": True} | ctx)).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def png_size(data):
    """width, height from the IHDR chunk -- no image library needed."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", data[:8]
    assert data[12:16] == b"IHDR", data[12:16]
    return struct.unpack(">II", data[16:24])


def read_download(download):
    with open(download.path(), "rb") as f:
        return f.read()


def test_pressing_x_downloads_one_png_of_the_rendered_scene(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        canvas = page.evaluate("() => { const c = document.getElementById('gl'); return [c.width, c.height]; }")
        extra = []
        page.on("download", lambda d: extra.append(d))
        with page.expect_download(timeout=120000) as info:
            page.keyboard.press("KeyX")
        download = info.value
        data = read_download(download)
        toast = page.evaluate("() => window.__mm.toast()")
        page.wait_for_timeout(1500)                                     # one press stays one photo
        downloads = len(extra)
        b.close()
    assert NAME_RE.match(download.suggested_filename), download.suggested_filename
    assert png_size(data) == tuple(canvas), (png_size(data), canvas)
    assert len(data) > 5000, len(data)                                  # a blank frame compresses to ~1 kB
    assert toast["shown"] and toast["text"] == "Photo saved", toast
    assert downloads == 1, downloads


SPY = """() => {
  window.__dl = { anchorInDocument: null, revokedAtClick: null, revoked: 0 };
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (u) => { window.__dl.revoked++; return revoke(u); };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) {
      window.__dl.anchorInDocument = this.isConnected;
      const r = click.call(this);
      window.__dl.revokedRightAfterClick = window.__dl.revoked;
      return r;
    }
    return click.call(this);
  };
}"""


def test_download_anchor_is_in_the_document_and_the_url_outlives_the_click(server):
    """Firefox/WebKit lose the file if the anchor is detached or the blob URL is revoked synchronously."""
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        page.evaluate(SPY)
        with page.expect_download(timeout=120000):
            page.keyboard.press("KeyX")
        spy = page.evaluate("() => window.__dl")
        leftover = page.evaluate("() => document.querySelectorAll('a[download]').length")
        b.close()
    assert spy["anchorInDocument"] is True, spy
    assert spy["revokedRightAfterClick"] == 0, spy
    assert leftover == 0, leftover                                      # the anchor is removed again


def test_photo_works_while_paused(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        page.keyboard.press("KeyP")
        page.wait_for_function("() => !document.querySelector('#pause').hidden", timeout=120000)
        with page.expect_download(timeout=120000) as info:
            page.keyboard.press("KeyX")
        data = read_download(info.value)
        name = info.value.suggested_filename
        b.close()
    assert NAME_RE.match(name), name
    assert len(data) > 5000, len(data)


def test_x_saves_nothing_on_the_start_screen_or_in_the_search_field(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 480, "height": 270}, accept_downloads=True).new_page()
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        downloads = []
        page.on("download", lambda d: downloads.append(d))
        page.keyboard.press("KeyX")                                     # start screen
        page.wait_for_timeout(1000)
        on_overlay = len(downloads)
        page.click("#startbtn", timeout=180000)
        page.keyboard.press("KeyJ")                                     # the jump search owns every key
        page.wait_for_function("() => !document.querySelector('#jump').hidden", timeout=120000)
        page.keyboard.press("KeyX")
        page.wait_for_timeout(1000)
        in_search = len(downloads)
        typed = page.evaluate("() => document.querySelector('#jumpq').value")
        b.close()
    assert on_overlay == 0, on_overlay
    assert in_search == 0, in_search
    assert typed == "x", typed                                          # the key reached the field, not the camera
