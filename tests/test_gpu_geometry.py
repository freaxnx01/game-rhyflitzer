"""#1065: on the full world the merged roles are indexed where that pays, with byte-sized normal/colour, and identical
sign textures are shared. Slow: foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && window.__mm.gpuGeometry && document.querySelector('#worldstatus')?.textContent"
MB = 1048576


def open_world(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=300000)
    return b, page, errors


def test_merged_roles_use_the_compact_gpu_layout(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        g = page.evaluate("() => window.__mm.gpuGeometry()")
        dup = page.evaluate("() => window.__mm.duplicateTextures()")
        b.close()
    for role, limit in (("grass", 0.30), ("roadPlain", 0.40)):   # measured 0.20 / 0.30; today 1.0
        r = g[role]
        assert r["index"] >= 2 * r["verts"], (role, r)
        assert r["bytes"] <= limit * r["flatBytes"], (role, r)
    for role, r in g.items():
        assert r["formats"]["position"] == "Float32Array/3", (role, r)
        assert r["formats"].get("normal", "Int8Array/4") == "Int8Array/4", (role, r)
        assert r["formats"].get("color", "Uint8Array/4") == "Uint8Array/4", (role, r)
    assert sum(r["bytes"] for r in g.values()) <= 170 * MB, {k: r["bytes"] // MB for k, r in g.items()}   # today 348
    assert dup["mb"] <= 2, dup                                                                         # today ~29
    assert errors == [], errors