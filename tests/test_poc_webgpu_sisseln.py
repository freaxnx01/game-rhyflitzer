"""WebGPU Sisseln PoC page (poc/webgpu-sisseln/, #987): the gate, the render path and the keys.

Slow (Playwright): run in the foreground. Unlike the New York PoC the whole slice builds in a few seconds, so the
WebGL2 path (?webgl=1) runs under SwiftShader here instead of needing the GPU browser.
"""
import os
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => { const m = document.getElementById('no-webgpu'); return (m && !m.hidden) || window.__poc?.ready === true; }"
# SwiftShader draws about one frame a second at this resolution, so anything that waits for frames waits in seconds.
READY_TIMEOUT = 180000
SETTLE_MS = 2500
TIMES = ["golden", "midday", "twilight", "midnight"]  # TIME_ORDER in poc/webgpu-sisseln/js/poc-look.js


@pytest.fixture
def poc_page(server):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_context(viewport={"width": 1024, "height": 640}).new_page()
        page.poc_url = f"{server}/poc/webgpu-sisseln/"
        yield page
        browser.close()


def watch_console_errors(page):
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    return errors


def open_gate_page(page):
    """No WebGPU adapter is assumed away explicitly, so the gate path is deterministic everywhere."""
    page.add_init_script("delete Navigator.prototype.gpu; delete navigator.gpu;")
    page.goto(page.poc_url)
    page.wait_for_selector("#no-webgpu", state="visible", timeout=30000)


def open_rendered_page(page):
    page.goto(page.poc_url + "?webgl=1")
    page.wait_for_function(READY, timeout=READY_TIMEOUT)
    assert page.is_hidden("#no-webgpu")
    return page.evaluate("window.__poc.state()")


def test_no_webgpu_shows_message(poc_page):
    open_gate_page(poc_page)
    assert poc_page.locator("#canvas-container canvas").count() == 0


def test_no_webgpu_path_has_no_console_errors(poc_page):
    errors = watch_console_errors(poc_page)
    open_gate_page(poc_page)
    assert errors == []


def test_webgl_init_path_has_no_console_errors(poc_page):
    errors = watch_console_errors(poc_page)
    open_rendered_page(poc_page)
    assert poc_page.locator("#canvas-container canvas").count() == 1
    assert errors == []


def test_slice_is_built_from_the_world_data(poc_page):
    state = open_rendered_page(poc_page)
    assert state["buildings"] >= 500, state
    assert state["roads"] >= 300, state
    assert state["lamps"] > 0 and state["trees"] > 0, state
    assert state["car"] == "bulldog", state


def test_look_keys_switch_time_and_wetness(poc_page):
    errors = watch_console_errors(poc_page)
    open_rendered_page(poc_page)
    poc_page.keyboard.press("KeyT")
    assert poc_page.evaluate("window.__poc.state().time") == "midday"
    poc_page.keyboard.press("KeyR")
    state = poc_page.evaluate("window.__poc.state()")
    assert state["wet"] is True and state["roadWetness"] == 0.9
    # a time change keeps the wet roads wet
    poc_page.keyboard.press("KeyT")
    state = poc_page.evaluate("window.__poc.state()")
    assert state["time"] == "twilight" and state["wet"] is True and state["roadWetness"] == 0.9
    assert errors == []


def test_drive_keys_move_the_car(poc_page):
    # Wait for the car to arrive, not for a stretch of wall time: the loop clamps dt to 0.05 s and SwiftShader draws
    # about a frame a second, so a 1.5 s wait only ever simulates a tenth of a second of driving.
    errors = watch_console_errors(poc_page)
    start = open_rendered_page(poc_page)["position"]
    poc_page.evaluate("(p) => { window.__drivenFrom = p; }", start)
    poc_page.keyboard.down("KeyW")
    poc_page.wait_for_function(
        "() => { const p = window.__poc.state().position, s = window.__drivenFrom;"
        " return Math.hypot(p.x - s.x, p.z - s.z) > 5; }",
        timeout=120000)
    poc_page.keyboard.up("KeyW")
    assert poc_page.evaluate("window.__poc.state().speed") > 0
    assert errors == []


def test_camera_key_cycles_the_view(poc_page):
    first = open_rendered_page(poc_page)["camera"]
    poc_page.keyboard.press("KeyV")
    second = poc_page.evaluate("window.__poc.state().camera")
    assert second != first
    assert poc_page.text_content("#hud-camera") == second


def test_hud_key_toggles_the_overlay(poc_page):
    open_rendered_page(poc_page)
    assert poc_page.evaluate("document.body.classList.contains('clean-view')") is False
    poc_page.keyboard.press("KeyH")
    assert poc_page.evaluate("document.body.classList.contains('clean-view')") is True


def test_poc_shots(poc_page, tmp_path):
    """Look screenshots per time preset, dry and wet. GPU browser only; the PNGs are never committed."""
    if not os.environ.get("PW_CDP_ENDPOINT"):
        pytest.skip("needs the GPU browser (set PW_CDP_ENDPOINT); SwiftShader needs minutes per frame at 1080p")
    started = time.time()
    out_dir = Path(os.environ.get("POC_SHOTS_DIR") or tmp_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    poc_page.set_viewport_size({"width": 1920, "height": 1080})
    open_rendered_page(poc_page)
    poc_page.wait_for_timeout(SETTLE_MS)

    shots = []
    for wet in (False, True):
        for time_id in TIMES:
            poc_page.evaluate("([t, w]) => { window.__poc.setTime(t); window.__poc.setWet(w); }", [time_id, wet])
            poc_page.wait_for_timeout(SETTLE_MS)
            shot = out_dir / f"sisseln-{time_id}-{'wet' if wet else 'dry'}.png"
            poc_page.screenshot(path=str(shot))
            shots.append(shot)

    assert len(shots) == 8
    for shot in shots:
        assert shot.stat().st_size > 0, shot
        assert shot.stat().st_mtime >= started - 1, f"{shot} was not written by this run"
