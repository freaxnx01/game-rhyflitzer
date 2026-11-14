"""#107: Delivery starts a shift of five orders. The car stands at an invented pizzeria, each order names a real
OSM house address, the Navi (#106) leads there, a countdown runs, and stopping at the marker hands the pizza over
for a tip. Crashes squash the cargo, the cheat keys are refused, and the best shift survives a reload.
Slow (Playwright): run in the foreground."""
import re
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from conftest import start_ready

WORLD = Path(__file__).parents[1] / "data" / "world_hochrhein.json"
MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-accelerated-2d-canvas"]
needs_world = pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
T = 180000
ADDRESS = re.compile(r"^\S.* \d+[a-zA-Z]?$")       # "<street> <number>", the number plain or with one letter
SEED = 20261003                                     # a fixed seed: the same shift every run


def open_page(p, server, block_world=False, phone=False):
    b = p.chromium.launch(args=ARGS)
    ctx = (b.new_context(viewport={"width": 360, "height": 640}, has_touch=True, locale="en-US") if phone
           else b.new_context(viewport={"width": 1280, "height": 720}, locale="en-US"))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    if block_world:
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(start_ready(), timeout=240000)
    return b, page, errors


def delivery(page):
    return page.evaluate("() => window.__mm.delivery()")


def start_shift(page, seed=SEED):
    """Start a shift with a fixed seed, the way the button does but repeatable."""
    page.evaluate("(s) => window.__mm.deliveryStart(s)", seed)
    page.wait_for_function("() => window.__mm.delivery().order", timeout=T)
    return delivery(page)


def frames(page, n=4):
    page.evaluate("(n) => new Promise(res => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : res()); f(); })", n)


# the last order of a shift ends it, and an ended shift reports through `last` instead of a running `idx`
ADVANCED = "() => window.__mm.delivery().idx > {idx} || !!window.__mm.delivery().last"


def deliver_current(page):
    """Park on the drop point and let the loop notice: the handover needs < 10 m and < 1.5 m/s."""
    idx = delivery(page)["idx"]
    page.evaluate("() => window.__mm.deliveryTeleportToDrop()")
    page.wait_for_function(ADVANCED.format(idx=idx), timeout=T)


def run_out_of_time(page):
    idx = delivery(page)["idx"]
    page.evaluate("() => window.__mm.deliveryTick(window.__mm.delivery().order.left + 1)")
    d = delivery(page)
    assert d["idx"] == idx + 1 or d["last"], d


@needs_world
def test_the_button_starts_a_shift_at_a_pizzeria(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        assert not page.is_disabled("#deliverybtn")
        assert page.text_content("#deliverybtn") == "Delivery"
        page.click("#deliverybtn")
        page.wait_for_function("() => window.__mm.delivery().order", timeout=T)
        d = delivery(page)
        line = page.text_content("#delivline")
        navi = page.evaluate("() => window.__mm.navi()")
        hidden = page.is_hidden("#overlay")
        b.close()
    assert not errors, errors
    assert d["on"] is True and d["phase"] == "running" and d["idx"] == 0 and d["total"] == 5
    assert d["score"] == 0
    assert d["depot"] in ("Pizza Fridolin", "Pizza Rheinblick", "Pizza Sissla"), d["depot"]
    o = d["order"]
    assert ADDRESS.match(o["label"]), o["label"]
    assert 250 <= o["len"] <= 5000, o["len"]
    assert abs(o["left"] - o["limit"]) <= 2 and o["limit"] == max(45, round(25 + o["len"] / 9))
    assert o["cargo"] == 100
    assert hidden, "the start screen is gone once the shift runs"
    assert navi["on"] is True and navi["dest"]["n"] == o["label"]
    assert o["label"] in line, line


@needs_world
def test_a_handover_pays_a_tip_and_draws_the_next_order(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        first = start_shift(page)["order"]
        deliver_current(page)
        d = delivery(page)
        toast = page.inner_html("#toast")
        b.close()
    assert not errors, errors
    assert d["idx"] == 1 and d["score"] > 0, d
    assert first["label"] in toast and "Delivered" in toast, toast
    assert d["order"] and d["order"]["label"] != first["label"], d["order"]
    assert d["order"]["cargo"] == 100, "a fresh pizza for the next order"


@needs_world
def test_a_crash_squashes_the_cargo_and_ruins_the_order(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start_shift(page)
        page.evaluate("() => window.__mm.deliveryImpact(0)")
        gentle = delivery(page)["order"]["cargo"]
        page.evaluate("() => window.__mm.deliveryImpact(1)")
        one = delivery(page)["order"]["cargo"]
        page.evaluate("() => { window.__mm.deliveryImpact(1); window.__mm.deliveryImpact(1); }")
        d = delivery(page)
        toast = page.inner_html("#toast")
        b.close()
    assert not errors, errors
    assert gentle == 100, "a tap below the crash threshold costs nothing"
    assert one == 60, one
    assert d["idx"] == 1 and d["score"] == 0, d
    assert d["results"][0]["outcome"] == "ruined" and d["results"][0]["tip"] == 0, d["results"]
    assert "ruined" in toast, toast


@needs_world
def test_running_out_of_time_loses_the_order(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start_shift(page)
        run_out_of_time(page)
        d = delivery(page)
        toast = page.inner_html("#toast")
        b.close()
    assert not errors, errors
    assert d["idx"] == 1 and d["score"] == 0, d
    assert d["results"][0]["outcome"] == "late", d["results"]
    assert "Too late" in toast, toast
    assert d["order"], "the next order is drawn from where the car stands"


@needs_world
def test_the_cheat_keys_are_refused_and_reset_costs_time(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start_shift(page)
        state = {}
        for code in ("KeyJ", "KeyF", "KeyO", "KeyI"):
            page.keyboard.press(code)
            frames(page)
            state[code] = {
                "jump": page.is_visible("#jump"),
                "fly": page.evaluate("() => window.__mm.fly().on"),
                "auto": page.evaluate("() => window.__mm.auto().on"),
                "navi": page.evaluate("() => window.__mm.navi().on"),
                "toast": page.text_content("#toast"),
            }
        left = delivery(page)["order"]["left"]
        page.keyboard.press("KeyR")
        frames(page)
        after = delivery(page)
        b.close()
    assert not errors, errors
    for code, s in state.items():
        assert s["jump"] is False, code
        assert s["fly"] is False, code
        assert s["auto"] is False, code
        assert s["navi"] is True, f"{code} must not end the delivery Navi"
        assert s["toast"] == "Not during a delivery", (code, s["toast"])
    assert after["order"], "R keeps the order"
    assert left - 16 <= after["order"]["left"] <= left - 14, (left, after["order"]["left"])


@needs_world
def test_the_shift_ends_with_a_result_and_saves_the_best(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start_shift(page)
        for _ in range(5):
            deliver_current(page)
        last = delivery(page)["last"]
        result = page.text_content("#result")
        stored = page.evaluate("() => localStorage.getItem('mm.deliveryBest')")
        shown = page.is_visible("#overlay")
        another = page.text_content("#deliverybtn")
        # a second shift that delivers nothing must not lower the saved best
        start_shift(page, SEED + 1)
        for _ in range(5):
            run_out_of_time(page)
        weak = delivery(page)["last"]
        kept = page.evaluate("() => localStorage.getItem('mm.deliveryBest')")
        b.close()
    assert not errors, errors
    assert last and last["delivered"] == 5 and last["total"] == 5 and last["score"] > 0, last
    assert shown, "the result screen is the start screen's overlay"
    assert "Shift done" in result and "5 of 5 delivered" in result, result
    assert str(last["score"]) in result, result
    assert "New best!" in result, result
    assert stored == str(last["score"]), (stored, last["score"])
    assert another == "Another shift", another
    assert weak["score"] == 0 and weak["rec"] is False and kept == stored, (weak, kept, stored)


@needs_world
def test_the_best_shift_survives_a_reload(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start_shift(page)
        deliver_current(page)
        for _ in range(4):
            run_out_of_time(page)
        score = delivery(page)["last"]["score"]
        page.reload()
        page.wait_for_function(start_ready(), timeout=240000)
        best = delivery(page)["best"]
        b.close()
    assert not errors, errors
    assert score > 0, score
    assert best == score, (best, score)


@needs_world
def test_the_race_is_untouched_by_a_shift(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start_shift(page)
        page.click("#pausebtn")
        page.click("#pausemenu")
        page.click("#abandonok")
        page.click("#startbtn")
        frames(page)
        pause_state = page.evaluate("() => window.__mm.pause()")
        d = delivery(page)
        navi = page.evaluate("() => window.__mm.navi().on")
        b.close()
    assert not errors, errors
    assert pause_state["state"] == "armed", pause_state["state"]
    assert d["on"] is False and d["phase"] is None and d["order"] is None, d
    assert navi is False, "Start ends the shift's Navi"


@needs_world
def test_a_shift_pauses_and_the_countdown_freezes(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        start_shift(page)
        page.click("#pausebtn")
        paused = page.evaluate("() => window.__mm.pause()")
        left = delivery(page)["order"]["left"]
        frames(page, 12)
        still = delivery(page)["order"]["left"]
        page.click("#pauseresume")
        page.click("#pausebtn")
        page.click("#pausemenu")
        confirm = page.is_visible("#abandon")
        b.close()
    assert not errors, errors
    assert paused["on"] is True and paused["state"] == "delivery", paused
    assert still == left, (left, still)
    assert confirm, "Main menu asks before it throws the shift away"


def test_the_hand_layout_disables_the_button(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, block_world=True)
        disabled = page.is_disabled("#deliverybtn")
        title = page.get_attribute("#deliverybtn", "title")
        b.close()
    assert not errors, errors
    assert disabled, "the hand-traced layout has no addresses to deliver to"
    assert title == "Delivery needs the OSM world", title
