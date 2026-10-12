"""#168: the service's settings. Deployment knobs come from the environment (12-factor); the limits are the
design's table (spec section 2) and change only with a code review."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ORIGIN = "https://github.freaxnx01.ch"


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    cors_origins: tuple[str, ...] = (DEFAULT_ORIGIN,)
    admin_token_file: Path | None = None
    proxy_hops: int = 1                       # X-Forwarded-For entries added by our own proxies (Traefik)
    max_queue: int = 20
    per_ip_active: int = 1
    per_ip_daily: int = 5
    global_daily: int = 100
    job_timeout: float = 600.0
    max_buildings: int = 20_000
    max_road_points: int = 50_000
    retention_days: int = 30
    store_cap_bytes: int = 10 * 1024**3
    tile_cache_bytes: int = 1_000_000_000     # per swisstopo collection
    played_interval: float = 3600.0
    source_retries: int = 2
    retry_delay: float = 30.0
    cleanup_hour_utc: int = 3
    extract_weekday: int = 0                  # Monday
    extract_hour_utc: int = 4
    extract_url: str = "https://download.geofabrik.de/europe/switzerland-latest.osm.pbf"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "service.sqlite3"

    @property
    def worlds_dir(self) -> Path:
        return self.data_dir / "worlds"

    @property
    def extract_path(self) -> Path:
        return self.data_dir / "extract" / "switzerland-latest.osm.pbf"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @classmethod
    def from_env(cls, env=None) -> "Settings":
        env = os.environ if env is None else env
        if not env.get("DATA_DIR"):
            raise ValueError("DATA_DIR must be set (the volume holding the database, worlds and extract)")
        origins = tuple(o.strip() for o in env.get("CORS_ORIGINS", DEFAULT_ORIGIN).split(",") if o.strip())
        token = env.get("ADMIN_TOKEN_FILE")
        return cls(data_dir=Path(env["DATA_DIR"]), cors_origins=origins,
                   admin_token_file=Path(token) if token else None, proxy_hops=int(env.get("PROXY_HOPS", "1")))
