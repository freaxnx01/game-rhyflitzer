"""#324: the opt-in GPU browser switch. No browser is started here: the pipeline has no GPU browser."""
import http.server
import socket
import threading

import gpu_browser
import pytest
from playwright.sync_api import Error as PlaywrightError


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
    def __init__(self, name, hangs=0):
        self.name = name
        self.cdp = None
        self.timeouts = []
        self.hangs = hangs          # how many connects time out before one succeeds

    def connect_over_cdp(self, endpoint, timeout=None):
        self.timeouts.append(timeout)
        if self.hangs:
            self.hangs -= 1
            raise PlaywrightError("BrowserType.connect_over_cdp: Timeout exceeded")
        self.cdp = endpoint
        return "remote browser"


def _launch(probe=lambda e: True, restart=None, calls=None):
    """remote_launch with a fake probe, a recorded restart and no real waiting."""
    def run(command):
        calls.append(command)
    return gpu_browser.remote_launch("http://gpu:9223", original=lambda self, *a, **k: "local browser", restart=restart,
                                     probe=probe, run=run, sleep=lambda s: None)


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


def test_remote_launch_connects_with_a_short_timeout():
    """#746: a hung browser answered every later connect only after 180 s, so one hang ran a whole shard into its 30 min."""
    chromium = _FakeBrowserType("chromium")
    assert _launch(calls=[])(chromium) == "remote browser"
    assert chromium.timeouts == [gpu_browser.CONNECT_TIMEOUT_MS] and gpu_browser.CONNECT_TIMEOUT_MS <= 30000


def test_remote_launch_restarts_a_hung_browser_and_connects_again():
    calls, chromium = [], _FakeBrowserType("chromium", hangs=1)
    assert _launch(restart="restart-chrome", calls=calls)(chromium) == "remote browser"
    assert calls == ["restart-chrome"] and len(chromium.timeouts) == 2


def test_remote_launch_gives_up_after_one_restart():
    calls, chromium = [], _FakeBrowserType("chromium", hangs=2)
    with pytest.raises(PlaywrightError):
        _launch(restart="restart-chrome", calls=calls)(chromium)
    assert calls == ["restart-chrome"]


def test_remote_launch_waits_for_a_browser_that_is_coming_back():
    """The GPU browser's systemd restarts Chrome a few seconds after an OOM kill: wait for it instead of failing at once."""
    answers = iter([False, False, True, True])
    calls, chromium = [], _FakeBrowserType("chromium")
    assert _launch(probe=lambda e: next(answers), calls=calls)(chromium) == "remote browser"
    assert calls == []                                                   # no restart command set: only waited


def test_remote_launch_runs_the_restart_command_when_the_browser_is_gone():
    answers = iter([False, True, True])
    calls, chromium = [], _FakeBrowserType("chromium")
    assert _launch(probe=lambda e: next(answers), restart="restart-chrome", calls=calls)(chromium) == "remote browser"
    assert calls == ["restart-chrome"]


def test_restart_command_comes_from_the_environment():
    assert gpu_browser.restart_from({}) is None
    assert gpu_browser.restart_from({"PW_CDP_RESTART": "  bash restart.sh "}) == "bash restart.sh"
