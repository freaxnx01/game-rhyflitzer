import dataclasses

import frame
import pytest
import region
import requests
from starlette.testclient import TestClient

from conftest import RECT, add_ready, ip
from rhyflitzer_api.app import create_app
from rhyflitzer_api.preview import Limiter

BBOX = "bbox=2667000,1259750,2669250,1261750"
WID = frame.world_id(RECT, region.PIPELINE_VERSION)
INSIDE = (5336, 2521)          # a cell centred in RECT


class Reply:
    def __init__(self, names):
        self.names = names

    def raise_for_status(self):
        pass

    def json(self):
        return {"results": [{"attributes": {"gemname": n, "jahr": 2026, "is_current_jahr": True}} for n in self.names]}


def fake_get(point=("Ehrendingen",), envelope=("Ehrendingen",), calls=None):
    def get(url, params, timeout):
        if calls is not None:
            calls.append(params["geometryType"])
        return Reply(point if params["geometryType"] == "esriGeometryPoint" else envelope)
    return get


def app(settings, store, get=None, **over):
    return TestClient(create_app(dataclasses.replace(settings, **over), store, get=get or fake_get()))


def test_limiter_allows_n_per_minute_and_forgets():
    now = [0.0]
    limiter = Limiter(2, clock=lambda: now[0])
    assert [limiter.allow("a"), limiter.allow("a"), limiter.allow("a"), limiter.allow("b")] == [True, True, False, True]
    now[0] = 60.0
    assert limiter.allow("a")


def test_preview_names_the_frame_and_says_a_race_fits(settings, store):
    store.replace_roadgrid([(*INSIDE, 4000), (9000, 9000, 99999)])
    r = app(settings, store).get(f"/api/preview?{BBOX}", headers=ip(1))
    assert r.status_code == 200
    assert r.json() == {"id": WID, "exists": False, "name": "Ehrendingen", "gemeinden": ["Ehrendingen"], "raceOk": True}


def test_two_gemeinden_make_a_double_name_centre_first(settings, store):
    store.replace_roadgrid([(*INSIDE, 4000)])
    get = fake_get(point=("Ehrendingen",), envelope=("Lengnau", "Ehrendingen"))
    assert app(settings, store, get).get(f"/api/preview?{BBOX}").json()["name"] == "Ehrendingen · Lengnau"


def test_few_major_roads_say_so(settings, store):
    store.replace_roadgrid([(*INSIDE, 1000)])
    assert app(settings, store).get(f"/api/preview?{BBOX}").json()["raceOk"] is False
    assert app(settings, store).get(f"/api/preview?{BBOX}").json()["reason"] == "few-major-roads"


def test_no_road_index_yet_is_unknown_not_an_error(settings, store):
    assert app(settings, store).get(f"/api/preview?{BBOX}").json() == {
        "id": WID, "exists": False, "name": "Ehrendingen", "gemeinden": ["Ehrendingen"], "raceOk": None, "reason": "no-road-index"}


def test_a_failed_name_lookup_gives_a_null_name(settings, store):
    def down(url, params, timeout):
        raise requests.ConnectionError("swisstopo is down")
    store.replace_roadgrid([(*INSIDE, 4000)])
    r = app(settings, store, down).get(f"/api/preview?{BBOX}")
    assert r.status_code == 200 and r.json() == {"id": WID, "exists": False, "name": None, "gemeinden": [], "raceOk": True}


@pytest.mark.parametrize("query, code", [
    ("", "bad-bbox"), ("?bbox=1,2,3", "bad-bbox"),
    ("?bbox=2693000,1283000,2695000,1285000", "outside-ch"), ("?bbox=2660000,1250000,2670000,1260000", "too-big"),
])
def test_preview_refuses_bad_frames(settings, store, query, code):
    r = app(settings, store).get(f"/api/preview{query}")
    assert r.status_code == 400 and r.json()["error"] == code


def test_preview_is_rate_limited_per_client(settings, store):
    client = app(settings, store, preview_per_minute=2)
    assert [client.get(f"/api/preview?{BBOX}", headers=ip(1)).status_code for _ in range(3)] == [200, 200, 429]
    assert client.get(f"/api/preview?{BBOX}", headers=ip(2)).status_code == 200
    assert client.get(f"/api/preview?{BBOX}", headers=ip(1)).json()["error"] == "preview-rate-limit"


def exists(client):
    return client.get(f"/api/preview?{BBOX}").json()["exists"]


def test_preview_says_whether_the_world_exists(settings, store):
    client = app(settings, store)
    assert (client.get(f"/api/preview?{BBOX}").json()["id"], exists(client)) == (WID, False)
    add_ready(store, settings, WID)
    assert exists(client) is True
    for state, error, expected in [("queued", None, True), ("building", None, True), ("expired", None, False),
                                   ("failed", "timeout", False), ("failed", "too-complex", True)]:
        store._x("UPDATE worlds SET state = ?, error = ? WHERE id = ?", (state, error, WID))
        assert exists(client) is expected, (state, error)


def test_exists_matches_the_human_check_but_the_server_stays_authoritative(settings, store):
    client = app(settings, store)
    add_ready(store, settings, WID)
    assert exists(client) is True
    hit = client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))        # no "altcha": a cache hit is free
    assert hit.status_code == 200 and hit.json()["state"] == "ready"
    store._x("UPDATE worlds SET state = 'expired' WHERE id = ?", (WID,))
    assert exists(client) is False
    refused = client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))    # a NEW build without a solution
    assert refused.status_code == 403 and refused.json()["error"] == "human_check_failed"


def test_the_same_frame_is_looked_up_once(settings, store):
    calls = []
    client = app(settings, store, fake_get(calls=calls))
    client.get(f"/api/preview?{BBOX}")
    client.get(f"/api/preview?{BBOX}")
    assert calls == ["esriGeometryPoint", "esriGeometryEnvelope"]
