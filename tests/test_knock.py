"""#415: knock-over street furniture and the Crash-Platz. Slow (Playwright): run in the foreground, one browser session."""
import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")


def open_page(p, server):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 1280, "height": 720})
    page.route("**/data/terrain_hochrhein.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def jump_to_yard(page):
    page.keyboard.press("KeyJ")
    page.keyboard.type("crash")
    page.keyboard.press("Enter")
    return page.evaluate("() => window.__mm.car()")


def hit(page, kind, kmh, lane=2):
    """Drive at the lane-th prop of the yard's row of this kind, from 6 m before it, at kmh."""
    props = [q for q in page.evaluate("(k) => window.__mm.knockProps(k)", kind) if q["yard"]]
    props.sort(key=lambda q: q["z"])
    t = props[lane]
    v = kmh / 3.6
    t["sim"] = page.evaluate("([x, z, v]) => window.__mm.sim(x - 6, z, 0, v, 1.0, [])", [t["x"], t["z"], v])
    return t


@needs_world
def test_crash_yard_is_listed_and_every_kind_can_be_knocked_over_and_set_up_again(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        assert page.evaluate("() => window.__mm.counts.yard") == 40

        # the world's props are unchanged in number: the yard counts apart
        want = {}
        for q in json.loads(WORLD.read_text(encoding="utf-8"))["props"]:
            want[q["kind"]] = want.get(q["kind"], 0) + 1
        assert page.evaluate("() => window.__mm.counts.props") == want

        car = jump_to_yard(page)
        start = page.evaluate("() => window.__mm.yard().start")
        assert math.hypot(car["x"] - start["x"], car["z"] - start["z"]) < 1.0
        assert page.evaluate("() => window.__mm.knock().count") == 0
        assert page.is_hidden("#knockrow")

        # a bin: flies, the counter shows it, the car is only slowed a little, it stays lying
        t = hit(page, "bin", 30)
        k = page.evaluate("() => window.__mm.knock()")
        assert k["count"] == 1 and k["kinds"] == ["bin"]
        assert page.text_content("#knockn") == "1" and page.is_visible("#knockrow")
        assert t["sim"]["speed"] > 5   # not stopped: a bin costs the car only a little
        k = page.evaluate("() => window.__mm.knockSim(6)")
        assert k["resting"] == 1
        assert page.evaluate("() => window.__mm.sfxKnocks().played") >= 1

        # a lamp: slow it stays solid, fast it bends over
        hit(page, "lamp", 20, lane=1)
        assert page.evaluate("() => window.__mm.knock().bent") == 0
        hit(page, "lamp", 60, lane=3)
        k = page.evaluate("() => window.__mm.knock()")
        assert k["bent"] == 1 and k["count"] == 2

        # a hydrant: a fountain for 8-10 s, then it stops
        hit(page, "hydrant", 30)
        k = page.evaluate("() => window.__mm.knockSim(1)")
        assert k["fountains"] == 1 and k["drops"] > 20
        k = page.evaluate("() => window.__mm.knockSim(11)")
        assert k["fountains"] == 0 and k["drops"] == 0

        # glass shatters, the clothes container throws clothes
        hit(page, "glass_container", 30)
        hit(page, "clothes_container", 30)
        k = page.evaluate("() => window.__mm.knockSim(0.5)")
        assert k["cloths"] >= 12
        assert {"glass_container", "clothes_container"} <= set(k["kinds"])
        for kind in ("bench", "bike_rack", "robidog"):
            hit(page, kind, 30)
        k = page.evaluate("() => window.__mm.knockSim(6)")
        assert k["count"] == 8 and k["loose"] == 8
        assert k["poos"] == 6 and k["poosResting"] == 6   # #469: the Robidog's Hundekacki lies on the ground

        # the mute (M) silences the knocks
        played = page.evaluate("() => window.__mm.sfxKnocks().played")
        page.keyboard.press("KeyM")
        hit(page, "bin", 30, lane=0)
        assert page.evaluate("() => window.__mm.sfxKnocks().played") == played
        assert page.evaluate("() => window.__mm.knock().count") == 9
        page.keyboard.press("KeyM")

        # F3 -> "Set up props" stands everything up again, the counter stays
        page.keyboard.press("F3")
        page.click("#knockreset")
        k = page.evaluate("() => window.__mm.knock()")
        assert k["loose"] == 0 and k["cloths"] == 0 and k["poos"] == 0 and k["fountains"] == 0 and k["count"] == 9
        assert all(not q["hit"] for q in page.evaluate("() => window.__mm.knockProps('bin')"))

        # another knock, then a jump to the yard sets everything up again
        hit(page, "bench", 30)
        assert page.evaluate("() => window.__mm.knock().loose") == 1
        jump_to_yard(page)
        assert page.evaluate("() => window.__mm.knock().loose") == 0
        b.close()


@needs_world
def test_hydrant_and_lamp_colliders_come_back_with_the_props(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        jump_to_yard(page)
        t = hit(page, "hydrant", 30)
        # the knocked hydrant no longer blocks: driving through its spot is free
        page.evaluate("([x, z]) => window.__mm.sim(x - 3, z, 0, 5, 1.0, [])", [t["x"], t["z"]])
        assert page.evaluate("() => window.__mm.car().x") > t["x"] + 0.3
        jump_to_yard(page)
        page.evaluate("([x, z]) => window.__mm.sim(x - 3, z, 0, 0.8, 2.5, [])", [t["x"], t["z"]])
        assert page.evaluate("() => window.__mm.car().x") < t["x"]   # solid again below the knock speed
        b.close()


@needs_world
def test_yard_has_a_concrete_ground_and_a_lying_prop_is_shoved_not_driven_through(server):
    with sync_playwright() as p:
        b, page = open_page(p, server)
        g = page.evaluate("() => window.__mm.counts.yardGround")   # #426: one slab over the whole rectangle, a few cm over the terrain
        assert g and g["cells"] >= 100 and 0.02 <= g["lift"] <= 0.08 and g["length"] == 110 and g["width"] == 44
        jump_to_yard(page)

        # knock a bench over and let it settle (#428)
        hit(page, "bench", 30)
        page.evaluate("() => window.__mm.knockSim(12)")
        lying = [q for q in page.evaluate("() => window.__mm.knockProps('bench')") if q["yard"] and q["hit"]][0]
        assert page.evaluate("() => window.__mm.knock().resting") == 1
        count = page.evaluate("() => window.__mm.knock().count")
        before = lying["at"]

        # drive into it from 4 m away: the car does not pass through, the prop moves along, and nothing is knocked again
        car = page.evaluate("([x, z]) => { const r = window.__mm.sim(x - 4, z, 0, 6, 0.6, [], null, true); window.__mm.place(r.x, r.z); return r; }", [before["x"], before["z"]])   # park the car so the live loop does not keep driving
        page.evaluate("() => window.__mm.knockSim(4)")
        after = [q for q in page.evaluate("() => window.__mm.knockProps('bench')") if q["yard"] and q["hit"]][0]["at"]
        assert after["x"] > before["x"] + 0.3, "shoved along the car's direction"
        assert car["x"] < after["x"] + 0.2, "the car did not drive past the lying prop"
        k = page.evaluate("() => window.__mm.knock()")
        assert k["count"] == count and k["resting"] == 1, "no new knock, it settles again"
        b.close()
