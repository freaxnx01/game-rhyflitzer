# Affected tests as a required PR check — implementation plan (#330)

**Goal:** every PR runs `node --test` plus the Playwright files its diff can affect, in a required job `tests`; an empty selection passes, a cap of 8 files bounds the runtime, and the job summary says what ran and for how long.

**Architecture:** a pure selector `prototype/tests/select_tests.py` (rules a to e, cap, markdown tables) with a hand-kept `prototype/tests/test-map.json`, unit-tested without a browser in `prototype/tests/test_select_tests.py`; one new workflow `.github/workflows/tests.yml` that calls it. The required check itself is a repository ruleset the maintainer creates (last task).

**Global constraints**

- Touch only the four new files: `prototype/tests/select_tests.py`, `prototype/tests/test_select_tests.py`, `prototype/tests/test-map.json`, `.github/workflows/tests.yml`. No game file, no existing test file, no CHANGELOG entry (CI tooling).
- No new dependencies in the repo: standard library for the selector; the workflow installs `pytest` and `playwright==1.63.0` on the runner only.
- Third-party actions pinned by commit SHA with a version comment (the SHAs below were looked up; keep them).
- The unit tests must not start a browser. **Do not run any Playwright test locally for this issue**; the first real browser run is the job on the PR itself.
- Run commands from the repo root with the Python that has pytest and Playwright (`pipeline/.venv/bin/python`, or the system one); `conftest.py` imports Playwright, so it must be installed. Foreground only, never `run_in_background`.
- Commit and push the branch before the PR job runs; the job on the PR is the verification.

---

## Task 1 — the selector, test first

**Files:** create `prototype/tests/test_select_tests.py`, create `prototype/tests/select_tests.py`.

**Interfaces:**

- `select(paths, test_map, existing) -> (files, reasons, capped)` — `files` sorted test file names (`test_x.py`), `reasons` maps each to its rule strings (`"a: <path> changed"`, `"b: <path> is mapped"`, `"d: <path> has no mapping"`, `"e: <path> changed"`), `capped` is True when the cap of 8 trimmed the set.
- `selection_table(files, reasons, capped) -> str`, `durations_table(junit_xml) -> str` — markdown for the job summary.
- `existing_tests() -> set[str]` — the `test_*.py` names next to the script.
- CLI: `select [--map FILE] [--summary FILE]` (paths on stdin, test paths on stdout), `durations JUNIT_XML`.

### Step 1.1 — write the failing tests

`prototype/tests/test_select_tests.py`:

```python
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
```

### Step 1.2 — run them, see them fail

```bash
python -m pytest prototype/tests/test_select_tests.py -q
```

Expected: collection error, `ModuleNotFoundError: No module named 'select_tests'`.

### Step 1.3 — write the module

`prototype/tests/select_tests.py`:

```python
"""#330: pick the Playwright test files a diff can affect, and report what ran. Pure functions, no browser.

CLI (run from the repo root):
  git diff --name-only origin/main...HEAD | python prototype/tests/select_tests.py select [--summary FILE]
  python prototype/tests/select_tests.py durations JUNIT_XML
"""
import argparse
import fnmatch
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent
TESTS = "prototype/tests"
SMOKE = ("test_smoke.py",)            # rule d: loads the whole game, with and without the world file, asserts a clean console
SELF_TESTS = ("test_select_tests.py",)  # rule e: pure, no browser
CAP = 8
TOOLING = (f"{TESTS}/conftest.py", f"{TESTS}/select_tests.py", f"{TESTS}/test-map.json", f"{TESTS}/gpu_browser.py",
           ".github/workflows/tests.yml")
GAME_PREFIXES = ("prototype/", "editor/", "data/", "vendor/")
GAME_FILES = ("editor.html", "index.html")


def test_name(path):
    """`test_x.py` when `path` is a Playwright test file, else None."""
    m = re.fullmatch(rf"{TESTS}/(test_[^/]+\.py)", path)
    return m.group(1) if m else None


def is_game_file(path):
    if path.startswith(f"{TESTS}/"):
        return False
    return path.startswith(GAME_PREFIXES) or path in GAME_FILES


def mapped_tests(path, test_map):
    return [t for glob, tests in test_map.items() if fnmatch.fnmatchcase(path, glob) for t in tests]


def select(paths, test_map, existing):
    """Returns (files, reasons, capped). `reasons` maps each file to the rules that picked it."""
    reasons, changed = {}, set()

    def add(name, why):
        if name in existing:
            reasons.setdefault(name, []).append(why)

    for path in paths:
        own = test_name(path)
        mapped = mapped_tests(path, test_map)
        if own:                                   # rule a
            add(own, f"a: {path} changed")
            changed.add(own)
        for name in mapped:                       # rule b
            add(name, f"b: {path} is mapped")
        if path in TOOLING:                       # rule e
            for name in SMOKE + SELF_TESTS:
                add(name, f"e: {path} changed")
        if own or mapped or path in TOOLING or not is_game_file(path):   # rule c: everything else is no browser test
            continue
        for name in SMOKE:                        # rule d
            add(name, f"d: {path} has no mapping")
    return cap(reasons, changed)


def cap(reasons, changed):
    if len(reasons) <= CAP:
        return sorted(reasons), reasons, False
    keep = (set(SMOKE) | changed | {n for n in SELF_TESTS if n in reasons}) & set(reasons)
    return sorted(keep), {n: reasons[n] for n in keep}, True


def selection_table(files, reasons, capped):
    if not files:
        return "### Affected browser tests\n\nNo browser tests affected.\n"
    rows = "\n".join(f"| `{f}` | {'; '.join(reasons[f][:3])} |" for f in files)
    note = f"\nMore than {CAP} test files were affected: ran the smoke set and the changed test files only.\n" if capped else ""
    return f"### Affected browser tests\n\n| test file | selected by |\n|---|---|\n{rows}\n{note}"


def durations_table(junit_xml):
    per_file = {}
    for case in ET.parse(junit_xml).getroot().iter("testcase"):
        name = next((p + ".py" for p in case.get("classname", "").split(".") if p.startswith("test_")), "(unknown)")
        tests, failed, seconds = per_file.get(name, (0, 0, 0.0))
        bad = case.find("failure") is not None or case.find("error") is not None
        per_file[name] = (tests + 1, failed + bad, seconds + float(case.get("time", 0)))
    rows = "\n".join(f"| `{n}` | {t} | {f} | {s:.1f} |"
                     for n, (t, f, s) in sorted(per_file.items(), key=lambda kv: -kv[1][2]))
    total = sum(s for _, _, s in per_file.values())
    return f"### Browser test durations\n\n| test file | tests | failed | seconds |\n|---|---|---|---|\n{rows}\n\nTotal: {total:.0f} s.\n"


def existing_tests():
    return {p.name for p in HERE.glob("test_*.py")}


def main(argv):
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    pick = sub.add_parser("select")
    pick.add_argument("--map", default=str(HERE / "test-map.json"))
    pick.add_argument("--summary")
    sub.add_parser("durations").add_argument("junit")
    args = parser.parse_args(argv)
    if args.command == "durations":
        print(durations_table(args.junit))
        return 0
    paths = [line.strip() for line in sys.stdin if line.strip()]
    files, reasons, capped = select(paths, json.loads(Path(args.map).read_text(encoding="utf-8")), existing_tests())
    table = selection_table(files, reasons, capped)
    if args.summary:
        with open(args.summary, "a", encoding="utf-8") as out:
            out.write(table + "\n")
    print("\n".join(f"{TESTS}/{f}" for f in files))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

### Step 1.4 — run them, see them pass

```bash
python -m pytest prototype/tests/test_select_tests.py -q
```

Expected: 16 passed.

### Step 1.5 — commit

```bash
git add prototype/tests/select_tests.py prototype/tests/test_select_tests.py
git commit -m "ci(test): select the affected Playwright tests from a diff (#330)"
```

---

## Task 2 — the initial map, test first

**Files:** create `prototype/tests/test-map.json`, append two tests to `prototype/tests/test_select_tests.py`.

### Step 2.1 — append the failing guards

Append to `prototype/tests/test_select_tests.py`:

```python
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
```

### Step 2.2 — run them, see them fail

```bash
python -m pytest prototype/tests/test_select_tests.py -q
```

Expected: 2 failed, `FileNotFoundError ... test-map.json`.

### Step 2.3 — write the map

`prototype/tests/test-map.json` (one entry per module with an obvious owner test; `world.js`, `index.html`, `version.js`, data and textures stay unmapped on purpose and fall to the smoke set):

```json
{
  "prototype/heli.js": ["test_heli.py"],
  "prototype/camera.js": ["test_drone.py", "test_look_back.py"],
  "prototype/pontoon.js": ["test_pontoon.py"],
  "prototype/mirror.js": ["test_mirror.py"],
  "prototype/shadow.js": ["test_shadow.py"],
  "prototype/steering.js": ["test_wheels.py"],
  "prototype/pause.js": ["test_pause.py"],
  "prototype/carselect.js": ["test_carselect.py"],
  "prototype/carbody.js": ["test_car_look.py", "test_vehicles.py"],
  "prototype/delorean.js": ["test_vehicles.py"],
  "prototype/vehicle.js": ["test_vehicles.py", "test_wheels.py"],
  "prototype/beam.js": ["test_beam.py"],
  "prototype/blitz.js": ["test_blitz.py"],
  "prototype/route.js": ["test_navi.py", "test_autopilot.py"],
  "prototype/navi.js": ["test_navi.py"],
  "prototype/photo.js": ["test_photo.py"],
  "prototype/hideout.js": ["test_hideout.py"],
  "prototype/lift.js": ["test_hideout.py"],
  "prototype/levels.js": ["test_hideout.py"],
  "prototype/room-eiffel.js": ["test_hideout.py", "test_credits.py"],
  "prototype/assets/models/eiffel_tower*": ["test_credits.py", "test_hideout.py"],
  "prototype/landmarks.js": ["test_jump.py", "test_xss.py"],
  "prototype/helpfilter.js": ["test_help_filter.py"],
  "prototype/holzbruecke.js": ["test_holzbruecke.py"],
  "prototype/regions.js": ["test_region.py"],
  "prototype/worlds.js": ["test_world.py"],
  "prototype/gallery.js": ["test_gallery.py"],
  "prototype/sound.js": ["test_sound.py"],
  "prototype/impact.js": ["test_crash.py"],
  "prototype/wreck.js": ["test_wreck.py"],
  "prototype/presents.js": ["test_hunt.py"],
  "prototype/underwater.js": ["test_underwater.py"],
  "prototype/lights.js": ["test_lights.py"],
  "prototype/debug.js": ["test_debug.py"],
  "prototype/i18n.js": ["test_i18n.py"],
  "prototype/strings.js": ["test_i18n.py"],
  "prototype/escape.js": ["test_xss.py"],
  "prototype/testhub-targets.js": ["test_testhub.py"],
  "editor/*": ["test_editor.py"],
  "editor.html": ["test_editor.py"],
  "README.md": ["test_credits.py"],
  "CHANGELOG.md": ["test_credits.py"],
  "pipeline/world_extra_roads.py": ["test_suedspange.py"],
  "pipeline/world_roads.py": ["test_suedspange.py"],
  "pipeline/osm_read.py": ["test_suedspange.py"],
  "prototype/tests/test_vehicles.py": ["test_car_look.py", "test_shadow.py", "test_sound.py", "test_wheels.py"]
}
```

### Step 2.4 — run, see them pass

```bash
python -m pytest prototype/tests/test_select_tests.py -q
```

Expected: 18 passed. If a guard names a missing test file or a glob that matches nothing, the map is wrong: fix the entry, never the guard.

### Step 2.5 — try the CLI against this branch's own diff

```bash
git diff --name-only origin/main...HEAD | python prototype/tests/select_tests.py select
```

Expected: `prototype/tests/test_select_tests.py` plus `prototype/tests/test_smoke.py` (the map, the selector and the tests are rule a and e).

### Step 2.6 — commit

```bash
git add prototype/tests/test-map.json prototype/tests/test_select_tests.py
git commit -m "ci(test): map prototype modules to their Playwright tests (#330)"
```

---

## Task 3 — the workflow

**Files:** create `.github/workflows/tests.yml`.

There is no meaningful failing test for a workflow file; the checks are structural (Step 3.2) and the job on the PR (Task 4).

### Step 3.1 — write it

`.github/workflows/tests.yml`:

```yaml
name: Tests

on:
  pull_request:        # every PR into any branch; no paths filter, a required check that never reports blocks the merge forever
  workflow_dispatch:

permissions:           # pull-requests/issues write: the Visual-tests PR comment (#332). A fork PR gets a read-only token, the recorder only warns.
  contents: read
  pull-requests: write
  issues: write

concurrency:
  group: tests-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  tests:
    name: tests        # the required-check name: do not rename without updating the ruleset
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      PLAYWRIGHT_VERSION: "1.63.0"
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
        with:
          fetch-depth: 0   # the diff base (origin/<base branch>) must be available

      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38  # v6.5.0
        with:
          node-version: "24"

      - name: Node tests
        run: node --test prototype/tests/*.test.mjs

      - uses: actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405  # v6.2.0
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: pipeline/requirements.txt

      - name: Install Python dependencies
        run: pip install -r pipeline/requirements.txt pytest "playwright==${PLAYWRIGHT_VERSION}"

      - name: Select the affected browser tests
        id: select
        env:
          BASE_REF: ${{ github.base_ref }}
        run: |
          base="origin/${BASE_REF:-main}"
          git diff --name-only "$base"...HEAD \
            | python prototype/tests/select_tests.py select --summary "$GITHUB_STEP_SUMMARY" > "$RUNNER_TEMP/selected.txt"
          cat "$RUNNER_TEMP/selected.txt"
          echo "count=$(grep -c . "$RUNNER_TEMP/selected.txt" || true)" >> "$GITHUB_OUTPUT"
          if ! grep -q . "$RUNNER_TEMP/selected.txt"; then echo "no browser tests affected"; fi

      - name: Cache the Playwright browsers
        if: steps.select.outputs.count != '0'
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9  # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ env.PLAYWRIGHT_VERSION }}

      - name: Install Chromium
        if: steps.select.outputs.count != '0'
        run: python -m playwright install --with-deps chromium

      - name: Browser tests
        if: steps.select.outputs.count != '0'
        env:
          GH_TOKEN: ${{ github.token }}
        run: python -m pytest $(cat "$RUNNER_TEMP/selected.txt") -q --junitxml="$RUNNER_TEMP/junit.xml"

      - name: Durations
        if: always() && steps.select.outputs.count != '0'
        run: |
          if [ -f "$RUNNER_TEMP/junit.xml" ]; then
            python prototype/tests/select_tests.py durations "$RUNNER_TEMP/junit.xml" >> "$GITHUB_STEP_SUMMARY"
          fi
```

Before keeping `PLAYWRIGHT_VERSION: "1.63.0"`, confirm it exists: `python -m pip index versions playwright | head -2`. It is the version the maintainer runs locally and the repo does not pin it anywhere (`pipeline/requirements-dev.txt` says `>=1.45`). If 1.63.0 is not on PyPI, stop and report; do not guess another version.

### Step 3.2 — structural checks

```bash
python - <<'EOF'
import re, yaml
wf = yaml.safe_load(open(".github/workflows/tests.yml"))
job = wf["jobs"]["tests"]
assert job["name"] == "tests" and job["timeout-minutes"] == 30 and job["runs-on"] == "ubuntu-latest"
assert set(wf[True]) == {"pull_request", "workflow_dispatch"}      # PyYAML reads `on` as True
assert wf["permissions"] == {"contents": "read", "pull-requests": "write", "issues": "write"}
uses = [s["uses"] for s in job["steps"] if "uses" in s]
assert uses and all(re.fullmatch(r"[\w./-]+@[0-9a-f]{40}", u) for u in uses), uses
print("ok", len(uses), "pinned actions")
EOF
```

Expected: `ok 4 pinned actions`. If `actionlint` is installed, also run `actionlint .github/workflows/tests.yml`.

Then run the selection step's shell by hand, to see the empty and non-empty cases:

```bash
git diff --name-only origin/main...HEAD | python prototype/tests/select_tests.py select
git diff --name-only HEAD...HEAD | python prototype/tests/select_tests.py select
```

Expected: the first lists test files, the second prints nothing.

### Step 3.3 — commit

```bash
git add .github/workflows/tests.yml
git commit -m "ci(test): run the affected tests on every PR (#330)"
```

---

## Task 4 — push, open the PR, measure

### Step 4.1 — push and open the PR

Push the branch and open the PR as the pipeline does. The PR touches `.github/workflows/tests.yml` and the tooling files, so rule e selects `test_smoke.py` and `test_select_tests.py`: that is the first real run of the job.

If the push is refused because of the workflow file, the pipeline App lacks `Workflows: Read and write` on this installation (see the spec, risks). Stop and report; do not work around it.

### Step 4.2 — read the result

```bash
gh run list --workflow tests.yml --branch <branch> --limit 1
gh run view <run-id> --json jobs --jq '.jobs[] | {name, startedAt, completedAt, conclusion}'
```

Open the run's summary: the selection table must list `test_smoke.py` (rule e) and `test_select_tests.py`, the durations table must list both.

### Step 4.3 — report the measurement in the PR description

Under a `Measure` heading: the job's total runtime, the slowest test file and its seconds, and whether the job stays well under the 30-minute limit. If `test_smoke.py` alone takes more than about 10 minutes, say so: that decides the GPU-browser follow-up (#331) and a smaller smoke set.

If the job is red, read the log, fix the cause in the workflow or the selector, push, and re-measure. A red `tests` on its own PR is not mergeable.

---

## Task 5 — MAINTAINER STEP: the required check (NOT for the implementing agent)

Creating a repository ruleset is a repo-settings action. **The implementing agent must not run any of this**; it only leaves the list in the PR description. Do it after the PR is merged and `tests` has reported on `main` or on at least one PR.

Prerequisites: the pipeline GitHub App is installed with `Workflows: Read and write` (it had to be, to push the workflow), and pipeline PRs show a `tests` result (a "No pipeline App token" warning in a pipeline run means they would not).

[ ] **1.** Confirm the check name and app id: open a recent PR, the check is called `tests`, from "GitHub Actions" (integration id 15368).

[ ] **2.** Create the ruleset (requires `tests` on `main`; the repository admin role bypasses it, so direct pushes of docs, specs, plans and `test-todo.md` keep working):

```bash
gh api -X POST repos/freaxnx01/game-rhyflitzer/rulesets --input - <<'JSON'
{
  "name": "main requires tests",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ { "context": "tests", "integration_id": 15368 } ]
      }
    }
  ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ]
}
JSON
```

[ ] **3.** Verify: `gh api repos/freaxnx01/game-rhyflitzer/rulesets --jq '.[] | {id, name, enforcement}'` shows `active`. Push a docs-only commit to `main` as admin: it must still go through.

[ ] **4.** Update the open PRs that predate the ruleset (`gh pr update-branch <n>`, or push), so they get a `tests` result.

[ ] **5.** Watch the next pipeline PR: `tests` runs, and "Wait for required checks" waits for it. If a pipeline PR shows no `tests` check at all, the App token is missing: fix that before relying on the ruleset.

[ ] **6.** Rollback if it blocks the wrong thing: `gh api -X DELETE repos/freaxnx01/game-rhyflitzer/rulesets/<id>`.
