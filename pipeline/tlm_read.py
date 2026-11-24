#!/usr/bin/env python3
"""#1151: a streaming swissTLM3D reader -- PolyLine(Z) geometry plus the five attributes the bridge-height matcher
needs, read straight out of the 3.6 GB release zip with the stdlib. No GDAL, no new dependency.

The .shp and the .dbf of a layer hold their records in the same order, so both members are decompressed once, side by
side: the .shp drives (its per-record bbox is the filter), and the .dbf cursor is advanced to the kept indices only.
Nothing but the current record is held, so a CH-wide pass over the 2.1 M road records stays flat in memory.
"""
from __future__ import annotations

import argparse
import struct
import sys
import zipfile
from pathlib import Path

import requests

LAYERS = {"road": "swissTLM3D_TLM_STRASSE", "rail": "swissTLM3D_TLM_EISENBAHN"}
ATTRS = ("OBJEKTART", "KUNSTBAUTE", "STUFE", "STRNAME", "NAME")
URL = ("https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/swisstlm3d_{release}/"
       "swisstlm3d_{release}_2056_5728.shp.zip")
CHUNK = 1 << 20
POLYLINES = (3, 13, 23)      # PolyLine, PolyLineZ, PolyLineM


def _member(zf: zipfile.ZipFile, base: str, ext: str) -> str:
    """The layer's member, by file name: the release zip puts each layer in a folder, with backslash separators."""
    want = (base + ext).lower()
    for name in zf.namelist():
        if name.lower().replace("\\", "/").rsplit("/", 1)[-1] == want:
            return name
    raise KeyError(f"{want} not in {zf.filename}")


def _overlaps(box, bbox) -> bool:
    return box[0] <= bbox[2] and box[2] >= bbox[0] and box[1] <= bbox[3] and box[3] >= bbox[1]


def _parts(content: bytes):
    """PolyLine(Z/M) record content -> [[[E, N, Z], ...], ...]; E/N to 0.1 m, Z to 0.01 m, 0.0 for a 2D shape."""
    nparts, npoints = struct.unpack_from("<ii", content, 36)
    starts = list(struct.unpack_from(f"<{nparts}i", content, 44)) + [npoints]
    off = 44 + 4 * nparts
    xy = struct.unpack_from(f"<{2 * npoints}d", content, off)
    zoff = off + 16 * npoints + 16                                   # past the points, past the Z range
    has_z = struct.unpack_from("<i", content, 0)[0] == 13 and len(content) >= zoff + 8 * npoints
    z = struct.unpack_from(f"<{npoints}d", content, zoff) if has_z else (0.0,) * npoints
    return [[[round(xy[2 * i], 1), round(xy[2 * i + 1], 1), round(z[i], 2)] for i in range(starts[k], starts[k + 1])]
            for k in range(nparts)]


def _shapes(f, bbox):
    """Walk a .shp stream -> (idx, parts) for every polyline record, 0-based, bbox hits only."""
    f.read(100)
    idx = 0
    while True:
        head = f.read(8)
        if len(head) < 8:
            return
        content = f.read(2 * struct.unpack(">ii", head)[1])
        if struct.unpack_from("<i", content, 0)[0] in POLYLINES:
            if bbox is None or _overlaps(struct.unpack_from("<4d", content, 4), bbox):
                yield idx, _parts(content)
        idx += 1


class _Dbf:
    """A forward-only cursor over a .dbf stream: `at(idx)` skips to that record and decodes the ATTRS fields."""

    def __init__(self, f):
        self._f = f
        head = f.read(32)
        self.count, hlen, self.width = struct.unpack_from("<IHH", head, 4)
        self._fields = self._parse_fields(f.read(hlen - 32))
        self._next = 0

    @staticmethod
    def _parse_fields(block: bytes):
        fields, off = [], 1                       # every record starts with a deletion flag
        for i in range(0, len(block) - 31, 32):
            if block[i] == 0x0D:
                break
            name = block[i:i + 11].split(b"\0")[0].decode("ascii", "replace")
            if name in ATTRS:
                fields.append((name, off, block[i + 16]))
            off += block[i + 16]
        return fields

    def _skip(self, count: int) -> None:
        left = count * self.width
        while left > 0:
            left -= len(self._f.read(min(left, CHUNK)))

    def at(self, idx: int) -> dict:
        if idx < self._next:
            raise ValueError(f"dbf cursor is at {self._next}, cannot go back to {idx}")
        self._skip(idx - self._next)
        record = self._f.read(self.width)
        self._next = idx + 1
        return {name: record[off:off + size].decode("utf-8", "replace").strip() for name, off, size in self._fields}


def iter_features(zip_path, layer: str, bbox=None):
    """Features of one layer -> {"idx", "attrs", "parts"}; bbox is LV95 (emin, nmin, emax, nmax) or None for all of CH."""
    base = LAYERS[layer]
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(_member(zf, base, ".shp")) as shp, zf.open(_member(zf, base, ".dbf")) as dbf:
            attrs = _Dbf(dbf)
            for idx, parts in _shapes(shp, bbox):
                read = attrs.at(idx)
                yield {"idx": idx, "attrs": {k: read.get(k, "") for k in ATTRS}, "parts": parts}


def download(release: str, dest_dir) -> Path:
    """Stream the release zip (3.6 GB) into dest_dir, which must be a temp dir -- never the repo."""
    url = URL.format(release=release)
    dest = Path(dest_dir) / f"swisstlm3d_{release}_2056_5728.shp.zip"
    print(f"downloading {url} -> {dest}", file=sys.stderr, flush=True)
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as out:
            for chunk in r.iter_content(CHUNK):
                out.write(chunk)
    print(f"downloaded {dest.stat().st_size / 1e9:.2f} GB", file=sys.stderr, flush=True)
    return dest


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="download a swissTLM3D release zip into a directory")
    ap.add_argument("--release", default="2026-02")
    ap.add_argument("--dest", required=True, type=Path, help="a temp directory; the zip is never kept in the repo")
    a = ap.parse_args(argv)
    print(download(a.release, a.dest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
