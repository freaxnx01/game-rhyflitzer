#!/usr/bin/env python3
"""#875: a #900 camera path rendered frame by frame into a perfectly smooth H.264 video.

    python scripts/campath_video.py --path rhyflitzer-campath-20261111-120000.json
    python scripts/campath_video.py --path p.json --size 1280x720        # smaller canvas, faster capture
    python scripts/campath_video.py --path p.json --no-terrain          # like shots.py, even faster

The game freezes its real-time loop (__mm.stepped) and steps with __mm.tick at exactly
1/fps s per frame, so the video is smooth 60 fps even on a renderer that draws 2 fps (the
GPU browser). No sound (music is added in the YouTube editor); no HUD (the canvas only).
PW_CDP_ENDPOINT (tests/gpu_browser.py) selects the GPU browser; without it a local
SwiftShader Chromium is used. ffmpeg must be on the PATH.
"""
from __future__ import annotations

import argparse
import base64
import datetime
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))   # shots.py: the static server and the READY/LOADED waits
sys.path.insert(0, str(ROOT / "tests"))     # gpu_browser.py, hermetic_api.py

MIN_FPS = 10   # a tick may not jump more than 0.1 s (simclock.js), so 1/fps must stay inside


def frame_count(duration: float, fps: int) -> int:
    """Both ends included: a 1 s move at 60 fps is 61 frames, 0 s through 1 s."""
    if duration <= 0:
        raise ValueError(f"duration must be positive, got {duration}")
    return math.ceil(duration * fps) + 1


def ffmpeg_cmd(out: str, fps: int, crf: int) -> list[str]:
    """PNG frames on stdin -> H.264 yuv420p at exactly fps frames per second."""
    return ["ffmpeg", "-y", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "png", "-i", "-",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(crf), "-preset", "slow",
            "-movflags", "+faststart", out]


def png_bytes(data_url: str) -> bytes:
    """A __mm.tick grab ('data:image/png;base64,...') -> the raw PNG bytes."""
    prefix = "data:image/png;base64,"
    if not isinstance(data_url, str) or not data_url.startswith(prefix):
        head = data_url[:40] if isinstance(data_url, str) else type(data_url).__name__
        raise ValueError(f"not a PNG data URL: {head}")
    return base64.b64decode(data_url[len(prefix):])


def parse_size(text: str) -> tuple[int, int]:
    """'1920x1080' -> (1920, 1080): the fixed canvas of the capture (device scale 1)."""
    parts = text.lower().split("x")
    try:
        size = (int(parts[0]), int(parts[1])) if len(parts) == 2 else None
    except (ValueError, TypeError):
        size = None
    if size is None or not (2 <= size[0] <= 8192 and 2 <= size[1] <= 8192):
        raise argparse.ArgumentTypeError(f"--size must look like 1920x1080, got {text!r}")
    return size


def default_out(now) -> str:
    """rhyflitzer-campath-YYYYMMDD-hhmmss.mp4, stamped like the game's own export names."""
    return f"rhyflitzer-campath-{now:%Y%m%d-%H%M%S}.mp4"


def fail(message: str, code: int = 2) -> int:
    print(message, file=sys.stderr)
    return code


def parse_args(argv):
    ap = argparse.ArgumentParser(description="Render a camera path (#900) frame by frame into an H.264 video (#875).")
    ap.add_argument("--path", type=Path, required=True, help="the camera path JSON (rhyflitzer-campath v1)")
    ap.add_argument("--out", type=Path, default=None, help="output video (default rhyflitzer-campath-<stamp>.mp4 in the cwd)")
    ap.add_argument("--fps", type=int, default=60, help="frames per second of the video (default 60)")
    ap.add_argument("--crf", type=int, default=18, help="ffmpeg CRF quality, lower is better (default 18)")
    ap.add_argument("--size", type=parse_size, default=(1920, 1080), help="canvas size WxH (default 1920x1080; smaller is faster)")
    ap.add_argument("--no-terrain", action="store_true", help="block the measured terrain (like shots.py)")
    args = ap.parse_args(argv)
    if args.fps < MIN_FPS:
        ap.error(f"--fps must be at least {MIN_FPS}: one tick may not jump the game more than 0.1 s")
    if not (0 <= args.crf <= 51):
        ap.error("--crf must be within ffmpeg's 0-51")
    if args.out is None:
        args.out = Path(default_out(datetime.datetime.now()))
    return args


def read_path(path: Path):
    """The path file as JSON (for the region), or (None, a message) when unreadable."""
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except (OSError, json.JSONDecodeError) as e:
        return None, f"cannot read the camera path {path}: {e}"


def start_page(page, base_url: str, region, args):
    """Open the game in the path's region, start cruise and wait for the world (shots.py's waits)."""
    import shots
    query = f"?region={region}" if isinstance(region, str) and region else ""
    if args.no_terrain:
        page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{base_url}/index.html{query}")
    page.wait_for_function(shots.READY, timeout=shots.T)
    page.click("#cruisebtn", timeout=shots.T)
    page.wait_for_function(shots.LOADED, arg=not args.no_terrain, timeout=shots.T)
    page.keyboard.press("KeyV")   # hide the car: it would sit parked at the start point (A5)


def run(args) -> int:
    import gpu_browser
    import hermetic_api
    import shots
    from playwright.sync_api import sync_playwright

    endpoint, warning = gpu_browser.resolve_endpoint(os.environ)
    if warning:
        print(warning, file=sys.stderr)
    httpd, base_url = shots.serve(endpoint)
    width, height = args.size
    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(endpoint) if endpoint else p.chromium.launch(args=shots.ARGS)
            try:
                context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, locale="en-US")
                hermetic_api.route_gallery(context)
                page = context.new_page()
                errors: list[str] = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                start_page(page, base_url, args.region, args)
                loaded = page.evaluate("(text) => __mm.campath.load(text)", args.path.read_text(encoding="utf-8"))
                if not (isinstance(loaded, dict) and loaded.get("ok")):
                    return fail(f"{args.path} is not a camera path the game accepts: {loaded}")
                page.evaluate("() => __mm.stepped(true)")
                try:
                    page.evaluate("() => __mm.campath.play({ record: false })")
                    duration = page.evaluate("() => __mm.campath.state().duration")
                    frames = frame_count(duration, args.fps)
                    return capture(page, args, duration, frames, errors)
                finally:
                    try:   # a dead page must not mask the real failure
                        page.evaluate("() => { __mm.campath.stop(); __mm.stepped(false); }")
                    except Exception:
                        pass
            finally:
                browser.close()
    finally:
        httpd.shutdown()


def capture(page, args, duration: float, frames: int, errors: list[str]) -> int:
    """Tick the game frame by frame and pipe the PNGs into ffmpeg. Stepped mode is on."""
    print(f"{args.out}: {frames} frames, {duration:.2f} s of path at {args.fps} fps, canvas {args.size[0]}x{args.size[1]}", flush=True)
    ffmpeg = subprocess.Popen(ffmpeg_cmd(str(args.out), args.fps, args.crf), stdin=subprocess.PIPE)
    started = time.monotonic()
    try:
        for i in range(frames):
            ffmpeg.stdin.write(png_bytes(page.evaluate("(dt) => __mm.tick(dt, { grab: 'png' })", 1 / args.fps)))
            done = i + 1
            if done % 30 == 0 or done == frames:
                secs = time.monotonic() - started
                rate = done / secs if secs > 0 else 0.0
                eta = datetime.timedelta(seconds=round((frames - done) / rate)) if rate > 0 else "?"
                print(f"  frame {done}/{frames} ({done / frames:.0%}), {rate:.2f} frames/s, ETA {eta}", flush=True)
        ffmpeg.stdin.close()
    except BrokenPipeError:
        return fail(f"ffmpeg closed the pipe early (exit {ffmpeg.wait()}); no video was written", 1)
    if ffmpeg.wait() != 0:
        return fail(f"ffmpeg failed with exit code {ffmpeg.returncode}; no video was written", 1)
    if errors:
        return fail(f"page error during the capture: {errors[0]}", 1)
    print(f"{args.out} done in {datetime.timedelta(seconds=round(time.monotonic() - started))}", flush=True)
    return 0


def main(argv=None) -> int:
    args = parse_args(argv)
    if shutil.which("ffmpeg") is None:
        return fail("ffmpeg is not on the PATH (needed to encode H.264). Install it first, e.g. apt install ffmpeg.")
    path_json, message = read_path(args.path)
    if path_json is None:
        return fail(message)
    args.region = path_json.get("region") if isinstance(path_json, dict) else None
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
