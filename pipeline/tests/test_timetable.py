"""#682: the weekday timetable cut out of the Swiss GTFS, on a synthetic feed."""
import csv
import datetime as dt
import io
import json
import zipfile
from pathlib import Path

import timetable

DAY = dt.date(2026, 11, 10)   # a Tuesday

ROUTES = [{"id": 700, "line": "133", "stops": [{"uic": "8500001"}, {"uic": "8500002"}, {"uic": "8500003"}]},
          {"id": 701, "line": "133", "stops": [{"uic": "8500003"}, {"uic": "8500002"}, {"uic": "8500001"}]}]

AGENCY = [["agency_id", "agency_name"], ["801", "PostAuto AG"], ["999", "Other AG"]]

GTFS_ROUTES = [["route_id", "agency_id", "route_short_name", "route_type"],
               ["R1", "801", "133", "700"],
               ["R2", "801", "133", "700"],        # the Neuchatel twin: same agency, same short name
               ["R3", "999", "133", "700"]]        # another agency

STOPS = [["stop_id", "stop_name", "parent_station"],
         ["Parentch:1:sloid:1", "X, Eins", ""],
         ["Parentch:1:sloid:2", "X, Zwei", ""],
         ["Parentch:1:sloid:3", "X, Drei", ""],
         ["ch:1:sloid:1:0:11", "X, Eins Kante", "Parentch:1:sloid:1"],
         ["ch:1:sloid:2:0:21", "X, Zwei Kante", "Parentch:1:sloid:2"],
         ["ch:1:sloid:3:0:31", "X, Drei Kante", "Parentch:1:sloid:3"],
         ["ch:1:sloid:9:0:91", "Y, Neun", ""],      # outside the map
         ["ch:1:sloid:77:0:1", "N, Sieben", ""]]    # Neuchatel

CALENDAR = [["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
             "start_date", "end_date"],
            ["TU", "0", "1", "0", "0", "0", "0", "0", "20251214", "20261212"],
            ["WD", "1", "1", "1", "1", "1", "0", "0", "20251214", "20261212"],
            ["HOL", "1", "1", "1", "1", "1", "0", "0", "20251214", "20261212"],
            ["FRI", "0", "0", "0", "0", "1", "0", "0", "20251214", "20261212"],
            ["SAT", "0", "0", "0", "0", "0", "1", "0", "20251214", "20261212"]]

CALENDAR_DATES = [["service_id", "date", "exception_type"],
                  ["HOL", "20261110", "2"],        # a holiday: removed on the reference Tuesday
                  ["XTRA", "20261110", "1"]]       # only ever runs on the reference Tuesday

TRIPS = [["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"],
         ["R1", "TU", "t1", "X, Drei", "0"],
         ["R1", "WD", "t2", "X, Eins", "1"],
         ["R1", "HOL", "t3", "X, Drei", "0"],
         ["R1", "XTRA", "t4", "X, Zwei", "0"],
         ["R2", "WD", "t5", "X, Eins", "0"],
         ["R3", "WD", "t6", "X, Zwei", "0"],
         ["R1", "FRI", "t7", "X, Drei", "0"],
         ["R1", "SAT", "t8", "X, Drei", "0"]]

STOP_TIMES = [["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
              ["t1", "05:50:00", "05:50:00", "ch:1:sloid:9:0:91", "1"],
              ["t1", "05:52:00", "05:52:00", "ch:1:sloid:1:0:11", "2"],
              ["t1", "05:55:00", "05:55:00", "ch:1:sloid:2:0:21", "3"],
              ["t1", "06:00:00", "06:00:00", "ch:1:sloid:3:0:31", "4"],
              ["t2", "24:03:00", "24:03:00", "ch:1:sloid:3:0:31", "1"],
              ["t2", "24:08:00", "24:08:00", "ch:1:sloid:2:0:21", "2"],
              ["t2", "24:12:00", "24:12:00", "ch:1:sloid:1:0:11", "3"],
              ["t3", "08:00:00", "08:00:00", "ch:1:sloid:1:0:11", "1"],
              ["t3", "08:05:00", "08:05:00", "ch:1:sloid:2:0:21", "2"],
              ["t4", "07:00:00", "07:00:00", "ch:1:sloid:1:0:11", "1"],
              ["t4", "07:05:00", "07:05:00", "ch:1:sloid:2:0:21", "2"],
              ["t5", "09:00:00", "09:00:00", "ch:1:sloid:77:0:1", "1"],
              ["t5", "09:30:00", "09:30:00", "ch:1:sloid:1:0:11", "2"],
              ["t6", "10:00:00", "10:00:00", "ch:1:sloid:1:0:11", "1"],
              ["t6", "10:05:00", "10:05:00", "ch:1:sloid:2:0:21", "2"],
              ["t7", "11:00:00", "11:00:00", "ch:1:sloid:1:0:11", "1"],
              ["t7", "11:05:00", "11:05:00", "ch:1:sloid:2:0:21", "2"],
              ["t8", "12:00:00", "12:00:00", "ch:1:sloid:1:0:11", "1"],
              ["t8", "12:05:00", "12:05:00", "ch:1:sloid:2:0:21", "2"]]

FEED_INFO = [["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version",
              "feed_start_date", "feed_end_date"],
             ["Synth", "https://example.invalid", "de", "20261104", "20251214", "20261212"]]

TABLES = {"agency.txt": AGENCY, "routes.txt": GTFS_ROUTES, "stops.txt": STOPS, "calendar.txt": CALENDAR,
          "calendar_dates.txt": CALENDAR_DATES, "trips.txt": TRIPS, "stop_times.txt": STOP_TIMES,
          "feed_info.txt": FEED_INFO}


def _csv(rows) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(rows)
    return buf.getvalue()


def _zip(tmp_path) -> Path:
    path = Path(tmp_path) / "gtfs_fp2026_20261104.zip"
    if not path.exists():
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            for name, rows in TABLES.items():
                z.writestr(name, _csv(rows))
    return path


def test_uic_of_uses_the_sloid_number():
    assert timetable.uic_of("ch:1:sloid:72418:0:780957", "Parentch:1:sloid:72418") == "8572418"
    assert timetable.uic_of("ch:1:sloid:583") == "8500583"
    assert timetable.uic_of("8014466") is None


def test_seconds_after_midnight():
    assert timetable.seconds("05:52:00") == 21120 and timetable.seconds("24:03:00") == 86580


def test_active_services_applies_calendar_dates(tmp_path):
    with zipfile.ZipFile(_zip(tmp_path)) as z:
        assert timetable.active_services(z, {"TU", "WD", "HOL", "XTRA", "FRI", "SAT"}, DAY) == {"TU", "WD", "XTRA"}


def test_cut_drops_trips_without_two_world_stops(tmp_path):
    out = timetable.cut(_zip(tmp_path), ROUTES, DAY)
    ids = [(t["route"], [c[0] for c in t["calls"]]) for t in out["trips"]]
    assert ids == [(700, ["8500001", "8500002", "8500003"]), (700, ["8500001", "8500002"]),
                   (701, ["8500003", "8500002", "8500001"])]      # sorted by first departure; t3/t5/t6/t7/t8 gone


def test_cut_marks_trips_beyond_the_map_and_writes_meta(tmp_path):
    out = timetable.cut(_zip(tmp_path), ROUTES, DAY)
    t1 = out["trips"][0]
    assert t1["fromOutside"] is True and t1["toOutside"] is False and t1["line"] == "133" and t1["to"] == "X, Drei"
    assert out["format"] == "MMT1" and out["source"] == "opentransportdata.swiss" and out["day"] == "2026-11-10"
    assert out["feed"]["version"] == "20261104" and out["feed"]["from"] == "2025-12-14"
    assert out["stops"]["8500002"] == "X, Zwei"
    assert out["trips"][-1]["calls"][0][2] == 86580


def test_cut_logs_lines_whose_monday_to_friday_set_differs(tmp_path, capsys):
    timetable.cut(_zip(tmp_path), ROUTES, DAY)
    err = capsys.readouterr().err
    assert "133" in err and "2026-11-09" in err      # the Monday runs the holiday trip the Tuesday does not


def test_cli_refuses_a_weekend_date(tmp_path):
    world = tmp_path / "w.json"
    world.write_text(json.dumps({"busRoutes": ROUTES}))
    assert timetable.main(["--gtfs", str(_zip(tmp_path)), "--world", str(world), "--date", "2026-11-14",
                           "--out", str(tmp_path / "t.json")]) == 2


def test_cli_refuses_a_world_without_bus_routes(tmp_path):
    world = tmp_path / "w.json"
    world.write_text(json.dumps({"roads": []}))
    assert timetable.main(["--gtfs", str(_zip(tmp_path)), "--world", str(world), "--date", "2026-11-10",
                           "--out", str(tmp_path / "t.json")]) == 2


def test_cli_writes_the_timetable(tmp_path):
    world = tmp_path / "w.json"
    world.write_text(json.dumps({"busRoutes": ROUTES}))
    out = tmp_path / "t.json"
    assert timetable.main(["--gtfs", str(_zip(tmp_path)), "--world", str(world), "--date", "2026-11-10",
                           "--out", str(out)]) == 0
    assert len(json.loads(out.read_text(encoding="utf-8"))["trips"]) == 3
