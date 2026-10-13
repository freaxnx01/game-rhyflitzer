import asyncio
import dataclasses
import json
import time

import pytest
from starlette.testclient import TestClient

from conftest import add_ready
from rhyflitzer_api.app import create_admin_app, create_app

WID = "0123456789ab"
ORIGIN = {"Origin": "https://github.freaxnx01.ch"}


def test_world_files_with_cache_headers_and_cors(client, store, settings):
    add_ready(store, settings, WID, files=True)
    world = client.get(f"/worlds/{WID}/world.json", headers=ORIGIN)
    assert world.status_code == 200 and world.json() == {"roads": []}
    assert world.headers["cache-control"] == "no-cache"
    assert world.headers["access-control-allow-origin"] == ORIGIN["Origin"]
    terrain = client.get(f"/worlds/{WID}/terrain.mmh", headers=ORIGIN)
    assert terrain.content.startswith(b"MMH1") and terrain.headers["content-type"] == "application/octet-stream"
    assert terrain.headers["cache-control"] == "public, max-age=86400"
    assert terrain.headers["access-control-allow-origin"] == ORIGIN["Origin"]
    meta = client.get(f"/worlds/{WID}/meta.json")
    assert meta.headers["cache-control"] == "no-cache" and meta.json()["id"] == WID


def test_world_json_is_the_play_signal_at_most_hourly(client, store, settings):
    add_ready(store, settings, WID, files=True)
    client.get(f"/worlds/{WID}/meta.json")
    client.get(f"/worlds/{WID}/terrain.mmh")
    assert store.get(WID)["last_played"] is None                             # only world.json counts
    client.get(f"/worlds/{WID}/world.json")
    first = store.get(WID)["last_played"]
    assert first is not None and abs(first - time.time()) < 60
    assert json.loads((settings.worlds_dir / WID / "meta.json").read_text())["lastPlayed"].endswith("+00:00")
    store.mark_played(WID, first - 10)
    client.get(f"/worlds/{WID}/world.json")
    assert store.get(WID)["last_played"] == first - 10                       # within the hour: unchanged
    store.mark_played(WID, first - 4000)
    client.get(f"/worlds/{WID}/world.json")
    assert store.get(WID)["last_played"] > first - 60


@pytest.mark.parametrize("setup, path, code", [
    (None, f"/worlds/{WID}/world.json", "unknown"),
    ("expired", f"/worlds/{WID}/world.json", "expired"),
    ("queued", f"/worlds/{WID}/world.json", "not-ready"),
    ("ready", f"/worlds/{WID}/secret.txt", "unknown"),
    ("ready", f"/worlds/{WID}/world.zip", "unknown"),
    ("ready", "/worlds/0123456789AB/world.json", "unknown"),
])
def test_missing_worlds_say_why(client, store, settings, setup, path, code):
    if setup:
        add_ready(store, settings, WID, files=True)
    if setup == "expired":
        store.mark_expired(WID)
    if setup == "queued":
        store._x("UPDATE worlds SET state = 'queued' WHERE id = ?", (WID,))
    r = client.get(path, headers=ORIGIN)
    assert r.status_code == 404 and r.json()["error"] == code
    assert r.headers["access-control-allow-origin"] == ORIGIN["Origin"]      # the game can read why


def test_the_public_app_has_no_admin_routes(client, store, settings):
    add_ready(store, settings, WID)
    for call in (client.put, client.delete):
        assert call(f"/api/admin/gallery/{WID}", headers={"Authorization": "Bearer s3cret"}).status_code == 404
    assert store.get(WID)["gallery"] == 0


def test_admin_without_token_file_is_401(store, settings):
    add_ready(store, settings, WID)
    r = TestClient(create_admin_app(settings, store)).put(f"/api/admin/gallery/{WID}", json={"title": "x"}, headers={"Authorization": "Bearer "})
    assert r.status_code == 401 and store.get(WID)["gallery"] == 0


@pytest.fixture
def admin(settings, store, tmp_path):
    token = tmp_path / "admin_token"
    token.write_text("s3cret\n")
    return TestClient(create_admin_app(dataclasses.replace(settings, admin_token_file=token), store))


def test_the_admin_app_serves_nothing_but_admin(admin):
    assert admin.get("/api/health").status_code == 404 and admin.get(f"/worlds/{WID}/world.json").status_code == 404


def test_admin_pins_and_unpins_a_ready_world(admin, store, settings):
    add_ready(store, settings, WID)
    auth = {"Authorization": "Bearer s3cret"}
    assert admin.put(f"/api/admin/gallery/{WID}", json={"title": "x"}, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert admin.put(f"/api/admin/gallery/{WID}", json={"title": " "}, headers=auth).status_code == 400
    assert admin.put("/api/admin/gallery/0000000000ff", json={"title": "x"}, headers=auth).status_code == 404
    r = admin.put(f"/api/admin/gallery/{WID}", json={"title": "Lägern", "description": "Ridge road"}, headers=auth)
    assert r.status_code == 200 and (store.get(WID)["gallery"], store.get(WID)["title"]) == (1, "Lägern")
    assert admin.delete(f"/api/admin/gallery/{WID}", headers=auth).status_code == 200 and store.get(WID)["gallery"] == 0


def _off_loop() -> bool:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return True
    return False


def test_admin_gallery_runs_off_the_event_loop(admin, store, settings, monkeypatch):
    add_ready(store, settings, WID)
    seen = []

    def spy(name, real):
        def call(*args, **kw):
            seen.append((name, _off_loop()))
            return real(*args, **kw)
        return call

    for name in ("get", "set_gallery", "unset_gallery"):
        monkeypatch.setattr(store, name, spy(name, getattr(store, name)))
    auth = {"Authorization": "Bearer s3cret"}
    admin.put(f"/api/admin/gallery/{WID}", json={"title": "Lägern"}, headers=auth)
    admin.delete(f"/api/admin/gallery/{WID}", headers=auth)
    assert {name for name, _ in seen} >= {"get", "set_gallery", "unset_gallery"}
    assert all(off for _, off in seen), seen


def test_a_world_whose_folder_vanishes_mid_request_is_expired_not_a_500(client, store, settings):
    add_ready(store, settings, WID)                       # ready in the store, no files on disk: the eviction race
    r = client.get(f"/worlds/{WID}/terrain.mmh")
    assert r.status_code == 404 and r.json()["error"] == "expired"


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
    r = admin.put(f"/api/admin/gallery/{WID}", json={"title": "  Rhy\x00fl\x07itzer <b>  ", "description": "a\x85b"}, headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200 and r.json()["title"] == "Rhyflitzer <b>"
    assert (store.get(WID)["title"], store.get(WID)["description"]) == ("Rhyflitzer <b>", "ab")


def test_the_public_gallery_runs_off_the_event_loop(client, store, settings, monkeypatch):
    add_ready(store, settings, WID)
    real, seen = store.gallery_list, []
    monkeypatch.setattr(store, "gallery_list", lambda *a, **kw: seen.append(_off_loop()) or real(*a, **kw))
    assert client.get("/api/gallery").status_code == 200
    assert seen == [True]
