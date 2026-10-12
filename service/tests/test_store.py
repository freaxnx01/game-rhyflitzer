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


def test_one_at_a_time_holds_across_utc_midnight(store, settings):
    before = (T0 // DAY + 1) * DAY - 10                       # 10 s before midnight
    after = before + 20
    store.submit(wid(1), RECT, store.ip_hash("198.51.100.7", before), before, settings)
    with pytest.raises(Refused) as e:                         # the salt rotated, the same client is still building
        store.submit(wid(2), RECT, store.ip_hash("198.51.100.7", after), after, settings,
                     prev_ip_hash=store.prev_ip_hash("198.51.100.7", after))
    assert (e.value.status, e.value.code) == (429, "one-at-a-time")
