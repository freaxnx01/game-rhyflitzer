"""#168: GET /api/preview: what a frame would become, answered without building. Name and Gemeinden from swisstopo's
identify service (a point request at the centre and an envelope request, cached per snapped frame); "can a race
fit" from the road index (roadgrid.py). An estimate: the build's own `race` stays authoritative."""
from __future__ import annotations

import collections
import logging
import threading
import time

import requests

from .store import Store

log = logging.getLogger("rhyflitzer.api")
IDENTIFY = "https://api3.geo.admin.ch/rest/services/api/MapServer/identify"
LAYER = "all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill"
FEW_ROADS, NO_INDEX = "few-major-roads", "no-road-index"
CACHE_SIZE = 512
EVERYBODY = "*"


class Limiter:
    """At most `per_minute` calls per client in any 60 s; kept in memory only, so no address is ever stored."""

    def __init__(self, per_minute: int, clock=time.monotonic):
        self.per_minute, self.clock, self._hits = per_minute, clock, collections.defaultdict(collections.deque)

    def allow(self, client: str) -> bool:
        now, hits = self.clock(), self._hits[client]
        while hits and now - hits[0] >= 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        if len(self._hits) > 4096:
            self._hits = collections.defaultdict(collections.deque, {k: v for k, v in self._hits.items() if v and now - v[-1] < 60})
        return True


def _identify(geometry: str, kind: str, year: int, get) -> list[str]:
    reply = get(IDENTIFY, params={"geometry": geometry, "geometryType": kind, "layers": LAYER, "tolerance": 0, "sr": 2056,
                                  "returnGeometry": "false", "timeInstant": year}, timeout=0.9)
    reply.raise_for_status()
    names = [r["attributes"]["gemname"] for r in reply.json().get("results", [])
             if r["attributes"].get("is_current_jahr", True) and r["attributes"].get("gemname")]
    return list(dict.fromkeys(names))


def gemeinden(rect, year: int, get) -> tuple[str | None, list[str]]:
    """(name, Gemeinden): the centre's Gemeinde first, then the others touching the frame; the name has at most two."""
    centre = _identify(f"{(rect[0] + rect[2]) / 2},{(rect[1] + rect[3]) / 2}", "esriGeometryPoint", year, get)[:1]
    around = _identify(",".join(str(v) for v in rect), "esriGeometryEnvelope", year, get)
    names = centre + [n for n in around if n not in centre]
    return (" · ".join(names[:2]) or None), names


class Names:
    """Names of snapped frames from swisstopo, bounded for all clients together: at most `preview_lookup_slots`
    lookups at once and `preview_lookups_per_minute` new ones a minute; a failed lookup is remembered for
    `preview_failure_ttl` seconds. Beyond a bound the answer is (None, []) at once: a preview never waits."""

    def __init__(self, get, settings, clock=time.monotonic):
        self.get, self.clock, self.failure_ttl = get, clock, settings.preview_failure_ttl
        self._slots = threading.BoundedSemaphore(settings.preview_lookup_slots)
        self._rate = Limiter(settings.preview_lookups_per_minute, clock)
        self._found, self._failed, self._lock = {}, {}, threading.Lock()

    def lookup(self, rect, year: int) -> tuple[str | None, list[str]]:
        """(name, Gemeinden) of a snapped frame; (None, []) when it failed lately or the lookups are at a bound."""
        if rect in self._found:
            return self._found[rect]
        if not self._take_slot(rect):
            log.debug("Answering a preview without a name: the lookup failed lately or lookups are at their bound")
            return None, []
        try:
            return self._ask(rect, year)
        finally:
            self._slots.release()

    def _take_slot(self, rect) -> bool:
        """Takes a lookup slot (lookup() gives it back) unless the frame failed lately or a bound is reached."""
        with self._lock:
            if self.clock() < self._failed.get(rect, 0.0):
                return False
            if not self._slots.acquire(blocking=False):
                return False
            if not self._rate.allow(EVERYBODY):
                self._slots.release()
                return False
            return True

    def _ask(self, rect, year: int) -> tuple[str | None, list[str]]:
        log.debug("Looking up the Gemeinden of a preview")
        try:
            found = gemeinden(rect, year, self.get)
        except (requests.RequestException, ValueError, KeyError):
            log.warning("Looking up the Gemeinden of a preview failed; answering without a name for %.0f s",
                        self.failure_ttl, exc_info=True)
            self._remember(self._failed, rect, self.clock() + self.failure_ttl)
            return None, []
        self._remember(self._found, rect, found)
        log.debug("Looked up the Gemeinden of a preview")
        return found

    @staticmethod
    def _remember(cache: dict, rect, value) -> None:
        if len(cache) >= CACHE_SIZE:
            cache.clear()
        cache[rect] = value


def describe(store: Store, settings, rect, wid: str, year: int, names: Names) -> dict:
    """id and exists (a POST would only join or read the world: no human check), name, Gemeinden, raceOk."""
    name, found = names.lookup(rect, year)
    meters = store.major_meters(rect)
    answer = {"id": wid, "exists": store.exists(wid), "name": name, "gemeinden": found, "raceOk": None if meters is None else meters >= settings.race_min_road_m}
    if meters is None:
        answer["reason"] = NO_INDEX
    elif not answer["raceOk"]:
        answer["reason"] = FEW_ROADS
    return answer