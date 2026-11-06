"""#688: the ground layers keep their order in the depth buffer, so no meadow flickers through the farm fields.
Measured terrain (needs the world built with --fields and terrain_hochrhein.mmh), like test_fields.py.
Slow (Playwright): run in the foreground."""
import json
import math

import pytest
from playwright.sync_api import sync_playwright

from test_fields import needs_fields_world
from test_smoke import ARGS, WORLD

ROAD_ROLES = ("road", "roadOsm", "roadPlain", "motorway", "gravel")


def _inside(ring, x, z):
    """Even-odd point-in-polygon on a ring (unclosed, any winding)."""
    hit = False
    n = len(ring)
    for i in range(n):
        x0, z0 = ring[i]
        x1, z1 = ring[(i + 1) % n]
        if (z0 > z) != (z1 > z) and x < (x1 - x0) * (z - z0) / (z1 - z0) + x0:
            hit = not hit
    return hit


def _in_holes(holes, x, z):
    return any(_inside(h, x, z) for h in (holes or []))


def _edge_dist(ring, x, z):
    """Plan distance from (x, z) to the nearest ring edge."""
    best = float("inf")
    n = len(ring)
    for i in range(n):
        ax, az = ring[i]
        bx, bz = ring[(i + 1) % n]
        dx, dz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1.0)))
        best = min(best, math.hypot(x - (ax + t * dx), z - (az + t * dz)))
    return best


def _cereal_field_around(x, z):
    """The cereal parcel whose ring contains (x, z), from the served world file."""
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    for f in w.get("fields", []):
        if f.get("kind") == "cereal" and _inside(f["ring"], x, z) and not _in_holes(f.get("holes"), x, z):
            return f
    return None


def _field_samples(f, cx, cz, span=250.0, step=25.0, margin=15.0, cap=140):
    """A grid of plan points at least `margin` m inside the cereal ring, around (cx, cz)."""
    pts = []
    n = int(span * 2 / step)
    for i in range(n + 1):
        for j in range(n + 1):
            x, z = cx - span + i * step, cz - span + j * step
            if _inside(f["ring"], x, z) and not _in_holes(f.get("holes"), x, z) and _edge_dist(f["ring"], x, z) >= margin:
                pts.append([x, z])
                if len(pts) >= cap:
                    return pts
    return pts


def _load(p, server):
    br = p.chromium.launch(args=ARGS)
    page = br.new_page(viewport={"width": 640, "height": 360})
    page.goto(f"{server}/index.html")
    page.wait_for_function("() => window.__mm && window.__mm.counts.fields && window.__mm.project && document.querySelector('#worldstatus')?.textContent", timeout=240000)
    page.wait_for_selector("#mmhstatus.real", timeout=240000)
    page.click("#startbtn")
    return br, page


@needs_fields_world
def test_ground_layers_have_their_depth_offsets(server):
    """field/meadow -1, every road role -2, grass null -- in both style profiles; the Crash-Platz slab -3."""
    with sync_playwright() as p:
        br, page = _load(p, server)
        for view in ("before T", "after T"):
            offs = page.evaluate("() => window.__mm.depthOffsets()")
            print(view, offs)
            assert offs["field"] == -1 and offs["meadow"] == -1, offs
            assert offs["grass"] is None, offs
            for r in ROAD_ROLES:
                assert r not in offs or offs[r] == -2, (r, offs)
            if view == "before T":
                page.keyboard.press("KeyT")
        yard = page.evaluate("() => window.__mm.counts.yardGround")
        assert yard and yard["polygonOffset"] == -3, yard
        br.close()


@needs_fields_world
def test_no_meadow_through_the_cereal_field_from_the_helicopter(server):
    """Helicopter ~400 m up facing east over the cereal field: under 1 % of the samples inside it are meadow-coloured."""
    f = _cereal_field_around(737, -848)
    assert f, "no cereal field around (737, -848) in the served world"
    pts = _field_samples(f, 737, -848)
    assert len(pts) >= 40, f"only {len(pts)} sample points inside the cereal field"
    with sync_playwright() as p:
        br, page = _load(p, server)
        page.evaluate("() => window.__mm.place(137, -848, 0)")          # th 0: facing east (+x), the field 600 m ahead
        page.keyboard.press("KeyF")                                     # take off
        for _ in range(3):
            st = page.evaluate("() => window.__mm.flySim(8, ['Space'])")   # Space climbs: ~400 m up
        print("fly:", st)
        assert st["on"] and st["y"] > 300, st
        res = page.evaluate("""async (pts) => {
          const shots = [];
          for (const [x, z] of pts) {
            const h = window.__mm.rayHits(x, z);                        // the field's own height there; skip road/rail points
            if (h.field == null || h.road != null || h.roadOsm != null || h.stone != null || h.rail != null) continue;
            const s = window.__mm.project(x, h.field, z);
            if (s) shots.push(s);
          }
          const url = await window.__mm.photoUrl();                     // the game's own next frame (no preserveDrawingBuffer)
          const bmp = await createImageBitmap(await (await fetch(url)).blob());
          const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
          const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
          let meadow = 0, n = 0;
          for (const s of shots) {
            const px = Math.round(s.x * c.width / innerWidth), py = Math.round(s.y * c.height / innerHeight);
            if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
            const d = g.getImageData(px, py, 1, 1).data;                // meadow-coloured: the green channel well above red
            n++; if (d[1] > d[0] + 8) meadow++;
          }
          return { n, meadow, projected: shots.length };
        }""", pts)
        print("samples:", res)
        br.close()
    assert res["n"] >= 40, res                        # enough of the field is on screen to judge
    assert res["meadow"] / res["n"] < 0.01, res      # as shipped this shows the meadow splinters; fixed it is clean