# Affected tests as a required PR check (#330)

## Goal

Every PR runs the tests its diff can affect, on a plain GitHub-hosted runner and independently of the implementing agent, and `main` requires that job to pass. A red result blocks the merge, pipeline auto-merge included. Direct pushes by the maintainer (docs, specs, plans, `test-todo.md`) keep working.

## Design

### The workflow

- New `.github/workflows/tests.yml`, workflow name `Tests`, one job with id **and** name `tests`. That name is the required-check context; renaming it breaks the ruleset.
- Triggers: `pull_request` (all branches targeting `main`, drafts included, which is what the pipeline opens) and `workflow_dispatch`. **No `paths:` filter**: a required check that never reports leaves the PR pending forever. Docs-only PRs run the job and finish in the node-test time.
- `ubuntu-latest`, `timeout-minutes: 30`, `concurrency` per PR with `cancel-in-progress` so a new push replaces the previous run.
- Actions are pinned by commit SHA with a version comment, like agent-workflow: `actions/checkout` v4.2.2, `actions/setup-node` v6.5.0, `actions/setup-python` v6.2.0, `actions/cache` v6.1.0.
- `permissions: contents: read, pull-requests: write, issues: write`; the pytest step gets `env: GH_TOKEN: ${{ github.token }}`. This is only what #332's recorder needs to post its "Visual tests" comment. A fork PR gets a read-only token; the recorder then only warns.

### Steps, in order

1. `actions/checkout` with `fetch-depth: 0` (the diff base must be there).
2. `actions/setup-node` 24, then `node --test prototype/tests/*.test.mjs`. Always, fast. (On Node 24 the folder alone does not work, use the glob.)
3. `actions/setup-python` 3.12 (pip cache keyed on `pipeline/requirements.txt`), then `pip install -r pipeline/requirements.txt pytest "playwright==1.63.0"`. The pipeline requirements are there because `test_suedspange.py` imports `pipeline/world_extra_roads.py` (shapely and friends).
4. Select the affected files: `git diff --name-only origin/<base>...HEAD | python prototype/tests/select_tests.py select --summary "$GITHUB_STEP_SUMMARY"`. `<base>` is `github.base_ref`, `main` on `workflow_dispatch`. The files go to `$RUNNER_TEMP/selected.txt`, their count to a step output.
5. Only if the selection is not empty: cache `~/.cache/ms-playwright` (key `playwright-<os>-1.63.0`), `python -m playwright install --with-deps chromium`, then `python -m pytest $(cat selected.txt) -q --junitxml=...`. An empty selection prints `no browser tests affected` and the job succeeds.
6. `always()`: render per-file durations from the JUnit XML into the job summary.

Playwright 1.63.0 is the version the maintainer runs locally; it is pinned here so a new release cannot turn the required check red on its own. The repo itself only says `playwright>=1.45` (`pipeline/requirements-dev.txt`). Bump the pin by hand, together with the cache key (they share one env var).

### Why a hand-kept map

A Playwright test loads `prototype/index.html` as a whole page, and that page imports about 40 modules. The import graph therefore says "everything affects everything", and a graph-derived selection would always pick the full suite (~2 h on SwiftShader). The *node* tests import single modules and are cheap, so they always run. For the browser tests the owner of a module is a human judgement, kept in `prototype/tests/test-map.json`.

### The selection: `prototype/tests/select_tests.py`

A pure script (name does not start with `test_`, so pytest does not collect it). Input: changed paths on stdin. Output: test files, one per line (`prototype/tests/test_x.py`), sorted, deduplicated. A path can trigger several rules; the union is run. A test file that no longer exists (deleted in the PR) is dropped.

Rules, per changed path:

- **a.** `prototype/tests/test_*.py` selects itself.
- **b.** `prototype/tests/test-map.json`, `{ "<glob>": ["test_x.py", ...] }`, maps source globs to test files. Globs use `fnmatch` on the repo-relative POSIX path (`*` also crosses `/`). A mapping applies to **any** path, also outside `prototype/`: `README.md` and `CHANGELOG.md` select `test_credits.py` (it reads both), the pipeline modules `test_suedspange.py` imports select that test, and the helper module `test_vehicles.py` selects the four tests that import from it.
- **c.** A path that matched neither a nor b and is not a game file selects nothing. Game files are `prototype/**` except `prototype/tests/**`, `editor/**`, `editor.html`, `index.html`, `data/**`, `vendor/**`. So `docs/**`, `*.md`, `.github/**`, `pipeline/**`, `service/**` (both have their own pytest), `TODO.md`, `test-todo.md` and `prototype/tests/*.test.mjs` (node tests already ran) run no browser test.
- **d.** A game file with no mapping (for example `prototype/world.js`, `prototype/index.html`, the data and texture files) selects the **smoke set**.
- **e.** A change to `conftest.py`, `select_tests.py`, `test-map.json`, `gpu_browser.py` or `.github/workflows/tests.yml` selects the smoke set plus `test_select_tests.py`.

**Smoke set: `test_smoke.py`.** It is the only file that loads the whole game with and without the world file and asserts a clean console (25 tests, hand-traced fallback, OSM world, terrain, no errors). The other broad files each cover one feature. It is not guaranteed cheap on SwiftShader: the Measure criterion below records its real runtime, and if it dominates, the set shrinks to its fastest cases in a follow-up.

**Cap: at most 8 test files.** If more are selected, only the smoke set, the changed test files, and (if selected) `test_select_tests.py` run, and the job summary says so. Bounded runtime beats completeness here; the full suite stays a local and release-time job.

### The initial map

One entry per module with an obvious owner test, built from the docstrings and imports of the test files. Unmapped on purpose, so they fall to rule d: `world.js` (the generic world builder, touched by a dozen tests), `index.html` (the game page itself), `version.js`, `toast` (inline in `index.html`), data, textures and the remaining `assets`.

| module | tests |
|---|---|
| `heli.js` | `test_heli.py` |
| `camera.js` | `test_drone.py`, `test_look_back.py` |
| `pontoon.js` | `test_pontoon.py` |
| `mirror.js` | `test_mirror.py` |
| `shadow.js` | `test_shadow.py` |
| `steering.js` | `test_wheels.py` |
| `pause.js` | `test_pause.py` |
| `carselect.js` | `test_carselect.py` |
| `carbody.js` | `test_car_look.py`, `test_vehicles.py` |
| `delorean.js` | `test_vehicles.py` |
| `vehicle.js` | `test_vehicles.py`, `test_wheels.py` |
| `beam.js`, `blitz.js`, `photo.js` | `test_beam.py`, `test_blitz.py`, `test_photo.py` |
| `route.js` | `test_navi.py`, `test_autopilot.py` |
| `navi.js` | `test_navi.py` |
| `hideout.js`, `lift.js`, `levels.js` | `test_hideout.py` |
| `room-eiffel.js` | `test_hideout.py`, `test_credits.py` |
| `assets/models/eiffel_tower*` | `test_credits.py`, `test_hideout.py` |
| `landmarks.js` | `test_jump.py`, `test_xss.py` |
| `helpfilter.js`, `holzbruecke.js`, `regions.js`, `worlds.js`, `gallery.js` | `test_help_filter.py`, `test_holzbruecke.py`, `test_region.py`, `test_world.py`, `test_gallery.py` |
| `sound.js`, `impact.js`, `wreck.js` | `test_sound.py`, `test_crash.py`, `test_wreck.py` |
| `presents.js`, `underwater.js`, `lights.js`, `debug.js` | `test_hunt.py`, `test_underwater.py`, `test_lights.py`, `test_debug.py` |
| `i18n.js`, `strings.js` | `test_i18n.py` |
| `escape.js` | `test_xss.py` |
| `testhub-targets.js` | `test_testhub.py` |
| `editor/*`, `editor.html` | `test_editor.py` |
| `README.md`, `CHANGELOG.md` | `test_credits.py` |
| `pipeline/world_extra_roads.py`, `world_roads.py`, `osm_read.py` | `test_suedspange.py` |
| `prototype/tests/test_vehicles.py` | `test_car_look.py`, `test_shadow.py`, `test_sound.py`, `test_wheels.py` |

Two unit tests guard the map against rot: every test file it names exists, and every glob matches at least one file in the repo.

### The job summary

`select` appends a table to `$GITHUB_STEP_SUMMARY`: test file and the rule (with the triggering path) that selected it, plus the cap note when it applied. After pytest, `durations` renders a second table from the JUnit XML: per test file the number of tests, failures and seconds, slowest first, and a total.

### The required check on `main`

`main` has no protection today (no branch protection, no rulesets). Enrichment and the maintainer push docs, specs, plans and `test-todo.md` straight to `main`, so the requirement is a **repository ruleset** on `main` with the status check `tests` (GitHub Actions app, integration id 15368) and the repository **admin role as bypass actor, mode "always"**. Direct pushes by the admin keep working; PRs, including the pipeline's auto-merge through the pipeline GitHub App, must pass. Creating a ruleset is a repo-settings action the implementing agent cannot do: the last plan task is a maintainer checklist with the exact `gh api` payload.

The ruleset is created **after** `tests.yml` is on `main` and the check has reported once, otherwise every open PR waits for a check that nothing sends.

## Acceptance Criteria

- [ ] `.github/workflows/tests.yml` exists: job id and name `tests`, triggers `pull_request` and `workflow_dispatch`, ubuntu-latest, `timeout-minutes: 30`, all third-party actions pinned by SHA with a version comment.
- [ ] The job runs `node --test prototype/tests/*.test.mjs` on every PR.
- [ ] `prototype/tests/select_tests.py` implements rules a to e and the cap of 8; `prototype/tests/test_select_tests.py` covers each rule, the cap, the summary tables and the map guards, runs without a browser, and passes.
- [ ] `prototype/tests/test-map.json` holds the initial map from this spec.
- [ ] An empty selection prints `no browser tests affected` and the job passes; a non-empty one installs Chromium (browser cache keyed on the Playwright version) and runs pytest on the selected files only.
- [ ] The job summary lists the selected test files with the selecting rule, and the per-file durations.
- [ ] The pytest step has `GH_TOKEN: ${{ github.token }}`, and the workflow has `permissions: contents: read, pull-requests: write, issues: write`.
- [ ] The maintainer checklist with the ruleset payload (status check `tests`, integration id 15368, admin-role bypass "always") is in the plan; the ruleset itself is created by the maintainer after merge.
- [ ] **Measure:** the PR description reports the job's runtime on its own PR (total, and the slowest test file from the summary), and says whether it stays well under the 30-minute limit. That number decides whether the GPU-browser follow-up (#331) is needed.
- [ ] No game file changes: no CHANGELOG entry (CI tooling, nothing changes in the game).

## Consequences and risks

- **Workflow files need the App's `Workflows` permission.** The pipeline must push `.github/workflows/tests.yml`. That needs `Workflows: Read and write` on the pipeline GitHub App, accepted on this installation (agent-workflow `docs/PIPELINE-APP-SETUP.md`, "Workflows is not optional if any plan will edit a workflow file"). If the push is refused, the run fails visibly and the maintainer accepts the permission and re-dispatches.
- **Pipeline PRs trigger the workflow only via the App token.** A PR opened with the plain `GITHUB_TOKEN` starts no other workflow; agent-workflow warns "No pipeline App token" in that case. If that warning appears, the required check never reports on pipeline PRs and the ruleset would block them: fix the App token first.
- **The map can go stale.** A module without an entry falls back to the smoke set, which is a weaker check, not a missing one. The two map guards catch dead entries, not missing ones; the owner of a new module adds its line.
- **The cap trades completeness for runtime.** A PR that touches many modules runs the smoke set plus its own test files; the summary says so.
- **First run on SwiftShader is slow.** Chromium download and `--with-deps` add a few minutes; later runs hit the browser cache.
- **Required check and open PRs.** PRs opened before the ruleset have no `tests` result; they need a push or `gh pr update-branch`.
- The pytest step for #332's recorder can warn on a fork PR (read-only token). That is accepted.

## Out of scope

- The GPU browser in CI (#331, parked; agent-workflow#529).
- The full suite on every PR.
- #332's recorder (this job only provides `GH_TOKEN` and the PR context).
- A pytest-based or graph-based automatic mapping; the map is hand-kept.
