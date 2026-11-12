"""#901: gable-house facades -- one door at street level, whole windows, plain gable ends, closed roofs. Slow (Playwright):
run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")

ROW_IDS = {512632899, 171822953, 171822664, 171822908, 171822930, 171822939, 171822935, 171822913,
           171822943, 171822937, 171822949, 171822938, 171822934, 171822932, 171822933, 171822799}
DOOR_IDS = [171822842, 171822922, 199700571]   # the three reported houses: two on the Hauptstrasse, one on the Winkelackerstrasse


def open_page(p, server):
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    return b, page


def door_normal(k, rot):
    """The outward normal (world frame) of facade face k (+z, +x, -z, -x local), as gableHouseWalls winds its corners."""
    c, s = math.cos(rot), math.sin(rot)
    return [(-s, c), (c, s), (s, -c), (-c, -s)][k]


def facade_rows(base, h, ground):
    """world.js facadeRows, mirrored: the storey grid anchored at the door's ground."""
    floor0 = min(max(ground, base), base + max(0, h - 2.2))
    H = base + h - floor0
    if H < 2.2:
        return floor0, 0, 3.0, floor0
    floors = max(1, round(H / 3))
    sh = H / floors
    if sh > 3.5:
        sh = 3.0
    return floor0, floors, sh, floor0 + floors * sh


def gable_path_houses(w):
    """The buildings whose walls gableHouseWalls draws: the gable branch, minus row houses (own box) and landmark-replaced."""
    return [b for b in w["buildings"]
            if b.get("roof") == "gable"
            and not (b.get("hsrc") == "dsm" and b.get("rh", 1) < 0.6)
            and b["id"] not in ROW_IDS]


@needs_world
def test_each_gable_house_has_one_door_on_the_ground(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in w["buildings"]}
    with sync_playwright() as p:
        br, page = open_page(p, server)
        replaced = set(page.evaluate("() => window.__mm.counts.chLandmarks.replaced"))
        doors = page.evaluate("() => window.__mm.counts.houseDoors")
        assert doors == len([b for b in gable_path_houses(w) if b["id"] not in replaced]), doors
        for i in DOOR_IDS:
            b = by_id[i]; cx, cz, bw, bd, rot = b["rect"]
            door = page.evaluate(f"() => window.__mm.houseDoor({i})")
            assert door, i
            n = door_normal(door["k"], rot)
            fx, fz = door["x"] + n[0] * 6, door["z"] + n[1] * 6      # 6 m out, looking at the wall
            tx, tz = door["x"] - n[0] * 1, door["z"] - n[1] * 1      # 1 m in, past the face
            terr_out = page.evaluate(f"() => window.__mm.probe({fx}, {fz}).terrain")
            terr_in = page.evaluate(f"() => window.__mm.probe({tx}, {tz}).terrain")
            base = page.evaluate("(pts) => Math.min(...pts.map(p => window.__mm.probe(p[0], p[1]).terrain))", b["ring"])
            terr_door = page.evaluate(f"() => window.__mm.probe({door['x']}, {door['z']}).terrain")
            floor0, floors, sh, band_top = facade_rows(base, b["h"], terr_door)
            assert abs(door["y"] - floor0) < 0.01, f"{i}: door bottom {door['y']:.2f} != the clamped ground {floor0:.2f}"
            up, up1 = door["y"] + 1.0 - terr_out, door["y"] + 1.0 - terr_in   # up1: absolute height through the door centre
            ground_hit = page.evaluate(f"() => window.__mm.wallRoleAt({fx}, {fz}, {tx}, {tz}, {up}, {up1})")
            upper_hit = page.evaluate(f"() => window.__mm.wallRoleAt({fx}, {fz}, {tx}, {tz}, {up + sh}, {up1 + sh})")
            assert ground_hit == "wallDoor", f"{i}: {ground_hit} at the door, not wallDoor"
            assert upper_hit in ("wall", "plaster"), f"{i}: {upper_hit} one storey up -- a door must never repeat"
        br.close()


@needs_world
def test_gable_end_is_plaster(server):
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    b = next(x for x in w["buildings"] if x["id"] == 171822922)   # the middle house of the second report
    cx, cz, bw, bd, rot = b["rect"]
    c, s = math.cos(rot), math.sin(rot)
    x, z = cx + (bw / 2 + 12) * c, cz + (bw / 2 + 12) * s   # 12 m outside the +x gable end, looking at the centre
    up = b["h"] + 0.75 * b["rh"]                            # inside the triangle, above any attic window
    with sync_playwright() as p:
        br, page = open_page(p, server)
        hit = page.evaluate(f"() => window.__mm.wallRoleAt({x}, {z}, {cx}, {cz}, {up})")
        br.close()
    assert hit == "plaster", hit


@needs_world
def test_roof_overhang_hits_from_below(server):
    """A ray rising past the eave, 0.25-0.35 m outside the wall, must hit the roof: the overhang's underside draws (#901)."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in w["buildings"]}
    with sync_playwright() as p:
        br, page = open_page(p, server)
        for i in DOOR_IDS:
            b = by_id[i]; cx, cz, bw, bd, rot = b["rect"]
            base = page.evaluate("(pts) => Math.min(...pts.map(p => window.__mm.probe(p[0], p[1]).terrain))", b["ring"])
            eave = base + b["h"]
            n = door_normal(0, rot)                       # the +z local face is an eave face (the ridge runs along w)
            ecx, ecz = cx + (bd / 2) * n[0], cz + (bd / 2) * n[1]   # the eave face's centre on the wall
            x0, z0 = ecx + n[0] * 0.25, ecz + n[1] * 0.25  # 0.25 m outside the wall, 1 m under the eave
            x1, z1 = ecx + n[0] * 0.35, ecz + n[1] * 0.35  # 0.35 m outside, 1 m over the eave
            t0 = page.evaluate(f"() => window.__mm.probe({x0}, {z0}).terrain")
            t1 = page.evaluate(f"() => window.__mm.probe({x1}, {z1}).terrain")
            up, up1 = eave - 1 - t0, eave + 1 - t1         # absolute heights through the overhang
            hit = page.evaluate(f"() => window.__mm.wallRoleAt({x0}, {z0}, {x1}, {z1}, {up}, {up1})")
            assert hit == "roof", f"{i}: {hit} -- the sky would show through the overhang"
        br.close()
