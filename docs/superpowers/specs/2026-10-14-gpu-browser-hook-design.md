# Opt-in GPU browser for the Playwright tests (#324)

## Goal

Local test runs on agent-dev can use the GPU browser (#304) by setting one environment variable, without touching the ~50 test files. Unset, or set but unreachable, everything behaves exactly as today. The pipeline never sets it.

## Design

- **Switch:** `PW_CDP_ENDPOINT`, e.g. `http://<gpu-browser>:9223` (the GPU browser's CDP relay). Empty or whitespace counts as unset.
- **Resolution, once per session** (`pytest_configure` in `prototype/tests/conftest.py`): if the endpoint is set, `GET <endpoint>/json/version` with a 3 s timeout. 200 → GPU browser on; anything else → a warning and the local browser.
- **Redirect every launch:** with the GPU browser on, `playwright.sync_api.BrowserType.launch` is patched for the session, so `p.chromium.launch(args=...)` returns `p.chromium.connect_over_cdp(endpoint)`. The launch arguments (SwiftShader flags, `--autoplay-policy`) are ignored; the remote Chromium has its own GPU flags. A non-chromium `BrowserType` keeps the original launch. `browser.close()` on a CDP browser closes the contexts the test made and disconnects; the remote browser keeps running.
- **Reachable test servers:** the `server` and `world_host` fixtures bind `0.0.0.0` instead of `127.0.0.1` when the GPU browser is on, and yield `http://<lan-ip>:<port>`, where `<lan-ip>` is the local address used to reach the endpoint's host (UDP-socket trick, no packet sent). Off, they are unchanged.
- **Visibility:** `pytest_report_header` prints `GPU browser: <endpoint>` or `GPU browser: off`, so a log shows which renderer a run used.
- **Helpers in their own module**, `prototype/tests/gpu_browser.py` (pure functions: `endpoint_from`, `reachable`, `lan_host_for`, `remote_launch`), unit-tested without a browser in `prototype/tests/test_gpu_browser.py`.

## Acceptance criteria

1. `PW_CDP_ENDPOINT` unset or empty → the fixtures bind `127.0.0.1`, `BrowserType.launch` is untouched, the header says `GPU browser: off`.
2. Set and reachable → every `p.chromium.launch(...)` connects over CDP to that endpoint, and the fixtures serve on the LAN address.
3. Set but unreachable → one warning naming the endpoint, then behaviour as in 1.
4. The unit tests in `test_gpu_browser.py` cover 1–3 without starting a browser, and pass.
5. No test file other than `conftest.py` and the new two files changes.

## Out of scope

- The pipeline (GitHub-hosted runners can't reach the homelab); a self-hosted test runner is parked as agent-workflow#529.
- Frame-rate-dependent tests that fail at real frame rates (#317): those get fixed in their own issues, not hidden here.
- The JS (`node --test`) tests, which don't use a browser.

## Consequences

- With the GPU browser on, the repo directory is served on the LAN for the duration of the session (the `server` fixture serves the repo root). Acceptable for a homelab-only, test-time server.
- Real frame rates can expose tests that only passed at ~1 fps (#317 is the known one).
- Several sessions can share the GPU browser: each test makes its own context, so cookies and `localStorage` stay apart.
