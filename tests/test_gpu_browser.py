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
