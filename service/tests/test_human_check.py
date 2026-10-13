import asyncio
import dataclasses
import time

import frame
import pytest
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


def off_loop() -> bool:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return True
    return False


def test_a_cache_hit_does_not_judge_the_solution(client, store, settings, monkeypatch):
    add_ready(store, settings, WID)
    monkeypatch.setattr(challenge, "check", lambda payload, s: pytest.fail("the human check ran for a cache hit"))
    assert post(client, payload="anything").status_code == 200


def test_store_and_human_check_run_off_the_event_loop(client, store, monkeypatch):
    seen = []

    def spy(name, real):
        def call(*args, **kw):
            seen.append((name, off_loop()))
            return real(*args, **kw)
        return call

    for name in ("get", "submit", "ip_hash", "prev_ip_hash", "position", "counts"):
        monkeypatch.setattr(store, name, spy(name, getattr(store, name)))
    monkeypatch.setattr(challenge, "check", spy("check", challenge.check))
    assert post(client, payload=human(client)).status_code == 202
    for path in (f"/api/jobs/{WID}", f"/api/worlds/{WID}", "/api/health", f"/worlds/{WID}/world.json"):
        client.get(path)
    assert {name for name, _ in seen} >= {"get", "submit", "ip_hash", "position", "counts", "check"}
    assert all(off for _, off in seen), seen


def test_a_join_that_races_a_failure_is_admitted_without_a_human_check(client, store, monkeypatch):
    # The world looked joinable when the client checked, so they rightly skipped solving. If it has flipped to
    # non-joinable inside submit's transaction (a non-permanent failure landed between the two checks), they are
    # still admitted — re-queued — instead of getting a spurious 403 human_check_failed.
    monkeypatch.setattr(store, "exists", lambda wid: True)
    r = post(client)
    assert r.status_code == 202 and r.json()["state"] == "queued"
    assert store.get(WID)["state"] == "queued"
