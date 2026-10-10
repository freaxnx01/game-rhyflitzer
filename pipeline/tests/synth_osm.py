"""#166: a synthetic extract for tests: a 7 x 7 road grid at 400 m around a 2 x 2 km frame near Ehrendingen, a village,
a hamlet, a church, a station, a school, one wood, two Gemeinden (Ahausen west of E 2668600, Bedorf east)."""
from pathlib import Path
from xml.sax.saxutils import quoteattr

from pyproj import Transformer

_TO_WGS = Transformer.from_crs("EPSG:2056", "EPSG:4326", always_xy=True)
RECT = (2667000.0, 1259750.0, 2669000.0, 1261750.0)
SPLIT_E = 2668600.0


def _tags(tags):
    return "".join(f"<tag k={quoteattr(k)} v={quoteattr(str(v))}/>" for k, v in tags.items())


def write(path) -> Path:
    nodes, ways, rels = [], [], []

    def node(e, n, **tags):
        lon, lat = _TO_WGS.transform(e, n)
        nodes.append(f'<node id="{len(nodes) + 1}" lat="{lat:.7f}" lon="{lon:.7f}">{_tags(tags)}</node>')
        return len(nodes)

    def way(refs, **tags):
        ways.append(f'<way id="{1000 + len(ways)}">' + "".join(f'<nd ref="{r}"/>' for r in refs) + _tags(tags) + "</way>")
        return 999 + len(ways)

    # crossings are shared nodes, nudged 3 m so world_roads' simplify keeps them (the game graph joins at shared vertices)
    grid = {(i, j): node(2666700 + 400 * i + (3 if (i + j) % 2 else -3), 1259450 + 400 * j + (3 if (i + j) % 2 else -3))
            for i in range(7) for j in range(7)}
    for j in range(7):
        way([grid[(i, j)] for i in range(7)], highway="secondary" if j == 3 else "residential", name=f"Querstrasse {j}")
    for i in range(7):
        way([grid[(i, j)] for j in range(7)], highway="tertiary" if i == 3 else "residential", name=f"Laengsstrasse {i}")
    node(2668000, 1260750, place="village", name="Ahausen")
    node(2668800, 1261500, place="hamlet", name="Bedorf")
    node(2667500, 1260300, amenity="place_of_worship", name="Kirche Ahausen")
    node(2668500, 1260250, railway="station", name="Ahausen Bahnhof")
    node(2667300, 1261300, amenity="school", name="Schulhaus Ahausen")
    ring = [node(e, n) for e, n in [(2667150, 1259900), (2667450, 1259900), (2667450, 1260200), (2667150, 1260200)]]
    way(ring + ring[:1], landuse="forest")
    lines = {k: way([node(*a), node(*b)], boundary="administrative", admin_level="8") for k, a, b in [
        ("w", (2665000, 1257000), (2665000, 1264000)), ("nw", (2665000, 1264000), (SPLIT_E, 1264000)),
        ("sw", (2665000, 1257000), (SPLIT_E, 1257000)), ("split", (SPLIT_E, 1257000), (SPLIT_E, 1264000)),
        ("ne", (SPLIT_E, 1264000), (2672000, 1264000)), ("se", (SPLIT_E, 1257000), (2672000, 1257000)),
        ("e", (2672000, 1257000), (2672000, 1264000))]}
    for rid, (name, members) in enumerate([("Ahausen", "w nw sw split"), ("Bedorf", "split ne se e")], start=5000):
        rels.append(f'<relation id="{rid}">' + "".join(f'<member type="way" ref="{lines[m]}" role="outer"/>' for m in members.split())
                    + _tags({"type": "boundary", "boundary": "administrative", "admin_level": "8", "name": name}) + "</relation>")
    path = Path(path)
    path.write_text("\n".join(['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6">', *nodes, *ways, *rels, "</osm>"]) + "\n",
                    encoding="utf-8")
    return path
