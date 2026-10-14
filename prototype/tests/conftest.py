import http.server
import os
import socket
import threading
from functools import partial
from pathlib import Path

import pytest
from playwright.sync_api import BrowserType

import gpu_browser

ROOT = Path(__file__).parents[2]

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


@pytest.fixture(scope="session")
def server():
    bind, host = gpu_browser.bind_for(GPU["endpoint"])
    s = socket.socket(); s.bind((bind, 0)); port = s.getsockname()[1]; s.close()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((bind, port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://{host}:{port}"
    httpd.shutdown()


class _CorsHandler(http.server.SimpleHTTPRequestHandler):
    """The game page and the world host are different origins in production, so the fixture host allows cross-origin reads."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture(scope="session")
def world_host(tmp_path_factory):
    """#167: a local world host serving a temp directory (worlds/<id>/..., api/worlds/<id>). Yields (url, root)."""
    root = tmp_path_factory.mktemp("worldhost")
    bind, host = gpu_browser.bind_for(GPU["endpoint"])
    s = socket.socket(); s.bind((bind, 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer((bind, port), partial(_CorsHandler, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://{host}:{port}", root
    httpd.shutdown()
