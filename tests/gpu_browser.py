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
