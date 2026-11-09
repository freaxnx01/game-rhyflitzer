#!/usr/bin/env python3
"""#556: the curated screenshot gallery. Drives the real game to every motif of docs/gallery/shots.json and writes
<id>-1920.jpg and <id>-3840.jpg (JPG, quality 90) to docs/gallery/. Not the world gallery of scripts/gallery.py (#170).

    python scripts/shots.py                      # all motifs
    python scripts/shots.py --only dsm-sisseln   # retake single motifs
    python scripts/shots.py --list               # ids and titles
    python scripts/shots.py --readme             # rewrite the README thumbnail block from shots.json

PW_CDP_ENDPOINT (tests/gpu_browser.py) selects the GPU browser; without it a local SwiftShader Chromium is used.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))   # gpu_browser.py, hermetic_api.py: stdlib only

SHOTS_FILE = ROOT / "docs" / "gallery" / "shots.json"
OUT_DIR = ROOT / "docs" / "gallery"
README = ROOT / "README.md"
GAME = "Rhyflitzer – Map Madness"
MARK_START, MARK_END = "<!-- shots:start -->", "<!-- shots:end -->"

REQUIRED = ("id", "title", "title_de", "region", "mode", "vehicle", "at", "look_at", "camera", "style", "time", "weather")
MODES = ("car", "heli", "loco", "foot")
CAMERAS = ("chase", "near", "cockpit", "bumper", "eye")   # CAM_VIEWS 0-3; the drone orbits, so "arrived" has no meaning there; eye = on foot
# mode foot: the walker's first-person eye is a free camera (#556 round 2). The car is parked at `park` (out of the frame), the
# walker hovers `agl` metres over the ground at `at`, facing look_at, pitched by `pitch_deg` (up > 0). camera must be "eye".
FOOT_AGL = (1.7, 150)      # WALKER.eye .. WALKER.hoverMaxAgl
FOOT_PITCH = (-80, 80)     # WALKER.pitchMax is 1.4 rad
STARTS = ("trial", "cruise")   # optional `start`: cruise has no checkpoint pillars and no finish in the frame (default trial)
STYLES = ("original", "smooth")
VEHICLES = ("compact", "delorean", "mini", "bus")
TIMES = ("day",)        # the game has no time of day (spec A3)
WEATHERS = ("clear",)   # nor weather
ENUMS = {"mode": MODES, "camera": CAMERAS, "style": STYLES, "vehicle": VEHICLES, "time": TIMES, "weather": WEATHERS, "start": STARTS}
ID_RE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
NEAR_MAX_M = 600
COUNT_RANGE = (8, 12)


def _is_point(p) -> bool:
    return isinstance(p, dict) and all(isinstance(p.get(k), (int, float)) and not isinstance(p.get(k), bool) for k in ("x", "z"))


def _shot_errors(s: dict, regions, landmarks) -> list[str]:
    sid = s.get("id", "?")
    errors = [f"'{sid}': missing field {k}" for k in REQUIRED if k not in s]
    if "id" in s and not (isinstance(s["id"], str) and ID_RE.fullmatch(s["id"])):
        errors.append(f"'{sid}': id must be lowercase words joined by '-'")
    if "region" in s and s["region"] not in regions:
        errors.append(f"'{sid}': region '{s['region']}' is not one of {sorted(regions)}")
    for field, allowed in ENUMS.items():
        if field in s and s[field] not in allowed:
            errors.append(f"'{sid}': {field} '{s[field]}' is not one of {list(allowed)}")
    for field in ("at", "look_at"):
        if field in s and not _is_point(s[field]):
            errors.append(f"'{sid}': {field} needs numeric x and z")
    if _is_point(s.get("at")) and _is_point(s.get("look_at")) and math.dist((s["at"]["x"], s["at"]["z"]), (s["look_at"]["x"], s["look_at"]["z"])) < 1:
        errors.append(f"'{sid}': look_at must differ from at by at least 1 m")
    if s.get("mode") == "heli" and not (isinstance(s.get("climb_s"), (int, float)) and 1 <= s["climb_s"] <= 10):
        errors.append(f"'{sid}': mode heli needs climb_s between 1 and 10")
    if s.get("mode") == "foot":
        errors += _foot_errors(s)
    elif s.get("camera") == "eye":
        errors.append(f"'{sid}': camera eye needs mode foot")
    return errors + _near_errors(s, landmarks)


def _in_range(v, lo_hi) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and lo_hi[0] <= v <= lo_hi[1]


def _foot_errors(s: dict) -> list[str]:
    sid = s.get("id", "?")
    errors = []
    if s.get("camera") != "eye":
        errors.append(f"'{sid}': mode foot needs camera eye")
    if not _is_point(s.get("park")):
        errors.append(f"'{sid}': mode foot needs park (x, z) where the car waits")
    if not _in_range(s.get("agl", FOOT_AGL[0]), FOOT_AGL):
        errors.append(f"'{sid}': agl must be between {FOOT_AGL[0]} and {FOOT_AGL[1]} m")
    if not _in_range(s.get("pitch_deg", 0), FOOT_PITCH):
        errors.append(f"'{sid}': pitch_deg must be between {FOOT_PITCH[0]} and {FOOT_PITCH[1]}")
    return errors


def _near_errors(s: dict, landmarks) -> list[str]:
    near = s.get("near")
    if near is None or not landmarks or not _is_point(s.get("at")):
        return []
    if near not in landmarks:
        return [f"'{s.get('id')}': near '{near}' is not a landmark of the world"]
    if math.dist((s["at"]["x"], s["at"]["z"]), (landmarks[near]["x"], landmarks[near]["z"])) > NEAR_MAX_M:
        return [f"'{s.get('id')}': at is farther than {NEAR_MAX_M} m from landmark '{near}'"]
    return []


def validate_shots(shots, regions, landmarks=None, min_count: int = COUNT_RANGE[0]) -> list[str]:
    """Error messages for a shot list; [] when it is valid. landmarks: anchors.landmarks of the hochrhein world."""
    errors, seen = [], set()
    for s in shots:
        if s.get("id") in seen:
            errors.append(f"duplicate id '{s['id']}'")
        seen.add(s.get("id"))
        errors += _shot_errors(s, regions, landmarks if s.get("region") == "hochrhein" else None)
    if not min_count <= len(shots) <= COUNT_RANGE[1]:
        errors.append(f"{len(shots)} motifs; the gallery wants {COUNT_RANGE[0]}-{COUNT_RANGE[1]}")
    return errors


def heading(at: dict, look_at: dict) -> float:
    """The car's yaw th (radians) from `at` towards `look_at`; x east, z south, th = atan2(dz, dx)."""
    return math.atan2(look_at["z"] - at["z"], look_at["x"] - at["x"])


def caption(shot: dict) -> str:
    return f"{GAME}: {shot['title']}"


def output_names(shot_id: str, css_width: int) -> tuple[str, str]:
    return f"{shot_id}-{css_width}.jpg", f"{shot_id}-{css_width * 2}.jpg"


def select_shots(shots: list[dict], only: list[str] | None) -> list[dict]:
    if not only:
        return list(shots)
    known = {s["id"] for s in shots}
    unknown = [i for i in only if i not in known]
    if unknown:
        sys.exit(f"Unknown motif id(s): {', '.join(unknown)}. Known: {', '.join(sorted(known))}")
    return [s for s in shots if s["id"] in only]


def readme_block(shots: list[dict]) -> str:
    cells = [f'  <a href="docs/gallery/{s["id"]}-3840.jpg"><img src="docs/gallery/{s["id"]}-1920.jpg" width="32%" alt="{caption(s)}"></a>'
             for s in shots]
    return "<p>\n" + "\n".join(cells) + "\n</p>"


def splice_readme(text: str, block: str) -> str:
    start, end = text.find(MARK_START), text.find(MARK_END)
    if start < 0 or end < start:
        sys.exit(f"README.md needs the markers {MARK_START} and {MARK_END} (in that order)")
    return text[: start + len(MARK_START)] + "\n" + block + "\n" + text[end:]


def region_ids(root: Path = ROOT) -> set[str]:
    return set(re.findall(r"^    id: '([a-z0-9]+)'", (root / "regions.js").read_text(encoding="utf-8"), re.M))


def load_landmarks(root: Path = ROOT) -> dict:
    world = json.loads((root / "data" / "world_hochrhein.json").read_text(encoding="utf-8"))
    return world["anchors"]["landmarks"]


def load_shots(path: Path = SHOTS_FILE) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


HIDDEN_SELECTORS = ("#tl", "#tr", "#bl", "#br", "#pausebtn", "#arrow", "#game-nav", "#debug", "#toast", "#keybar", "#navi", "#touch", "#radiobtn", "#radiopanel")   # #773: #compass and #stylebtn are gone
# the #305 class (no toast, unlike the Ctrl+H key) plus the elements it leaves visible: the toast, the arrow, the key bar
HIDE_CSS = ",".join(HIDDEN_SELECTORS) + "{visibility:hidden!important}"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 240000
READY = "() => window.__mm && window.__mm.sim && window.__mm.place && document.querySelector('#worldstatus')?.textContent"
LOADED = "(terrain) => window.__mm.layout === 'osm' && (!terrain || document.querySelector('#mmhstatus')?.classList.contains('real'))"
VISIBLE = """(sels) => sels.filter(s => { const e = document.querySelector(s); if (!e) return false; const c = getComputedStyle(e);
  return !e.hidden && c.visibility !== 'hidden' && c.display !== 'none' && e.getClientRects().length > 0; })"""
# car motifs: the car is static, so one camera easing step that moves the camera under 1 mm means it has arrived; camStep is
# independent of the frame rate (CLAUDE.md "Animated cameras": a headless loop is clamped and draws under 1 fps)
SETTLE = """() => { const m = window.__mm; let prev = m.camStep(0.05).d, moved = 1;
  for (let i = 0; i < 2000; i++) { const d = m.camStep(0.05).d; moved = Math.hypot(d[0] - prev[0], d[1] - prev[1], d[2] - prev[2]); prev = d; if (moved < 0.001) return { steps: i, moved }; }
  return { steps: 2000, moved }; }"""
CAM_POS = "() => { const c = window.__mm.cam(); return c.d; }"
FRAMES = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"


def visible_chrome(page) -> list[str]:
    return page.evaluate(VISIBLE, [*HIDDEN_SELECTORS, "#overlay"])


def wait_for_camera_arrival(page, shot: dict) -> None:
    """Car and foot: camStep until it stops moving. Heli and loco: the camera follows a moving thing, so poll until three polls agree."""
    if shot["mode"] in ("car", "foot"):
        result = page.evaluate(SETTLE)
        if result["moved"] >= 0.001:
            raise RuntimeError(f"camera did not arrive after {result['steps']} steps (still moving {result['moved']:.4f} m)")
        return
    still, last = 0, None
    for _ in range(240):   # 120 s
        pos = page.evaluate(CAM_POS)
        still = still + 1 if last and max(abs(a - b) for a, b in zip(pos, last)) < 0.05 else 0
        if still >= 3:
            return
        last = pos
        page.wait_for_timeout(500)
    raise RuntimeError("camera did not arrive within 120 s")


def press_until_camera(page, shot: dict) -> None:
    want = CAMERAS.index(shot["camera"])   # never "eye": mode foot selects no CAM_VIEW
    for _ in range(len(CAMERAS) + 1):
        if page.evaluate("() => window.__mm.camView") == want:
            return
        page.keyboard.press("KeyC")
    raise RuntimeError(f"could not select the {shot['camera']} camera")


def start_game(page, base_url: str, shot: dict, args) -> None:
    if args.no_terrain:
        page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{base_url}/index.html?region={shot['region']}")
    page.wait_for_function(READY, timeout=T)
    page.click("#cruisebtn" if shot.get("start") == "cruise" else "#startbtn", timeout=T)
    page.wait_for_function(LOADED, arg=not args.no_terrain, timeout=T)


def stage(page, shot: dict) -> None:
    """Style, vehicle, placement, motion: everything the picture shows, before the clean-up and the camera wait."""
    page.evaluate("(k) => window.__mm.setStyle(k)", shot["style"])
    page.evaluate("(id) => { const v = window.__mm.vehicles()[id]; if (!v) throw new Error('unknown vehicle ' + id); window.__mm.setVehicle(v); }", shot["vehicle"])
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [shot["at"]["x"], shot["at"]["z"], heading(shot["at"], shot["look_at"])])
    if shot["mode"] == "heli":
        page.keyboard.press("KeyF")
        page.evaluate("(s) => window.__mm.flySim(s, ['Space'])", shot["climb_s"])
        if not page.evaluate("() => window.__mm.fly().on"):
            raise RuntimeError("the helicopter did not take off here")
    if shot["mode"] == "loco":
        for _ in range(2):   # out of the car, then into the loco (pressZ)
            page.keyboard.press("KeyZ")
            page.wait_for_timeout(1000)
        if not page.evaluate("() => window.__mm.train().on"):
            raise RuntimeError("the steam loco was not boarded: move `at` next to it")
    if shot["mode"] == "foot":
        stage_foot(page, shot)
    if shot["mode"] in ("car", "heli"):
        press_until_camera(page, shot)


MOUSE_RAD = 0.0025   # WALKER.mouse: footLook turns the pitch by -dy * mouse


def stage_foot(page, shot: dict) -> None:
    """Park the car, get out (Z), carry the walker to `at`, hover (F) up to `agl` over the ground, aim the eye."""
    page.evaluate("([x, z]) => window.__mm.place(x, z, 0)", [shot["park"]["x"], shot["park"]["z"]])
    page.keyboard.press("KeyZ")
    page.wait_for_timeout(500)
    if not page.evaluate("() => window.__mm.foot().on"):
        raise RuntimeError("could not get out of the car: move `park` to open, flat ground")
    page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [shot["at"]["x"], shot["at"]["z"], heading(shot["at"], shot["look_at"])])
    page.keyboard.press("KeyF")
    page.wait_for_timeout(200)
    if not page.evaluate("() => window.__mm.foot().hover"):
        raise RuntimeError("the walker did not start hovering")
    page.evaluate("(agl) => { const f = window.__mm.foot(); window.__mm.setFootY(f.ground + agl - 1.7); }", shot.get("agl", FOOT_AGL[0]))
    page.evaluate("(dy) => window.__mm.footLook(0, dy)", -math.radians(shot.get("pitch_deg", 0)) / MOUSE_RAD)
    page.evaluate("() => window.__mm.footSim(0.1)")   # a few walker steps so the hover clamp and the eye settle


def clean_frame(page) -> None:
    page.evaluate("() => document.body.classList.add('hud-off')")
    page.add_style_tag(content=HIDE_CSS)
    page.evaluate(FRAMES)
    shown = visible_chrome(page)
    if shown:
        raise RuntimeError(f"still visible before the shot: {', '.join(shown)}")


def capture_shot(browser, base_url: str, shot: dict, args) -> list[Path]:
    import hermetic_api
    context = browser.new_context(viewport={"width": args.width, "height": args.height}, device_scale_factor=2, locale="en-US")
    hermetic_api.route_gallery(context)
    try:
        page = context.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        start_game(page, base_url, shot, args)
        stage(page, shot)
        clean_frame(page)
        wait_for_camera_arrival(page, shot)
        page.evaluate(FRAMES)
        if errors:
            raise RuntimeError(f"page error: {errors[0]}")
        return write_images(page, shot, args)
    finally:
        context.close()


def write_images(page, shot: dict, args) -> list[Path]:
    small, big = output_names(shot["id"], args.width)
    out = []
    for name, scale in ((small, "css"), (big, "device")):   # one frame, two sizes: DSF 2 gives 2x pixels, "css" gives 1x
        path = args.out / name
        page.screenshot(path=str(path), type="jpeg", quality=90, scale=scale, timeout=120000)
        out.append(path)
    return out


def serve(endpoint):
    """A static server for the repo root; on the LAN when the GPU browser is remote (like tests/conftest.py)."""
    import http.server
    import socket
    import threading
    from functools import partial
    import gpu_browser
    bind, host = gpu_browser.bind_for(endpoint)
    sock = socket.socket()
    sock.bind((bind, 0))
    port = sock.getsockname()[1]
    sock.close()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((bind, port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://{host}:{port}"


def run(selected: list[dict], args) -> list[str]:
    """Shoot every selected motif; returns the ids that failed."""
    import os
    from playwright.sync_api import sync_playwright
    import gpu_browser
    endpoint, warning = gpu_browser.resolve_endpoint(os.environ)
    if warning:
        print(warning, file=sys.stderr)
    httpd, base_url = serve(endpoint)
    failed = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(endpoint) if endpoint else p.chromium.launch(args=ARGS)
            for shot in selected:
                try:
                    files = capture_shot(browser, base_url, shot, args)
                    print(f"ok    {shot['id']}: {', '.join(f.name for f in files)}")
                except Exception as error:   # one dead page must not stop the others
                    failed.append(shot["id"])
                    print(f"FAIL  {shot['id']}: {error}", file=sys.stderr)
            browser.close()
    finally:
        httpd.shutdown()
    return failed


def parse_args(argv):
    ap = argparse.ArgumentParser(description="Shoot the curated screenshot gallery (#556).")
    ap.add_argument("--only", nargs="+", metavar="ID", help="retake only these motifs")
    ap.add_argument("--list", action="store_true", help="print the motif ids and exit")
    ap.add_argument("--readme", action="store_true", help="rewrite the README thumbnail block from shots.json and exit")
    ap.add_argument("--size", default="1920x1080", help="CSS viewport WxH; the big image is twice that (default 1920x1080 -> 3840x2160)")
    ap.add_argument("--out", type=Path, default=OUT_DIR, help="output folder (default docs/gallery)")
    ap.add_argument("--shots", type=Path, default=SHOTS_FILE, help="the shot list (default docs/gallery/shots.json)")
    ap.add_argument("--no-terrain", action="store_true", help="block the measured terrain (hand-made hills; the smoke test)")
    args = ap.parse_args(argv)
    match = re.fullmatch(r"(\d{2,5})x(\d{2,5})", args.size)
    if not match:
        ap.error("--size must look like 1920x1080")
    args.width, args.height = int(match[1]), int(match[2])
    return args


def main(argv=None) -> int:
    args = parse_args(argv)
    shots = load_shots(args.shots)
    errors = validate_shots(shots, region_ids(), load_landmarks())
    if errors:
        sys.exit("shots.json is invalid:\n  " + "\n  ".join(errors))
    if args.list:
        print("\n".join(f"{s['id']}\t{s['title']}" for s in shots))
        return 0
    if args.readme:
        README.write_text(splice_readme(README.read_text(encoding="utf-8"), readme_block(shots)), encoding="utf-8")
        print(f"README.md: {len(shots)} thumbnails")
        return 0
    selected = select_shots(shots, args.only)
    args.out.mkdir(parents=True, exist_ok=True)
    failed = run(selected, args)
    if failed:
        print(f"\n{len(failed)} of {len(selected)} failed. Retake: python scripts/shots.py --only {' '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())