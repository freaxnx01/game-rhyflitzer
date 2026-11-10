"""WebGPU PoC page (poc/webgpu/): the gate and a clean console. Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"]
READY = "() => { const m = document.getElementById('no-webgpu'); return (m && !m.hidden) || window.__poc?.ready === true; }"


@pytest.fixture
def poc_page(server):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_context(viewport={"width": 1280, "height": 720}).new_page()
        page.poc_url = f"{server}/poc/webgpu/"
        yield page
        browser.close()


def test_no_webgpu_shows_message(poc_page):
    poc_page.add_init_script("delete Navigator.prototype.gpu; delete navigator.gpu;")
    poc_page.goto(poc_page.poc_url)
    poc_page.wait_for_selector("#no-webgpu", state="visible", timeout=30000)
    # the HUD has static minimap canvases; the renderer canvas would live in #canvas-container
    assert poc_page.locator("#canvas-container canvas").count() == 0


def test_poc_page_has_no_console_errors(poc_page):
    errors = []
    poc_page.on("pageerror", lambda e: errors.append(str(e)))
    poc_page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    poc_page.goto(poc_page.poc_url)
    poc_page.wait_for_function(READY, timeout=120000)
    path = "no-webgpu" if poc_page.is_visible("#no-webgpu") else "webgpu"
    print("SwiftShader path:", path)
    assert errors == []


def test_look_keys_switch_state(poc_page):
    poc_page.goto(poc_page.poc_url)
    poc_page.wait_for_function(READY, timeout=120000)
    if poc_page.is_visible("#no-webgpu"):
        pytest.skip("no WebGPU adapter in this browser")
    poc_page.keyboard.press("KeyT")
    assert poc_page.evaluate("window.__poc.state().time") == "midday"
    poc_page.keyboard.press("KeyR")
    state = poc_page.evaluate("window.__poc.state()")
    assert state["wet"] is True and state["roadWetness"] == 0.9
    poc_page.keyboard.press("KeyT")
    state = poc_page.evaluate("window.__poc.state()")
    assert state["wet"] is True and state["roadWetness"] == 0.9
