"""#170: the owner's CLI (scripts/gallery.py): the requests it builds, and that the token never leaks."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import gallery as cli  # noqa: E402

ID = "0123456789ab"
HOST = "http://127.0.0.1:8081"


def test_add_builds_a_put_with_bearer_and_json():
    method, url, headers, body = cli.build_request(HOST, "t0k", "add", ID, "Titel", "Beschreibung")
    assert (method, url) == ("PUT", f"{HOST}/api/admin/gallery/{ID}")
    assert headers["Authorization"] == "Bearer t0k" and headers["Content-Type"] == "application/json"
    assert json.loads(body) == {"title": "Titel", "description": "Beschreibung"}


def test_remove_and_list():
    assert cli.build_request(HOST, "t", "remove", ID, None, None)[:2] == ("DELETE", f"{HOST}/api/admin/gallery/{ID}")
    method, url, headers, body = cli.build_request(HOST, None, "list", None, None, None)
    assert (method, url, body) == ("GET", f"{HOST}/api/gallery", None) and "Authorization" not in headers


@pytest.mark.parametrize("token, world_id", [("t", "../x"), ("t", "ABCDEF012345"), ("t", None), (None, ID), ("", ID)])
def test_a_bad_id_or_a_missing_token_exits_before_any_request(token, world_id):
    with pytest.raises(SystemExit):
        cli.build_request(HOST, token, "add", world_id, "T", "")


def test_main_sends_through_the_admin_host_and_never_prints_the_token(monkeypatch, capsys):
    monkeypatch.setenv("RHYFLITZER_ADMIN_TOKEN", "unit-test-token")
    monkeypatch.setenv("RHYFLITZER_ADMIN_API", "http://127.0.0.1:8001/")
    seen = []
    monkeypatch.setattr(cli, "send", lambda *call: seen.append(call) or (401, '{"error":"unauthorized"}'))
    with pytest.raises(SystemExit) as exit_info:
        cli.main(["add", ID, "T"])
    out = capsys.readouterr()
    assert exit_info.value.code == 1 and seen[0][1] == f"http://127.0.0.1:8001/api/admin/gallery/{ID}"
    assert "unit-test-token" not in out.out + out.err


def test_main_prints_a_good_answer_and_exits_zero(monkeypatch, capsys):
    monkeypatch.delenv("RHYFLITZER_ADMIN_TOKEN", raising=False)
    monkeypatch.setattr(cli, "send", lambda *call: (200, "[]"))
    cli.main(["list"])
    assert capsys.readouterr().out.strip() == "200 []"
