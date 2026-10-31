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
    assert nr.node_id("tests.test_hideout", "test_spokes") == "test_hideout.py::test_spokes"


def test_node_id_keeps_a_class():
    assert nr.node_id("tests.test_beam.TestBeam", "test_x") == "test_beam.py::TestBeam::test_x"


def test_parse_junit_builds_node_ids(tmp_path):
    path = junit(tmp_path, "a.xml", [
        case("tests.test_x", "test_y[a b]"),
        case("tests.test_x", "test_z", '<failure message="boom">trace</failure>'),
        case("tests.test_x", "test_e", '<error message="setup">err</error>'),
        case("tests.test_x", "test_s", '<skipped message="no gpu"/>'),
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
