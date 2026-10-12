"""#168: the worker's side of a build: start `python -m rhyflitzer_api.build` into a fresh temp dir, relay its
steps, kill it after the timeout, and publish (temp dir -> worlds/<id>, one rename) only on success."""
from __future__ import annotations

import json
import os
import resource
import signal
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Outcome:
    ok: bool
    error: str | None = None
    message: str | None = None
    size: int = 0


def temp_dir(settings, wid: str) -> Path:
    return settings.worlds_dir / f".{wid}.tmp"


def folder_size(folder) -> int:
    return sum(p.stat().st_size for p in Path(folder).rglob("*") if p.is_file())


def build_command(job: dict, settings, out: Path) -> list[str]:
    return [sys.executable, "-m", "rhyflitzer_api.build", "--id", job["id"],
            "--lv95", *[str(float(v)) for v in json.loads(job["lv95"])], "--out", str(out),
            "--extract", str(settings.extract_path), "--cache", str(settings.cache_dir),
            "--tile-cache-bytes", str(settings.tile_cache_bytes), "--max-buildings", str(settings.max_buildings),
            "--max-road-points", str(settings.max_road_points)]


def run_build(job: dict, settings, on_step, command=build_command) -> Outcome:
    out = temp_dir(settings, job["id"])
    shutil.rmtree(out, ignore_errors=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(command(job, settings, out), stdout=subprocess.PIPE, text=True, start_new_session=True,
                            preexec_fn=lambda: _limit(settings))
    result: dict = {}
    reader = threading.Thread(target=_relay, args=(proc.stdout, on_step, result), daemon=True)
    reader.start()
    try:
        proc.wait(timeout=settings.job_timeout)
    except subprocess.TimeoutExpired:
        _kill_group(proc)
        proc.wait()
        reader.join(5)
        shutil.rmtree(out, ignore_errors=True)
        return Outcome(False, "timeout", f"The build took longer than {settings.job_timeout / 60:.0f} minutes")
    _kill_group(proc)                                    # nothing the build started may outlive it
    reader.join(5)
    return _settle(job["id"], settings, out, proc.returncode, result)


def _limit(settings) -> None:
    """Runs in the child before exec: memory and CPU caps that every process of the build tree inherits."""
    resource.setrlimit(resource.RLIMIT_AS, (settings.build_memory_bytes, settings.build_memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (settings.build_cpu_seconds, settings.build_cpu_seconds))


def _kill_group(proc) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def _relay(stream, on_step, result: dict) -> None:
    for line in stream:
        kind, _, payload = line.rstrip("\n").partition(" ")
        if kind == "STEP":
            on_step(payload)
        elif kind == "RESULT":
            result.update(json.loads(payload))


def _settle(wid: str, settings, out: Path, returncode: int, result: dict) -> Outcome:
    if returncode == 0 and result.get("ok"):
        return _publish(out, settings.worlds_dir / wid)
    shutil.rmtree(out, ignore_errors=True)
    if returncode < 0:
        return Outcome(False, "build-failed", f"Build failed (killed by signal {-returncode}, e.g. the memory cap)")
    return Outcome(False, result.get("error", "build-failed"), result.get("message", "Build failed"))


def _publish(out: Path, dest: Path) -> Outcome:
    shutil.rmtree(dest, ignore_errors=True)
    os.replace(out, dest)
    return Outcome(True, size=folder_size(dest))
