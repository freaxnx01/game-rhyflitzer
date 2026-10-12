"""#168: the HTTP API (Starlette): admission of builds, job status and health. Task 7 adds the world files and
the admin gallery. Run: uvicorn rhyflitzer_api.app:create_app --factory."""
from __future__ import annotations

import json
import logging
import math
import re
import sqlite3
import time

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

import frame
import region

from . import logs
from .config import Settings
from .store import Refused, Store

log = logging.getLogger("rhyflitzer.api")
WORLD_ID = re.compile(r"^[0-9a-f]{12}$")
BBOX_HELP = "give lv95: [e0, n0, e1, n1] or lonlat: [w, s, e, n]"


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": code, "message": message}, status_code=status)


def client_ip(request: Request, hops: int) -> str:
    """The address Traefik saw: the hops-th entry from the right of X-Forwarded-For (it appends, never trusts)."""
    forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if hops > 0 and len(forwarded) >= hops:
        return forwarded[-hops]
    return request.client.host if request.client else "unknown"


def parse_rect(body) -> tuple[float, float, float, float]:
    """The unsnapped LV95 rectangle from {"lv95": [...]} or {"lonlat": [...]}; ValueError/TypeError otherwise."""
    if not isinstance(body, dict) or not ({"lv95", "lonlat"} & body.keys()):
        raise ValueError(BBOX_HELP)
    key = "lv95" if "lv95" in body else "lonlat"
    values = [float(v) for v in body[key]]
    if len(values) != 4 or not all(math.isfinite(v) for v in values):
        raise ValueError(BBOX_HELP)
    return tuple(values) if key == "lv95" else frame.from_lonlat(*values)


def job_view(store: Store, row: dict) -> dict:
    view = {"id": row["id"], "state": row["state"], "step": row["step"], "error": row["error"],
            "message": row["message"], "lv95": json.loads(row["lv95"])}
    if row["state"] == "queued":
        view["position"] = store.position(row["id"])
    if row["state"] == "ready":
        view["files"] = f"/worlds/{row['id']}/"
    return view


async def create_job(request: Request) -> JSONResponse:
    settings, store = request.app.state.settings, request.app.state.store
    try:
        body = await request.json()
    except ValueError:
        return error(400, "bad-request", "the body must be JSON")
    try:
        rect = frame.snap(*parse_rect(body))
        frame.check(rect)
    except frame.FrameError as exc:
        return error(400, exc.code, str(exc))
    except (TypeError, ValueError):
        return error(400, "bad-bbox", BBOX_HELP)
    wid, now = frame.world_id(rect, region.PIPELINE_VERSION), time.time()
    log.info("Admitting a build of world %s", wid, extra=logs.fields(world=wid, lv95=list(rect)))
    try:
        row = store.submit(wid, rect, store.ip_hash(client_ip(request, settings.proxy_hops), now), now, settings)
    except Refused as exc:
        log.info("Refused a build of world %s: %s", wid, exc.code, extra=logs.fields(world=wid, code=exc.code))
        return error(exc.status, exc.code, str(exc))
    log.info("World %s is %s", wid, row["state"], extra=logs.fields(world=wid, state=row["state"]))
    return JSONResponse(job_view(store, row), status_code=200 if row["state"] == "ready" else 202)


async def get_job(request: Request) -> JSONResponse:
    store, wid = request.app.state.store, request.path_params["wid"]
    row = store.get(wid) if WORLD_ID.match(wid) else None
    if row is None:
        return error(404, "unknown", "no such world")
    return JSONResponse(job_view(store, row))


async def world_status(request: Request) -> JSONResponse:
    """#167's contract: {id, status, bbox: {lv95}}; kept after expiry (a tombstone), because the id is a hash and
    the game's "Build it again?" needs the frame back."""
    store, wid = request.app.state.store, request.path_params["wid"]
    row = store.get(wid) if WORLD_ID.match(wid) else None
    if row is None:
        return error(404, "unknown", "no such world")
    return JSONResponse({"id": wid, "status": row["state"], "bbox": {"lv95": json.loads(row["lv95"])}})


async def health(request: Request) -> JSONResponse:
    settings, store = request.app.state.settings, request.app.state.store
    try:
        counts, stored, beat = store.counts(), store.stored_bytes(), store.kv_get("worker_heartbeat")
    except sqlite3.Error:
        log.exception("Health check failed: the database is not readable")
        return JSONResponse({"status": "error"}, status_code=503)
    return JSONResponse({"status": "ok", "queued": counts.get("queued", 0), "building": counts.get("building", 0),
                         "worlds": counts.get("ready", 0), "storedBytes": stored,
                         "extract": settings.extract_path.exists(),
                         "workerSeenSecondsAgo": round(time.time() - float(beat)) if beat else None})


ROUTES = [
    Route("/api/jobs", create_job, methods=["POST"]),
    Route("/api/jobs/{wid}", get_job, methods=["GET"]),
    Route("/api/worlds/{wid}", world_status, methods=["GET"]),
    Route("/api/health", health, methods=["GET"]),
]


def create_app(settings: Settings | None = None, store: Store | None = None) -> Starlette:
    if settings is None:
        logs.setup()
        settings = Settings.from_env()
    store = store or Store(settings.db_path)
    cors = Middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"],
                      allow_headers=["Content-Type"])
    app = Starlette(routes=ROUTES, middleware=[cors])
    app.state.settings, app.state.store = settings, store
    log.info("API ready", extra=logs.fields(data=str(settings.data_dir), origins=list(settings.cors_origins)))
    return app
