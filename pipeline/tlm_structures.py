#!/usr/bin/env python3
"""#1151, one-off: every bridge and underpass axis of Switzerland, cut out of the swissTLM3D release zip
(swissTLM3D (c) swisstopo, Open Government Data, Quellenangabe Pflicht) into tlm_structures.json.gz -- committed next
to this script and rerun per data release, like ch_outline.py / ch_outline.geojson.

    python pipeline/tlm_structures.py --release 2026-02 [--zip PATH] [--out PATH]

Structures are the records TLM marks as a real KUNSTBAUTE. Partners are the records that cross one, clipped to the 40 m
around it: they carry what passes under a bridge, which TLM itself files as KUNSTBAUTE = Keine.
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import tlm_read

RELEASE = "2026-02"
SOURCE = "swissTLM3D © swisstopo"
SKIP = {"Keine", "Treppe", "k_W", "in/auf Gebaeude"}     # A-C3, literal: everything else is a structure
PARTNER_CLIP = 40.0                                      # a partner keeps only the vertices this near a structure
GRID = 100.0                                             # cell size of the structure-segment index
DEFAULT = Path(__file__).with_name("tlm_structures.json.gz")


def _cells(e0: float, n0: float, e1: float, n1: float):
    for i in range(int(e0 // GRID), int(e1 // GRID) + 1):
        for j in range(int(n0 // GRID), int(n1 // GRID) + 1):
            yield i, j


def _segment_cells(a, b):
    return _cells(min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))


def _side(p, q, r) -> float:
    """Twice the signed area of p-q-r: > 0 when r is left of p->q."""
    return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])


def _crosses(a, b, c, d) -> bool:
    """A proper 2D crossing of the segments ab and cd: each one strictly separates the other's ends. Touching at a
    shared vertex is not a crossing -- the road leaving a bridge joins its axis, it does not pass under it."""
    return _side(c, d, a) * _side(c, d, b) < 0 and _side(a, b, c) * _side(a, b, d) < 0


class _Index:
    """The structure axes of both layers: a GRID of their segments, and a PARTNER_CLIP grid of their vertices."""

    def __init__(self):
        self._segments = defaultdict(list)
        self._vertices = defaultdict(list)

    def add(self, parts) -> None:
        for part in parts:
            for a, b in zip(part, part[1:]):
                for cell in _segment_cells(a, b):
                    self._segments[cell].append((a, b))
            for v in part:
                self._vertices[(int(v[0] // PARTNER_CLIP), int(v[1] // PARTNER_CLIP))].append(v)

    def crossed_by(self, parts) -> bool:
        for part in parts:
            for a, b in zip(part, part[1:]):
                for cell in _segment_cells(a, b):
                    for c, d in self._segments.get(cell, ()):
                        if _crosses(a, b, c, d):
                            return True
        return False

    def near(self, v) -> bool:
        i, j = int(v[0] // PARTNER_CLIP), int(v[1] // PARTNER_CLIP)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for s in self._vertices.get((i + di, j + dj), ()):
                    if (s[0] - v[0]) ** 2 + (s[1] - v[1]) ** 2 <= PARTNER_CLIP ** 2:
                        return True
        return False


def _clip(parts, index: _Index):
    """The runs of consecutive vertices within PARTNER_CLIP of a structure vertex; a run of one vertex is no line."""
    out, run = [], []
    for part in parts:
        for v in part:
            if index.near(v):
                run.append(v)
                continue
            if len(run) >= 2:
                out.append(run)
            run = []
        if len(run) >= 2:
            out.append(run)
        run = []
    return out


def _stufe(attrs: dict) -> int:
    try:
        return int(attrs["STUFE"])
    except ValueError:
        return 0


def _feature(layer: str, attrs: dict, parts) -> dict:
    return {"l": layer, "k": attrs["KUNSTBAUTE"], "s": _stufe(attrs), "o": attrs["OBJEKTART"],
            "n": attrs["STRNAME"] or attrs["NAME"], "p": parts}


def build(zip_path, release: str = RELEASE) -> dict:
    """The TLMS1 document: the structures of both layers, then every record that crosses one, clipped around it."""
    index, structures, partners = _Index(), [], []
    for layer in tlm_read.LAYERS:
        print(f"reading the {layer} structures of {Path(zip_path).name}", file=sys.stderr, flush=True)
        kept = 0
        for feature in tlm_read.iter_features(zip_path, layer):
            if feature["attrs"]["KUNSTBAUTE"] in SKIP:
                continue
            structures.append(_feature(layer, feature["attrs"], feature["parts"]))
            index.add(feature["parts"])
            kept += 1
        print(f"kept {kept} {layer} structures", file=sys.stderr, flush=True)
    for layer in tlm_read.LAYERS:
        print(f"reading the {layer} records that cross one", file=sys.stderr, flush=True)
        kept = 0
        for feature in tlm_read.iter_features(zip_path, layer):
            if feature["attrs"]["KUNSTBAUTE"] not in SKIP or not index.crossed_by(feature["parts"]):
                continue
            parts = _clip(feature["parts"], index)
            if not parts:
                continue
            partners.append(_feature(layer, feature["attrs"], parts))
            kept += 1
        print(f"kept {kept} {layer} partners", file=sys.stderr, flush=True)
    return {"format": "TLMS1", "release": release, "source": SOURCE, "structures": structures, "partners": partners}


def write(doc: dict, path) -> None:
    """Gzipped TLMS1, without the name and timestamp gzip would otherwise put in the header: a rebuild is byte-equal."""
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(path, "wb") as out, gzip.GzipFile(filename="", fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(raw)


def load(path=DEFAULT) -> dict | None:
    """The committed extract, or None when it is not there -- a world build then keeps today's heights."""
    path = Path(path)
    if not path.exists():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--release", default=RELEASE)
    ap.add_argument("--zip", type=Path, help="an already downloaded release zip; without it it is streamed into a temp dir")
    ap.add_argument("--out", type=Path, default=DEFAULT)
    a = ap.parse_args(argv)
    if a.zip:
        doc = build(a.zip, a.release)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            doc = build(tlm_read.download(a.release, tmp), a.release)
    write(doc, a.out)
    vertices = sum(len(part) for key in ("structures", "partners") for f in doc[key] for part in f["p"])
    print(f"wrote {a.out} ({a.out.stat().st_size / 1e6:.1f} MB): {len(doc['structures'])} structures, "
          f"{len(doc['partners'])} partners, {vertices} vertices")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
