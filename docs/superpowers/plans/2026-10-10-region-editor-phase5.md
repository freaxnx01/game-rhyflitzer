# Region editor phase 5: curated world gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner curates a gallery of generated worlds with a bearer-token admin call or a small CLI; the start screen shows them as a "Worlds" row that opens `?world=<id>`; gallery worlds are never evicted (#170).

**Architecture:** Server side, one small module `gallery.py` in the phase 3 service (pure functions over SQLite, returning `(status, body)` so it is framework-neutral, plus an `is_pinned(id)` hook for retention) and `scripts/gallery.py` (stdlib CLI). Client side, one pure ES module `prototype/gallery.js` (validation + fetch with injected `fetch`) and a few wiring lines in `prototype/index.html` that build the row with `createElement` / `textContent`. Spec: `docs/superpowers/specs/2026-10-10-region-editor-phase5-design.md`.

**Tech Stack:** vanilla JS ES modules, `node --test`, Playwright (Python, pytest) against a local stub API, Python 3 stdlib + pytest for the service.

## Global Constraints

- **Never put a `//` comment in the middle of a one-line statement in `prototype/index.html`** (much of the file is one statement per line; a trailing `//` swallows the rest of the line). Use `/* ... */` or a comment on its own line. New code in `index.html` is multi-line.
- Buildless game: no `package.json`, no framework, no vendored library.
- All gallery text is untrusted when it reaches the page: `textContent` / `setAttribute('title', …)` only, never `innerHTML`, never `toastHtml()` (#176). The id is checked against `^[0-9a-f]{12}$` before it builds a URL.
- The admin token is never in the repo, the game, a URL, a command line, a log line or a test fixture value that looks real. The service reads `GALLERY_ADMIN_TOKEN` from its environment; the CLI reads `RHYFLITZER_ADMIN_TOKEN` from its environment.
- Do not change Hochrhein / Ehrendingen behaviour or any `?world=` behaviour from #167.
- Tests: node via `node --test prototype/tests/*.test.mjs`. Playwright is slow: foreground only (never `run_in_background`), frame-light (viewport 480x270, `wait_for_function`, no long sleeps), only the affected file, always under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest <file> -x`. Not the full ~2 h suite. Exit 137 = cap hit: stop and report, never raise the cap. No real-data builds, no real API calls.
- Commit and push the branch before the Playwright run (Task 6). Conventional Commits, explicit `git add <paths>`.
- CHANGELOG: English, player-facing, by hand under `[Unreleased]`; never `git cliff -o`.

## Review Focus

- A title like `<img src=x onerror=window.__pwn=1>` shows as text and never runs (`test_gallery.py::test_gallery_text_is_text`).
- The token never appears in any committed file or log output; wrong/missing token gives 401 without detail (`test_gallery_api.py`).
- Gallery worlds survive both the nightly cleanup and disk eviction (`is_pinned`).
- An unreachable, empty or garbage gallery leaves the start screen exactly as before.

---

### Task 1: `gallery.py` in the phase 3 service (TDD)

**Files:** create `<service dir>/gallery.py`, `<service dir>/tests/test_gallery_api.py`; modify the service's router, cleanup and eviction code to call it.

**Interfaces:** `init(conn)`; `list_gallery(conn) -> (200, [{id,title,description}])`; `put_entry(conn, token_env, auth_header, world_id, body_bytes, world_ready) -> (status, body)`; `delete_entry(conn, token_env, auth_header, world_id) -> (status, body)`; `is_pinned(conn, world_id) -> bool`. `token_env` is the configured token or `None`/`""`; `world_ready(world_id) -> bool` is injected (the service's own "exists and status is ready" check).

- [ ] **Step 0: Preconditions.** `git fetch origin && git checkout -b feature/170-gallery origin/main`. Read #168's plan (`docs/superpowers/plans/*region-editor-phase3*` on main) and use its service directory, framework and test layout for `<service dir>`; adapt only the thin glue in Step 4. If #168's plan or code is not on `main`, or #167's `worlds.js` is missing, stop and report (this phase must not ship before them). `test -f prototype/escape.js || echo "#176 NOT MERGED"`: stop and report if it is not merged.
- [ ] **Step 1: Write the failing test** `<service dir>/tests/test_gallery_api.py`:

```python
"""#170: the curated gallery. SQLite in memory; the build and the filesystem are not involved."""
import json
import sqlite3

import pytest

import gallery

TOKEN = "unit-test-token"   # a throwaway value, not a real secret
AUTH = f"Bearer {TOKEN}"
ID = "0123456789ab"


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    gallery.init(c)
    return c


def body(**kw):
    return json.dumps({"title": "Rheinfelden", "description": "Old town and the Rhine"} | kw).encode()


def put(conn, **kw):
    args = dict(token_env=TOKEN, auth_header=AUTH, world_id=ID, body_bytes=body(), world_ready=lambda i: True)
    return gallery.put_entry(conn, **(args | kw))


def test_put_then_list_returns_the_entry(conn):
    assert put(conn)[0] == 200
    assert gallery.list_gallery(conn) == (200, [{"id": ID, "title": "Rheinfelden", "description": "Old town and the Rhine"}])
    assert gallery.is_pinned(conn, ID) is True


def test_wrong_missing_or_unconfigured_token(conn):
    assert put(conn, auth_header="Bearer nope")[0] == 401
    assert put(conn, auth_header=None)[0] == 401
    assert put(conn, auth_header="Basic " + TOKEN)[0] == 401
    assert put(conn, token_env=None)[0] == 503
    assert put(conn, token_env="")[0] == 503
    assert gallery.list_gallery(conn) == (200, [])
    for status_body in (put(conn, auth_header="Bearer nope"), put(conn, token_env=None)):
        assert TOKEN not in json.dumps(status_body[1])


def test_rejects_bad_ids_bodies_and_unknown_worlds(conn):
    for bad in ("../etc/passwd", "UPPERCASE123", "short", "0123456789abc"):
        assert put(conn, world_id=bad)[0] == 400, bad
    assert put(conn, body_bytes=b"not json")[0] == 400
    assert put(conn, body_bytes=body(title=""))[0] == 400
    assert put(conn, body_bytes=body(title="x" * 81))[0] == 400
    assert put(conn, body_bytes=body(description="x" * 301))[0] == 400
    assert put(conn, body_bytes=b"x" * 5000)[0] == 400
    assert put(conn, world_ready=lambda i: False)[0] == 404
    assert gallery.list_gallery(conn) == (200, [])


def test_control_characters_are_stripped_and_markup_is_kept_as_text(conn):
    put(conn, body_bytes=body(title="  Rhy\u0000fl\u0007itzer <b>  "))
    assert gallery.list_gallery(conn)[1][0]["title"] == "Rhyflitzer <b>"


def test_replace_keeps_position_and_order_is_insertion_order(conn):
    other = "ba9876543210"
    put(conn)
    put(conn, world_id=other, body_bytes=body(title="Second"))
    put(conn, body_bytes=body(title="First again"))
    assert [e["title"] for e in gallery.list_gallery(conn)[1]] == ["First again", "Second"]


def test_delete_unpins_and_needs_the_token(conn):
    put(conn)
    assert gallery.delete_entry(conn, token_env=TOKEN, auth_header="Bearer nope", world_id=ID)[0] == 401
    assert gallery.is_pinned(conn, ID) is True
    assert gallery.delete_entry(conn, token_env=TOKEN, auth_header=AUTH, world_id=ID)[0] == 200
    assert gallery.is_pinned(conn, ID) is False
    assert gallery.delete_entry(conn, token_env=TOKEN, auth_header=AUTH, world_id=ID)[0] == 404


def test_list_is_capped_at_50(conn):
    for i in range(60):
        put(conn, world_id=f"{i:012x}", body_bytes=body(title=f"W{i}"))
    assert len(gallery.list_gallery(conn)[1]) == 50
```

- [ ] **Step 2:** run the service's pytest on this file; it fails (module missing).
- [ ] **Step 3: Implement** `<service dir>/gallery.py`:

```python
"""gallery.py (#170): the curated world gallery. Framework-neutral: functions return (status, body)."""
import hmac
import json
import logging
import re
import time

log = logging.getLogger("gallery")
ID_RE = re.compile(r"^[0-9a-f]{12}$")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
MAX_BODY, MAX_TITLE, MAX_DESC, MAX_LIST = 4096, 80, 300, 50


def init(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS gallery (id TEXT PRIMARY KEY, title TEXT NOT NULL, "
                 "description TEXT NOT NULL, position INTEGER NOT NULL, added_at REAL NOT NULL)")
    conn.commit()


def _auth_error(token_env, auth_header):
    if not token_env:
        log.error("Gallery admin call refused: GALLERY_ADMIN_TOKEN is not configured.")
        return 503, {"error": "admin disabled"}
    prefix = "Bearer "
    given = auth_header[len(prefix):] if isinstance(auth_header, str) and auth_header.startswith(prefix) else ""
    if not hmac.compare_digest(given.encode(), token_env.encode()):
        log.warning("Gallery admin call refused: missing or wrong bearer token.")
        return 401, {"error": "unauthorized"}
    return None


def _clean(text):
    return CONTROL_RE.sub("", text).strip()


def _parse(body_bytes):
    if len(body_bytes) > MAX_BODY:
        return None, "body too large"
    try:
        data = json.loads(body_bytes)
    except ValueError:
        return None, "body is not JSON"
    if not isinstance(data, dict) or not all(isinstance(data.get(k), str) for k in ("title", "description")):
        return None, "title and description must be strings"
    title, desc = _clean(data["title"]), _clean(data["description"])
    if not 1 <= len(title) <= MAX_TITLE:
        return None, f"title must be 1-{MAX_TITLE} characters"
    if len(desc) > MAX_DESC:
        return None, f"description must be at most {MAX_DESC} characters"
    return (title, desc), None


def list_gallery(conn):
    rows = conn.execute("SELECT id, title, description FROM gallery ORDER BY position LIMIT ?", (MAX_LIST,)).fetchall()
    return 200, [{"id": i, "title": t, "description": d} for i, t, d in rows]


def is_pinned(conn, world_id):
    return conn.execute("SELECT 1 FROM gallery WHERE id = ?", (world_id,)).fetchone() is not None


def put_entry(conn, token_env, auth_header, world_id, body_bytes, world_ready):
    denied = _auth_error(token_env, auth_header)
    if denied:
        return denied
    if not ID_RE.match(world_id or ""):
        return 400, {"error": "bad world id"}
    parsed, why = _parse(body_bytes)
    if why:
        return 400, {"error": why}
    if not world_ready(world_id):
        return 404, {"error": "no such ready world"}
    log.info("Adding world %s to the gallery.", world_id)
    nxt = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM gallery").fetchone()[0]
    conn.execute("INSERT INTO gallery (id, title, description, position, added_at) VALUES (?, ?, ?, ?, ?) "
                 "ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description",
                 (world_id, parsed[0], parsed[1], nxt, time.time()))
    conn.commit()
    log.info("World %s is in the gallery.", world_id)
    return 200, {"id": world_id}


def delete_entry(conn, token_env, auth_header, world_id):
    denied = _auth_error(token_env, auth_header)
    if denied:
        return denied
    if not ID_RE.match(world_id or ""):
        return 400, {"error": "bad world id"}
    log.info("Removing world %s from the gallery.", world_id)
    gone = conn.execute("DELETE FROM gallery WHERE id = ?", (world_id,)).rowcount
    conn.commit()
    return (200, {"id": world_id}) if gone else (404, {"error": "not in the gallery"})
```

- [ ] **Step 4: Glue (the only framework-specific part).** Register the three routes in the service's router (`GET /api/gallery` public with `Cache-Control: public, max-age=60` and the same CORS as `/worlds/`; `PUT` / `DELETE /api/admin/gallery/<id>` reading `Authorization` and the raw body; token from `os.environ.get("GALLERY_ADMIN_TOKEN")`; `world_ready` from the service's existing world-status lookup; admin routes need no CORS at all). Call `gallery.init(conn)` where the service creates its tables. In the retention code, the nightly cleanup and the disk eviction, skip any world for which `gallery.is_pinned(conn, id)` is true; on `put_entry` success also set `pinned: true` in that world's `meta.json` through the service's existing meta writer (and false on delete, with `lastPlayed` = now). Add a glue test next to the service's other tests: the cleanup keeps a pinned expired world and deletes an unpinned one (use the service's existing retention test fixtures).
- [ ] **Step 5:** run the service's whole pytest suite: green. If a test fails, fix the implementation, never the test; after three failed attempts stop and report. Commit `feat(gallery): curated gallery endpoints and pinned retention (#170)`.

---

### Task 2: `scripts/gallery.py` — the owner's CLI (TDD)

**Files:** create `scripts/gallery.py`, `scripts/tests/test_gallery_cli.py` (or the service's test dir if the repo already has one for scripts; check with `git ls-files | grep -i test`).

**Interfaces:** `python3 scripts/gallery.py list|add <id> <title> [<description>]|remove <id>`. Host: env `RHYFLITZER_API`, default `https://rhyflitzer-api.freaxnx01.ch` (the same placeholder as `worlds.js`; keep both in step with #168's final name). Token only from env `RHYFLITZER_ADMIN_TOKEN`; no `--token` flag exists (a flag would land in shell history and `ps`). Pure function `build_request(host, token, action, world_id, title, description) -> (method, url, headers, body)` plus a thin `main(argv)` using `urllib.request` through `send(method, url, headers, body) -> (status, text)`.

- [ ] **Step 1: Write the failing test:**

```python
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
import gallery as cli

ID = "0123456789ab"


def test_add_builds_a_put_with_bearer_and_json():
    method, url, headers, body = cli.build_request("https://h.example", "t0k", "add", ID, "Titel", "Beschreibung")
    assert (method, url) == ("PUT", f"https://h.example/api/admin/gallery/{ID}")
    assert headers["Authorization"] == "Bearer t0k"
    assert json.loads(body) == {"title": "Titel", "description": "Beschreibung"}


def test_remove_and_list():
    assert cli.build_request("https://h.example", "t", "remove", ID, None, None)[:2] == ("DELETE", f"https://h.example/api/admin/gallery/{ID}")
    method, url, headers, body = cli.build_request("https://h.example", None, "list", None, None, None)
    assert (method, url, body) == ("GET", "https://h.example/api/gallery", None) and "Authorization" not in headers


def test_bad_id_and_missing_token_are_refused_before_any_request():
    with pytest.raises(SystemExit):
        cli.build_request("https://h.example", "t", "add", "../x", "T", "")
    with pytest.raises(SystemExit):
        cli.build_request("https://h.example", None, "add", ID, "T", "")


def test_main_never_prints_the_token(monkeypatch, capsys):
    monkeypatch.setenv("RHYFLITZER_ADMIN_TOKEN", "super-secret-value")
    monkeypatch.setattr(cli, "send", lambda *a: (401, '{"error":"unauthorized"}'))
    with pytest.raises(SystemExit):
        cli.main(["add", ID, "T"])
    out = capsys.readouterr()
    assert "super-secret-value" not in out.out + out.err
```

- [ ] **Step 2:** `python3 -m pytest scripts/tests/test_gallery_cli.py -x` fails (module missing).
- [ ] **Step 3: Implement** `scripts/gallery.py` (stdlib only; `argparse`; `send` wraps `urllib.request.urlopen` with a 15 s timeout and returns HTTPError statuses instead of raising; `main(argv)` prints the status and response text, exits non-zero on status >= 400, and prints a one-line hint when the env var is missing). `build_request` validates the id with `^[0-9a-f]{12}$` and exits with a message for a bad id or a missing token on `add` / `remove`. The module docstring shows the equivalent `curl` call using `"$RHYFLITZER_ADMIN_TOKEN"` from the environment (no literal token).
- [ ] **Step 4:** tests pass. Commit `feat(gallery): owner CLI for adding and removing gallery worlds (#170)`.

---

### Task 3: `gallery.js` — validation and loader (TDD)

**Files:** create `prototype/gallery.js`, `prototype/tests/gallery.test.mjs`.

**Interfaces:** `galleryUrl(host) -> string`; `cleanEntry(raw) -> {id, title, description} | null`; `parseGallery(json) -> entries[]` (at most 50, no duplicate ids, invalid entries dropped); `loadGallery({host, fetch, timeoutMs = 5000}) -> Promise<entries[]>` (never throws; `[]` on any failure). `isWorldId` is imported from `./worlds.js` (#167).

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

test('loadGallery: good list, non-ok, network error, bad JSON, timeout all end in a list, never a throw', async () => {
  assert.equal((await loadGallery({ host: 'https://h', fetch: ok([{ id: ID, title: 'A' }]) })).length, 1);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => ({ ok: false, status: 500 }) }), []);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => { throw new Error('offline'); } }), []);
  assert.deepEqual(await loadGallery({ host: 'https://h', fetch: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) }), []);
  assert.deepEqual(await loadGallery({ host: 'https://h', timeoutMs: 20, fetch: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))) }), []);
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

export async function loadGallery({ host, fetch: fetchFn, timeoutMs = 5000 }) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(galleryUrl(host), { signal: ctl.signal });
    return res.ok ? parseGallery(await res.json()) : [];
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` all green (existing expectations unchanged). Commit `feat(gallery): validate and load the gallery list (#170)`.

---

### Task 4: strings (en/de)

**Files:** modify `prototype/strings.js`.

- [ ] **Step 1:** add to `en` (next to `region`): `worldsRow: 'Worlds'`; to `de`: `worldsRow: 'Welten'`. (The existing `strings.test.mjs` already enforces equal keys, arity, no `ß`, no lower-case `du`.) Gallery titles and descriptions are the owner's text and are not in the table.
- [ ] **Step 2:** `node --test prototype/tests/strings.test.mjs` passes. Commit `feat(gallery): Worlds row label in English and German (#170)`.

---

### Task 5: `index.html` — the Worlds row

**Files:** modify `prototype/index.html` (CSS next to `.regionrow` ~89; markup after the `.regionrow` div ~268-272; wiring near the region-button loop ~1855).

- [ ] **Step 1: CSS** (own lines, no trailing `//`): `.worldsrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:10px 0}`, `.worldsrow .btn[aria-pressed="true"]{outline:3px solid var(--sun)}`, `#worldsdesc{flex-basis:100%;font-size:14px;color:var(--steel-l);min-height:1.2em;margin:0}`.
- [ ] **Step 2: markup** after the region row:

```html
<div id="worldsrow" class="worldsrow" hidden>
  <span id="worldslabel" data-i18n="worldsRow">Worlds</span>
  <span id="worldsbtns" style="display:contents"></span>
  <p id="worldsdesc" role="status"></p>
</div>
```

  Check how `data-i18n` is applied (`applyStaticStrings`, ~355) and keep the label there.
- [ ] **Step 3: wiring** (multi-line; import `{ loadGallery }` from `./gallery.js`; `worldHost` and `worldSearch` come from `./worlds.js`, #167):

```js
async function showGallery() {
  const worlds = await loadGallery({ host: worldHost(location.href), fetch: (u, o) => fetch(u, o) });
  if (!worlds.length) return;
  const box = $('worldsbtns'), desc = $('worldsdesc');
  for (const w of worlds) {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.type = 'button';
    b.textContent = w.title;
    b.dataset.worldId = w.id;
    b.setAttribute('aria-pressed', String(w.id === WORLD_ID));
    const say = () => { desc.textContent = w.description; };
    b.onmouseenter = say; b.onfocus = say;
    b.onmouseleave = () => { desc.textContent = ''; }; b.onblur = b.onmouseleave;
    b.onclick = () => { if (w.id !== WORLD_ID) location.search = worldSearch(location.search, w.id); };
    box.appendChild(b);
  }
  $('worldsrow').hidden = false;
}
showGallery();
```

  Rules: call it once, after the layout is built and the start screen exists, and do not `await` it (play must never wait for the API); no `innerHTML` anywhere in it; `worldSearch(search, id)` must drop `region` (verify against #167's `worlds.js`; if it does not, drop it here with `URLSearchParams`). Expose `window.__mm.gallery = worlds.map(w => w.id)` for the test. Do not change the Hochrhein / Ehrendingen buttons.
- [ ] **Step 4:** `node --test prototype/tests/*.test.mjs` green. Commit `feat(gallery): Worlds row on the start screen (#170)`.

---

### Task 6: Playwright against a local stub API

**Files:** create `prototype/tests/test_gallery.py`.

The stub is a second local `ThreadingHTTPServer` with CORS (`Access-Control-Allow-Origin: *`) serving `GET /api/gallery` from a mutable list. Boot like `test_region.py::boot` (viewport 480x270, terrain `.mmh` routes fulfilled with 404; copy the launch args, do not import across test files) and add `?worldhost=http://127.0.0.1:<stubport>`.

- [ ] **Step 1: Commit and push the branch first** (a run that dies mid-check must leave the work recoverable): `git push -u origin feature/170-gallery`.
- [ ] **Step 2: Write the tests** (reuse `server` from `conftest.py`):
  - `test_gallery_row_lists_worlds_and_opens_one`: two entries; `#worldsrow` becomes visible; two `#worldsbtns button`s with the titles; hovering shows the description in `#worldsdesc`; clicking the first navigates to a URL containing `world=<id>` (route that navigation target to a 204 so nothing else loads).
  - `test_gallery_text_is_text`: a title `<img src=x onerror=window.__pwn=1>` and a description containing `<script>`: the button's `textContent` equals the title, `window.__pwn` is `None`, no `img` inside `#worldsbtns`.
  - `test_empty_or_broken_gallery_changes_nothing`: the stub returns `[]`, then 500, then `not json` (one boot each): `#worldsrow` stays hidden, `window.__mm.sim` exists, `#region-hochrhein` still has `aria-pressed="true"`.
- [ ] **Step 3: Run, foreground, capped:** `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest prototype/tests/test_gallery.py -x` (set a generous Bash `timeout` and block; never `run_in_background`). Exit 137: stop and report. Fix the implementation, never the tests; after three failed attempts stop and report.
- [ ] **Step 4:** also run only `prototype/tests/test_region.py::test_default_is_hochrhein_and_marked` and `prototype/tests/test_i18n.py` (the region row and the language switch are the neighbours). Commit `test(gallery): Playwright coverage for the Worlds row against a stub API (#170)`.

---

### Task 7: docs, CHANGELOG, ops note

**Files:** modify `CHANGELOG.md`, `README.md` (or the service's README from #168) with a short "Curating the gallery" section.

- [ ] **Step 1:** `CHANGELOG.md` under `[Unreleased]`, player voice: `Added: A "Worlds" row on the start screen lists hand-picked worlds built from the map; click one to drive there.`
- [ ] **Step 2:** the README section shows the `curl` and `scripts/gallery.py` usage with `"$RHYFLITZER_ADMIN_TOKEN"` taken from the environment, says where the secret lives (`GALLERY_ADMIN_TOKEN` in the service's environment on ionos1; the owner keeps the value in Passbolt) and **contains no token value**. `git grep -n -i "bearer [a-z0-9]\{12,\}"` must find nothing.
- [ ] **Step 3:** `node --test prototype/tests/*.test.mjs` and the service + CLI pytest suites green; push; open the PR `feat(ui): curated world gallery on the start screen (#170)` with `Closes #170`. The deploy step (creating the token, setting it on ionos1, restarting the service) is the owner's; list it in the PR description as a task list.
