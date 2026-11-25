"""#1151: a tiny swissTLM3D-shaped shapefile zip for the reader tests -- PolyLineZ (.shp) plus its attributes (.dbf),
laid out like the release zip: one folder per layer, backslash separators, UTF-8 DBF, an M range and array after Z."""
import struct
import zipfile
from pathlib import Path

FIELDS = ("OBJEKTART", "KUNSTBAUTE", "STUFE", "STRNAME", "NAME")
FIELD_LEN = 50


def _polylinez(parts) -> bytes:
    pts = [p for part in parts for p in part]
    starts, n = [], 0
    for part in parts:
        starts.append(n)
        n += len(part)
    out = [struct.pack("<i", 13),
           struct.pack("<4d", min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)),
           struct.pack("<ii", len(parts), len(pts)),
           struct.pack(f"<{len(parts)}i", *starts),
           struct.pack(f"<{2 * len(pts)}d", *[c for p in pts for c in p[:2]]),
           struct.pack("<2d", min(p[2] for p in pts), max(p[2] for p in pts)),
           struct.pack(f"<{len(pts)}d", *[p[2] for p in pts]),
           struct.pack("<2d", 0.0, 0.0),
           struct.pack(f"<{len(pts)}d", *([0.0] * len(pts)))]
    return b"".join(out)


def _shp_file(records) -> bytes:
    body = b"".join(struct.pack(">ii", i, len(c) // 2) + c
                    for i, c in enumerate((_polylinez(parts) for _, parts in records), start=1))
    pts = [p for _, parts in records for part in parts for p in part]
    head = bytearray(100)
    struct.pack_into(">i", head, 0, 9994)
    struct.pack_into(">i", head, 24, (100 + len(body)) // 2)
    struct.pack_into("<ii", head, 28, 1000, 13)
    struct.pack_into("<4d", head, 36, min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
    struct.pack_into("<2d", head, 68, min(p[2] for p in pts), max(p[2] for p in pts))
    return bytes(head) + body


def _dbf_file(records) -> bytes:
    head = bytearray(32)
    head[0] = 0x03
    struct.pack_into("<IHH", head, 4, len(records), 32 + 32 * len(FIELDS) + 1, 1 + FIELD_LEN * len(FIELDS))
    for name in FIELDS:
        field = bytearray(32)
        field[0:len(name)] = name.encode()
        field[11] = ord("C")
        field[16] = FIELD_LEN
        head += field
    head += b"\x0d"
    rows = [b" " + b"".join(str(attrs.get(k, "")).encode("utf-8")[:FIELD_LEN].ljust(FIELD_LEN) for k in FIELDS)
            for attrs, _ in records]
    return bytes(head) + b"".join(rows) + b"\x1a"


def write_zip(path, layer_base, records) -> Path:
    """Write one layer into a zip, appending to an existing one; records = [(attrs, parts)], parts = [[(E, N, Z), ...], ...]."""
    path = Path(path)
    folder = "TLM_OEV" if "EISENBAHN" in layer_base else "TLM_STRASSEN"
    with zipfile.ZipFile(path, "a" if path.exists() else "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{folder}\\{layer_base}.shp", _shp_file(records))
        zf.writestr(f"{folder}\\{layer_base}.dbf", _dbf_file(records))
    return path
