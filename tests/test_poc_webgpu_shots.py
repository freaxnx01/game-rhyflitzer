"""WebGPU PoC page: look screenshots, GPU browser only. The PNGs are never committed. Slow: run in the foreground."""
import os
import time
from pathlib import Path

from test_poc_webgpu import READY, poc_page, render_url  # noqa: F401  (poc_page is a fixture)

TIMES = ["golden", "midday", "twilight", "midnight"]  # same as TIME_ORDER in poc/webgpu/js/poc-look.js
SETTLE_MS = 2000


def test_poc_shots(poc_page, tmp_path):
    started = time.time()
    out_dir = Path(os.environ.get("POC_SHOTS_DIR") or tmp_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    poc_page.set_viewport_size({"width": 1920, "height": 1080})
    poc_page.goto(render_url(poc_page))
    poc_page.wait_for_function(READY, timeout=120000)
    poc_page.wait_for_timeout(SETTLE_MS)
    expected = []
    for wet in (False, True):
        for time_id in TIMES:
            poc_page.evaluate("([t, w]) => { window.__poc.setTime(t); window.__poc.setWet(w); }", [time_id, wet])
            poc_page.wait_for_timeout(SETTLE_MS)
            shot = out_dir / f"poc-{time_id}-{'wet' if wet else 'dry'}.png"
            poc_page.screenshot(path=str(shot))
            expected.append(shot)
    assert len(expected) == 8
    for shot in expected:
        assert shot.stat().st_size > 0, shot
        assert shot.stat().st_mtime >= started - 1, f"{shot} was not written by this run"
