from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]


def test_dockerfile_has_osmium_node20_nonroot_and_the_factory():
    text = (SERVICE / "Dockerfile").read_text()
    assert "FROM node:22-bookworm-slim@sha256:" in text and " AS node" in text and "COPY --from=node /usr/local/bin/node" in text
    assert "osmium-tool" in text and "USER app" in text
    assert '"rhyflitzer_api.app:create_app", "--factory"' in text
    for path in ("pipeline/", "prototype/", "service/rhyflitzer_api/"):
        assert f"COPY {path}" in text


def test_runtime_dependencies_are_exactly_these():
    lines = [l for l in (SERVICE / "requirements.txt").read_text().splitlines() if l.strip()]
    assert [l.split(">")[0] for l in lines] == ["starlette", "uvicorn", "altcha"]


def test_readme_documents_the_worker_cap_and_the_secret():
    text = (SERVICE / "README.md").read_text()
    assert "mem_limit: 3g" in text and "rhyflitzer_admin_token" in text and "python -m rhyflitzer_api.worker" in text
    assert "rhyflitzer_altcha_secret" in text and "ALTCHA_SECRET_FILE" in text


def test_base_images_are_pinned_by_digest():
    froms = [l for l in (SERVICE / "Dockerfile").read_text().splitlines() if l.startswith("FROM ")]
    assert froms and all("@sha256:" in l for l in froms)


def test_readme_sets_trusted_proxies_and_the_data_owner():
    text = (SERVICE / "README.md").read_text()
    assert "TRUSTED_PROXIES=" in text.split("  rhyflitzer-worker:")[0] and "chown -R 10001" in text


def test_admin_stays_off_traefik():
    text = (SERVICE / "README.md").read_text()
    assert "!PathPrefix(`/api/admin`)" in text and "create_admin_app" in text and "127.0.0.1:8081:8001" in text
    admin = text.split("  rhyflitzer-admin:")[1].split("\n```")[0]
    assert "traefik.enable=true" not in admin and "traefik.http" not in admin and "- web" not in admin
    assert "rhyflitzer_admin_token" not in text.split("  rhyflitzer-worker:")[0]


def test_the_image_installs_only_pinned_hashed_dependencies():
    docker = (SERVICE / "Dockerfile").read_text()
    assert "pip install --no-cache-dir --require-hashes -r service/requirements.lock" in docker
    assert "-r pipeline/requirements.txt" not in docker and "-r service/requirements.txt" not in docker
    assert "!service/requirements.lock" in (SERVICE / "Dockerfile.dockerignore").read_text().splitlines()
    lock = (SERVICE / "requirements.lock").read_text()
    pins = [line for line in lock.splitlines() if line and not line.startswith((" ", "#"))]
    assert pins and all("==" in line and line.endswith("\\") for line in pins)
    assert lock.count("--hash=sha256:") >= len(pins)
    names = {line.split("==")[0].lower() for line in pins}
    assert {"starlette", "uvicorn", "altcha", "numpy", "rasterio", "pyproj", "requests", "osmium", "shapely", "scipy"} <= names
