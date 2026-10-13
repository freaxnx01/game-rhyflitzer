import dataclasses
import json
import os
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
elif mode == "tree":
    import subprocess
    child = subprocess.Popen(["sleep", "30"])
    pathlib.Path(sys.argv[3]).write_text(str(child.pid))
    time.sleep(30)
elif mode == "hog":
    hog = bytearray(1_000_000_000)
    print("RESULT " + json.dumps({"ok": True}))
elif mode == "spin":
    while True:
        pass
elif mode == "killed":
    os.kill(os.getpid(), signal.SIGKILL)
'''


def fake(mode, *extra):
    return lambda job, settings, out: [sys.executable, "-c", FAKE, str(out), mode, *extra]


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


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return Path(f"/proc/{pid}/stat").read_text().split()[2] != "Z"


def test_timeout_kills_the_whole_process_tree(settings, tmp_path):
    pidfile = tmp_path / "child.pid"
    out = runner.run_build(JOB, dataclasses.replace(settings, job_timeout=2.0), lambda s: None, fake("tree", str(pidfile)))
    assert out.error == "timeout"
    time.sleep(0.5)
    assert not alive(int(pidfile.read_text()))


def test_the_memory_cap_sits_on_the_build_itself(settings):
    start = time.monotonic()
    out = runner.run_build(JOB, dataclasses.replace(settings, build_memory_bytes=300_000_000), lambda s: None, fake("hog"))
    assert not out.ok and out.error == "build-failed" and time.monotonic() - start < 20


def test_the_cpu_cap_sits_on_the_build_itself(settings):
    start = time.monotonic()
    out = runner.run_build(JOB, dataclasses.replace(settings, build_cpu_seconds=1, job_timeout=60.0), lambda s: None, fake("spin"))
    assert not out.ok and out.error == "build-failed" and time.monotonic() - start < 20


SYNTH = ('<?xml version="1.0"?><osm version="0.6">'
         '<node id="1" lat="47.47" lon="8.30"/><node id="2" lat="47.48" lon="8.30"/><node id="3" lat="47.48" lon="8.31"/>'
         '<way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/></way>'
         '<way id="11"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="building" v="yes"/></way>'
         '<way id="12"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="building" v="yes"/></way></osm>')


def test_count_cut_counts_buildings_and_road_points(tmp_path):
    extract = tmp_path / "cut.osm"
    extract.write_text(SYNTH, encoding="utf-8")
    assert build.count_cut(extract) == (2, 3)


def test_an_over_limit_frame_is_refused_before_terrain_and_world_work(tmp_path, monkeypatch):
    extract = tmp_path / "cut.osm"
    extract.write_text(SYNTH, encoding="utf-8")
    reached = []

    def fake_build_world(rect, out, *, extract, cache, progress, tile_cache_bytes):
        region.osm_cut.cut(extract, (0, 0, 1, 1), Path(out) / "cut.osm", out)      # what build_world does first
        reached.append("terrain")
        return {}

    monkeypatch.setattr(region, "build_world", fake_build_world)
    monkeypatch.setattr(region.osm_cut, "cut", lambda extract, bbox, out, workdir: extract)
    args = build.parse(["--id", "0123456789ab", "--lv95", *map(str, RECT), "--out", str(tmp_path / "o"),
                        "--extract", str(extract), "--cache", str(tmp_path / "c"), "--max-buildings", "1"])
    with pytest.raises(build.TooComplex):
        build.build(args)
    assert reached == []


def test_the_build_is_the_first_victim_of_the_container_memory_cap(settings, tmp_path):
    note = tmp_path / "oom_score_adj"
    code = "import pathlib, sys; pathlib.Path(sys.argv[1]).write_text(pathlib.Path('/proc/self/oom_score_adj').read_text())"
    runner.run_build(JOB, settings, lambda step: None, lambda job, s, out: [sys.executable, "-c", code, str(note)])
    assert note.read_text().strip() == "1000"
    assert Path("/proc/self/oom_score_adj").read_text().strip() != "1000"      # the worker keeps its own score
