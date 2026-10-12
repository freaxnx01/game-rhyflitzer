"""#168: the service's settings. Deployment knobs come from the environment (12-factor); the limits are the
design's table (spec section 2) and change only with a code review."""
from __future__ import annotations

import os
import ipaddress
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ORIGIN = "https://github.freaxnx01.ch"


def parse_networks(text: str) -> tuple[str, ...]:
    """Comma-separated addresses or CIDRs, stripped and normalised; ValueError on a bad entry, so the boot fails."""
    return tuple(str(ipaddress.ip_network(part.strip(), strict=False)) for part in text.split(",") if part.strip())


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    cors_origins: tuple[str, ...] = (DEFAULT_ORIGIN,)
    admin_token_file: Path | None = None
    trusted_proxies: tuple[str, ...] = ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7", "::1/128")
    proxy_hops: int = 1                       # X-Forwarded-For entries added by our own proxies (Traefik)
    max_queue: int = 20
    per_ip_active: int = 1
    per_ip_daily: int = 5
    global_daily: int = 100
    job_timeout: float = 600.0
    build_memory_bytes: int = 4 * 1024**3     # RLIMIT_AS on the build process (the container cap is 3 GB resident)
    build_cpu_seconds: int = 1200             # RLIMIT_CPU on the build: two cores for the whole job timeout
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
    altcha_secret_file: Path | None = None    # HMAC key of the human check (Docker secret); none: fails closed
    altcha_cost: int = 5000                   # PBKDF2/SHA-256 iterations per try; one try in 256 succeeds
    altcha_ttl: float = 600.0                 # a challenge, and so its solution, is good for 10 minutes
    race_min_road_m: int = 3000               # metres of major road in a frame before a race looks feasible
    preview_per_minute: int = 60

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
        secret = env.get("ALTCHA_SECRET_FILE")
        return cls(data_dir=Path(env["DATA_DIR"]), cors_origins=origins,
                   admin_token_file=Path(token) if token else None, proxy_hops=int(env.get("PROXY_HOPS", "1")),
                   **({"trusted_proxies": parse_networks(env["TRUSTED_PROXIES"])} if env.get("TRUSTED_PROXIES") else {}),
                   altcha_secret_file=Path(secret) if secret else None, altcha_cost=int(env.get("ALTCHA_COST", "5000")),
                   race_min_road_m=int(env.get("RACE_MIN_ROAD_M", "3000")))
