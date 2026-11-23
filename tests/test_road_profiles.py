"""#1152: roads lie on their smooth profile and the terrain is fitted to them. Slow (Playwright): run in the foreground."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
DATA = ROOT / "data"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
pytestmark = pytest.mark.skipif(not (DATA / "world_hochrhein.json").exists(), reason="no world file")
PHONE = {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True}

# AC 7-10 in one page evaluate (one page load per test function, so SwiftShader does not time out):
#   onProfile  the driven height on the axis minus (profile + 0.04), outside yield zones
#   wave       the 2nd difference of that driven height over 8 m along every motorway axis (AC 8)
#   covered    places across the carriageway where the terrain stands over the road surface (AC 9)
#   crack      the biggest step in terrainH across a fitted cell's border (AC 10)
CHECKS = """async () => {
  const W = await import('./world.js'), mm = window.__mm, out = { onProfile: [], wave: [], covered: 0, sampled: 0, crack: 0 };
  for (const r of mm.profiled()) {
    const len = W.polylineLength(r.pts), motorway = r.cls === 'motorway', hw = r.w / 2, ys = [];
    for (let t = 0; t <= len; t += 4) {
      const [x, z] = W.pointAtLength(r.pts, t); if (mm.profileW(x, z) < 1) { ys.push(null); continue; }
      const y = W.profileAt(r.zp, r.zpLen, r.zpFrom + t), top = mm.roadTop(x, z); out.onProfile.push(Math.abs(top - (y + 0.04))); ys.push(top);
      if (t % 20 === 0) { const a = W.pointAtLength(r.pts, Math.min(len, t + 0.5)), dx = a[0] - x, dz = a[1] - z, l = Math.hypot(dx, dz) || 1;
        for (let s = -hw + 0.3; s <= hw - 0.3; s += 1) { const px = x - dz / l * s, pz = z + dx / l * s, rs = mm.roadSurf(px, pz); if (rs === -Infinity) continue; out.sampled++; if (mm.terrainAt(px, pz) > rs + 1e-3) out.covered++; } }
    }
    if (motorway) for (let k = 2; k < ys.length; k++) if (ys[k] !== null && ys[k - 1] !== null && ys[k - 2] !== null) out.wave.push(Math.abs(ys[k] - 2 * ys[k - 1] + ys[k - 2]));
  }
  const keys = mm.fitKeys(), G = 16, e = 1e-4;
  for (let n = 0; n < keys.length; n += 50) { const [i, j] = keys[n].split(',').map(Number);
    for (let s = 0; s <= 16; s += 1) for (const [x, z, ox, oz] of [[i, j + s / 16, 1, 0], [i + 1, j + s / 16, 1, 0], [i + s / 16, j, 0, 1], [i + s / 16, j + 1, 0, 1]]) {
      const bx = mm.gridX0 + x * G, bz = mm.gridZ0 + z * G, a = mm.terrainAt(bx - ox * e, bz - oz * e), b = mm.terrainAt(bx + ox * e, bz + oz * e); out.crack = Math.max(out.crack, Math.abs(a - b)); } }
  return { ...out, fit: mm.roadFit() };
}"""


def load(p, server, query="", throttle=None, ctx=None):
    b = p.chromium.launch(args=ARGS); c = b.new_context(**(ctx or {})); page = c.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    if throttle:
        c.new_cdp_session(page).send("Emulation.setCPUThrottlingRate", {"rate": throttle})
    page.goto(f"{server}/index.html{query}")
    page.wait_for_selector("#mmhstatus.real", timeout=600000)
    page.wait_for_function("() => window.__mm && window.__mm.roadFit && window.__mm.sim", timeout=600000)
    load_ms = page.evaluate("() => performance.now()")      # navigation start to the ready predicate
    return b, page, errors, load_ms


def pct(v, q):
    v = sorted(v); return v[min(len(v) - 1, int(q * (len(v) - 1)))]


def test_roads_on_profile_smooth_uncovered_and_no_cracks(server):
    with sync_playwright() as p:
        b, page, errors, _ = load(p, server)
        r = page.evaluate(CHECKS); b.close()
    assert errors == [], errors
    assert r["fit"]["roads"] > 3000 and r["fit"]["cells"] > 0
    assert pct(r["onProfile"], 0.99) <= 0.05                       # AC 7
    assert pct(r["wave"], 0.99) <= 0.10                            # AC 8 (2nd difference over 8 m on the A3)
    assert r["covered"] == 0, f"{r['covered']} of {r['sampled']}"  # AC 9
    assert r["crack"] <= 0.01                                      # AC 10


def test_noprofile_is_the_old_drape(server):
    with sync_playwright() as p:
        b, page, errors, _ = load(p, server, "?noprofile=1")
        fit = page.evaluate("() => window.__mm.roadFit()"); b.close()
    assert errors == [] and fit["cells"] == 0 and fit["noProfile"]     # AC 11 (a world without zp takes this path)


A3 = """() => {   // the midpoint of the longest motorway axis: the A3
  const W = window.__mm.profiled().filter((r) => r.cls === 'motorway');
  let best = null;
  for (const r of W) { let len = 0; for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); if (!best || len > best.len) best = { r, len }; }
  return best ? best.r.pts[Math.floor(best.r.pts.length / 2)] : null;
}"""


def measure(p, server, query):
    b, page, errors, load_ms = load(p, server, query, throttle=4, ctx=PHONE)
    page.click("#startbtn", timeout=180000)
    start = page.evaluate("() => window.__mm.frameMs(120)")
    tris = page.evaluate("() => window.__mm.renderInfo().triangles")
    at = page.evaluate(A3)
    if at:
        page.evaluate("([x, z]) => window.__mm.place(x, z)", at)
    a3 = page.evaluate("() => window.__mm.frameMs(120)")
    fit = page.evaluate("() => window.__mm.roadFit()"); b.close()
    assert errors == [], errors
    return {"load_ms": round(load_ms), "start_ms": round(start, 2), "a3_ms": round(a3, 2), "tris": tris, **fit}


def test_cost_within_budget(server):
    with sync_playwright() as p:
        base, new = measure(p, server, "?noprofile=1"), measure(p, server, "")
    print("\n#1152 cost", {"noprofile": base, "profile": new})
    assert new["triangles"] <= 2_000_000
    assert new["load_ms"] - base["load_ms"] <= 3000 and new["load_ms"] <= 1.15 * base["load_ms"]
    assert new["start_ms"] <= 1.15 * base["start_ms"] and new["a3_ms"] <= 1.15 * base["a3_ms"]
