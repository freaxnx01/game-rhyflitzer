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


def test_a_job_without_a_readable_attempt_count_is_never_retried(store, settings):
    store.submit("00000000000a", RECT, "a", T0, settings)
    job = store.claim_next(T0)
    del job["attempts"]
    w = worker.Worker(settings, store, builder(Outcome(True)), Clock(T0))
    w._settle(job, Outcome(False, "source-unreachable", "down"), 1.0)
    assert store.get("00000000000a")["state"] == "failed"


def test_a_crashing_job_stops_at_the_attempt_cap(store, settings):
    with_extract(settings)
    store.submit("00000000000a", RECT, "a", T0, settings)
    build = builder(Outcome(False, "source-unreachable", "down"))
    w = worker.Worker(settings, store, build, Clock(T0))
    for step in range(10):
        w.clock.t = T0 + step * 1000
        w.run_once()
    assert len(build.calls) == settings.source_retries + 1 and store.get("00000000000a")["state"] == "failed"
