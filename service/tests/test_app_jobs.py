import pytest
from starlette.requests import Request

import frame
import region
from conftest import RECT, human, ip
from rhyflitzer_api.app import client_ip, network_of

WID = frame.world_id(RECT, region.PIPELINE_VERSION)


def test_post_queues_a_new_world_and_get_reports_it(client):
    r = client.post("/api/jobs", json={"lv95": list(RECT), "altcha": human(client)}, headers=ip(1))
    assert r.status_code == 202
    job = r.json()
    assert (job["id"], job["state"], job["position"], job["lv95"]) == (WID, "queued", 1, list(RECT))
    assert client.get(f"/api/jobs/{WID}").json() == job


def test_same_frame_is_one_job_snapped_and_from_lonlat(client):
    a = client.post("/api/jobs", json={"lv95": [2667010, 1259740, 2669240, 1261760], "altcha": human(client)},
                    headers=ip(1)).json()
    b = client.post("/api/jobs", json={"lonlat": list(frame.lonlat_bbox(RECT))}, headers=ip(2)).json()
    assert a["id"] == b["id"] == WID


def test_a_built_world_is_200_with_its_files(client, store, settings):
    from conftest import add_ready
    add_ready(store, settings, WID)
    r = client.post("/api/jobs", json={"lv95": list(RECT)}, headers=ip(1))
    assert r.status_code == 200 and r.json()["state"] == "ready" and r.json()["files"] == f"/worlds/{WID}/"


@pytest.mark.parametrize("body, code", [
    ({"lv95": [2693000, 1283000, 2695000, 1285000]}, "outside-ch"),      # Büsingen
    ({"lv95": [2667000, 1259750, 2667500, 1261750]}, "too-small"),
    ({"lv95": [2660000, 1250000, 2670000, 1260000]}, "too-big"),
    ({"lv95": [1, 2, 3]}, "bad-bbox"),
    ({"lv95": ["x", 1, 2, 3]}, "bad-bbox"),
    ({"bbox": [1, 2, 3, 4]}, "bad-bbox"),
    ([1, 2, 3, 4], "bad-bbox"),
])
def test_refused_frames_say_why(client, body, code):
    r = client.post("/api/jobs", json=body, headers=ip(1))
    assert r.status_code == 400 and r.json()["error"] == code and r.json()["message"]


def test_body_that_is_not_json(client):
    r = client.post("/api/jobs", content=b"{", headers={"Content-Type": "application/json", **ip(1)})
    assert r.status_code == 400 and r.json()["error"] == "bad-request"


def test_limits_reach_the_client(client):
    client.post("/api/jobs", json={"lv95": list(RECT), "altcha": human(client)}, headers=ip(1))
    r = client.post("/api/jobs", json={"lv95": [2667000, 1259750, 2669000, 1261750], "altcha": human(client)},
                    headers=ip(1))
    assert r.status_code == 429 and r.json()["error"] == "one-at-a-time"


def test_world_status_survives_expiry_for_the_rebuild(client, store, settings):
    from conftest import add_ready
    add_ready(store, settings, WID)
    assert client.get(f"/api/worlds/{WID}").json() == {"id": WID, "status": "ready", "bbox": {"lv95": list(RECT)}}
    store.mark_expired(WID)
    r = client.get(f"/api/worlds/{WID}", headers={"Origin": "https://github.freaxnx01.ch"})
    assert r.status_code == 200 and r.json() == {"id": WID, "status": "expired", "bbox": {"lv95": list(RECT)}}
    assert r.headers["access-control-allow-origin"] == "https://github.freaxnx01.ch"


@pytest.mark.parametrize("path", ["/api/jobs/0123456789ab", "/api/jobs/NOT-AN-ID", "/api/worlds/0123456789ab",
                                  "/api/worlds/0123456789AB"])
def test_unknown_jobs(client, path):
    r = client.get(path)
    assert r.status_code == 404 and r.json()["error"] == "unknown"


def test_health(client, store):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "queued": 0, "building": 0, "worlds": 0, "storedBytes": 0,
                        "extract": False, "workerSeenSecondsAgo": None}


def test_cors_only_for_the_game_origin(client):
    good = client.get("/api/health", headers={"Origin": "https://github.freaxnx01.ch"})
    bad = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert good.headers["access-control-allow-origin"] == "https://github.freaxnx01.ch"
    assert "access-control-allow-origin" not in bad.headers


def request(xff=None):
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "headers": headers, "client": ("10.0.0.2", 1234)})


def test_client_ip_is_the_hop_traefik_added():
    assert client_ip(request("6.6.6.6, 203.0.113.9"), 1) == "203.0.113.9"   # a spoofed first entry is ignored
    assert client_ip(request(), 1) == "10.0.0.2"
    assert client_ip(request("203.0.113.9"), 0) == "10.0.0.2"


def test_client_ip_collapses_an_ipv6_address_to_its_64_prefix():
    a = client_ip(request("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), 1)
    b = client_ip(request("2001:db8:1:2:1111:2222:3333:4444"), 1)
    assert a == b and client_ip(request("2001:db8:1:3::1"), 1) != a      # a /64 is one subscriber, not 2^64 clients
    assert client_ip(request("::ffff:203.0.113.9"), 1) == "203.0.113.9"


def test_client_ip_ignores_forwarded_for_from_an_untrusted_peer():
    direct = Request({"type": "http", "headers": [(b"x-forwarded-for", b"6.6.6.6")], "client": ("198.51.100.5", 1)})
    assert client_ip(direct, 1) == "198.51.100.5"


def test_a_forged_forwarded_for_does_not_buy_a_new_budget(settings, store):
    from starlette.testclient import TestClient
    from rhyflitzer_api.app import create_app
    direct = TestClient(create_app(settings, store), client=("198.51.100.5", 1))      # not Traefik: no trust
    first = direct.post("/api/jobs", json={"lv95": list(RECT), "altcha": human(direct)}, headers=ip(1))
    second = direct.post("/api/jobs", json={"lv95": [2667000, 1259750, 2669000, 1261750], "altcha": human(direct)},
                         headers=ip(2))
    assert first.status_code == 202 and second.status_code == 429 and second.json()["error"] == "one-at-a-time"


def test_an_oversized_body_is_refused_before_it_is_parsed(client):
    r = client.post("/api/jobs", content=b'{"lv95": [' + b"1," * 50000 + b'1]}',
                    headers={"Content-Type": "application/json", **ip(1)})
    assert r.status_code == 413 and r.json()["error"] == "too-large"


def test_a_world_id_with_a_trailing_newline_is_not_an_id(client):
    from conftest import add_ready
    assert client.get("/api/jobs/0123456789ab%0A").status_code == 404
    assert client.get("/worlds/0123456789ab%0A/world.json").status_code == 404


@pytest.mark.parametrize("body", [
    {"lv95": [10**400, 1259750, 2669250, 1261750]},                 # float() overflows
    {"lonlat": [8.3, 47.4, 8.4, 95.0]},                             # latitude beyond the pole projects to inf
])
def test_numbers_that_do_not_project_are_a_bad_bbox_not_a_500(client, body):
    r = client.post("/api/jobs", json=body, headers=ip(1))
    assert r.status_code == 400 and r.json()["error"] == "bad-bbox"
    assert client.get("/api/preview?bbox=" + ",".join(["1" * 400, "2", "3", "4"])).status_code == 400


def test_network_of_is_the_24_or_the_48():
    assert network_of("203.0.113.9") == network_of("203.0.113.200") == "203.0.113.0/24"
    assert network_of("203.0.114.9") != network_of("203.0.113.9")
    assert network_of("2001:db8:1:2::") == network_of("2001:db8:1:ffff::") == "2001:db8:1::/48"
    assert network_of("2001:db8:2::") != network_of("2001:db8:1::")
    assert network_of("unknown") == "unknown"


def test_one_network_cannot_fill_the_queue(client):
    frames = [[2667000 + 250 * n, 1259750, 2669250 + 250 * n, 1261750] for n in range(4)]
    codes = [client.post("/api/jobs", json={"lv95": f, "altcha": human(client)}, headers=ip(n + 1)).status_code
             for n, f in enumerate(frames)]
    assert codes == [202, 202, 202, 503]                       # four addresses, one /24
    elsewhere = client.post("/api/jobs", json={"lv95": frames[3], "altcha": human(client)},
                            headers={"X-Forwarded-For": "198.51.100.7"})
    assert elsewhere.status_code == 202
