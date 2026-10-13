"""#270: press L to switch the car lights on and off. Hand layout (world + terrain blocked).
#271: press 1 for the hazard lights — both turn signals flash together.
#230: brake lights light up while braking — brake beats rear light (L), with lights on or off.
Slow (Playwright): run in the foreground. Verifies the compact and the DeLorean share the same lamp levels."""
import pytest
from playwright.sync_api import sync_playwright

MMH_ROUTE = "**/data/terrain_hochrhein.mmh"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def start_hand(p, server, query=""):
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={"width": 480, "height": 270}).new_page()
    page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/prototype/index.html{query}")
    page.wait_for_function("() => window.__mm && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.click("#startbtn", timeout=180000)
    return b, page


def wait_lights(page):
    """Wait until the game loop has run applyLamps at least once, so the off-state levels are applied."""
    page.evaluate("() => { if (!window.__frames) { window.__frames = { n: 0 }; const tick = () => { window.__frames.n++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__frames.n = 0; }")
    page.wait_for_function("() => window.__frames.n >= 2", timeout=120000)


def press_l_and_assert(page, expect_on):
    page.keyboard.press("KeyL")
    page.wait_for_function("() => window.__mm.toast().shown", timeout=120000)
    lights = page.evaluate("() => window.__mm.lights()")
    toast = page.evaluate("() => window.__mm.toast()")
    assert lights["head"] is expect_on, lights
    assert lights["headLevel"] == (2.0 if expect_on else 0.35), lights
    assert toast["text"] == ("Lights on" if expect_on else "Lights off"), toast
    return lights


def test_l_toggles_the_car_lights_on_and_off_on_the_compact(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        wait_lights(page)
        off = page.evaluate("() => window.__mm.lights()")
        assert off["head"] is False and off["headLevel"] == 0.35, off          # today's look
        press_l_and_assert(page, True)                                          # L -> lights on
        press_l_and_assert(page, False)                                        # L -> lights off (back to today)
        b.close()


def test_l_toggles_the_same_levels_on_the_delorean(server):
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        wait_lights(page)
        page.evaluate("() => { window.__mm.setVehicle(window.__mm.vehicles().delorean); }")   # swap mid-race
        page.wait_for_function("() => window.__mm.vehicle().model === 'delorean'", timeout=120000)
        wait_lights(page)                                                      # buildCar + applyLamps ran
        off = page.evaluate("() => window.__mm.lights()")
        assert off["head"] is False and off["headLevel"] == 0.35, off
        press_l_and_assert(page, True)                                         # L -> lights on, same 2.0
        press_l_and_assert(page, False)                                        # L -> back to 0.35
        b.close()


def test_1_toggles_hazard_both_sides_flash_win_over_q_and_yield_to_the_blinker(server):
    """#271: 1 toggles the hazard lights — both turn signals flash together, hazard wins over
    Q (the stored blinker is kept), and switching hazard off shows the stored blinker alone again."""
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        wait_lights(page)

        # 1 on: toast, and both sides flash together — never one without the other.
        page.keyboard.press("Digit1")
        page.wait_for_function("() => window.__mm.toast().shown", timeout=120000)
        assert page.evaluate("() => window.__mm.toast().text") == "Hazard lights on"
        assert page.evaluate("() => window.__mm.lights().hazard") is True
        on = page.evaluate("""() => {
          const start = performance.now();
          while (performance.now() - start < 1000) {
            const s = window.__mm.lights();
            if (s.left !== s.right) return { bad: true, left: s.left, right: s.right };
            if (s.left && s.right) return { ok: true };
          }
          return { ok: false };
        }""")
        assert on.get("ok"), on

        # Q mid-hazard stores a blinker but does not break the symmetry: hazard still flashes both.
        page.keyboard.press("KeyQ")
        assert page.evaluate("() => window.__mm.hud().blinker") == "left"
        q = page.evaluate("""() => {
          const start = performance.now();
          while (performance.now() - start < 1000) {
            const s = window.__mm.lights();
            if (s.left !== s.right) return { bad: true, left: s.left, right: s.right };
            if (s.left && s.right) return { ok: true };
          }
          return { ok: false };
        }""")
        assert q.get("ok"), q

        # 1 off: the stored blinker shows alone again (left on, right off), never both together.
        page.keyboard.press("Digit1")
        page.wait_for_function("() => window.__mm.toast().shown", timeout=120000)
        assert page.evaluate("() => window.__mm.toast().text") == "Hazard lights off"
        assert page.evaluate("() => window.__mm.lights().hazard") is False
        assert page.evaluate("() => window.__mm.hud().blinker") == "left"
        off = page.evaluate("""() => {
          const start = performance.now();
          let bothTrue = false;
          while (performance.now() - start < 1000) {
            const s = window.__mm.lights();
            if (s.left && s.right) bothTrue = true;
            if (s.left === true && s.right === false) return { ok: true, bothTrue };
          }
          return { ok: false, bothTrue };
        }""")
        assert off.get("ok"), off
        assert not off.get("bothTrue"), off   # hazard off: the two never flash together again

        b.close()


def test_s_brakes_light_up_the_tail_lenses(server):
    """#230: hold S (or Down, touch brake, autopilot, handbrake) and the tail lights glow brighter red,
    above 0.5 m/s — brake beats rear light (L), with lights on or off. No brake light when standing still."""
    with sync_playwright() as p:
        b, page = start_hand(p, server)
        wait_lights(page)

        # lights off, no brake: idle tail level
        off = page.evaluate("() => window.__mm.lights()")
        assert off["braking"] is False and off["tailLevel"] == 0.45, off

        # drive forward, then brake: braking true, tail at brake level (2.4)
        braking = page.evaluate("""() => {
          window.__mm.step(2, ['KeyW']);
          window.__mm.step(0.3, ['KeyS']);
          return window.__mm.lights();
        }""")
        assert braking["braking"] is True and braking["tailLevel"] == 2.4, braking

        # release: settle back to idle
        page.evaluate("() => window.__mm.step(2, [])")
        wait_lights(page)
        idle = page.evaluate("() => window.__mm.lights()")
        assert idle["braking"] is False and idle["tailLevel"] == 0.45, idle

        # lights on (L): rear light level (1.0), no brake
        page.keyboard.press("KeyL")
        page.wait_for_function("() => window.__mm.toast().shown", timeout=120000)
        wait_lights(page)
        lights_on = page.evaluate("() => window.__mm.lights()")
        assert lights_on["head"] is True and lights_on["tailLevel"] == 1.0, lights_on

        # lights on + brake: brake beats rear light (2.4)
        brake_on = page.evaluate("""() => {
          window.__mm.step(2, ['KeyW']);
          window.__mm.step(0.3, ['KeyS']);
          return window.__mm.lights();
        }""")
        assert brake_on["braking"] is True and brake_on["tailLevel"] == 2.4, brake_on

        b.close()
