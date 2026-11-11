"""#749: § records the 3D canvas with game sound as a video download.
Hand layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
import re

from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

NAME_RE = re.compile(r"^rhyflitzer-\d{8}-\d{6}\.(mp4|webm)$")


def start_hand(p, server, query="", **ctx):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(**({"viewport": {"width": 480, "height": 270}, "accept_downloads": True} | ctx)).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def test_recording_one_second_downloads_one_playable_video(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        state = page.evaluate("() => { __mm.record(true); return __mm.recordState(); }")
        page.wait_for_timeout(1500)                                     # ~1 s of recording
        with page.expect_download(timeout=120000) as d:
            page.evaluate("() => __mm.record(false)")
        download = d.value
        with open(download.path(), "rb") as f:
            data = f.read()
        final = page.evaluate("() => __mm.recordState()")
        b.close()
    assert state["state"] == "recording", state
    assert state["mime"], state                                        # a format was picked
    assert NAME_RE.match(download.suggested_filename), download.suggested_filename
    assert len(data) > 1000, len(data)                                  # a second of video, even under SwiftShader
    assert final["state"] == "idle", final
    assert final["bytes"] == 0 and final["seconds"] == 0, final         # cleaned up behind itself