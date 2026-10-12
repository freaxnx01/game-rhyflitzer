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


def test_a_world_is_marked_expired_before_its_folder_is_deleted(store, settings, monkeypatch):
    add_ready(store, settings, "0123456789ab", files=True)
    seen = []
    real = housekeeping.shutil.rmtree
    monkeypatch.setattr(housekeeping.shutil, "rmtree",
                        lambda p, **kw: (seen.append(store.get("0123456789ab")["state"]), real(p, **kw)))
    housekeeping._remove(store, settings, "0123456789ab", "test")
    assert seen == ["expired"]
