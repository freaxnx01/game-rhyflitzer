import dataclasses
import time

import altcha
import pytest

from conftest import solve
from rhyflitzer_api import challenge
from rhyflitzer_api.config import Settings


def test_issue_is_a_signed_pbkdf2_challenge_that_expires_in_ten_minutes(settings):
    now = time.time()
    doc = challenge.issue(settings, now)
    p = doc["parameters"]
    assert (p["algorithm"], p["cost"], p["expiresAt"]) == ("PBKDF2/SHA-256", settings.altcha_cost, int(now + 600))
    assert doc["signature"] and doc != challenge.issue(settings, now)


def test_valid_solution_gives_a_ticket(settings):
    doc = challenge.issue(settings, time.time())
    assert challenge.check(solve(doc), settings) == challenge.Ticket(doc["signature"], doc["parameters"]["expiresAt"])


def test_wrong_solution_is_refused(settings):
    ch = altcha.Challenge.from_dict(challenge.issue(settings, time.time()))
    good = altcha.solve_challenge(ch)
    bad = altcha.Solution(counter=good.counter + 1, derived_key=good.derived_key)
    assert challenge.check(altcha.Payload(ch, bad).to_base64(), settings) is None


def test_expired_challenge_is_refused(settings):
    assert challenge.check(solve(challenge.issue(settings, time.time() - 3600)), settings) is None


def test_tampered_or_foreign_challenge_is_refused(settings, tmp_path):
    doc = challenge.issue(settings, time.time())
    doc["parameters"]["expiresAt"] += 3600                       # extending the expiry breaks the signature
    assert challenge.check(solve(doc), settings) is None
    other = tmp_path / "other.secret"
    other.write_text("another-key", encoding="utf-8")
    foreign = challenge.issue(dataclasses.replace(settings, altcha_secret_file=other), time.time())
    assert challenge.check(solve(foreign), settings) is None


@pytest.mark.parametrize("payload", [None, "", "not base64 at all", 42, "A" * 5000])
def test_garbage_is_refused(settings, payload):
    assert challenge.check(payload, settings) is None


def test_without_a_key_file_it_fails_closed(settings):
    gone = dataclasses.replace(settings, altcha_secret_file=None)
    with pytest.raises(challenge.Unavailable):
        challenge.issue(gone, time.time())
    assert challenge.check(solve(challenge.issue(settings, time.time())), gone) is None


def test_settings_read_key_file_cost_and_race_threshold(tmp_path):
    s = Settings.from_env({"DATA_DIR": str(tmp_path), "ALTCHA_SECRET_FILE": "/run/secrets/a", "ALTCHA_COST": "8000",
                           "RACE_MIN_ROAD_M": "4000"})
    assert (str(s.altcha_secret_file), s.altcha_cost, s.race_min_road_m, s.altcha_ttl) == ("/run/secrets/a", 8000, 4000, 600.0)
    d = Settings.from_env({"DATA_DIR": str(tmp_path)})
    assert (d.altcha_secret_file, d.altcha_cost, d.race_min_road_m, d.preview_per_minute) == (None, 5000, 3000, 60)
