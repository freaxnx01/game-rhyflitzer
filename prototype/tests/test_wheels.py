"""#132: the front wheels yaw with the steering and all four wheels roll with the distance driven.
Hand-traced layout (world + terrain blocked): no data files needed, deterministic. The wheel state is
written by stepCar and only read by drawWheels, so every check runs the physics with __mm.sim and then
waits for the loop to have drawn the groups. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_vehicles import open_hand, use_vehicle, wait_frames   # same import style as test_look_back.py

WHEELS_JS = "() => window.__mm.wheelYaw()"
# hand START = (1882.9, -292.2), heading pi -- the same proven-on-road spot the golden trace uses
START = [1882.9, -292.2, 3.141592653589793]


def drive(page, key, secs=1.0):
    """Run the physics for secs at 10 m/s with one key held, then wait until the loop has drawn the wheels."""
    page.evaluate("([x, z, th, k, s]) => window.__mm.sim(x, z, th, 10, s, [k])", START + [key, secs])
    wait_frames(page, 2)
    return page.evaluate(WHEELS_JS)


def test_front_wheels_turn_with_the_steering(server):
    """#132: D turns the front wheels right (rotation.y < 0, like car.rotation.y = -th), A left; the rear wheels stay straight."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        right = drive(page, "KeyD")
        left = drive(page, "KeyA")
        b.close()
    assert len(right["front"]) == 2 and len(right["rear"]) == 2, right
    assert all(y < -0.2 for y in right["front"]), right
    assert all(y > 0.2 for y in left["front"]), left
    assert all(abs(y) < 1e-6 for y in right["rear"] + left["rear"]), (right, left)


def test_wheels_return_straight_and_roll(server):
    """#132: with no steering the front wheels swing back to straight; driving rolls the wheels."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        drive(page, "KeyD")
        straight = drive(page, "KeyW", 1.5)
        rolled = drive(page, "KeyW", 0.5)
        b.close()
    assert all(abs(y) < 0.05 for y in straight["front"]), straight
    assert rolled["spin"] != straight["spin"], (straight, rolled)


def test_rebuilt_car_still_steers(server):
    """#132: switching the vehicle rebuilds the wheel groups; the new ones are drawn from the state too."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        use_vehicle(page, "c.drive.top = 30")
        turned = drive(page, "KeyD")
        b.close()
    assert all(y < -0.2 for y in turned["front"]), turned


def test_paused_wheels_stand_still(server):
    """#132: while paused the loop skips the steps and the wheel update, so the wheels do not move.
    The run has to be started first: a pause only makes sense during a run (pause.js canPause)."""
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn")
        drive(page, "KeyD", 0.2)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=120000)
        before = page.evaluate(WHEELS_JS)
        wait_frames(page, 3)
        after = page.evaluate(WHEELS_JS)
        b.close()
    assert before == after, (before, after)
