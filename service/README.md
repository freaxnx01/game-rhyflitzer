# Region editor build service (#168)

## What it is

A Starlette API plus one worker that queue, limit, build (via `pipeline/region.build_world`), serve, expire and evict
generated worlds, for the region editor on `https://github.freaxnx01.ch`. Contract and reasons:
[`docs/superpowers/specs/2026-10-10-region-editor-service-design.md`](../docs/superpowers/specs/2026-10-10-region-editor-service-design.md).

## Local development

```bash
python3 -m venv service/.venv && service/.venv/bin/pip install -r service/requirements-dev.txt
cd service && .venv/bin/python -m pytest -q
PYTHONPATH=pipeline:service DATA_DIR=/tmp/rhy uvicorn rhyflitzer_api.app:create_app --factory --reload   # from the repo root
```

## Compose services for `production/vserver/docker-compose.yml`

In the `mydocker-compose` repo; the operator adds it, this repo does not.

```yaml
  rhyflitzer-api:
    image: rhyflitzer-api:latest
    build:
      context: https://github.com/freaxnx01/game-rhyflitzer.git#main
      dockerfile: service/Dockerfile
    container_name: rhyflitzer-api
    restart: unless-stopped
    mem_limit: 512m
    environment:
      - CORS_ORIGINS=https://github.freaxnx01.ch
      - TRUSTED_PROXIES=172.18.0.0/16   # the `web` network's subnet (docker network inspect web); only Traefik may set X-Forwarded-For
      - ALTCHA_SECRET_FILE=/run/secrets/rhyflitzer_altcha_secret
    secrets:
      - rhyflitzer_altcha_secret
    volumes:
      - ./data/rhyflitzer:/data
      - ./data-no-backup/rhyflitzer/extract:/data/extract   # re-downloadable: kept out of the host's backup
      - ./data-no-backup/rhyflitzer/cache:/data/cache
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=web"
      - "traefik.http.services.rhyflitzer-api.loadbalancer.server.port=8000"
      - "traefik.http.routers.rhyflitzer-api.rule=Host(`${SUBDOMAIN_RHYFLITZER_API}.${HOST}`) && !PathPrefix(`/api/admin`)"
      - "traefik.http.routers.rhyflitzer-api.entrypoints=${ENTRYPOINT}"
      - "traefik.http.routers.rhyflitzer-api.tls.certresolver=default"
      - "traefik.http.routers.rhyflitzer-api.middlewares=myRateLimit@file"

  rhyflitzer-worker:
    image: rhyflitzer-api:latest
    container_name: rhyflitzer-worker
    command: ["python", "-m", "rhyflitzer_api.worker"]
    restart: unless-stopped
    mem_limit: 3g
    memswap_limit: 3g
    cpus: 2
    volumes:
      - ./data/rhyflitzer:/data
      - ./data-no-backup/rhyflitzer/extract:/data/extract   # re-downloadable: kept out of the host's backup
      - ./data-no-backup/rhyflitzer/cache:/data/cache
    healthcheck:
      disable: true
    labels:
      - "traefik.enable=false"

  rhyflitzer-admin:
    image: rhyflitzer-api:latest
    container_name: rhyflitzer-admin
    command: ["uvicorn", "rhyflitzer_api.app:create_admin_app", "--factory", "--host", "0.0.0.0", "--port", "8001", "--no-access-log"]
    restart: unless-stopped
    mem_limit: 256m
    environment:
      - ADMIN_TOKEN_FILE=/run/secrets/rhyflitzer_admin_token
    secrets:
      - rhyflitzer_admin_token
    volumes:
      - ./data/rhyflitzer:/data
      - ./data-no-backup/rhyflitzer/extract:/data/extract   # re-downloadable: kept out of the host's backup
      - ./data-no-backup/rhyflitzer/cache:/data/cache
    ports:
      - "127.0.0.1:8081:8001"   # the host's loopback only: reached over SSH, never routed by Traefik
    healthcheck:
      disable: true
    labels:
      - "traefik.enable=false"
```

Under the file's top-level `secrets:`: `rhyflitzer_admin_token: {file: "./secrets/rhyflitzer_admin_token.secret"}` and
`rhyflitzer_altcha_secret: {file: "./secrets/rhyflitzer_altcha_secret.secret"}` (the admin token is mounted only into
`rhyflitzer-admin`, the ALTCHA key only into `rhyflitzer-api`), and in `production/vserver/.env`:
`SUBDOMAIN_RHYFLITZER_API=rhyflitzer-api`. (Volume path: follow the file's existing convention if it differs from `./data/...`.)

The client address comes from the rightmost `X-Forwarded-For` entry, and only when the socket peer is one of
`TRUSTED_PROXIES` (set it explicitly to the `web` network's subnet or Traefik's IP; the default of loopback plus all private ranges is wider than needed; a bad value stops the boot); any other peer is the
client itself. IPv6 clients are counted per /64. On top of the limits per address, each network (the /24 of an IPv4 address, the /48
of an IPv6 one) may have 3 worlds queued or building (the fourth gets `503 busy`) and start 15 new builds a day
(`429 daily-limit`); networks are stored like addresses, as a hash with the day's salt.

## Operator checklist

[ ] **1.** Add `SUBDOMAIN_RHYFLITZER_API=rhyflitzer-api` to `production/vserver/.env` in `mydocker-compose`.

[ ] **2.** Generate the admin token (`openssl rand -hex 32`), save it in Passbolt as "rhyflitzer admin token", write it to `production/vserver/secrets/rhyflitzer_admin_token.secret` on ionos1.

[ ] **3.** Generate the ALTCHA key (`openssl rand -hex 32`), save it in Passbolt as "rhyflitzer altcha secret", write it to `production/vserver/secrets/rhyflitzer_altcha_secret.secret` on ionos1.

[ ] **4.** `chown -R 10001 ./data/rhyflitzer` and make the two secret files readable by uid 10001 (the container runs non-root).

[ ] **4b.** Set `TRUSTED_PROXIES` in the `rhyflitzer-api` block to Traefik's `web` subnet (`docker network inspect web`).

[ ] **4c.** Add the `rhyflitzer-api`, `rhyflitzer-worker` and `rhyflitzer-admin` services (no Traefik label or rule for admin) and the secrets `rhyflitzer_admin_token` and `rhyflitzer_altcha_secret` from this README to `production/vserver/docker-compose.yml`.

[ ] **5.** Create the Cloudflare CNAME `rhyflitzer-api.freaxnx01.ch` -> `freaxnx01.ch`, DNS-only (like the other VPS-DE subdomains, so an IP change touches one record; homelab-service-routing skill, "VPS-DE").

[ ] **6.** `docker compose up -d --build rhyflitzer-api rhyflitzer-worker rhyflitzer-admin`; wait for the first extract download and the road index (`docker logs -f rhyflitzer-worker`: "The road index is ready").

[ ] **7.** Check `https://rhyflitzer-api.freaxnx01.ch/api/health` (`extract: true`, `workerSeenSecondsAgo` small), `/api/challenge` and `/api/preview?bbox=...`; build one real frame (e.g. Ehrendingen) through the editor page (#169) or with the `altcha` Python package's `solve_challenge`, poll until `ready`; note build time and the worker's peak memory (`docker stats`); compare the preview's `raceOk` with the built world's `race` for 2-3 frames and tune `RACE_MIN_ROAD_M`; check that the preview of the built frame says `exists: true`.

[ ] **8.** Check that admin is not public: `curl -i https://rhyflitzer-api.freaxnx01.ch/api/admin/gallery/000000000000` must answer `404` (not `401`). Then over SSH: `ssh -N -L 8081:127.0.0.1:8081 ionos1` and `curl -i -X DELETE http://127.0.0.1:8081/api/admin/gallery/000000000000` -> `401` without a token.

[ ] **9.** Go-live of #170 (the maintainer only; this is the one place the admin token is used): build the worlds you want to show through the editor (#169), then add each with the `docker exec` one-liner above; check `https://rhyflitzer-api.freaxnx01.ch/api/gallery` lists them and the start screen shows the Worlds row.

## Admin (SSH only)

The admin routes are not on the public host. Tunnel: `ssh -N -L 8081:127.0.0.1:8081 ionos1`, then the CLI against
`RHYFLITZER_ADMIN_API=http://127.0.0.1:8081` (token from the environment, e.g. out of Passbolt). Or run it on the
server, which needs no tunnel (the CLI is `scripts/gallery.py`, shipped in the image; the token is read inside the
container and never printed):

```bash
ssh ionos1 "docker exec rhyflitzer-admin sh -c 'RHYFLITZER_ADMIN_API=http://127.0.0.1:8001 RHYFLITZER_ADMIN_TOKEN=\$(cat /run/secrets/rhyflitzer_admin_token) python scripts/gallery.py add <id> \"Title\" \"Description\"'"
```

Never paste the token into a shell history or a file in a repo.

### Curating the gallery

`python scripts/gallery.py list` prints what the start screen shows and needs no token (it reads the public
`GET /api/gallery`, which the admin listener serves too). `add <id> "Title" "Description"` adds or replaces an entry:
a replaced entry keeps its place, a world removed and added again goes last. `remove <id>` returns the world to
normal retention with a fresh 30 days. At most 50 entries are listed, and a world must be `ready`.

From a laptop: `ssh -N -L 8081:127.0.0.1:8081 ionos1`, then
`RHYFLITZER_ADMIN_TOKEN=… python3 scripts/gallery.py add …` with the token taken from Passbolt into the environment,
never as an argument (there is no `--token` flag).

## Operations

- Human check: `ALTCHA_COST` (default 5000, about 1 s on a phone; raise to tighten). Preview threshold: `RACE_MIN_ROAD_M` (default 3000).
- The worker is the same image started with `python -m rhyflitzer_api.worker` (3 GB cap, 2 cores).
- Health: `/api/health`. Logs: `docker logs rhyflitzer-worker | jq .`.
- Data lives in `/data`: `service.sqlite3`, `worlds/`, `extract/`, `cache/`. A failed extract update keeps the old file. `extract/` and `cache/` are mounted from a path the host's backup excludes (on ionos1 `~/data-no-backup/rhyflitzer`, which restic skips with `--iexclude=data-no-backup`): both are downloaded again when missing, while `worlds/` and `service.sqlite3` are backed up.
- A build runs in its own process group with `RLIMIT_AS` (`build_memory_bytes`) and `RLIMIT_CPU`; on timeout the whole group is killed. `RLIMIT_AS` is per process; the sum is capped by the worker container's `mem_limit: 3g`. The build tree runs with `oom_score_adj` 1000, so at that cap the kernel kills the build, not the worker: it shows as `build-failed` "killed by signal 9". A build the worker dies in three times is failed for good.
- Under attack: the network caps stop one address range; many unrelated networks (Tor exits, proxies) can still fill the queue of 20 (`503 busy` for everyone) or the 100 builds a day. Raise `ALTCHA_COST` in the `rhyflitzer-api` environment and restart it; each queued build then costs the sender that much more CPU.
- The preview's name lookup is bounded for all clients together (4 at once, 120 new frames a minute, a failed lookup rests for 60 s); beyond that a preview answers without a name, never with an error.
- The weekly extract download is refused over 2 GiB, after 30 minutes, or when less than 3 GiB of disk is free (the 2 GiB cap plus 1 GiB of reserve, whatever size the server announces); the previous extract stays (`docker logs rhyflitzer-worker` says which bound).
- Dependencies: the image installs `service/requirements.lock` with `--require-hashes`. After changing `pipeline/requirements.txt` or `service/requirements.txt`, regenerate it from the repo root with `uv pip compile --universal --python-version 3.12 --generate-hashes -o service/requirements.lock pipeline/requirements.txt service/requirements.txt` and commit it; regenerate it the same way to take security updates.
