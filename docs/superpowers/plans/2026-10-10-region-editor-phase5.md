# Region editor phase 5: curated world gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner curates a gallery of generated worlds with a small CLI (a bearer-token admin call over SSH); the start screen shows them as a "Worlds" row that opens `?world=<id>`; gallery worlds are never evicted (#170).

**Refreshed 2026-10-12** against the merged phase 2 (#167, PR #274: `prototype/worlds.js`, `zip.js`, `?world=`, `WORLD_HOST`, `worldHost()`, `worldSearch()`) and phase 3 (#168, PR #293: the `service/` package). The first version of this plan (2026-10-10) assumed a separate `gallery.py` module with its own SQLite table; #168 had meanwhile shipped most of the server side. Where this plan and the spec (`docs/superpowers/specs/2026-10-10-region-editor-phase5-design.md`) differ, **this plan wins** (the differences are listed in "Already shipped by #168" and "Deviations from the spec").

**Refreshed again 2026-10-13** against PR #312 (#296: handlers that touch SQLite or files now stay off the event loop, `service/requirements.lock` is hash-pinned) and PR #310 (#169: the editor page under `editor/` and `editor.html`; it touches neither `service/rhyflitzer_api/app.py` nor `prototype/index.html`, so nothing in this plan collides with it). Effect on this plan: the new `GET /api/gallery` handler is a plain `def` (Starlette runs it in the threadpool) and the edited `gallery` handler offloads `store.set_gallery` the way its neighbours already do (Task 2).

**Architecture:** Server side, three small additions to the phase 3 service: `Store.gallery_list()` plus an order column, a public `GET /api/gallery` route, and `scripts/gallery.py` (stdlib CLI, shipped in the image). Client side, one pure ES module `prototype/gallery.js` (validation + fetch with injected `fetch`) and a few wiring lines in `prototype/index.html` that build the row with `createElement` / `textContent`.

**Tech Stack:** vanilla JS ES modules, `node --test`, Playwright (Python, pytest) with `page.route` stubbing the gallery call, Python 3.12 stdlib + Starlette + pytest for the service.

## Already shipped by #168 (do not redo)

In `service/rhyflitzer_api/app.py` and `store.py`, merged in PR #293, with tests in `service/tests/test_app_worlds.py`, `test_store.py` and `test_housekeeping_extract.py`:

- `PUT` / `DELETE /api/admin/gallery/{wid}` (handler `gallery`, route list `ADMIN_ROUTES`, app factory `create_admin_app`), served **only** by the internal `rhyflitzer-admin` listener (`127.0.0.1:8081` on ionos1, no Traefik route). `Authorization: Bearer <token>`, token from the Docker secret file `ADMIN_TOKEN_FILE` (`is_admin()`, `hmac.compare_digest`). Since #312 the handler is `async def` but awaits `run_in_threadpool(is_admin, …)` and `run_in_threadpool(store.get / set_gallery / unset_gallery, …)`; `test_admin_gallery_runs_off_the_event_loop` in `test_app_worlds.py` pins that.
- Answers: `401 unauthorized` (also when no token file is configured: fail closed, **not** 503), `404 unknown` (not a ready world), `400 bad-request` (non-object body, empty title), `413 too-large` (body over 8 KB), `200 {id, gallery: true, title}` / `{id, gallery: false}`. Errors are `{error, message}`. Title is cut to 80, description to 300 characters.
- Columns `gallery`, `title`, `description` on the `worlds` table; `Store.set_gallery()` / `unset_gallery()`.
- Retention: `Store.expired()` and `Store.eviction_order()` already skip `gallery = 1` (nightly cleanup and the 10 GB cap).
- `service/README.md`: the Compose block for `rhyflitzer-admin`, the "Admin (SSH only)" section with the `docker exec` one-liner for `scripts/gallery.py` (which does not exist yet: that is Task 3), operator checklist step 8 (admin is not public).

## What #170 still needs

1. A **public** `GET /api/gallery` (there is none): the list in the owner's order, at most 50, cacheable 60 s. Needs an order: the table has none, so one nullable column `gallery_at` (Task 1).
2. Un-pinning must give the world a fresh retention period; today `unset_gallery()` leaves `last_played` as it was, so a world that sat in the gallery for 40 days would be deleted by the very next nightly cleanup (Task 1).
3. Control characters stripped from title and description (Task 2).
4. `scripts/gallery.py` (the README already points at it) and its place in the image (Task 3).
5. The client: `prototype/gallery.js`, the `worldsRow` strings, the Worlds row in `prototype/index.html`, tests, CHANGELOG, README (Tasks 4-8).

## Deviations from the spec (decided with the merged code in front of us)

- No separate `gallery` table and no `gallery.py` module: the three columns on `worlds` stay; ordering is one new column `gallery_at`. No `is_pinned()` hook: retention already reads the column.
- An unconfigured token answers `401`, not `503` (merged behaviour, fail closed).
- `meta.json` does **not** get a `pinned` field. The database column is the single source of truth, and the admin container writing into a folder that the API process rewrites on every play (`note_played`) would invite a race for nothing. (`checkMeta` in `worlds.js` would have ignored it anyway.)
- Over-long title or description is cut (merged behaviour), not rejected; the client re-validates and rejects anything over the limit, so a cut value always passes.
- No 5 s timeout on the gallery request (the spec asks for one): it aborts good requests while the page is busy; see Task 6.
- The CLI uses one host variable, `RHYFLITZER_ADMIN_API`, for all three actions: `list` calls `GET /api/gallery`, which the admin listener serves too (Task 2).

## Global Constraints

- **Never put a `//` comment in the middle of a one-line statement in `prototype/index.html`** (much of the file is one statement per line; a trailing `//` swallows the rest of the line). Use `/* ... */` or a comment on its own line. New code in `index.html` is multi-line.
- **Blocking work stays off the event loop** (#296, PR #312): a handler that reads SQLite or a file is a plain `def` (Starlette runs it in the threadpool, like `get_job`, `world_status`, `health`, `world_file`), or an `async def` that wraps each blocking call in `await run_in_threadpool(…)`, like `gallery`. Never call a `Store` method directly from an `async def` body.
- Buildless game: no `package.json`, no framework, no vendored library. The service gains no dependency (`test_runtime_dependencies_are_exactly_these` stays green), so `service/requirements.lock` (hash-pinned, `--require-hashes`) stays untouched.
- All gallery text is untrusted when it reaches the page: `textContent` / `setAttribute('title', …)` only, never `innerHTML`, never `toastHtml()` (#176; `prototype/escape.js` is merged). The id is checked with `isWorldId` before it builds a URL.
- **The admin token appears nowhere in the code, the repo, a URL, a command line, a log line or a test value that looks real.** The service reads it from `ADMIN_TOKEN_FILE`; the CLI reads `RHYFLITZER_ADMIN_TOKEN` from its environment and has no `--token` flag. Tests use throwaway strings like `unit-test-token`. Creating the token and adding the first worlds is the maintainer's go-live step (README, Task 8), not part of this PR.
- Do not change Hochrhein / Ehrendingen behaviour or any `?world=` behaviour from #167.
- Tests: `node --test prototype/tests/*.test.mjs` plus ONE targeted Playwright file, `prototype/tests/test_gallery.py`, plus the service suite (`cd service && .venv/bin/python -m pytest -q`; venv per `service/README.md`, under the same `systemd-run` cap). Playwright is slow: foreground only (never `run_in_background`), frame-light (viewport 480x270, `wait_for_function`, no long sleeps), always `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_gallery.py -x`. Not the full ~2 h suite, no repeat "to be safe" runs. Exit 137 = cap hit: stop and report, never raise the cap. No real-data builds, no real API calls.
- Commit and push the branch before the Playwright run (Task 7). Conventional Commits, explicit `git add <paths>`.
- CHANGELOG: English, player-facing, by hand under `[Unreleased]`, **timestamped** in Swiss local time (`TZ=Europe/Zurich date '+%F %H:%M'`), 1-3 bold keywords; never `git cliff -o`.

## Review Focus

- A title like `<img src=x onerror=window.__pwn=1>` shows as text and never runs (`test_gallery.py::test_gallery_text_is_text`).
- The token never appears in any committed file or output: `test_main_sends_through_the_admin_host_and_never_prints_the_token`, and `git grep -n -i "bearer [a-z0-9]\{12,\}"` finds nothing.
- `GET /api/gallery` is on both listeners and needs no token; `PUT` / `DELETE` stay on the admin listener only (`test_the_public_app_has_no_admin_routes` stays green).
- `GET /api/gallery` and the `gallery` handler's store calls run off the event loop (`test_the_public_gallery_runs_off_the_event_loop`, and the merged `test_admin_gallery_runs_off_the_event_loop` stays green).
- Un-pinning restarts the 30 days; re-adding a world puts it last; replacing keeps its place.
- A database created by #168 before this change gets the new column without losing rows (`test_a_database_from_before_the_gallery_order_gets_its_column`).
- An unreachable, empty or garbage gallery leaves the start screen exactly as before.

---

### Task 1: `Store` — gallery order, the public list, un-pinning restarts retention (TDD)

**Files:** modify `service/rhyflitzer_api/store.py` (anchors: the `SCHEMA` string's `worlds` table, `Store.__init__`, `set_gallery`, `unset_gallery`, the constant `PLAYED_AT`), `service/tests/test_store.py`.

**Interfaces:** `Store.set_gallery(wid, title, description, now=None)`; `Store.unset_gallery(wid, now=None)`; `Store.gallery_list(limit=GALLERY_MAX) -> [{id, title, description}]` (ready gallery worlds, the owner's order); constant `GALLERY_MAX = 50`; private `Store._migrate()`. The existing calls in `app.py` (`store.set_gallery(wid, title, description)`, `store.unset_gallery(wid)`) keep working through the defaults.

- [ ] **Step 0: Preconditions.** `git fetch origin && git checkout -b feature/170-gallery origin/main`. `test -f service/rhyflitzer_api/app.py && test -f prototype/worlds.js && test -f prototype/escape.js || echo "A NEIGHBOUR IS MISSING"`: stop and report if it prints (this phase must not ship before #167, #168 and #176). Venv if missing: `python3 -m venv service/.venv && service/.venv/bin/pip install -r service/requirements-dev.txt`. Baseline: `cd service && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 .venv/bin/python -m pytest -q` is green before you change anything.
- [ ] **Step 1: Write the failing tests** — append to `service/tests/test_store.py` (it already imports `T0`, `add_ready`, `DAY`, `wid`):

```python
def test_the_gallery_keeps_the_owners_order_and_a_replaced_entry_keeps_its_place(store, settings):
    for n in (1, 2, 3):
        add_ready(store, settings, wid(n))
    store.set_gallery(wid(2), "Two", "", now=T0)
    store.set_gallery(wid(1), "One", "first", now=T0 + 1)
    store.set_gallery(wid(2), "Two again", "", now=T0 + 2)
    assert [(e["id"], e["title"]) for e in store.gallery_list()] == [(wid(2), "Two again"), (wid(1), "One")]
    store.unset_gallery(wid(2), now=T0 + 3)
    store.set_gallery(wid(2), "Two", "", now=T0 + 4)
    assert [e["id"] for e in store.gallery_list()] == [wid(1), wid(2)]       # a re-added world goes to the end


def test_the_gallery_lists_only_ready_worlds_and_at_most_fifty(store, settings):
    for n in range(60):
        add_ready(store, settings, wid(n))
        store.set_gallery(wid(n), f"W{n}", "", now=T0 + n)
    store.mark_expired(wid(0))
    listed = store.gallery_list()
    assert len(listed) == 50 and listed[0]["id"] == wid(1) and set(listed[0]) == {"id", "title", "description"}


def test_unpinning_gives_the_world_a_fresh_retention_period(store, settings):
    add_ready(store, settings, wid(1), finished=T0 - 99 * DAY, gallery=True)
    assert store.expired(T0 - 30 * DAY) == []                                # pinned: never
    store.unset_gallery(wid(1), now=T0)
    assert store.expired(T0 - 30 * DAY) == [] and store.expired(T0 + 31 * DAY) == [wid(1)]


def test_a_database_from_before_the_gallery_order_gets_its_column(tmp_path):
    import sqlite3
    from rhyflitzer_api import store as store_module
    path = tmp_path / "old.sqlite3"
    old = store_module.SCHEMA.replace(", gallery_at REAL", "")
    assert old != store_module.SCHEMA
    sqlite3.connect(path).executescript(old)
    upgraded = store_module.Store(path)
    add_ready(upgraded, None, wid(1))
    upgraded.set_gallery(wid(1), "One", "", now=T0)
    assert [e["id"] for e in upgraded.gallery_list()] == [wid(1)]
```

- [ ] **Step 2:** `cd service && .venv/bin/python -m pytest tests/test_store.py -q` fails (`gallery_list` missing).
- [ ] **Step 3: Implement** in `store.py`:
  - In `SCHEMA`, the `worlds` table's last column list ends `gallery INTEGER NOT NULL DEFAULT 0, title TEXT, description TEXT);`: make it `..., title TEXT, description TEXT, gallery_at REAL);`.
  - Next to `PLAYED_AT`: `GALLERY_MAX = 50`.
  - In `Store.__init__`, after `self._db.executescript(SCHEMA)`: `self._migrate()`, and the method:

```python
    def _migrate(self) -> None:
        """Databases created before #170 lack worlds.gallery_at (the gallery order); CREATE TABLE IF NOT EXISTS leaves them as they were."""
        if "gallery_at" not in {r["name"] for r in self._q("PRAGMA table_info(worlds)")}:
            self._x("ALTER TABLE worlds ADD COLUMN gallery_at REAL")
```

  - Replace `set_gallery` / `unset_gallery` and add `gallery_list`:

```python
    def set_gallery(self, wid: str, title: str, description: str, now: float | None = None) -> None:
        """Adds or replaces the entry; a replaced entry keeps its place, a re-added one goes to the end."""
        self._x("UPDATE worlds SET gallery = 1, title = ?, description = ?, gallery_at = COALESCE(gallery_at, ?) WHERE id = ?",
                (title, description, time.time() if now is None else now, wid))

    def unset_gallery(self, wid: str, now: float | None = None) -> None:
        """Back to normal retention with a fresh 30 days: the world may have gone unplayed for longer while pinned."""
        self._x("UPDATE worlds SET gallery = 0, gallery_at = NULL, last_played = ? WHERE id = ?",
                (time.time() if now is None else now, wid))

    def gallery_list(self, limit: int = GALLERY_MAX) -> list[dict]:
        return self._q("SELECT id, title, description FROM worlds WHERE gallery = 1 AND state = 'ready' "
                       "ORDER BY gallery_at, id LIMIT ?", (limit,))
```

- [ ] **Step 4:** the four tests pass; the whole service suite is green. Commit `feat(service): gallery order, public list query and fresh retention on un-pinning (#170)`.

---

### Task 2: `GET /api/gallery` and clean gallery text (TDD)

**Files:** modify `service/rhyflitzer_api/app.py` (anchors: the handler `gallery`, the list `ROUTES`, the list `ADMIN_ROUTES`), `service/tests/test_app_worlds.py` (it has the `client` / `admin` fixtures, `WID`, `ORIGIN`, `add_ready`).

**Interfaces:** `clean_text(value, limit) -> str`; `gallery_index(request)` (a plain `def` handler: it reads SQLite, so Starlette runs it in the threadpool, like `get_job`); routes `GET /api/gallery` in `ROUTES` **and** in `ADMIN_ROUTES`.

- [ ] **Step 1: Write the failing tests** — append to `service/tests/test_app_worlds.py`:

```python
def test_the_gallery_is_public_ordered_cacheable_and_also_on_the_admin_listener(client, admin, store, settings):
    for n in (1, 2):
        add_ready(store, settings, f"{n:012x}")
    auth = {"Authorization": "Bearer s3cret"}
    assert client.get("/api/gallery").json() == []
    admin.put(f"/api/admin/gallery/{2:012x}", json={"title": "Erste", "description": "d"}, headers=auth)
    admin.put(f"/api/admin/gallery/{1:012x}", json={"title": "Zweite"}, headers=auth)
    r = client.get("/api/gallery", headers=ORIGIN)
    assert r.json() == [{"id": f"{2:012x}", "title": "Erste", "description": "d"}, {"id": f"{1:012x}", "title": "Zweite", "description": ""}]
    assert r.headers["cache-control"] == "public, max-age=60" and r.headers["access-control-allow-origin"] == ORIGIN["Origin"]
    assert admin.get("/api/gallery").json() == r.json()                       # no token needed to read; the CLI's `list`
    admin.delete(f"/api/admin/gallery/{2:012x}", headers=auth)
    assert [e["title"] for e in client.get("/api/gallery").json()] == ["Zweite"]


def test_gallery_text_loses_control_characters_but_markup_stays_text(admin, store, settings):
    add_ready(store, settings, WID)
    r = admin.put(f"/api/admin/gallery/{WID}", json={"title": "  Rhy\u0000fl\u0007itzer <b>  ", "description": "a\u0085b"}, headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200 and r.json()["title"] == "Rhyflitzer <b>"
    assert (store.get(WID)["title"], store.get(WID)["description"]) == ("Rhyflitzer <b>", "ab")


def test_the_public_gallery_runs_off_the_event_loop(client, store, settings, monkeypatch):
    add_ready(store, settings, WID)
    real, seen = store.gallery_list, []
    monkeypatch.setattr(store, "gallery_list", lambda *a, **kw: seen.append(_off_loop()) or real(*a, **kw))
    assert client.get("/api/gallery").status_code == 200
    assert seen == [True]
```

  (`_off_loop` is the helper already defined in this file by #312, above `test_admin_gallery_runs_off_the_event_loop`; the new test goes below it.)

- [ ] **Step 2:** `cd service && .venv/bin/python -m pytest tests/test_app_worlds.py -q` fails (404 on `/api/gallery`).
- [ ] **Step 3: Implement** in `app.py`. Above `is_admin`:

```python
CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def clean_text(value, limit: int) -> str:
    """Gallery text is the owner's, shown by the game as text; control characters never belong in it."""
    return CONTROL.sub("", str(value)).strip()[:limit]
```

  In the handler `gallery`, use it: `title = clean_text(body.get("title", ""), 80)` and `await run_in_threadpool(store.set_gallery, wid, title, clean_text(body.get("description", ""), 300))` (replacing the two `str(...).strip()[:n]` expressions; keep the `await run_in_threadpool(…)` that #312 put around the store call, do not call `store.set_gallery` directly). Above `get_challenge`:

```python
def gallery_index(request: Request) -> JSONResponse:
    """The curated worlds, in the owner's order; public (it is what the start screen shows). A plain def: the SQLite read runs in the threadpool, not on the event loop (#296)."""
    return JSONResponse(request.app.state.store.gallery_list(), headers={"Cache-Control": "public, max-age=60"})
```

  Add `Route("/api/gallery", gallery_index, methods=["GET"])` to `ROUTES` (before the `/api/jobs` route) and to `ADMIN_ROUTES`, after the existing admin route, with the trailing comment `# so the CLI reads and writes through one host`. The CORS middleware already allows `GET` for `https://github.freaxnx01.ch`.
- [ ] **Step 4:** tests pass; whole service suite green (`test_the_public_app_has_no_admin_routes` and `test_the_admin_app_serves_nothing_but_admin` still pass: the admin app now serves one extra public GET, which `test_the_admin_app_serves_nothing_but_admin` does not touch). Commit `feat(service): public GET /api/gallery and control characters stripped from gallery text (#170)`.

---

### Task 3: `scripts/gallery.py` — the owner's CLI, in the image (TDD)

**Files:** create `scripts/gallery.py` (the repo has no `scripts/` directory yet), `service/tests/test_gallery_cli.py` (the service suite already runs from `service/`; its `conftest.py` is untouched); modify `service/Dockerfile`, `service/Dockerfile.dockerignore`, `service/tests/test_packaging.py`.

**Interfaces:** `python3 scripts/gallery.py list | add <id> <title> [<description>] | remove <id>`. One host for all three, env `RHYFLITZER_ADMIN_API`, default `http://127.0.0.1:8081` (the SSH tunnel to `rhyflitzer-admin`, never the public host); inside the container `http://127.0.0.1:8001`. Token only from env `RHYFLITZER_ADMIN_TOKEN`. Pure `build_request(host, token, action, world_id, title, description) -> (method, url, headers, body)` plus `send(method, url, headers, body) -> (status, text)` and `main(argv)`. This matches the `docker exec` one-liner already in `service/README.md` ("Admin (SSH only)").

- [ ] **Step 1: Write the failing tests** — `service/tests/test_gallery_cli.py`:

```python
"""#170: the owner's CLI (scripts/gallery.py): the requests it builds, and that the token never leaks."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import gallery as cli  # noqa: E402

ID = "0123456789ab"
HOST = "http://127.0.0.1:8081"


def test_add_builds_a_put_with_bearer_and_json():
    method, url, headers, body = cli.build_request(HOST, "t0k", "add", ID, "Titel", "Beschreibung")
    assert (method, url) == ("PUT", f"{HOST}/api/admin/gallery/{ID}")
    assert headers["Authorization"] == "Bearer t0k" and headers["Content-Type"] == "application/json"
    assert json.loads(body) == {"title": "Titel", "description": "Beschreibung"}


def test_remove_and_list():
    assert cli.build_request(HOST, "t", "remove", ID, None, None)[:2] == ("DELETE", f"{HOST}/api/admin/gallery/{ID}")
    method, url, headers, body = cli.build_request(HOST, None, "list", None, None, None)
    assert (method, url, body) == ("GET", f"{HOST}/api/gallery", None) and "Authorization" not in headers


@pytest.mark.parametrize("token, world_id", [("t", "../x"), ("t", "ABCDEF012345"), ("t", None), (None, ID), ("", ID)])
def test_a_bad_id_or_a_missing_token_exits_before_any_request(token, world_id):
    with pytest.raises(SystemExit):
        cli.build_request(HOST, token, "add", world_id, "T", "")


def test_main_sends_through_the_admin_host_and_never_prints_the_token(monkeypatch, capsys):
    monkeypatch.setenv("RHYFLITZER_ADMIN_TOKEN", "unit-test-token")
    monkeypatch.setenv("RHYFLITZER_ADMIN_API", "http://127.0.0.1:8001/")
    seen = []
    monkeypatch.setattr(cli, "send", lambda *call: seen.append(call) or (401, '{"error":"unauthorized"}'))
    with pytest.raises(SystemExit) as exit_info:
        cli.main(["add", ID, "T"])
    out = capsys.readouterr()
    assert exit_info.value.code == 1 and seen[0][1] == f"http://127.0.0.1:8001/api/admin/gallery/{ID}"
    assert "unit-test-token" not in out.out + out.err


def test_main_prints_a_good_answer_and_exits_zero(monkeypatch, capsys):
    monkeypatch.delenv("RHYFLITZER_ADMIN_TOKEN", raising=False)
    monkeypatch.setattr(cli, "send", lambda *call: (200, "[]"))
    cli.main(["list"])
    assert capsys.readouterr().out.strip() == "200 []"
```

  And in `service/tests/test_packaging.py` (imports `Path`; add `import re`):

```python
def test_the_image_carries_the_gallery_cli_and_the_readme_holds_no_token():
    assert "COPY scripts/gallery.py scripts/gallery.py" in (SERVICE / "Dockerfile").read_text()
    assert "!scripts/gallery.py" in (SERVICE / "Dockerfile.dockerignore").read_text().splitlines()
    readme = (SERVICE / "README.md").read_text()
    assert "scripts/gallery.py add" in readme and not re.search(r"Bearer [A-Za-z0-9]{12,}", readme)
```

- [ ] **Step 2:** `cd service && .venv/bin/python -m pytest tests/test_gallery_cli.py tests/test_packaging.py -q` fails (module missing, Dockerfile lines missing).
- [ ] **Step 3: Implement** `scripts/gallery.py` (stdlib only; mode `0644` is enough, the README runs it with `python`):

```python
#!/usr/bin/env python3
"""#170: the owner's gallery CLI. list | add <id> <title> [<description>] | remove <id>.

Everything goes through ONE host, RHYFLITZER_ADMIN_API (default http://127.0.0.1:8081, the SSH tunnel to the
rhyflitzer-admin listener; inside that container http://127.0.0.1:8001). The bearer token is read only from the
environment (RHYFLITZER_ADMIN_TOKEN): there is no --token flag, because a flag lands in shell history and `ps`.
The equivalent call by hand:

    curl -X PUT -H "Authorization: Bearer $RHYFLITZER_ADMIN_TOKEN" -H 'Content-Type: application/json' \
         -d '{"title": "...", "description": "..."}' "$RHYFLITZER_ADMIN_API/api/admin/gallery/<id>"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_API = "http://127.0.0.1:8081"
ID = re.compile(r"[0-9a-f]{12}")
TIMEOUT = 15


def build_request(host: str, token: str | None, action: str, world_id: str | None, title: str | None,
                  description: str | None) -> tuple[str, str, dict, bytes | None]:
    """(method, url, headers, body); exits with a message for a bad id or a missing token, before any request."""
    if action == "list":
        return "GET", f"{host}/api/gallery", {}, None
    if not world_id or not ID.fullmatch(world_id):
        sys.exit("The world id is 12 lowercase hex characters, e.g. 0123456789ab.")
    if not token:
        sys.exit("Set RHYFLITZER_ADMIN_TOKEN in the environment (from Passbolt); there is no --token flag on purpose.")
    url, headers = f"{host}/api/admin/gallery/{world_id}", {"Authorization": f"Bearer {token}"}
    if action == "remove":
        return "DELETE", url, headers, None
    body = json.dumps({"title": title, "description": description or ""}).encode("utf-8")
    return "PUT", url, {**headers, "Content-Type": "application/json"}, body


def send(method: str, url: str, headers: dict, body: bytes | None) -> tuple[int, str]:
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as reply:
            return reply.status, reply.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def parse(argv) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Curate the region editor's world gallery")
    sub = ap.add_subparsers(dest="action", required=True)
    sub.add_parser("list")
    add = sub.add_parser("add")
    add.add_argument("world_id")
    add.add_argument("title")
    add.add_argument("description", nargs="?", default="")
    sub.add_parser("remove").add_argument("world_id")
    return ap.parse_args(argv)


def main(argv=None) -> None:
    a = parse(argv)
    host = os.environ.get("RHYFLITZER_ADMIN_API", DEFAULT_API).rstrip("/")
    method, url, headers, body = build_request(host, os.environ.get("RHYFLITZER_ADMIN_TOKEN"), a.action,
                                               getattr(a, "world_id", None), getattr(a, "title", None), getattr(a, "description", None))
    status, text = send(method, url, headers, body)
    print(f"{status} {text}")
    if status >= 400:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

  `service/Dockerfile`: after `COPY service/rhyflitzer_api/ service/rhyflitzer_api/` add `COPY scripts/gallery.py scripts/gallery.py`. `service/Dockerfile.dockerignore`: after `!service/rhyflitzer_api/**` add `!scripts/gallery.py`. (The README step that mentions the CLI is Task 8.)
- [ ] **Step 4:** the CLI and packaging tests pass (the README already contains `scripts/gallery.py add`, written by #168); the whole service suite is green. Commit `feat(gallery): owner CLI for listing, adding and removing gallery worlds (#170)`.

---

### Task 4: `gallery.js` — validation and loader (TDD)

**Files:** create `prototype/gallery.js`, `prototype/tests/gallery.test.mjs`.

**Interfaces:** `galleryUrl(host) -> string`; `cleanEntry(raw) -> {id, title, description} | null`; `parseGallery(json) -> entries[]` (at most 50, no duplicate ids, invalid entries dropped); `loadGallery({host, fetch}) -> Promise<entries[]>` (never throws; `[]` on any failure; deliberately no abort timer, see Task 6). `isWorldId` is imported from `./worlds.js` (#167); the host comes from `worldHost(location.href)` in `index.html`, so `?worldhost=` works for tests.

- [ ] **Step 1: Write the failing test** `prototype/tests/gallery.test.mjs`:

```js
// #170: the gallery list from the API. Pure: fetch is injected, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryUrl, cleanEntry, parseGallery, loadGallery } from '../gallery.js';

const ID = '0123456789ab';
const ok = (body) => async () => ({ ok: true, json: async () => body });

test('galleryUrl joins host and path', () => {
  assert.equal(galleryUrl('https://h.example'), 'https://h.example/api/gallery');
});

test('cleanEntry keeps good entries and strips control characters', () => {
  assert.deepEqual(cleanEntry({ id: ID, title: ' Rhein\u0000felden ', description: 'Altstadt' }), { id: ID, title: 'Rheinfelden', description: 'Altstadt' });
  assert.equal(cleanEntry({ id: ID, title: 'T' }).description, '');
});

test('cleanEntry refuses bad ids, empty or over-long titles and non-strings', () => {
  for (const bad of [null, 5, 'x', {}, { id: 'XYZ', title: 'T' }, { id: '../etc/passwd', title: 'T' }, { id: ID, title: '' }, { id: ID, title: 'x'.repeat(81) },
    { id: ID, title: 'T', description: 'x'.repeat(301) }, { id: ID, title: 7 }, { id: ID, title: 'T', description: {} }]) assert.equal(cleanEntry(bad), null, JSON.stringify(bad));
});

test('parseGallery: arrays only, drops bad entries and duplicates, caps at 50', () => {
  assert.deepEqual(parseGallery({ not: 'an array' }), []);
  assert.deepEqual(parseGallery('x'), []);
  const many = Array.from({ length: 60 }, (_, i) => ({ id: i.toString(16).padStart(12, '0'), title: `W${i}` }));
  assert.equal(parseGallery(many).length, 50);
  const two = parseGallery([{ id: ID, title: 'A' }, { id: ID, title: 'B' }, { id: 'bad', title: 'C' }]);
  assert.deepEqual(two.map((e) => e.title), ['A']);
});

test('markup in a title is kept as plain text (the renderer uses textContent)', () => {
  assert.equal(cleanEntry({ id: ID, title: '<img src=x onerror=alert(1)>' }).title, '<img src=x onerror=alert(1)>');
});

test('loadGallery: good list, non-ok, network error and bad JSON all end in a list, never a throw', async () => {
  assert.equal((await loadGallery({ host: 'https://h', fetch: ok([{ id: ID, title: 'A' }]) })).length, 1);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => ({ ok: false, status: 500 }) }), []);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => { throw new Error('offline'); } }), []);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) }), []);
});
```

- [ ] **Step 2:** `node --test prototype/tests/gallery.test.mjs` fails (module missing).
- [ ] **Step 3: Implement** `prototype/gallery.js`:

```js
// gallery.js (#170): the curated world list from the API. Pure (fetch injected, no DOM). The server is trusted for
// availability, not for rendering: every field is re-checked here, and the page shows it with textContent only.
import { isWorldId } from './worlds.js';

const MAX_ENTRIES = 50, MAX_TITLE = 80, MAX_DESC = 300;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

export const galleryUrl = (host) => `${host}/api/gallery`;

const text = (v) => (typeof v === 'string' ? v.replace(CONTROL, '').trim() : null);

export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object' || !isWorldId(raw.id)) return null;
  const title = text(raw.title), description = raw.description === undefined ? '' : text(raw.description);
  if (title === null || description === null) return null;
  if (title.length < 1 || title.length > MAX_TITLE || description.length > MAX_DESC) return null;
  return { id: raw.id, title, description };
}

export function parseGallery(json) {
  if (!Array.isArray(json)) return [];
  const seen = new Set(), out = [];
  for (const raw of json) {
    const e = cleanEntry(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length === MAX_ENTRIES) break;
  }
  return out;
}

export async function loadGallery({ host, fetch: fetchFn }) {
  try {
    const res = await fetchFn(galleryUrl(host));
    return res.ok ? parseGallery(await res.json()) : [];
  } catch (e) {
    return [];
  }
}
```

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` all green (existing expectations unchanged). Commit `feat(gallery): validate and load the gallery list (#170)`.

---

### Task 5: strings (en/de)

**Files:** modify `prototype/strings.js` (anchors: the `regionWorld:` line in the `en` table and in the `de` table).

- [ ] **Step 1:** add `worldsRow: 'Worlds',` directly after the `regionWorld:` line in `en`, and `worldsRow: 'Welten',` after the `regionWorld:` line in `de`. (`prototype/tests/strings.test.mjs` already enforces equal keys, equal arity and no `ß`.) Gallery titles and descriptions are the owner's text and are not in the table.
- [ ] **Step 2:** `node --test prototype/tests/strings.test.mjs` passes. Commit `feat(gallery): Worlds row label in English and German (#170)`.

---

### Task 6: `index.html` — the Worlds row

**Files:** modify `prototype/index.html`. Anchors, not line numbers: the CSS rule `.regionrow .btn[aria-pressed="true"]`; the `<div class="regionrow">` block that contains `id="region-world"`; the `import … from './worlds.js'` line; the last line of the game's module script, `requestAnimationFrame(loop);` (just before its closing `</script>`). The row reuses the existing `.regionrow` look and `aria-pressed` outline.

- [ ] **Step 1: CSS** (own lines, no trailing `//`), right after the `.regionrow .btn[aria-pressed="true"]` rule: `.regionrow[hidden]{display:none}` (the game has no global `[hidden]` rule, and `.regionrow` sets `display:flex`), and `#worldsdesc{flex-basis:100%;font-size:14px;color:var(--steel-l);min-height:1.2em;margin:0}`.
- [ ] **Step 2: markup** right after the closing `</div>` of the Region row:

```html
    <div id="worldsrow" class="regionrow" hidden>
      <span id="worldslabel" data-i18n="worldsRow">Worlds</span>
      <span id="worldsbtns" style="display:contents"></span>
      <p id="worldsdesc" role="status"></p>
    </div>
```

  `applyStaticStrings()` already translates every `data-i18n` element, so the label follows the language toggle.
- [ ] **Step 3: wiring.** Add `import { loadGallery } from './gallery.js';` next to the `./worlds.js` import. Define the function (multi-line) **after** `requestAnimationFrame(loop);` and call `showGallery();` on the line after the function, so the game is already running when the request goes out. There is deliberately **no abort timer** on the request: a timer cannot tell "the API is slow" from "the page is busy" (the first frames of the game block the main thread for seconds, longer on a software renderer), and an earlier version with a 5 s timeout aborted a request whose answer had already arrived (found by running Task 7's test against it). The call is not awaited, so a slow or hung request costs the player nothing: the row just does not appear. `worldHost`, `worldSearch` (which already drops `region` and replaces `world`) and `GEN` / `WORLD_ID` exist by then:

```js
// #170: the curated worlds from the API. Not awaited: play never waits for the gallery; any failure leaves the row hidden.
async function showGallery() {
  const worlds = await loadGallery({ host: worldHost(location.href), fetch: (u, o) => fetch(u, o) });
  window.__mm.gallery = worlds.map((w) => w.id);
  if (!worlds.length) return;
  const box = $('worldsbtns'), desc = $('worldsdesc'), current = GEN ? WORLD_ID : null;
  for (const w of worlds) {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.type = 'button';
    b.textContent = w.title;
    b.dataset.worldId = w.id;
    b.setAttribute('aria-pressed', String(w.id === current));
    const say = () => { desc.textContent = w.description; };
    b.onmouseenter = say;
    b.onfocus = say;
    b.onmouseleave = () => { desc.textContent = ''; };
    b.onblur = b.onmouseleave;
    b.onclick = () => { if (w.id !== current) location.search = worldSearch(location.search, w.id); };
    box.appendChild(b);
  }
  $('worldsrow').hidden = false;
}
```

  Rules: no `innerHTML` anywhere in it; titles and descriptions only through `textContent`; do not change the Hochrhein / Ehrendingen buttons; `window.__mm.gallery` is set even for an empty list so a test can tell "settled" from "still loading".
- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` green. Commit `feat(gallery): Worlds row on the start screen (#170)`.

---

### Task 7: Playwright against a stubbed gallery call

**Files:** create `prototype/tests/test_gallery.py`.

The gallery call is stubbed with `page.route("**/api/gallery", …)` (CORS header on the answer); the `world_host` fixture from `conftest.py` only provides a localhost URL for `?worldhost=`, so nothing can reach the real API. Boot like `test_world.py::boot` (viewport 480x270, terrain `.mmh` routes fulfilled with 404; copy the launch args, do not import across test files).

- [ ] **Step 1: Commit and push the branch first** (a run that dies mid-check must leave the work recoverable): `git push -u origin feature/170-gallery`.
- [ ] **Step 2: Write the tests:**

```python
"""#170: the Worlds row on the start screen against a stubbed /api/gallery. Slow (Playwright): run in the foreground."""
import json
import re

import pytest
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
T = 240000
ID1, ID2 = "0123456789ab", "ba9876543210"
CORS = {"Access-Control-Allow-Origin": "*"}
TWO = [{"id": ID1, "title": "Rheinfelden", "description": "Old town and the Rhine"}, {"id": ID2, "title": "Lägern", "description": "Ridge road"}]


def boot(p, server, host, status, body):
    """The start screen with /api/gallery answered by (status, body); returns once the page has settled on the answer."""
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": 480, "height": 270})
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/api/gallery", lambda r: r.fulfill(status=status, headers=CORS, content_type="application/json", body=body))
    page.goto(f"{server}/prototype/index.html?worldhost={host}")
    page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=T)
    page.wait_for_function("() => Array.isArray(window.__mm.gallery)", timeout=T)
    return b, page


def test_gallery_row_lists_worlds_and_opens_one(server, world_host):
    url, _ = world_host
    with sync_playwright() as p:
        b, page = boot(p, server, url, 200, json.dumps(TWO))
        assert page.is_visible("#worldsrow") and page.evaluate("() => window.__mm.gallery") == [ID1, ID2]
        assert page.evaluate("() => [...document.querySelectorAll('#worldsbtns button')].map(b => b.textContent)") == ["Rheinfelden", "Lägern"]
        assert page.evaluate("() => document.querySelector('#worldslabel').textContent") == "Worlds"
        page.hover("#worldsbtns button >> nth=0")
        assert page.text_content("#worldsdesc") == "Old town and the Rhine"
        page.route(re.compile(rf".*/prototype/index\.html\?.*world={ID1}"), lambda r: r.fulfill(status=200, content_type="text/html", body="<title>stub</title>"))
        page.click("#worldsbtns button >> nth=0", no_wait_after=True)
        page.wait_for_url(re.compile(rf"[?&]world={ID1}"), wait_until="commit", timeout=T)
        b.close()


def test_gallery_text_is_text(server, world_host):
    url, _ = world_host
    title, desc = "<img src=x onerror=window.__pwn=1>", "<script>window.__pwn=1</script>"
    with sync_playwright() as p:
        b, page = boot(p, server, url, 200, json.dumps([{"id": ID1, "title": title, "description": desc}]))
        assert page.text_content("#worldsbtns button") == title
        page.hover("#worldsbtns button")
        assert page.text_content("#worldsdesc") == desc
        assert page.evaluate("() => window.__pwn") is None and page.locator("#worldsbtns img").count() == 0
        b.close()


@pytest.mark.parametrize("status, body", [(200, "[]"), (500, "{}"), (200, "not json"), (200, '{"a": 1}')])
def test_empty_or_broken_gallery_changes_nothing(server, world_host, status, body):
    url, _ = world_host
    with sync_playwright() as p:
        b, page = boot(p, server, url, status, body)
        assert not page.is_visible("#worldsrow") and page.evaluate("() => window.__mm.gallery") == []
        assert page.get_attribute("#region-hochrhein", "aria-pressed") == "true" and page.is_visible("#startbtn")
        b.close()
```

- [ ] **Step 3: Run, foreground, capped (about 4 minutes for the six tests):** `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_gallery.py -x` (set a generous Bash `timeout` and block; never `run_in_background`). Exit 137: stop and report. Fix the implementation, never the tests; after three failed attempts stop and report. Do not run other Playwright files: the empty-gallery test already pins that the Region row and the start screen are unchanged.
- [ ] **Step 4:** Commit `test(gallery): Playwright coverage for the Worlds row against a stubbed API (#170)`.

---

### Task 8: docs, CHANGELOG, go-live note

**Files:** modify `CHANGELOG.md`, `service/README.md`.

- [ ] **Step 1:** `CHANGELOG.md`, first bullet under `### Added` of `[Unreleased]`, English, player voice, timestamped (`TZ=Europe/Zurich date '+%F %H:%M'`):
  `` - `YYYY-MM-DD HH:MM` A **Worlds** row on the start screen lists hand-picked worlds built with the region editor: hover one for its description, click it and you drive there. Without any picked worlds, or offline, the row is not shown. ``
- [ ] **Step 2: `service/README.md`.** In the section "Admin (SSH only)" replace the sentence "(the CLI is #170's; the token is read inside the container and never printed)" with "(the CLI is `scripts/gallery.py`, shipped in the image; the token is read inside the container and never printed)" and add, below the code block, a short "Curating the gallery" paragraph: `list` needs no token; `add <id> "Title" "Description"` adds or replaces (a replaced entry keeps its place, a world removed and added again goes last); `remove <id>` returns the world to normal retention with a fresh 30 days; at most 50 entries are shown; a world must be `ready`. From a laptop: `ssh -N -L 8081:127.0.0.1:8081 ionos1`, then `RHYFLITZER_ADMIN_TOKEN=… python3 scripts/gallery.py add …` with the token taken from Passbolt into the environment (never as an argument). Append operator checklist item `[ ] **9.** Go-live of #170 (the maintainer only; this is the one place the admin token is used): build the worlds you want to show through the editor (#169), then add each with the \`docker exec\` one-liner above; check \`https://rhyflitzer-api.freaxnx01.ch/api/gallery\` lists them and the start screen shows the Worlds row.` The README contains **no token value**: `git grep -n -i "bearer [a-z0-9]\{12,\}"` finds nothing.
- [ ] **Step 3:** run the three suites once: `node --test prototype/tests/*.test.mjs`; `cd service && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 .venv/bin/python -m pytest -q` (now including the packaging test from Task 3); the Playwright file already ran in Task 7. Commit `docs(gallery): changelog, CLI and go-live note (#170)`; push; open the PR `feat(ui): curated world gallery on the start screen (#170)` with `Closes #170`. The go-live step (admin token on ionos1, choosing and titling the first worlds) is the owner's; list it in the PR description as a numbered task list.
- [ ] **Step 4 (maintainer rule for this one file, not part of the PR):** after the merge, add a short playtest section to `test-todo.md` (Worlds row appears with a stub or real gallery, hover shows the description, click opens `?world=`, German label „Welten") as its own commit pushed straight to `main`.
