import json
import logging
import sys

import pytest

from rhyflitzer_api import logs
from rhyflitzer_api.config import Settings


def test_from_env_defaults_are_the_limits_table(tmp_path):
    s = Settings.from_env({"DATA_DIR": str(tmp_path)})
    assert s.cors_origins == ("https://github.freaxnx01.ch",) and s.admin_token_file is None and s.proxy_hops == 1
    assert (s.max_queue, s.per_ip_active, s.per_ip_daily, s.global_daily) == (20, 1, 5, 100)
    assert (s.job_timeout, s.max_buildings, s.max_road_points) == (600.0, 20_000, 50_000)
    assert (s.retention_days, s.store_cap_bytes, s.source_retries) == (30, 10 * 1024**3, 2)
    assert s.db_path == tmp_path / "service.sqlite3" and s.worlds_dir == tmp_path / "worlds"
    assert s.extract_path == tmp_path / "extract" / "switzerland-latest.osm.pbf" and s.cache_dir == tmp_path / "cache"


def test_from_env_requires_data_dir():
    with pytest.raises(ValueError, match="DATA_DIR"):
        Settings.from_env({})


def test_from_env_reads_origins_token_file_and_hops(tmp_path):
    s = Settings.from_env({"DATA_DIR": str(tmp_path), "CORS_ORIGINS": "https://a.example, http://localhost:8000",
                           "ADMIN_TOKEN_FILE": "/run/secrets/t", "PROXY_HOPS": "2"})
    assert s.cors_origins == ("https://a.example", "http://localhost:8000")
    assert str(s.admin_token_file) == "/run/secrets/t" and s.proxy_hops == 2


def test_formatter_writes_one_json_object_with_fields():
    rec = logging.LogRecord("rhyflitzer.api", logging.INFO, __file__, 1, "Building world %s", ("abc",), None)
    rec.fields = {"world": "abc"}
    doc = json.loads(logs.JsonFormatter().format(rec))
    assert doc["msg"] == "Building world abc" and doc["level"] == "INFO" and doc["world"] == "abc"
    assert doc["logger"] == "rhyflitzer.api" and doc["ts"].endswith("+00:00")


def test_formatter_includes_the_exception():
    try:
        raise ValueError("boom")
    except ValueError:
        rec = logging.LogRecord("x", logging.ERROR, __file__, 1, "failed", (), sys.exc_info())
    assert "ValueError: boom" in json.loads(logs.JsonFormatter().format(rec))["exc"]


def test_fields_is_the_extra_dict():
    assert logs.fields(world="w", code="busy") == {"fields": {"world": "w", "code": "busy"}}


def test_trusted_proxies_are_stripped_normalised_and_a_bad_value_fails_the_boot(tmp_path):
    env = {"DATA_DIR": str(tmp_path), "TRUSTED_PROXIES": " 10.0.0.5/24 , 172.18.0.2 "}
    assert Settings.from_env(env).trusted_proxies == ("10.0.0.0/24", "172.18.0.2/32")
    with pytest.raises(ValueError):
        Settings.from_env({**env, "TRUSTED_PROXIES": "10.0.0.0/8,not-a-network"})
