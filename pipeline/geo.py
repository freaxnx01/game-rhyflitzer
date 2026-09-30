"""Game frame shared by all pipeline steps.

Game coordinates: metres in the Swiss LV95 frame (EPSG:2056), origin at a fixed lat/lon,
x = east, z = south. terrain.py (heights) and osm.py (world) must use the same frame.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from pyproj import Transformer

DEFAULT_BBOX = (7.905, 47.532, 8.030, 47.572)   # lon/lat: Bad Saeckingen west ... east of Sisseln
DEFAULT_ORIGIN = (47.5506, 7.9671)               # lat, lon (the prototype's world origin)

_TO_LV95 = Transformer.from_crs("EPSG:4326", "EPSG:2056", always_xy=True)
_TO_WGS = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)


@dataclass(frozen=True)
class Frame:
    lat: float
    lon: float
    e0: float = field(init=False)
    n0: float = field(init=False)

    def __post_init__(self):
        e0, n0 = _TO_LV95.transform(self.lon, self.lat)
        object.__setattr__(self, "e0", float(e0))
        object.__setattr__(self, "n0", float(n0))

    def lv95_to_game(self, E, N):
        """LV95 (E, N) -> game (x, z); x = east, z = south. Scalars or numpy arrays."""
        if np.ndim(E) or np.ndim(N):
            return np.asarray(E) - self.e0, -(np.asarray(N) - self.n0)
        return E - self.e0, -(N - self.n0)

    def to_game(self, lon, lat):
        E, N = _TO_LV95.transform(lon, lat)
        return self.lv95_to_game(E, N)

    def game_to_lonlat(self, x, z):
        E = np.asarray(x) + self.e0
        N = self.n0 - np.asarray(z)
        return _TO_WGS.transform(E, N)


def pad_bbox(bbox, metres: float):
    w, s, e, n = bbox
    dlat = metres / 111_320.0
    dlon = metres / (111_320.0 * math.cos(math.radians((s + n) / 2)))
    return (w - dlon, s - dlat, e + dlon, n + dlat)


def grid_for(bbox, frame: Frame, step: float) -> dict:
    """Heightmap grid snapped to whole steps relative to the game origin (same rule as terrain.py)."""
    corners = [_TO_LV95.transform(x, y) for x in (bbox[0], bbox[2]) for y in (bbox[1], bbox[3])]
    emin = min(c[0] for c in corners); emax = max(c[0] for c in corners)
    nmin = min(c[1] for c in corners); nmax = max(c[1] for c in corners)
    x0 = np.floor((emin - frame.e0) / step) * step
    x1 = np.ceil((emax - frame.e0) / step) * step
    znorth = -np.ceil((nmax - frame.n0) / step) * step
    zsouth = -np.floor((nmin - frame.n0) / step) * step
    return {"x0": float(x0), "z0": float(znorth),
            "w": int(round((x1 - x0) / step)) + 1, "h": int(round((zsouth - znorth) / step)) + 1}
