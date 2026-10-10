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
WORLD103 = "foodTruck" in _world_anchor_keys()          # world rebuilt with the #103 food truck anchor
needs_world103 = pytest.mark.skipif(not WORLD103, reason="world not rebuilt for #103 (Task 4 of docs/superpowers/plans/2026-10-03-food-truck-eiken.md)")
EIKEN_ROWS = ["DSM-Kamin", "Bahnhof Sisseln"] + (["Bahnhof Eiken"] if WORLD46 else []) + (["LANDI-Turm"] if WORLD81 else []) + ["Südspange Sisslerfeld"] \
    + (["Güggeli-Foodtruck"] if WORLD103 else [])
ALL_ROWS = (24 if WORLD46 else 17) + (1 if WORLD81 else 0) + (1 if WORLD103 else 0) + 3   # landmarks shown + Random spot; the Südspange (#125), the Bergsee (#94) and the Reservoir Hübel (#102) are fixed points, listed in any world
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
def test_holding_j_keeps_the_dialog_open(server):
    # #86: a held key auto-repeats. In Chromium a second keyboard.down() without an up() fires
    # keydown with repeat: true, like the OS does after its repeat delay.
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.down("KeyJ")
        assert page.is_visible("#jump")
        page.keyboard.down("KeyJ")               # 1st auto-repeat: used to close the dialog
        assert page.is_visible("#jump"), "a held J closed the dialog"
        page.keyboard.down("KeyJ")               # 2nd auto-repeat
        assert page.is_visible("#jump")
        assert page.input_value("#jumpq") == "", "a held J typed into the search field"
        page.keyboard.up("KeyJ")
        page.keyboard.press("KeyJ")              # a fresh press on the empty field still closes
        assert page.is_hidden("#jump")
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


@needs_world103
def test_food_truck_is_listed_and_jumpable(server):
    """#103: 'gugg' finds the Güggeli-Foodtruck (Eiken, Bahnhof Eiken car park); Enter puts the car on a road within 80 m."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("gugg")
        assert rows(page) == [{"n": "Güggeli-Foodtruck", "g": "Eiken"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        tx, tz = anchor("foodTruck")
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


SUEDSPANGE = (1528, 409)          # #125: the junction with the Laufenburgerstrasse (K295) where the Südspange starts


@needs_world
def test_suedspange_jump_lands_on_a_road_at_the_k295_junction(server):
    """#125: 'sudspange' finds the Südspange Sisslerfeld (Eiken) and Enter puts the car on a road at the junction -
    the K295 today, the Südspange itself once #42 draws it."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("sudspange")
        assert rows(page) == [{"n": "Südspange Sisslerfeld", "g": "Eiken"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        c = car(page)
        d = math.hypot(c["x"] - SUEDSPANGE[0], c["z"] - SUEDSPANGE[1])
        assert d < 40, f"car at ({c['x']:.1f}, {c['z']:.1f}) is {d:.0f} m from the junction"
        assert _jumpable_road_dist(c["x"], c["z"]) < 4, "the car did not land on a road"
        b.close()


BERGSEE = (-2349, -2207)          # #94: the ring mean of the OSM lake "Bergsee" above Bad Säckingen


@needs_world
def test_bergsee_jump_lands_on_the_lake_road_facing_the_lake(server):
    """#94: 'bergsee' finds the Bergsee (Bad Säckingen) and Enter puts the car on Am Bergsee, looking across the water."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        page.keyboard.press("KeyJ")
        page.keyboard.type("bergsee")
        assert rows(page) == [{"n": "Bergsee", "g": "Bad Säckingen"}, {"n": "Random spot", "g": None}]
        page.keyboard.press("Enter")
        c = car(page)
        th = page.evaluate("() => window.__mm.heading()")
        b.close()
    dx, dz = BERGSEE[0] - c["x"], BERGSEE[1] - c["z"]
    d = math.hypot(dx, dz)
    assert d < 80, f"car at ({c['x']:.1f}, {c['z']:.1f}) is {d:.0f} m from the lake centre"
    assert _jumpable_road_dist(c["x"], c["z"]) < 4, "the car did not land on a road"
    assert (math.cos(th) * dx + math.sin(th) * dz) / d > 0.5, f"car at ({c['x']:.1f}, {c['z']:.1f}) does not face the lake"


@needs_world
def test_plattform_jump_lands_beside_the_tower_not_in_it(server):
    """#94: the tower stands on Breitenloh, so the plain anchor snap put the car inside it."""
    ax, az = anchor("plattform")
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "plattform")
        b.close()
    d = math.hypot(c["x"] - ax, c["z"] - az)
    assert 15 < d < 40, f"car at ({c['x']:.1f}, {c['z']:.1f}) is {d:.0f} m from the tower"


@needs_world
def test_hallenbad_jump_still_lands_near_the_pool(server):
    ax, az = anchor("hallenbad")
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "hallenbad")
        b.close()
    assert math.hypot(c["x"] - ax, c["z"] - az) < 60, c


def ramp(page):
    return page.evaluate("() => window.__mm.ramp()")


@needs_world
def test_sprungschanze_puts_the_ramp_right_ahead(server):
    """#80: J -> Sprungschanze landed 175 m away on a road with the ramp 90 deg off, and the ramp was not drawn."""
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "sprung")
        r = ramp(page)
        cx, cz = (r["x0"] + r["x1"]) / 2, (r["z0"] + r["z1"]) / 2
        ax, az = anchor("jumpRamp")
        assert math.hypot(cx - ax, cz - az) < 0.01, "the ramp is not on its anchor"
        assert page.evaluate("() => window.__mm.counts.ramp") == 1, "the ramp is not drawn in the OSM world"
        d = math.hypot(cx - c["x"], cz - c["z"])
        assert 30 < d < 80, f"the ramp is {d:.0f} m away"
        assert c["x"] < r["x0"], "the car does not start before the ramp's low edge"
        th = page.evaluate("() => window.__mm.heading()")
        off = math.degrees((math.atan2(cz - c["z"], cx - c["x"]) - th + math.pi) % (2 * math.pi) - math.pi)
        assert abs(off) < 5, f"the ramp is {off:.0f} deg off the heading"
        b.close()


@needs_world
def test_sprungschanze_run_up_launches_the_car(server):
    # Fixed 1/60 s steps: the dry run (procedural terrain, as here) was 2.41 m above the ground at x 362.8 after 4 s.
    with sync_playwright() as p:
        b, page = open_page(p, server)
        c = jump_via_dialog(page, "sprung")
        th = page.evaluate("() => window.__mm.heading()")
        r = ramp(page)
        end = page.evaluate(f"() => window.__mm.sim({c['x']}, {c['z']}, {th}, 0, 4)")
        g = page.evaluate(f"() => window.__mm.ground({end['x']}, {end['z']}, -Infinity)")
        assert end["x"] > r["x1"], "the car did not get over the ramp"
        assert r["z0"] < end["z"] < r["z1"], "the car left the ramp sideways"
        assert end["y"] - g > 1.0, "the ramp did not launch the car"
        b.close()


def test_hand_layout_still_draws_the_ramp(server):
    with sync_playwright() as p:
        b, page = open_page(p, server, block_world=True)
        assert page.evaluate("() => window.__mm.layout") == "hand"
        assert page.evaluate("() => window.__mm.counts.ramp") == 1
        b.close()


MMH = Path(__file__).parents[2] / "data" / "terrain_hochrhein.mmh"
needs_measured = pytest.mark.skipif(not (WORLD.exists() and MMH.exists()), reason="needs data/world_hochrhein.json and data/terrain_hochrhein.mmh")


@needs_measured
def test_sprungschanze_drawn_where_the_car_drives_on_measured_terrain(server):
    """Review of #98: on the measured DEM the ground under the ramp is not planar; the drawn gravel must follow the
    surface groundH gives the car (terrain + ramp), not interpolate four corners (up to 2.4 m off)."""
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 1280, "height": 720})
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && /measured/.test(document.querySelector('#mmhstatus')?.textContent || '')", timeout=240000)
        gap = page.evaluate("() => window.__mm.rampGap()")
        b.close()
    assert gap < 0.3, f"drawn ramp is {gap:.2f} m off the drive surface"
