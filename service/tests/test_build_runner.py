import dataclasses
import json
import sys
import time
from pathlib import Path

import pytest
import requests

import frame
import region
from conftest import RECT
from rhyflitzer_api import build, runner

JOB = {"id": "0123456789ab", "lv95": json.dumps(list(RECT))}
FAKE = r'''
import json, os, pathlib, signal, sys, time
out, mode = pathlib.Path(sys.argv[1]), sys.argv[2]
print("STEP cutting", flush=True)
if mode == "ok":
    out.mkdir(parents=True, exist_ok=True)
    for n in ("world.json", "terrain.mmh", "meta.json"):
        (out / n).write_text("x" * 10)
    print("STEP done")
    print("RESULT " + json.dumps({"ok": True}))
elif mode == "complex":
    out.mkdir(parents=True, exist_ok=True)
    (out / "world.json").write_text("{}")
    print("RESULT " + json.dumps({"ok": False, "error": "too-complex", "message": "This area is too complex"}))
    sys.exit(1)
elif mode == "slow":
    out.mkdir(parents=True, exist_ok=True)
    time.sleep(30)
elif mode == "killed":
    os.kill(os.getpid(), signal.SIGKILL)
'''


def fake(mode):
    return lambda job, settings, out: [sys.executable, "-c", FAKE, str(out), mode]


def test_success_relays_steps_and_publishes(settings):
    steps = []
    assert runner.run_build(JOB, settings, steps.append, fake("ok")) == runner.Outcome(True, size=30)
    assert steps == ["cutting", "done"]
    assert sorted(p.name for p in (settings.worlds_dir / JOB["id"]).iterdir()) == ["meta.json", "terrain.mmh", "world.json"]
    assert not runner.temp_dir(settings, JOB["id"]).exists()


def test_reported_failure_keeps_nothing(settings):
    out = runner.run_build(JOB, settings, lambda s: None, fake("complex"))
    assert (out.ok, out.error, out.message) == (False, "too-complex", "This area is too complex")
    assert not (settings.worlds_dir / JOB["id"]).exists() and not runner.temp_dir(settings, JOB["id"]).exists()


def test_timeout_kills_the_build(settings):
    start = time.monotonic()
    out = runner.run_build(JOB, dataclasses.replace(settings, job_timeout=1.0), lambda s: None, fake("slow"))
    assert (out.ok, out.error) == (False, "timeout") and time.monotonic() - start < 10
    assert not runner.temp_dir(settings, JOB["id"]).exists()


def test_a_killed_build_is_a_failure(settings):
    out = runner.run_build(JOB, settings, lambda s: None, fake("killed"))
    assert (out.ok, out.error) == (False, "build-failed")


def test_command_carries_the_frame_paths_and_limits(settings):
    cmd = runner.build_command(JOB, settings, Path("/tmp/x"))
    assert cmd[1:3] == ["-m", "rhyflitzer_api.build"]
    i = cmd.index("--lv95")
    assert cmd[i + 1:i + 5] == [str(v) for v in RECT]
    for flag, value in (("--out", "/tmp/x"), ("--extract", str(settings.extract_path)),
                        ("--cache", str(settings.cache_dir)), ("--max-buildings", "20000"),
                        ("--max-road-points", "50000"), ("--id", JOB["id"])):
        assert cmd[cmd.index(flag) + 1] == value


def args(tmp_path, *extra):
    return ["--id", "0123456789ab", "--lv95", *[str(v) for v in RECT], "--out", str(tmp_path / "out"),
            "--extract", str(tmp_path / "ch.osm.pbf"), "--cache", str(tmp_path / "cache"), *extra]


def fake_world(buildings, points):
    def fake(rect, out_dir, **kw):
        assert rect == RECT and kw["extract"].name == "ch.osm.pbf"
        kw["progress"]("terrain")
        p = Path(out_dir)
        p.mkdir(parents=True, exist_ok=True)
        (p / "world.json").write_text(json.dumps({"buildings": [{}] * buildings, "roads": [{"pts": [[0, 0]] * points}]}))
        return {"world": p / "world.json"}
    return fake


def test_build_main_reports_steps_then_ok(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(region, "build_world", fake_world(3, 4))
    assert build.main(args(tmp_path)) == 0
    assert capsys.readouterr().out.splitlines() == ["STEP terrain", 'RESULT {"ok": true}']


def test_build_main_refuses_a_too_complex_world(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(region, "build_world", fake_world(3, 4))
    assert build.main(args(tmp_path, "--max-buildings", "2")) == 1
    result = json.loads(capsys.readouterr().out.splitlines()[-1].removeprefix("RESULT "))
    assert result["ok"] is False and result["error"] == "too-complex" and "3 buildings" in result["message"]


@pytest.mark.parametrize("exc, code", [
    (frame.FrameError("outside-ch", "outside"), "outside-ch"),
    (requests.ConnectionError("down"), "source-unreachable"),
    (RuntimeError("boom"), "build-failed"),
])
def test_build_main_turns_errors_into_a_result(monkeypatch, tmp_path, capsys, exc, code):
    def fail(rect, out_dir, **kw):
        raise exc
    monkeypatch.setattr(region, "build_world", fail)
    assert build.main(args(tmp_path)) == 1
    assert json.loads(capsys.readouterr().out.splitlines()[-1].removeprefix("RESULT "))["error"] == code


def test_check_complexity_counts_road_points():
    build.check_complexity({"buildings": [], "roads": [{"pts": [[0, 0]] * 3}]}, 10, 3)
    with pytest.raises(build.TooComplex, match="4 road points"):
        build.check_complexity({"buildings": [], "roads": [{"pts": [[0, 0]] * 4}]}, 10, 3)
