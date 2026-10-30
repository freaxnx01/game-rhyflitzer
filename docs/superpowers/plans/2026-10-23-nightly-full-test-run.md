# Nightly full test run on `main` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the whole test suite on `main` every night and file one `needs-enrichment` issue per red test that no open issue covers yet.

**Architecture:** A `schedule:` trigger on the existing `tests.yml` makes `plan` select every test file on hosted runners. A new `nightly` job, scheduled runs only, feeds the junit artifacts to `prototype/tests/nightly_report.py`. That script keeps its decisions pure (`parse_junit`, `owner_of`, `plan_actions`) and makes its GitHub calls through `gh` in one thin `apply`.

**Tech Stack:** GitHub Actions, Python 3.12 stdlib (`xml.etree`, `subprocess`), pytest, `gh` CLI.

**Spec:** [docs/superpowers/specs/2026-10-23-nightly-full-test-run-design.md](../specs/2026-10-23-nightly-full-test-run-design.md)

## Global Constraints

- Keep the required-check job `tests` (name `tests`) unchanged. Do not rename it.
- Pin actions by full SHA with the version comment. Reuse the SHAs already in `tests.yml`: checkout `11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2), download-artifact `d3f86a106a0bac45b974a628896c90dbdf5c8093` (v4.3.0).
- No new Python dependency: `nightly_report.py` uses the stdlib only, so it runs on bare `ubuntu-latest` `python3`.
- Cron: `30 2 * * *` (UTC).
- Issue label: `needs-enrichment` (it already exists in the repo).
- Marker strings, verbatim: `<!-- nightly-test: <test_id> -->`, `<!-- nightly-state: green -->`, `<!-- nightly-state: red -->`, run key `__run__`.

## Review Focus

- A test id that is a prefix of another (`test_a.py::test_b` vs `test_a.py::test_bc`) must not count as owned by the other's issue (Task 1 test `test_owner_of_does_not_match_a_longer_id`).
- A parametrised id with brackets and spaces (`test_x.py::test_y[a b]`) round-trips from junit to the issue unchanged (Task 1 test `test_parse_junit_builds_node_ids`).
- A night that is still red on a nightly issue must not comment every night (Task 1 test `test_plan_actions_stays_quiet_on_a_known_red_test`).
- A shard that timed out leaves no junit file. That must produce a red run and the `__run__` issue, not silence (Task 1 test `test_plan_actions_reports_a_broken_night`).
- A hand-filed issue that names the test (like #353) suppresses a new issue but never gets nightly notes (Task 1 test `test_plan_actions_leaves_hand_filed_issues_alone`).

---

### Task 1: `nightly_report.py` — decisions, with tests

**Files:**
- Create: `prototype/tests/nightly_report.py`
- Create: `prototype/tests/test_nightly_report.py`
- Modify: `prototype/tests/test-map.json` (add the mapping as the first entry)

**Interfaces:**
- Produces: `node_id(classname: str, name: str) -> str`; `parse_junit(paths: list[Path]) -> dict[str, tuple[str, str]]` (id → (`"passed"|"failed"`, message)); `owner_of(test_id: str, issues: list[dict]) -> dict | None`; `plan_actions(results, issues, run_url: str, broken: bool) -> list[dict]` where an action is `{"kind": "create", "title": str, "body": str}` or `{"kind": "comment", "number": int, "body": str}`. Issues are dicts with `number`, `title`, `body` and `comments` (a list of `{"body": str}`), as `gh issue list --json number,title,body,comments` returns them.

- [ ] **Step 1: Write the failing tests** in `prototype/tests/test_nightly_report.py`:

```python
"""#389: the nightly report's decisions, no network, no browser."""
from pathlib import Path

import nightly_report as nr

RUN = "https://github.com/o/r/actions/runs/1"


def junit(tmp_path, name, cases):
    body = "".join(cases)
    path = tmp_path / name
    path.write_text(f'<?xml version="1.0"?><testsuites><testsuite name="pytest">{body}</testsuite></testsuites>')
    return path


def case(classname, name, inner=""):
    return f'<testcase classname="{classname}" name="{name}" time="1.0">{inner}</testcase>'


def issue(number, title="", body="", comments=()):
    return {"number": number, "title": title, "body": body, "comments": [{"body": c} for c in comments]}


def test_node_id_drops_the_package_path():
    assert nr.node_id("prototype.tests.test_hideout", "test_spokes") == "test_hideout.py::test_spokes"


def test_node_id_keeps_a_class():
    assert nr.node_id("prototype.tests.test_beam.TestBeam", "test_x") == "test_beam.py::TestBeam::test_x"


def test_parse_junit_builds_node_ids(tmp_path):
    path = junit(tmp_path, "a.xml", [
        case("prototype.tests.test_x", "test_y[a b]"),
        case("prototype.tests.test_x", "test_z", '<failure message="boom">trace</failure>'),
        case("prototype.tests.test_x", "test_e", '<error message="setup">err</error>'),
        case("prototype.tests.test_x", "test_s", '<skipped message="no gpu"/>'),
    ])
    results = nr.parse_junit([path])
    assert results["test_x.py::test_y[a b]"] == ("passed", "")
    assert results["test_x.py::test_z"][0] == "failed" and "boom" in results["test_x.py::test_z"][1]
    assert results["test_x.py::test_e"][0] == "failed"
    assert "test_x.py::test_s" not in results


def test_owner_of_prefers_the_marker():
    marked = issue(7, body=nr.marker("test_a.py::test_b"))
    assert nr.owner_of("test_a.py::test_b", [issue(3, body="see test_a.py::test_b"), marked])["number"] == 7


def test_owner_of_finds_a_hand_filed_issue_by_verbatim_id():
    assert nr.owner_of("test_a.py::test_b", [issue(3, title="x", body="fails: test_a.py::test_b on main")])["number"] == 3


def test_owner_of_does_not_match_a_longer_id():
    assert nr.owner_of("test_a.py::test_b", [issue(3, body="test_a.py::test_bc is red")]) is None


def test_plan_actions_files_one_issue_per_new_red_test():
    actions = nr.plan_actions({"test_a.py::test_b": ("failed", "boom")}, [], RUN, broken=False)
    assert len(actions) == 1
    create = actions[0]
    assert create["kind"] == "create"
    assert create["title"] == "test: test_a.py::test_b is red on main"
    assert nr.marker("test_a.py::test_b") in create["body"] and RUN in create["body"] and "boom" in create["body"]


def test_plan_actions_files_nothing_for_an_owned_red_test():
    owned = [issue(3, body="test_a.py::test_b")]
    assert nr.plan_actions({"test_a.py::test_b": ("failed", "boom")}, owned, RUN, broken=False) == []


def test_plan_actions_stays_quiet_on_a_known_red_test():
    owned = [issue(7, body=nr.marker("test_a.py::test_b"))]
    assert nr.plan_actions({"test_a.py::test_b": ("failed", "boom")}, owned, RUN, broken=False) == []


def test_plan_actions_notes_green_once():
    owned = [issue(7, body=nr.marker("test_a.py::test_b"))]
    actions = nr.plan_actions({"test_a.py::test_b": ("passed", "")}, owned, RUN, broken=False)
    assert actions == [{"kind": "comment", "number": 7, "body": f"Passed on main in {RUN}.\n\n{nr.GREEN}"}]
    noted = [issue(7, body=nr.marker("test_a.py::test_b"), comments=[actions[0]["body"]])]
    assert nr.plan_actions({"test_a.py::test_b": ("passed", "")}, noted, RUN, broken=False) == []


def test_plan_actions_notes_red_again_after_green():
    noted = [issue(7, body=nr.marker("test_a.py::test_b"), comments=[f"Passed.\n\n{nr.GREEN}"])]
    actions = nr.plan_actions({"test_a.py::test_b": ("failed", "boom")}, noted, RUN, broken=False)
    assert actions == [{"kind": "comment", "number": 7, "body": f"Red again on main in {RUN}.\n\n{nr.RED}"}]


def test_plan_actions_leaves_hand_filed_issues_alone():
    hand = [issue(3, body="test_a.py::test_b fails")]
    assert nr.plan_actions({"test_a.py::test_b": ("passed", "")}, hand, RUN, broken=False) == []


def test_plan_actions_reports_a_broken_night():
    actions = nr.plan_actions({}, [], RUN, broken=True)
    assert [a["title"] for a in actions] == ["test: the nightly test run on main is broken"]
    assert nr.marker(nr.RUN_KEY) in actions[0]["body"]
    already = [issue(9, body=nr.marker(nr.RUN_KEY))]
    assert nr.plan_actions({}, already, RUN, broken=True) == []


def test_is_broken_when_the_plan_failed_or_a_shard_left_no_junit():
    assert nr.is_broken("failure", "[0,1]", 2) is True
    assert nr.is_broken("success", "[0,1]", 1) is True
    assert nr.is_broken("success", "[0,1]", 2) is False
    assert nr.is_broken("success", "", 0) is True
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `python -m pytest prototype/tests/test_nightly_report.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'nightly_report'`.

- [ ] **Step 3: Write `prototype/tests/nightly_report.py`**

```python
"""#389: after the nightly full run on main, file one issue per red test that no open issue covers yet.

Decisions are pure (parse_junit, owner_of, plan_actions, is_broken); apply() is the only part that talks to GitHub.
"""
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

GREEN = "<!-- nightly-state: green -->"
RED = "<!-- nightly-state: red -->"
RUN_KEY = "__run__"
LABEL = "needs-enrichment"
MESSAGE_LINES = 40


def marker(test_id):
    return f"<!-- nightly-test: {test_id} -->"


def node_id(classname, name):
    """`prototype.tests.test_x.TestY` + `test_z` → `test_x.py::TestY::test_z`, as a test-dir-relative pytest id."""
    parts = classname.split(".")
    modules = [i for i, part in enumerate(parts) if part.startswith("test_")]
    if not modules:
        return f"{classname}::{name}"
    i = modules[0]
    return "::".join([parts[i] + ".py", *parts[i + 1:], name])


def parse_junit(paths):
    results = {}
    for path in paths:
        for testcase in ET.parse(path).getroot().iter("testcase"):
            if testcase.find("skipped") is not None:
                continue
            problem = testcase.find("failure")
            if problem is None:
                problem = testcase.find("error")
            test_id = node_id(testcase.get("classname", ""), testcase.get("name", ""))
            if problem is None:
                results[test_id] = ("passed", "")
            else:
                results[test_id] = ("failed", f"{problem.get('message', '')}\n{problem.text or ''}".strip())
    return results


def is_nightly(issue):
    return "<!-- nightly-test: " in (issue.get("body") or "")


def owner_of(test_id, issues):
    for issue in issues:
        if marker(test_id) in (issue.get("body") or ""):
            return issue
    verbatim = re.compile(re.escape(test_id) + r"(?![\w\[])")
    for issue in issues:
        if verbatim.search(issue.get("title") or "") or verbatim.search(issue.get("body") or ""):
            return issue
    return None


def last_state(issue):
    for comment in reversed(issue.get("comments") or []):
        body = comment.get("body") or ""
        if GREEN in body:
            return "green"
        if RED in body:
            return "red"
    return None


def red_issue(test_id, message, run_url):
    excerpt = "\n".join(message.splitlines()[:MESSAGE_LINES])
    body = (f"`{test_id}` fails on `main` in the nightly full run: {run_url}\n\n~~~\n{excerpt}\n~~~\n\n"
            f"Reproduce: `python -m pytest \"prototype/tests/{test_id}\"`. Filed by the nightly test run (#389).\n\n"
            f"{marker(test_id)}")
    return {"kind": "create", "title": f"test: {test_id} is red on main", "body": body}


def broken_issue(run_url):
    body = (f"The nightly full test run on `main` did not produce a result for every shard: {run_url}\n\n"
            f"The plan job failed or a browser shard left no junit report (timeout, crash), so some tests went "
            f"unchecked. Filed by the nightly test run (#389).\n\n{marker(RUN_KEY)}")
    return {"kind": "create", "title": "test: the nightly test run on main is broken", "body": body}


def note(issue, state, run_url):
    text = f"Passed on main in {run_url}." if state == "green" else f"Red again on main in {run_url}."
    return {"kind": "comment", "number": issue["number"], "body": f"{text}\n\n{GREEN if state == 'green' else RED}"}


def plan_actions(results, issues, run_url, broken):
    actions = []
    if broken and not any(marker(RUN_KEY) in (i.get("body") or "") for i in issues):
        actions.append(broken_issue(run_url))
    for test_id in sorted(results):
        state, message = results[test_id]
        owner = owner_of(test_id, issues)
        if owner is None:
            if state == "failed":
                actions.append(red_issue(test_id, message, run_url))
            continue
        if not is_nightly(owner):
            continue
        previous = last_state(owner)
        if state == "passed" and previous != "green":
            actions.append(note(owner, "green", run_url))
        elif state == "failed" and previous == "green":
            actions.append(note(owner, "red", run_url))
    return actions


def is_broken(plan_result, shards_json, junit_files):
    if plan_result != "success" or not shards_json:
        return True
    return junit_files < len(json.loads(shards_json))


def gh(*args, body):
    subprocess.run(["gh", *args, "--body-file", "-"], input=body, text=True, check=True)


def apply(actions, repo):
    for action in actions:
        if action["kind"] == "create":
            gh("issue", "create", "--repo", repo, "--title", action["title"], "--label", LABEL, body=action["body"])
        else:
            gh("issue", "comment", str(action["number"]), "--repo", repo, body=action["body"])


def open_issues(repo):
    out = subprocess.run(["gh", "issue", "list", "--repo", repo, "--state", "open", "--limit", "1000",
                          "--json", "number,title,body,comments"], text=True, capture_output=True, check=True).stdout
    return json.loads(out)


def main():
    repo, run_url = os.environ["REPO"], os.environ["RUN_URL"]
    files = sorted(Path(sys.argv[1] if len(sys.argv) > 1 else "junit").glob("*/junit.xml"))
    broken = is_broken(os.environ.get("PLAN", ""), os.environ.get("SHARDS", ""), len(files))
    actions = plan_actions(parse_junit(files), open_issues(repo), run_url, broken)
    for action in actions:
        print(action["kind"], action.get("title") or f"#{action['number']}")
    apply(actions, repo)
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
```

Note on `node_id`: pytest's junit `classname` is the dotted module path (`prototype.tests.test_x`) plus any class. The first `test_`-prefixed part is the module, and anything after it is a class.

- [ ] **Step 4: Map the script to its tests** by adding this line as the first entry of `prototype/tests/test-map.json`, right after `{`:

```json
  "prototype/tests/nightly_report.py": ["test_nightly_report.py"],
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `python -m pytest prototype/tests/test_nightly_report.py prototype/tests/test_select_tests.py -q`
Expected: all pass. `test_select_tests.py` guards the `test-map.json` edit.

- [ ] **Step 6: Commit and push**

```bash
git add prototype/tests/nightly_report.py prototype/tests/test_nightly_report.py prototype/tests/test-map.json
git commit -m "test(ci): nightly report files one issue per new red test (#389)"
git push
```

### Task 2: schedule the full run and add the `nightly` job in `tests.yml`

**Files:**
- Modify: `.github/workflows/tests.yml`

**Interfaces:**
- Consumes: `python3 prototype/tests/nightly_report.py <junit-dir>` from Task 1, with env `REPO`, `RUN_URL`, `PLAN`, `SHARDS`, `GH_TOKEN`. It exits 1 on a broken night.

- [ ] **Step 1: Add the trigger** under `on:`, after the `workflow_dispatch:` block:

```yaml
  schedule:
    - cron: "30 2 * * *"   # #389: the whole suite on main every night; the nightly job files the red tests
```

- [ ] **Step 2: Give the scheduled run its own concurrency group.** Replace the `group:` line with:

```yaml
  group: tests-${{ github.event_name == 'schedule' && 'nightly' || github.event.pull_request.number || github.ref }}
```

- [ ] **Step 3: Select everything on schedule.** In the step "Select the affected browser tests", change the `ALL` env line to:

```yaml
          ALL: ${{ inputs.all || github.event_name == 'schedule' }}   # #389: the nightly run takes every file
```

Leave the "Pick the runners" step alone: a `schedule` event is neither `workflow_dispatch` nor `pull_request`, so it already gets `ubuntu-latest` and `MAX_SHARDS` shards. That is the hosted choice the spec makes.

- [ ] **Step 4: Append the `nightly` job** at the end of `jobs:`:

```yaml
  # #389: on the scheduled full run, one issue per red test that no open issue covers yet (prototype/tests/nightly_report.py)
  nightly:
    needs: [plan, browser, tests]
    if: always() && github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2

      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093  # v4.3.0
        continue-on-error: true   # no junit at all is a broken night, and the report says so
        with:
          pattern: junit-*
          path: junit

      - name: File the red tests
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          PLAN: ${{ needs.plan.result }}
          SHARDS: ${{ needs.plan.outputs.shards }}
        run: python3 prototype/tests/nightly_report.py junit
```

- [ ] **Step 5: Lint the workflow**

Run: `actionlint .github/workflows/tests.yml` if `actionlint` is installed. Otherwise run `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/tests.yml'))"`.
Expected: no errors.

- [ ] **Step 6: Commit and push**

```bash
git add .github/workflows/tests.yml
git commit -m "ci(test): run the whole suite on main every night and file the red tests (#389)"
git push
```

### Task 3: full verification

- [ ] **Step 1:** Run `python -m pytest prototype/tests/test_nightly_report.py prototype/tests/test_select_tests.py -q` and `node --test prototype/tests/*.test.mjs`. Expected: all green.
- [ ] **Step 2:** In the PR description, state that the first real check is the next scheduled night, or a maintainer's manual trigger after merge. `workflow_dispatch` does not run the `nightly` job, by design, because only `schedule` files issues.
