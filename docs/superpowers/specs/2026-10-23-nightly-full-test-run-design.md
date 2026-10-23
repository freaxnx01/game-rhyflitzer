# Nightly full test run on `main` — design (#389)

## Problem

`tests.yml` runs on pull requests (and on manual `workflow_dispatch`), and on a PR it runs only the browser tests the
diff selects (`prototype/tests/select_tests.py`). `main` never gets a full run, so a merge that breaks a test the next
PR does not select stays invisible. #353 found 18 red tests on `main`, 4 of them in no issue. That gap is what makes
unattended AI merges (agent-workflow#551) unsafe.

## Goal

Every night the whole suite runs on `main`. Each failing test that has no open issue gets exactly one new issue,
labelled `needs-enrichment`, so the autopilot fixes it like any other issue. A test that turns green again gets a note
on its issue; nothing is closed automatically.

## Design

### Trigger — `tests.yml`, not a new workflow

Add `schedule: - cron: "30 2 * * *"` to `tests.yml`. On `schedule` the existing `plan` job behaves as if `all: true`
and `hosted: true` had been passed: every `test_*.py` file, on `ubuntu-latest`, up to `MAX_SHARDS` (8) shards.

- Reusing `tests.yml` keeps one definition of "the suite" — the same install, sharding and junit artifacts the PRs use.
- Hosted, not GPU: the GPU pool is capped at `MAX_SHARDS_GPU` = 2, and a full suite in two 30-minute shards risks the
  per-job timeout. Since #345 the region and brightness tests are renderer-independent, so SwiftShader is a fair
  judge. A night that shows SwiftShader-only failures is still worth an issue.
- Concurrency: the scheduled run gets its own group (`tests-nightly`), so a manual dispatch on `main` does not cancel it
  and vice versa.

### Report — a new `nightly` job

A job `nightly` runs only on `schedule`, after `plan`, `browser` and `tests`, with `if: always()`. It downloads the
`junit-*` artifacts and runs `python prototype/tests/nightly_report.py`, which:

1. Parses every junit XML into `{test_id: "passed" | "failed"}`. A test id is the pytest node id relative to the test
   directory: `test_hideout.py::test_name[param]` (class names included when present). `<failure>` and `<error>` count as
   failed; skipped tests are ignored.
2. Lists the open issues once (`gh issue list --state open --limit 1000 --json number,title,body`).
3. For each failed test: an open issue **owns** the test if its body carries the marker
   `<!-- nightly-test: <test_id> -->`, or its title or body contains the test id verbatim (catches hand-filed issues like
   #353 and #388). No owner → create one issue: title `test: <test_id> is red on main`, body with the marker, the run
   link and the failure message (first 40 lines), label `needs-enrichment`. Owned → nothing (no nightly spam).
4. For each passed test owned by an issue that carries the marker: if the issue's latest nightly note is not already a
   green note, comment `Passed on main in <run link>.` with the marker `<!-- nightly-state: green -->`. When it later
   fails again on such an issue, comment `Red again on main in <run link>.` with `<!-- nightly-state: red -->`. Issues
   without the marker (hand-filed) get no notes — the job did not create them.
5. Job-level failure, not per-test issues, for a broken night: if `plan` failed, or a shard produced no junit file, the
   job opens (or leaves open) one issue keyed `<!-- nightly-test: __run__ -->` titled
   `test: the nightly test run on main is broken`, and exits non-zero so the run shows red.

The script keeps the decisions pure (`parse_junit`, `owner_of`, `plan_actions`) and does the GitHub calls in one thin
`apply` function through `gh`, so the decisions are unit-tested without the network.

### Selection

`nightly_report.py` is mapped to `test_nightly_report.py` in `test-map.json`, so a PR that edits the script runs its
tests. The test file itself is pure Python (no browser) and runs in the browser job like the other `test_*.py` files.

## Out of scope

- Closing issues automatically (the AC says a green night closes nothing).
- Running the full suite on the GPU runners.
- Flake detection or retries — a flaky test files an issue, which is what should happen to it.

## Acceptance criteria

- A scheduled run of the whole suite on `main`, every night.
- A newly red test produces exactly one open issue (deduplicated by test id), labelled `needs-enrichment`, linking the run.
- A test that already has an open issue (marker or verbatim id) gets no new issue.
- A green night closes nothing; a test that turns green on a nightly-filed issue gets one note, and one more only after it went red again.
- A broken night (plan failed, missing junit) shows as a red run and one `__run__` issue, not as silence.
