"""#1231: the A3's two carriageways near Stein share one surface between their axes and are drawn without overlapping.
Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
pytestmark = pytest.mark.skipif(not (ROOT / "data" / "world_hochrhein.json").exists(), reason="no world file")
EAST, WEST = 137276560, 51688045   # the A3 west of the Stein bridges, each 14 m wide, axes 11.4 m apart

# Between the two axes, every 4 m along EAST (20 m clear of its ends) and every 0.25 m across: how many of the two drawn
# strips cover the point (both = overlap; neither = a gap) and how far apart the two surfaces read there. step: at every
# drawn edge vertex of EAST that lies on WEST's drawn edge (within 0.3 m), the height difference between the two edges.
# Heights are compared on the profile only (profileW 1 at every corner of the quads involved): in a yield zone the strips drape on ground the game shapes at 1 m
# (a deck's embankment, a cut), and there they differ for real -- EAST climbs onto its Stein bridge 21 m before WEST does.
CHECKS = """async ([east, west]) => {
  const W = await import('./world.js'), mm = window.__mm, A = mm.profiled().find((r) => r.id === east), B = mm.profiled().find((r) => r.id === west);
  const inside = (e, x, z) => { for (let i = 0; i < e.l.length - 1; i++) { const q = [e.l[i], e.r[i], e.r[i + 1], e.l[i + 1]]; let c = false;
    for (let a = 0, b = 3; a < 4; b = a++) if ((q[a][1] > z) !== (q[b][1] > z) && x < (q[b][0] - q[a][0]) * (z - q[a][1]) / (q[b][1] - q[a][1]) + q[a][0]) c = !c;
    if (c) return true; } return false; };
  const ea = mm.drawnEdges(east), eb = mm.drawnEdges(west), out = { pairs: mm.dualPairs(), both: 0, neither: 0, n: 0, spread: 0 };
  if (!ea || !eb) return out;
  const len = W.polylineLength(A.pts), on = (p) => mm.profileW(p[0], p[1]) >= 1;
  for (let t = 20; t <= len - 20; t += 4) { const [x, z] = W.pointAtLength(A.pts, t), n = W.nearestOnPolyline(B.pts, x, z), q = W.pointAtLength(B.pts, n.t);
    for (let u = 0.02; u < 0.98; u += 0.25 / n.d) { const px = x + (q[0] - x) * u, pz = z + (q[1] - z) * u, a = inside(ea, px, pz), b = inside(eb, px, pz);
      out.n++; if (a && b) out.both++; if (!a && !b) out.neither++;
      const hs = mm.surfsAt(px, pz).map((s) => s.h); if (hs.length > 1 && [-4, 0, 4].every((d) => on(W.pointAtLength(A.pts, t + d)) && on(W.pointAtLength(B.pts, n.t - d)))) out.spread = Math.max(out.spread, Math.max(...hs) - Math.min(...hs)); } }
  out.step = 0; out.seam = 0;
  for (const [pa, ha] of [[ea.l, ea.hl], [ea.r, ea.hr]]) for (let i = 0; i < pa.length; i++)
    for (const [pb, hb] of [[eb.l, eb.hl], [eb.r, eb.hr]]) { const n = W.nearestOnPolyline(pb, pa[i][0], pa[i][1]); if (n.d > 0.3 || ![pa[i], pa[Math.max(0, i - 1)], pa[Math.min(pa.length - 1, i + 1)], pb[n.i], pb[Math.min(n.i + 1, pb.length - 1)]].every(on)) continue;
      const k = Math.min(n.i + 1, pb.length - 1), seg = Math.hypot(pb[k][0] - pb[n.i][0], pb[k][1] - pb[n.i][1]) || 1, acc = W.polylineLength(pb.slice(0, n.i + 1)), u = Math.min(1, Math.max(0, (n.t - acc) / seg));
      out.seam++; out.step = Math.max(out.step, Math.abs(ha[i] - (hb[n.i] + (hb[k] - hb[n.i]) * u))); }
  return out;
}"""


def test_a3_carriageways_meet_at_the_median_on_one_surface(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page()
        errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{server}/index.html")
        page.wait_for_selector("#mmhstatus.real", timeout=600000)
        page.wait_for_function("() => window.__mm && window.__mm.dualPairs && window.__mm.sim", timeout=600000)
        r = page.evaluate(CHECKS, [EAST, WEST]); b.close()
    assert errors == [], errors
    print("\n#1231 measured", {k: v for k, v in r.items() if k != "pairs"})
    pairs = dict((a, ms) for a, ms in r["pairs"])
    assert WEST in pairs.get(EAST, []) and EAST in pairs.get(WEST, [])
    assert r["n"] > 500
    assert r["both"] == 0                 # no strip drawn over the other
    assert r["neither"] <= 0.01 * r["n"]  # and no gap between them
    assert r["seam"] > 25                 # the inner edges meet along the stretch
    assert r["step"] <= 0.05              # at one height: no step at the median
    assert r["spread"] <= 0.05            # and the car reads the same surface from either strip
