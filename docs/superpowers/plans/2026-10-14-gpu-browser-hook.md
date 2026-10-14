# Opt-in GPU browser hook — implementation plan (#324)

**Goal:** with `PW_CDP_ENDPOINT` set and reachable, every `p.chromium.launch(...)` in the Python tests connects to the GPU browser over CDP and the test servers listen on the LAN; otherwise nothing changes.

**Architecture:** pure helpers in a new `prototype/tests/gpu_browser.py`; `prototype/tests/conftest.py` resolves the endpoint once in `pytest_configure`, patches `BrowserType.launch` for the session, and picks the bind address in the two server fixtures. No other test file changes.

**Global constraints**

- Touch only `prototype/tests/gpu_browser.py` (new), `prototype/tests/test_gpu_browser.py` (new) and `prototype/tests/conftest.py`.
- No new dependencies: standard library plus the Playwright already installed.
- The pipeline has no GPU browser: the new unit tests must not need one, and must not start a browser.
- No CHANGELOG entry: this is test tooling, nothing changes in the game.
- Run the verification in the foreground.

---

## Task 1 — the helpers, test first

**Files:** create `prototype/tests/gpu_browser.py`, create `prototype/tests/test_gpu_browser.py`.

**Interfaces:**

- `ENV = "PW_CDP_ENDPOINT"`
- `endpoint_from(env: Mapping[str, str]) -> str | None` — the stripped value, `None` when unset or blank.
- `reachable(endpoint: str, timeout: float = 3) -> bool` — `GET <endpoint>/json/version` answers 200.
- `resolve_endpoint(env, probe=reachable) -> tuple[str | None, str | None]` — `(endpoint, None)` when set and reachable, `(None, warning)` when set but unreachable, `(None, None)` when unset.
- `lan_host_for(endpoint: str) -> str` — the local IPv4 address used to reach the endpoint's host.
- `bind_for(endpoint: str | None) -> tuple[str, str]` — `(bind address, URL host)`: `("127.0.0.1", "127.0.0.1")` for `None`, `("0.0.0.0", lan_host_for(endpoint))` otherwise.
- `remote_launch(endpoint: str, original)` — a replacement for `BrowserType.launch` that returns `self.connect_over_cdp(endpoint)` for chromium and calls `original` for any other browser type.

### Step 1.1 — write the failing tests

`prototype/tests/test_gpu_browser.py`:

```python
"""#324: the opt-in GPU browser switch. No browser is started here: the pipeline has no GPU browser."""
import http.server
import socket
import threading

import gpu_browser


def _serve(status):
    """A local server whose /json/version answers `status`; returns (url, shutdown)."""
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(status if self.path == "/json/version" else 404)
            self.end_headers()

        def log_message(self, *args):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_address[1]}", httpd.shutdown


def _closed_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    return f"http://127.0.0.1:{port}"


def test_endpoint_is_off_when_the_variable_is_unset_or_blank():
    assert gpu_browser.endpoint_from({}) is None
    assert gpu_browser.endpoint_from({"PW_CDP_ENDPOINT": ""}) is None
    assert gpu_browser.endpoint_from({"PW_CDP_ENDPOINT": "   "}) is None


def test_endpoint_is_the_stripped_value_when_set():
    assert gpu_browser.endpoint_from({"PW_CDP_ENDPOINT": " http://gpu:9223 "}) == "http://gpu:9223"


def test_reachable_when_json_version_answers_200():
    url, stop = _serve(200)
    try:
        assert gpu_browser.reachable(url)
        assert gpu_browser.reachable(url + "/")
    finally:
        stop()


def test_not_reachable_on_an_error_status_or_a_closed_port():
    url, stop = _serve(500)
    try:
        assert not gpu_browser.reachable(url)
    finally:
        stop()
    assert not gpu_browser.reachable(_closed_port(), timeout=1)


def test_resolve_is_off_without_a_warning_when_unset():
    assert gpu_browser.resolve_endpoint({}, probe=lambda e: True) == (None, None)


def test_resolve_uses_a_reachable_endpoint():
    env = {"PW_CDP_ENDPOINT": "http://gpu:9223"}
    assert gpu_browser.resolve_endpoint(env, probe=lambda e: True) == ("http://gpu:9223", None)


def test_resolve_falls_back_with_a_warning_naming_an_unreachable_endpoint():
    env = {"PW_CDP_ENDPOINT": "http://gpu:9223"}
    endpoint, warning = gpu_browser.resolve_endpoint(env, probe=lambda e: False)
    assert endpoint is None
    assert "http://gpu:9223" in warning and "local browser" in warning


def test_bind_stays_on_loopback_when_off():
    assert gpu_browser.bind_for(None) == ("127.0.0.1", "127.0.0.1")


def test_bind_opens_to_the_lan_when_on():
    assert gpu_browser.bind_for("http://127.0.0.1:9223") == ("0.0.0.0", "127.0.0.1")


class _FakeBrowserType:
    def __init__(self, name):
        self.name = name
        self.cdp = None

    def connect_over_cdp(self, endpoint):
        self.cdp = endpoint
        return "remote browser"


def test_remote_launch_connects_chromium_over_cdp_and_ignores_the_launch_args():
    launch = gpu_browser.remote_launch("http://gpu:9223", original=lambda self, *a, **k: "local browser")
    chromium = _FakeBrowserType("chromium")
    assert launch(chromium, args=["--use-angle=swiftshader"]) == "remote browser"
    assert chromium.cdp == "http://gpu:9223"


def test_remote_launch_keeps_the_original_for_other_browser_types():
    launch = gpu_browser.remote_launch("http://gpu:9223", original=lambda self, *a, **k: "local browser")
    firefox = _FakeBrowserType("firefox")
    assert launch(firefox, headless=True) == "local browser"
    assert firefox.cdp is None
```

### Step 1.2 — run them, see them fail

```bash
cd prototype/tests && ../../pipeline/.venv/bin/python -m pytest test_gpu_browser.py -q
```

Expected: collection error, `ModuleNotFoundError: No module named 'gpu_browser'`. (If `pipeline/.venv` doesn't exist in the runner, use whichever Python has pytest + Playwright, as the other Python tests do.)

### Step 1.3 — write the module

`prototype/tests/gpu_browser.py`:

```python
"""#324: the opt-in GPU browser (#304). With PW_CDP_ENDPOINT set and reachable, the tests' chromium.launch() connects to that
remote Chromium over CDP and the test servers listen on the LAN; unset or unreachable, nothing changes. conftest.py wires it."""
import socket
import urllib.request
from urllib.parse import urlparse

ENV = "PW_CDP_ENDPOINT"


def endpoint_from(env):
    value = (env.get(ENV) or "").strip()
    return value or None


def reachable(endpoint, timeout=3):
    try:
        with urllib.request.urlopen(endpoint.rstrip("/") + "/json/version", timeout=timeout) as response:
            return response.status == 200
    except OSError:   # URLError, HTTPError, refused, timeout
        return False


def resolve_endpoint(env, probe=reachable):
    endpoint = endpoint_from(env)
    if endpoint is None:
        return None, None
    if not probe(endpoint):
        return None, f"{ENV}={endpoint} is not reachable; using the local browser"
    return endpoint, None


def lan_host_for(endpoint):
    """The local IPv4 address this machine uses to reach the endpoint's host (a UDP connect sends nothing)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((urlparse(endpoint).hostname, 9))
        return s.getsockname()[0]
    finally:
        s.close()


def bind_for(endpoint):
    if endpoint is None:
        return "127.0.0.1", "127.0.0.1"
    return "0.0.0.0", lan_host_for(endpoint)


def remote_launch(endpoint, original):
    """A BrowserType.launch replacement: chromium connects to the GPU browser (its launch args don't apply there)."""
    def launch(self, *args, **kwargs):
        if self.name != "chromium":
            return original(self, *args, **kwargs)
        return self.connect_over_cdp(endpoint)
    return launch
```

### Step 1.4 — run them, see them pass

```bash
cd prototype/tests && ../../pipeline/.venv/bin/python -m pytest test_gpu_browser.py -q
```

Expected: `11 passed`.

### Step 1.5 — commit

```bash
git add prototype/tests/gpu_browser.py prototype/tests/test_gpu_browser.py
git commit -m "test: helpers for the opt-in GPU browser (#324)"
```

---

## Task 2 — wire it into conftest.py

**Files:** modify `prototype/tests/conftest.py`.

### Step 2.1 — imports and session hooks

Add to the imports (keep the existing ones):

```python
import os

from playwright.sync_api import BrowserType

import gpu_browser
```

Below `ROOT = ...`, add:

```python
# #324: the GPU browser (#304), opt-in via PW_CDP_ENDPOINT; resolved once per session in pytest_configure
GPU = {"endpoint": None, "launch": None}


def pytest_configure(config):
    endpoint, warning = gpu_browser.resolve_endpoint(os.environ)
    if warning:
        config.issue_config_time_warning(pytest.PytestConfigWarning(warning), stacklevel=2)
    if endpoint is None:
        return
    GPU["endpoint"], GPU["launch"] = endpoint, BrowserType.launch
    BrowserType.launch = gpu_browser.remote_launch(endpoint, BrowserType.launch)


def pytest_unconfigure(config):
    if GPU["launch"] is not None:
        BrowserType.launch = GPU["launch"]
        GPU["endpoint"] = GPU["launch"] = None


def pytest_report_header(config):
    return f"GPU browser: {GPU['endpoint'] or 'off'}"
```

### Step 2.2 — the two server fixtures

In `server`, replace the body so the bind address and the URL host come from `bind_for`:

```python
@pytest.fixture(scope="session")
def server():
    bind, host = gpu_browser.bind_for(GPU["endpoint"])
    s = socket.socket(); s.bind((bind, 0)); port = s.getsockname()[1]; s.close()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((bind, port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://{host}:{port}"
    httpd.shutdown()
```

In `world_host`, the same change: `bind, host = gpu_browser.bind_for(GPU["endpoint"])` at the top, `s.bind((bind, 0))`, `ThreadingHTTPServer((bind, port), ...)`, and `yield f"http://{host}:{port}", root`. Leave the docstring and everything else as it is.

### Step 2.3 — verify, GPU browser off (this is what the pipeline sees)

```bash
cd prototype/tests && unset PW_CDP_ENDPOINT && ../../pipeline/.venv/bin/python -m pytest test_gpu_browser.py test_kreisel.py -q
```

Expected: the header line `GPU browser: off`, all tests pass. `test_kreisel.py` is a one-test browser file and proves the fixtures still serve on loopback.

### Step 2.4 — verify the fallback

```bash
cd prototype/tests && PW_CDP_ENDPOINT=http://127.0.0.1:9 ../../pipeline/.venv/bin/python -m pytest test_gpu_browser.py -q
```

Expected: a `PytestConfigWarning` naming `http://127.0.0.1:9 ... local browser`, header `GPU browser: off`, `11 passed`.

### Step 2.5 — commit and open the PR

```bash
git add prototype/tests/conftest.py
git commit -m "test: connect the Playwright tests to the GPU browser when PW_CDP_ENDPOINT is set (#324)"
```

PR body: say that the on-path (a real GPU browser) can only be checked from the homelab, and leave that check to the maintainer:

```bash
PW_CDP_ENDPOINT=http://<gpu-browser>:9223 pytest prototype/tests/test_kreisel.py
```
