"""#330: the affected-tests selection. Pure: no browser, no git."""
import json
from pathlib import Path

import select_tests as st

HERE = Path(__file__).parent
EXISTING = {"test_smoke.py", "test_heli.py", "test_pontoon.py", "test_select_tests.py", "test_vehicles.py", "test_wheels.py",
            "test_credits.py"} | {f"test_extra{i}.py" for i in range(10)}
MAP = {"prototype/heli*.js": ["test_heli.py"], "prototype/pontoon.js": ["test_pontoon.py"],
       "README.md": ["test_credits.py"], "prototype/tests/test_vehicles.py": ["test_wheels.py"]}


def pick(*paths, test_map=MAP):
    files, reasons, capped = st.select(list(paths), test_map, EXISTING)
    return files, reasons, capped


def test_select_a_changed_test_file_selects_itself():
    assert pick("prototype/tests/test_pontoon.py")[0] == ["test_pontoon.py"]


def test_select_a_deleted_test_file_selects_nothing():
    assert pick("prototype/tests/test_gone.py")[0] == []


def test_select_a_mapped_module_selects_its_owner_tests():
    files, reasons, _ = pick("prototype/heli.js")
    assert files == ["test_heli.py"]
    assert "b:" in reasons["test_heli.py"][0]


def test_select_the_map_globs_match_across_the_name():
    assert pick("prototype/helicopter.js")[0] == ["test_heli.py"]


def test_select_a_changed_helper_test_file_also_selects_its_dependents():
    assert pick("prototype/tests/test_vehicles.py")[0] == ["test_vehicles.py", "test_wheels.py"]


def test_select_docs_and_workflows_run_no_browser_test():
    assert pick("docs/superpowers/specs/x.md", ".github/workflows/agent.yml", "TODO.md", "test-todo.md")[0] == []


def test_select_a_mapping_beats_the_docs_rule():
    assert pick("README.md")[0] == ["test_credits.py"]


def test_select_node_tests_and_pipeline_and_service_run_no_browser_test():
    assert pick("prototype/tests/world.test.mjs", "pipeline/geo.py", "service/rhyflitzer_api/x.py")[0] == []


def test_select_an_unmapped_game_file_falls_back_to_the_smoke_set():
    for path in ("prototype/index.html", "prototype/world.js", "index.html", "data/world_hochrhein.json", "prototype/textures/a.jpg"):
        files, reasons, _ = pick(path)
        assert files == ["test_smoke.py"], path
        assert "d:" in reasons["test_smoke.py"][0]


def test_select_tooling_changes_run_smoke_and_the_selector_unit_tests():
    for path in ("prototype/tests/conftest.py", "prototype/tests/select_tests.py", "prototype/tests/test-map.json",
                ".github/workflows/tests.yml"):
        assert pick(path)[0] == ["test_select_tests.py", "test_smoke.py"], path


def test_select_a_selection_is_deduplicated_and_sorted():
    files, reasons, _ = pick("prototype/pontoon.js", "prototype/tests/test_pontoon.py", "prototype/heli.js")
    assert files == ["test_heli.py", "test_pontoon.py"]
    assert len(reasons["test_pontoon.py"]) == 2


def test_cap_keeps_the_smoke_set_and_the_changed_tests_when_more_than_eight_are_selected():
    wide = {"prototype/wide.js": [f"test_extra{i}.py" for i in range(10)]}
    files, _, capped = pick("prototype/wide.js", "prototype/tests/test_extra3.py", "prototype/world.js", test_map=wide)
    assert capped and files == ["test_extra3.py", "test_smoke.py"]


def test_cap_leaves_exactly_eight_alone():
    wide = {"prototype/wide.js": [f"test_extra{i}.py" for i in range(8)]}
    files, _, capped = pick("prototype/wide.js", test_map=wide)
    assert not capped and len(files) == 8


def test_selection_table_names_the_rule_and_notes_a_cap():
    table = st.selection_table(["test_heli.py"], {"test_heli.py": ["b: prototype/heli.js is mapped"]}, True)
    assert "`test_heli.py`" in table and "b: prototype/heli.js" in table and "smoke set" in table


def test_selection_table_for_an_empty_selection_says_so():
    assert "No browser tests affected" in st.selection_table([], {}, False)


def test_durations_table_sums_per_file_and_sorts_slowest_first(tmp_path):
    xml = tmp_path / "junit.xml"
    xml.write_text(
        '<testsuites><testsuite>'
        '<testcase classname="prototype.tests.test_a" name="t1" time="1.5"/>'
        '<testcase classname="prototype.tests.test_b.TestX" name="t1" time="10.0"><failure message="x"/></testcase>'
        '<testcase classname="prototype.tests.test_a" name="t2" time="2.0"/>'
        '</testsuite></testsuites>', encoding="utf-8")
    table = st.durations_table(xml)
    assert table.index("`test_b.py`") < table.index("`test_a.py`")
    assert "| `test_b.py` | 1 | 1 | 10.0 |" in table and "| `test_a.py` | 2 | 0 | 3.5 |" in table


def test_the_real_map_only_names_test_files_that_exist():
    existing = st.existing_tests()
    for glob, tests in json.loads((HERE / "test-map.json").read_text(encoding="utf-8")).items():
        for name in tests:
            assert name in existing, f"{glob} -> {name}"


def test_the_real_map_globs_match_a_file_in_the_repo():
    root = HERE.parents[1]
    files = [p.relative_to(root).as_posix() for p in root.rglob("*")
             if p.is_file() and not {".git", ".worktrees", "node_modules"} & set(p.relative_to(root).parts)]
    for glob in json.loads((HERE / "test-map.json").read_text(encoding="utf-8")):
        assert any(st.fnmatch.fnmatchcase(f, glob) for f in files), f"{glob} matches nothing"
