import http.server
import os
import socket
import threading
from functools import partial
from pathlib import Path

import pytest
from playwright.sync_api import BrowserType

import gpu_browser
import visual_runs

ROOT = Path(__file__).parents[2]

# #324: the GPU browser (#304), opt-in via PW_CDP_ENDPOINT; resolved once per session in pytest_configure
GPU = {"endpoint": None, "launch": None}
# #332: records every session that launched a browser; wraps whatever BrowserType.launch is current (after the GPU patch)
RUNS = visual_runs.Collector()
RUN_HOOK = {"launch": None}


def _install_gpu_hook(config):
    endpoint, warning = gpu_browser.resolve_endpoint(os.environ)
    if warning:
        config.issue_config_time_warning(pytest.PytestConfigWarning(warning), stacklevel=2)
    if endpoint is None:
        return
    GPU["endpoint"], GPU["launch"] = endpoint, BrowserType.launch
    BrowserType.launch = gpu_browser.remote_launch(endpoint, BrowserType.launch)


def pytest_configure(config):
    _install_gpu_hook(config)
    RUNS.start()
    RUN_HOOK["launch"] = BrowserType.launch
    BrowserType.launch = visual_runs.counting_launch(RUNS, BrowserType.launch)


def pytest_unconfigure(config):
    if RUN_HOOK["launch"] is not None:
        BrowserType.launch = RUN_HOOK["launch"]
        RUN_HOOK["launch"] = None
    if GPU["launch"] is not None:
        BrowserType.launch = GPU["launch"]
        GPU["endpoint"] = GPU["launch"] = None


def pytest_report_header(config):
    return f"GPU browser: {GPU['endpoint'] or 'off'}"


def pytest_runtest_logstart(nodeid, location):
    RUNS.begin(nodeid)


def pytest_runtest_logfinish(nodeid, location):
    RUNS.end()


def pytest_runtest_logreport(report):
    RUNS.report(report.nodeid, report.when, report.outcome, report.duration)


def pytest_sessionfinish(session, exitstatus):
    if hasattr(session.config, "workerinput"):   # an xdist worker: the controller sees no launches
        return
    lines = visual_runs.finish_session(RUNS, os.environ, GPU["endpoint"], ROOT / ".test-runs")
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    for line in lines:
        reporter.write_line(line) if reporter else print(line)


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
