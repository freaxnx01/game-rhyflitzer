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


def test_car_load_failure_keeps_taxi(poc_page):
    warnings, errors = [], []
    poc_page.on("pageerror", lambda e: errors.append(str(e)))
    poc_page.on("console", lambda m: warnings.append(m.text) if m.type == "warning" else None)
    poc_page.route("**/bulldog.glb", lambda route: route.abort())
    poc_page.goto(poc_page.poc_url)
    poc_page.wait_for_function(READY, timeout=120000)
    if poc_page.is_visible("#no-webgpu"):
        pytest.skip("no WebGPU adapter in this browser")
    assert errors == []
    assert poc_page.evaluate("window.__poc.state().car") == "taxi"
    assert len([w for w in warnings if "bulldog.glb" in w]) == 1


ATTACH_JS = """async (useHelper) => {
  const THREE = await import('three/webgpu');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const attach = await import('./js/poc-car-attach.js');
  const loader = useHelper ? attach.createCarLoader() : new GLTFLoader();
  const chassisPivot = new THREE.Group();
  const standIn = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  chassisPivot.add(standIn);
  const tire = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const entity = { chassisPivot, wheels: [{ tire }] };
  const body = await attach.attachGltfBody(entity, loader);
  if (!body) return { loaded: false };
  const model = chassisPivot.children.find((c) => c !== standIn);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  let skinned = 0;
  model.traverse((n) => { if (n.isSkinnedMesh) skinned++; });
  return { loaded: true, lamps: body.lamps.length, taxiHidden: !standIn.visible && !tire.visible,
           lengthZ: box.max.z - box.min.z, minY: box.min.y, skinned };
}"""


def test_attach_gltf_body_loads_bulldog(poc_page):
    # no WebGPU on purpose: the import map is there, the renderer never starts
    poc_page.add_init_script("delete Navigator.prototype.gpu; delete navigator.gpu;")
    poc_page.goto(poc_page.poc_url)
    poc_page.wait_for_selector("#no-webgpu", state="visible", timeout=30000)
    result = poc_page.evaluate(ATTACH_JS, True)
    print("attach result:", result)
    assert result["loaded"] is True
    assert result["lamps"] >= 2
    assert result["taxiHidden"] is True
    assert abs(result["lengthZ"] - 5.05) <= 0.05
    assert abs(result["minY"]) <= 0.02
