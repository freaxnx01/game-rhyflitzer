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
    """`tests.test_x.TestY` + `test_z` → `test_x.py::TestY::test_z`, as a test-dir-relative pytest id."""
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
            f"Reproduce: `python -m pytest \"tests/{test_id}\"`. Filed by the nightly test run (#389).\n\n"
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
