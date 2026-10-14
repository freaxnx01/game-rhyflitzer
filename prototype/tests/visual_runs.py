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
MARKER = "<!-- visual-test-runs -->"
DATA_RE = re.compile(r"<!-- visual-test-runs-data: ([A-Za-z0-9+/=]+) -->")
DETAIL_RUNS = 5
MAX_ROWS = 40


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
