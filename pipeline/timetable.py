#!/usr/bin/env python3
"""Map Madness pipeline: the weekday timetable of the world's bus lines, cut out of the Swiss GTFS (#682).

    python timetable.py --gtfs cache/gtfs/gtfs_fp2026_<date>.zip --world ../data/world_hochrhein.json \
        --date 2026-11-10 --out ../data/timetable_hochrhein.json

Reads the world file's `busRoutes` (from osm.py build) and keeps only those lines' trips of one agency
that call at least twice inside the map, on the services active on --date (a Monday to Friday). Writes
the small `MMT1` JSON the game loads. OSM and GTFS are linked by UIC number: GTFS `ch:1:sloid:<N>`
(the quay or its parent station) is OSM `uic_ref` 8500000 + N.

The zip is downloaded by hand from https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020
into pipeline/cache/gtfs/ (~290 MB, no access code). Every table is streamed row by row, never held whole:
stop_times.txt alone is 3.7 GB unpacked, 42 M rows. Run it under the memory cap, exit 137 means move the
step to odroid-plus-pve - never raise the cap:

    systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 ./.venv/bin/python timetable.py ...

Source: opentransportdata.swiss, terms of use https://opentransportdata.swiss/en/terms-of-use/ (clause 5.1
asks the URL to be cited as the source).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

FORMAT = "MMT1"
SOURCE = "opentransportdata.swiss"
TERMS = "https://opentransportdata.swiss/en/terms-of-use/"
AGENCY = "PostAuto AG"
SLOID = re.compile(r"^(?:Parent)?ch:1:sloid:(\d+)(?::|$)")
UIC_BASE = 8500000
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def uic_of(stop_id: str, parent: str = "") -> str | None:
    """The OSM uic_ref of a GTFS stop, from its parent station's SLOID or its own; None for anything else."""
    for sloid in (parent, stop_id):
        match = SLOID.match(sloid or "")
        if match:
            return str(UIC_BASE + int(match.group(1)))
    return None


def seconds(hms: str) -> int:
    """Seconds after midnight of the service day; stays above 86400 after midnight ("24:03:00" -> 86580)."""
    hours, minutes, secs = (int(v) for v in hms.split(":"))
    return hours * 3600 + minutes * 60 + secs


def _table(gtfs: zipfile.ZipFile, name: str):
    """(column name -> index, row iterator) for one table, streamed straight from the zip."""
    rows = csv.reader(io.TextIOWrapper(gtfs.open(name), encoding="utf-8-sig"))
    head = next(rows)
    return {key: i for i, key in enumerate(head)}, rows


def active_services(gtfs: zipfile.ZipFile, services: set, day: dt.date) -> set:
    """The services of `services` running on `day`: the calendar.txt weekday flag within its date range,
    then calendar_dates.txt exceptions (type 1 adds the day, type 2 removes it)."""
    ymd = day.strftime("%Y%m%d")
    flag = WEEKDAYS[day.weekday()]
    active = set()
    col, rows = _table(gtfs, "calendar.txt")
    for row in rows:
        service = row[col["service_id"]]
        if service in services and row[col["start_date"]] <= ymd <= row[col["end_date"]] and row[col[flag]] == "1":
            active.add(service)
    col, rows = _table(gtfs, "calendar_dates.txt")
    for row in rows:
        service = row[col["service_id"]]
        if service not in services or row[col["date"]] != ymd:
            continue
        if row[col["exception_type"]] == "1":
            active.add(service)
        elif row[col["exception_type"]] == "2":
            active.discard(service)
    return active


def _agency_ids(gtfs: zipfile.ZipFile, agency: str) -> set:
    col, rows = _table(gtfs, "agency.txt")
    return {row[col["agency_id"]] for row in rows if row[col["agency_name"]] == agency}


def _route_lines(gtfs: zipfile.ZipFile, agencies: set, lines: set) -> dict:
    """GTFS route_id -> line, for the agency's routes whose short name is one of the world's lines."""
    col, rows = _table(gtfs, "routes.txt")
    return {row[col["route_id"]]: row[col["route_short_name"]] for row in rows
            if row[col["agency_id"]] in agencies and row[col["route_short_name"]] in lines}


def _stop_uics(gtfs: zipfile.ZipFile, world_uics: set) -> tuple[dict, dict]:
    """(GTFS stop_id -> uic for every SLOID stop, uic -> GTFS name for the world's stops).
    The parent station's name wins, so a call reads "Sisseln AG, DSM", not the quay's own label."""
    col, rows = _table(gtfs, "stops.txt")
    of_stop, names, parent_names = {}, {}, {}
    for row in rows:
        stop_id = row[col["stop_id"]]
        parent = row[col["parent_station"]]
        uic = uic_of(stop_id, parent)
        if uic is None:
            continue
        name = row[col["stop_name"]]
        if stop_id.startswith("Parent"):
            parent_names[uic] = name
        else:
            of_stop[stop_id] = uic
            names.setdefault(uic, name)
    names.update(parent_names)
    return of_stop, {uic: name for uic, name in names.items() if uic in world_uics}


def _trips(gtfs: zipfile.ZipFile, route_lines: dict) -> dict:
    """trip_id -> {line, service, to} for every trip of the chosen routes."""
    col, rows = _table(gtfs, "trips.txt")
    return {row[col["trip_id"]]: {"line": route_lines[row[col["route_id"]]],
                                  "service": row[col["service_id"]],
                                  "to": row[col["trip_headsign"]]}
            for row in rows if row[col["route_id"]] in route_lines}


def _calls(gtfs: zipfile.ZipFile, wanted: set, of_stop: dict, world_uics: set) -> tuple[dict, dict]:
    """Per wanted trip: its calls inside the map as (sequence, uic, arrival, departure), and the
    (first, last) stop_sequence of the whole trip, so a trip from or to beyond the map can be flagged."""
    col, rows = _table(gtfs, "stop_times.txt")
    trip_at, seq_at, stop_at = col["trip_id"], col["stop_sequence"], col["stop_id"]
    arr_at, dep_at = col["arrival_time"], col["departure_time"]
    calls: dict = {}
    span: dict = {}
    for row in rows:
        trip = row[trip_at]
        if trip not in wanted:
            continue
        sequence = int(row[seq_at])
        edge = span.setdefault(trip, [sequence, sequence])
        edge[0], edge[1] = min(edge[0], sequence), max(edge[1], sequence)
        uic = of_stop.get(row[stop_at])
        if uic in world_uics:
            calls.setdefault(trip, []).append((sequence, uic, seconds(row[arr_at]), seconds(row[dep_at])))
    return calls, span


def _is_subsequence(needle: list, haystack: list) -> bool:
    rest = iter(haystack)
    return all(any(stop == uic for stop in rest) for uic in needle)


def _route_of(routes: list[dict], line: str, uics: list) -> int | None:
    """The first world route of the line whose stops contain the trip's calls in order."""
    for route in routes:
        if route["line"] == line and _is_subsequence(uics, [s["uic"] for s in route["stops"]]):
            return route["id"]
    return None


def _weekday_sets(gtfs: zipfile.ZipFile, trips: dict, day: dt.date) -> dict:
    """line -> {date -> frozenset of its trip ids} for Monday to Friday of day's week (no stop_times pass)."""
    monday = day - dt.timedelta(days=day.weekday())
    out: dict = {}
    for offset in range(5):
        date = monday + dt.timedelta(days=offset)
        active = active_services(gtfs, {t["service"] for t in trips.values()}, date)
        for trip, meta in trips.items():
            per_day = out.setdefault(meta["line"], {}).setdefault(date, set())
            if meta["service"] in active:
                per_day.add(trip)
    return out


def _log_weekday_differences(gtfs: zipfile.ZipFile, trips: dict, day: dt.date) -> None:
    for line, per_day in sorted(_weekday_sets(gtfs, trips, day).items()):
        reference = per_day[day]
        odd = {date: len(ids) for date, ids in per_day.items() if ids != reference}
        if odd:
            log(f"line {line} differs from {day} ({len(reference)} trips) on "
                + ", ".join(f"{date} ({count} trips)" for date, count in sorted(odd.items())))


def _feed(gtfs: zipfile.ZipFile, path: Path) -> dict:
    col, rows = _table(gtfs, "feed_info.txt")
    row = next(rows)
    return {"file": path.name, "version": row[col["feed_version"]],
            "from": _iso(row[col["feed_start_date"]]), "to": _iso(row[col["feed_end_date"]])}


def _iso(ymd: str) -> str:
    return f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}"


def cut(gtfs_path: Path, routes: list[dict], day: dt.date, agency: str = AGENCY) -> dict:
    """The MMT1 timetable of the world's bus routes on `day`, cut out of the GTFS zip."""
    gtfs_path = Path(gtfs_path)
    lines = {r["line"] for r in routes}
    world_uics = {s["uic"] for r in routes for s in r["stops"]}
    log(f"cutting the {day} timetable of {agency} line(s) {', '.join(sorted(lines))} from {gtfs_path.name}")
    stats: Counter = Counter()
    with zipfile.ZipFile(gtfs_path) as gtfs:
        feed = _feed(gtfs, gtfs_path)
        route_lines = _route_lines(gtfs, _agency_ids(gtfs, agency), lines)
        of_stop, names = _stop_uics(gtfs, world_uics)
        trips = _trips(gtfs, route_lines)
        active = active_services(gtfs, {t["service"] for t in trips.values()}, day)
        running = {trip for trip, meta in trips.items() if meta["service"] in active}
        calls, span = _calls(gtfs, running, of_stop, world_uics)
        _log_weekday_differences(gtfs, trips, day)
    out = []
    for trip in sorted(running):
        stops = sorted(calls.get(trip, []))
        if len(stops) < 2:
            stats["too-few-calls"] += 1
            continue
        route = _route_of(routes, trips[trip]["line"], [uic for _, uic, _, _ in stops])
        if route is None:
            stats["unmatched"] += 1
            continue
        first, last = span[trip]
        out.append({"line": trips[trip]["line"], "route": route, "to": trips[trip]["to"],
                    "fromOutside": stops[0][0] > first, "toOutside": stops[-1][0] < last,
                    "calls": [[uic, arrival, departure] for _, uic, arrival, departure in stops]})
    out.sort(key=lambda t: t["calls"][0][2])
    log(f"wrote {len(out)} trips of {len(trips)} on the line(s), {dict(stats)}")
    return {"format": FORMAT, "source": SOURCE, "terms": TERMS, "feed": feed,
            "day": day.isoformat(), "service": "weekday", "stops": names, "trips": out}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gtfs", required=True, help="the GTFS zip from opentransportdata.swiss")
    ap.add_argument("--world", required=True, help="the world JSON whose busRoutes pick the lines and stops")
    ap.add_argument("--date", required=True, metavar="YYYY-MM-DD",
                    help="the reference weekday (a Tuesday outside the holidays)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--agency", default=AGENCY)
    a = ap.parse_args(argv)
    day = dt.date.fromisoformat(a.date)
    if day.weekday() >= 5:
        log(f"--date {day} is a {WEEKDAYS[day.weekday()]}; the game always runs the weekday timetable (#682)")
        return 2
    routes = json.loads(Path(a.world).read_text(encoding="utf-8")).get("busRoutes") or []
    if not routes:
        log(f"{a.world} has no busRoutes; add a bus key to its anchors file and rebuild the world")
        return 2
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cut(Path(a.gtfs), routes, day, a.agency),
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"wrote {out} ({out.stat().st_size / 1e3:.1f} kB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
