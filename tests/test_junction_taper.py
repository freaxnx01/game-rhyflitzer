"""#1231: at the A3 / Zürcherstrasse junction near Stein the 9 m Zürcherstrasse narrows to the 4.5 m way it continues as,
instead of stepping in at the joint. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
pytestmark = pytest.mark.skipif(not (ROOT / "data" / "world_hochrhein.json").exists(), reason="no world file")
WIDE = 1382329661   # westbound, 9 m, ends at the junction node where the 4.5 m way 116017354 goes on

# the drawn half width either side at the way's first and last vertex: the distance of the drawn edge point to the axis
WIDTHS = """(id) => {
  const e = window.__mm.drawnEdges(id), r = window.__mm.profiled().find((o) => o.id === id); if (!e || !r) return null;
  const at = (i, j) => [Math.hypot(e.l[i][0] - r.pts[j][0], e.l[i][1] - r.pts[j][1]), Math.hypot(e.r[i][0] - r.pts[j][0], e.r[i][1] - r.pts[j][1])];
  return { start: at(0, 0), end: at(e.l.length - 1, r.pts.length - 1) };
}"""


def test_zuercherstrasse_narrows_to_its_continuation_at_the_junction(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page()
        errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=600000)
        page.wait_for_function("() => window.__mm && window.__mm.drawnEdges && window.__mm.sim", timeout=600000)
        r = page.evaluate(WIDTHS, WIDE); b.close()
    assert errors == [], errors
    print("\n#1231 drawn half widths", r)
    assert r is not None
    assert all(abs(h - 2.25) <= 0.05 for h in r["end"])   # at the joint: the 4.5 m continuation's half width
    assert all(h >= 4.0 for h in r["start"])              # 49 m back: (nearly) its own 4.5 m, short of the taper
