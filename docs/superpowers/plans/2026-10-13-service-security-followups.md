# Build service: security follow-ups from the #168 review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close findings 1-6 of the security review of PR#293 in `service/` before the API goes public (#296): caps per network, a bounded preview lookup, a bounded extract download, no blocking work on the event loop, the build as first OOM victim, a hashed dependency lock.

**Architecture:** Small additions inside the existing modules of `service/rhyflitzer_api/`. `preview.Names` (new class) owns the swisstopo lookups and their bounds. `store.submit` gets a second, per-network limit check backed by a new table `net_builds`. `app.create_job` hands its blocking half to a new sync function `admit`; the other handlers become sync functions. `extract.download` gets two guard helpers. `runner._limit` sets the OOM score. The image installs `service/requirements.lock`.

**Tech Stack:** Python 3.12, Starlette 1.x, stdlib `sqlite3` / `threading` / `ipaddress` / `shutil`, pytest. One throwaway tool for Task 6 only: `uv` (in a temp venv, never in the repo).

**Spec:** `docs/superpowers/specs/2026-10-13-service-security-followups-design.md` (on top of `docs/superpowers/specs/2026-10-10-region-editor-service-design.md`).

## Global Constraints

- **The public API contract does not change:** no new route, status code, error code or JSON field. The network caps answer with the existing `503 busy` and `429 daily-limit`.
- **Finding 7 of #296 is out of scope** (README names `scripts/gallery.py`): #170 owns it (`docs/superpowers/plans/2026-10-10-region-editor-phase5.md`, Task 3 and Task 8). Do not touch the "Admin (SSH only)" section of `service/README.md`, the handler `gallery`, `is_admin`, `ROUTES` or `ADMIN_ROUTES` in `app.py`, or `set_gallery` / `unset_gallery` / `PLAYED_AT` / `Store.__init__` in `store.py`.
- **Sequencing with #170** (it edits the same files): in `store.py` #170 changes `SCHEMA`'s `worlds` table, `Store.__init__`, `set_gallery`, `unset_gallery`, `PLAYED_AT` and adds `_migrate`, `gallery_list`; in `app.py` it changes `gallery`, `ROUTES`, `ADMIN_ROUTES` and adds `clean_text`, `gallery_index`. This plan touches none of those functions. In `SCHEMA` add the new table as the **last** statement and leave the `worlds` lines alone. If #170 has merged first, rebase and keep both sides.
- No change to `prototype/`, `pipeline/`, `data/`, `index.html`. **No CHANGELOG entry, nothing in `test-todo.md`:** nothing a player sees changes.
- No new runtime dependency. `service/requirements.txt` and `pipeline/requirements.txt` keep their content.
- **No real builds, no real downloads of OSM data, no `docker build`, no Playwright.** Every test uses fakes (fake `get`, fake clock, fake build command).
- Venv: `python3 -m venv service/.venv && service/.venv/bin/pip install -r service/requirements-dev.txt`. Tests: `cd service && .venv/bin/python -m pytest -q`. On the shared agent box run pytest and pip under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 <cmd>` (exit 137 = cap hit: stop and report, never raise the cap); a disposable CI runner without a user systemd session runs them plainly.
- **Never change an existing assertion to get green.** Two edits to test *helpers* are part of this plan and are named where they happen (Task 4: the fake HTTP reply gets `headers`, the `settings` fixture gets `extract_min_free_bytes=0`). If a test still fails after three attempts, stop and report.
- Logging: the attempt, then the outcome with its cause, through `logs.fields(...)`.
- Limits stay code constants in `config.Settings` (its docstring: "change only with a code review"); no new environment variable.
- Branch `fix/296-service-security-followups` from `origin/main`. Conventional Commits with explicit paths; commit and push after each task. One PR: `fix(service): security follow-ups from the #168 review (#296)`.

## Review Focus

- **A neighbour in the same /24 is not locked out for long, another network not at all:** the fourth active build of a network is `503 busy`, a different network still gets `202`, a finished build frees the place (`test_a_network_holds_at_most_three_active_builds`, `test_one_network_cannot_fill_the_queue`).
- **Cache hits and joins stay free under the network caps** (`test_a_network_builds_at_most_fifteen_new_worlds_a_day`).
- **A database created before this change keeps working** (`test_a_database_from_before_the_network_caps_gets_its_table`).
- **swisstopo down or slow: the preview still answers at once**, without a name, with `id`, `exists`, `raceOk` (`test_name_lookups_never_queue_beyond_their_slots`, `test_a_preview_beyond_the_lookup_budget_still_answers_without_a_name`).
- **An extract reply without `Content-Length`** is still capped while streaming, and no `.part` file is left behind on any failure (`test_an_extract_that_outgrows_the_cap_is_dropped`).

---

### Task 1: Bound the preview's name lookups (finding 2)

**Files:**
- Modify: `service/rhyflitzer_api/config.py` (class `Settings`, after `preview_per_minute`)
- Modify: `service/rhyflitzer_api/preview.py` (replace the functions `lookup` and `describe`; add class `Names`)
- Modify: `service/rhyflitzer_api/app.py` (`get_preview`, `create_app`)
- Test: `service/tests/test_preview.py`

**Interfaces:**
- Produces: `Settings.preview_lookup_slots: int = 4`, `Settings.preview_lookups_per_minute: int = 120`, `Settings.preview_failure_ttl: float = 60.0`; `preview.Names(get, settings, clock=time.monotonic)` with `Names.lookup(rect, year) -> tuple[str | None, list[str]]`; `preview.describe(store, settings, rect, wid, year, names: Names) -> dict`. `app.state.names` is a `Names`; `app.state.get` no longer exists.

- [ ] **Step 0: Preconditions.** `git fetch origin && git checkout -b fix/296-service-security-followups origin/main`. Create the venv if missing (Global Constraints). Baseline: `cd service && .venv/bin/python -m pytest -q` is green before any change.

- [ ] **Step 1: Write the failing tests.** In `service/tests/test_preview.py` change the imports at the top to

```python
import dataclasses
import threading
import time

import frame
import pytest
import region
import requests
from starlette.testclient import TestClient

from conftest import RECT, add_ready, ip
from rhyflitzer_api.app import create_app
from rhyflitzer_api.preview import Limiter, Names
```

add below `INSIDE = ...`:

```python
OTHER_RECT = (2667000.0, 1259750.0, 2669000.0, 1261750.0)
OTHER_BBOX = "bbox=2667000,1259750,2669000,1261750"
```

and append:

```python
def test_a_failed_name_lookup_is_not_repeated_for_a_minute(settings):
    now, calls = [0.0], []

    def down(url, params, timeout):
        calls.append(url)
        raise requests.ConnectionError("swisstopo is down")

    names = Names(down, settings, clock=lambda: now[0])
    assert names.lookup(RECT, 2026) == (None, []) and names.lookup(RECT, 2026) == (None, [])
    assert len(calls) == 1                                   # the second preview did not ask again
    now[0] = 61.0
    names.lookup(RECT, 2026)
    assert len(calls) == 2


def test_name_lookups_never_queue_beyond_their_slots(settings):
    started, release = threading.Event(), threading.Event()

    def slow(url, params, timeout):
        started.set()
        release.wait(5)
        return Reply(("Ehrendingen",))

    names = Names(slow, dataclasses.replace(settings, preview_lookup_slots=1))
    first = threading.Thread(target=names.lookup, args=(RECT, 2026))
    first.start()
    assert started.wait(5)
    began = time.monotonic()
    assert names.lookup(OTHER_RECT, 2026) == (None, []) and time.monotonic() - began < 1   # at once, without a name
    release.set()
    first.join(5)
    assert names.lookup(OTHER_RECT, 2026)[0] == "Ehrendingen"                              # the slot came back


def test_new_name_lookups_are_limited_for_everybody_together(settings):
    calls = []
    names = Names(fake_get(calls=calls), dataclasses.replace(settings, preview_lookups_per_minute=1), clock=lambda: 0.0)
    assert names.lookup(RECT, 2026)[0] == "Ehrendingen"
    assert names.lookup(OTHER_RECT, 2026) == (None, []) and len(calls) == 2      # two requests for the first frame only
    assert names.lookup(RECT, 2026)[0] == "Ehrendingen"                          # a cached frame costs nothing


def test_a_preview_beyond_the_lookup_budget_still_answers_without_a_name(settings, store):
    store.replace_roadgrid([(*INSIDE, 4000)])
    client = app(settings, store, preview_lookups_per_minute=1)
    assert client.get(f"/api/preview?{BBOX}").json()["name"] == "Ehrendingen"
    r = client.get(f"/api/preview?{OTHER_BBOX}")
    assert r.status_code == 200 and r.json()["name"] is None and r.json()["gemeinden"] == []
    assert r.json()["exists"] is False and r.json()["raceOk"] is True
```

- [ ] **Step 2: Run them.** `cd service && .venv/bin/python -m pytest tests/test_preview.py -q` fails at import (`cannot import name 'Names'`).

- [ ] **Step 3: Implement.**

`config.py`, in `Settings` directly after `preview_per_minute: int = 60`:

```python
    preview_lookup_slots: int = 4             # swisstopo name lookups running at once, all clients together
    preview_lookups_per_minute: int = 120     # new swisstopo name lookups a minute, all clients together
    preview_failure_ttl: float = 60.0         # a failed name lookup is not tried again for this long
```

`preview.py`: add `import threading` to the imports, add the constant `EVERYBODY = "*"` below `CACHE_SIZE = 512`, and replace the two functions `lookup` and `describe` (everything from `def lookup` to the end of the file) with:

```python
class Names:
    """Names of snapped frames from swisstopo, bounded for all clients together: at most `preview_lookup_slots`
    lookups at once and `preview_lookups_per_minute` new ones a minute; a failed lookup is remembered for
    `preview_failure_ttl` seconds. Beyond a bound the answer is (None, []) at once: a preview never waits."""

    def __init__(self, get, settings, clock=time.monotonic):
        self.get, self.clock, self.failure_ttl = get, clock, settings.preview_failure_ttl
        self._slots = threading.BoundedSemaphore(settings.preview_lookup_slots)
        self._rate = Limiter(settings.preview_lookups_per_minute, clock)
        self._found, self._failed, self._lock = {}, {}, threading.Lock()

    def lookup(self, rect, year: int) -> tuple[str | None, list[str]]:
        """(name, Gemeinden) of a snapped frame; (None, []) when it failed lately or the lookups are at a bound."""
        if rect in self._found:
            return self._found[rect]
        if not self._take_slot(rect):
            log.debug("Answering a preview without a name: the lookup failed lately or lookups are at their bound")
            return None, []
        try:
            return self._ask(rect, year)
        finally:
            self._slots.release()

    def _take_slot(self, rect) -> bool:
        """Takes a lookup slot (lookup() gives it back) unless the frame failed lately or a bound is reached."""
        with self._lock:
            if self.clock() < self._failed.get(rect, 0.0):
                return False
            if not self._slots.acquire(blocking=False):
                return False
            if not self._rate.allow(EVERYBODY):
                self._slots.release()
                return False
            return True

    def _ask(self, rect, year: int) -> tuple[str | None, list[str]]:
        log.debug("Looking up the Gemeinden of a preview")
        try:
            found = gemeinden(rect, year, self.get)
        except (requests.RequestException, ValueError, KeyError):
            log.warning("Looking up the Gemeinden of a preview failed; answering without a name for %.0f s",
                        self.failure_ttl, exc_info=True)
            self._remember(self._failed, rect, self.clock() + self.failure_ttl)
            return None, []
        self._remember(self._found, rect, found)
        log.debug("Looked up the Gemeinden of a preview")
        return found

    @staticmethod
    def _remember(cache: dict, rect, value) -> None:
        if len(cache) >= CACHE_SIZE:
            cache.clear()
        cache[rect] = value


def describe(store: Store, settings, rect, wid: str, year: int, names: Names) -> dict:
    """id and exists (a POST would only join or read the world: no human check), name, Gemeinden, raceOk."""
    name, found = names.lookup(rect, year)
    meters = store.major_meters(rect)
    answer = {"id": wid, "exists": store.exists(wid), "name": name, "gemeinden": found, "raceOk": None if meters is None else meters >= settings.race_min_road_m}
    if meters is None:
        answer["reason"] = NO_INDEX
    elif not answer["raceOk"]:
        answer["reason"] = FEW_ROADS
    return answer
```

`app.py`, in `get_preview` the last statement becomes:

```python
    return JSONResponse(await run_in_threadpool(preview.describe, state.store, state.settings, rect, wid,
                                                time.gmtime().tm_year, state.names))
```

and in `create_app` the line that sets `app.state.get, app.state.names, app.state.limiter` becomes:

```python
    app.state.names, app.state.limiter = preview.Names(get, settings), preview.Limiter(settings.preview_per_minute)
```

- [ ] **Step 4: Run.** `cd service && .venv/bin/python -m pytest tests/test_preview.py -q` passes (the new tests and all the old ones, unchanged), then the whole suite `.venv/bin/python -m pytest -q`.

- [ ] **Step 5: Commit.** `git add service/rhyflitzer_api/config.py service/rhyflitzer_api/preview.py service/rhyflitzer_api/app.py service/tests/test_preview.py && git commit -m "fix(service): bound the preview's name lookups for all clients together (#296)" && git push -u origin fix/296-service-security-followups`

---

### Task 2: No blocking work on the event loop; the human check only when needed (finding 4)

**Files:**
- Modify: `service/rhyflitzer_api/app.py` (`create_job`, `get_job`, `world_status`, `health`, `world_file`, `get_challenge`; new function `admit`)
- Test: `service/tests/test_human_check.py`

**Interfaces:**
- Produces: `app.admit(request, rect, solution) -> JSONResponse` (sync; Task 3 edits its `store.submit` call). `get_job`, `world_status`, `health`, `world_file`, `get_challenge` are plain `def` (Starlette runs sync endpoints in its thread pool).

- [ ] **Step 1: Write the failing tests.** In `service/tests/test_human_check.py` add `import asyncio` and `import pytest` to the imports and append:

```python
def off_loop() -> bool:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return True
    return False


def test_a_cache_hit_does_not_judge_the_solution(client, store, settings, monkeypatch):
    add_ready(store, settings, WID)
    monkeypatch.setattr(challenge, "check", lambda payload, s: pytest.fail("the human check ran for a cache hit"))
    assert post(client, payload="anything").status_code == 200


def test_store_and_human_check_run_off_the_event_loop(client, store, monkeypatch):
    seen = []

    def spy(name, real):
        def call(*args, **kw):
            seen.append((name, off_loop()))
            return real(*args, **kw)
        return call

    for name in ("get", "submit", "ip_hash", "prev_ip_hash", "position", "counts"):
        monkeypatch.setattr(store, name, spy(name, getattr(store, name)))
    monkeypatch.setattr(challenge, "check", spy("check", challenge.check))
    assert post(client, payload=human(client)).status_code == 202
    for path in (f"/api/jobs/{WID}", f"/api/worlds/{WID}", "/api/health", f"/worlds/{WID}/world.json"):
        client.get(path)
    assert {name for name, _ in seen} >= {"get", "submit", "ip_hash", "position", "counts", "check"}
    assert all(off for _, off in seen), seen
```

- [ ] **Step 2: Run them.** `cd service && .venv/bin/python -m pytest tests/test_human_check.py -q`: both new tests fail (the check runs for a cache hit; the store is called on the loop).

- [ ] **Step 3: Implement** in `app.py`. Replace the whole function `create_job` with:

```python
async def create_job(request: Request) -> JSONResponse:
    try:
        body = await read_json(request)
    except BodyTooLarge:
        return error(413, "too-large", "the request body is too large")
    except ValueError:
        return error(400, "bad-request", "the body must be JSON")
    try:
        rect = snapped(body)
    except frame.FrameError as exc:
        return error(400, exc.code, str(exc))
    except (TypeError, ValueError):
        return error(400, "bad-bbox", BBOX_HELP)
    return await run_in_threadpool(admit, request, rect, body.get("altcha"))


def admit(request: Request, rect, solution) -> JSONResponse:
    """The blocking half of POST /api/jobs (SQLite and the human check), run off the event loop."""
    settings, store = request.app.state.settings, request.app.state.store
    wid, now = frame.world_id(rect, region.PIPELINE_VERSION), time.time()
    ticket = None if store.exists(wid) else challenge.check(solution, settings)   # a join or a cache hit is never judged
    log.info("Admitting a build of world %s", wid, extra=logs.fields(world=wid, lv95=list(rect)))
    try:
        address = client_ip(request, settings.proxy_hops, settings.trusted_proxies)
        row = store.submit(wid, rect, store.ip_hash(address, now), now, settings,
                           prev_ip_hash=store.prev_ip_hash(address, now), gate=human_gate(ticket, now))
    except Refused as exc:
        log.info("Refused a build of world %s: %s", wid, exc.code, extra=logs.fields(world=wid, code=exc.code))
        return error(exc.status, exc.code, str(exc))
    log.info("World %s is %s", wid, row["state"], extra=logs.fields(world=wid, state=row["state"]))
    return JSONResponse(job_view(store, row), status_code=200 if row["state"] == "ready" else 202)
```

Then change exactly five signatures from `async def` to `def`, bodies untouched: `get_job`, `world_status`, `health`, `world_file`, `get_challenge`. Leave `gallery` (`async`, #170 owns it) and `get_preview` (`async`, it awaits) alone.

- [ ] **Step 4: Run.** `cd service && .venv/bin/python -m pytest -q`: everything passes, including the untouched `test_exists_matches_the_human_check_but_the_server_stays_authoritative` and `test_refused_build_leaves_the_solution_unspent`.

- [ ] **Step 5: Commit.** `git add service/rhyflitzer_api/app.py service/tests/test_human_check.py && git commit -m "fix(service): keep SQLite and the human check off the event loop (#296)" && git push`

---

### Task 3: Caps per network (finding 1)

**Files:**
- Modify: `service/rhyflitzer_api/config.py` (`Settings`, after `per_ip_daily`)
- Modify: `service/rhyflitzer_api/store.py` (`SCHEMA`: one new last statement; new `NET_ACTIVE`, `_check_net_limits`; `Store.submit`; `Store.purge_before`)
- Modify: `service/rhyflitzer_api/app.py` (new `network_of`; the `store.submit` call in `admit`)
- Test: `service/tests/test_store.py`, `service/tests/test_app_jobs.py`

**Interfaces:**
- Consumes: `app.admit` from Task 2.
- Produces: `Settings.per_net_active: int = 3`, `Settings.per_net_daily: int = 15`; `Store.submit(wid, rect, ip_hash, now, settings, prev_ip_hash=None, gate=None, net_hash=None, prev_net_hash=None)` (without `net_hash` nothing about networks is checked or stored, so every existing caller keeps working); `app.network_of(address: str) -> str`.

- [ ] **Step 1: Write the failing tests.** Append to `service/tests/test_store.py`:

```python
def test_a_network_holds_at_most_three_active_builds(store, settings):
    for n in range(3):
        store.submit(wid(n), RECT, f"ip{n}", T0, settings, net_hash="net-a")
    with pytest.raises(Refused) as e:
        store.submit(wid(3), RECT, "ip3", T0, settings, net_hash="net-a")
    assert (e.value.status, e.value.code) == (503, "busy") and store.get(wid(3)) is None
    assert store.submit(wid(3), RECT, "ip3", T0, settings, net_hash="net-b")["state"] == "queued"      # another network is free
    assert store.claim_next(T0)["id"] == wid(0)
    store.finish_ready(wid(0), T0, 10)
    assert store.submit(wid(4), RECT, "ip4", T0 + 1, settings, net_hash="net-a")["state"] == "queued"  # a finished build frees a place


def test_a_network_keeps_its_active_builds_across_utc_midnight(store, settings):
    for n in range(3):
        store.submit(wid(n), RECT, f"ip{n}", T0, settings, net_hash="yesterday")
    with pytest.raises(Refused) as e:
        store.submit(wid(3), RECT, "ip3", T0 + DAY, settings, net_hash="today", prev_net_hash="yesterday")
    assert e.value.code == "busy"


def test_a_network_builds_at_most_fifteen_new_worlds_a_day(store, settings):
    for n in range(15):
        store.submit(wid(n), RECT, f"ip{n}", T0, settings, net_hash="net-a")
        store.claim_next(T0)
        store.finish_ready(wid(n), T0, 10)
    with pytest.raises(Refused) as e:
        store.submit(wid(15), RECT, "ip15", T0, settings, net_hash="net-a")
    assert (e.value.status, e.value.code) == (429, "daily-limit")
    assert store.submit(wid(0), RECT, "ip15", T0, settings, net_hash="net-a")["state"] == "ready"         # a cache hit stays free
    assert store.submit(wid(15), RECT, "ip15", T0 + DAY, settings, net_hash="net-a")["state"] == "queued"  # a new day


def test_a_rebuild_counts_for_the_network_that_asked_for_it(store, settings):
    s = dataclasses.replace(settings, per_net_active=1)
    store.submit(wid(1), RECT, "a", T0, s, net_hash="net-a")
    store.claim_next(T0)
    store.finish_failed(wid(1), T0, "timeout", "slow")
    store.submit(wid(1), RECT, "b", T0 + 1, s, net_hash="net-b")                    # net-b asks for the rebuild
    assert store.submit(wid(2), RECT, "c", T0 + 2, s, net_hash="net-a")["state"] == "queued"
    with pytest.raises(Refused):
        store.submit(wid(3), RECT, "d", T0 + 3, s, net_hash="net-b")


def test_the_purge_forgets_past_days_networks(store, settings):
    store.submit(wid(1), RECT, "a", T0 - DAY, settings, net_hash="net-a")
    store.purge_before(day_of(T0))
    assert store._q("SELECT COUNT(*) AS n FROM net_builds")[0]["n"] == 0


def test_a_database_from_before_the_network_caps_gets_its_table(store, settings):
    from rhyflitzer_api.store import Store
    store._x("DROP TABLE net_builds")
    assert Store(settings.db_path).submit(wid(1), RECT, "a", T0, settings, net_hash="net-a")["state"] == "queued"


def test_the_network_caps_are_three_active_and_fifteen_a_day(settings):
    assert (settings.per_net_active, settings.per_net_daily) == (3, 15)
```

In `service/tests/test_app_jobs.py` change the import `from rhyflitzer_api.app import client_ip` to `from rhyflitzer_api.app import client_ip, network_of` and append:

```python
def test_network_of_is_the_24_or_the_48():
    assert network_of("203.0.113.9") == network_of("203.0.113.200") == "203.0.113.0/24"
    assert network_of("203.0.114.9") != network_of("203.0.113.9")
    assert network_of("2001:db8:1:2::") == network_of("2001:db8:1:ffff::") == "2001:db8:1::/48"
    assert network_of("2001:db8:2::") != network_of("2001:db8:1::")
    assert network_of("unknown") == "unknown"


def test_one_network_cannot_fill_the_queue(client):
    frames = [[2667000 + 250 * n, 1259750, 2669250 + 250 * n, 1261750] for n in range(4)]
    codes = [client.post("/api/jobs", json={"lv95": f, "altcha": human(client)}, headers=ip(n + 1)).status_code
             for n, f in enumerate(frames)]
    assert codes == [202, 202, 202, 503]                       # four addresses, one /24
    elsewhere = client.post("/api/jobs", json={"lv95": frames[3], "altcha": human(client)},
                            headers={"X-Forwarded-For": "198.51.100.7"})
    assert elsewhere.status_code == 202
```

- [ ] **Step 2: Run them.** `cd service && .venv/bin/python -m pytest tests/test_store.py tests/test_app_jobs.py -q`: `test_app_jobs.py` fails at import (`network_of`), the new store tests fail with `TypeError: ... unexpected keyword argument 'net_hash'`.

- [ ] **Step 3: Implement.**

`config.py`, in `Settings` directly after `per_ip_daily: int = 5`:

```python
    per_net_active: int = 3                   # queued or building per network (/24 of IPv4, /48 of IPv6)
    per_net_daily: int = 15                   # new builds per network and UTC day
```

`store.py`. In `SCHEMA` add as the last statement, after the `roadgrid` table and before the closing `"""`:

```sql
CREATE TABLE IF NOT EXISTS net_builds (day TEXT NOT NULL, net_hash TEXT NOT NULL, world TEXT NOT NULL, created REAL NOT NULL);
```

Below `PLAYED_AT = ...` add:

```python
NET_ACTIVE = ("SELECT COUNT(*) FROM worlds w JOIN net_builds n ON n.world = w.id AND n.created = w.created "
              "WHERE w.state IN ('queued', 'building') AND n.net_hash IN (?, ?)")
```

Below the function `_check_limits` add:

```python
def _check_net_limits(db, net_hash: str, prev_net_hash: str | None, day: str, s) -> None:
    """The same two limits per network, so the addresses of one range cannot fill the queue or the day alone."""
    if _count(db, NET_ACTIVE, (net_hash, prev_net_hash or net_hash)) >= s.per_net_active:
        raise Refused(503, "busy", "Server busy, try again later")
    if _count(db, "SELECT COUNT(*) FROM net_builds WHERE day = ? AND net_hash = ?", (day, net_hash)) >= s.per_net_daily:
        raise Refused(429, "daily-limit", f"At most {s.per_net_daily} new worlds per day from one network; try again tomorrow")
```

Replace the method `Store.submit` with:

```python
    def submit(self, wid: str, rect, ip_hash: str, now: float, settings, prev_ip_hash: str | None = None, gate=None,
               net_hash: str | None = None, prev_net_hash: str | None = None) -> dict:
        """The world's row: as it is when built, queued, building or permanently failed (free); otherwise queued
        as a new build after the limits allow it (per address, and per network when net_hash is given). Raises Refused."""
        def admit(db):
            row = db.execute("SELECT * FROM worlds WHERE id = ?", (wid,)).fetchone()
            if joins(row):
                return dict(row)
            if gate is not None:
                gate(db)
            _check_limits(db, ip_hash, day_of(now), settings, prev_ip_hash)
            if net_hash is not None:
                _check_net_limits(db, net_hash, prev_net_hash, day_of(now), settings)
                db.execute("INSERT INTO net_builds(day, net_hash, world, created) VALUES (?, ?, ?, ?)",
                           (day_of(now), net_hash, wid, now))
            db.execute(REQUEUE, (wid, json.dumps(list(rect)), ip_hash, now))
            db.execute("INSERT INTO builds(day, ip_hash, world) VALUES (?, ?, ?)", (day_of(now), ip_hash, wid))
            return dict(db.execute("SELECT * FROM worlds WHERE id = ?", (wid,)).fetchone())

        return self._tx(admit)
```

(`REQUEUE` sets `worlds.created` to the same `now` that goes into `net_builds.created`; that equality is what `NET_ACTIVE` joins on.)

In `Store.purge_before` add as the last line:

```python
        self._x("DELETE FROM net_builds WHERE day < ?", (day,))
```

`app.py`. Below the function `_subscriber` add:

```python
NET_PREFIX = {4: 24, 6: 48}


def network_of(address: str) -> str:
    """The network a client shares with its neighbours: the /24 of an IPv4 address, the /48 of an IPv6 one."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return address
    return str(ipaddress.ip_network(f"{ip}/{NET_PREFIX[ip.version]}", strict=False))
```

In `admit` replace the two lines `address = ...` / `row = store.submit(...)` with:

```python
        address = client_ip(request, settings.proxy_hops, settings.trusted_proxies)
        net = network_of(address)
        row = store.submit(wid, rect, store.ip_hash(address, now), now, settings,
                           prev_ip_hash=store.prev_ip_hash(address, now), gate=human_gate(ticket, now),
                           net_hash=store.ip_hash(net, now), prev_net_hash=store.prev_ip_hash(net, now))
```

- [ ] **Step 4: Run.** `cd service && .venv/bin/python -m pytest -q`: everything passes. (The existing tests send from `203.0.113.n`, one /24, but never hold more than two active builds.)

- [ ] **Step 5: Commit.** `git add service/rhyflitzer_api/config.py service/rhyflitzer_api/store.py service/rhyflitzer_api/app.py service/tests/test_store.py service/tests/test_app_jobs.py && git commit -m "fix(service): cap queued and daily builds per network (#296)" && git push`

---

### Task 4: Bound the Geofabrik download (finding 3)

**Files:**
- Modify: `service/rhyflitzer_api/config.py` (`Settings`, after `extract_url`)
- Modify: `service/rhyflitzer_api/extract.py` (`download`; new `_room_for`, `_within`)
- Test: `service/tests/test_housekeeping_extract.py`, `service/tests/conftest.py` (fixture `settings` only)

**Interfaces:**
- Produces: `Settings.extract_max_bytes: int = 2 * 1024**3`, `Settings.extract_deadline: float = 1800.0`, `Settings.extract_min_free_bytes: int = 1024**3`; `extract.download(settings, get=requests.get, clock=time.monotonic)`.

- [ ] **Step 1: Two helper edits (not assertions).** A real `requests.Response` always has `headers`; the suite's fake does not yet. In `service/tests/test_housekeeping_extract.py` give the class `FakeResponse` one class attribute, directly under its `class` line:

```python
    headers: dict = {}
```

And the tests must not depend on how full the machine's disk is: in `service/tests/conftest.py` the `settings` fixture's return becomes

```python
    return Settings(data_dir=tmp_path, altcha_secret_file=key, altcha_cost=1, extract_min_free_bytes=0)
```

- [ ] **Step 2: Write the failing tests.** In `service/tests/test_housekeeping_extract.py` add `import types` to the imports and append:

```python
class Sized(FakeResponse):
    """A reply with headers whose body arrives in pieces."""

    def __init__(self, body: bytes, headers=None, pieces=1):
        super().__init__(body)
        self.headers, self.pieces = headers or {}, pieces

    def iter_content(self, size):
        step = max(1, len(self.body) // self.pieces)
        for start in range(0, len(self.body), step):
            yield self.body[start:start + step]


def sized_get(pbf: bytes, headers=None, pieces=1):
    def get(url, **kw):
        if url.endswith(".md5"):
            return FakeResponse(f"{hashlib.md5(pbf).hexdigest()}  switzerland-latest.osm.pbf\n".encode())
        return Sized(pbf, headers, pieces)
    return get


def untouched(old_extract) -> bool:
    return old_extract.read_bytes() == b"old" and not list(old_extract.parent.glob("*.part"))


def test_an_extract_announced_over_the_cap_is_refused_before_writing(settings, old_extract):
    s = dataclasses.replace(settings, extract_max_bytes=10)
    with pytest.raises(ValueError, match="cap"):
        extract.download(s, sized_get(b"new", {"Content-Length": "11"}))
    assert untouched(old_extract)


def test_an_extract_that_outgrows_the_cap_is_dropped(settings, old_extract):
    s = dataclasses.replace(settings, extract_max_bytes=10)
    with pytest.raises(ValueError, match="cap"):
        extract.download(s, sized_get(b"x" * 30, pieces=3))          # no Content-Length: caught while streaming
    assert untouched(old_extract)


def test_a_download_past_its_deadline_is_dropped(settings, old_extract):
    ticks = iter([0.0, 10.0, 2000.0, 2001.0, 2002.0])                # start, first piece, second piece: too late
    with pytest.raises(TimeoutError):
        extract.download(settings, sized_get(b"x" * 30, pieces=3), clock=lambda: next(ticks))
    assert untouched(old_extract)


def test_too_little_free_disk_refuses_the_download_before_writing(settings, old_extract, monkeypatch):
    s = dataclasses.replace(settings, extract_min_free_bytes=30)
    monkeypatch.setattr(extract.shutil, "disk_usage", lambda path: types.SimpleNamespace(free=40))
    with pytest.raises(OSError, match="free disk"):
        extract.download(s, sized_get(b"x" * 20, {"Content-Length": "20"}))      # 20 + 30 > 40
    assert untouched(old_extract)
    monkeypatch.setattr(extract.shutil, "disk_usage", lambda path: types.SimpleNamespace(free=50))
    extract.download(s, sized_get(b"x" * 20, {"Content-Length": "20"}))
    assert old_extract.read_bytes() == b"x" * 20


def test_update_keeps_the_old_file_when_the_new_one_is_too_big(settings, old_extract):
    s = dataclasses.replace(settings, extract_max_bytes=2, source_retries=0)
    assert not extract.update(s, sized_get(b"new"), sleep=lambda seconds: None)
    assert untouched(old_extract)
```

- [ ] **Step 3: Run them.** `cd service && .venv/bin/python -m pytest tests/test_housekeeping_extract.py -q`: collection fails (`Settings` has no `extract_min_free_bytes`).

- [ ] **Step 4: Implement.**

`config.py`, in `Settings` directly after the `extract_url` line:

```python
    extract_max_bytes: int = 2 * 1024**3      # a larger extract is not ours: refused, the previous file stays
    extract_deadline: float = 1800.0          # seconds for the whole download
    extract_min_free_bytes: int = 1024**3     # free disk that must remain after the new extract is written
```

`extract.py`: add `import shutil` to the imports. Above `download` add:

```python
def _room_for(settings, announced: int) -> None:
    """Raises before a byte is written when the extract is announced too big or the volume would run short."""
    if announced > settings.extract_max_bytes:
        raise ValueError(f"the extract is announced as {announced} bytes, over the cap of {settings.extract_max_bytes}")
    free = shutil.disk_usage(settings.extract_path.parent).free
    if free < announced + settings.extract_min_free_bytes:
        raise OSError(f"not enough free disk for the extract: {free} bytes free, {announced} announced")


def _within(settings, size: int, seconds: float) -> None:
    """Raises when the body has outgrown the byte cap or the download its deadline."""
    if size > settings.extract_max_bytes:
        raise ValueError(f"the extract is larger than the cap of {settings.extract_max_bytes} bytes")
    if seconds > settings.extract_deadline:
        raise TimeoutError(f"the extract download took longer than {settings.extract_deadline:.0f} s")
```

Replace `download` with:

```python
def download(settings, get=requests.get, clock=time.monotonic) -> None:
    """Raises on any failure (also: over the byte cap, past the deadline, too little free disk); the current
    extract is untouched until the new one is complete and verified."""
    dest = settings.extract_path
    part = dest.with_name(dest.name + ".part")
    dest.parent.mkdir(parents=True, exist_ok=True)
    answer = get(settings.extract_url + ".md5", timeout=60)
    answer.raise_for_status()
    expected, digest, started, size = answer.text.split()[0], hashlib.md5(), clock(), 0
    try:
        with get(settings.extract_url, stream=True, timeout=120) as r:
            r.raise_for_status()
            _room_for(settings, int(r.headers.get("Content-Length") or 0))
            with part.open("wb") as f:
                for chunk in r.iter_content(CHUNK):
                    size += len(chunk)
                    _within(settings, size, clock() - started)
                    f.write(chunk)
                    digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError(f"checksum mismatch: got {digest.hexdigest()}, Geofabrik says {expected}")
        os.replace(part, dest)
    finally:
        part.unlink(missing_ok=True)
```

`update` needs no change: it already catches `requests.RequestException`, `ValueError` and `OSError` (`TimeoutError` is an `OSError`) and logs the cause.

- [ ] **Step 5: Run.** `cd service && .venv/bin/python -m pytest -q`: everything passes.

- [ ] **Step 6: Commit.** `git add service/rhyflitzer_api/config.py service/rhyflitzer_api/extract.py service/tests/test_housekeeping_extract.py service/tests/conftest.py && git commit -m "fix(service): cap size, time and disk use of the extract download (#296)" && git push`

---

### Task 5: The build is the first victim of the container's memory cap (finding 5)

**Files:**
- Modify: `service/rhyflitzer_api/runner.py` (`_limit`)
- Test: `service/tests/test_build_runner.py`

**Interfaces:** none new; `runner._limit(settings)` keeps its signature.

- [ ] **Step 1: Write the failing test.** Append to `service/tests/test_build_runner.py`:

```python
def test_the_build_is_the_first_victim_of_the_container_memory_cap(settings, tmp_path):
    note = tmp_path / "oom_score_adj"
    code = "import pathlib, sys; pathlib.Path(sys.argv[1]).write_text(pathlib.Path('/proc/self/oom_score_adj').read_text())"
    runner.run_build(JOB, settings, lambda step: None, lambda job, s, out: [sys.executable, "-c", code, str(note)])
    assert note.read_text().strip() == "1000"
    assert Path("/proc/self/oom_score_adj").read_text().strip() != "1000"      # the worker keeps its own score
```

- [ ] **Step 2: Run it.** `cd service && .venv/bin/python -m pytest tests/test_build_runner.py -q -k first_victim` fails (the child's score is the parent's, usually `0`).

- [ ] **Step 3: Implement.** In `runner.py` replace `_limit` with:

```python
def _limit(settings) -> None:
    """Runs in the child before exec: memory and CPU caps that every process of the build tree inherits, and the
    highest OOM score, so that when the container's memory cap is reached the kernel kills the build, not the worker."""
    resource.setrlimit(resource.RLIMIT_AS, (settings.build_memory_bytes, settings.build_memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (settings.build_cpu_seconds, settings.build_cpu_seconds))
    try:
        Path("/proc/self/oom_score_adj").write_text("1000")
    except OSError:      # no writable /proc: the build still runs, only without this preference
        pass
```

(`Path` is already imported in `runner.py`. Raising one's own score needs no privilege. The `except` is deliberate: an exception in `preexec_fn` would fail every build, and this preference is not worth that; the test above proves it takes effect where `/proc` is writable.)

- [ ] **Step 4: Run.** `cd service && .venv/bin/python -m pytest tests/test_build_runner.py -q` passes.

- [ ] **Step 5: Commit.** `git add service/rhyflitzer_api/runner.py service/tests/test_build_runner.py && git commit -m "fix(service): make the build the first OOM victim in the worker container (#296)" && git push`

---

### Task 6: Install a hashed lock file in the image (finding 6)

**Files:**
- Create: `service/requirements.lock` (generated, committed)
- Modify: `service/Dockerfile` (lines 11-13), `service/Dockerfile.dockerignore`
- Test: `service/tests/test_packaging.py`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test.** Append to `service/tests/test_packaging.py`:

```python
def test_the_image_installs_only_pinned_hashed_dependencies():
    docker = (SERVICE / "Dockerfile").read_text()
    assert "pip install --no-cache-dir --require-hashes -r service/requirements.lock" in docker
    assert "-r pipeline/requirements.txt" not in docker and "-r service/requirements.txt" not in docker
    assert "!service/requirements.lock" in (SERVICE / "Dockerfile.dockerignore").read_text().splitlines()
    lock = (SERVICE / "requirements.lock").read_text()
    pins = [line for line in lock.splitlines() if line and not line.startswith((" ", "#"))]
    assert pins and all("==" in line and line.endswith("\\") for line in pins)
    assert lock.count("--hash=sha256:") >= len(pins)
    names = {line.split("==")[0].lower() for line in pins}
    assert {"starlette", "uvicorn", "altcha", "numpy", "rasterio", "pyproj", "requests", "osmium", "shapely", "scipy"} <= names
```

- [ ] **Step 2: Run it.** `cd service && .venv/bin/python -m pytest tests/test_packaging.py -q` fails (the Dockerfile has no `--require-hashes`).

- [ ] **Step 3: Generate the lock** from the repo root, with `uv` in a throwaway venv outside the repo:

```bash
LOCKTMP=$(mktemp -d)
python3 -m venv "$LOCKTMP/tool" && "$LOCKTMP/tool/bin/pip" install -q uv
"$LOCKTMP/tool/bin/uv" pip compile --universal --python-version 3.12 --generate-hashes \
  -o service/requirements.lock pipeline/requirements.txt service/requirements.txt
```

The file starts with a comment naming the command, then one `name==version \` line per package, each followed by indented `--hash=sha256:...` lines. Do not edit it by hand. If `uv` cannot be installed, stop and report; do not write the lock by hand and do not fall back to an unhashed pin file.

- [ ] **Step 4: Dockerfile.** Replace the three lines

```dockerfile
COPY pipeline/requirements.txt pipeline/requirements.txt
COPY service/requirements.txt service/requirements.txt
RUN pip install --no-cache-dir -r pipeline/requirements.txt -r service/requirements.txt
```

with

```dockerfile
COPY service/requirements.lock service/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r service/requirements.lock
```

In `service/Dockerfile.dockerignore` add the line `!service/requirements.lock` directly after `!pipeline/requirements.txt` (not at the end: #170 appends there).

- [ ] **Step 5: Prove the lock installs and the suite runs on it** (this stands in for the `docker build` this plan must not run). Needs Python 3.12 (`python3 --version`; the image is 3.12). If the machine has no 3.12, skip this step and say so in the PR description.

```bash
python3 -m venv "$LOCKTMP/check"
"$LOCKTMP/check/bin/pip" install -q --require-hashes -r service/requirements.lock
"$LOCKTMP/check/bin/pip" install -q pytest httpx
(cd service && "$LOCKTMP/check/bin/python" -m pytest -q)
rm -rf "$LOCKTMP"
```

Expected: the hashed install succeeds without a "hashes are required" or "do not match" error and the suite is green. A failure here is a real finding: fix the lock generation, not the test.

- [ ] **Step 6: Run** `cd service && .venv/bin/python -m pytest -q` (the normal venv): green, including the untouched `test_runtime_dependencies_are_exactly_these` and `test_base_images_are_pinned_by_digest`.

- [ ] **Step 7: Commit.** `git add service/requirements.lock service/Dockerfile service/Dockerfile.dockerignore service/tests/test_packaging.py && git commit -m "fix(service): install pinned, hashed dependencies in the image (#296)" && git push`

---

### Task 7: Operator documentation

**Files:**
- Modify: `service/README.md` (the paragraph ending "IPv6 clients are counted per /64." and the section "Operations"; **not** "Admin (SSH only)")
- Test: `service/tests/test_packaging.py`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test.** Append to `service/tests/test_packaging.py`:

```python
def test_readme_documents_the_network_caps_and_the_lock():
    text = (SERVICE / "README.md").read_text()
    assert "/24" in text and "/48" in text and "ALTCHA_COST" in text
    assert "requirements.lock" in text and "uv pip compile" in text and "oom_score_adj" in text
```

- [ ] **Step 2: Run it:** fails.

- [ ] **Step 3: Edit `service/README.md`.**

Replace the sentence `IPv6 clients are counted per /64.` with:

```markdown
IPv6 clients are counted per /64. On top of the limits per address, each network (the /24 of an IPv4 address, the /48
of an IPv6 one) may have 3 worlds queued or building (the fourth gets `503 busy`) and start 15 new builds a day
(`429 daily-limit`); networks are stored like addresses, as a hash with the day's salt.
```

In the section "Operations" replace the bullet that starts with `- A build runs in its own process group` with:

```markdown
- A build runs in its own process group with `RLIMIT_AS` (`build_memory_bytes`) and `RLIMIT_CPU`; on timeout the whole group is killed. `RLIMIT_AS` is per process; the sum is capped by the worker container's `mem_limit: 3g`. The build tree runs with `oom_score_adj` 1000, so at that cap the kernel kills the build, not the worker: it shows as `build-failed` "killed by signal 9". A build the worker dies in three times is failed for good.
- Under attack: the network caps stop one address range; many unrelated networks (Tor exits, proxies) can still fill the queue of 20 (`503 busy` for everyone) or the 100 builds a day. Raise `ALTCHA_COST` in the `rhyflitzer-api` environment and restart it; each queued build then costs the sender that much more CPU.
- The preview's name lookup is bounded for all clients together (4 at once, 120 new frames a minute, a failed lookup rests for 60 s); beyond that a preview answers without a name, never with an error.
- The weekly extract download is refused over 2 GiB, after 30 minutes, or when less than 1 GiB of disk would remain; the previous extract stays (`docker logs rhyflitzer-worker` says which bound).
- Dependencies: the image installs `service/requirements.lock` with `--require-hashes`. After changing `pipeline/requirements.txt` or `service/requirements.txt`, regenerate it from the repo root with `uv pip compile --universal --python-version 3.12 --generate-hashes -o service/requirements.lock pipeline/requirements.txt service/requirements.txt` and commit it; regenerate it the same way to take security updates.
```

- [ ] **Step 4: Run** `cd service && .venv/bin/python -m pytest -q`: the whole suite is green (the older README tests in `test_packaging.py` included).

- [ ] **Step 5: Commit and open the PR.** `git add service/README.md service/tests/test_packaging.py && git commit -m "docs(service): document network caps, preview bounds, extract caps and the lock (#296)" && git push`. PR title `fix(service): security follow-ups from the #168 review (#296)`, body per the repo's PR template, `Closes #296`, and one line: "Finding 7 (README names `scripts/gallery.py`) is #170's."
