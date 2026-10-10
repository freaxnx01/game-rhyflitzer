#!/usr/bin/env python3
"""#166, one-off: Switzerland's outline (swissBOUNDARIES3D, (c) swisstopo) from the geo.admin.ch REST API, simplified
50 m, LV95 -> ch_outline.geojson. Rerun only when the border data changes."""
import json
from pathlib import Path

import requests
import shapely

URL = ("https://api3.geo.admin.ch/rest/services/api/MapServer/"
       "ch.swisstopo.swissboundaries3d-land-flaeche.fill/CH?geometryFormat=geojson&sr=2056")
OUT = Path(__file__).with_name("ch_outline.geojson")

if __name__ == "__main__":
    r = requests.get(URL, timeout=120)
    r.raise_for_status()
    geom = shapely.set_precision(shapely.geometry.shape(r.json()["feature"]["geometry"]).simplify(50.0, preserve_topology=True), 1.0)
    OUT.write_text(json.dumps({"type": "Feature", "properties": {"source": "swissBOUNDARIES3D (c) swisstopo", "crs": "EPSG:2056"},
                               "geometry": shapely.geometry.mapping(geom)}, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e3:.0f} kB)")
