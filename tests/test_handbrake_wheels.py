"""#542: the wheels stay on the ground in a handbrake turn and in handbrake donuts. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

SINK_M = 0.03   # the slide may sink a wheel this much deeper than plain driving does, no more


def test_handbrake_donut_keeps_the_wheels_on_the_ground(server):
    """Full speed, then handbrake with full lock for four seconds: the lean sinks no wheel deeper than driving straight does.
    Straight driving is the baseline, not 0: the car stands on the ground under its centre, and the road under a wheel can be
    a few centimetres higher (camber, edges)."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        straight = page.evaluate("() => window.__mm.driveSim(4, ['ArrowUp'])")
        donut = page.evaluate("() => window.__mm.driveSim(4, ['ArrowUp', 'ArrowLeft', 'ControlLeft'])")
        b.close()
    assert straight["speed"] > 15, straight
    assert donut["roll"] > 0.05, donut   # the body still leans in the slide
    assert donut["worst"] >= straight["worst"] - SINK_M, (straight, donut)
    assert not errors, errors


# a 20 fps frame (the game steps the car once per frame, dt up to 0.05 s); a heading step this big is a visible jump
SLOW_DT, JUMP_RAD = 0.05, 0.01
SHAKE_JS = """([dt, jump]) => { const m = window.__mm, q = m.carPose().pos, heading = () => -m.carPose().rot[1];
  m.sim(q[0], q[2], heading(), 25, 0.1, ['KeyW']); m.step(0.75, ['ControlLeft', 'KeyA'], dt);
  let prev = heading(), last = 0, flips = 0;
  for (let i = 0; i < 45; i++) { m.step(dt, ['ControlLeft', 'KeyA'], dt); const d = heading() - prev; prev += d;
    if (Math.abs(d) > jump) { if (d * last < 0) flips++; last = d; } }
  return flips; }"""


def test_handbrake_turn_does_not_shake_left_and_right(server):
    """Tester video 2026-11-08: after a handbrake turn, the picture jumped left and right every frame. Sliding sideways the
    forward speed sits at ~0, and steering flipped with its sign, so each step's turn flipped the sign back. Holding
    handbrake and full lock at 20 fps, the heading never reverses with a visible jump."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        wait_frames(page)
        flips = page.evaluate(SHAKE_JS, [SLOW_DT, JUMP_RAD])
        b.close()
    assert flips == 0, flips
    assert not errors, errors
