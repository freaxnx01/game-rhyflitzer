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


def _data(*records):
    data = vr.empty_data()
    for record in records:
        data = vr.append_run(data, record)
    return data


def test_comment_starts_with_marker_and_data_and_has_the_heading():
    body = vr.render_comment(_data(_record()))
    lines = body.splitlines()
    assert lines[0] == "<!-- visual-test-runs -->"
    assert vr.decode_data(lines[1]) == _data(_record())
    assert "### Visual tests" in body


def test_row_shows_zurich_time_where_renderer_tests_result_and_whole_seconds():
    body = vr.render_comment(_data(_record()))
    assert "| When | Where | Renderer | Tests | Result | Time (s) |" in body
    assert "| 2026-10-14 12:30 | agent-dev | SwiftShader | 3: test_a.py, test_b.py | 2 ✓ 1 ✗ | 12 |" in body


def test_winter_time_is_zurich_time_too():
    body = vr.render_comment(_data(_record(started="2026-12-01T10:30:00Z")))
    assert "| 2026-12-01 11:30 |" in body


def test_rows_are_newest_last():
    body = vr.render_comment(_data(_record(commit="first", started="2026-10-14T08:00:00Z"),
                                   _record(commit="second", started="2026-10-14T09:00:00Z")))
    assert body.index("2026-10-14 10:00") < body.index("2026-10-14 11:00")


def test_result_omits_zero_counts_and_marks_skips():
    tests = [{"nodeid": "a.py::x", "outcome": "skipped", "seconds": 0.0, "browser": True}]
    assert "| 1: a.py | 1 ○ |" in vr.render_comment(_data(_record(tests=tests)))


def test_tests_cell_is_truncated_to_120_characters():
    tests = [{"nodeid": f"prototype/tests/test_{'x' * 20}{i}.py::t", "outcome": "passed", "seconds": 1.0, "browser": True}
             for i in range(12)]
    row = next(line for line in vr.render_comment(_data(_record(tests=tests))).splitlines() if line.startswith("| 2026"))
    cell = row.split("|")[4].strip()
    assert len(cell) <= 120 and cell.endswith("…")


def test_details_list_each_browser_test_for_the_last_five_runs_only():
    data = vr.empty_data()
    for minute in range(6):
        data = vr.append_run(data, _record(started=f"2026-10-14T10:{minute:02d}:00Z"))
    body = vr.render_comment(data)
    assert body.count("<details>") == 5
    assert "- ✓ `prototype/tests/test_a.py::test_one` 3.2 s" in body
    assert "- ✗ `prototype/tests/test_a.py::test_two` 4.0 s" in body
    assert "test_pure" not in body


def test_dropped_runs_are_announced():
    data = _data(_record())
    data["dropped"] = 3
    assert "_3 older runs dropped._" in vr.render_comment(data)


def test_a_huge_history_stays_under_the_limit_and_keeps_all_rows():
    big = [{"nodeid": f"prototype/tests/test_module_{i % 7}.py::test_a_rather_long_test_name_{i}", "outcome": "passed",
            "seconds": 1.5, "browser": True} for i in range(400)]
    data = vr.empty_data()
    for minute in range(40):
        data = vr.append_run(data, _record(started=f"2026-10-14T10:{minute:02d}:00Z", tests=big))
    body = vr.render_comment(data)
    assert len(body) <= vr.BODY_LIMIT
    assert sum(line.startswith("| 2026") for line in body.splitlines()) == 40
    assert vr.decode_data(body)["runs"][-1]["count"] == 400


class FakeRun:
    """Stands in for run_command: answers by command prefix, records every call."""

    def __init__(self, *answers):
        self.answers, self.calls = answers, []

    def __call__(self, cmd, stdin=None):
        self.calls.append((cmd, stdin))
        for prefix, answer in self.answers:
            if cmd[:len(prefix)] == prefix:
                if isinstance(answer, Exception):
                    raise answer
                return answer
        raise AssertionError(f"unexpected command {cmd}")

    def api_calls(self):
        return [(cmd, stdin) for cmd, stdin in self.calls if cmd[:2] == ["gh", "api"]]


def test_run_command_returns_stdout():
    assert vr.run_command([sys.executable, "-c", "print('hi')"]) == "hi\n"


def test_run_command_passes_stdin():
    assert vr.run_command([sys.executable, "-c", "import sys; print(sys.stdin.read().upper())"], stdin="abc") == "ABC\n"


def test_run_command_raises_on_a_non_zero_exit():
    with pytest.raises(vr.CommandError, match="exited 3"):
        vr.run_command([sys.executable, "-c", "import sys; sys.exit(3)"])


def test_run_command_raises_on_a_missing_binary():
    with pytest.raises(vr.CommandError):
        vr.run_command(["definitely-not-a-binary-332"])


def test_run_command_raises_on_a_timeout():
    with pytest.raises(vr.CommandError):
        vr.run_command([sys.executable, "-c", "import time; time.sleep(5)"], timeout=0.5)


def test_commit_prefers_the_pr_head_sha_then_github_sha_then_git():
    git = FakeRun((["git", "rev-parse", "--short", "HEAD"], "feed123\n"))
    assert vr.commit_sha({"PR_HEAD_SHA": "1234567890abcdef", "GITHUB_SHA": "ffffffffff"}, git) == "1234567"
    assert vr.commit_sha({"GITHUB_SHA": "abcdefabcdef"}, git) == "abcdefa"
    assert vr.commit_sha({}, git) == "feed123"
    assert vr.commit_sha({}, FakeRun((["git"], vr.CommandError("no git")))) == "unknown"


def test_pr_number_comes_straight_from_a_pull_request_ref():
    run = FakeRun()
    assert vr.find_pr_number({"GITHUB_REF": "refs/pull/332/merge"}, run) == 332
    assert run.calls == []


def test_pr_number_is_looked_up_by_branch_otherwise():
    run = FakeRun((["git", "rev-parse", "--abbrev-ref", "HEAD"], "feature/x\n"),
                  (["gh", "pr", "list", "--head", "feature/x"], "7\n"))
    assert vr.find_pr_number({"GITHUB_REF": "refs/heads/feature/x"}, run) == 7


@pytest.mark.parametrize("branch, listing", [("main", "null\n"), ("main", "\n"), ("HEAD", "7\n")])
def test_no_pr_when_none_is_open_or_the_checkout_is_detached(branch, listing):
    run = FakeRun((["git", "rev-parse", "--abbrev-ref", "HEAD"], branch + "\n"), (["gh", "pr", "list"], listing))
    assert vr.find_pr_number({}, run) is None


def test_lookup_failures_propagate_as_command_errors():
    run = FakeRun((["git", "rev-parse", "--abbrev-ref", "HEAD"], "x\n"), (["gh", "pr", "list"], vr.CommandError("no auth")))
    with pytest.raises(vr.CommandError):
        vr.find_pr_number({}, run)


def test_repo_comes_from_the_environment_or_gh():
    assert vr.repo_name({"GITHUB_REPOSITORY": "o/r"}, FakeRun()) == "o/r"
    assert vr.repo_name({}, FakeRun((["gh", "repo", "view"], "o2/r2\n"))) == "o2/r2"


def test_first_upsert_posts_a_new_comment_with_the_body_on_stdin():
    run = FakeRun((["gh", "api", "repos/o/r/issues/7/comments", "--paginate"], ""),
                  (["gh", "api", "--method", "POST", "repos/o/r/issues/7/comments"], ""))
    vr.upsert_comment(run, "o/r", 7, _record())
    command, stdin = run.api_calls()[-1]
    assert command[-2:] == ["--input", "-"]
    body = json.loads(stdin)["body"]
    assert body.startswith("<!-- visual-test-runs -->") and "| 2026-10-14 12:30 |" in body


def test_second_upsert_edits_the_existing_comment_and_appends_a_row():
    first = vr.render_comment(_data(_record(commit="first", started="2026-10-14T08:00:00Z")))
    existing = json.dumps({"id": 99, "body": first})
    run = FakeRun((["gh", "api", "repos/o/r/issues/7/comments", "--paginate"], existing + "\n"),
                  (["gh", "api", "--method", "PATCH", "repos/o/r/issues/comments/99"], ""))
    vr.upsert_comment(run, "o/r", 7, _record(commit="second", started="2026-10-14T09:00:00Z"))
    command, stdin = run.api_calls()[-1]
    assert command[3] == "PATCH"
    body = json.loads(stdin)["body"]
    assert [line.startswith("| 2026") for line in body.splitlines()].count(True) == 2
    assert not any(c[0][3] == "POST" for c in run.api_calls() if len(c[0]) > 3)


def test_unreadable_data_in_the_existing_comment_starts_the_history_over():
    existing = json.dumps({"id": 99, "body": "<!-- visual-test-runs -->\nhand edited"})
    run = FakeRun((["gh", "api", "repos/o/r/issues/7/comments", "--paginate"], existing + "\n"),
                  (["gh", "api", "--method", "PATCH"], ""))
    vr.upsert_comment(run, "o/r", 7, _record())
    body = json.loads(run.api_calls()[-1][1])["body"]
    assert [line.startswith("| 2026") for line in body.splitlines()].count(True) == 1


def test_find_comment_asks_gh_to_filter_by_the_marker():
    run = FakeRun((["gh", "api", "repos/o/r/issues/7/comments", "--paginate", "--jq"], ""))
    assert vr.find_comment(run, "o/r", 7) is None
    assert "<!-- visual-test-runs -->" in run.calls[0][0][-1]
