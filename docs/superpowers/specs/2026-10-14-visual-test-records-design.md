# Visual test records per PR (#332)

## Goal

Per PR, show whether browser (visual) tests ran, where (GitHub runner or agent-dev), with which renderer (GPU browser or SwiftShader), what was tested and how long it took. One comment per PR, edited in place, filled automatically by the Python test session itself. A posting problem is a warning, never a test failure.

## Design

### What a session records

Only a pytest session in which at least one browser was launched leaves a record. A session without a browser (the pure-logic tests, `test_gpu_browser.py`, `test_visual_runs.py`) writes nothing and posts nothing.

Record fields (JSON):

- `where`: `gh-runner` when the environment variable `GITHUB_ACTIONS` is `true`, else `socket.gethostname()`.
- `renderer`: `GPU browser` when the PR#325 hook connected to a remote endpoint (`GPU["endpoint"]` is set), else `SwiftShader`. The endpoint URL and any IP are **never** part of the record or the comment: the repo is public.
- `tests`: per test `nodeid`, `outcome` (`passed`, `failed`, `skipped`, `error`), `seconds` (call-phase duration, rounded to 0.1), `browser` (did this test launch at least one browser).
- `wall_seconds`: session wall time, rounded to 0.1.
- `commit`: short sha. Order: env `PR_HEAD_SHA` (the CI job passes `github.event.pull_request.head.sha`), then env `GITHUB_SHA` (on `pull_request` events that is the **merge commit**, not the branch head, hence the preference above), then `git rev-parse --short HEAD`, else `unknown`.
- `started_at`: ISO 8601 UTC, `YYYY-MM-DDTHH:MM:SSZ`.

### Collecting

- **Launch counting:** an always-on wrapper around `playwright.sync_api.BrowserType.launch`, installed in `pytest_configure` **after** the GPU hook's patch so it wraps whatever launch is current, restored in `pytest_unconfigure` **before** the GPU hook restores its own (reverse order). The GPU hook routes `launch` to `connect_over_cdp`, so wrapping `launch` covers both paths. A launch is counted after it succeeded.
- **Attribution:** `pytest_runtest_logstart` makes a test current, `pytest_runtest_logfinish` ends it; a launch while a test is current marks that test `browser: true`. Module-scoped fixtures that launch in setup therefore count for the first test that uses them. Accepted and documented in the module docstring; the per-test seconds of such a test do not include the launch either.
- **Outcome and seconds** come from `pytest_runtest_logreport`: the call phase decides outcome and seconds; a failed setup or teardown makes the test `error`; a skipped setup makes it `skipped`.
- **xdist:** a worker process (`config.workerinput` exists) records nothing; the controller sees no launches. Not supported, not needed today.

### Writing and posting (at `pytest_sessionfinish`)

1. Write the record to `<repo root>/.test-runs/<UTC timestamp>-<pid>.json` (`.test-runs/` is added to `.gitignore`). The file stays whatever happens next.
2. **Find the PR:** `GITHUB_REF` matching `refs/pull/<n>/merge` gives `n`. Otherwise the branch from `git rev-parse --abbrev-ref HEAD` (`HEAD`, a detached checkout, means no PR) and `gh pr list --head <branch> --state open --json number -q '.[0].number'`. No open PR: skip posting silently.
3. **Repo:** env `GITHUB_REPOSITORY`, else `gh repo view --json nameWithOwner -q .nameWithOwner`.
4. **One comment per PR**, identified by the hidden marker `<!-- visual-test-runs -->` on its first line. Found with `gh api repos/<repo>/issues/<n>/comments --paginate` (filtered with `--jq` to the marker comments, one JSON object per line). Found: edited with `PATCH repos/<repo>/issues/comments/<id>`. Not found: created with `POST repos/<repo>/issues/<n>/comments`. The body goes in on stdin (`--input -`), never on the command line.
5. **Posting is automatic.** There is no opt-out flag. Without `gh` or without auth the post fails into a warning (below).

Concurrent sessions on the same PR do a read-modify-write on the same comment; the later write can drop the earlier run. Accepted: runs are minutes apart in practice.

### The comment

The body is regenerated completely from machine data on every run, never edited as markdown. The data lives in a hidden HTML comment on the second line: `<!-- visual-test-runs-data: <base64(zlib(compact json))> -->`. The JSON is `{"v": 1, "dropped": <int>, "runs": [<slim run>, ...]}`. A comment whose data is missing or unreadable is replaced by a fresh one (history starts over); that is not an error.

Visible part:

- Heading `### Visual tests`.
- Optional line `_N older runs dropped._` (when `dropped` > 0).
- A table, one row per run, **newest last**: `When` (Europe/Zurich, `YYYY-MM-DD HH:MM`) | `Where` | `Renderer` | `Tests` (number of tests that opened a browser, then their file names, deduplicated, comma-separated, whole cell truncated to 120 characters with `…`) | `Result` (browser tests only, e.g. `5 ✓ 1 ✗`, skipped as `○`, zero counts omitted) | `Time (s)` (wall seconds, whole number).
- Below the table a `<details>` block for each of the **most recent 5 runs**: summary `When · Where · Renderer · commit`, then one line per browser test with outcome mark, nodeid and seconds.

Limits:

- At most **40 rows**; the oldest are dropped and counted in `dropped`.
- Per-test details are kept in the data for the last 5 runs only; older runs keep a summary (count, file names, passed, failed, skipped).
- The body stays under **60,000 characters** (GitHub allows 65,536): when it would not, per-test details are stripped from the oldest run first, and only when none are left are the oldest rows dropped.

### Failure handling

Every external command (`gh`, `git`) goes through **one injectable function**, `run(cmd, stdin=None) -> str`, default `run_command` (`subprocess.run`, timeout 15 s, raising `CommandError` on missing binary, timeout or non-zero exit). Any failure while posting becomes **one warning line** printed through the terminal reporter (`visual tests: could not post to the PR (...)`); the record file stays, and the session's exit status is untouched. An unexpected exception anywhere in the recorder is caught at the one boundary function and reported the same way.

### Structure

- `prototype/tests/visual_runs.py`: pure logic (`Collector`, `counting_launch`, `build_record`, `write_record`, data and comment rendering, PR lookup, upsert, `finish_session`). The name deliberately does not start with `test_`, so pytest does not collect it.
- `prototype/tests/test_visual_runs.py`: unit tests. No browser; real temp files and real subprocesses for `run_command`; no mocks of the behaviour under test. A fake `run` function is injected where `gh` or `git` would be called.
- `prototype/tests/conftest.py`: thin glue only (hooks forward to the `Collector`; `pytest_sessionfinish` prints the lines `finish_session` returns).
- `.gitignore`: `.test-runs/`.

## CI usage (for #330, not part of this work)

The CI test job needs `GH_TOKEN` (the workflow token), `permissions: pull-requests: write` and `issues: write` (PR comments are issue comments), and optionally `PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}` for the branch-head sha. Nothing else.

## Acceptance criteria

- [ ] A pytest session that launched at least one browser writes `.test-runs/<UTC timestamp>-<pid>.json` with where, renderer, commit, started_at, wall seconds and per test nodeid / outcome / seconds / browser.
- [ ] A session without any browser launch writes no file and runs no `gh` command.
- [ ] `where` is `gh-runner` on GitHub Actions, otherwise the hostname; `renderer` is `GPU browser` or `SwiftShader`; neither record nor comment contains the endpoint URL or an IP.
- [ ] With an open PR (via `GITHUB_REF` or `gh pr list --head`), the session creates the comment marked `<!-- visual-test-runs -->` or edits the existing one; never a second comment.
- [ ] The comment shows one row per run, newest last, with When (Europe/Zurich), Where, Renderer, Tests, Result, Time; collapsed per-test details for the last 5 runs only.
- [ ] At most 40 rows (older ones counted as dropped) and a body under 60,000 characters.
- [ ] No open PR, no `gh`, no auth, a network error or a timeout: one warning line at most, the record file stays, and the pytest exit status is unchanged.
- [ ] The launch wrapper coexists with the PR#325 GPU hook (installed after it, removed before it); `test_gpu_browser.py` still passes.
- [ ] `python3 -m pytest prototype/tests/test_visual_runs.py -q` passes without a browser.
- [ ] No test file other than `conftest.py` and the two new ones changes; `.test-runs/` is gitignored.

## Out of scope

- The implementing agent's own pre-PR runs on the runner (agent-workflow#533).
- A cross-PR dashboard.
- The JS (`node --test`) tests; xdist.
- Wiring the CI job (#330).

## Consequences

- Every local Playwright session on a branch with an open PR now makes a few `gh` calls (about 15 s worst case on a dead network) at the end of the session.
- The comment grows by one row per browser session; the 40-row cap makes a busy PR show only its recent history plus a dropped counter.
- Host names of the machines running tests appear in a public PR comment (`agent-dev`, a runner label); no IPs, no URLs.
