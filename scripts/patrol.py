#!/usr/bin/env python3
"""#1248: the visual patrol -- place the car along a named route every ~25 m, screenshot each step with the debug panel,
build a video and 4x4 contact sheets, and write review.md for the /patrol review subagent.

    python scripts/patrol.py --route sisseln-eiken --out /tmp/patrol-xyz

PW_CDP_ENDPOINT (tests/gpu_browser.py) selects the GPU browser. ffmpeg must be on the PATH. No tokens, no CI.
"""
from __future__ import annotations

import math

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
