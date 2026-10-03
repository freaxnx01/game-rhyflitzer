"""#41: J opens a searchable landmark list with Gemeinde chips; game keys are silent while it is open.
Slow (Playwright): run in the foreground."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[2] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def _world_building_ids():
    return {b["id"] for b in json.loads(WORLD.read_text(encoding="utf-8"))["buildings"]} if WORLD.exists() else set()


WORLD46 = 390621357 in _world_building_ids()            # world rebuilt with #46's kept buildings
needs_world46 = pytest.mark.skipif(not WORLD46, reason="world not rebuilt for #46 (Task 4 of docs/superpowers/plans/2026-10-02-more-landmarks.md)")


def _world_anchor_keys():
    return set(json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"]) if WORLD.exists() else set()


WORLD81 = "landiTurm" in _world_anchor_keys()           # world rebuilt with the #81 LANDI tower anchor
needs_world81 = pytest.mark.skipif(not WORLD81, reason="world not rebuilt for #81 (Task 4 of docs/superpowers/plans/2026-10-03-landi-tower.md)")
EIKEN_ROWS = ["DSM-Kamin", "Bahnhof Sisseln"] + (["Bahnhof Eiken"] if WORLD46 else []) + (["LANDI-Turm"] if WORLD81 else [])
ALL_ROWS = (24 if WORLD46 else 17) + (1 if WORLD81 else 0)   # landmarks shown + Random spot
SISSELN_ROWS = ["DSM-Wasserturm", "Smile-Kreisel", "Hallenbad Sissila", "Bodenackerstrasse 6c", "Bodenackerstrasse 10B", "Sprungschanze"] \
    + (["Gemeindehaus Sisseln", "Schulhaus Sisseln"] if WORLD46 else [])


def open_page(p, server, block_world=False):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn")   # J only opens with the start overlay hidden
    return b, page


def rows(page):
    return page.evaluate("() => window.__mm.jumpList()")


def names(page):
    return [r["n"] for r in rows(page)]


def car(page):
    return page.evaluate("() => window.__mm.car()")


def anchor(name):
    lm = json.loads(WORLD.read_text(encoding="utf-8"))["anchors"]["landmarks"][name]
    return lm["x"], lm["z"]


def building_mean(bid):
    ring = next(b["ring"] for b in json.loads(WORLD.read_text(encoding="utf-8"))["buildings"] if b["id"] == bid)
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def jump_via_dialog(page, query):
    """Jump the way a player does, and report where the car ended up (a point on a road)."""
    page.keyboard.press("KeyJ")
    page.keyboard.type(query)
    page.keyboard.press("Enter")
    return car(page)


@needs_world
def test_j_opens_the_landmark_list_with_focus_in_the_search_field(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        assert page.is_visible("#jump")
        assert page.evaluate("() => document.activeElement.id") == "jumpq"
        r = rows(page)
        assert len(r) == ALL_ROWS
        assert r[0] == {"n": "Fridolinsmünster", "g": "Bad Säckingen"}
        assert r[-1] == {"n": "Random spot", "g": None}
        chips = page.eval_on_selector_all("#jumpchips button", "bs => bs.map(b => b.textContent)")
        assert chips == ["All", "Bad Säckingen", "Stein", "Münchwilen", "Eiken", "Sisseln"]
        page.keyboard.type("münst")
        assert names(page) == ["Fridolinsmünster", "Random spot"]
        page.fill("#jumpq", "")
        page.keyboard.type("MUNST")
        assert names(page) == ["Fridolinsmünster", "Random spot"]
        b.close()


@needs_world
def test_chip_filters_and_keeps_typing_in_the_field(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.click('#jumpchips button[data-g="Sisseln"]')
        assert names(page) == SISSELN_ROWS + ["Random spot"]
        assert page.evaluate("() => document.activeElement.id") == "jumpq"
        page.keyboard.type("bodenacker")
        assert names(page) == ["Bodenackerstrasse 6c", "Bodenackerstrasse 10B", "Random spot"]
        page.click('#jumpchips button[data-g="Stein"]')
        assert names(page) == ["Random spot"]
        page.click('#jumpchips button[data-g="All"]')
        assert names(page) == ["Bodenackerstrasse 6c", "Bodenackerstrasse 10B", "Random spot"]
        b.close()


@needs_world
def test_enter_jumps_and_game_keys_work_again(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("smile")
        page.keyboard.press("Enter")
        assert page.is_hidden("#jump")
        kx, kz = anchor("smileKreisel")
        c = car(page)
        assert math.hypot(c["x"] - kx, c["z"] - kz) < 60
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is True
        assert page.evaluate("() => document.activeElement.id") != "jumpq"
        view = page.evaluate("() => window.__mm.camView")
        page.keyboard.press("KeyC")
        assert page.evaluate("() => window.__mm.camView") != view
        b.close()


@needs_world
def test_arrows_move_the_selection_and_click_jumps(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.click('#jumpchips button[data-g="Stein"]')
        sel = lambda: page.text_content("#jumplist li.sel")
        assert sel().startswith("Kirche Stein")
        page.keyboard.press("ArrowDown")
        assert sel().startswith("Bahnhof Stein-Säckingen")
        page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown")   # Random spot, then wrap
        assert sel().startswith("Kirche Stein")
        page.keyboard.press("ArrowUp")
        assert sel().startswith("Random spot")
        page.click("#jumplist li:has-text('Bahnhof Stein-Säckingen')")
        assert page.is_hidden("#jump")
        sx, sz = anchor("stationStein")
        c = car(page)
        assert math.hypot(c["x"] - sx, c["z"] - sz) < 60
        b.close()


@needs_world
def test_game_keys_are_silent_while_the_dialog_is_open(server):
    # The headless renderer draws about once a second and the loop clamps dt, so a second of
    # wall time is a fraction of a second of simulation: too little for W to move the car
    # measurably even when it *is* recorded. So the driving key is checked on the input state
    # (keysDown) and R on the car's distance from its reset point, not on a wall-clock drift.
    with sync_playwright() as p:
        b, page = open_page(p, server)
        far = jump_via_dialog(page, "bahnhof sisseln")   # a road point out east
        safe = jump_via_dialog(page, "munster")          # the reset point R would use is now the Münster
        page.evaluate(f"() => window.__mm.place({far['x']}, {far['z']})")   # place() does not move the reset point
        page.keyboard.down("KeyW")                       # held while J opens
        assert page.evaluate("() => window.__mm.keysDown()") == ["KeyW"]
        page.keyboard.press("KeyJ")
        assert page.evaluate("() => window.__mm.keysDown()") == [], "a driving key survived into the dialog"
        view = page.evaluate("() => window.__mm.camView")
        page.keyboard.type("rcm ")
        page.wait_for_timeout(500)
        page.keyboard.up("KeyW")
        assert page.input_value("#jumpq") == "rcm "
        assert page.evaluate("() => window.__mm.keysDown()") == [], "a key typed into the search field drives the car"
        c = car(page)
        assert math.hypot(c["x"] - safe["x"], c["z"] - safe["z"]) > 1000, "R reset the car to its safe spot"
        assert math.hypot(c["x"] - far["x"], c["z"] - far["z"]) < 20
        assert page.evaluate("() => window.__mm.camView") == view, "C switched the camera"
        assert "Muted" not in (page.text_content("#toast") or ""), "M muted the sound"
        assert page.is_visible("#jump")
        b.close()


@needs_world
def test_j_types_with_text_and_closes_when_empty_esc_closes(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("j")                  # opening J was consumed; the field is empty, so this J closes
        assert page.is_hidden("#jump")
        page.keyboard.press("KeyJ")
        page.keyboard.type("bahnhof")
        page.keyboard.press("KeyJ")              # text in the field: J is a letter
        assert page.is_visible("#jump")
        assert page.input_value("#jumpq") == "bahnhofj"
        page.keyboard.press("Escape")
        assert page.is_hidden("#jump")
        page.keyboard.press("KeyJ")              # reopened: cleared, All, first row selected
        assert page.input_value("#jumpq") == ""
        assert len(rows(page)) == ALL_ROWS
        assert page.text_content("#jumpchips button.on") == "All"
        b.close()


@needs_world
def test_no_match_leaves_random_spot(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("xyzzy")
        assert rows(page) == [{"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        assert page.is_hidden("#jump")
        assert page.evaluate("() => window.__mm.raceFlags().jumped") is True
        b.close()


def test_without_world_the_list_shows_the_race_points_and_no_chips(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True)
        page.keyboard.press("KeyJ")
        r = rows(page)
        assert len(r) == 7                       # 5 checkpoints + finish + Random spot
        assert all(x["g"] is None for x in r)
        assert r[-1]["n"] == "Random spot"
        assert page.eval_on_selector_all("#jumpchips button", "bs => bs.length") == 0
        b.close()


@needs_world
def test_kursaal_is_listed_and_jumpable(server):
    """#46: the Kursaal's building (w91592556) is already in the world, so it is listed before the rebuild too."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("kursaal")
        assert rows(page) == [{"n": "Kursaal", "g": "Bad Säckingen"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        kx, kz = building_mean(91592556)
        c = car(page)
        assert math.hypot(c["x"] - kx, c["z"] - kz) < 80
        b.close()


@needs_world46
def test_kept_landmark_buildings_are_listed_and_jumpable(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("trompeter")
        assert names(page) == ["Schloss Schönau (Trompeterschloss)", "Random spot"]
        page.fill("#jumpq", "")
        page.click('#jumpchips button[data-g="Eiken"]')
        assert names(page) == EIKEN_ROWS + ["Random spot"]
        page.click('#jumpchips button[data-g="All"]')
        page.keyboard.type("gallus")
        page.keyboard.press("Enter")
        gx, gz = building_mean(25835477)
        c = car(page)
        assert math.hypot(c["x"] - gx, c["z"] - gz) < 80
        b.close()


@needs_world81
def test_landi_tower_is_listed_and_jumpable(server):
    """#81: 'landi' finds the LANDI-Turm (Eiken, by Bahnhof Sisseln); Enter puts the car on a road within 80 m of the tower."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("landi")
        assert rows(page) == [{"n": "LANDI-Turm", "g": "Eiken"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        tx, tz = anchor("landiTurm")
        c = car(page)
        assert math.hypot(c["x"] - tx, c["z"] - tz) < 80
        b.close()


SWISS_END = (-1233.5, 533.5)      # Fridolinsbrücke deck end at Schaffhauserstrasse (Stein CH)
GERMAN_END = (-1462.6, 459.1)     # deck end at Fricktalstraße (Bad Säckingen DE)


def _jumpable_road_dist(x, z):
    best = math.inf
    for r in json.loads(WORLD.read_text(encoding="utf-8"))["roads"]:
        if r["bridge"] or r["cls"] in ("motorway", "motorway_link"):
            continue
        for (ax, az), (bx, bz) in zip(r["pts"], r["pts"][1:]):
            dx, dz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / ((dx * dx + dz * dz) or 1)))
            best = min(best, math.hypot(x - (ax + dx * t), z - (az + dz * t)))
    return best


@needs_world
def test_fridolinsbruecke_lands_on_the_swiss_side_facing_the_bridge(server):
    """#79: the Swiss approach (Stein), on the road, facing the deck - not the German bank nearest the mid-river anchor."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "fridolinsbr")
        to_ch = math.hypot(c["x"] - SWISS_END[0], c["z"] - SWISS_END[1])
        to_de = math.hypot(c["x"] - GERMAN_END[0], c["z"] - GERMAN_END[1])
        assert to_ch < 60, f"car at ({c['x']:.1f}, {c['z']:.1f}) is {to_ch:.0f} m from the Swiss deck end"
        assert to_ch < to_de
        assert c["bridge"] is False
        assert _jumpable_road_dist(c["x"], c["z"]) < 4
        th = page.evaluate("() => window.__mm.heading()")
        ax, az = anchor("fridolinsbruecke")
        ux, uz = ax - c["x"], az - c["z"]
        assert (math.cos(th) * ux + math.sin(th) * uz) / math.hypot(ux, uz) > 0.5, "car does not face the bridge"
        b.close()
