"""#1248: the road-scan gate's pure parts -- the known-spot list and the failure message nightly_report.py files."""
import json
from pathlib import Path

KNOWN = Path(__file__).parent / "road_scan_known.json"


def load_known(path=KNOWN):
    entries = json.loads(Path(path).read_text(encoding="utf-8"))
    for e in entries:
        if not all(isinstance(e.get(k), (int, float)) and not isinstance(e.get(k), bool) for k in ("x", "z")):
            raise ValueError(f"{path}: every known spot needs numeric x and z, got {e!r}")
    return entries


def spot_line(s):
    lv95 = "LV95 —" if s.get("E") is None else f"LV95 {round(s['E'])} / {round(s['N'])}"
    return (f"x {s['x']:.1f} z {s['z']:.1f} | {lv95} | {s.get('n') or '(unnamed)'} ({s['cls']}), {s['side']} | "
            f"green {s['d']:.3f} m over road ({s['yRoad']:.2f}), {s['count']} probes")


def failure_message(fresh, gone, limit=30):
    lines = []
    if fresh:
        lines.append(f"{len(fresh)} new grass-over-road spots (tests/road_scan_known.json lists the known ones):")
        ordered = sorted(fresh, key=lambda s: -s["d"])
        lines += [spot_line(s) for s in ordered[:limit]]
        if len(ordered) > limit:
            lines.append(f"... and {len(ordered) - limit} more")
    if gone:
        lines.append(f"{len(gone)} known spot no longer found (remove from tests/road_scan_known.json):")
        lines += [f"x {k['x']:.1f} z {k['z']:.1f} ({k.get('n') or '(unnamed)'}, #{k.get('issue')})" for k in gone]
    return "\n".join(lines)
