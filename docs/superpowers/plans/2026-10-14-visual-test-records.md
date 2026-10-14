# Visual test records per PR — implementation plan (#332)

**Goal:** every pytest session that launched a browser records where it ran, the renderer, each test with result and seconds, and the wall time, and keeps one "Visual tests" comment on the branch's open PR up to date. A posting problem is a warning, never a test failure.

**Architecture:** pure logic in a new `prototype/tests/visual_runs.py` (collector, record, comment rendering, `gh` calls through one injectable `run` function, `finish_session`); `prototype/tests/conftest.py` gets thin glue (a launch-counting wrapper installed after the GPU hook's patch, hooks that feed the collector, a `pytest_sessionfinish` that prints what `finish_session` returns). Spec: `docs/superpowers/specs/2026-10-14-visual-test-records-design.md`.

**Global constraints**

- Touch only `prototype/tests/visual_runs.py` (new), `prototype/tests/test_visual_runs.py` (new), `prototype/tests/conftest.py` and `.gitignore`.
- No new dependencies: standard library (`zoneinfo` included) plus the Playwright already installed.
- The new unit tests must not start a browser and must not call the real `gh`. Real temp files and real subprocesses (`sys.executable`) are fine; the `gh`/`git` runner is a fake passed as a parameter.
- The recorder must never change the session's exit status: all failure paths end in a warning line.
- Never put the GPU endpoint, an IP or a token into the record or the comment (the repo is public).
- No CHANGELOG entry: this is test tooling, nothing changes in the game.
- Python: use the interpreter the other Python tests use (`python3 -m pytest`, or `pipeline/.venv/bin/python -m pytest` if `python3` lacks Playwright). Run all verification in the foreground, never `run_in_background`.
- Test files live in `prototype/tests/`; run from that directory: `cd prototype/tests && python3 -m pytest test_visual_runs.py -q`.

---

## Task 1 — collector, record, launch counter, record file

**Files:** create `prototype/tests/visual_runs.py`, create `prototype/tests/test_visual_runs.py`.

**Interfaces (all in `visual_runs`):**

- `where_from(env, hostname=socket.gethostname) -> str` — `"gh-runner"` when `env["GITHUB_ACTIONS"] == "true"`, else `hostname()`.
- `renderer_from(gpu_endpoint) -> str` — `"GPU browser"` if the endpoint is set, else `"SwiftShader"`.
- `Collector(clock=time.monotonic, utcnow=...)` with `start()`, `begin(nodeid)`, `end()`, `launched()`, `report(nodeid, when, outcome, duration)`, `has_browser()`, `tests()`, `wall_seconds()`, `started_at()`.
- `counting_launch(collector, original)` — a `BrowserType.launch` replacement that calls `original`, then `collector.launched()`.
- `build_record(collector, env, gpu_endpoint, commit) -> dict`.
- `write_record(record, directory, pid=None) -> Path`.

### Step 1.1 — write the failing tests

`prototype/tests/test_visual_runs.py`:

```python
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
```

### Step 1.2 — run them, see them fail

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: collection error, `ModuleNotFoundError: No module named 'visual_runs'`.

### Step 1.3 — write the module

`prototype/tests/visual_runs.py`:

```python
"""#332: record every pytest session that launched a browser (where, renderer, tests, time) and keep one "Visual tests"
comment per PR up to date. conftest.py wires it; everything here is plain functions, unit-tested without a browser.

A launch is attributed to the test that is current when it happens. A module-scoped fixture that launches in its setup
therefore counts for the first test that uses it."""
import base64
import json
import os
import re
import socket
import subprocess
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

STAMP = "%Y-%m-%dT%H:%M:%SZ"


def where_from(env, hostname=socket.gethostname):
    return "gh-runner" if env.get("GITHUB_ACTIONS") == "true" else hostname()


def renderer_from(gpu_endpoint):
    return "GPU browser" if gpu_endpoint else "SwiftShader"


class Collector:
    def __init__(self, clock=time.monotonic, utcnow=lambda: datetime.now(timezone.utc)):
        self._clock, self._utcnow = clock, utcnow
        self._tests = {}
        self._current = None
        self._t0 = self._started = self._wall = None

    def start(self):
        self._t0, self._started = self._clock(), self._utcnow()

    def begin(self, nodeid):
        self._current = nodeid
        self._tests.setdefault(nodeid, {"nodeid": nodeid, "outcome": "passed", "seconds": 0.0, "browser": False})

    def end(self):
        self._current = None

    def launched(self):
        if self._current is not None:
            self._tests[self._current]["browser"] = True

    def report(self, nodeid, when, outcome, duration):
        test = self._tests.setdefault(nodeid, {"nodeid": nodeid, "outcome": "passed", "seconds": 0.0, "browser": False})
        if when == "call":
            test["outcome"], test["seconds"] = outcome, duration
        elif outcome == "failed":
            test["outcome"] = "error"
        elif when == "setup" and outcome == "skipped":
            test["outcome"] = "skipped"

    def has_browser(self):
        return any(test["browser"] for test in self._tests.values())

    def tests(self):
        return [{**test, "seconds": round(test["seconds"], 1)} for test in self._tests.values()]

    def wall_seconds(self):
        return round(self._clock() - self._t0, 1)

    def started_at(self):
        return self._started.strftime(STAMP)


def counting_launch(collector, original):
    def launch(self, *args, **kwargs):
        browser = original(self, *args, **kwargs)
        collector.launched()
        return browser
    return launch


def build_record(collector, env, gpu_endpoint, commit):
    return {
        "started_at": collector.started_at(),
        "where": where_from(env),
        "renderer": renderer_from(gpu_endpoint),
        "commit": commit,
        "wall_seconds": collector.wall_seconds(),
        "tests": collector.tests(),
    }


def write_record(record, directory, pid=None):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.strptime(record["started_at"], STAMP).strftime("%Y%m%dT%H%M%SZ")
    path = directory / f"{stamp}-{pid if pid is not None else os.getpid()}.json"
    path.write_text(json.dumps(record, indent=2) + "\n")
    return path
```

(The unused-looking imports `base64 json re subprocess zlib ZoneInfo` are used by Tasks 2–4; add them now so the header stays one block.)

### Step 1.4 — run them, see them pass

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: `13 passed`.

### Step 1.5 — commit

```bash
git add prototype/tests/visual_runs.py prototype/tests/test_visual_runs.py
git commit -m "test: collector and record for visual test runs (#332)"
```

---

## Task 2 — slim runs, history limits, embedded data round-trip

**Files:** modify `prototype/tests/visual_runs.py`, `prototype/tests/test_visual_runs.py`.

**Interfaces:**

- `slim(record) -> dict` — keys `started_at, where, renderer, commit, wall_seconds, count, files, passed, failed, skipped, tests`; only browser tests are counted and listed (`tests` items `{"id", "outcome", "seconds"}`); `files` are the file names of the browser tests, deduplicated in order of first appearance; `failed` counts `failed` and `error`.
- `empty_data() -> {"v": 1, "dropped": 0, "runs": []}`.
- `append_run(data, record) -> dict` — pure; appends `slim(record)`, keeps `tests` on the last `DETAIL_RUNS` (5) runs only, drops the oldest beyond `MAX_ROWS` (40) and counts them in `dropped`.
- `encode_data(data) -> str` / `decode_data(text) -> dict | None` — `base64(zlib(compact json))` inside `<!-- visual-test-runs-data: ... -->`; `decode_data` takes a whole comment body, returns `None` for anything missing or unreadable.

### Step 2.1 — append the failing tests

```python
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
```

### Step 2.2 — run, see them fail

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: the new tests fail with `AttributeError: module 'visual_runs' has no attribute 'slim'` (or `empty_data`, `encode_data`...).

### Step 2.3 — implement

Add below the Task 1 code (and the constants next to `STAMP` at the top):

```python
MARKER = "<!-- visual-test-runs -->"
DATA_RE = re.compile(r"<!-- visual-test-runs-data: ([A-Za-z0-9+/=]+) -->")
DETAIL_RUNS = 5
MAX_ROWS = 40
```

```python
def slim(record):
    browser_tests = [test for test in record["tests"] if test["browser"]]
    outcomes = [test["outcome"] for test in browser_tests]
    files = list(dict.fromkeys(test["nodeid"].split("::")[0].rsplit("/", 1)[-1] for test in browser_tests))
    return {
        "started_at": record["started_at"], "where": record["where"], "renderer": record["renderer"],
        "commit": record["commit"], "wall_seconds": record["wall_seconds"],
        "count": len(browser_tests), "files": files,
        "passed": outcomes.count("passed"),
        "failed": outcomes.count("failed") + outcomes.count("error"),
        "skipped": outcomes.count("skipped"),
        "tests": [{"id": t["nodeid"], "outcome": t["outcome"], "seconds": t["seconds"]} for t in browser_tests],
    }


def empty_data():
    return {"v": 1, "dropped": 0, "runs": []}


def append_run(data, record):
    runs = [*data["runs"], slim(record)]
    dropped = data["dropped"]
    while len(runs) > MAX_ROWS:
        runs.pop(0)
        dropped += 1
    detailed_from = len(runs) - DETAIL_RUNS
    runs = [run if index >= detailed_from else {**run, "tests": []} for index, run in enumerate(runs)]
    return {"v": 1, "dropped": dropped, "runs": runs}


def encode_data(data):
    packed = zlib.compress(json.dumps(data, separators=(",", ":")).encode())
    return f"<!-- visual-test-runs-data: {base64.b64encode(packed).decode()} -->"


def decode_data(text):
    match = DATA_RE.search(text)
    if match is None:
        return None
    try:
        data = json.loads(zlib.decompress(base64.b64decode(match.group(1))))
    except (ValueError, zlib.error):
        return None
    return data if isinstance(data, dict) and isinstance(data.get("runs"), list) else None
```

### Step 2.4 — run, see them pass

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: `23 passed` (the parametrised case counts four).

### Step 2.5 — commit

```bash
git add prototype/tests/visual_runs.py prototype/tests/test_visual_runs.py
git commit -m "test: bounded run history with embedded data for the visual test comment (#332)"
```

---

## Task 3 — render the comment

**Files:** modify `prototype/tests/visual_runs.py`, `prototype/tests/test_visual_runs.py`.

**Interface:** `render_comment(data) -> str` — marker on line 1, `encode_data(data)` on line 2, `### Visual tests`, optional `_N older runs dropped._`, the table (newest last), a `<details>` block per run that still has `tests`. The data embedded is the data actually rendered (after trimming). Constants: `BODY_LIMIT = 60000`, `TESTS_CELL_LIMIT = 120`, `ZURICH = ZoneInfo("Europe/Zurich")`.

### Step 3.1 — append the failing tests

```python
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
```

### Step 3.2 — run, see them fail

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: the new tests fail with `AttributeError ... 'render_comment'`.

### Step 3.3 — implement

Constants next to the others:

```python
ZURICH = ZoneInfo("Europe/Zurich")
BODY_LIMIT = 60000
TESTS_CELL_LIMIT = 120
MARKS = {"passed": "✓", "failed": "✗", "error": "✗", "skipped": "○"}
```

Functions:

```python
def _when(started_at):
    utc = datetime.strptime(started_at, STAMP).replace(tzinfo=timezone.utc)
    return utc.astimezone(ZURICH).strftime("%Y-%m-%d %H:%M")


def _result(run):
    parts = [f"{run[key]} {mark}" for key, mark in (("passed", "✓"), ("failed", "✗"), ("skipped", "○")) if run[key]]
    return " ".join(parts) or "–"


def _tests_cell(run):
    cell = f"{run['count']}: {', '.join(run['files'])}"
    return cell if len(cell) <= TESTS_CELL_LIMIT else cell[:TESTS_CELL_LIMIT - 1] + "…"


def _row(run):
    cells = [_when(run["started_at"]), run["where"], run["renderer"], _tests_cell(run), _result(run), f"{run['wall_seconds']:.0f}"]
    return "| " + " | ".join(cell.replace("|", "\\|") for cell in cells) + " |"


def _details(run):
    summary = " · ".join([_when(run["started_at"]), run["where"], run["renderer"], run["commit"]])
    lines = [f"- {MARKS[test['outcome']]} `{test['id']}` {test['seconds']:.1f} s" for test in run["tests"]]
    return "\n".join(["<details>", f"<summary>{summary}</summary>", "", *lines, "", "</details>"])


def _body(data):
    lines = [MARKER, encode_data(data), "", "### Visual tests", ""]
    if data["dropped"]:
        lines += [f"_{data['dropped']} older runs dropped._", ""]
    lines += ["| When | Where | Renderer | Tests | Result | Time (s) |", "|---|---|---|---|---|---|"]
    lines += [_row(run) for run in data["runs"]]
    lines += ["", *[_details(run) + "\n" for run in data["runs"] if run["tests"]]]
    return "\n".join(lines)


def _trim_once(data):
    """Strip the per-test details of the oldest run that has any; with none left, drop the oldest row."""
    runs = data["runs"]
    for index, run in enumerate(runs):
        if run["tests"]:
            runs[index] = {**run, "tests": []}
            return
    runs.pop(0)
    data["dropped"] += 1


def render_comment(data):
    data = {**data, "runs": list(data["runs"])}
    body = _body(data)
    while len(body) > BODY_LIMIT and data["runs"]:
        _trim_once(data)
        body = _body(data)
    return body
```

### Step 3.4 — run, see them pass

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: `32 passed`. If `test_a_huge_history...` still exceeds the limit, the data blob is the cause: check that `_trim_once` empties `tests` in the *data* (it does, because `_body` re-encodes `data`), do not raise the limit.

### Step 3.5 — commit

```bash
git add prototype/tests/visual_runs.py prototype/tests/test_visual_runs.py
git commit -m "test: render the visual tests PR comment within GitHub's size limit (#332)"
```

---

## Task 4 — command runner, PR lookup, comment upsert

**Files:** modify `prototype/tests/visual_runs.py`, `prototype/tests/test_visual_runs.py`.

**Interfaces:**

- `CommandError(Exception)`.
- `run_command(cmd, stdin=None, timeout=15) -> str` — stdout; `CommandError` on a missing binary, a timeout or a non-zero exit. This is the **only** place that spawns a process; every other function takes a `run` parameter with this signature.
- `commit_sha(env, run) -> str` — `PR_HEAD_SHA`, then `GITHUB_SHA` (first 7 characters), then `git rev-parse --short HEAD`, else `"unknown"`.
- `find_pr_number(env, run) -> int | None`.
- `repo_name(env, run) -> str`.
- `find_comment(run, repo, pr) -> dict | None` — `{"id", "body"}` of the first marker comment.
- `upsert_comment(run, repo, pr, record) -> None`.

### Step 4.1 — append the failing tests

```python
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
```

### Step 4.2 — run, see them fail

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: the new tests fail with `AttributeError ... 'run_command'` / `'CommandError'`.

### Step 4.3 — implement

Constants: `PR_REF = re.compile(r"refs/pull/(\d+)/merge")`, `COMMAND_TIMEOUT = 15`.

```python
class CommandError(Exception):
    pass


def run_command(cmd, stdin=None, timeout=COMMAND_TIMEOUT):
    try:
        done = subprocess.run(cmd, input=stdin, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise CommandError(f"{cmd[0]}: {error}") from error
    if done.returncode != 0:
        raise CommandError(f"{' '.join(cmd[:3])} exited {done.returncode}: {done.stderr.strip()[:200]}")
    return done.stdout


def commit_sha(env, run):
    for key in ("PR_HEAD_SHA", "GITHUB_SHA"):   # on pull_request events GITHUB_SHA is the merge commit
        value = (env.get(key) or "").strip()
        if value:
            return value[:7]
    try:
        return run(["git", "rev-parse", "--short", "HEAD"]).strip() or "unknown"
    except CommandError:
        return "unknown"


def find_pr_number(env, run):
    match = PR_REF.fullmatch(env.get("GITHUB_REF", ""))
    if match:
        return int(match.group(1))
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).strip()
    if branch in ("", "HEAD"):
        return None
    number = run(["gh", "pr", "list", "--head", branch, "--state", "open", "--json", "number", "-q", ".[0].number"]).strip()
    return int(number) if number.isdigit() else None


def repo_name(env, run):
    return env.get("GITHUB_REPOSITORY") or run(["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).strip()


def find_comment(run, repo, pr):
    keep = f'.[] | select(.body | contains("{MARKER}")) | {{id: .id, body: .body}}'   # one JSON object per line, whatever the paging
    for line in run(["gh", "api", f"repos/{repo}/issues/{pr}/comments", "--paginate", "--jq", keep]).splitlines():
        if line.strip():
            return json.loads(line)
    return None


def upsert_comment(run, repo, pr, record):
    existing = find_comment(run, repo, pr)
    data = (existing and decode_data(existing["body"])) or empty_data()
    payload = json.dumps({"body": render_comment(append_run(data, record))})
    if existing:
        run(["gh", "api", "--method", "PATCH", f"repos/{repo}/issues/comments/{existing['id']}", "--input", "-"], stdin=payload)
    else:
        run(["gh", "api", "--method", "POST", f"repos/{repo}/issues/{pr}/comments", "--input", "-"], stdin=payload)
```

### Step 4.4 — run, see them pass

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: all pass (`51 passed` give or take the parametrised cases).

### Step 4.5 — commit

```bash
git add prototype/tests/visual_runs.py prototype/tests/test_visual_runs.py
git commit -m "test: find the PR and upsert the visual tests comment through one gh runner (#332)"
```

---

## Task 5 — `finish_session`, the one boundary

**Files:** modify `prototype/tests/visual_runs.py`, `prototype/tests/test_visual_runs.py`.

**Interface:** `finish_session(collector, env, gpu_endpoint, directory, run=run_command) -> list[str]` — returns the terminal lines to print (empty for a session without a browser); never raises.

### Step 5.1 — append the failing tests

```python
def _browser_collector():
    collector = _collector()
    _run_test(collector, "prototype/tests/test_a.py::visual", browsers=1)
    return collector


def _gh_with_open_pr():
    return FakeRun((["git", "rev-parse", "--short", "HEAD"], "abc1234\n"),
                   (["gh", "api", "repos/o/r/issues/7/comments", "--paginate"], ""),
                   (["gh", "api", "--method", "POST"], ""))


ON_PR = {"GITHUB_REPOSITORY": "o/r", "GITHUB_REF": "refs/pull/7/merge"}


def test_a_session_without_a_browser_leaves_nothing_and_runs_nothing(tmp_path):
    collector = _collector()
    _run_test(collector, "t.py::pure")
    run = FakeRun()
    assert vr.finish_session(collector, ON_PR, None, tmp_path / ".test-runs", run) == []
    assert run.calls == [] and not (tmp_path / ".test-runs").exists()


def test_a_browser_session_on_a_pr_writes_the_record_and_posts(tmp_path):
    run = _gh_with_open_pr()
    lines = vr.finish_session(_browser_collector(), ON_PR, None, tmp_path / ".test-runs", run)
    assert len(list((tmp_path / ".test-runs").glob("*.json"))) == 1
    assert any(cmd[3] == "POST" for cmd, _ in run.api_calls() if len(cmd) > 3)
    assert any("PR#7" in line for line in lines)


def test_without_an_open_pr_only_the_file_is_written(tmp_path):
    run = FakeRun((["git", "rev-parse", "--short", "HEAD"], "abc1234\n"),
                  (["git", "rev-parse", "--abbrev-ref", "HEAD"], "scratch\n"),
                  (["gh", "pr", "list"], "null\n"))
    lines = vr.finish_session(_browser_collector(), {}, None, tmp_path / ".test-runs", run)
    assert len(list((tmp_path / ".test-runs").glob("*.json"))) == 1
    assert run.api_calls() == []
    assert not any("could not" in line for line in lines)


def test_a_gh_failure_is_one_warning_and_the_file_stays(tmp_path):
    run = FakeRun((["git", "rev-parse", "--short", "HEAD"], "abc1234\n"),
                  (["gh", "api"], vr.CommandError("gh api exited 1: bad credentials")))
    lines = vr.finish_session(_browser_collector(), ON_PR, None, tmp_path / ".test-runs", run)
    assert len(list((tmp_path / ".test-runs").glob("*.json"))) == 1
    warnings = [line for line in lines if "could not post" in line]
    assert len(warnings) == 1 and "bad credentials" in warnings[0]


def test_an_unexpected_error_is_reported_not_raised(tmp_path):
    blocker = tmp_path / "blocked"
    blocker.write_text("a file where the directory should go")
    lines = vr.finish_session(_browser_collector(), ON_PR, None, blocker / ".test-runs", _gh_with_open_pr())
    assert len(lines) == 1 and "not recorded" in lines[0]


def test_no_line_mentions_the_gpu_endpoint(tmp_path):
    lines = vr.finish_session(_browser_collector(), ON_PR, "http://gpu.example:9223", tmp_path / ".test-runs", _gh_with_open_pr())
    assert not any("gpu.example" in line for line in lines)
```

### Step 5.2 — run, see them fail

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py -q
```

Expected: `AttributeError ... 'finish_session'`.

### Step 5.3 — implement

```python
def _post(record, env, run):
    pr = find_pr_number(env, run)
    if pr is None:
        return None
    upsert_comment(run, repo_name(env, run), pr, record)
    return f"visual tests: updated the comment on PR#{pr}"


def finish_session(collector, env, gpu_endpoint, directory, run=run_command):
    if not collector.has_browser():
        return []
    try:   # the recorder must never change the session's exit status
        record = build_record(collector, env, gpu_endpoint, commit_sha(env, run))
        lines = [f"visual tests: record written to {write_record(record, directory).name}"]
        try:
            posted = _post(record, env, run)
        except CommandError as error:
            return [*lines, f"visual tests: could not post to the PR ({error})"]
        return [*lines, posted] if posted else lines
    except Exception as error:
        return [f"visual tests: not recorded ({error})"]
```

### Step 5.4 — run, see them pass

```bash
cd prototype/tests && python3 -m pytest test_visual_runs.py test_gpu_browser.py -q
```

Expected: all pass, no `.test-runs` directory appears under `prototype/` (no test launches a browser).

### Step 5.5 — commit

```bash
git add prototype/tests/visual_runs.py prototype/tests/test_visual_runs.py
git commit -m "test: finish_session writes the record and posts without ever failing the run (#332)"
```

---

## Task 6 — conftest glue and .gitignore

**Files:** modify `prototype/tests/conftest.py`, `.gitignore`.

There is no unit test for the glue (it needs a browser session to run end to end); keep it thin and verify as in Step 6.3.

### Step 6.1 — `.gitignore`

Append:

```gitignore

# visual test records, one JSON per browser test session (see prototype/tests/visual_runs.py)
.test-runs/
```

### Step 6.2 — `conftest.py`

Add `import visual_runs` next to `import gpu_browser`. Then restructure the session hooks: the GPU patch moves into a helper (the early `return` would otherwise skip the wrapper), and the launch wrapper is installed **after** it and removed **before** it.

```python
# #324: the GPU browser (#304), opt-in via PW_CDP_ENDPOINT; resolved once per session in pytest_configure
GPU = {"endpoint": None, "launch": None}
# #332: records every session that launched a browser; wraps whatever BrowserType.launch is current (after the GPU patch)
RUNS = visual_runs.Collector()
RUN_HOOK = {"launch": None}


def _install_gpu_hook(config):
    endpoint, warning = gpu_browser.resolve_endpoint(os.environ)
    if warning:
        config.issue_config_time_warning(pytest.PytestConfigWarning(warning), stacklevel=2)
    if endpoint is None:
        return
    GPU["endpoint"], GPU["launch"] = endpoint, BrowserType.launch
    BrowserType.launch = gpu_browser.remote_launch(endpoint, BrowserType.launch)


def pytest_configure(config):
    _install_gpu_hook(config)
    RUNS.start()
    RUN_HOOK["launch"] = BrowserType.launch
    BrowserType.launch = visual_runs.counting_launch(RUNS, BrowserType.launch)


def pytest_unconfigure(config):
    if RUN_HOOK["launch"] is not None:
        BrowserType.launch = RUN_HOOK["launch"]
        RUN_HOOK["launch"] = None
    if GPU["launch"] is not None:
        BrowserType.launch = GPU["launch"]
        GPU["endpoint"] = GPU["launch"] = None


def pytest_runtest_logstart(nodeid, location):
    RUNS.begin(nodeid)


def pytest_runtest_logfinish(nodeid, location):
    RUNS.end()


def pytest_runtest_logreport(report):
    RUNS.report(report.nodeid, report.when, report.outcome, report.duration)


def pytest_sessionfinish(session, exitstatus):
    if hasattr(session.config, "workerinput"):   # an xdist worker: the controller sees no launches
        return
    lines = visual_runs.finish_session(RUNS, os.environ, GPU["endpoint"], ROOT / ".test-runs")
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    for line in lines:
        reporter.write_line(line) if reporter else print(line)
```

`pytest_report_header` and the two server fixtures stay as they are.

### Step 6.3 — verify

All in the foreground, from `prototype/tests`:

```bash
python3 -m pytest test_visual_runs.py test_gpu_browser.py -q
```

Expected: everything passes; no `.test-runs/` appears (neither file launches a browser); header still prints `GPU browser: off`.

One cheap end-to-end check with the one-test browser file, **before the PR is opened** (so no comment is posted) and with a token-less environment so a post could not succeed anyway:

```bash
python3 -m pytest test_kreisel.py -q -s
ls ../../.test-runs/
python3 -c "import json,glob; print(json.load(open(sorted(glob.glob('../../.test-runs/*.json'))[-1])))"
rm -r ../../.test-runs
```

Expected: the session passes; the terminal shows `visual tests: record written to <timestamp>-<pid>.json`; the JSON has `renderer: SwiftShader`, your hostname, one test with `browser: true`, and no URL or IP. If the branch already has an open PR, expect the extra line `updated the comment on PR#<n>` and check the comment once; delete the test comment afterwards if it is not wanted.

Also confirm the exit status is untouched when `gh` is unusable: `PATH=/nonexistent python3 -m pytest test_kreisel.py -q` is not possible without python, so instead rely on `test_a_gh_failure_is_one_warning_and_the_file_stays`.

### Step 6.4 — commit

```bash
git add prototype/tests/conftest.py .gitignore
git commit -m "test: record visual test runs per PR from the pytest session (#332)"
```

PR body: list the acceptance criteria from the spec; say that the comment on a real PR can only be seen on a PR whose branch ran a browser test, and note for #330 the CI needs `GH_TOKEN`, `permissions: pull-requests: write, issues: write` and optionally `PR_HEAD_SHA`.
