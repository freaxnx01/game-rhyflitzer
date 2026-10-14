"""#332: the visual test records. No browser is started here; gh/git are a fake runner passed in."""
import json
import socket
import subprocess
import sys
from datetime import datetime, timezone

import pytest

import visual_runs as vr

NOW = datetime(2026, 10, 14, 10, 30, 0, tzinfo=timezone.utc)   # 12:30 in Europe/Zurich (CEST)


def _collector(wall=12.34):
    ticks = iter([100.0, 100.0 + wall])
    collector = vr.Collector(clock=lambda: next(ticks), utcnow=lambda: NOW)
    collector.start()
    return collector


def _run_test(collector, nodeid, outcome="passed", seconds=1.0, browsers=0):
    collector.begin(nodeid)
    collector.report(nodeid, "setup", "passed", 0.0)
    for _ in range(browsers):
        collector.launched()
    collector.report(nodeid, "call", outcome, seconds)
    collector.report(nodeid, "teardown", "passed", 0.0)
    collector.end()


def test_where_is_gh_runner_on_github_actions():
    assert vr.where_from({"GITHUB_ACTIONS": "true"}) == "gh-runner"


def test_where_is_the_hostname_everywhere_else():
    assert vr.where_from({}) == socket.gethostname()
    assert vr.where_from({"GITHUB_ACTIONS": "false"}) == socket.gethostname()


def test_renderer_names_the_gpu_browser_only_when_connected():
    assert vr.renderer_from("http://gpu.example:9223") == "GPU browser"
    assert vr.renderer_from(None) == "SwiftShader"


def test_collector_marks_only_the_tests_that_launched_a_browser():
    collector = _collector()
    _run_test(collector, "t.py::pure")
    _run_test(collector, "t.py::visual", browsers=2)
    assert [(t["nodeid"], t["browser"]) for t in collector.tests()] == [("t.py::pure", False), ("t.py::visual", True)]
    assert collector.has_browser()


def test_a_launch_outside_any_test_is_not_attributed():
    collector = _collector()
    collector.launched()
    _run_test(collector, "t.py::pure")
    assert not collector.has_browser()


def test_collector_without_tests_has_no_browser():
    assert not _collector().has_browser()


def test_call_phase_decides_outcome_and_rounded_seconds():
    collector = _collector()
    _run_test(collector, "t.py::slow", outcome="failed", seconds=3.14159)
    assert collector.tests()[0]["outcome"] == "failed"
    assert collector.tests()[0]["seconds"] == 3.1


def test_failed_setup_is_an_error_and_skipped_setup_is_skipped():
    collector = _collector()
    collector.begin("t.py::broken")
    collector.report("t.py::broken", "setup", "failed", 0.2)
    collector.end()
    collector.begin("t.py::skipped")
    collector.report("t.py::skipped", "setup", "skipped", 0.0)
    collector.end()
    assert [t["outcome"] for t in collector.tests()] == ["error", "skipped"]


def test_failed_teardown_turns_a_passed_test_into_an_error():
    collector = _collector()
    collector.begin("t.py::leaky")
    collector.report("t.py::leaky", "setup", "passed", 0.0)
    collector.report("t.py::leaky", "call", "passed", 1.0)
    collector.report("t.py::leaky", "teardown", "failed", 0.1)
    collector.end()
    assert collector.tests()[0]["outcome"] == "error"


def test_counting_launch_counts_after_a_successful_launch_and_returns_the_browser():
    collector = _collector()
    launch = vr.counting_launch(collector, lambda self, *a, **k: "browser")
    collector.begin("t.py::visual")
    assert launch(object(), args=["--x"]) == "browser"
    collector.end()
    assert collector.tests()[0]["browser"] is True


def test_counting_launch_does_not_count_a_failed_launch():
    def failing(self, *a, **k):
        raise RuntimeError("no chromium")

    collector = _collector()
    launch = vr.counting_launch(collector, failing)
    collector.begin("t.py::visual")
    with pytest.raises(RuntimeError):
        launch(object())
    collector.end()
    assert collector.tests()[0]["browser"] is False


def test_record_has_the_agreed_fields_and_no_endpoint():
    collector = _collector(wall=12.34)
    _run_test(collector, "t.py::visual", browsers=1)
    record = vr.build_record(collector, {}, "http://gpu.example:9223", "abc1234")
    assert record["renderer"] == "GPU browser"
    assert record["where"] == socket.gethostname()
    assert record["commit"] == "abc1234"
    assert record["wall_seconds"] == 12.3
    assert record["started_at"] == "2026-10-14T10:30:00Z"
    assert record["tests"] == [{"nodeid": "t.py::visual", "outcome": "passed", "seconds": 1.0, "browser": True}]
    assert "gpu.example" not in json.dumps(record)


def test_write_record_names_the_file_by_utc_timestamp_and_pid(tmp_path):
    collector = _collector()
    _run_test(collector, "t.py::visual", browsers=1)
    record = vr.build_record(collector, {}, None, "abc1234")
    path = vr.write_record(record, tmp_path / ".test-runs", pid=4711)
    assert path.name == "20261014T103000Z-4711.json"
    assert json.loads(path.read_text()) == record


def _record(started="2026-10-14T10:30:00Z", where="agent-dev", renderer="SwiftShader", commit="abc1234", wall=12.3, tests=None):
    if tests is None:
        tests = [
            {"nodeid": "prototype/tests/test_a.py::test_one", "outcome": "passed", "seconds": 3.2, "browser": True},
            {"nodeid": "prototype/tests/test_a.py::test_two", "outcome": "failed", "seconds": 4.0, "browser": True},
            {"nodeid": "prototype/tests/test_b.py::test_three", "outcome": "passed", "seconds": 1.1, "browser": True},
            {"nodeid": "prototype/tests/test_c.py::test_pure", "outcome": "passed", "seconds": 0.0, "browser": False},
        ]
    return {"started_at": started, "where": where, "renderer": renderer, "commit": commit, "wall_seconds": wall, "tests": tests}


def test_slim_summarises_only_the_browser_tests():
    slim = vr.slim(_record())
    assert (slim["count"], slim["passed"], slim["failed"], slim["skipped"]) == (3, 2, 1, 0)
    assert slim["files"] == ["test_a.py", "test_b.py"]
    assert [t["id"] for t in slim["tests"]] == [
        "prototype/tests/test_a.py::test_one", "prototype/tests/test_a.py::test_two", "prototype/tests/test_b.py::test_three"]


def test_slim_counts_errors_as_failed_and_skips_separately():
    tests = [
        {"nodeid": "a.py::x", "outcome": "error", "seconds": 0.0, "browser": True},
        {"nodeid": "a.py::y", "outcome": "skipped", "seconds": 0.0, "browser": True},
    ]
    slim = vr.slim(_record(tests=tests))
    assert (slim["failed"], slim["skipped"], slim["passed"]) == (1, 1, 0)


def test_data_round_trips_through_a_comment_body():
    data = vr.append_run(vr.empty_data(), _record())
    body = "<!-- visual-test-runs -->\n" + vr.encode_data(data) + "\n\n### Visual tests\n"
    assert vr.decode_data(body) == data


@pytest.mark.parametrize("body", ["", "no data here", "<!-- visual-test-runs-data: !!!not-base64!!! -->",
                                  "<!-- visual-test-runs-data: aGVsbG8= -->"])
def test_decode_returns_none_for_missing_or_unreadable_data(body):
    assert vr.decode_data(body) is None


def test_append_keeps_details_only_for_the_last_five_runs():
    data = vr.empty_data()
    for minute in range(7):
        data = vr.append_run(data, _record(started=f"2026-10-14T10:{minute:02d}:00Z"))
    assert [bool(run["tests"]) for run in data["runs"]] == [False, False, True, True, True, True, True]
    assert data["runs"][0]["count"] == 3


def test_append_drops_the_oldest_beyond_forty_and_counts_them():
    data = vr.empty_data()
    for i in range(43):
        data = vr.append_run(data, _record(commit=f"c{i:06d}"))
    assert len(data["runs"]) == 40
    assert data["dropped"] == 3
    assert data["runs"][0]["commit"] == "c000003" and data["runs"][-1]["commit"] == "c000042"
