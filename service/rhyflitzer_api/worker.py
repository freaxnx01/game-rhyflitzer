"""#168: the one worker. Builds queued worlds one at a time, retries unreachable data sources twice, and runs the
nightly cleanup and the weekly extract update between builds. Run: python -m rhyflitzer_api.worker."""
from __future__ import annotations

import logging
import time

from . import extract, housekeeping, logs, roadgrid, runner
from .config import Settings
from .store import Store

log = logging.getLogger("rhyflitzer.worker")
IDLE_SECONDS = 2.0


class Worker:
    def __init__(self, settings: Settings, store: Store, build=runner.run_build, clock=time.time):
        self.settings, self.store, self.build, self.clock = settings, store, build, clock

    def start(self) -> None:
        requeued = self.store.requeue_interrupted()
        housekeeping.sweep_temp(self.settings.worlds_dir)
        log.info("Worker started; %d interrupted builds requeued", requeued, extra=logs.fields(requeued=requeued))

    def tick(self) -> None:
        now = self.clock()
        self.store.kv_set("worker_heartbeat", str(now))
        housekeeping.run_due(self.store, self.settings, now)
        extract.run_due(self.store, self.settings, now)
        roadgrid.run_due(self.store, self.settings, now)

    def run_once(self) -> bool:
        """Builds the next due job; False when there is none (or no extract yet), so the loop can idle."""
        if not self.settings.extract_path.exists():
            return False
        job = self.store.claim_next(self.clock())
        if job is None:
            return False
        self._build(job)
        return True

    def _build(self, job: dict) -> None:
        wid, started = job["id"], self.clock()
        log.info("Building world %s (attempt %d)", wid, job["attempts"], extra=logs.fields(world=wid, lv95=job["lv95"]))
        outcome = self.build(job, self.settings, lambda step: self.store.set_step(wid, step))
        self._settle(job, outcome, self.clock() - started)

    def _settle(self, job: dict, outcome: runner.Outcome, seconds: float) -> None:
        wid, now = job["id"], self.clock()
        fields = logs.fields(world=wid, seconds=round(seconds), error=outcome.error)
        if outcome.ok:
            self.store.finish_ready(wid, now, outcome.size)
            log.info("Built world %s in %.0f s (%.1f MB)", wid, seconds, outcome.size / 1e6, extra=fields)
            housekeeping.enforce_cap(self.store, self.settings)
            return
        attempts = job.get("attempts")                      # fail closed: no readable count, no retry
        if (outcome.error == "source-unreachable" and isinstance(attempts, int)
                and attempts <= self.settings.source_retries):
            self.store.retry_later(wid, now + self.settings.retry_delay, outcome.message)
            log.warning("Building world %s failed: data source unreachable; retrying in %.0f s", wid,
                        self.settings.retry_delay, extra=fields)
            return
        self.store.finish_failed(wid, now, outcome.error, outcome.message)
        log.warning("Building world %s failed: %s (%s)", wid, outcome.error, outcome.message, extra=fields)


def main() -> None:
    logs.setup()
    settings = Settings.from_env()
    w = Worker(settings, Store(settings.db_path))
    w.start()
    while True:
        w.tick()
        if not w.run_once():
            time.sleep(IDLE_SECONDS)


if __name__ == "__main__":
    main()
