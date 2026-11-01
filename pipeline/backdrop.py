#!/usr/bin/env python3
"""Map Madness pipeline: the horizon backdrop (#593).

A coarse height grid around the play area -- Hotzenwald, Dinkelberg, Jura, the Rhine valley -- that the game draws
as a hazy, non-drivable silhouette behind the world. Same MMH1 format as terrain.py; extra header fields
`kind: "backdrop"` and `hole` (the play-area extent [x0, z0, x1, z1] in game metres).

Source: Copernicus DEM GLO-30 (anonymous COG range reads from the AWS Open Data bucket).
Licence notice (adapted data): produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence
and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

    python backdrop.py --terrain ../data/terrain_hochrhein.mmh --out ../data/backdrop_hochrhein.mmh
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

import mmh

STEP = 250.0
PAD = 18000.0
SOURCE = "Copernicus DEM GLO-30 (c) DLR e.V. 2010-2014, Airbus Defence and Space GmbH 2014-2018, EU/ESA"


def play_extent(play_hdr) -> list[float]:
    x1 = play_hdr["x0"] + (play_hdr["w"] - 1) * play_hdr["step"]
    z1 = play_hdr["z0"] + (play_hdr["h"] - 1) * play_hdr["step"]
    return [float(play_hdr["x0"]), float(play_hdr["z0"]), float(x1), float(z1)]


def grid(play_hdr, step: float = STEP, pad: float = PAD) -> dict:
    hx0, hz0, hx1, hz1 = play_extent(play_hdr)
    x0 = math.floor((hx0 - pad) / step) * step
    z0 = math.floor((hz0 - pad) / step) * step
    x1 = math.ceil((hx1 + pad) / step) * step
    z1 = math.ceil((hz1 + pad) / step) * step
    return {"x0": float(x0), "z0": float(z0), "w": int(round((x1 - x0) / step)) + 1,
            "h": int(round((z1 - z0) / step)) + 1, "step": float(step), "hole": [hx0, hz0, hx1, hz1]}


def hole_masks(g):
    xs = g["x0"] + np.arange(g["w"]) * g["step"]
    zs = g["z0"] + np.arange(g["h"]) * g["step"]
    hx0, hz0, hx1, hz1 = g["hole"]
    inside = ((zs[:, None] >= hz0) & (zs[:, None] <= hz1)) & ((xs[None, :] >= hx0) & (xs[None, :] <= hx1))
    padded = np.pad(inside, 1, constant_values=False)
    deep = inside.copy()
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            deep &= padded[1 + dj:1 + dj + inside.shape[0], 1 + di:1 + di + inside.shape[1]]
    return xs, zs, deep, inside & ~deep


def heights(g, play_hdr, play_h, dem_at, base: float) -> np.ndarray:
    xs, zs, deep, rim = hole_masks(g)
    X, Z = np.meshgrid(xs, zs)
    out = np.asarray(dem_at(X, Z), dtype=np.float64) - base
    for j, i in zip(*np.nonzero(rim)):
        out[j, i] = mmh.sample(play_hdr, play_h, float(X[j, i]), float(Z[j, i]))
    out[deep] = np.nan
    return out.astype(np.float32)


def header(g, play_hdr, out, bbox, sources) -> dict:
    return {"w": g["w"], "h": g["h"], "step": g["step"], "x0": g["x0"], "z0": g["z0"],
            "origin": play_hdr["origin"], "base": play_hdr["base"],
            "min": float(np.nanmin(out)), "max": float(np.nanmax(out)), "bbox": [float(v) for v in bbox],
            "hole": g["hole"], "kind": "backdrop", "sources": list(sources)}
