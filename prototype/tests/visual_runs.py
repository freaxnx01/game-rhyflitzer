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
ZURICH = ZoneInfo("Europe/Zurich")
BODY_LIMIT = 60000
TESTS_CELL_LIMIT = 120
MARKS = {"passed": "✓", "failed": "✗", "error": "✗", "skipped": "○"}
PR_REF = re.compile(r"refs/pull/(\d+)/merge")
COMMAND_TIMEOUT = 15


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
