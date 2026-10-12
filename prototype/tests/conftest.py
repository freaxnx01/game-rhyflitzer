import http.server
import socket
import threading
from functools import partial
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[2]


@pytest.fixture(scope="session")
def server():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{port}"
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
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(_CorsHandler, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{port}", root
    httpd.shutdown()
