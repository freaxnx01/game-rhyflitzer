"""#1151: bridge and underpass heights from swissTLM3D. One page load; every assertion reads the Hochrhein world against the
part-1 fixture (tests/fixtures/tlm_hochrhein_crossings.json, game heights: rail deck = TLM top of rail - 0.3)."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
WORLD = ROOT / "data" / "world_hochrhein.json"
MMH = ROOT / "data" / "terrain_hochrhein.mmh"
FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "tlm_hochrhein_crossings.json").read_text(encoding="utf-8"))["crossings"]
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
DECK = 1.2            # UNDERPASS.deck: the stone box under the surface
TOL = 0.5             # AC-3: deck and road within 0.5 m of TLM
needs_world = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="run pipeline/osm.py build and terrain.py first")
STEIN = (-888, 1206)


def load(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={"width": 480, "height": 270})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=240000)
        page.wait_for_function("() => window.__mm && window.__mm.crossings && window.__mm.place", timeout=240000)
        page.click("#startbtn", timeout=180000)
        out = {"rail": page.evaluate("() => window.__mm.crossings()"), "road": page.evaluate("() => window.__mm.roadCrossings()"),
               "decks": page.evaluate("() => window.__mm.tlmDecks()")}
        for d in out["decks"]:
            (x0, z0), (x1, z1) = d["pts"][0], d["pts"][-1]
            d["ground"] = [page.evaluate(f"() => window.__mm.ground({x}, {z}, {h + 2})") for (x, z), h in (((x0, z0), d["h0"]), ((x1, z1), d["h1"]))]
        b.close()
    assert errors == [], errors
    return out


@pytest.fixture(scope="module")
def world(server):
    return load(server)


def game_at(world, f):
    """The game crossing within 3 m of a fixture crossing: (deck, road, clearance)."""
    best = min(world[f["kind"]], key=lambda c: math.hypot(c["x"] - f["x"], c["z"] - f["z"]))
    if math.hypot(best["x"] - f["x"], best["z"] - f["z"]) > 3:
        return None
    return best["deck"], best["deck"] - DECK - best["clearance"], best["clearance"]


@needs_world
def test_matched_crossings_follow_tlm(world):
    bad, n = [], 0
    for f in FIXTURE:
        if f["tlm"] is None:
            continue
        g = game_at(world, f)
        n += 1
        if g is None:
            bad.append((f["road"], round(f["x"]), round(f["z"]), "no game crossing")); continue
        deck, road, clearance = g
        if abs(deck - f["tlm"]["deck"]) > TOL or abs(road - f["tlm"]["road"]) > TOL or clearance < 3.0:
            bad.append((f["road"], round(f["x"]), round(f["z"]), f["tlm"], [round(deck, 2), round(road, 2), round(clearance, 2)]))
    print("matched crossings:", n)
    assert n > 0 and bad == [], bad


@needs_world
def test_koenigsweg_and_ankengasse(world):
    def near(x, z):
        return [(c, c["clearance"]) for c in world["rail"] if math.hypot(c["x"] - x, c["z"] - z) < 6]
    koenig = near(4609, 5561)
    assert koenig and all(cl > 0 for _, cl in koenig), koenig
    for f in FIXTURE:
        if f["road"] != "Ankengasse" or f["tlm"] is None:
            continue
        g = game_at(world, f)
        assert g is not None, f
        assert abs(g[0] - f["tlm"]["deck"]) <= TOL and abs(g[1] - f["tlm"]["road"]) <= TOL and g[2] >= 3.0, (f["kind"], f["x"], f["z"], f["tlm"], g)


@needs_world
def test_stein_has_no_dip(world):
    stein = [c for c in world["rail"] if math.hypot(c["x"] - STEIN[0], c["z"] - STEIN[1]) < 30]
    assert stein
    for c in stein:
        road = c["deck"] - DECK - c["clearance"]
        assert abs(road - 20.4) <= TOL, (c["x"], c["z"], road)


@needs_world
def test_rail_deck_ends_meet_the_ground(world):
    rails = [c for c in world["rail"] if c["tlm"]]
    assert rails and all(c["railGap"] < 0.3 for c in rails), [(c["x"], c["z"], c["railGap"]) for c in rails if c["railGap"] >= 0.3]
    decks, bad, grades = [d for d in world["decks"] if d["kind"] == "rail"], [], []
    for d in decks:
        for k, (h, ground) in enumerate(zip((d["h0"], d["h1"]), d["endGround"])):
            if abs(ground - h) > TOL:
                bad.append((d["id"], k, round(h, 2), round(ground, 2)))
        for a, b in (d["prof"][:2], d["prof"][-2:]):
            grades.append(abs(b[1] - a[1]) / max(b[0] - a[0], 1e-6))
    print("rail decks:", len(decks), "max end-blend grade:", round(max(grades), 3))
    assert decks and bad == [], bad


@needs_world
def test_road_deck_ends_have_no_step(world):
    decks, bad = [d for d in world["decks"] if d["kind"] == "road"], []
    for d in decks:
        for k, (h, ground) in enumerate(zip((d["h0"], d["h1"]), d["ground"])):
            if abs(ground - h) >= 0.1:
                bad.append((d["id"], k, round(h, 3), round(ground, 3)))
    print("road decks:", len(decks), "steps:", bad)
    assert decks and bad == [], bad


@needs_world
def test_untouched_crossings_unchanged(world):
    n, bad = 0, []
    for f in FIXTURE:
        if f["tlm"] is not None:
            continue
        g = game_at(world, f)
        n += 1
        b = f["before"]
        if g is None or abs(g[0] - b["deck"]) > 0.01 or abs(g[1] - b["road"]) > 0.01 or abs(g[2] - b["clearance"]) > 0.01:
            bad.append((f["road"], round(f["x"]), round(f["z"]), b, g and [round(v, 3) for v in g]))
    print("untouched crossings:", n)
    assert n > 0 and bad == [], bad
