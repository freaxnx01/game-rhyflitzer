"""#168: SQLite holds the queue, the rate limits and the world metadata. One row per world is also its job: the
job id is the world id, so the same frame never builds twice and a rebuild keeps its share link."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import secrets
import sqlite3
import threading
from pathlib import Path

PERMANENT = ("too-complex",)   # failures a rebuild of the same frame cannot fix
CELL = 500.0   # roadgrid cell edge in metres (LV95)
HUMAN_MESSAGE = "The human check did not pass; wait a moment for it to finish and press Build again"

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
CREATE TABLE IF NOT EXISTS used_challenges (signature TEXT PRIMARY KEY, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS roadgrid (cx INTEGER NOT NULL, cy INTEGER NOT NULL, meters INTEGER NOT NULL,
  PRIMARY KEY (cx, cy)) WITHOUT ROWID;
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


def _check_limits(db, ip_hash: str, day: str, s, prev_ip_hash: str | None = None) -> None:
    if _count(db, "SELECT COUNT(*) FROM worlds WHERE state = 'queued'") >= s.max_queue:
        raise Refused(503, "busy", "Server busy, try again later")
    if _count(db, "SELECT COUNT(*) FROM worlds WHERE state IN ('queued', 'building') AND ip_hash IN (?, ?)",
              (ip_hash, prev_ip_hash or ip_hash)) >= s.per_ip_active:
        raise Refused(429, "one-at-a-time", "One of your worlds is still building; wait until it is done")
    if _count(db, "SELECT COUNT(*) FROM builds WHERE day = ? AND ip_hash = ?", (day, ip_hash)) >= s.per_ip_daily:
        raise Refused(429, "daily-limit", f"At most {s.per_ip_daily} new worlds per day; try again tomorrow")
    if _count(db, "SELECT COUNT(*) FROM builds WHERE day = ?", (day,)) >= s.global_daily:
        raise Refused(429, "server-daily-limit", "The server has built enough worlds today; try again tomorrow")


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


def joins(row) -> bool:
    """A request for this world would only join or read it (built, queued, building, permanently failed): free, no human check."""
    return bool(row) and (row["state"] in ("queued", "building", "ready") or row["error"] in PERMANENT)


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

    def prev_ip_hash(self, ip: str, now: float) -> str | None:
        """The same client under yesterday's salt, so a job it started before UTC midnight still counts as its own."""
        row = self._q("SELECT salt FROM salts WHERE day = ?", (day_of(now - 86400),))
        return hashlib.sha256(f"{row[0]['salt']}:{ip}".encode()).hexdigest()[:16] if row else None

    def exists(self, wid: str) -> bool:
        return joins(self.get(wid))

    def get(self, wid: str) -> dict | None:
        rows = self._q("SELECT * FROM worlds WHERE id = ?", (wid,))
        return rows[0] if rows else None

    def position(self, wid: str) -> int:
        return self._q("SELECT COUNT(*) AS n FROM worlds WHERE state = 'queued' AND "
                       "created <= (SELECT created FROM worlds WHERE id = ?)", (wid,))[0]["n"]

    def submit(self, wid: str, rect, ip_hash: str, now: float, settings, prev_ip_hash: str | None = None, gate=None) -> dict:
        """The world's row: as it is when built, queued, building or permanently failed (free); otherwise queued
        as a new build after the limits allow it. Raises Refused."""
        def admit(db):
            row = db.execute("SELECT * FROM worlds WHERE id = ?", (wid,)).fetchone()
            if joins(row):
                return dict(row)
            if gate is not None:
                gate(db)
            _check_limits(db, ip_hash, day_of(now), settings, prev_ip_hash)
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

    def counts(self) -> dict:
        return {r["state"]: r["n"] for r in self._q("SELECT state, COUNT(*) AS n FROM worlds GROUP BY state")}

    def kv_get(self, key: str) -> str | None:
        rows = self._q("SELECT value FROM kv WHERE key = ?", (key,))
        return rows[0]["value"] if rows else None

    def kv_set(self, key: str, value: str) -> None:
        self._x("INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value))
