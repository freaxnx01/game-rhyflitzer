#!/usr/bin/env python3
"""#1248: the visual patrol -- place the car along a named route every ~25 m, screenshot each step with the debug panel,
build a video and 4x4 contact sheets, and write review.md for the /patrol review subagent.

    python scripts/patrol.py --route sisseln-eiken --out /tmp/patrol-xyz

PW_CDP_ENDPOINT (tests/gpu_browser.py) selects the GPU browser. ffmpeg must be on the PATH. No tokens, no CI.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))   # shots.py: the static server and the READY/LOADED waits
sys.path.insert(0, str(ROOT / "tests"))     # gpu_browser.py, hermetic_api.py

ROUTES = ROOT / "scripts" / "patrol_routes.json"
FPS = 2             # the video's frame rate, so one contact-sheet tile is exactly one frame
PROGRESS_EVERY = 10
SHOT_TIMEOUT_MS = 120000   # a page screenshot of the game is slow on a software renderer (shots.py uses the same)

TILES = 16   # 4x4 per contact sheet
TRIAGE_HEADER = "| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link |"


def load_route(routes: dict, route_id: str):
    if route_id not in routes:
        return None, f"unknown route {route_id!r}; known: {', '.join(sorted(routes))}"
    route = routes[route_id]
    if not (isinstance(route, dict) and route.get("from") and route.get("to")):
        return None, f"route {route_id!r} needs 'from' and 'to' destination names"
    return route, None


def stations(pts, step: float) -> list[dict]:
    """Points every step metres along the polyline (arc length across vertices), heading along the segment."""
    if step <= 0:
        raise ValueError(f"step must be positive, got {step}")
    out, run, nxt = [], 0.0, 0.0
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        length = math.hypot(x1 - x0, z1 - z0)
        if not length:
            continue
        th = math.atan2(z1 - z0, x1 - x0)
        while nxt <= run + length + 1e-9:
            u = (nxt - run) / length
            out.append({"x": x0 + (x1 - x0) * u, "z": z0 + (z1 - z0) * u, "th": th, "s": nxt})
            nxt += step
        run += length
    return out


def frame_of(sheet: int, tile: int) -> int:
    """Sheet k, tile t (row-major, both 1-based) -> frame number (1-based), one frame per tile."""
    return (sheet - 1) * TILES + tile


def video_cmd(frames_dir: str, out: str, fps: int) -> list[str]:
    return ["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", f"{frames_dir}/f-%04d.png",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]


def sheet_cmd(video: str, out_dir: str, fps: int) -> list[str]:
    return ["ffmpeg", "-v", "error", "-y", "-i", video, "-vf", f"fps={fps},scale=800:-1,tile=4x4", f"{out_dir}/sheet-%02d.jpg"]


def review_prompt(route_id: str, frames: int, sheets: list[str]) -> str:
    return "\n".join([
        f"# Patrol review: {route_id}",
        "",
        f"{frames} frames, one per tile, in {len(sheets)} contact sheets: {', '.join(sheets)}.",
        "Frame number = (sheet - 1) * 16 + tile (tiles row-major, both 1-based). The full frame is frames/f-NNNN.png;",
        "manifest.json gives each frame's x, z, LV95 E/N and heading.",
        "",
        "Look at every sheet. Open the full frame for anything suspicious. List world defects only: grass or field on",
        "the road, stray or coloured triangles, floating or sunken objects, holes in the ground, z-fighting, missing",
        "textures, walls or decks in the wrong place. Not: lighting taste, HUD layout, the car itself.",
        "",
        "Write findings.md in this directory: one row per anomaly in the /processing-test-feedback triage format,",
        "",
        TRIAGE_HEADER,
        "|---|---|---|---|---|---|---|",
        "",
        "Note = what and where (x/z and LV95 from manifest.json); Att. = the frame file; Disposition = a proposal only.",
        "No anomaly: write findings.md with the header and the line 'No anomalies.'.",
        "Do not file issues, do not edit TODO.md, do not change code.",
    ]) + "\n"


def parse_size(text: str) -> tuple[int, int]:
    import campath_video
    return campath_video.parse_size(text)


def fail(message: str, code: int = 1) -> int:
    print(message, file=sys.stderr)
    return code


def parse_args(argv):
    ap = argparse.ArgumentParser(description="Drive a named route and screenshot every step for a visual review (#1248).")
    ap.add_argument("--route", required=True, help=f"a route id from {ROUTES.name}")
    ap.add_argument("--out", type=Path, required=True, help="output directory (frames/, manifest.json, patrol.mp4, sheets, review.md)")
    ap.add_argument("--step", type=float, default=25, help="metres between stations (default 25)")
    ap.add_argument("--size", type=parse_size, default=(1280, 720), help="canvas size WxH (default 1280x720)")
    ap.add_argument("--limit", type=int, default=0, help="stop after N stations (default 0: the whole route)")
    ap.add_argument("--settle", type=int, default=4, help="drawn frames before each screenshot (default 4)")
    return ap.parse_args(argv)


# the key strip and the toasts sit over the debug panel's first lines; the Navi panel stays, it is part of what the
# review looks at (and so is the minimap)
COVER_CSS = "#keybar,#toast{visibility:hidden!important}"


def start_page(page, base_url: str):
    """Open the game with the debug panel on, start cruise and wait for the measured terrain (shots.py's waits)."""
    import shots
    page.goto(f"{base_url}/index.html?debug=1")
    page.wait_for_function(shots.READY, timeout=shots.T)
    page.click("#cruisebtn", timeout=shots.T)
    page.wait_for_function(shots.LOADED, arg=True, timeout=shots.T)
    page.add_style_tag(content=COVER_CSS)


def route_polyline(page, route: dict):
    """The Navi's planned polyline from the route's start to its goal, or (None, a message)."""
    for end in ("from", "to"):
        if page.evaluate("(name) => window.__mm.dest(name)", route[end]) is None:
            return None, f"no jump/Navi destination named {route[end]!r} ({end})"
    start = page.evaluate("(name) => window.__mm.dest(name)", route["from"])
    page.evaluate("([x, z]) => window.__mm.place(x, z)", [start["x"], start["z"]])
    if not page.evaluate("(name) => window.__mm.naviStart(name)", route["to"]):
        return None, f"no route from {route['from']!r} to {route['to']!r}"
    pts = page.evaluate("() => window.__mm.naviRoute()")
    if not pts or len(pts) < 2:
        return None, f"the Navi planned no polyline from {route['from']!r} to {route['to']!r}"
    return pts, None


def capture(page, args, pts) -> list[dict]:
    """Place the car at every station along the polyline and screenshot the whole page -- the DOM debug panel with x/z
    and LV95 has to be in the picture, so this is a page screenshot, not __mm.tick's canvas grab.

    The game's own loop keeps running (shots.py's pattern): a page screenshot waits for a compositor frame, and
    __mm.stepped freezes requestAnimationFrame, so no frame would ever arrive. A placement snaps the view (#895), so
    there is no camera easing to wait out -- `settle` drawn frames are enough."""
    import shots
    frames_dir = args.out / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    places = stations(pts, args.step)[:args.limit or None]
    print(f"{args.out}: {len(places)} stations every {args.step:g} m, canvas {args.size[0]}x{args.size[1]}", flush=True)
    manifest = []
    for i, st in enumerate(places, start=1):
        page.evaluate("([x, z, th]) => window.__mm.place(x, z, th)", [st["x"], st["z"], st["th"]])
        for _ in range(args.settle):
            page.evaluate(shots.FRAMES)
        page.screenshot(path=str(frames_dir / f"f-{i:04d}.png"), timeout=SHOT_TIMEOUT_MS)
        pos = page.evaluate("() => window.__mm.debug().pos")
        manifest.append({"i": i, "x": round(pos["x"], 1), "z": round(pos["z"], 1),
                         "E": None if pos["E"] is None else round(pos["E"], 1),
                         "N": None if pos["N"] is None else round(pos["N"], 1),
                         "th": round(st["th"], 3), "s": round(st["s"], 1)})
        if i % PROGRESS_EVERY == 0 or i == len(places):
            print(f"  frame {i}/{len(places)} ({i / len(places):.0%})", flush=True)
    return manifest


def build_video_and_sheets(out: Path) -> str | None:
    """patrol.mp4 from the frames and the 4x4 contact sheets from the video; a message when ffmpeg fails."""
    video = out / "patrol.mp4"
    for cmd in (video_cmd(str(out / "frames"), str(video), FPS), sheet_cmd(str(video), str(out), FPS)):
        done = subprocess.run(cmd, check=False)
        if done.returncode != 0:
            return f"ffmpeg failed ({done.returncode}): {' '.join(cmd)}"
    return None


def run(args, route: dict) -> int:
    import gpu_browser
    import hermetic_api
    import shots
    from playwright.sync_api import sync_playwright

    endpoint, warning = gpu_browser.resolve_endpoint(os.environ)
    if warning:
        print(warning, file=sys.stderr)
    httpd, base_url = shots.serve(endpoint)
    width, height = args.size
    errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(endpoint) if endpoint else p.chromium.launch(args=shots.ARGS)
            try:
                context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, locale="en-US")
                hermetic_api.route_gallery(context)
                page = context.new_page()
                page.on("pageerror", lambda e: errors.append(str(e)))
                start_page(page, base_url)
                pts, problem = route_polyline(page, route)
                if problem:
                    return fail(problem)
                manifest = capture(page, args, pts)
            finally:
                browser.close()
    finally:
        httpd.shutdown()
    if errors:
        return fail(f"the page reported {len(errors)} error(s): {errors[0]}")
    return write_outputs(args, manifest)


def write_outputs(args, manifest: list[dict]) -> int:
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    problem = build_video_and_sheets(args.out)
    if problem:
        return fail(problem)
    sheets = sorted(p.name for p in args.out.glob("sheet-*.jpg"))
    (args.out / "review.md").write_text(review_prompt(args.route, len(manifest), sheets), encoding="utf-8")
    print(f"{args.out}: {len(manifest)} frames, {len(sheets)} contact sheets, patrol.mp4, review.md", flush=True)
    return 0


def main(argv=None) -> int:
    args = parse_args(argv)
    if shutil.which("ffmpeg") is None:
        return fail("ffmpeg is not on the PATH")
    route, problem = load_route(json.loads(ROUTES.read_text(encoding="utf-8")), args.route)
    if problem:
        return fail(problem)
    return run(args, route)


if __name__ == "__main__":
    raise SystemExit(main())
