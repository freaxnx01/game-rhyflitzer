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
    store.mark_expired(wid)                                 # first: readers then answer "expired", never a half-deleted folder
    shutil.rmtree(settings.worlds_dir / wid, ignore_errors=True)
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
