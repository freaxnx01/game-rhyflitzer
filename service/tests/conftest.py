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