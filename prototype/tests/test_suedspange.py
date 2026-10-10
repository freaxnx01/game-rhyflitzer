"""#42: Südspange — cutting, underpass under the DSM tracks, signs, HUD. Slow (Playwright): run in the foreground."""
import json
import math
import sys
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from test_street_labels import ARGS, WORLD, needs_world

sys.path.insert(0, str(Path(__file__).parents[2] / "pipeline"))
import world_extra_roads  # noqa: E402

STANDIN = [[1330.0, 576.0], [1240.0, 574.0], [1092.0, 573.0]]       # t: 0, 90.0, 238.0
GRADE = {"pts": STANDIN, "hw": 9.5, "ctl": [[0, 0], [90.0, 6.5], [238.0, 0]]}


def open_page(p, server, world=None):
    """The real terrain, not the flat fallback: the grade is sized on the uncut mesh. Waits for the .mmh first: with it
    blocked, or before it lands, the page can stay busy for minutes under load (#187)."""
    b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 640, "height": 360})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    if world is not None:
        body = json.dumps(world, ensure_ascii=False)
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=200, content_type="application/json", body=body))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_selector("#mmhstatus.real", timeout=240000)
    page.wait_for_function("() => window.__mm && window.__mm.hud && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.errors = errors
    return b, page


def standin_world():
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    w["roads"] = [r for r in w["roads"] if r["id"] > -42000]           # works before and after the rebuild
    w["roads"].append({"id": -42001, "n": "Südspange", "cls": "tertiary", "w": 8.0, "mark": "centre", "bridge": False,
                       "layer": 0, "pts": STANDIN})
    w["grades"] = [GRADE]
    w["rail"], w["railBridges"] = world_extra_roads.deck_rail(w["grades"], w["rail"], w.get("railBridges", []))
    return w


@needs_world
def test_standin_underpass(server):
    with sync_playwright() as p:
        br, page = open_page(p, server, world=standin_world())
        page.wait_for_function("() => window.__mm.crossings && window.__mm.gradeAt", timeout=240000)
        at = page.evaluate("() => window.__mm.gradeAt(1240, 574)")
        xs = page.evaluate("() => window.__mm.crossings()")
        through = page.evaluate("() => window.__mm.sim(1300, 575.3, Math.PI, 12, 10)")
        grass = page.evaluate("() => window.__mm.grassOverRoad(400, 'Südspange')")
        errors = page.errors
        br.close()
    assert errors == [], errors
    assert abs(at["mesh"] - at["terrain"] - 6.5) < 0.3, at                       # the cut under the tracks
    assert at["profile"] is not None and abs(at["terrain"] - at["profile"]) < 0.3, at
    here = [c for c in xs if c["road"] == "Südspange"]
    print(json.dumps({"at": at, "here": here, "through": through, "grass": grass}, indent=1))
    assert len(here) >= 5, xs                                                     # five DSM spurs, all decks now
    assert all(c["clearance"] >= 4.45 and c["railGap"] < 0.3 for c in here), here
    assert through["x"] < 1150 and through["speed"] > 5 and not through["bridge"], through
    assert grass["done"] > 0 and grass["bad"] == 0, grass


SIGNS = {"tBo": {"x": 1300.0, "z": 582.0, "kind": "baustelle", "h": None, "rot": 3.1},
         "tFo": {"x": 1200.0, "z": 581.0, "kind": "fahrverbot", "h": None, "rot": 0.0}}


@needs_world
def test_standin_signs(server):
    w = standin_world()
    w["anchors"]["landmarks"] = {k: v for k, v in w["anchors"]["landmarks"].items() if v["kind"] not in ("baustelle", "fahrverbot")}
    w["anchors"]["landmarks"].update(SIGNS)
    with sync_playwright() as p:
        br, page = open_page(p, server, world=w)
        page.wait_for_function("() => window.__mm.roadSigns", timeout=240000)
        signs = page.evaluate("() => window.__mm.roadSigns()")
        on_road = page.evaluate("() => { window.__mm.place(1300, 582); return window.__mm.roadDist(); }")
        errors = page.errors
        br.close()
    assert errors == [], errors
    assert sorted(s["kind"] for s in signs) == ["baustelle", "fahrverbot"], signs
    assert on_road > 0, on_road                                          # beside the road, not on it
