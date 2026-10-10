# Region editor phase 3: the build service on ionos1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `service/` holds a Starlette API and one worker that queue, limit, build (via `region.build_world`), serve, expire and evict generated worlds, plus the Dockerfile that runs both on ionos1 (#168).

**Architecture:** Package `service/rhyflitzer_api/`: `config` (env settings + the limits table), `logs` (JSON lines), `store` (SQLite: queue, limits, metadata), `app` (HTTP), `build` (one build in a subprocess) + `runner` (worker side of it), `housekeeping` (retention, cap, nightly), `extract` (weekly Geofabrik), `challenge` (ALTCHA human check on new builds), `roadgrid` + `preview` (the frame preview), `worker` (the loop). Two compose services from one image: API (512 MB) and worker (3 GB cap). Contract and reasons: spec below.

**Tech Stack:** Python 3.12, Starlette 1.x + uvicorn + `altcha` (new; the human check), httpx (tests only, for Starlette's TestClient), stdlib `sqlite3`; the pipeline's own requirements; pytest.

**Spec:** `docs/superpowers/specs/2026-10-10-region-editor-service-design.md` (on top of `docs/superpowers/specs/2026-10-09-region-editor-design.md`, sections 1, 2, 3, 5).

## Global Constraints

- **Needs #166 merged** (`pipeline/frame.py`, `pipeline/region.py` with `build_world`, `PIPELINE_VERSION`, `ODBL`, `prune_tiles`). #179 (race) is not needed; it only adds a `race` step, which the service relays like any other.
- **Venv:** `python3 -m venv service/.venv && service/.venv/bin/pip install -r service/requirements-dev.txt`. Tests: `cd service && .venv/bin/python -m pytest -q`. The pipeline suite stays green and untouched (`cd pipeline && ./.venv/bin/python -m pytest -q`).
- **No dry runs, no real builds, no downloads, no `docker build`:** every test mocks the build (fake subprocess commands, fake `region.build_world`) and HTTP (fake `get`). The real build runs only on ionos1 after deployment (operator checklist).
- New dependencies: exactly `starlette`, `uvicorn`, `altcha` (runtime; MIT, zero dependencies of its own) and `httpx` (dev). Nothing else; no change to `pipeline/requirements*.txt`, `pipeline/*.py`, `prototype/`, `data/`.
- Never write the admin token, the ALTCHA HMAC key, a hostname-specific secret, or a Cloudflare token into the repo. The token is only ever read from `ADMIN_TOKEN_FILE`, the key from `ALTCHA_SECRET_FILE`.
- Logging: every operation logs the attempt, then the outcome (cause on failure), through `logs.fields(...)` — JSON on stdout.
- Conventional Commits with explicit paths; push after each task. **CHANGELOG: no entry, `test-todo.md`: nothing** (nothing in the game changes until phase 2/4).

## Review Focus

- **Limits are atomic:** `store.submit` checks and inserts inside one `BEGIN IMMEDIATE` (`test_one_active_job_per_ip`, `test_queue_full_is_busy`, `test_daily_limits`).
- **Cache hits are free:** a built or already queued world never counts against a limit (`test_daily_limits`, `test_same_frame_is_one_job_snapped_and_from_lonlat`).
- **Admin is SSH-only:** the public app has no admin route and the compose router excludes `/api/admin` (`test_the_public_app_has_no_admin_routes`, `test_admin_stays_off_traefik`).
- **#167's contract:** `GET /api/worlds/<id>` answers `{id, status, bbox: {lv95}}` after expiry; fetching `world.json` is the play signal; CORS on `/worlds/*` and `/api/*` (`test_world_status_survives_expiry_for_the_rebuild`, `test_world_json_is_the_play_signal_at_most_hourly`).
- **Nothing half-built is ever served:** files appear by one rename on success (`test_success_relays_steps_and_publishes`, `test_timeout_kills_the_build`).
- **Gallery worlds survive** both the 30-day expiry and the 10 GB cap (`test_expiry_keeps_played_and_gallery`, `test_cap_evicts_least_recently_played_never_gallery`).
- **A failed extract update keeps the old file** (`test_bad_checksum_keeps_the_old_file`, `test_unreachable_keeps_the_old_file`).
- **The admin token fails closed** and is never logged (`test_admin_without_token_file_is_401`).
- **The human check guards new builds only:** `POST /api/jobs` for a NEW build needs a valid, unexpired, unused ALTCHA solution (`403 human_check_failed` otherwise); playing, polling, downloading, gallery reads, cache hits and joining a queued frame never do (`test_cache_hit_needs_no_solution`, `test_joining_a_queued_frame_needs_no_solution`); a solution is spent in the admission transaction, so a `429` leaves it unspent (`test_a_solution_works_once`, `test_refused_build_leaves_the_solution_unspent`); no key file fails closed (`test_challenge_without_a_key_is_503`).
- **The preview is cheap and bounded:** no build, no cut, 60 requests a minute per client, a failed name lookup is a `null` name and not an error (`test_preview_is_rate_limited_per_client`, `test_a_failed_name_lookup_gives_a_null_name`, `test_no_road_index_yet_is_unknown_not_an_error`).

---

### Task 1: Package, settings, JSON logs

**Files:**
- Create: `service/requirements.txt`, `service/requirements-dev.txt`, `service/pytest.ini`, `service/.gitignore`, `service/rhyflitzer_api/__init__.py` (empty), `service/rhyflitzer_api/config.py`, `service/rhyflitzer_api/logs.py`, `service/tests/conftest.py`, `service/tests/test_config_logs.py`

**Interfaces:**
- Produces: `config.Settings` (frozen dataclass; `from_env(env=None)`; properties `db_path`, `worlds_dir`, `extract_path`, `cache_dir`); `logs.JsonFormatter`, `logs.setup(stream=None)`, `logs.fields(**kw) -> dict`; conftest fixtures `settings`, `store`, `client`, helpers `RECT`, `T0`, `ip(n)`, `add_ready(...)`.

- [ ] **Step 1: Preconditions** — `git fetch origin && git checkout -b feature/168-build-service origin/main && test -f pipeline/frame.py && test -f pipeline/region.py && grep -q PIPELINE_VERSION pipeline/region.py`. Stop and report if any fails (#166 not merged).

- [ ] **Step 2: Files without logic**

`service/requirements.txt`:
```
starlette>=1.0,<2
uvicorn>=0.30
altcha>=2.3,<3
```
`service/requirements-dev.txt`:
```
-r ../pipeline/requirements.txt
-r requirements.txt
pytest>=8
httpx>=0.27
```
`service/pytest.ini`:
```
[pytest]
testpaths = tests
```
`service/.gitignore`:
```
.venv/
__pycache__/
```

- [ ] **Step 3: conftest** — `service/tests/conftest.py` (no `__init__.py` in `service/tests`, so tests can `from conftest import …`):

```python
"""#168: shared fixtures. The pipeline (frame, region) and the service package are imported from the checkout."""
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "pipeline"), str(ROOT / "service")]

import pytest  # noqa: E402

from rhyflitzer_api.config import Settings  # noqa: E402

RECT = (2667000.0, 1259750.0, 2669250.0, 1261750.0)   # 2.25 x 2 km at Ehrendingen, inside Switzerland
T0 = dt.datetime(2026, 10, 10, 12, tzinfo=dt.timezone.utc).timestamp()   # a Saturday, 12:00 UTC


def ip(n: int) -> dict:
    return {"X-Forwarded-For": f"203.0.113.{n}"}


def add_ready(store, settings, wid, *, size=1000, finished=T0, played=None, gallery=False, files=False):
    """A built world straight into the store (and, with files=True, onto disk)."""
    store._x("INSERT INTO worlds(id, lv95, state, step, created, finished, last_played, size, gallery) "
             "VALUES (?, ?, 'ready', 'done', ?, ?, ?, ?, ?)",
             (wid, json.dumps(list(RECT)), finished, finished, played, size, int(gallery)))
    if files:
        folder = settings.worlds_dir / wid
        folder.mkdir(parents=True)
        (folder / "world.json").write_text('{"roads": []}', encoding="utf-8")
        (folder / "terrain.mmh").write_bytes(b"MMH1" + bytes(16))
        (folder / "meta.json").write_text(json.dumps({"id": wid, "lastPlayed": None}), encoding="utf-8")
    return wid


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path)


@pytest.fixture
def store(settings):
    from rhyflitzer_api.store import Store
    return Store(settings.db_path)


@pytest.fixture
def client(settings, store):
    from starlette.testclient import TestClient
    from rhyflitzer_api.app import create_app
    return TestClient(create_app(settings, store))
```

- [ ] **Step 4: Write the failing tests** — `service/tests/test_config_logs.py`:

```python
import json
import logging
import sys

import pytest

from rhyflitzer_api import logs
from rhyflitzer_api.config import Settings


def test_from_env_defaults_are_the_limits_table(tmp_path):
    s = Settings.from_env({"DATA_DIR": str(tmp_path)})
    assert s.cors_origins == ("https://github.freaxnx01.ch",) and s.admin_token_file is None and s.proxy_hops == 1
    assert (s.max_queue, s.per_ip_active, s.per_ip_daily, s.global_daily) == (20, 1, 5, 100)
    assert (s.job_timeout, s.max_buildings, s.max_road_points) == (600.0, 20_000, 50_000)
    assert (s.retention_days, s.store_cap_bytes, s.source_retries) == (30, 10 * 1024**3, 2)
    assert s.db_path == tmp_path / "service.sqlite3" and s.worlds_dir == tmp_path / "worlds"
    assert s.extract_path == tmp_path / "extract" / "switzerland-latest.osm.pbf" and s.cache_dir == tmp_path / "cache"


def test_from_env_requires_data_dir():
    with pytest.raises(ValueError, match="DATA_DIR"):
        Settings.from_env({})


def test_from_env_reads_origins_token_file_and_hops(tmp_path):
    s = Settings.from_env({"DATA_DIR": str(tmp_path), "CORS_ORIGINS": "https://a.example, http://localhost:8000",
                           "ADMIN_TOKEN_FILE": "/run/secrets/t", "PROXY_HOPS": "2"})
    assert s.cors_origins == ("https://a.example", "http://localhost:8000")
    assert str(s.admin_token_file) == "/run/secrets/t" and s.proxy_hops == 2


def test_formatter_writes_one_json_object_with_fields():
    rec = logging.LogRecord("rhyflitzer.api", logging.INFO, __file__, 1, "Building world %s", ("abc",), None)
    rec.fields = {"world": "abc"}
    doc = json.loads(logs.JsonFormatter().format(rec))
    assert doc["msg"] == "Building world abc" and doc["level"] == "INFO" and doc["world"] == "abc"
    assert doc["logger"] == "rhyflitzer.api" and doc["ts"].endswith("+00:00")


def test_formatter_includes_the_exception():
    try:
        raise ValueError("boom")
    except ValueError:
        rec = logging.LogRecord("x", logging.ERROR, __file__, 1, "failed", (), sys.exc_info())
    assert "ValueError: boom" in json.loads(logs.JsonFormatter().format(rec))["exc"]


def test_fields_is_the_extra_dict():
    assert logs.fields(world="w", code="busy") == {"fields": {"world": "w", "code": "busy"}}
```

- [ ] **Step 5: Run** — `cd service && .venv/bin/python -m pytest -q tests/test_config_logs.py` — Expected: FAIL (`ModuleNotFoundError: rhyflitzer_api.config`).

- [ ] **Step 6: Implement** — `service/rhyflitzer_api/config.py`:

```python
"""#168: the service's settings. Deployment knobs come from the environment (12-factor); the limits are the
design's table (spec section 2) and change only with a code review."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ORIGIN = "https://github.freaxnx01.ch"


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    cors_origins: tuple[str, ...] = (DEFAULT_ORIGIN,)
    admin_token_file: Path | None = None
    proxy_hops: int = 1                       # X-Forwarded-For entries added by our own proxies (Traefik)
    max_queue: int = 20
    per_ip_active: int = 1
    per_ip_daily: int = 5
    global_daily: int = 100
    job_timeout: float = 600.0
    max_buildings: int = 20_000
    max_road_points: int = 50_000
    retention_days: int = 30
    store_cap_bytes: int = 10 * 1024**3
    tile_cache_bytes: int = 1_000_000_000     # per swisstopo collection
    played_interval: float = 3600.0
    source_retries: int = 2
    retry_delay: float = 30.0
    cleanup_hour_utc: int = 3
    extract_weekday: int = 0                  # Monday
    extract_hour_utc: int = 4
    extract_url: str = "https://download.geofabrik.de/europe/switzerland-latest.osm.pbf"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "service.sqlite3"

    @property
    def worlds_dir(self) -> Path:
        return self.data_dir / "worlds"

    @property
    def extract_path(self) -> Path:
        return self.data_dir / "extract" / "switzerland-latest.osm.pbf"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @classmethod
    def from_env(cls, env=None) -> "Settings":
        env = os.environ if env is None else env
        if not env.get("DATA_DIR"):
            raise ValueError("DATA_DIR must be set (the volume holding the database, worlds and extract)")
        origins = tuple(o.strip() for o in env.get("CORS_ORIGINS", DEFAULT_ORIGIN).split(",") if o.strip())
        token = env.get("ADMIN_TOKEN_FILE")
        return cls(data_dir=Path(env["DATA_DIR"]), cors_origins=origins,
                   admin_token_file=Path(token) if token else None, proxy_hops=int(env.get("PROXY_HOPS", "1")))
```

`service/rhyflitzer_api/logs.py`:

```python
"""#168: one JSON object per log line (12-factor logs). Messages follow the repo's rule: the attempt, then the
outcome with its cause; structured details go in `extra=fields(...)`."""
from __future__ import annotations

import datetime as dt
import json
import logging
import sys


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        doc = {"ts": dt.datetime.fromtimestamp(record.created, dt.timezone.utc).isoformat(timespec="milliseconds"),
               "level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        doc.update(getattr(record, "fields", {}))
        if record.exc_info:
            doc["exc"] = self.formatException(record.exc_info)
        return json.dumps(doc, ensure_ascii=False, default=str)


def setup(stream=None) -> None:
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)


def fields(**kw) -> dict:
    return {"fields": kw}
```

- [ ] **Step 7: Run** — Expected: 6 passed.
- [ ] **Step 8: Commit** — `git add service/requirements.txt service/requirements-dev.txt service/pytest.ini service/.gitignore service/rhyflitzer_api/__init__.py service/rhyflitzer_api/config.py service/rhyflitzer_api/logs.py service/tests/conftest.py service/tests/test_config_logs.py && git commit -m "feat(service): settings and JSON logs for the build service (#168)" && git push -u origin HEAD`

---

### Task 2: The store — queue, limits, salts, metadata

**Files:**
- Create: `service/rhyflitzer_api/store.py`, `service/tests/test_store.py`

**Interfaces:**
- Consumes: `Settings` (limits).
- Produces: `store.Store(path)` with `ip_hash(ip, now)`, `get(wid)`, `position(wid)`, `submit(wid, rect, ip_hash, now, settings)` (raises `Refused(status, code, message)`), `claim_next(now)`, `set_step`, `finish_ready(wid, now, size)`, `finish_failed(wid, now, error, message)`, `retry_later(wid, not_before, message)`, `requeue_interrupted() -> int`, `expired(cutoff)`, `eviction_order()`, `stored_bytes()`, `mark_expired(wid)`, `played_is_stale(wid, now, interval)`, `mark_played(wid, now)`, `set_gallery(wid, title, description)`, `unset_gallery(wid)`, `purge_before(day)`, `counts()`, `kv_get`, `kv_set`; `store.day_of(now)`; `store.PERMANENT`.

- [ ] **Step 1: Write the failing tests** — `service/tests/test_store.py`:

```python
import dataclasses

import pytest

from conftest import RECT, T0, add_ready
from rhyflitzer_api.store import Refused, day_of

DAY = 86400.0


def wid(n: int) -> str:
    return f"{n:012x}"


def builds(store) -> int:
    return store._q("SELECT COUNT(*) AS n FROM builds")[0]["n"]


def test_ip_hash_is_stable_within_a_day_and_changes_with_the_day(store):
    h = store.ip_hash("198.51.100.7", T0)
    assert h == store.ip_hash("198.51.100.7", T0 + 3600) and len(h) == 16 and "198" not in h
    assert h != store.ip_hash("198.51.100.7", T0 + DAY) and h != store.ip_hash("198.51.100.8", T0)


def test_submit_queues_and_the_same_world_is_one_job(store, settings):
    row = store.submit(wid(1), RECT, "a", T0, settings)
    assert row["state"] == "queued" and row["attempts"] == 0 and store.position(wid(1)) == 1
    again = store.submit(wid(1), RECT, "b", T0 + 5, settings)
    assert again["id"] == wid(1) and again["created"] == T0 and builds(store) == 1


def test_one_active_job_per_ip(store, settings):
    store.submit(wid(1), RECT, "a", T0, settings)
    with pytest.raises(Refused) as e:
        store.submit(wid(2), RECT, "a", T0, settings)
    assert (e.value.status, e.value.code) == (429, "one-at-a-time")


def test_queue_full_is_busy(store, settings):
    s = dataclasses.replace(settings, max_queue=2)
    store.submit(wid(1), RECT, "a", T0, s)
    store.submit(wid(2), RECT, "b", T0, s)
    with pytest.raises(Refused) as e:
        store.submit(wid(3), RECT, "c", T0, s)
    assert (e.value.status, e.value.code) == (503, "busy") and store.position(wid(2)) == 2


def test_daily_limits(store, settings):
    for n in range(5):
        store.submit(wid(n), RECT, "a", T0, settings)
        store.claim_next(T0)
        store.finish_ready(wid(n), T0, 10)
    with pytest.raises(Refused) as e:
        store.submit(wid(9), RECT, "a", T0, settings)
    assert e.value.code == "daily-limit"
    assert store.submit(wid(0), RECT, "a", T0, settings)["state"] == "ready"       # cache hit: free
    assert store.submit(wid(9), RECT, "a", T0 + DAY, settings)["state"] == "queued"  # a new day
    s = dataclasses.replace(settings, global_daily=5)                              # day T0 already has 5 builds
    with pytest.raises(Refused) as e:
        store.submit(wid(10), RECT, "z", T0 + 1, s)
    assert (e.value.status, e.value.code) == (429, "server-daily-limit")


def test_rebuilds_after_expiry_and_retryable_failure_but_not_permanent(store, settings):
    add_ready(store, settings, wid(1), played=T0)
    store.mark_expired(wid(1))
    row = store.submit(wid(1), RECT, "a", T0 + DAY, settings)
    assert row["state"] == "queued" and row["last_played"] is None
    store.claim_next(T0 + DAY)
    store.finish_failed(wid(1), T0 + DAY, "too-complex", "too complex")
    assert store.submit(wid(1), RECT, "b", T0 + DAY, settings)["error"] == "too-complex"
    store.submit(wid(2), RECT, "c", T0, settings)
    store.claim_next(T0)
    store.finish_failed(wid(2), T0, "timeout", "slow")
    assert store.submit(wid(2), RECT, "c", T0 + 1, settings)["state"] == "queued"


def test_claim_order_retry_and_recovery(store, settings):
    store.submit(wid(1), RECT, "a", T0, settings)
    store.submit(wid(2), RECT, "b", T0 + 1, settings)
    first = store.claim_next(T0 + 2)
    assert first["id"] == wid(1) and first["attempts"] == 1 and store.get(wid(1))["state"] == "building"
    store.set_step(wid(1), "terrain")
    assert store.get(wid(1))["step"] == "terrain"
    store.retry_later(wid(1), T0 + 100, "unreachable")
    assert store.claim_next(T0 + 3)["id"] == wid(2)
    assert store.claim_next(T0 + 4) is None                                  # wid(1) waits until T0 + 100
    assert store.requeue_interrupted() == 1 and store.get(wid(2))["state"] == "queued"
    assert store.claim_next(T0 + 100)["id"] == wid(1)


def test_retention_queries(store, settings):
    add_ready(store, settings, wid(1), size=100, finished=T0 - 40 * DAY)
    add_ready(store, settings, wid(2), size=200, finished=T0 - 40 * DAY, played=T0 - DAY)
    add_ready(store, settings, wid(3), size=300, finished=T0 - 40 * DAY, gallery=True)
    assert store.expired(T0 - 30 * DAY) == [wid(1)]
    assert [r["id"] for r in store.eviction_order()] == [wid(1), wid(2)] and store.stored_bytes() == 600
    store.mark_expired(wid(1))
    assert store.get(wid(1))["state"] == "expired" and store.stored_bytes() == 500


def test_played_and_gallery(store, settings):
    add_ready(store, settings, wid(1))
    assert store.played_is_stale(wid(1), T0, 3600)
    store.mark_played(wid(1), T0)
    assert not store.played_is_stale(wid(1), T0 + 3599, 3600) and store.played_is_stale(wid(1), T0 + 3600, 3600)
    store.set_gallery(wid(1), "Lägern", "Ridge road")
    assert (store.get(wid(1))["gallery"], store.get(wid(1))["title"]) == (1, "Lägern")
    store.unset_gallery(wid(1))
    assert store.get(wid(1))["gallery"] == 0


def test_purge_counts_and_kv(store, settings):
    store.ip_hash("x", T0 - DAY)
    store.submit(wid(1), RECT, "a", T0 - DAY, settings)
    store.purge_before(day_of(T0))
    assert builds(store) == 0 and store._q("SELECT COUNT(*) AS n FROM salts")[0]["n"] == 0
    assert store.counts() == {"queued": 1}
    assert store.kv_get("k") is None
    store.kv_set("k", "v")
    store.kv_set("k", "w")
    assert store.kv_get("k") == "w"
```

- [ ] **Step 2: Run** — `.venv/bin/python -m pytest -q tests/test_store.py` — Expected: FAIL (`ModuleNotFoundError: rhyflitzer_api.store`).

- [ ] **Step 3: Implement** — `service/rhyflitzer_api/store.py`:

```python
"""#168: SQLite holds the queue, the rate limits and the world metadata. One row per world is also its job: the
job id is the world id, so the same frame never builds twice and a rebuild keeps its share link."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import secrets
import sqlite3
import threading
from pathlib import Path

PERMANENT = ("too-complex",)   # failures a rebuild of the same frame cannot fix

SCHEMA = """
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY, lv95 TEXT NOT NULL, state TEXT NOT NULL, step TEXT, error TEXT, message TEXT,
  ip_hash TEXT, attempts INTEGER NOT NULL DEFAULT 0, not_before REAL NOT NULL DEFAULT 0, created REAL NOT NULL,
  started REAL, finished REAL, last_played REAL, size INTEGER NOT NULL DEFAULT 0,
  gallery INTEGER NOT NULL DEFAULT 0, title TEXT, description TEXT);
CREATE INDEX IF NOT EXISTS worlds_queue ON worlds(state, not_before, created);
CREATE TABLE IF NOT EXISTS builds (day TEXT NOT NULL, ip_hash TEXT NOT NULL, world TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""
REQUEUE = ("INSERT INTO worlds(id, lv95, state, ip_hash, created) VALUES (?, ?, 'queued', ?, ?) "
           "ON CONFLICT(id) DO UPDATE SET state = 'queued', step = NULL, error = NULL, message = NULL, "
           "ip_hash = excluded.ip_hash, attempts = 0, not_before = 0, created = excluded.created, started = NULL, "
           "finished = NULL, last_played = NULL, size = 0")
PLAYED_AT = "COALESCE(last_played, finished)"


class Refused(Exception):
    """A build the limits do not allow; `status` is the HTTP status, `code` the player-facing reason."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code = status, code


def day_of(now: float) -> str:
    return dt.datetime.fromtimestamp(now, dt.timezone.utc).strftime("%Y-%m-%d")


def _count(db, sql: str, args=()) -> int:
    return db.execute(sql, args).fetchone()[0]


def _check_limits(db, ip_hash: str, day: str, s) -> None:
    if _count(db, "SELECT COUNT(*) FROM worlds WHERE state = 'queued'") >= s.max_queue:
        raise Refused(503, "busy", "Server busy, try again later")
    if _count(db, "SELECT COUNT(*) FROM worlds WHERE state IN ('queued', 'building') AND ip_hash = ?",
              (ip_hash,)) >= s.per_ip_active:
        raise Refused(429, "one-at-a-time", "One of your worlds is still building; wait until it is done")
    if _count(db, "SELECT COUNT(*) FROM builds WHERE day = ? AND ip_hash = ?", (day, ip_hash)) >= s.per_ip_daily:
        raise Refused(429, "daily-limit", f"At most {s.per_ip_daily} new worlds per day; try again tomorrow")
    if _count(db, "SELECT COUNT(*) FROM builds WHERE day = ?", (day,)) >= s.global_daily:
        raise Refused(429, "server-daily-limit", "The server has built enough worlds today; try again tomorrow")


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), timeout=10, isolation_level=None, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(SCHEMA)

    # -- plumbing -------------------------------------------------------------------------------------------
    def _q(self, sql: str, args=()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._db.execute(sql, args).fetchall()]

    def _x(self, sql: str, args=()) -> None:
        with self._lock:
            self._db.execute(sql, args)

    def _tx(self, fn):
        """fn(db) inside BEGIN IMMEDIATE: one writer across the API and the worker process."""
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                out = fn(self._db)
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
            self._db.execute("COMMIT")
            return out

    # -- admission ------------------------------------------------------------------------------------------
    def ip_hash(self, ip: str, now: float) -> str:
        """The IP hashed with today's random salt (created on first use); unlinkable once the salt is purged."""
        day = day_of(now)

        def salt(db):
            db.execute("INSERT OR IGNORE INTO salts(day, salt) VALUES (?, ?)", (day, secrets.token_hex(32)))
            return db.execute("SELECT salt FROM salts WHERE day = ?", (day,)).fetchone()["salt"]

        return hashlib.sha256(f"{self._tx(salt)}:{ip}".encode()).hexdigest()[:16]

    def get(self, wid: str) -> dict | None:
        rows = self._q("SELECT * FROM worlds WHERE id = ?", (wid,))
        return rows[0] if rows else None

    def position(self, wid: str) -> int:
        return self._q("SELECT COUNT(*) AS n FROM worlds WHERE state = 'queued' AND "
                       "created <= (SELECT created FROM worlds WHERE id = ?)", (wid,))[0]["n"]

    def submit(self, wid: str, rect, ip_hash: str, now: float, settings) -> dict:
        """The world's row: as it is when built, queued, building or permanently failed (free); otherwise queued
        as a new build after the limits allow it. Raises Refused."""
        def admit(db):
            row = db.execute("SELECT * FROM worlds WHERE id = ?", (wid,)).fetchone()
            if row and (row["state"] in ("queued", "building", "ready") or row["error"] in PERMANENT):
                return dict(row)
            _check_limits(db, ip_hash, day_of(now), settings)
            db.execute(REQUEUE, (wid, json.dumps(list(rect)), ip_hash, now))
            db.execute("INSERT INTO builds(day, ip_hash, world) VALUES (?, ?, ?)", (day_of(now), ip_hash, wid))
            return dict(db.execute("SELECT * FROM worlds WHERE id = ?", (wid,)).fetchone())

        return self._tx(admit)

    # -- worker ---------------------------------------------------------------------------------------------
    def claim_next(self, now: float) -> dict | None:
        """Pops the oldest due job and marks it building (a queue pop: command and query by nature)."""
        def claim(db):
            row = db.execute("SELECT * FROM worlds WHERE state = 'queued' AND not_before <= ? "
                             "ORDER BY created, id LIMIT 1", (now,)).fetchone()
            if row is None:
                return None
            db.execute("UPDATE worlds SET state = 'building', step = NULL, started = ?, attempts = attempts + 1 "
                       "WHERE id = ?", (now, row["id"]))
            return {**dict(row), "state": "building", "attempts": row["attempts"] + 1}

        return self._tx(claim)

    def set_step(self, wid: str, step: str) -> None:
        self._x("UPDATE worlds SET step = ? WHERE id = ?", (step, wid))

    def finish_ready(self, wid: str, now: float, size: int) -> None:
        self._x("UPDATE worlds SET state = 'ready', step = 'done', error = NULL, message = NULL, finished = ?, "
                "size = ? WHERE id = ?", (now, size, wid))

    def finish_failed(self, wid: str, now: float, error: str, message: str) -> None:
        self._x("UPDATE worlds SET state = 'failed', error = ?, message = ?, finished = ? WHERE id = ?",
                (error, message, now, wid))

    def retry_later(self, wid: str, not_before: float, message: str) -> None:
        self._x("UPDATE worlds SET state = 'queued', step = NULL, not_before = ?, message = ? WHERE id = ?",
                (not_before, message, wid))

    def requeue_interrupted(self) -> int:
        with self._lock:
            return self._db.execute("UPDATE worlds SET state = 'queued', step = NULL WHERE state = 'building'").rowcount

    # -- retention ------------------------------------------------------------------------------------------
    def expired(self, cutoff: float) -> list[str]:
        return [r["id"] for r in self._q(f"SELECT id FROM worlds WHERE state = 'ready' AND gallery = 0 AND "
                                         f"{PLAYED_AT} < ? ORDER BY id", (cutoff,))]

    def eviction_order(self) -> list[dict]:
        return self._q(f"SELECT id, size FROM worlds WHERE state = 'ready' AND gallery = 0 ORDER BY {PLAYED_AT}, id")

    def stored_bytes(self) -> int:
        return self._q("SELECT COALESCE(SUM(size), 0) AS n FROM worlds WHERE state = 'ready'")[0]["n"]

    def mark_expired(self, wid: str) -> None:
        self._x("UPDATE worlds SET state = 'expired', step = NULL, size = 0 WHERE id = ?", (wid,))

    def played_is_stale(self, wid: str, now: float, interval: float) -> bool:
        row = self.get(wid)
        return row is not None and (row["last_played"] is None or now - row["last_played"] >= interval)

    def mark_played(self, wid: str, now: float) -> None:
        self._x("UPDATE worlds SET last_played = ? WHERE id = ?", (now, wid))

    def purge_before(self, day: str) -> None:
        self._x("DELETE FROM salts WHERE day < ?", (day,))
        self._x("DELETE FROM builds WHERE day < ?", (day,))

    # -- gallery, health, kv --------------------------------------------------------------------------------
    def set_gallery(self, wid: str, title: str, description: str) -> None:
        self._x("UPDATE worlds SET gallery = 1, title = ?, description = ? WHERE id = ?", (title, description, wid))

    def unset_gallery(self, wid: str) -> None:
        self._x("UPDATE worlds SET gallery = 0 WHERE id = ?", (wid,))

    def counts(self) -> dict:
        return {r["state"]: r["n"] for r in self._q("SELECT state, COUNT(*) AS n FROM worlds GROUP BY state")}

    def kv_get(self, key: str) -> str | None:
        rows = self._q("SELECT value FROM kv WHERE key = ?", (key,))
        return rows[0]["value"] if rows else None

    def kv_set(self, key: str, value: str) -> None:
        self._x("INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value))
```

- [ ] **Step 4: Run** — Expected: 10 passed.
- [ ] **Step 5: Commit** — `git add service/rhyflitzer_api/store.py service/tests/test_store.py && git commit -m "feat(service): SQLite queue, limits and world metadata (#168)" && git push`

---

### Task 3: The jobs API and health

**Files:**
- Create: `service/rhyflitzer_api/app.py`, `service/tests/test_app_jobs.py`

**Interfaces:**
- Consumes: `frame.snap/check/from_lonlat/world_id/FrameError`, `region.PIPELINE_VERSION`, `Store`, `Settings`.
- Produces: `app.create_app(settings=None, store=None) -> Starlette` (uvicorn `--factory`); `app.client_ip(request, hops)`; `app.job_view(store, row)`; routes `POST /api/jobs`, `GET /api/jobs/{wid}`, `GET /api/worlds/{wid}` (the status #167 reads: `{id, status, bbox: {lv95: [e0, n0, e1, n1]}}`, `status` = the job's `state`, still answering after expiry; progress is `GET /api/jobs/{wid}`), `GET /api/health`. Task 7 adds the world-file and admin routes to `ROUTES`; Task 8 adds `GET /api/challenge`, `GET /api/preview` and the human check on `POST /api/jobs` (a new build then needs an `altcha` solution in the body).

- [ ] **Step 1: Write the failing tests** — `service/tests/test_app_jobs.py`:

```python
import pytest
from starlette.requests import Request

import frame
import region
from conftest import RECT, ip
from rhyflitzer_api.app import client_ip

WID = frame.world_id(RECT, region.PIPELINE_VERSION)


def test_post_queues_a_new_world_and_get_reports_it(client):
    r = client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))
    assert r.status_code == 202
    job = r.json()
    assert (job["id"], job["state"], job["position"], job["lv95"]) == (WID, "queued", 1, list(RECT))
    assert client.get(f"/api/jobs/{WID}").json() == job


def test_same_frame_is_one_job_snapped_and_from_lonlat(client):
    a = client.post("/api/jobs", json={"lv95": [2667010, 1259740, 2669240, 1261760]}, headers=ip(1)).json()
    b = client.post("/api/jobs", json={"lonlat": list(frame.lonlat_bbox(RECT))}, headers=ip(2)).json()
    assert a["id"] == b["id"] == WID


def test_a_built_world_is_200_with_its_files(client, store, settings):
    from conftest import add_ready
    add_ready(store, settings, WID)
    r = client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))
    assert r.status_code == 200 and r.json()["state"] == "ready" and r.json()["files"] == f"/worlds/{WID}/"


@pytest.mark.parametrize("body, code", [
    ({"lv95": [2693000, 1283000, 2695000, 1285000]}, "outside-ch"),      # Büsingen
    ({"lv95": [2667000, 1259750, 2667500, 1261750]}, "too-small"),
    ({"lv95": [2660000, 1250000, 2670000, 1260000]}, "too-big"),
    ({"lv95": [1, 2, 3]}, "bad-bbox"),
    ({"lv95": ["x", 1, 2, 3]}, "bad-bbox"),
    ({"bbox": [1, 2, 3, 4]}, "bad-bbox"),
    ([1, 2, 3, 4], "bad-bbox"),
])
def test_refused_frames_say_why(client, body, code):
    r = client.post("/api/jobs", json=body, headers=ip(1))
    assert r.status_code == 400 and r.json()["error"] == code and r.json()["message"]


def test_body_that_is_not_json(client):
    r = client.post("/api/jobs", content=b"{", headers={"Content-Type": "application/json", **ip(1)})
    assert r.status_code == 400 and r.json()["error"] == "bad-request"


def test_limits_reach_the_client(client):
    client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))
    r = client.post("/api/jobs", json={"lv95": [2667000, 1259750, 2669000, 1261750]}, headers=ip(1))
    assert r.status_code == 429 and r.json()["error"] == "one-at-a-time"


def test_world_status_survives_expiry_for_the_rebuild(client, store, settings):
    from conftest import add_ready
    add_ready(store, settings, WID)
    assert client.get(f"/api/worlds/{WID}").json() == {"id": WID, "status": "ready", "bbox": {"lv95": list(RECT)}}
    store.mark_expired(WID)
    r = client.get(f"/api/worlds/{WID}", headers={"Origin": "https://github.freaxnx01.ch"})
    assert r.status_code == 200 and r.json() == {"id": WID, "status": "expired", "bbox": {"lv95": list(RECT)}}
    assert r.headers["access-control-allow-origin"] == "https://github.freaxnx01.ch"


@pytest.mark.parametrize("path", ["/api/jobs/0123456789ab", "/api/jobs/NOT-AN-ID", "/api/worlds/0123456789ab",
                                  "/api/worlds/0123456789AB"])
def test_unknown_jobs(client, path):
    r = client.get(path)
    assert r.status_code == 404 and r.json()["error"] == "unknown"


def test_health(client, store):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "queued": 0, "building": 0, "worlds": 0, "storedBytes": 0,
                        "extract": False, "workerSeenSecondsAgo": None}


def test_cors_only_for_the_game_origin(client):
    good = client.get("/api/health", headers={"Origin": "https://github.freaxnx01.ch"})
    bad = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert good.headers["access-control-allow-origin"] == "https://github.freaxnx01.ch"
    assert "access-control-allow-origin" not in bad.headers


def request(xff=None):
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "headers": headers, "client": ("10.0.0.2", 1234)})


def test_client_ip_is_the_hop_traefik_added():
    assert client_ip(request("6.6.6.6, 203.0.113.9"), 1) == "203.0.113.9"   # a spoofed first entry is ignored
    assert client_ip(request(), 1) == "10.0.0.2"
    assert client_ip(request("203.0.113.9"), 0) == "10.0.0.2"
```

- [ ] **Step 2: Run** — Expected: FAIL (`ModuleNotFoundError: rhyflitzer_api.app`).

- [ ] **Step 3: Implement** — `service/rhyflitzer_api/app.py`:

```python
"""#168: the HTTP API (Starlette): admission of builds, job status and health. Task 7 adds the world files and
the admin gallery. Run: uvicorn rhyflitzer_api.app:create_app --factory."""
from __future__ import annotations

import json
import logging
import math
import re
import sqlite3
import time

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

import frame
import region

from . import logs
from .config import Settings
from .store import Refused, Store

log = logging.getLogger("rhyflitzer.api")
WORLD_ID = re.compile(r"^[0-9a-f]{12}$")
BBOX_HELP = "give lv95: [e0, n0, e1, n1] or lonlat: [w, s, e, n]"


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": code, "message": message}, status_code=status)


def client_ip(request: Request, hops: int) -> str:
    """The address Traefik saw: the hops-th entry from the right of X-Forwarded-For (it appends, never trusts)."""
    forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if hops > 0 and len(forwarded) >= hops:
        return forwarded[-hops]
    return request.client.host if request.client else "unknown"


def parse_rect(body) -> tuple[float, float, float, float]:
    """The unsnapped LV95 rectangle from {"lv95": [...]} or {"lonlat": [...]}; ValueError/TypeError otherwise."""
    if not isinstance(body, dict) or not ({"lv95", "lonlat"} & body.keys()):
        raise ValueError(BBOX_HELP)
    key = "lv95" if "lv95" in body else "lonlat"
    values = [float(v) for v in body[key]]
    if len(values) != 4 or not all(math.isfinite(v) for v in values):
        raise ValueError(BBOX_HELP)
    return tuple(values) if key == "lv95" else frame.from_lonlat(*values)


def job_view(store: Store, row: dict) -> dict:
    view = {"id": row["id"], "state": row["state"], "step": row["step"], "error": row["error"],
            "message": row["message"], "lv95": json.loads(row["lv95"])}
    if row["state"] == "queued":
        view["position"] = store.position(row["id"])
    if row["state"] == "ready":
        view["files"] = f"/worlds/{row['id']}/"
    return view


async def create_job(request: Request) -> JSONResponse:
    settings, store = request.app.state.settings, request.app.state.store
    try:
        body = await request.json()
    except ValueError:
        return error(400, "bad-request", "the body must be JSON")
    try:
        rect = frame.snap(*parse_rect(body))
        frame.check(rect)
    except frame.FrameError as exc:
        return error(400, exc.code, str(exc))
    except (TypeError, ValueError):
        return error(400, "bad-bbox", BBOX_HELP)
    wid, now = frame.world_id(rect, region.PIPELINE_VERSION), time.time()
    log.info("Admitting a build of world %s", wid, extra=logs.fields(world=wid, lv95=list(rect)))
    try:
        row = store.submit(wid, rect, store.ip_hash(client_ip(request, settings.proxy_hops), now), now, settings)
    except Refused as exc:
        log.info("Refused a build of world %s: %s", wid, exc.code, extra=logs.fields(world=wid, code=exc.code))
        return error(exc.status, exc.code, str(exc))
    log.info("World %s is %s", wid, row["state"], extra=logs.fields(world=wid, state=row["state"]))
    return JSONResponse(job_view(store, row), status_code=200 if row["state"] == "ready" else 202)


async def get_job(request: Request) -> JSONResponse:
    store, wid = request.app.state.store, request.path_params["wid"]
    row = store.get(wid) if WORLD_ID.match(wid) else None
    if row is None:
        return error(404, "unknown", "no such world")
    return JSONResponse(job_view(store, row))


async def world_status(request: Request) -> JSONResponse:
    """#167's contract: {id, status, bbox: {lv95}}; kept after expiry (a tombstone), because the id is a hash and
    the game's "Build it again?" needs the frame back."""
    store, wid = request.app.state.store, request.path_params["wid"]
    row = store.get(wid) if WORLD_ID.match(wid) else None
    if row is None:
        return error(404, "unknown", "no such world")
    return JSONResponse({"id": wid, "status": row["state"], "bbox": {"lv95": json.loads(row["lv95"])}})


async def health(request: Request) -> JSONResponse:
    settings, store = request.app.state.settings, request.app.state.store
    try:
        counts, stored, beat = store.counts(), store.stored_bytes(), store.kv_get("worker_heartbeat")
    except sqlite3.Error:
        log.exception("Health check failed: the database is not readable")
        return JSONResponse({"status": "error"}, status_code=503)
    return JSONResponse({"status": "ok", "queued": counts.get("queued", 0), "building": counts.get("building", 0),
                         "worlds": counts.get("ready", 0), "storedBytes": stored,
                         "extract": settings.extract_path.exists(),
                         "workerSeenSecondsAgo": round(time.time() - float(beat)) if beat else None})


ROUTES = [
    Route("/api/jobs", create_job, methods=["POST"]),
    Route("/api/jobs/{wid}", get_job, methods=["GET"]),
    Route("/api/worlds/{wid}", world_status, methods=["GET"]),
    Route("/api/health", health, methods=["GET"]),
]


def create_app(settings: Settings | None = None, store: Store | None = None) -> Starlette:
    if settings is None:
        logs.setup()
        settings = Settings.from_env()
    store = store or Store(settings.db_path)
    cors = Middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"],
                      allow_headers=["Content-Type"])
    app = Starlette(routes=ROUTES, middleware=[cors])
    app.state.settings, app.state.store = settings, store
    log.info("API ready", extra=logs.fields(data=str(settings.data_dir), origins=list(settings.cors_origins)))
    return app
```

- [ ] **Step 4: Run** — Expected: 20 passed (this file); whole suite green.
- [ ] **Step 5: Commit** — `git add service/rhyflitzer_api/app.py service/tests/test_app_jobs.py && git commit -m "feat(service): jobs API with limits, dedupe and health (#168)" && git push`

---

### Task 4: One build in a subprocess

**Files:**
- Create: `service/rhyflitzer_api/build.py`, `service/rhyflitzer_api/runner.py`, `service/tests/test_build_runner.py`

**Interfaces:**
- Consumes: `region.build_world(rect, out_dir, *, extract, cache, progress, tile_cache_bytes)`, `frame.FrameError`.
- Produces: `python -m rhyflitzer_api.build --id --lv95 E0 N0 E1 N1 --out --extract --cache --tile-cache-bytes --max-buildings --max-road-points` printing `STEP <name>` lines and one `RESULT {json}` on stdout (logs on stderr); `build.check_complexity(world, max_buildings, max_road_points)`, `build.classify(exc) -> (code, message)`; `runner.Outcome(ok, error=None, message=None, size=0)`, `runner.run_build(job, settings, on_step, command=build_command) -> Outcome`, `runner.build_command`, `runner.temp_dir`, `runner.folder_size`.

- [ ] **Step 1: Write the failing tests** — `service/tests/test_build_runner.py`:

```python
import dataclasses
import json
import sys
import time
from pathlib import Path

import pytest
import requests

import frame
import region
from conftest import RECT
from rhyflitzer_api import build, runner

JOB = {"id": "0123456789ab", "lv95": json.dumps(list(RECT))}
FAKE = r'''
import json, os, pathlib, signal, sys, time
out, mode = pathlib.Path(sys.argv[1]), sys.argv[2]
print("STEP cutting", flush=True)
if mode == "ok":
    out.mkdir(parents=True, exist_ok=True)
    for n in ("world.json", "terrain.mmh", "meta.json"):
        (out / n).write_text("x" * 10)
    print("STEP done")
    print("RESULT " + json.dumps({"ok": True}))
elif mode == "complex":
    out.mkdir(parents=True, exist_ok=True)
    (out / "world.json").write_text("{}")
    print("RESULT " + json.dumps({"ok": False, "error": "too-complex", "message": "This area is too complex"}))
    sys.exit(1)
elif mode == "slow":
    out.mkdir(parents=True, exist_ok=True)
    time.sleep(30)
elif mode == "killed":
    os.kill(os.getpid(), signal.SIGKILL)
'''


def fake(mode):
    return lambda job, settings, out: [sys.executable, "-c", FAKE, str(out), mode]


def test_success_relays_steps_and_publishes(settings):
    steps = []
    assert runner.run_build(JOB, settings, steps.append, fake("ok")) == runner.Outcome(True, size=30)
    assert steps == ["cutting", "done"]
    assert sorted(p.name for p in (settings.worlds_dir / JOB["id"]).iterdir()) == ["meta.json", "terrain.mmh", "world.json"]
    assert not runner.temp_dir(settings, JOB["id"]).exists()


def test_reported_failure_keeps_nothing(settings):
    out = runner.run_build(JOB, settings, lambda s: None, fake("complex"))
    assert (out.ok, out.error, out.message) == (False, "too-complex", "This area is too complex")
    assert not (settings.worlds_dir / JOB["id"]).exists() and not runner.temp_dir(settings, JOB["id"]).exists()


def test_timeout_kills_the_build(settings):
    start = time.monotonic()
    out = runner.run_build(JOB, dataclasses.replace(settings, job_timeout=1.0), lambda s: None, fake("slow"))
    assert (out.ok, out.error) == (False, "timeout") and time.monotonic() - start < 10
    assert not runner.temp_dir(settings, JOB["id"]).exists()


def test_a_killed_build_is_a_failure(settings):
    out = runner.run_build(JOB, settings, lambda s: None, fake("killed"))
    assert (out.ok, out.error) == (False, "build-failed")


def test_command_carries_the_frame_paths_and_limits(settings):
    cmd = runner.build_command(JOB, settings, Path("/tmp/x"))
    assert cmd[1:3] == ["-m", "rhyflitzer_api.build"]
    i = cmd.index("--lv95")
    assert cmd[i + 1:i + 5] == [str(v) for v in RECT]
    for flag, value in (("--out", "/tmp/x"), ("--extract", str(settings.extract_path)),
                        ("--cache", str(settings.cache_dir)), ("--max-buildings", "20000"),
                        ("--max-road-points", "50000"), ("--id", JOB["id"])):
        assert cmd[cmd.index(flag) + 1] == value


def args(tmp_path, *extra):
    return ["--id", "0123456789ab", "--lv95", *[str(v) for v in RECT], "--out", str(tmp_path / "out"),
            "--extract", str(tmp_path / "ch.osm.pbf"), "--cache", str(tmp_path / "cache"), *extra]


def fake_world(buildings, points):
    def fake(rect, out_dir, **kw):
        assert rect == RECT and kw["extract"].name == "ch.osm.pbf"
        kw["progress"]("terrain")
        p = Path(out_dir)
        p.mkdir(parents=True, exist_ok=True)
        (p / "world.json").write_text(json.dumps({"buildings": [{}] * buildings, "roads": [{"pts": [[0, 0]] * points}]}))
        return {"world": p / "world.json"}
    return fake


def test_build_main_reports_steps_then_ok(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(region, "build_world", fake_world(3, 4))
    assert build.main(args(tmp_path)) == 0
    assert capsys.readouterr().out.splitlines() == ["STEP terrain", 'RESULT {"ok": true}']


def test_build_main_refuses_a_too_complex_world(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(region, "build_world", fake_world(3, 4))
    assert build.main(args(tmp_path, "--max-buildings", "2")) == 1
    result = json.loads(capsys.readouterr().out.splitlines()[-1].removeprefix("RESULT "))
    assert result["ok"] is False and result["error"] == "too-complex" and "3 buildings" in result["message"]


@pytest.mark.parametrize("exc, code", [
    (frame.FrameError("outside-ch", "outside"), "outside-ch"),
    (requests.ConnectionError("down"), "source-unreachable"),
    (RuntimeError("boom"), "build-failed"),
])
def test_build_main_turns_errors_into_a_result(monkeypatch, tmp_path, capsys, exc, code):
    def fail(rect, out_dir, **kw):
        raise exc
    monkeypatch.setattr(region, "build_world", fail)
    assert build.main(args(tmp_path)) == 1
    assert json.loads(capsys.readouterr().out.splitlines()[-1].removeprefix("RESULT "))["error"] == code


def test_check_complexity_counts_road_points():
    build.check_complexity({"buildings": [], "roads": [{"pts": [[0, 0]] * 3}]}, 10, 3)
    with pytest.raises(build.TooComplex, match="4 road points"):
        build.check_complexity({"buildings": [], "roads": [{"pts": [[0, 0]] * 4}]}, 10, 3)
```

- [ ] **Step 2: Run** — Expected: FAIL (`ImportError: cannot import name 'build'`).

- [ ] **Step 3: Implement** — `service/rhyflitzer_api/build.py`:

```python
"""#168: one build in its own process (python -m rhyflitzer_api.build ...), so the worker can time it out and the
memory cap kills only the build. Protocol on stdout: `STEP <name>` lines, then exactly one `RESULT {json}`;
logs go to stderr."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import requests

import frame
import region

from . import logs

log = logging.getLogger("rhyflitzer.build")


class TooComplex(Exception):
    pass


def emit(kind: str, payload: str) -> None:
    print(f"{kind} {payload}", flush=True)


def check_complexity(world: dict, max_buildings: int, max_road_points: int) -> None:
    buildings = len(world.get("buildings", []))
    points = sum(len(r.get("pts", [])) for r in world.get("roads", []))
    if buildings > max_buildings:
        raise TooComplex(f"{buildings} buildings (at most {max_buildings}); choose a smaller frame")
    if points > max_road_points:
        raise TooComplex(f"{points} road points (at most {max_road_points}); choose a smaller frame")


def classify(exc: Exception) -> tuple[str, str]:
    """(code, player-facing message) for a failed build."""
    if isinstance(exc, frame.FrameError):
        return exc.code, str(exc)
    if isinstance(exc, TooComplex):
        return "too-complex", f"This area is too complex: {exc}"
    if isinstance(exc, requests.RequestException):
        return "source-unreachable", "Data source unreachable, try again later"
    return "build-failed", "Build failed"


def parse(argv) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Build one generated world (worker subprocess, #168)")
    ap.add_argument("--id", required=True)
    ap.add_argument("--lv95", type=float, nargs=4, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--extract", type=Path, required=True)
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--tile-cache-bytes", type=float, default=1e9)
    ap.add_argument("--max-buildings", type=int, default=20_000)
    ap.add_argument("--max-road-points", type=int, default=50_000)
    return ap.parse_args(argv)


def build(a: argparse.Namespace) -> None:
    files = region.build_world(tuple(a.lv95), a.out, extract=a.extract, cache=a.cache,
                               progress=lambda step: emit("STEP", step), tile_cache_bytes=a.tile_cache_bytes)
    check_complexity(json.loads(files["world"].read_text("utf-8")), a.max_buildings, a.max_road_points)


def main(argv=None) -> int:
    logs.setup(stream=sys.stderr)
    a = parse(argv)
    log.info("Building world %s", a.id, extra=logs.fields(world=a.id, lv95=a.lv95))
    try:
        build(a)
    except Exception as exc:   # every failure must reach the worker as a RESULT line, with its cause logged
        code, message = classify(exc)
        log.warning("Building world %s failed: %s", a.id, code, exc_info=exc, extra=logs.fields(world=a.id, code=code))
        emit("RESULT", json.dumps({"ok": False, "error": code, "message": message}))
        return 1
    log.info("Built world %s", a.id, extra=logs.fields(world=a.id))
    emit("RESULT", json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`service/rhyflitzer_api/runner.py`:

```python
"""#168: the worker's side of a build: start `python -m rhyflitzer_api.build` into a fresh temp dir, relay its
steps, kill it after the timeout, and publish (temp dir -> worlds/<id>, one rename) only on success."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Outcome:
    ok: bool
    error: str | None = None
    message: str | None = None
    size: int = 0


def temp_dir(settings, wid: str) -> Path:
    return settings.worlds_dir / f".{wid}.tmp"


def folder_size(folder) -> int:
    return sum(p.stat().st_size for p in Path(folder).rglob("*") if p.is_file())


def build_command(job: dict, settings, out: Path) -> list[str]:
    return [sys.executable, "-m", "rhyflitzer_api.build", "--id", job["id"],
            "--lv95", *[str(float(v)) for v in json.loads(job["lv95"])], "--out", str(out),
            "--extract", str(settings.extract_path), "--cache", str(settings.cache_dir),
            "--tile-cache-bytes", str(settings.tile_cache_bytes), "--max-buildings", str(settings.max_buildings),
            "--max-road-points", str(settings.max_road_points)]


def run_build(job: dict, settings, on_step, command=build_command) -> Outcome:
    out = temp_dir(settings, job["id"])
    shutil.rmtree(out, ignore_errors=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(command(job, settings, out), stdout=subprocess.PIPE, text=True)
    result: dict = {}
    reader = threading.Thread(target=_relay, args=(proc.stdout, on_step, result), daemon=True)
    reader.start()
    try:
        proc.wait(timeout=settings.job_timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        reader.join(5)
        shutil.rmtree(out, ignore_errors=True)
        return Outcome(False, "timeout", f"The build took longer than {settings.job_timeout / 60:.0f} minutes")
    reader.join(5)
    return _settle(job["id"], settings, out, proc.returncode, result)


def _relay(stream, on_step, result: dict) -> None:
    for line in stream:
        kind, _, payload = line.rstrip("\n").partition(" ")
        if kind == "STEP":
            on_step(payload)
        elif kind == "RESULT":
            result.update(json.loads(payload))


def _settle(wid: str, settings, out: Path, returncode: int, result: dict) -> Outcome:
    if returncode == 0 and result.get("ok"):
        return _publish(out, settings.worlds_dir / wid)
    shutil.rmtree(out, ignore_errors=True)
    if returncode < 0:
        return Outcome(False, "build-failed", f"Build failed (killed by signal {-returncode}, e.g. the memory cap)")
    return Outcome(False, result.get("error", "build-failed"), result.get("message", "Build failed"))


def _publish(out: Path, dest: Path) -> Outcome:
    shutil.rmtree(dest, ignore_errors=True)
    os.replace(out, dest)
    return Outcome(True, size=folder_size(dest))
```

Note: `build_command` writes `str(float(v))` so `2667000.0` matches the test's `str(v)` for the float `RECT`.

- [ ] **Step 4: Run** — Expected: 11 passed; whole suite green.
- [ ] **Step 5: Commit** — `git add service/rhyflitzer_api/build.py service/rhyflitzer_api/runner.py service/tests/test_build_runner.py && git commit -m "feat(service): builds in a subprocess with timeout, steps and atomic publish (#168)" && git push`

---

### Task 5: Housekeeping and the weekly extract

**Files:**
- Create: `service/rhyflitzer_api/housekeeping.py`, `service/rhyflitzer_api/extract.py`, `service/tests/test_housekeeping_extract.py`

**Interfaces:**
- Consumes: `Store` retention/kv methods, `region.prune_tiles(folder, max_bytes)`, `requests`.
- Produces: `housekeeping.expire_unplayed(store, settings, now)`, `enforce_cap(store, settings)`, `sweep_temp(worlds_dir)`, `prune_tile_caches(settings)`, `nightly(store, settings, now)`, `run_due(store, settings, now)`; `extract.download(settings, get)`, `extract.update(settings, get, sleep) -> bool`, `extract.run_due(store, settings, now, get, sleep)`, `extract.iso_week(now)`.

- [ ] **Step 1: Write the failing tests** — `service/tests/test_housekeeping_extract.py`:

```python
import dataclasses
import datetime as dt
import hashlib

import pytest
import requests

from conftest import T0, add_ready
from rhyflitzer_api import extract, housekeeping

DAY = 86400.0


def at(day, hour):
    return dt.datetime(2026, 10, day, hour, tzinfo=dt.timezone.utc).timestamp()   # 12 Oct 2026 is a Monday


def test_expiry_keeps_played_and_gallery(store, settings):
    old = add_ready(store, settings, "00000000000a", finished=T0 - 31 * DAY, files=True)
    played = add_ready(store, settings, "00000000000b", finished=T0 - 31 * DAY, played=T0 - 29 * DAY, files=True)
    pinned = add_ready(store, settings, "00000000000c", finished=T0 - 99 * DAY, gallery=True, files=True)
    housekeeping.expire_unplayed(store, settings, T0)
    assert store.get(old)["state"] == "expired" and not (settings.worlds_dir / old).exists()
    assert store.get(played)["state"] == store.get(pinned)["state"] == "ready" and (settings.worlds_dir / pinned).exists()


def test_cap_evicts_least_recently_played_never_gallery(store, settings):
    s = dataclasses.replace(settings, store_cap_bytes=500)
    add_ready(store, s, "00000000000a", size=300, played=T0 - 3 * DAY, files=True)
    add_ready(store, s, "00000000000b", size=300, played=T0 - 1 * DAY, files=True)
    add_ready(store, s, "00000000000c", size=300, played=T0 - 9 * DAY, gallery=True, files=True)
    housekeeping.enforce_cap(store, s)
    assert [store.get(w)["state"] for w in ("00000000000a", "00000000000b", "00000000000c")] == ["expired", "expired", "ready"]
    assert store.stored_bytes() == 300   # only gallery worlds left; the cap never touches them


def test_sweep_temp_and_prune_tiles(settings):
    stray = settings.worlds_dir / ".0123456789ab.tmp"
    stray.mkdir(parents=True)
    tiles = settings.cache_dir / "swisssurface3d"
    tiles.mkdir(parents=True)
    for n in range(3):
        (tiles / f"t{n}.tif").write_bytes(b"x" * 100)
    housekeeping.sweep_temp(settings.worlds_dir)
    housekeeping.prune_tile_caches(dataclasses.replace(settings, tile_cache_bytes=150))
    assert not stray.exists() and len(list(tiles.glob("*.tif"))) == 1


def test_nightly_runs_once_per_day_after_its_hour(store, settings, monkeypatch):
    runs = []
    monkeypatch.setattr(housekeeping, "nightly", lambda st, se, now: runs.append(now))
    housekeeping.run_due(store, settings, at(10, 2))
    housekeeping.run_due(store, settings, at(10, 3))
    housekeeping.run_due(store, settings, at(10, 23))
    housekeeping.run_due(store, settings, at(11, 3))
    assert runs == [at(10, 3), at(11, 3)]


def test_nightly_purges_past_days(store, settings):
    store.ip_hash("x", T0 - DAY)
    housekeeping.nightly(store, settings, T0)
    assert store._q("SELECT COUNT(*) AS n FROM salts")[0]["n"] == 0


class FakeResponse:
    def __init__(self, body: bytes):
        self.body, self.text = body, body.decode()

    def raise_for_status(self):
        pass

    def iter_content(self, size):
        yield self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_get(pbf: bytes, md5: str | None = None):
    def get(url, **kw):
        if url.endswith(".md5"):
            return FakeResponse(f"{md5 or hashlib.md5(pbf).hexdigest()}  switzerland-latest.osm.pbf\n".encode())
        return FakeResponse(pbf)
    return get


@pytest.fixture
def old_extract(settings):
    settings.extract_path.parent.mkdir(parents=True)
    settings.extract_path.write_bytes(b"old")
    return settings.extract_path


def test_update_swaps_in_a_verified_file(settings, old_extract):
    assert extract.update(settings, fake_get(b"new"), sleep=lambda s: None)
    assert old_extract.read_bytes() == b"new" and not list(old_extract.parent.glob("*.part"))


def test_bad_checksum_keeps_the_old_file(settings, old_extract):
    sleeps = []
    assert not extract.update(settings, fake_get(b"new", md5="0" * 32), sleep=sleeps.append)
    assert old_extract.read_bytes() == b"old" and not list(old_extract.parent.glob("*.part")) and sleeps == [30.0, 30.0]


def test_unreachable_keeps_the_old_file(settings, old_extract):
    def down(url, **kw):
        raise requests.ConnectionError("no route")
    assert not extract.update(settings, down, sleep=lambda s: None)
    assert old_extract.read_bytes() == b"old"


def test_extract_run_due(store, settings):
    calls = []

    def get(url, **kw):
        calls.append(url)
        return fake_get(b"pbf")(url, **kw)

    extract.run_due(store, settings, at(10, 12), get, lambda s: None)            # missing: at once, any day
    assert settings.extract_path.read_bytes() == b"pbf" and len(calls) == 2
    extract.run_due(store, settings, at(11, 12), get, lambda s: None)            # Sunday: not due
    extract.run_due(store, settings, at(12, 3), get, lambda s: None)             # Monday before 04 UTC
    assert len(calls) == 2
    extract.run_due(store, settings, at(12, 5), get, lambda s: None)
    extract.run_due(store, settings, at(12, 9), get, lambda s: None)             # done this week
    assert len(calls) == 4


def test_failed_update_is_tried_again_at_most_hourly(store, settings):
    calls = []

    def down(url, **kw):
        calls.append(url)
        raise requests.ConnectionError("no route")

    s = dataclasses.replace(settings, source_retries=0)
    extract.run_due(store, s, at(10, 12), down, lambda x: None)
    extract.run_due(store, s, at(10, 12) + 600, down, lambda x: None)
    extract.run_due(store, s, at(10, 13) + 1, down, lambda x: None)
    assert len(calls) == 2
```

- [ ] **Step 2: Run** — Expected: FAIL (`ImportError: cannot import name 'extract'`).

- [ ] **Step 3: Implement** — `service/rhyflitzer_api/housekeeping.py`:

```python
"""#168: the nightly cleanup (worlds unplayed for 30 days, past days' salts and build counts, stray temp dirs,
swisstopo tile caches) and the 10 GB cap on the world store (least recently played first; gallery worlds never)."""
from __future__ import annotations

import datetime as dt
import logging
import shutil
from pathlib import Path

import region

from . import logs
from .store import day_of

log = logging.getLogger("rhyflitzer.housekeeping")
DAY = 86400.0
TILE_COLLECTIONS = ("swisssurface3d", "swissalti3d")


def _remove(store, settings, wid: str, reason: str) -> None:
    log.info("Removing world %s: %s", wid, reason, extra=logs.fields(world=wid, reason=reason))
    shutil.rmtree(settings.worlds_dir / wid, ignore_errors=True)
    store.mark_expired(wid)
    log.info("Removed world %s", wid, extra=logs.fields(world=wid))


def expire_unplayed(store, settings, now: float) -> None:
    for wid in store.expired(now - settings.retention_days * DAY):
        _remove(store, settings, wid, f"not played for {settings.retention_days} days")


def enforce_cap(store, settings) -> None:
    total = store.stored_bytes()
    for row in store.eviction_order():
        if total <= settings.store_cap_bytes:
            return
        _remove(store, settings, row["id"], f"world store over {settings.store_cap_bytes / 1e9:.0f} GB")
        total -= row["size"]


def sweep_temp(worlds_dir) -> None:
    for stray in Path(worlds_dir).glob(".*.tmp"):
        shutil.rmtree(stray, ignore_errors=True)


def prune_tile_caches(settings) -> None:
    for name in TILE_COLLECTIONS:
        removed = region.prune_tiles(settings.cache_dir / name, settings.tile_cache_bytes)
        log.info("Pruned %d %s tiles", removed, name, extra=logs.fields(collection=name, removed=removed))


def nightly(store, settings, now: float) -> None:
    expire_unplayed(store, settings, now)
    enforce_cap(store, settings)
    store.purge_before(day_of(now))
    sweep_temp(settings.worlds_dir)
    prune_tile_caches(settings)


def run_due(store, settings, now: float) -> None:
    today = day_of(now)
    if dt.datetime.fromtimestamp(now, dt.timezone.utc).hour < settings.cleanup_hour_utc:
        return
    if store.kv_get("cleanup_day") == today:
        return
    log.info("Running the nightly cleanup")
    nightly(store, settings, now)
    store.kv_set("cleanup_day", today)
    log.info("Nightly cleanup done", extra=logs.fields(storedBytes=store.stored_bytes()))
```

`service/rhyflitzer_api/extract.py`:

```python
"""#168: the weekly Swiss extract from Geofabrik. Downloaded beside the current file, checked against Geofabrik's
.md5, then swapped in with one rename; on any failure the previous file stays and the next try is an hour later."""
from __future__ import annotations

import datetime as dt
import hashlib
import logging
import os
import time

import requests

from . import logs

log = logging.getLogger("rhyflitzer.extract")
CHUNK = 1 << 20
RETRY_AFTER = 3600.0


def iso_week(now: float) -> str:
    year, week, _ = dt.datetime.fromtimestamp(now, dt.timezone.utc).isocalendar()
    return f"{year}-W{week:02d}"


def download(settings, get=requests.get) -> None:
    """Raises on any failure; the current extract is untouched until the new one is complete and verified."""
    dest = settings.extract_path
    part = dest.with_name(dest.name + ".part")
    dest.parent.mkdir(parents=True, exist_ok=True)
    answer = get(settings.extract_url + ".md5", timeout=60)
    answer.raise_for_status()
    expected, digest = answer.text.split()[0], hashlib.md5()
    try:
        with get(settings.extract_url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with part.open("wb") as f:
                for chunk in r.iter_content(CHUNK):
                    f.write(chunk)
                    digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError(f"checksum mismatch: got {digest.hexdigest()}, Geofabrik says {expected}")
        os.replace(part, dest)
    finally:
        part.unlink(missing_ok=True)


def update(settings, get=requests.get, sleep=time.sleep) -> bool:
    attempts = settings.source_retries + 1
    for attempt in range(1, attempts + 1):
        log.info("Downloading the Swiss extract (attempt %d of %d)", attempt, attempts,
                 extra=logs.fields(url=settings.extract_url))
        try:
            download(settings, get)
        except (requests.RequestException, ValueError, OSError) as exc:
            log.warning("Downloading the Swiss extract failed: %s", exc, extra=logs.fields(attempt=attempt))
            if attempt < attempts:
                sleep(settings.retry_delay)
            continue
        log.info("Downloaded the Swiss extract (%.0f MB)", settings.extract_path.stat().st_size / 1e6)
        return True
    log.error("Keeping the previous Swiss extract: all %d attempts failed", attempts)
    return False


def _due(store, settings, now: float) -> bool:
    tried = store.kv_get("extract_tried")
    if tried and now - float(tried) < RETRY_AFTER:
        return False
    if not settings.extract_path.exists():
        return True
    t = dt.datetime.fromtimestamp(now, dt.timezone.utc)
    return (t.weekday() == settings.extract_weekday and t.hour >= settings.extract_hour_utc
            and store.kv_get("extract_week") != iso_week(now))


def run_due(store, settings, now: float, get=requests.get, sleep=time.sleep) -> None:
    if not _due(store, settings, now):
        return
    store.kv_set("extract_tried", str(now))
    if update(settings, get, sleep):
        store.kv_set("extract_week", iso_week(now))
```

Note on `test_extract_run_due`: the first (missing-file) run sets `extract_tried`; the Monday 05:00 run is two days later, so the hourly guard does not block it, and `extract_week` is the Monday's week (`2026-W42`), not the Saturday's (`2026-W41`).

- [ ] **Step 4: Run** — Expected: 10 passed; whole suite green.
- [ ] **Step 5: Commit** — `git add service/rhyflitzer_api/housekeeping.py service/rhyflitzer_api/extract.py service/tests/test_housekeeping_extract.py && git commit -m "feat(service): retention, store cap and weekly Swiss extract update (#168)" && git push`

---

### Task 6: The worker loop

**Files:**
- Create: `service/rhyflitzer_api/worker.py`, `service/tests/test_worker.py`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces: `worker.Worker(settings, store, build=runner.run_build, clock=time.time)` with `start()`, `run_once() -> bool`, `tick()`; `worker.main()` (`python -m rhyflitzer_api.worker`).

- [ ] **Step 1: Write the failing tests** — `service/tests/test_worker.py`:

```python
from conftest import RECT, T0
from rhyflitzer_api import extract, housekeeping, worker
from rhyflitzer_api.runner import Outcome


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def builder(*outcomes):
    calls = []

    def build(job, settings, on_step):
        calls.append(job["id"])
        on_step("terrain")
        return outcomes[min(len(calls), len(outcomes)) - 1]
    build.calls = calls
    return build


def with_extract(settings):
    settings.extract_path.parent.mkdir(parents=True)
    settings.extract_path.write_bytes(b"pbf")


def test_builds_in_order_and_marks_ready(store, settings):
    with_extract(settings)
    store.submit("00000000000a", RECT, "a", T0, settings)
    store.submit("00000000000b", RECT, "b", T0 + 1, settings)
    build = builder(Outcome(True, size=100))
    w = worker.Worker(settings, store, build, Clock(T0 + 2))
    assert w.run_once() and w.run_once() and not w.run_once()
    assert build.calls == ["00000000000a", "00000000000b"]
    a = store.get("00000000000a")
    assert (a["state"], a["step"], a["size"], a["finished"]) == ("ready", "done", 100, T0 + 2)


def test_no_extract_no_build(store, settings):
    store.submit("00000000000a", RECT, "a", T0, settings)
    assert not worker.Worker(settings, store, builder(Outcome(True)), Clock(T0)).run_once()
    assert store.get("00000000000a")["state"] == "queued"


def test_unreachable_source_is_retried_twice_then_fails(store, settings):
    with_extract(settings)
    store.submit("00000000000a", RECT, "a", T0, settings)
    clock = Clock(T0)
    w = worker.Worker(settings, store, builder(Outcome(False, "source-unreachable", "Data source unreachable")), clock)
    for _ in range(2):
        assert w.run_once() and store.get("00000000000a")["state"] == "queued"
        assert not w.run_once()                         # waits retry_delay
        clock.t += settings.retry_delay
    assert w.run_once()
    row = store.get("00000000000a")
    assert (row["state"], row["error"], row["attempts"]) == ("failed", "source-unreachable", 3)


def test_other_failures_fail_at_once(store, settings):
    with_extract(settings)
    store.submit("00000000000a", RECT, "a", T0, settings)
    worker.Worker(settings, store, builder(Outcome(False, "timeout", "too slow")), Clock(T0)).run_once()
    assert (store.get("00000000000a")["state"], store.get("00000000000a")["message"]) == ("failed", "too slow")


def test_a_build_over_the_cap_evicts_older_worlds(store, settings, monkeypatch):
    with_extract(settings)
    seen = []
    monkeypatch.setattr(housekeeping, "enforce_cap", lambda st, se: seen.append(True))
    store.submit("00000000000a", RECT, "a", T0, settings)
    worker.Worker(settings, store, builder(Outcome(True, size=1)), Clock(T0)).run_once()
    assert seen == [True]


def test_start_requeues_interrupted_and_sweeps_temp(store, settings):
    store.submit("00000000000a", RECT, "a", T0, settings)
    store.claim_next(T0)
    stray = settings.worlds_dir / ".00000000000a.tmp"
    stray.mkdir(parents=True)
    worker.Worker(settings, store, builder(Outcome(True)), Clock(T0)).start()
    assert store.get("00000000000a")["state"] == "queued" and not stray.exists()


def test_tick_beats_and_runs_due_maintenance(store, settings, monkeypatch):
    calls = []
    monkeypatch.setattr(housekeeping, "run_due", lambda st, se, now: calls.append(("cleanup", now)))
    monkeypatch.setattr(extract, "run_due", lambda st, se, now: calls.append(("extract", now)))
    worker.Worker(settings, store, builder(Outcome(True)), Clock(T0)).tick()
    assert calls == [("cleanup", T0), ("extract", T0)] and store.kv_get("worker_heartbeat") == str(T0)
```

- [ ] **Step 2: Run** — Expected: FAIL (`ImportError: cannot import name 'worker'`).

- [ ] **Step 3: Implement** — `service/rhyflitzer_api/worker.py`:

```python
"""#168: the one worker. Builds queued worlds one at a time, retries unreachable data sources twice, and runs the
nightly cleanup and the weekly extract update between builds. Run: python -m rhyflitzer_api.worker."""
from __future__ import annotations

import logging
import time

from . import extract, housekeeping, logs, runner
from .config import Settings
from .store import Store

log = logging.getLogger("rhyflitzer.worker")
IDLE_SECONDS = 2.0


class Worker:
    def __init__(self, settings: Settings, store: Store, build=runner.run_build, clock=time.time):
        self.settings, self.store, self.build, self.clock = settings, store, build, clock

    def start(self) -> None:
        requeued = self.store.requeue_interrupted()
        housekeeping.sweep_temp(self.settings.worlds_dir)
        log.info("Worker started; %d interrupted builds requeued", requeued, extra=logs.fields(requeued=requeued))

    def tick(self) -> None:
        now = self.clock()
        self.store.kv_set("worker_heartbeat", str(now))
        housekeeping.run_due(self.store, self.settings, now)
        extract.run_due(self.store, self.settings, now)

    def run_once(self) -> bool:
        """Builds the next due job; False when there is none (or no extract yet), so the loop can idle."""
        if not self.settings.extract_path.exists():
            return False
        job = self.store.claim_next(self.clock())
        if job is None:
            return False
        self._build(job)
        return True

    def _build(self, job: dict) -> None:
        wid, started = job["id"], self.clock()
        log.info("Building world %s (attempt %d)", wid, job["attempts"], extra=logs.fields(world=wid, lv95=job["lv95"]))
        outcome = self.build(job, self.settings, lambda step: self.store.set_step(wid, step))
        self._settle(job, outcome, self.clock() - started)

    def _settle(self, job: dict, outcome: runner.Outcome, seconds: float) -> None:
        wid, now = job["id"], self.clock()
        fields = logs.fields(world=wid, seconds=round(seconds), error=outcome.error)
        if outcome.ok:
            self.store.finish_ready(wid, now, outcome.size)
            log.info("Built world %s in %.0f s (%.1f MB)", wid, seconds, outcome.size / 1e6, extra=fields)
            housekeeping.enforce_cap(self.store, self.settings)
            return
        if outcome.error == "source-unreachable" and job["attempts"] <= self.settings.source_retries:
            self.store.retry_later(wid, now + self.settings.retry_delay, outcome.message)
            log.warning("Building world %s failed: data source unreachable; retrying in %.0f s", wid,
                        self.settings.retry_delay, extra=fields)
            return
        self.store.finish_failed(wid, now, outcome.error, outcome.message)
        log.warning("Building world %s failed: %s (%s)", wid, outcome.error, outcome.message, extra=fields)


def main() -> None:
    logs.setup()
    settings = Settings.from_env()
    w = Worker(settings, Store(settings.db_path))
    w.start()
    while True:
        w.tick()
        if not w.run_once():
            time.sleep(IDLE_SECONDS)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run** — Expected: 7 passed; whole suite green.
- [ ] **Step 5: Commit** — `git add service/rhyflitzer_api/worker.py service/tests/test_worker.py && git commit -m "feat(service): worker loop with retries, cleanup and extract schedule (#168)" && git push`

---

### Task 7: World files and the admin gallery

**Files:**
- Modify: `service/rhyflitzer_api/app.py` (new handlers; the world route is appended to `ROUTES`, the admin route goes into `ADMIN_ROUTES` of `create_admin_app`, which has no CORS: admin is not a browser)
- Create: `service/tests/test_app_worlds.py`

**Interfaces:**
- Produces (#167's contract): `GET /worlds/{wid}/{name}` for exactly `world.json` (`no-cache`; **fetching it is the play signal**: `lastPlayed` in the store and in `meta.json`, at most hourly), `meta.json` (`no-cache`) and `terrain.mmh` (`public, max-age=86400`); `404 {error: unknown | not-ready | expired}` otherwise; CORS for `CORS_ORIGINS` on `/worlds/*` and `/api/*`. `PUT /api/admin/gallery/{wid}` `{title, description}` and `DELETE`, with `Authorization: Bearer <token>`, served **only** by `create_admin_app` (the internal `rhyflitzer-admin` listener), never by `create_app`. No server-side zip: #167 packs the download (incl. `LICENSE-ODbL.txt`) in the browser.

- [ ] **Step 1: Write the failing tests** — `service/tests/test_app_worlds.py`:

```python
import dataclasses
import json
import time

import pytest
from starlette.testclient import TestClient

from conftest import add_ready
from rhyflitzer_api.app import create_admin_app, create_app

WID = "0123456789ab"
ORIGIN = {"Origin": "https://github.freaxnx01.ch"}


def test_world_files_with_cache_headers_and_cors(client, store, settings):
    add_ready(store, settings, WID, files=True)
    world = client.get(f"/worlds/{WID}/world.json", headers=ORIGIN)
    assert world.status_code == 200 and world.json() == {"roads": []}
    assert world.headers["cache-control"] == "no-cache"
    assert world.headers["access-control-allow-origin"] == ORIGIN["Origin"]
    terrain = client.get(f"/worlds/{WID}/terrain.mmh", headers=ORIGIN)
    assert terrain.content.startswith(b"MMH1") and terrain.headers["content-type"] == "application/octet-stream"
    assert terrain.headers["cache-control"] == "public, max-age=86400"
    assert terrain.headers["access-control-allow-origin"] == ORIGIN["Origin"]
    meta = client.get(f"/worlds/{WID}/meta.json")
    assert meta.headers["cache-control"] == "no-cache" and meta.json()["id"] == WID


def test_world_json_is_the_play_signal_at_most_hourly(client, store, settings):
    add_ready(store, settings, WID, files=True)
    client.get(f"/worlds/{WID}/meta.json")
    client.get(f"/worlds/{WID}/terrain.mmh")
    assert store.get(WID)["last_played"] is None                             # only world.json counts
    client.get(f"/worlds/{WID}/world.json")
    first = store.get(WID)["last_played"]
    assert first is not None and abs(first - time.time()) < 60
    assert json.loads((settings.worlds_dir / WID / "meta.json").read_text())["lastPlayed"].endswith("+00:00")
    store.mark_played(WID, first - 10)
    client.get(f"/worlds/{WID}/world.json")
    assert store.get(WID)["last_played"] == first - 10                       # within the hour: unchanged
    store.mark_played(WID, first - 4000)
    client.get(f"/worlds/{WID}/world.json")
    assert store.get(WID)["last_played"] > first - 60


@pytest.mark.parametrize("setup, path, code", [
    (None, f"/worlds/{WID}/world.json", "unknown"),
    ("expired", f"/worlds/{WID}/world.json", "expired"),
    ("queued", f"/worlds/{WID}/world.json", "not-ready"),
    ("ready", f"/worlds/{WID}/secret.txt", "unknown"),
    ("ready", f"/worlds/{WID}/world.zip", "unknown"),
    ("ready", "/worlds/0123456789AB/world.json", "unknown"),
])
def test_missing_worlds_say_why(client, store, settings, setup, path, code):
    if setup:
        add_ready(store, settings, WID, files=True)
    if setup == "expired":
        store.mark_expired(WID)
    if setup == "queued":
        store._x("UPDATE worlds SET state = 'queued' WHERE id = ?", (WID,))
    r = client.get(path, headers=ORIGIN)
    assert r.status_code == 404 and r.json()["error"] == code
    assert r.headers["access-control-allow-origin"] == ORIGIN["Origin"]      # the game can read why


def test_the_public_app_has_no_admin_routes(client, store, settings):
    add_ready(store, settings, WID)
    for call in (client.put, client.delete):
        assert call(f"/api/admin/gallery/{WID}", headers={"Authorization": "Bearer s3cret"}).status_code == 404
    assert store.get(WID)["gallery"] == 0


def test_admin_without_token_file_is_401(store, settings):
    add_ready(store, settings, WID)
    r = TestClient(create_admin_app(settings, store)).put(f"/api/admin/gallery/{WID}", json={"title": "x"}, headers={"Authorization": "Bearer "})
    assert r.status_code == 401 and store.get(WID)["gallery"] == 0


@pytest.fixture
def admin(settings, store, tmp_path):
    token = tmp_path / "admin_token"
    token.write_text("s3cret\n")
    return TestClient(create_admin_app(dataclasses.replace(settings, admin_token_file=token), store))


def test_the_admin_app_serves_nothing_but_admin(admin):
    assert admin.get("/api/health").status_code == 404 and admin.get(f"/worlds/{WID}/world.json").status_code == 404


def test_admin_pins_and_unpins_a_ready_world(admin, store, settings):
    add_ready(store, settings, WID)
    auth = {"Authorization": "Bearer s3cret"}
    assert admin.put(f"/api/admin/gallery/{WID}", json={"title": "x"}, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert admin.put(f"/api/admin/gallery/{WID}", json={"title": " "}, headers=auth).status_code == 400
    assert admin.put("/api/admin/gallery/0000000000ff", json={"title": "x"}, headers=auth).status_code == 404
    r = admin.put(f"/api/admin/gallery/{WID}", json={"title": "Lägern", "description": "Ridge road"}, headers=auth)
    assert r.status_code == 200 and (store.get(WID)["gallery"], store.get(WID)["title"]) == (1, "Lägern")
    assert admin.delete(f"/api/admin/gallery/{WID}", headers=auth).status_code == 200 and store.get(WID)["gallery"] == 0
```

- [ ] **Step 2: Run** — Expected: FAIL (404 on `/worlds/...`: no such route).

- [ ] **Step 3: Implement** — in `service/rhyflitzer_api/app.py` add imports `datetime as dt`, `hmac`, `os` and `from starlette.responses import FileResponse, Response`, then before `ROUTES`:

```python
FILES = {"world.json": ("application/json", "no-cache"),            # revalidated on every load: the play signal
         "meta.json": ("application/json", "no-cache"),
         "terrain.mmh": ("application/octet-stream", "public, max-age=86400")}
PLAY_SIGNAL = "world.json"


def _iso(now: float) -> str:
    return dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat(timespec="seconds")


def note_played(store: Store, settings: Settings, wid: str) -> None:
    """lastPlayed in the store and in meta.json, at most once per played_interval."""
    now = time.time()
    if not store.played_is_stale(wid, now, settings.played_interval):
        return
    store.mark_played(wid, now)
    path = settings.worlds_dir / wid / "meta.json"
    doc = json.loads(path.read_text("utf-8"))
    doc["lastPlayed"] = _iso(now)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)
    log.info("World %s played", wid, extra=logs.fields(world=wid))


def world_missing(row) -> JSONResponse:
    if row is None:
        return error(404, "unknown", "no such world")
    if row["state"] == "expired":
        return error(404, "expired", "This world has expired. Build it again?")
    return error(404, "not-ready", "This world is not built yet")


async def world_file(request: Request) -> Response:
    settings, store = request.app.state.settings, request.app.state.store
    wid, name = request.path_params["wid"], request.path_params["name"]
    if not WORLD_ID.match(wid) or name not in FILES:
        return error(404, "unknown", "no such file")
    row = store.get(wid)
    if row is None or row["state"] != "ready":
        return world_missing(row)
    if name == PLAY_SIGNAL:
        note_played(store, settings, wid)
    media, cache = FILES[name]
    return FileResponse(settings.worlds_dir / wid / name, media_type=media, headers={"Cache-Control": cache})


def is_admin(request: Request, settings: Settings) -> bool:
    """Bearer token from the Docker secret file; no file or an empty file means admin is off (fail closed)."""
    path = settings.admin_token_file
    if path is None or not path.exists():
        return False
    expected = path.read_text("utf-8").strip()
    given = request.headers.get("authorization", "")
    return bool(expected) and hmac.compare_digest(given.encode(), f"Bearer {expected}".encode())


async def gallery(request: Request) -> JSONResponse:
    settings, store, wid = request.app.state.settings, request.app.state.store, request.path_params["wid"]
    if not is_admin(request, settings):
        log.warning("Refused an admin call without a valid token", extra=logs.fields(world=wid))
        return error(401, "unauthorized", "admin token required")
    row = store.get(wid) if WORLD_ID.match(wid) else None
    if row is None or row["state"] != "ready":
        return error(404, "unknown", "no such built world")
    if request.method == "DELETE":
        store.unset_gallery(wid)
        log.info("Removed world %s from the gallery", wid, extra=logs.fields(world=wid))
        return JSONResponse({"id": wid, "gallery": False})
    body = await request.json()
    title = str(body.get("title", "")).strip()[:80]
    if not title:
        return error(400, "bad-request", "a title is required")
    store.set_gallery(wid, title, str(body.get("description", "")).strip()[:300])
    log.info("Added world %s to the gallery as %s", wid, title, extra=logs.fields(world=wid))
    return JSONResponse({"id": wid, "gallery": True, "title": title})
```

and extend `ROUTES`:

```python
    Route("/worlds/{wid}/{name}", world_file, methods=["GET"]),
```

and, below `create_app`, the admin surface (nothing else is served there, and `create_app` never includes it):

```python
ADMIN_ROUTES = [Route("/api/admin/gallery/{wid}", gallery, methods=["PUT", "DELETE"])]


def create_admin_app(settings: Settings | None = None, store: Store | None = None) -> Starlette:
    """Admin only; run by the rhyflitzer-admin service on an internal port that Traefik never sees."""
    if settings is None:
        logs.setup()
        settings = Settings.from_env()
    app = Starlette(routes=ADMIN_ROUTES)
    app.state.settings, app.state.store = settings, store or Store(settings.db_path)
    return app
```

- [ ] **Step 4: Run** — Expected: 12 passed (this file); whole suite green.
- [ ] **Step 5: Commit** — `git add service/rhyflitzer_api/app.py service/tests/test_app_worlds.py && git commit -m "feat(service): world files with CORS, cache headers and play signal; admin gallery (#168)" && git push`

---

### Task 8: The public edge — human check on new builds (ALTCHA) and the frame preview

**Why:** the endpoint is public and a build costs up to 3 GB and a minute of 2 cores. On top of the unchanged per-IP and global limits: a **human check on `POST /api/jobs` for a NEW build only** (never for playing, polling, downloading, gallery reads, a cache hit or joining a queued frame), and a cheap, rate-limited `GET /api/preview` (name, race feasible) that builds nothing.

**Files:**
- Create: `service/rhyflitzer_api/challenge.py`, `service/rhyflitzer_api/roadgrid.py`, `service/rhyflitzer_api/preview.py`, `service/tests/test_challenge.py`, `service/tests/test_human_check.py`, `service/tests/test_roadgrid.py`, `service/tests/test_preview.py`
- Modify: `service/rhyflitzer_api/config.py`, `store.py`, `app.py`, `worker.py`, `service/tests/conftest.py`, `service/tests/test_app_jobs.py`

**Interfaces:**
- Produces: `GET /api/challenge` (signed ALTCHA challenge, `no-store`; `503 human-check-unavailable` without a key); `POST /api/jobs` accepts `"altcha"` and answers `403 {error: "human_check_failed", message}` for a NEW build without a valid, unexpired, unused solution; `GET /api/preview?bbox=` → `{id, exists, name, gemeinden, raceOk, reason?}` (`id` = the world id of the snapped frame, `exists` = a POST would only join or read it, so no human check). `challenge.issue(settings, now)`, `challenge.check(payload, settings) -> Ticket | None`, `challenge.Ticket(signature, expires)`, `challenge.Unavailable`; `store.human_gate(ticket, now)`, `Store.submit(..., gate=None)`, `Store.replace_roadgrid(rows)`, `Store.major_meters(rect)`, `Store.exists(wid)` (and the module function `joins(row)` that `submit` and `exists` share); `roadgrid.cells_of_way/build/run_due`; `preview.Limiter/describe`.
- Consumes: Tasks 1-7.

**Decisions** are A14-A16 in the issue and the spec sections "Human check (ALTCHA) on new builds" and "Frame preview"; in short: the server side is the **`altcha` package** (`altcha>=2.3,<3`, MIT, zero dependencies, PoW v2 like the widget) behind a thin `challenge.py`; `PBKDF2/SHA-256`, `cost` 5000 (`ALTCHA_COST`), key prefix `00`, ~1 s on a phone, 10-minute expiry; the ticket is spent **inside the admission transaction** (a later `429`/`503` rolls it back unspent); the HMAC key is the secret file `ALTCHA_SECRET_FILE`, no file fails closed; the preview is an estimate (road index of major-road metres per 500 m cell, swisstopo identify for the name, `RACE_MIN_ROAD_M` 3000, 60 requests a minute per client, no human check; its `exists` flag lets the editor skip the proof of work for a world that is already built or queued, while a POST without a solution for a new world stays `403`).

- [ ] **Step 1: Settings, store, conftest** (so the failing tests below can run against them)

`config.py` — add the fields after `extract_url` and read them in `from_env`:

```python
    altcha_secret_file: Path | None = None    # HMAC key of the human check (Docker secret); none: fails closed
    altcha_cost: int = 5000                   # PBKDF2/SHA-256 iterations per try; one try in 256 succeeds
    altcha_ttl: float = 600.0                 # a challenge, and so its solution, is good for 10 minutes
    race_min_road_m: int = 3000               # metres of major road in a frame before a race looks feasible
    preview_per_minute: int = 60
```

```python
        secret = env.get("ALTCHA_SECRET_FILE")
        return cls(data_dir=Path(env["DATA_DIR"]), cors_origins=origins,
                   admin_token_file=Path(token) if token else None, proxy_hops=int(env.get("PROXY_HOPS", "1")),
                   altcha_secret_file=Path(secret) if secret else None, altcha_cost=int(env.get("ALTCHA_COST", "5000")),
                   race_min_road_m=int(env.get("RACE_MIN_ROAD_M", "3000")))
```

`store.py` — two tables in `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS used_challenges (signature TEXT PRIMARY KEY, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS roadgrid (cx INTEGER NOT NULL, cy INTEGER NOT NULL, meters INTEGER NOT NULL,
  PRIMARY KEY (cx, cy)) WITHOUT ROWID;
```

`import math` at the top, `CELL = 500.0   # roadgrid cell edge in metres (LV95)` and `HUMAN_MESSAGE` below `PERMANENT`, the gate, then `submit` takes `gate=None` and calls it for a NEW build only, before the limits:

```python
HUMAN_MESSAGE = "The human check did not pass; wait a moment for it to finish and press Build again"


def human_gate(ticket, now: float):
    """submit()'s gate for a NEW build: spends the ticket (a solved ALTCHA challenge) inside the admission transaction,
    so a later refusal rolls it back unspent and the same solution never admits two builds."""
    def gate(db) -> None:
        if ticket is None:
            raise Refused(403, "human_check_failed", HUMAN_MESSAGE)
        db.execute("DELETE FROM used_challenges WHERE expires < ?", (now,))
        try:
            db.execute("INSERT INTO used_challenges(signature, expires) VALUES (?, ?)", (ticket.signature, ticket.expires))
        except sqlite3.IntegrityError:
            raise Refused(403, "human_check_failed", HUMAN_MESSAGE) from None
    return gate
```

```python
def joins(row) -> bool:
    """A request for this world would only join or read it (built, queued, building, permanently failed): free, no human check."""
    return bool(row) and (row["state"] in ("queued", "building", "ready") or row["error"] in PERMANENT)
```

```python
    def exists(self, wid: str) -> bool:
        return joins(self.get(wid))

    def submit(self, wid: str, rect, ip_hash: str, now: float, settings, gate=None) -> dict:
        ...
            if joins(row):
                return dict(row)
            if gate is not None:
                gate(db)
            _check_limits(db, ip_hash, day_of(now), settings)
```

and two methods (section "gallery, health, kv"):

```python
    def replace_roadgrid(self, rows) -> None:
        def swap(db):
            db.execute("DELETE FROM roadgrid")
            db.executemany("INSERT INTO roadgrid(cx, cy, meters) VALUES (?, ?, ?)", rows)
        self._tx(swap)

    def major_meters(self, rect) -> int | None:
        """Metres of major road in the cells whose centre lies inside the frame; None while there is no index."""
        if not self._q("SELECT 1 AS x FROM roadgrid LIMIT 1"):
            return None
        e0, n0, e1, n1 = rect
        return self._q("SELECT COALESCE(SUM(meters), 0) AS m FROM roadgrid WHERE cx BETWEEN ? AND ? AND cy BETWEEN ? AND ?",
                       (math.ceil(e0 / CELL - 0.5), math.floor(e1 / CELL - 0.5),
                        math.ceil(n0 / CELL - 0.5), math.floor(n1 / CELL - 0.5)))[0]["m"]
```

`tests/conftest.py` — `import altcha` with the other imports, a `settings` fixture that carries a key and a cost of 1 (tests solve in microseconds), and two helpers:

```python
@pytest.fixture
def settings(tmp_path):
    key = tmp_path / "altcha.secret"
    key.write_text("test-key", encoding="utf-8")
    return Settings(data_dir=tmp_path, altcha_secret_file=key, altcha_cost=1)


def solve(doc: dict) -> str:
    """The payload a browser would send for this challenge document."""
    challenge = altcha.Challenge.from_dict(doc)
    return altcha.Payload(challenge, altcha.solve_challenge(challenge)).to_base64()


def human(client) -> str:
    """A fresh, valid human-check payload from the app under test."""
    return solve(client.get("/api/challenge").json())
```

`tests/test_app_jobs.py` (Task 3) — `from conftest import RECT, human, ip`; a NEW build now carries a solution, a join or cache hit does not:
- `test_post_queues_a_new_world_and_get_reports_it`: `json={"lv95": list(RECT), "altcha": human(client)}`.
- `test_same_frame_is_one_job_snapped_and_from_lonlat`: the first post gets `"altcha": human(client)`; the second (a join) stays without.
- `test_limits_reach_the_client`: both posts get `"altcha": human(client)` (each its own).

- [ ] **Step 2: Write the failing tests** — `service/tests/test_challenge.py`:

```python
import dataclasses
import time

import altcha
import pytest

from conftest import solve
from rhyflitzer_api import challenge
from rhyflitzer_api.config import Settings


def test_issue_is_a_signed_pbkdf2_challenge_that_expires_in_ten_minutes(settings):
    now = time.time()
    doc = challenge.issue(settings, now)
    p = doc["parameters"]
    assert (p["algorithm"], p["cost"], p["expiresAt"]) == ("PBKDF2/SHA-256", settings.altcha_cost, int(now + 600))
    assert doc["signature"] and doc != challenge.issue(settings, now)


def test_valid_solution_gives_a_ticket(settings):
    doc = challenge.issue(settings, time.time())
    assert challenge.check(solve(doc), settings) == challenge.Ticket(doc["signature"], doc["parameters"]["expiresAt"])


def test_wrong_solution_is_refused(settings):
    ch = altcha.Challenge.from_dict(challenge.issue(settings, time.time()))
    good = altcha.solve_challenge(ch)
    bad = altcha.Solution(counter=good.counter + 1, derived_key=good.derived_key)
    assert challenge.check(altcha.Payload(ch, bad).to_base64(), settings) is None


def test_expired_challenge_is_refused(settings):
    assert challenge.check(solve(challenge.issue(settings, time.time() - 3600)), settings) is None


def test_tampered_or_foreign_challenge_is_refused(settings, tmp_path):
    doc = challenge.issue(settings, time.time())
    doc["parameters"]["expiresAt"] += 3600                       # extending the expiry breaks the signature
    assert challenge.check(solve(doc), settings) is None
    other = tmp_path / "other.secret"
    other.write_text("another-key", encoding="utf-8")
    foreign = challenge.issue(dataclasses.replace(settings, altcha_secret_file=other), time.time())
    assert challenge.check(solve(foreign), settings) is None


@pytest.mark.parametrize("payload", [None, "", "not base64 at all", 42, "A" * 5000])
def test_garbage_is_refused(settings, payload):
    assert challenge.check(payload, settings) is None


def test_without_a_key_file_it_fails_closed(settings):
    gone = dataclasses.replace(settings, altcha_secret_file=None)
    with pytest.raises(challenge.Unavailable):
        challenge.issue(gone, time.time())
    assert challenge.check(solve(challenge.issue(settings, time.time())), gone) is None


def test_settings_read_key_file_cost_and_race_threshold(tmp_path):
    s = Settings.from_env({"DATA_DIR": str(tmp_path), "ALTCHA_SECRET_FILE": "/run/secrets/a", "ALTCHA_COST": "8000",
                           "RACE_MIN_ROAD_M": "4000"})
    assert (str(s.altcha_secret_file), s.altcha_cost, s.race_min_road_m, s.altcha_ttl) == ("/run/secrets/a", 8000, 4000, 600.0)
    d = Settings.from_env({"DATA_DIR": str(tmp_path)})
    assert (d.altcha_secret_file, d.altcha_cost, d.race_min_road_m, d.preview_per_minute) == (None, 5000, 3000, 60)
```

`service/tests/test_human_check.py`:

```python
import dataclasses
import time

import frame
import region
from starlette.testclient import TestClient

from conftest import RECT, T0, add_ready, human, ip, solve
from rhyflitzer_api import challenge
from rhyflitzer_api.app import create_app
from rhyflitzer_api.store import human_gate

WID = frame.world_id(RECT, region.PIPELINE_VERSION)
OTHER = [2667000, 1259750, 2669000, 1261750]


def post(client, rect=RECT, payload=None, n=1):
    body = {"lv95": list(rect)}
    if payload is not None:
        body["altcha"] = payload
    return client.post("/api/jobs", json=body, headers=ip(n))


def test_challenge_endpoint_issues_a_fresh_signed_challenge(client):
    a, b = client.get("/api/challenge"), client.get("/api/challenge")
    assert a.status_code == 200 and a.headers["cache-control"] == "no-store"
    assert a.json()["parameters"]["algorithm"] == "PBKDF2/SHA-256" and a.json()["signature"] != b.json()["signature"]


def test_challenge_without_a_key_is_503(settings, store):
    client = TestClient(create_app(dataclasses.replace(settings, altcha_secret_file=None), store))
    r = client.get("/api/challenge")
    assert r.status_code == 503 and r.json()["error"] == "human-check-unavailable"


def test_new_build_without_a_solution_is_403_and_queues_nothing(client, store):
    r = post(client)
    assert r.status_code == 403 and r.json()["error"] == "human_check_failed" and r.json()["message"]
    assert store.get(WID) is None


def test_new_build_with_a_solution_is_queued(client):
    assert post(client, payload=human(client)).status_code == 202


def test_a_solution_works_once(client):
    payload = human(client)
    assert post(client, payload=payload).status_code == 202
    again = post(client, OTHER, payload, n=2)
    assert again.status_code == 403 and again.json()["error"] == "human_check_failed"


def test_wrong_solution_is_403(client):
    assert post(client, payload="not-a-solution").json()["error"] == "human_check_failed"


def test_expired_solution_is_403(client, settings):
    expired = solve(challenge.issue(settings, time.time() - 3600))
    assert post(client, payload=expired).status_code == 403


def test_cache_hit_needs_no_solution(client, store, settings):
    add_ready(store, settings, WID)
    r = post(client)
    assert r.status_code == 200 and r.json()["state"] == "ready"


def test_joining_a_queued_frame_needs_no_solution(client):
    assert post(client, payload=human(client)).status_code == 202
    joined = post(client, n=2)
    assert joined.status_code == 202 and joined.json()["id"] == WID


def test_refused_build_leaves_the_solution_unspent(client):
    first, second = human(client), human(client)
    assert post(client, payload=first).status_code == 202
    assert post(client, OTHER, second).json()["error"] == "one-at-a-time"      # 429 rolls the ticket back
    assert post(client, OTHER, second, n=2).status_code == 202


def test_used_signatures_are_forgotten_once_they_expire(store, settings):
    def spent():
        return [r["signature"] for r in store._q("SELECT signature FROM used_challenges")]

    store.submit("a" * 12, RECT, "x", T0, settings, gate=human_gate(challenge.Ticket("sig-1", T0 + 600), T0))
    assert spent() == ["sig-1"]
    store.submit("b" * 12, RECT, "y", T0 + 700, settings, gate=human_gate(challenge.Ticket("sig-2", T0 + 1300), T0 + 700))
    assert spent() == ["sig-2"]
```

- [ ] **Step 3: Write the failing tests** — `service/tests/test_roadgrid.py` and `service/tests/test_preview.py`:

```python
# test_roadgrid.py
import shutil
import subprocess
from collections import Counter

import pytest

from conftest import T0
from rhyflitzer_api import roadgrid

needs_osmium = pytest.mark.skipif(shutil.which("osmium") is None, reason="osmium-tool not installed")
SYNTH = ('<?xml version="1.0"?><osm version="0.6">'
         '<node id="1" lat="47.4750" lon="8.3000"/><node id="2" lat="47.4850" lon="8.3000"/>'
         '<way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/></way>'
         '<way id="11"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/></way></osm>')


def test_a_way_counts_for_the_cells_its_pieces_lie_in():
    cells = roadgrid.cells_of_way([(250.0, 250.0), (2250.0, 250.0)])
    assert dict(cells) == {(0, 0): 250.0, (1, 0): 500.0, (2, 0): 500.0, (3, 0): 500.0, (4, 0): 250.0}


def test_major_meters_sums_cells_centred_in_the_frame_and_is_none_without_an_index(store):
    assert store.major_meters((500.0, 500.0, 1500.0, 1500.0)) is None
    store.replace_roadgrid([(1, 1, 700), (2, 2, 300), (9, 9, 99999)])       # centres (750, 750), (1250, 1250)
    assert store.major_meters((500.0, 500.0, 1500.0, 1500.0)) == 1000
    assert store.major_meters((500.0, 500.0, 1000.0, 1000.0)) == 700


def test_run_due_builds_once_per_extract(store, settings):
    settings.extract_path.parent.mkdir(parents=True)
    settings.extract_path.write_bytes(b"x")
    calls = []

    def build(path, work):
        calls.append(path)
        return Counter({(1, 1): 3999.6})

    roadgrid.run_due(store, settings, T0, build=build)
    roadgrid.run_due(store, settings, T0 + 5000, build=build)
    assert len(calls) == 1 and store.major_meters((500.0, 500.0, 1000.0, 1000.0)) == 4000


def test_a_failed_index_build_is_retried_at_most_hourly(store, settings):
    settings.extract_path.parent.mkdir(parents=True)
    settings.extract_path.write_bytes(b"x")
    calls = []

    def build(path, work):
        calls.append(path)
        raise subprocess.CalledProcessError(1, "osmium")

    for offset in (0, 60, 3600):
        roadgrid.run_due(store, settings, T0 + offset, build=build)
    assert len(calls) == 2 and store.major_meters((500.0, 500.0, 1000.0, 1000.0)) is None


@needs_osmium
def test_build_reads_only_major_roads_from_a_synthetic_extract(tmp_path):
    extract = tmp_path / "ch.osm"
    extract.write_text(SYNTH, encoding="utf-8")
    cells = roadgrid.build(extract, tmp_path)
    assert abs(sum(cells.values()) - 1112) < 15 and not (tmp_path / "major-roads.pbf").exists()
```

```python
# test_preview.py
import dataclasses

import frame
import pytest
import region
import requests
from starlette.testclient import TestClient

from conftest import RECT, add_ready, ip
from rhyflitzer_api.app import create_app
from rhyflitzer_api.preview import Limiter

BBOX = "bbox=2667000,1259750,2669250,1261750"
WID = frame.world_id(RECT, region.PIPELINE_VERSION)
INSIDE = (5336, 2521)          # a cell centred in RECT


class Reply:
    def __init__(self, names):
        self.names = names

    def raise_for_status(self):
        pass

    def json(self):
        return {"results": [{"attributes": {"gemname": n, "jahr": 2026, "is_current_jahr": True}} for n in self.names]}


def fake_get(point=("Ehrendingen",), envelope=("Ehrendingen",), calls=None):
    def get(url, params, timeout):
        if calls is not None:
            calls.append(params["geometryType"])
        return Reply(point if params["geometryType"] == "esriGeometryPoint" else envelope)
    return get


def app(settings, store, get=None, **over):
    return TestClient(create_app(dataclasses.replace(settings, **over), store, get=get or fake_get()))


def test_limiter_allows_n_per_minute_and_forgets():
    now = [0.0]
    limiter = Limiter(2, clock=lambda: now[0])
    assert [limiter.allow("a"), limiter.allow("a"), limiter.allow("a"), limiter.allow("b")] == [True, True, False, True]
    now[0] = 60.0
    assert limiter.allow("a")


def test_preview_names_the_frame_and_says_a_race_fits(settings, store):
    store.replace_roadgrid([(*INSIDE, 4000), (9000, 9000, 99999)])
    r = app(settings, store).get(f"/api/preview?{BBOX}", headers=ip(1))
    assert r.status_code == 200
    assert r.json() == {"id": WID, "exists": False, "name": "Ehrendingen", "gemeinden": ["Ehrendingen"], "raceOk": True}


def test_two_gemeinden_make_a_double_name_centre_first(settings, store):
    store.replace_roadgrid([(*INSIDE, 4000)])
    get = fake_get(point=("Ehrendingen",), envelope=("Lengnau", "Ehrendingen"))
    assert app(settings, store, get).get(f"/api/preview?{BBOX}").json()["name"] == "Ehrendingen · Lengnau"


def test_few_major_roads_say_so(settings, store):
    store.replace_roadgrid([(*INSIDE, 1000)])
    assert app(settings, store).get(f"/api/preview?{BBOX}").json()["raceOk"] is False
    assert app(settings, store).get(f"/api/preview?{BBOX}").json()["reason"] == "few-major-roads"


def test_no_road_index_yet_is_unknown_not_an_error(settings, store):
    assert app(settings, store).get(f"/api/preview?{BBOX}").json() == {
        "id": WID, "exists": False, "name": "Ehrendingen", "gemeinden": ["Ehrendingen"], "raceOk": None, "reason": "no-road-index"}


def test_a_failed_name_lookup_gives_a_null_name(settings, store):
    def down(url, params, timeout):
        raise requests.ConnectionError("swisstopo is down")
    store.replace_roadgrid([(*INSIDE, 4000)])
    r = app(settings, store, down).get(f"/api/preview?{BBOX}")
    assert r.status_code == 200 and r.json() == {"id": WID, "exists": False, "name": None, "gemeinden": [], "raceOk": True}


@pytest.mark.parametrize("query, code", [
    ("", "bad-bbox"), ("?bbox=1,2,3", "bad-bbox"),
    ("?bbox=2693000,1283000,2695000,1285000", "outside-ch"), ("?bbox=2660000,1250000,2670000,1260000", "too-big"),
])
def test_preview_refuses_bad_frames(settings, store, query, code):
    r = app(settings, store).get(f"/api/preview{query}")
    assert r.status_code == 400 and r.json()["error"] == code


def test_preview_is_rate_limited_per_client(settings, store):
    client = app(settings, store, preview_per_minute=2)
    assert [client.get(f"/api/preview?{BBOX}", headers=ip(1)).status_code for _ in range(3)] == [200, 200, 429]
    assert client.get(f"/api/preview?{BBOX}", headers=ip(2)).status_code == 200
    assert client.get(f"/api/preview?{BBOX}", headers=ip(1)).json()["error"] == "preview-rate-limit"


def exists(client):
    return client.get(f"/api/preview?{BBOX}").json()["exists"]


def test_preview_says_whether_the_world_exists(settings, store):
    client = app(settings, store)
    assert (client.get(f"/api/preview?{BBOX}").json()["id"], exists(client)) == (WID, False)
    add_ready(store, settings, WID)
    assert exists(client) is True
    for state, error, expected in [("queued", None, True), ("building", None, True), ("expired", None, False),
                                   ("failed", "timeout", False), ("failed", "too-complex", True)]:
        store._x("UPDATE worlds SET state = ?, error = ? WHERE id = ?", (state, error, WID))
        assert exists(client) is expected, (state, error)


def test_exists_matches_the_human_check_but_the_server_stays_authoritative(settings, store):
    client = app(settings, store)
    add_ready(store, settings, WID)
    assert exists(client) is True
    hit = client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))        # no "altcha": a cache hit is free
    assert hit.status_code == 200 and hit.json()["state"] == "ready"
    store._x("UPDATE worlds SET state = 'expired' WHERE id = ?", (WID,))
    assert exists(client) is False
    refused = client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))    # a NEW build without a solution
    assert refused.status_code == 403 and refused.json()["error"] == "human_check_failed"


def test_the_same_frame_is_looked_up_once(settings, store):
    calls = []
    client = app(settings, store, fake_get(calls=calls))
    client.get(f"/api/preview?{BBOX}")
    client.get(f"/api/preview?{BBOX}")
    assert calls == ["esriGeometryPoint", "esriGeometryEnvelope"]
```

- [ ] **Step 4: Run** — `cd service && .venv/bin/python -m pip install -r requirements-dev.txt && .venv/bin/python -m pytest -q tests/test_challenge.py tests/test_human_check.py tests/test_roadgrid.py tests/test_preview.py` — Expected: FAIL (`ModuleNotFoundError: rhyflitzer_api.challenge`).

- [ ] **Step 5: Implement** — `service/rhyflitzer_api/challenge.py`:

```python
"""#168: the human check on new builds. ALTCHA proof of work (PoW v2) through the `altcha` package (MIT): the server
signs a short-lived challenge with an HMAC key, the browser spends about a second of CPU finding a counter whose
PBKDF2 key starts with the required prefix, and the signed solution rides along with POST /api/jobs. No third party,
no cookie, no puzzle. A solution may admit one build: spending the ticket is the store's job (store.human_gate)."""
from __future__ import annotations

import logging
from dataclasses import dataclass

import altcha

log = logging.getLogger("rhyflitzer.api")
ALGORITHM = "PBKDF2/SHA-256"
MAX_PAYLOAD = 4096


class Unavailable(Exception):
    """No usable HMAC key: the human check fails closed."""


@dataclass(frozen=True)
class Ticket:
    signature: str      # of the challenge; identifies it for replay protection
    expires: float


def secret(settings) -> str:
    path = settings.altcha_secret_file
    try:
        value = path.read_text(encoding="utf-8").strip() if path else ""
    except OSError:
        value = ""
    if not value:
        raise Unavailable("the ALTCHA key file is missing or empty")
    return value


def issue(settings, now: float) -> dict:
    """A signed challenge, good for settings.altcha_ttl seconds."""
    return altcha.create_challenge(algorithm=ALGORITHM, cost=settings.altcha_cost, expires_at=int(now + settings.altcha_ttl),
                                   hmac_secret=secret(settings)).to_dict()


def check(payload, settings) -> Ticket | None:
    """The ticket of a valid, unexpired solution to a challenge we signed; None for anything else (the cause is
    logged, never sent back)."""
    if not isinstance(payload, str) or not 0 < len(payload) <= MAX_PAYLOAD:
        return None
    try:
        result = altcha.verify_solution(payload, secret(settings))
    except Unavailable as exc:
        log.warning("Human check impossible: %s", exc)
        return None
    if not result.verified:
        why = "expired" if result.expired else "forged" if result.invalid_signature else result.error or "wrong solution"
        log.info("Human check failed: %s", why)
        return None
    signed = altcha.Payload.from_base64(payload).challenge
    return Ticket(signed.signature, signed.parameters.expires_at)
```

`service/rhyflitzer_api/roadgrid.py`:

```python
"""#168: the road index behind GET /api/preview: metres of primary/secondary/tertiary road (places.MAJOR, #166) per
500 m LV95 cell, rebuilt by the worker when the Swiss extract changes. `osmium tags-filter` streams the 0.55 GB
extract into a small file and pyosmium reads that: no cut, well under 1 GB."""
from __future__ import annotations

import logging
import math
import subprocess
from collections import Counter
from pathlib import Path

import osmium
from pyproj import Transformer

import places

from . import logs
from .store import CELL

log = logging.getLogger("rhyflitzer.worker")
PIECE = 250.0            # a segment is cut into pieces of at most this length; each counts for its midpoint's cell
RETRY_SECONDS = 3600.0
TO_LV95 = Transformer.from_crs(4326, 2056, always_xy=True)


def cells_of_way(points) -> Counter:
    """Metres of one way per (cx, cy) cell, from its LV95 points."""
    out: Counter = Counter()
    for (e0, n0), (e1, n1) in zip(points, points[1:]):
        length = math.hypot(e1 - e0, n1 - n0)
        pieces = max(1, math.ceil(length / PIECE))
        for i in range(pieces):
            mid = (i + 0.5) / pieces
            out[(math.floor((e0 + (e1 - e0) * mid) / CELL), math.floor((n0 + (n1 - n0) * mid) / CELL))] += length / pieces
    return out


def build(extract: Path, work_dir: Path, run=subprocess.run) -> Counter:
    """The whole index from the extract; the filtered file is removed again."""
    work_dir.mkdir(parents=True, exist_ok=True)
    major = work_dir / "major-roads.pbf"
    try:
        run(["osmium", "tags-filter", "--overwrite", "-o", str(major), str(extract),
             "w/highway=" + ",".join(sorted(places.MAJOR))], check=True)
        cells: Counter = Counter()
        for way in osmium.FileProcessor(str(major), osmium.osm.WAY).with_locations():
            if way.tags.get("highway") in places.MAJOR:
                cells.update(cells_of_way([TO_LV95.transform(n.lon, n.lat) for n in way.nodes if n.location.valid()]))
        return cells
    finally:
        major.unlink(missing_ok=True)


def run_due(store, settings, now: float, build=build) -> None:
    """Rebuilds the index when the extract is newer than the one it was built from; a failure is retried hourly."""
    if not settings.extract_path.exists():
        return
    stamp = str(settings.extract_path.stat().st_mtime_ns)
    tried = store.kv_get("roadgrid_tried")
    if store.kv_get("roadgrid_for") == stamp or (tried and now - float(tried) < RETRY_SECONDS):
        return
    store.kv_set("roadgrid_tried", str(now))
    log.info("Building the road index for the preview from the extract")
    try:
        cells = build(settings.extract_path, settings.cache_dir / "roadgrid")
    except (OSError, subprocess.CalledProcessError):
        log.exception("Building the road index failed; the preview answers raceOk null until the next try")
        return
    store.replace_roadgrid([(cx, cy, round(m)) for (cx, cy), m in cells.items()])
    store.kv_set("roadgrid_for", stamp)
    log.info("The road index is ready: %d cells", len(cells), extra=logs.fields(cells=len(cells)))
```

`service/rhyflitzer_api/preview.py`:

```python
"""#168: GET /api/preview: what a frame would become, answered without building. Name and Gemeinden from swisstopo's
identify service (a point request at the centre and an envelope request, cached per snapped frame); "can a race
fit" from the road index (roadgrid.py). An estimate: the build's own `race` stays authoritative."""
from __future__ import annotations

import collections
import logging
import time

import requests

from .store import Store

log = logging.getLogger("rhyflitzer.api")
IDENTIFY = "https://api3.geo.admin.ch/rest/services/api/MapServer/identify"
LAYER = "all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill"
FEW_ROADS, NO_INDEX = "few-major-roads", "no-road-index"
CACHE_SIZE = 512


class Limiter:
    """At most `per_minute` calls per client in any 60 s; kept in memory only, so no address is ever stored."""

    def __init__(self, per_minute: int, clock=time.monotonic):
        self.per_minute, self.clock, self._hits = per_minute, clock, collections.defaultdict(collections.deque)

    def allow(self, client: str) -> bool:
        now, hits = self.clock(), self._hits[client]
        while hits and now - hits[0] >= 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        if len(self._hits) > 4096:
            self._hits = collections.defaultdict(collections.deque, {k: v for k, v in self._hits.items() if v and now - v[-1] < 60})
        return True


def _identify(geometry: str, kind: str, year: int, get) -> list[str]:
    reply = get(IDENTIFY, params={"geometry": geometry, "geometryType": kind, "layers": LAYER, "tolerance": 0, "sr": 2056,
                                  "returnGeometry": "false", "timeInstant": year}, timeout=0.9)
    reply.raise_for_status()
    names = [r["attributes"]["gemname"] for r in reply.json().get("results", [])
             if r["attributes"].get("is_current_jahr", True) and r["attributes"].get("gemname")]
    return list(dict.fromkeys(names))


def gemeinden(rect, year: int, get) -> tuple[str | None, list[str]]:
    """(name, Gemeinden): the centre's Gemeinde first, then the others touching the frame; the name has at most two."""
    centre = _identify(f"{(rect[0] + rect[2]) / 2},{(rect[1] + rect[3]) / 2}", "esriGeometryPoint", year, get)[:1]
    around = _identify(",".join(str(v) for v in rect), "esriGeometryEnvelope", year, get)
    names = centre + [n for n in around if n not in centre]
    return (" · ".join(names[:2]) or None), names


def lookup(rect, year: int, get, cache: dict) -> tuple[str | None, list[str]]:
    """(name, Gemeinden) of a snapped frame, looked up once; a failed lookup is not cached and gives (None, [])."""
    if rect in cache:
        return cache[rect]
    try:
        found = gemeinden(rect, year, get)
    except (requests.RequestException, ValueError, KeyError):
        log.warning("Looking up the Gemeinden of a preview failed; answering without a name", exc_info=True)
        return None, []
    if len(cache) >= CACHE_SIZE:
        cache.clear()
    cache[rect] = found
    return found


def describe(store: Store, settings, rect, wid: str, year: int, get, cache: dict) -> dict:
    """id and exists (a POST would only join or read the world: no human check), name, Gemeinden, raceOk."""
    name, names = lookup(rect, year, get, cache)
    meters = store.major_meters(rect)
    answer = {"id": wid, "exists": store.exists(wid), "name": name, "gemeinden": names, "raceOk": None if meters is None else meters >= settings.race_min_road_m}
    if meters is None:
        answer["reason"] = NO_INDEX
    elif not answer["raceOk"]:
        answer["reason"] = FEW_ROADS
    return answer
```

`app.py` — imports (`import requests`, `from starlette.concurrency import run_in_threadpool`, `from . import challenge, logs, preview`, `from .store import Refused, Store, human_gate`), then:

```python
def snapped(body) -> tuple:
    """The snapped, checked LV95 frame of a request; raises frame.FrameError, or ValueError/TypeError when malformed."""
    rect = frame.snap(*parse_rect(body))
    frame.check(rect)
    return rect


async def create_job(request: Request) -> JSONResponse:
    settings, store = request.app.state.settings, request.app.state.store
    try:
        body = await request.json()
    except ValueError:
        return error(400, "bad-request", "the body must be JSON")
    try:
        rect = snapped(body)
    except frame.FrameError as exc:
        return error(400, exc.code, str(exc))
    except (TypeError, ValueError):
        return error(400, "bad-bbox", BBOX_HELP)
    wid, now = frame.world_id(rect, region.PIPELINE_VERSION), time.time()
    ticket = challenge.check(body.get("altcha"), settings)       # judged only if this turns out to be a NEW build
    log.info("Admitting a build of world %s", wid, extra=logs.fields(world=wid, lv95=list(rect)))
    try:
        row = store.submit(wid, rect, store.ip_hash(client_ip(request, settings.proxy_hops), now), now, settings,
                           gate=human_gate(ticket, now))
    except Refused as exc:
        log.info("Refused a build of world %s: %s", wid, exc.code, extra=logs.fields(world=wid, code=exc.code))
        return error(exc.status, exc.code, str(exc))
    log.info("World %s is %s", wid, row["state"], extra=logs.fields(world=wid, state=row["state"]))
    return JSONResponse(job_view(store, row), status_code=200 if row["state"] == "ready" else 202)


async def get_challenge(request: Request) -> JSONResponse:
    log.debug("Issuing a human-check challenge")
    try:
        doc = challenge.issue(request.app.state.settings, time.time())
    except challenge.Unavailable as exc:
        log.error("Could not issue a human-check challenge: %s", exc)
        return error(503, "human-check-unavailable", "The human check is not available right now")
    return JSONResponse(doc, headers={"Cache-Control": "no-store"})


async def get_preview(request: Request) -> JSONResponse:
    state = request.app.state
    if not state.limiter.allow(client_ip(request, state.settings.proxy_hops)):
        return error(429, "preview-rate-limit", "Too many previews; wait a moment")
    try:
        rect = snapped({"lv95": request.query_params.get("bbox", "").split(",")})
    except frame.FrameError as exc:
        return error(400, exc.code, str(exc))
    except (TypeError, ValueError):
        return error(400, "bad-bbox", "give bbox=e0,n0,e1,n1 in LV95")
    wid = frame.world_id(rect, region.PIPELINE_VERSION)
    return JSONResponse(await run_in_threadpool(preview.describe, state.store, state.settings, rect, wid,
                                                time.gmtime().tm_year, state.get, state.names))
```

`ROUTES` gets `Route("/api/challenge", get_challenge, methods=["GET"])` and `Route("/api/preview", get_preview, methods=["GET"])`; `create_app(settings=None, store=None, get=requests.get)` additionally sets `app.state.get, app.state.names, app.state.limiter = get, {}, preview.Limiter(settings.preview_per_minute)`.

`worker.py` — `from . import extract, housekeeping, logs, roadgrid, runner` and, in `tick`, after `extract.run_due(self.store, self.settings, now)`: `roadgrid.run_due(self.store, self.settings, now)`.

- [ ] **Step 6: Run** — `cd service && .venv/bin/python -m pytest -q` — Expected: everything green: 121 tests (120 and one skipped without `osmium-tool`); the pipeline suite untouched.
- [ ] **Step 7: Commit** — `git add service/rhyflitzer_api/challenge.py service/rhyflitzer_api/roadgrid.py service/rhyflitzer_api/preview.py service/rhyflitzer_api/config.py service/rhyflitzer_api/store.py service/rhyflitzer_api/app.py service/rhyflitzer_api/worker.py service/tests/ && git commit -m "feat(service): ALTCHA human check on new builds and a frame preview (#168)" && git push`

---

### Task 9: Docker image and the operator README

**Files:**
- Create: `service/Dockerfile`, `service/Dockerfile.dockerignore`, `service/README.md`, `service/tests/test_packaging.py`

**Interfaces:**
- Produces: an image built with `docker build -f service/Dockerfile .` from the repo root; default command = API; worker = `python -m rhyflitzer_api.worker`.

- [ ] **Step 1: Write the failing test** — `service/tests/test_packaging.py` (static checks only; **do not run `docker build`**):

```python
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]


def test_dockerfile_has_osmium_node20_nonroot_and_the_factory():
    text = (SERVICE / "Dockerfile").read_text()
    assert "FROM node:20-bookworm-slim AS node" in text and "COPY --from=node /usr/local/bin/node" in text
    assert "osmium-tool" in text and "USER app" in text
    assert '"rhyflitzer_api.app:create_app", "--factory"' in text
    for path in ("pipeline/", "prototype/", "service/rhyflitzer_api/"):
        assert f"COPY {path}" in text


def test_runtime_dependencies_are_exactly_these():
    lines = [l for l in (SERVICE / "requirements.txt").read_text().splitlines() if l.strip()]
    assert [l.split(">")[0] for l in lines] == ["starlette", "uvicorn", "altcha"]


def test_readme_documents_the_worker_cap_and_the_secret():
    text = (SERVICE / "README.md").read_text()
    assert "mem_limit: 3g" in text and "rhyflitzer_admin_token" in text and "python -m rhyflitzer_api.worker" in text
    assert "rhyflitzer_altcha_secret" in text and "ALTCHA_SECRET_FILE" in text


def test_admin_stays_off_traefik():
    text = (SERVICE / "README.md").read_text()
    assert "!PathPrefix(`/api/admin`)" in text and "create_admin_app" in text and "127.0.0.1:8081:8001" in text
    admin = text.split("  rhyflitzer-admin:")[1].split("\n```")[0]
    assert "traefik.enable=true" not in admin and "traefik.http" not in admin and "- web" not in admin
    assert "rhyflitzer_admin_token" not in text.split("  rhyflitzer-worker:")[0]
```

- [ ] **Step 2: Run** — Expected: FAIL (`FileNotFoundError: .../service/Dockerfile`).

- [ ] **Step 3: Implement** — `service/Dockerfile`:

```dockerfile
# #168: the region editor build service. Build from the repo root: docker build -f service/Dockerfile .
FROM node:20-bookworm-slim AS node

FROM python:3.12-slim-bookworm
# Node 20 runs prototype/route.js for the automatic race (#179); osmium-tool cuts the Swiss extract (#166).
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
 && apt-get install -y --no-install-recommends osmium-tool \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pipeline/requirements.txt pipeline/requirements.txt
COPY service/requirements.txt service/requirements.txt
RUN pip install --no-cache-dir -r pipeline/requirements.txt -r service/requirements.txt
COPY pipeline/ pipeline/
COPY prototype/ prototype/
COPY service/rhyflitzer_api/ service/rhyflitzer_api/
ENV PYTHONPATH=/app/pipeline:/app/service PYTHONUNBUFFERED=1 DATA_DIR=/data
RUN useradd --system --uid 10001 app && mkdir /data && chown app /data
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"
CMD ["uvicorn", "rhyflitzer_api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
```

`service/Dockerfile.dockerignore` (BuildKit reads `<Dockerfile>.dockerignore` first):

```
**
!pipeline/*.py
!pipeline/*.geojson
!pipeline/*.mjs
!pipeline/requirements.txt
!prototype/**
!service/requirements.txt
!service/rhyflitzer_api/**
**/__pycache__
```

`service/README.md` — sections, in this order (keep it short; the API contract lives in the spec):
1. **What it is** — one paragraph + link to the spec.
2. **Local development** — venv + test commands from the Global Constraints; `DATA_DIR=/tmp/rhy uvicorn rhyflitzer_api.app:create_app --factory --reload` (with `PYTHONPATH=pipeline:service`).
3. **Compose services for `production/vserver/docker-compose.yml`** (in the `mydocker-compose` repo; the operator adds it, this repo does not) — exactly this block:

```yaml
  rhyflitzer-api:
    image: rhyflitzer-api:latest
    build:
      context: https://github.com/freaxnx01/game-rhyflitzer.git#main
      dockerfile: service/Dockerfile
    container_name: rhyflitzer-api
    restart: unless-stopped
    mem_limit: 512m
    environment:
      - CORS_ORIGINS=https://github.freaxnx01.ch
      - ALTCHA_SECRET_FILE=/run/secrets/rhyflitzer_altcha_secret
    secrets:
      - rhyflitzer_altcha_secret
    volumes:
      - ./data/rhyflitzer:/data
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=web"
      - "traefik.http.services.rhyflitzer-api.loadbalancer.server.port=8000"
      - "traefik.http.routers.rhyflitzer-api.rule=Host(`${SUBDOMAIN_RHYFLITZER_API}.${HOST}`) && !PathPrefix(`/api/admin`)"
      - "traefik.http.routers.rhyflitzer-api.entrypoints=${ENTRYPOINT}"
      - "traefik.http.routers.rhyflitzer-api.tls.certresolver=default"
      - "traefik.http.routers.rhyflitzer-api.middlewares=myRateLimit@file"

  rhyflitzer-worker:
    image: rhyflitzer-api:latest
    container_name: rhyflitzer-worker
    command: ["python", "-m", "rhyflitzer_api.worker"]
    restart: unless-stopped
    mem_limit: 3g
    memswap_limit: 3g
    cpus: 2
    volumes:
      - ./data/rhyflitzer:/data
    healthcheck:
      disable: true
    labels:
      - "traefik.enable=false"

  rhyflitzer-admin:
    image: rhyflitzer-api:latest
    container_name: rhyflitzer-admin
    command: ["uvicorn", "rhyflitzer_api.app:create_admin_app", "--factory", "--host", "0.0.0.0", "--port", "8001", "--no-access-log"]
    restart: unless-stopped
    mem_limit: 256m
    environment:
      - ADMIN_TOKEN_FILE=/run/secrets/rhyflitzer_admin_token
    secrets:
      - rhyflitzer_admin_token
    volumes:
      - ./data/rhyflitzer:/data
    ports:
      - "127.0.0.1:8081:8001"   # the host's loopback only: reached over SSH, never routed by Traefik
    healthcheck:
      disable: true
    labels:
      - "traefik.enable=false"
```

   plus, under the file's top-level `secrets:`: `rhyflitzer_admin_token: {file: "./secrets/rhyflitzer_admin_token.secret"}` and `rhyflitzer_altcha_secret: {file: "./secrets/rhyflitzer_altcha_secret.secret"}` (the admin token is mounted only into `rhyflitzer-admin`, the ALTCHA key only into `rhyflitzer-api`), and in `production/vserver/.env`: `SUBDOMAIN_RHYFLITZER_API=rhyflitzer-api`. (Volume path: follow the file's existing convention if it differs from `./data/…`.)
4. **Operator checklist** — the numbered list from #168's "Operator checklist" section, verbatim.
5. **Admin (SSH only)** — the admin routes are not on the public host. Tunnel: `ssh -N -L 8081:127.0.0.1:8081 ionos1`, then the CLI against `RHYFLITZER_ADMIN_API=http://127.0.0.1:8081` (token from the environment, e.g. out of Passbolt). Or run it on the server, which needs no tunnel: `ssh ionos1 "docker exec rhyflitzer-admin sh -c 'RHYFLITZER_ADMIN_API=http://127.0.0.1:8001 RHYFLITZER_ADMIN_TOKEN=\$(cat /run/secrets/rhyflitzer_admin_token) python scripts/gallery.py add <id> \"Title\" \"Description\"'"` (the CLI is #170's; the token is read inside the container and never printed). Never paste the token into a shell history or a file in a repo.
6. **Operations** — the human check (`ALTCHA_COST`, default 5000: ~1 s on a phone; raise to tighten) and the preview threshold (`RACE_MIN_ROAD_M`, default 3000); health URL; logs `docker logs rhyflitzer-worker | jq .`; where data lives (`/data`: `service.sqlite3`, `worlds/`, `extract/`, `cache/`); a failed extract update keeps the old file; an OOM kill shows as `build-failed` "killed by signal 9".

- [ ] **Step 4: Run** — Expected: 4 passed; whole suite green (`cd service && .venv/bin/python -m pytest -q`): 122 tests (121 and one skipped without `osmium-tool`). Pipeline suite unchanged and green.
- [ ] **Step 5: Commit** — `git add service/Dockerfile service/Dockerfile.dockerignore service/README.md service/tests/test_packaging.py && git commit -m "feat(service): Docker image and operator README for ionos1 (#168)" && git push`, then open the PR (`feat(service): region editor build service on ionos1 (#168)`), body listing the operator checklist as the remaining manual part.
