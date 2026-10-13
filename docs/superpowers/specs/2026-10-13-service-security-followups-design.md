# Build service: security follow-ups from the #168 review — design

Issue: #296. Builds on `docs/superpowers/specs/2026-10-10-region-editor-service-design.md` (the service, #168, merged with PR#293) and changes only what is listed here.

## Goal

Close six of the seven findings of the independent review of PR#293 before the API gets its DNS record. The two availability findings matter most: a handful of networks must not be able to fill the build queue or burn the day's budget on their own, and the frame preview must not be able to occupy the API's thread pool.

Success: every finding below has a test that fails on today's `main` and passes afterwards; the public API contract (routes, status codes, error codes, JSON shapes) is unchanged; the service suite is green.

## What was checked on `main` (the issue cites PR line numbers)

| # | Finding | Where it is on `main` (95b90f9) |
|---|---|---|
| 1 | Global budget exhaustion from many IPs | `service/rhyflitzer_api/store.py:58-67` (`_check_limits`), `app.py:55-74` (`client_ip`, `_subscriber`) |
| 2 | Preview starves the thread pool | `app.py:287-299` (`get_preview`), `preview.py:39-68` (`_identify`, `gemeinden`, `lookup`) |
| 3 | Geofabrik download unbounded | `extract.py:25-44` (`download`) |
| 4 | Blocking calls in async handlers | `app.py:130-155` (`create_job`, `challenge.check` at 145), `app.py:158-186`, `222-236`; `store.py:120-133`, `146-160` |
| 5 | `RLIMIT_AS` is per process | `runner.py:41-66` (`run_build`, `_limit`) |
| 6 | Unpinned pip dependencies | `service/requirements.txt`, `pipeline/requirements.txt`, `service/Dockerfile:11-13` |
| 7 | README names `scripts/gallery.py` | `service/README.md:119-122` — **out of scope**, see below |

## Out of scope

- **Finding 7** belongs to #170 (`docs/superpowers/plans/2026-10-10-region-editor-phase5.md`, Task 3 ships `scripts/gallery.py` in the image, Task 8 rewrites the README sentence). Nothing here touches the "Admin (SSH only)" section.
- The admin handler `gallery` (`app.py:249-274`) stays as it is: it is not public (SSH only) and #170 rewrites it.
- No Tor-exit block, no change of the `ALTCHA_COST` default, no cgroup per build (reasons below).
- No change to `prototype/`, `pipeline/*.py`, the editor (#169) or the game. No CHANGELOG entry and nothing in `test-todo.md`: nothing a player sees changes.

## Design

### 1. A cap per network, next to the cap per address

Today every limit except the queue length and the global daily count is per address. Twenty addresses fill the queue.

- A client's **network** is the /24 of its IPv4 address or the /48 of its IPv6 address. The per-address identity stays as it is (IPv4 address, IPv6 /64).
- Per network: at most **3** worlds queued or building (`per_net_active`), at most **15** new builds per UTC day (`per_net_daily`). Three times the per-address values, so a household or a school behind one range is not blocked by a neighbour's single build.
- The network is stored like the address: `sha256(daily salt : network)[:16]` through the existing `Store.ip_hash`, in a new table `net_builds(day, net_hash, world, created)`. It is purged with the day's other counters. No address or prefix is stored in clear.
- A new table, not a new column: `CREATE TABLE IF NOT EXISTS` needs no migration, and #170 is about to add the first migration (`Store._migrate`) for its own column.
- A row counts as the network's active build when the world is queued or building **and** was last requested by that network (`net_builds.created = worlds.created`), so a rebuild started by someone else does not count against the first requester.
- **No new error code.** Over the active cap: `503 busy` ("Server busy, try again later"). Over the daily cap: `429 daily-limit`. The editor (#169) already has strings for both.
- Checked inside the same `BEGIN IMMEDIATE` as the other limits, after them. A refusal rolls the human-check ticket back, as today.

What this does not stop: an attacker with addresses in seven or more different /24 networks (Tor exits are spread like that) still fills a queue of 20. The lever for that case stays `ALTCHA_COST` (environment, a restart), documented in the README. A Tor-exit block was rejected: it needs a third-party list fetched on a schedule, and it would shut out people the rest of the design goes out of its way not to track. Raising the default cost was rejected: it taxes every phone every time and only scales the attacker's cost linearly.

### 2. The preview's name lookup is bounded for everybody together

The expensive part of a preview is the pair of swisstopo requests (up to 0.9 s each). Everything else is one SQLite read.

A new class `preview.Names` owns the lookups:

- at most **4** lookups run at once (`preview_lookup_slots`), taken without waiting;
- at most **120** new lookups a minute for all clients together (`preview_lookups_per_minute`);
- a failed lookup is remembered for **60 s** (`preview_failure_ttl`) and not repeated in that time;
- beyond any of these the preview answers **at once without a name** (`name: null`, `gemeinden: []`), which the contract already allows for a failed lookup. `id`, `exists` and `raceOk` are always answered.

So at most 4 of the pool's 40 threads can ever wait on swisstopo. The bound is on the lookups, not on the endpoint: a global `429` on `/api/preview` would let one attacker switch the preview off for everyone, and `exists` decides whether the editor asks for a human check. The per-address limit of 60 a minute stays.

### 3. The Geofabrik download has three more bounds

- **Byte cap** `extract_max_bytes` = 2 GiB: refused before writing when `Content-Length` says more, dropped while streaming when the body grows past it.
- **Deadline** `extract_deadline` = 1800 s for the whole body, checked after every chunk.
- **Free disk**: before writing, the volume must have `Content-Length + extract_min_free_bytes` (1 GiB) free.

Each failure raises (`ValueError`, `TimeoutError`, `OSError`), which `extract.update` already treats as "keep the previous file, try again later".

### 4. No blocking work on the event loop

- Handlers that never `await` become plain functions; Starlette runs those in its thread pool: `get_job`, `world_status`, `health`, `world_file`, `get_challenge`.
- `create_job` keeps reading the body on the loop and hands the rest (SQLite, the human check) to a new function `admit` through `run_in_threadpool`.
- The human check runs **only when needed**: `admit` first asks `store.exists(wid)`; a cache hit or a join is never judged. `store.submit` stays authoritative; in the rare case that a world stops being joinable between the two reads, the answer is `403 human_check_failed`, which the editor already retries once with a fresh challenge.

### 5. The build is the first victim of the container's memory cap

`RLIMIT_AS` limits each process of the build, not their sum; the sum is limited by the worker container's 3 GB cgroup, which also holds the worker loop. The build's `preexec` now also writes `1000` to `/proc/self/oom_score_adj` (inherited by the whole tree, always allowed without privileges). When the cgroup runs out, the kernel kills a build process and the worker reports `build-failed`, instead of the worker dying and the container restarting.

A cgroup or scope per build was rejected: the container runs as the unprivileged user `app` (`service/Dockerfile:18-19`) with no systemd and a read-only cgroup tree; delegating one means more privileges for the container that runs untrusted-input builds.

### 6. The image installs a hashed lock file

`service/requirements.lock`: every runtime dependency of `pipeline/requirements.txt` and `service/requirements.txt`, pinned with `==` and `--hash=sha256:`, resolved for Python 3.12 on every platform (`uv pip compile --universal --generate-hashes`). The Dockerfile installs only that file with `--require-hashes`. The two `requirements.txt` files stay the human-edited ranges; the dev venv stays unpinned. The README says how to regenerate the lock.

## Constraints for sequencing with #170

#170 edits the same files. Overlap by function:

- `store.py`: #170 changes `SCHEMA` (the `worlds` table), `Store.__init__`, `set_gallery`, `unset_gallery`, `PLAYED_AT`, adds `_migrate`, `gallery_list`, `GALLERY_MAX`. This work changes `SCHEMA` (one new `CREATE TABLE` line at its end), `Store.submit`, `Store.purge_before`, adds `_check_net_limits`, `NET_ACTIVE`.
- `app.py`: #170 changes `gallery`, `ROUTES`, `ADMIN_ROUTES`, adds `clean_text`, `gallery_index`. This work changes `create_job`, `get_job`, `world_status`, `health`, `world_file`, `get_challenge`, `get_preview`, `create_app`, adds `admit`, `network_of`.
- `service/Dockerfile`, `Dockerfile.dockerignore`, `tests/test_packaging.py`, `service/README.md`: both add lines, in different places.

No function is changed by both. Whichever lands second rebases; `SCHEMA` and `ROUTES` are the two places to look at by hand.

## Testing

Unit tests only, in the existing suite (`cd service && .venv/bin/python -m pytest -q`): fake `get`, fake clocks, fake build commands, no real download, no real build, no `docker build`. The lock file is verified by installing it into a throwaway venv and running the suite from that venv.
