"""#777: during a handbrake donut next to a building the chase camera eases in and holds instead of pumping in and out once
per spin; it never jumps more than ~0.3 m in a frame and never sits inside the building.
Hand-traced layout (world + terrain blocked, see test_carselect.open_page): the start position's nearest solid is a
40 x 12 m block, 18 m high. Slow (Playwright): run in the foreground."""
import math

import pytest
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

MAX_JUMP_DIST_M = 0.35   # per frame, horizontal distance car -> camera (the open-ground lerp alone reaches 0.29 at 20 fps)
MAX_JUMP_H_M = 0.3       # per frame, camera height over the car
PULLED_IN_M = 5.0        # the donut must actually bring the camera closer than this, or the building was never in play
WALL_MARGIN_M = 0.3      # the camera counts as inside the block within this margin of its walls

# Place the car `gap` m off the block's local +x face, heading `th`; 25 m/s for 0.1 s, 0.75 s of handbrake + full left
# lock, 20 settling camera steps, then `secs` of handbrake + left + gas. Per frame: one car step, one camera step.
DONUT_JS = """([dt, gap, face, secs, margin]) => { const m = window.__mm, q = m.carPose().pos, o = m.nearestSolid(q[0], q[2]);
  const sx = o.x + o.c * (o.hw + gap), sz = o.z + o.s * (o.hw + gap), th = Math.atan2(o.s, o.c) + face;
  m.place(sx, sz, th); m.sim(sx, sz, th, 25, 0.1, ['KeyW']); m.step(0.75, ['ControlLeft', 'KeyA'], dt);
  for (let i = 0; i < 20; i++) m.camStep(dt);
  const inside = (x, y, z) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
    return Math.abs(lx) < o.hw + margin && Math.abs(lz) < o.hd + margin && y < o.h; };
  const rows = []; for (let i = 0; i < secs / dt; i++) { m.step(dt, ['ControlLeft', 'KeyA', 'KeyW'], dt); const c = m.camStep(dt), p = m.carPose().pos;
    rows.push({ d: Math.hypot(c.d[0], c.d[2]), y: c.d[1], inside: inside(p[0] + c.d[0], p[1] + c.d[1], p[2] + c.d[2]) }); }
  return { block: o, rows }; }"""


def jumps(rows):
    return (max(abs(b["d"] - a["d"]) for a, b in zip(rows, rows[1:])),
            max(abs(b["y"] - a["y"]) for a, b in zip(rows, rows[1:])))


@pytest.mark.parametrize("dt", [1 / 20, 1 / 60], ids=["20fps", "60fps"])
def test_donut_next_to_a_building_moves_the_camera_smoothly(server, dt):
    """Measured on bf063f2: 1.24 m / 1.23 m jumps at 20 fps, 0.43 / 0.45 m at 60 fps, swinging between 7.8 m / 2.6 m and
    2.9 m / 8.2 m once per spin. The car starts 2 m off the wall, facing it."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        run = page.evaluate(DONUT_JS, [dt, 2.0, math.pi, 4.0, WALL_MARGIN_M])
        b.close()
    rows = run["rows"]
    jump_d, jump_h = jumps(rows)
    assert run["block"]["hw"] == 20 and run["block"]["hd"] == 6, run["block"]   # the hand layout's block next to the start
    assert min(r["d"] for r in rows) < PULLED_IN_M, rows                          # the building was in play
    assert jump_d <= MAX_JUMP_DIST_M, (jump_d, rows)
    assert jump_h <= MAX_JUMP_H_M, (jump_h, rows)
    assert not any(r["inside"] for r in rows), [i for i, r in enumerate(rows) if r["inside"]]
    assert not errors, errors


# The car stands `gap` m off the block's +x face, facing away from it: the ideal chase spot (7 m back) is inside the block.
PARKED_JS = """([gap, margin]) => { const m = window.__mm, q = m.carPose().pos, o = m.nearestSolid(q[0], q[2]);
  const sx = o.x + o.c * (o.hw + gap), sz = o.z + o.s * (o.hw + gap), th = Math.atan2(o.s, o.c);
  m.place(sx, sz, th); m.step(0.1, [], 1 / 60); let c = null; for (let i = 0; i < 240; i++) c = m.camStep(1 / 60);
  const p = m.carPose().pos, x = p[0] + c.d[0], y = p[1] + c.d[1], z = p[2] + c.d[2], dx = x - o.x, dz = z - o.z;
  const lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
  return { d: Math.hypot(c.d[0], c.d[2]), y: c.d[1], inside: Math.abs(lx) < o.hw + margin && Math.abs(lz) < o.hd + margin && y < o.h }; }"""


def test_parked_with_the_back_to_a_wall_the_camera_stays_in_front_of_it(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        cam = page.evaluate(PARKED_JS, [3.0, WALL_MARGIN_M])
        b.close()
    assert cam["inside"] is False, cam
    assert cam["d"] < 3.0, cam                 # pulled in to the free strip between car and wall
    assert cam["y"] < 6.0, cam                 # no bird's-eye view
    assert not errors, errors
