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
