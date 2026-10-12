"""#168: the HTTP API (Starlette): admission of builds, job status and health. Task 7 adds the world files and
the admin gallery. Run: uvicorn rhyflitzer_api.app:create_app --factory."""
from __future__ import annotations

import datetime as dt
import functools
import ipaddress
import hmac
import json
import logging
import math
import os
import re
import sqlite3
import time

import requests
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Route

import frame
import region

from . import challenge, logs, preview
from .config import Settings
from .store import Refused, Store, human_gate

log = logging.getLogger("rhyflitzer.api")
WORLD_ID = re.compile(r"[0-9a-f]{12}")
BBOX_HELP = "give lv95: [e0, n0, e1, n1] or lonlat: [w, s, e, n]"


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": code, "message": message}, status_code=status)


@functools.lru_cache(maxsize=8)
def _networks(trusted: tuple) -> tuple:
    return tuple(ipaddress.ip_network(net, strict=False) for net in trusted)


def _trusted(peer: str, trusted) -> bool:
    try:
        address = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(address in net for net in _networks(tuple(trusted)))


def client_ip(request: Request, hops: int, trusted=Settings.trusted_proxies) -> str:
    """The address Traefik saw: the hops-th entry from the right of X-Forwarded-For, honoured only when the socket
    peer is one of our own proxies; any other peer is the client itself. IPv6 is reduced to its /64."""
    peer = request.client.host if request.client else "unknown"
    forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if hops > 0 and len(forwarded) >= hops and _trusted(peer, trusted):
        return _subscriber(forwarded[-hops])
    return _subscriber(peer)


def _subscriber(address: str) -> str:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return address
    if ip.version == 6 and ip.ipv4_mapped:
        return str(ip.ipv4_mapped)
    if ip.version == 6:
        return str(ipaddress.ip_network(f"{ip}/64", strict=False).network_address)
    return str(ip)


def parse_rect(body) -> tuple[float, float, float, float]:
    """The unsnapped LV95 rectangle from {"lv95": [...]} or {"lonlat": [...]}; ValueError/TypeError otherwise."""
    if not isinstance(body, dict) or not ({"lv95", "lonlat"} & body.keys()):
        raise ValueError(BBOX_HELP)
    key = "lv95" if "lv95" in body else "lonlat"
    try:
        values = [float(v) for v in body[key]]
    except OverflowError:
        raise ValueError(BBOX_HELP) from None
    if len(values) != 4 or not all(math.isfinite(v) for v in values):
        raise ValueError(BBOX_HELP)
    rect = tuple(values) if key == "lv95" else frame.from_lonlat(*values)
    if not all(math.isfinite(v) for v in rect):
        raise ValueError(BBOX_HELP)
    return rect


def job_view(store: Store, row: dict) -> dict:
    view = {"id": row["id"], "state": row["state"], "step": row["step"], "error": row["error"],
            "message": row["message"], "lv95": json.loads(row["lv95"])}
    if row["state"] == "queued":
        view["position"] = store.position(row["id"])
    if row["state"] == "ready":
        view["files"] = f"/worlds/{row['id']}/"
    return view


def snapped(body) -> tuple:
    """The snapped, checked LV95 frame of a request; raises frame.FrameError, or ValueError/TypeError when malformed."""
    rect = frame.snap(*parse_rect(body))
    frame.check(rect)
    return rect


MAX_BODY = 8192


async def read_json(request: Request):
    """The JSON body, read with a size cap so an anonymous client cannot make us buffer megabytes; ValueError if bad."""
    if int(request.headers.get("content-length", "0") or 0) > MAX_BODY:
        raise BodyTooLarge
    raw = b""
    async for chunk in request.stream():
        raw += chunk
        if len(raw) > MAX_BODY:
            raise BodyTooLarge
    return json.loads(raw)


class BodyTooLarge(Exception):
    pass


async def create_job(request: Request) -> JSONResponse:
    settings, store = request.app.state.settings, request.app.state.store
    try:
        body = await read_json(request)
    except BodyTooLarge:
        return error(413, "too-large", "the request body is too large")
    except ValueError:
        return error(400, "bad-request", "the body must be JSON")
    try:
        rect = snapped(body)
    except frame.FrameError as exc:
        return error(400, exc.code, str(exc))
    except (TypeError, ValueError):
        return error(400, "bad-bbox", BBOX_HELP)
    wid, now = frame.world_id(rect, region.PIPELINE_VERSION), time.time()
    ticket = challenge.check(body.get("altcha"), settings)       # judged only if this turns out to be a NEW build
    log.info("Admitting a build of world %s", wid, extra=logs.fields(world=wid, lv95=list(rect)))
    try:
        address = client_ip(request, settings.proxy_hops, settings.trusted_proxies)
        row = store.submit(wid, rect, store.ip_hash(address, now), now, settings,
                           prev_ip_hash=store.prev_ip_hash(address, now), gate=human_gate(ticket, now))
    except Refused as exc:
        log.info("Refused a build of world %s: %s", wid, exc.code, extra=logs.fields(world=wid, code=exc.code))
        return error(exc.status, exc.code, str(exc))
    log.info("World %s is %s", wid, row["state"], extra=logs.fields(world=wid, state=row["state"]))
    return JSONResponse(job_view(store, row), status_code=200 if row["state"] == "ready" else 202)


async def get_job(request: Request) -> JSONResponse:
    store, wid = request.app.state.store, request.path_params["wid"]
    row = store.get(wid) if WORLD_ID.fullmatch(wid) else None
    if row is None:
        return error(404, "unknown", "no such world")
    return JSONResponse(job_view(store, row))


async def world_status(request: Request) -> JSONResponse:
    """#167's contract: {id, status, bbox: {lv95}}; kept after expiry (a tombstone), because the id is a hash and
    the game's "Build it again?" needs the frame back."""
    store, wid = request.app.state.store, request.path_params["wid"]
    row = store.get(wid) if WORLD_ID.fullmatch(wid) else None
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


FILES = {"world.json": ("application/json", "no-cache"),            # revalidated on every load: the play signal
         "meta.json": ("application/json", "no-cache"),
         "terrain.mmh": ("application/octet-stream", "public, max-age=86400")}
PLAY_SIGNAL = "world.json"


def _iso(now: float) -> str:
    return dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat(timespec="seconds")


def note_played(store: Store, settings: Settings, wid: str) -> None:
    """lastPlayed in the store and in meta.json, at most once per played_interval."""
    now = time.time()
    if not store.played_is_stale(wid, now, settings.played_interval):
        return
    store.mark_played(wid, now)
    path = settings.worlds_dir / wid / "meta.json"
    doc = json.loads(path.read_text("utf-8"))
    doc["lastPlayed"] = _iso(now)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)
    log.info("World %s played", wid, extra=logs.fields(world=wid))


def world_missing(row) -> JSONResponse:
    if row is None:
        return error(404, "unknown", "no such world")
    if row["state"] == "expired":
        return error(404, "expired", "This world has expired. Build it again?")
    return error(404, "not-ready", "This world is not built yet")


async def world_file(request: Request) -> Response:
    settings, store = request.app.state.settings, request.app.state.store
    wid, name = request.path_params["wid"], request.path_params["name"]
    if not WORLD_ID.fullmatch(wid) or name not in FILES:
        return error(404, "unknown", "no such file")
    row = store.get(wid)
    if row is None or row["state"] != "ready":
        return world_missing(row)
    path = settings.worlds_dir / wid / name
    if not path.is_file():                                  # eviction deleted the folder after the row was read
        return world_missing({"state": "expired"})
    if name == PLAY_SIGNAL:
        note_played(store, settings, wid)
    media, cache = FILES[name]
    return FileResponse(path, media_type=media, headers={"Cache-Control": cache})


def is_admin(request: Request, settings: Settings) -> bool:
    """Bearer token from the Docker secret file; no file or an empty file means admin is off (fail closed)."""
    path = settings.admin_token_file
    if path is None or not path.exists():
        return False
    expected = path.read_text("utf-8").strip()
    given = request.headers.get("authorization", "")
    return bool(expected) and hmac.compare_digest(given.encode(), f"Bearer {expected}".encode())


async def gallery(request: Request) -> JSONResponse:
    settings, store, wid = request.app.state.settings, request.app.state.store, request.path_params["wid"]
    if not is_admin(request, settings):
        log.warning("Refused an admin call without a valid token", extra=logs.fields(world=wid))
        return error(401, "unauthorized", "admin token required")
    row = store.get(wid) if WORLD_ID.fullmatch(wid) else None
    if row is None or row["state"] != "ready":
        return error(404, "unknown", "no such built world")
    if request.method == "DELETE":
        store.unset_gallery(wid)
        log.info("Removed world %s from the gallery", wid, extra=logs.fields(world=wid))
        return JSONResponse({"id": wid, "gallery": False})
    try:
        body = await read_json(request)
    except BodyTooLarge:
        return error(413, "too-large", "the request body is too large")
    except ValueError:
        return error(400, "bad-request", "the body must be JSON")
    if not isinstance(body, dict):
        return error(400, "bad-request", "the body must be a JSON object")
    title = str(body.get("title", "")).strip()[:80]
    if not title:
        return error(400, "bad-request", "a title is required")
    store.set_gallery(wid, title, str(body.get("description", "")).strip()[:300])
    log.info("Added world %s to the gallery as %s", wid, title, extra=logs.fields(world=wid))
    return JSONResponse({"id": wid, "gallery": True, "title": title})


async def get_challenge(request: Request) -> JSONResponse:
    log.debug("Issuing a human-check challenge")
    try:
        doc = challenge.issue(request.app.state.settings, time.time())
    except challenge.Unavailable as exc:
        log.error("Could not issue a human-check challenge: %s", exc)
        return error(503, "human-check-unavailable", "The human check is not available right now")
    return JSONResponse(doc, headers={"Cache-Control": "no-store"})


async def get_preview(request: Request) -> JSONResponse:
    state = request.app.state
    if not state.limiter.allow(client_ip(request, state.settings.proxy_hops, state.settings.trusted_proxies)):
        return error(429, "preview-rate-limit", "Too many previews; wait a moment")
    try:
        rect = snapped({"lv95": request.query_params.get("bbox", "").split(",")})
    except frame.FrameError as exc:
        return error(400, exc.code, str(exc))
    except (TypeError, ValueError):
        return error(400, "bad-bbox", "give bbox=e0,n0,e1,n1 in LV95")
    wid = frame.world_id(rect, region.PIPELINE_VERSION)
    return JSONResponse(await run_in_threadpool(preview.describe, state.store, state.settings, rect, wid,
                                                time.gmtime().tm_year, state.get, state.names))


ROUTES = [
    Route("/api/challenge", get_challenge, methods=["GET"]),
    Route("/api/preview", get_preview, methods=["GET"]),
    Route("/api/jobs", create_job, methods=["POST"]),
    Route("/api/jobs/{wid}", get_job, methods=["GET"]),
    Route("/api/worlds/{wid}", world_status, methods=["GET"]),
    Route("/api/health", health, methods=["GET"]),
    Route("/worlds/{wid}/{name}", world_file, methods=["GET"]),
]


def create_app(settings: Settings | None = None, store: Store | None = None, get=requests.get) -> Starlette:
    if settings is None:
        logs.setup()
        settings = Settings.from_env()
    store = store or Store(settings.db_path)
    cors = Middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"],
                      allow_headers=["Content-Type"])
    app = Starlette(routes=ROUTES, middleware=[cors])
    app.state.settings, app.state.store = settings, store
    app.state.get, app.state.names, app.state.limiter = get, {}, preview.Limiter(settings.preview_per_minute)
    log.info("API ready", extra=logs.fields(data=str(settings.data_dir), origins=list(settings.cors_origins)))
    return app


ADMIN_ROUTES = [Route("/api/admin/gallery/{wid}", gallery, methods=["PUT", "DELETE"])]


def create_admin_app(settings: Settings | None = None, store: Store | None = None) -> Starlette:
    """Admin only; run by the rhyflitzer-admin service on an internal port that Traefik never sees."""
    if settings is None:
        logs.setup()
        settings = Settings.from_env()
    app = Starlette(routes=ADMIN_ROUTES)
    app.state.settings, app.state.store = settings, store or Store(settings.db_path)
    return app
