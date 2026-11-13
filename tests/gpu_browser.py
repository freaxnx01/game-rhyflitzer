"""#324: the opt-in GPU browser (#304). With PW_CDP_ENDPOINT set and reachable, the tests' chromium.launch() connects to that
remote Chromium over CDP and the test servers listen on the LAN; unset or unreachable, nothing changes. conftest.py wires it."""
import socket
import subprocess
import time
import urllib.request
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError

ENV = "PW_CDP_ENDPOINT"
RESTART_ENV = "PW_CDP_RESTART"   # #746: a shell command that restarts the browser (CI sets it; the GPU browser's systemd restarts itself)
CONNECT_TIMEOUT_MS = 30000       # #746: Playwright's 180 s let one hung browser run every later test of a shard into its 30 min
COMEBACK_S = 60                  # how long to wait for a browser that is restarting


def endpoint_from(env):
    value = (env.get(ENV) or "").strip()
    return value or None


def restart_from(env):
    value = (env.get(RESTART_ENV) or "").strip()
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


def is_remote(endpoint):
    """#879: a browser on another machine opens the test pages on a LAN address, never on localhost."""
    return endpoint is not None and urlparse(endpoint).hostname not in ("127.0.0.1", "localhost")


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


def run_shell(command):
    subprocess.run(command, shell=True, check=False, timeout=COMEBACK_S)


def remote_launch(endpoint, original, restart=None, probe=reachable, run=run_shell, sleep=time.sleep):
    """A BrowserType.launch replacement: chromium connects to the GPU browser (its launch args don't apply there).
    #746: a browser that is gone is waited for (restarted first when `restart` is set); a connect that hangs restarts it
    once and connects again, so one dead browser costs one test instead of the rest of the shard."""
    def wait_for_browser():
        for _ in range(COMEBACK_S):
            if probe(endpoint):
                return
            sleep(1)

    def recover():
        if restart:
            run(restart)
        wait_for_browser()

    def launch(self, *args, **kwargs):
        if self.name != "chromium":
            return original(self, *args, **kwargs)
        if not probe(endpoint):
            recover()
        try:
            return self.connect_over_cdp(endpoint, timeout=CONNECT_TIMEOUT_MS)
        except PlaywrightError:
            recover()
            return self.connect_over_cdp(endpoint, timeout=CONNECT_TIMEOUT_MS)
    return launch
