"""#164: the car's materials are physically based and lit by a sky environment map; the car stays within its frame budget.
Hand layout (world and terrain blocked), frame-light: one page per test, reads after wait_frames."""
from playwright.sync_api import sync_playwright

from test_vehicles import open_hand, wait_frames

MATS_JS = "() => window.__mm.carMats()"
STATS_JS = "() => window.__mm.carStats()"


def test_car_materials_are_pbr_with_env_map(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        m = page.evaluate(MATS_JS)
        b.close()
    assert m["body"]["type"] == "MeshPhysicalMaterial" and m["body"]["clearcoat"] == 1 and m["body"]["hasEnv"], m["body"]
    assert m["body"]["color"] == "#1b2d5e", m["body"]
    assert m["glass"]["hasEnv"] and m["glass"]["roughness"] <= 0.1, m["glass"]
    assert m["rim"]["metalness"] == 1 and m["rim"]["hasEnv"], m["rim"]
    assert m["steel"]["metalness"] >= 0.8 and m["steel"]["hasEnv"], m["steel"]
    for k in ("lampHead", "lampTail"):
        assert m[k]["emissiveIntensity"] > 0 and m[k]["hasEnv"], (k, m[k])
    for k in ("tyre", "dark"):
        assert m[k]["metalness"] == 0 and m[k]["roughness"] >= 0.7, (k, m[k])


def test_style_switch_keeps_env_map_and_frees_the_old_one(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        page.evaluate("() => window.__mm.setStyle('smooth')")
        wait_frames(page)
        first = page.evaluate("() => ({ gpu: window.__mm.gpu(), env: window.__mm.carMats().body.hasEnv, i: window.__mm.carMats().body.envMapIntensity })")
        page.evaluate("() => window.__mm.setStyle('original')")
        wait_frames(page)
        page.evaluate("() => window.__mm.setStyle('smooth')")
        wait_frames(page)
        last = page.evaluate("() => ({ gpu: window.__mm.gpu(), env: window.__mm.carMats().body.hasEnv, i: window.__mm.carMats().body.envMapIntensity })")
        b.close()
    assert first["env"] and last["env"], (first, last)
    assert last["gpu"]["textures"] == first["gpu"]["textures"], (first, last)
    assert first["i"] == 1.0, first


def test_original_style_tones_the_reflections_down(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        i = page.evaluate("() => window.__mm.carMats().body.envMapIntensity")
        b.close()
    assert 0 < i < 1, i


def test_compact_stays_within_the_frame_budget(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        wait_frames(page)
        s = page.evaluate(STATS_JS)
        b.close()
    assert s["meshes"] <= 48 and s["triangles"] <= 30000, s


def test_delorean_stays_within_the_frame_budget_and_size(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.evaluate("() => { window.__mm.setVehicle(window.__mm.vehicles().delorean); }")
        wait_frames(page)
        s = page.evaluate(STATS_JS)
        size = page.evaluate("() => window.__mm.carSize()")
        b.close()
    assert s["meshes"] <= 56 and s["triangles"] <= 30000, s
    assert abs(size["l"] - 4.27) <= 0.03, size
