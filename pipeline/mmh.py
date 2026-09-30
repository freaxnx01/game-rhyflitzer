"""Map Madness Heightmap (.mmh): "MMH1" | uint32 LE header length | header JSON | float32 LE heights."""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np


def write_mmh(path: Path, header: dict, heights: np.ndarray) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    hj = json.dumps(header, separators=(",", ":")).encode()
    hj += b" " * ((-(8 + len(hj))) % 4)             # keep float32 data 4-byte aligned
    with open(path, "wb") as f:
        f.write(b"MMH1")
        f.write(struct.pack("<I", len(hj)))
        f.write(hj)
        f.write(heights.astype("<f4").tobytes())
    print(f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB), heights {header.get('min', 0):.1f} .. "
          f"{header.get('max', 0):.1f} m above base", file=sys.stderr, flush=True)


def read_mmh(path: Path):
    buf = Path(path).read_bytes()
    if buf[:4] != b"MMH1":
        raise ValueError(f"{path}: not a Map Madness heightmap (MMH1)")
    n = struct.unpack("<I", buf[4:8])[0]
    hdr = json.loads(buf[8:8 + n])
    heights = np.frombuffer(buf, "<f4", count=hdr["w"] * hdr["h"], offset=8 + n).reshape(hdr["h"], hdr["w"])
    return hdr, heights


def sample(hdr: dict, heights: np.ndarray, x: float, z: float) -> float:
    fx = (x - hdr["x0"]) / hdr["step"]
    fz = (z - hdr["z0"]) / hdr["step"]
    i = int(np.clip(np.floor(fx), 0, hdr["w"] - 2)); j = int(np.clip(np.floor(fz), 0, hdr["h"] - 2))
    tx = float(np.clip(fx - i, 0, 1)); tz = float(np.clip(fz - j, 0, 1))
    a, b = heights[j, i], heights[j, i + 1]
    c, d = heights[j + 1, i], heights[j + 1, i + 1]
    return float((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz)
