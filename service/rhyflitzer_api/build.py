"""#168: one build in its own process (python -m rhyflitzer_api.build ...), so the worker can time it out and the
memory cap kills only the build. Protocol on stdout: `STEP <name>` lines, then exactly one `RESULT {json}`;
logs go to stderr."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import requests

import frame
import region

from . import logs

log = logging.getLogger("rhyflitzer.build")


class TooComplex(Exception):
    pass


def emit(kind: str, payload: str) -> None:
    print(f"{kind} {payload}", flush=True)


def check_complexity(world: dict, max_buildings: int, max_road_points: int) -> None:
    buildings = len(world.get("buildings", []))
    points = sum(len(r.get("pts", [])) for r in world.get("roads", []))
    if buildings > max_buildings:
        raise TooComplex(f"{buildings} buildings (at most {max_buildings}); choose a smaller frame")
    if points > max_road_points:
        raise TooComplex(f"{points} road points (at most {max_road_points}); choose a smaller frame")


def classify(exc: Exception) -> tuple[str, str]:
    """(code, player-facing message) for a failed build."""
    if isinstance(exc, frame.FrameError):
        return exc.code, str(exc)
    if isinstance(exc, TooComplex):
        return "too-complex", f"This area is too complex: {exc}"
    if isinstance(exc, requests.RequestException):
        return "source-unreachable", "Data source unreachable, try again later"
    return "build-failed", "Build failed"


def parse(argv) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Build one generated world (worker subprocess, #168)")
    ap.add_argument("--id", required=True)
    ap.add_argument("--lv95", type=float, nargs=4, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--extract", type=Path, required=True)
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--tile-cache-bytes", type=float, default=1e9)
    ap.add_argument("--max-buildings", type=int, default=20_000)
    ap.add_argument("--max-road-points", type=int, default=50_000)
    return ap.parse_args(argv)


def build(a: argparse.Namespace) -> None:
    files = region.build_world(tuple(a.lv95), a.out, extract=a.extract, cache=a.cache,
                               progress=lambda step: emit("STEP", step), tile_cache_bytes=a.tile_cache_bytes)
    check_complexity(json.loads(files["world"].read_text("utf-8")), a.max_buildings, a.max_road_points)


def main(argv=None) -> int:
    logs.setup(stream=sys.stderr)
    a = parse(argv)
    log.info("Building world %s", a.id, extra=logs.fields(world=a.id, lv95=a.lv95))
    try:
        build(a)
    except Exception as exc:   # every failure must reach the worker as a RESULT line, with its cause logged
        code, message = classify(exc)
        log.warning("Building world %s failed: %s", a.id, code, exc_info=exc, extra=logs.fields(world=a.id, code=code))
        emit("RESULT", json.dumps({"ok": False, "error": code, "message": message}))
        return 1
    log.info("Built world %s", a.id, extra=logs.fields(world=a.id))
    emit("RESULT", json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
