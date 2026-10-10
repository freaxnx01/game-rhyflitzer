#!/usr/bin/env python3
"""
fetch_landmarks.py — swissBUILDINGS3D 3.0 → GLB für Rhyflitzer

Liest landmarks.yaml, sucht pro Landmark die passende swisstopo-Kachel über
die STAC-API, lädt das CityGML, wählt die Objekte per Punkt-im-Grundriss bzw.
Polygon, prüft sie gegen `expect`, rechnet sie in Spielkoordinaten um und
schreibt GLB, index.json, landmarks.lock.json und CREDITS.md.

Achsen:  three.js  x = E - origin.e,  y = H - origin.h,  z = -(N - origin.n)
         (echte Rotation, Winding bleibt erhalten; 1 Einheit = 1 Meter)

Aufrufe:
  python fetch_landmarks.py --config landmarks.yaml --inspect
  python fetch_landmarks.py --config landmarks.yaml
  python fetch_landmarks.py --config landmarks.yaml --only holzbruecke-saeckingen
  python fetch_landmarks.py --config landmarks.yaml --local-gml tile.gml   # ohne Download
  python fetch_landmarks.py ... --draco      # nach Export mit gltf-transform komprimieren
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import requests
import trimesh
import yaml
from lxml import etree
from mapbox_earcut import triangulate_float64
from pyproj import Transformer
from shapely.geometry import Point, Polygon as ShpPolygon, box
from shapely.ops import unary_union

STAC_ROOT = "https://data.geo.admin.ch/api/stac/v0.9"
COLLECTION = "ch.swisstopo.swissbuildings3d_3_0"
GML_ZIP_TYPE = "application/x.gml+zip"
ATTRIBUTION = "swissBUILDINGS3D 3.0 © swisstopo (https://www.swisstopo.admin.ch), Open Government Data, Quellenangabe Pflicht"

GML = "http://www.opengis.net/gml"
# Top-Level-Objekte, die als eigenständige Landmarks in Frage kommen.
CANDIDATE_TAGS = {"Building", "Bridge", "BuildingPart", "BridgePart", "GenericCityObject"}

TO_WGS84 = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)


def die(msg: str) -> None:
    print(f"FEHLER: {msg}", file=sys.stderr)
    sys.exit(1)


def local(tag) -> str:
    return etree.QName(tag).localname if isinstance(tag, str) else ""


# ---------------------------------------------------------------- Konfiguration

def load_config(path: Path) -> dict:
    cfg = yaml.safe_load(path.read_text(encoding="utf-8"))
    o = cfg.get("origin") or {}
    for k in ("e", "n", "h"):
        if not isinstance(o.get(k), (int, float)):
            die(f"origin.{k} fehlt oder ist kein Zahlenwert ({o.get(k)!r}). "
                "Nullpunkt in LV95 setzen, z.B. Dorfplatz Sisseln.")
    if cfg.get("crs", "EPSG:2056") != "EPSG:2056":
        die("Nur crs: EPSG:2056 (LV95) wird unterstützt.")
    for lm in cfg.get("landmarks", []):
        sel = lm.get("select") or {}
        if not ("point" in sel or "polygon" in sel):
            die(f"Landmark {lm.get('id')}: select braucht 'point' oder 'polygon'.")
        if lm.get("mode", "block") not in ("block", "hero"):
            die(f"Landmark {lm.get('id')}: mode muss 'block' oder 'hero' sein.")
    return cfg


def selection_area(lm: dict):
    sel = lm["select"]
    if "polygon" in sel:
        pts = sel["polygon"]
        if len(pts) < 3:
            die(f"{lm['id']}: polygon braucht mindestens 3 Punkte.")
        return ShpPolygon(pts)
    e, n = sel["point"]
    return Point(e, n)


# ---------------------------------------------------------------- STAC + Download

def stac_tiles_for(area, pad_m: float = 50.0) -> list[dict]:
    """Neueste gekachelte CityGML-Assets, die `area` abdecken (eins pro Kachel)."""
    minx, miny, maxx, maxy = area.buffer(pad_m).bounds
    lon0, lat0 = TO_WGS84.transform(minx, miny)
    lon1, lat1 = TO_WGS84.transform(maxx, maxy)
    url = f"{STAC_ROOT}/collections/{COLLECTION}/items"
    params = {"bbox": f"{lon0},{lat0},{lon1},{lat1}", "limit": 100}

    best: dict[str, dict] = {}
    while url:
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        for feat in data.get("features", []):
            m = re.search(r"_(\d{4})_(\d{4}-\d{2})$", feat["id"])
            if not m:
                continue  # fullcoverage-Items (ganze Schweiz) ignorieren
            year, tile = m.group(1), m.group(2)
            for key, a in feat.get("assets", {}).items():
                if a.get("type") == GML_ZIP_TYPE and a.get("geoadmin:variant") == "tiled":
                    cand = {"item": feat["id"], "tile": tile, "year": year, "asset": key,
                            "href": a["href"], "multihash": a.get("checksum:multihash")}
                    if tile not in best or year > best[tile]["year"]:
                        best[tile] = cand
        url = next((l["href"] for l in data.get("links", []) if l.get("rel") == "next"), None)
        params = None  # next-Link enthält die Parameter bereits
    return sorted(best.values(), key=lambda c: c["tile"])


def verify_multihash(path: Path, mh: str | None) -> None:
    if not mh:
        print(f"  WARNUNG: keine Prüfsumme für {path.name}")
        return
    if not mh.startswith("1220"):
        print(f"  WARNUNG: unbekanntes Multihash-Format {mh[:4]}, übersprungen")
        return
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    if h.hexdigest().lower() != mh[4:].lower():
        path.unlink(missing_ok=True)
        die(f"Prüfsumme stimmt nicht für {path.name} — Datei gelöscht, bitte erneut ausführen.")


def fetch_tile(t: dict, cache: Path) -> list[Path]:
    d = cache / t["item"]
    d.mkdir(parents=True, exist_ok=True)
    z = d / t["asset"]
    if not z.exists():
        print(f"  lade {t['asset']} …")
        with requests.get(t["href"], stream=True, timeout=300) as r:
            r.raise_for_status()
            tmp = z.with_suffix(".part")
            with tmp.open("wb") as f:
                shutil.copyfileobj(r.raw, f)
            tmp.rename(z)
    verify_multihash(z, t["multihash"])
    out = d / "extracted"
    if not out.exists():
        with zipfile.ZipFile(z) as zf:
            for name in zf.namelist():  # Zip-Slip verhindern
                target = (out / name).resolve()
                if not str(target).startswith(str(out.resolve())):
                    die(f"Unsicherer Pfad im Archiv: {name}")
            zf.extractall(out)
    gmls = sorted(out.rglob("*.gml"))
    if not gmls:
        die(f"Kein .gml in {z.name} gefunden.")
    return gmls


# ---------------------------------------------------------------- CityGML parsen

@dataclass
class CityObject:
    gml_id: str
    kind: str
    attrs: dict = field(default_factory=dict)
    rings: list = field(default_factory=list)  # je Polygon: [exterior(N,3), *holes]

    @property
    def zmax(self) -> float:
        return max(float(r[:, 2].max()) for poly in self.rings for r in poly)

    @property
    def zmin(self) -> float:
        return min(float(r[:, 2].min()) for poly in self.rings for r in poly)

    def footprint(self):
        parts = []
        for poly in self.rings:
            p = ShpPolygon(poly[0][:, :2])
            if p.is_valid and p.area > 0.01:  # senkrechte Wände haben 2D-Fläche ~0
                parts.append(p)
        return unary_union(parts) if parts else None


def _coords(ring_el) -> np.ndarray | None:
    pl = ring_el.find(f".//{{{GML}}}posList")
    if pl is not None and pl.text:
        dim = int(pl.get("srsDimension", "3"))
        v = np.array(pl.text.split(), dtype=float)
        return v.reshape(-1, dim)[:, :3] if dim >= 3 else None
    pos = ring_el.findall(f".//{{{GML}}}pos")
    if pos:
        return np.array([[float(x) for x in p.text.split()][:3] for p in pos])
    return None


def _attrs(obj) -> dict:
    out = {}
    for el in obj.iter():
        ln = local(el.tag)
        if ln.endswith("Attribute") and el.get("name"):  # gen:stringAttribute etc.
            val = el.find("{*}value")
            out[el.get("name")] = val.text if val is not None else None
        elif ln in ("measuredHeight", "function", "class", "usage", "roofType",
                    "storeysAboveGround", "name"):
            if el.text and el.text.strip():
                out.setdefault(ln, el.text.strip())
    return out


def parse_gml(path: Path) -> list[CityObject]:
    objs = []
    for _, el in etree.iterparse(str(path), events=("end",), huge_tree=True):
        if local(el.tag) != "cityObjectMember":
            continue
        for obj in el:
            kind = local(obj.tag)
            if kind not in CANDIDATE_TAGS:
                continue
            co = CityObject(obj.get(f"{{{GML}}}id") or "?", kind, _attrs(obj))
            for poly in obj.iter(f"{{{GML}}}Polygon"):
                ext = poly.find(f"{{{GML}}}exterior")
                if ext is None:
                    continue
                e = _coords(ext)
                if e is None or len(e) < 3:
                    continue
                holes = [h for h in (_coords(i) for i in poly.findall(f"{{{GML}}}interior"))
                         if h is not None and len(h) >= 3]
                co.rings.append([e, *holes])
            if co.rings:
                objs.append(co)
        el.clear()
        while el.getprevious() is not None:
            del el.getparent()[0]
    return objs


# ---------------------------------------------------------------- Auswahl + Prüfung

def select(objs: list[CityObject], lm: dict) -> list[CityObject]:
    area = selection_area(lm)
    egids = {str(x) for x in (lm["select"].get("egids") or [])}
    hits = []
    for o in objs:
        fp = o.footprint()
        if fp is None:
            continue
        if isinstance(area, Point):
            ok = fp.buffer(0.5).contains(area)       # 0.5 m Toleranz für Klickgenauigkeit
        else:
            ok = area.contains(fp.representative_point())
        if ok and egids:
            ok = str(o.attrs.get("EGID", o.attrs.get("egid", ""))) in egids
        if ok:
            hits.append(o)
    return hits


def check_expect(hits: list[CityObject], lm: dict) -> list[str]:
    exp = lm.get("expect") or {}
    tol = float(exp.get("tolerance_m", 1.0))
    errs = []
    if isinstance(selection_area(lm), Point) and len(hits) != 1:
        errs.append(f"Punkt trifft {len(hits)} Objekte statt genau 1")
    if "typ" in exp:
        want = str(exp["typ"]).casefold()
        for o in hits:
            if not any(str(v).casefold() == want for v in o.attrs.values() if v is not None):
                errs.append(f"{o.gml_id}: kein Attribut mit Wert '{exp['typ']}' "
                            f"(vorhanden: {o.attrs})")
    if "roof_max" in exp and hits:
        z = max(o.zmax for o in hits)
        if abs(z - float(exp["roof_max"])) > tol:
            errs.append(f"Dachhöhe {z:.2f} weicht von erwartet {exp['roof_max']} ab (±{tol})")
    if "min_count" in exp and len(hits) < int(exp["min_count"]):
        errs.append(f"nur {len(hits)} Objekte, erwartet mindestens {exp['min_count']}")
    return errs


# ---------------------------------------------------------------- Mesh + Export

def _triangulate(poly: list[np.ndarray]):
    """Planares 3D-Polygon (mit Löchern) → Dreiecke in 3D."""
    ext = poly[0]
    if np.allclose(ext[0], ext[-1]):
        poly = [r[:-1] if np.allclose(r[0], r[-1]) else r for r in poly]
    pts = np.vstack(poly)
    if len(poly[0]) < 3:
        return None, None
    # Newell-Normale → auf dominante Ebene projizieren
    r = poly[0]
    nrm = np.zeros(3)
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        nrm += [(a[1] - b[1]) * (a[2] + b[2]),
                (a[2] - b[2]) * (a[0] + b[0]),
                (a[0] - b[0]) * (a[1] + b[1])]
    if np.linalg.norm(nrm) < 1e-9:
        return None, None
    drop = int(np.argmax(np.abs(nrm)))
    keep = [i for i in range(3) if i != drop]
    ends = np.cumsum([len(x) for x in poly]).astype(np.uint32)
    tri = triangulate_float64(pts[:, keep], ends).reshape(-1, 3)
    if len(tri) == 0:
        return None, None
    # Winding an Newell-Normale angleichen
    a, b, c = pts[tri[0]]
    if np.dot(np.cross(b - a, c - a), nrm) < 0:
        tri = tri[:, ::-1]
    return pts, tri


def to_mesh(o: CityObject, origin: dict) -> trimesh.Trimesh | None:
    vs, fs, off = [], [], 0
    for poly in o.rings:
        p, t = _triangulate(poly)
        if p is None:
            continue
        vs.append(p)
        fs.append(t + off)
        off += len(p)
    if not vs:
        return None
    v = np.vstack(vs)
    game = np.column_stack([v[:, 0] - origin["e"],
                            v[:, 2] - origin["h"],
                            -(v[:, 1] - origin["n"])])
    m = trimesh.Trimesh(vertices=game, faces=np.vstack(fs), process=True)
    m.metadata["name"] = o.gml_id
    return m


def export_glb(hits: list[CityObject], origin: dict, out: Path) -> dict:
    scene = trimesh.Scene()
    for o in hits:
        m = to_mesh(o, origin)
        if m is not None:
            scene.add_geometry(m, node_name=o.gml_id, geom_name=o.gml_id)
    if not scene.geometry:
        die(f"Keine Geometrie für {out.name} erzeugt.")
    out.parent.mkdir(parents=True, exist_ok=True)
    scene.export(out)
    lo, hi = scene.bounds
    return {"min": [round(float(x), 2) for x in lo], "max": [round(float(x), 2) for x in hi],
            "triangles": int(sum(len(g.faces) for g in scene.geometry.values()))}


def draco(path: Path) -> None:
    tmp = path.with_suffix(".draco.glb")
    cmd = ["npx", "--yes", "@gltf-transform/cli", "draco", str(path), str(tmp)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  WARNUNG: Draco fehlgeschlagen, unkomprimiert behalten:\n{res.stderr[-500:]}")
        return
    tmp.replace(path)


# ---------------------------------------------------------------- Hauptablauf

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, default=Path("landmarks.yaml"))
    ap.add_argument("--only", help="nur diese Landmark-id")
    ap.add_argument("--inspect", action="store_true", help="nur Treffer auflisten, nichts schreiben")
    ap.add_argument("--local-gml", type=Path, help="lokale .gml-Datei statt STAC-Download")
    ap.add_argument("--draco", action="store_true")
    ap.add_argument("--cache", type=Path, default=Path(".cache/geodata"))
    ap.add_argument("--out", type=Path, default=Path("assets/landmarks"))
    ap.add_argument("--ref-out", type=Path, default=Path("blender/ref"))
    args = ap.parse_args()

    cfg = load_config(args.config)
    origin = cfg["origin"]
    lms = [lm for lm in cfg.get("landmarks", []) if not args.only or lm["id"] == args.only]
    if not lms:
        die(f"Kein Landmark mit id '{args.only}'.")

    index_path = args.out / "index.json"
    lock_path = args.config.with_name("landmarks.lock.json")
    index = json.loads(index_path.read_text()) if index_path.exists() else {"landmarks": {}}
    lock = json.loads(lock_path.read_text()) if lock_path.exists() else {}
    parsed: dict[str, list[CityObject]] = {}
    failed = False

    for lm in lms:
        print(f"\n== {lm['id']} ({lm.get('name', '')})")
        area = selection_area(lm)
        if args.local_gml:
            tiles, gmls = [{"item": "local", "tile": "local", "asset": args.local_gml.name,
                            "multihash": None}], [args.local_gml]
        else:
            tiles = stac_tiles_for(area)
            if not tiles:
                print("  keine Kachel gefunden (liegt der Punkt in der Schweiz?)")
                failed = True
                continue
            print("  Kacheln: " + ", ".join(f"{t['tile']} ({t['year']})" for t in tiles))
            gmls = [g for t in tiles for g in fetch_tile(t, args.cache)]

        objs = []
        for g in gmls:
            if str(g) not in parsed:
                print(f"  parse {g.name} …")
                parsed[str(g)] = parse_gml(g)
            objs.extend(parsed[str(g)])

        hits = select(objs, lm)
        for o in hits:
            print(f"  Treffer {o.kind:<12} {o.gml_id}  z={o.zmin:.1f}…{o.zmax:.1f}  {o.attrs}")
        if not hits:
            with_fp = [(o, o.footprint()) for o in objs]
            near = sorted(((o, fp.distance(area)) for o, fp in with_fp if fp is not None),
                          key=lambda x: x[1])[:3]
            print("  KEIN Treffer. Nächste Objekte:")
            for o, d in near:
                print(f"    {o.kind} {o.gml_id}  Abstand {d:.1f} m  {o.attrs}")
        errs = check_expect(hits, lm)
        for e in errs:
            print(f"  ✗ {e}")
        if errs or not hits:
            failed = True
        if args.inspect:
            continue
        if errs or not hits:
            print("  → übersprungen, nichts geschrieben")
            continue

        mode = lm.get("mode", "block")
        out = (args.ref_out / f"{lm['id']}.ref.glb") if mode == "hero" else (args.out / f"{lm['id']}.glb")
        info = export_glb(hits, origin, out)
        if args.draco and mode == "block":
            draco(out)
        print(f"  ✓ {out}  ({info['triangles']} Dreiecke)")

        if mode == "block":
            index["landmarks"][lm["id"]] = {
                "name": lm.get("name", lm["id"]),
                "file": out.relative_to(args.out).as_posix(),
                "bounds": {"min": info["min"], "max": info["max"]},
                "attribution": "© swisstopo",
            }
        lock[lm["id"]] = {
            "mode": mode,
            "output": out.as_posix(),
            "tiles": [{k: t[k] for k in ("item", "asset", "multihash")} for t in tiles],
            "gml_ids": [o.gml_id for o in hits],
            "zmax": round(max(o.zmax for o in hits), 2),
            "resolved_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        }

    if args.inspect:
        sys.exit(1 if failed else 0)

    index["origin"] = {"crs": "EPSG:2056", **origin,
                       "axes": "x=E-e, y=H-h, z=-(N-n), meters"}
    args.out.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lock_path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    credits = Path("CREDITS.md")
    text = credits.read_text(encoding="utf-8") if credits.exists() else "# Credits\n"
    if "swissBUILDINGS3D" not in text:
        credits.write_text(text.rstrip() + f"\n\n- {ATTRIBUTION}\n", encoding="utf-8")
        print("\nCREDITS.md ergänzt.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
