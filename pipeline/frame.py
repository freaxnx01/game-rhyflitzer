"""#166: the frame of a generated world -- an LV95 rectangle (e0, n0, e1, n1), snapped to 250 m, 1-4 km a side,
entirely inside Switzerland."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import shapely
from pyproj import Transformer

GRID, MIN_SIDE, MAX_SIDE = 250.0, 1000.0, 4000.0
OUTLINE = Path(__file__).with_name("ch_outline.geojson")
_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
_TO_WGS = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)


class FrameError(ValueError):
    """A refused frame; `code` is bad-bbox, too-small, too-big or outside-ch."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def snap(e0: float, n0: float, e1: float, n1: float) -> tuple[float, float, float, float]:
    """Each edge to the nearest 250 m line; refuses sides under 1 km or over 4 km after snapping."""
    if not (e1 > e0 and n1 > n0):
        raise FrameError("bad-bbox", f"not a rectangle: {e0}, {n0}, {e1}, {n1}")
    rect = tuple(float(round(v / GRID) * GRID) for v in (e0, n0, e1, n1))
    w, h = rect[2] - rect[0], rect[3] - rect[1]
    if min(w, h) < MIN_SIDE:
        raise FrameError("too-small", f"frame {w:.0f} x {h:.0f} m: each side must be at least {MIN_SIDE:.0f} m")
    if max(w, h) > MAX_SIDE:
        raise FrameError("too-big", f"frame {w:.0f} x {h:.0f} m: each side must be at most {MAX_SIDE:.0f} m")
    return rect


def from_lonlat(w: float, s: float, e: float, n: float) -> tuple[float, float, float, float]:
    """The LV95 rectangle enclosing a lon/lat box (not snapped)."""
    xs, ys = _TO_LV95.transform([w, e, w, e], [s, s, n, n])
    return float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))


def lonlat_bbox(rect, pad: float = 0.0) -> tuple[float, float, float, float]:
    """(W, S, E, N) enclosing the rectangle grown by `pad` metres."""
    e0, n0, e1, n1 = rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad
    lons, lats = _TO_WGS.transform([e0, e1, e0, e1], [n0, n0, n1, n1])
    return tuple(round(float(v), 6) for v in (min(lons), min(lats), max(lons), max(lats)))


def origin(rect) -> tuple[float, float]:
    """(lat, lon) of the frame centre: the game origin of a generated world."""
    lon, lat = _TO_WGS.transform((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2)
    return round(float(lat), 6), round(float(lon), 6)


@lru_cache(maxsize=1)
def outline() -> shapely.Geometry:
    return shapely.geometry.shape(json.loads(OUTLINE.read_text(encoding="utf-8"))["geometry"])


def inside_switzerland(rect) -> bool:
    return bool(outline().contains(shapely.box(*rect)))


def check(rect) -> None:
    if not inside_switzerland(rect):
        raise FrameError("outside-ch", "the frame must lie entirely inside Switzerland")


def world_id(rect, version: str) -> str:
    """Same snapped frame + same pipeline version -> same id."""
    return hashlib.sha256("{:.0f},{:.0f},{:.0f},{:.0f}:{}".format(*rect, version).encode()).hexdigest()[:12]
