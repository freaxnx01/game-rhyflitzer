"""#875: the pure parts of scripts/campath_video.py (no browser)."""
import argparse
import base64
import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import campath_video as cv  # noqa: E402


def test_frame_count_includes_both_ends():
    assert cv.frame_count(1.0, 60) == 61
    assert cv.frame_count(0.51, 60) == 32
    with pytest.raises(ValueError):
        cv.frame_count(0, 60)


def test_ffmpeg_cmd_pipes_png_to_h264_at_exact_fps():
    cmd = cv.ffmpeg_cmd("out.mp4", 60, 18)
    assert cmd[0] == "ffmpeg" and "-y" in cmd and cmd[-1] == "out.mp4"
    assert cmd[cmd.index("-f") + 1] == "image2pipe"
    assert cmd[cmd.index("-framerate") + 1] == "60"
    assert cmd[cmd.index("-pix_fmt") + 1] == "yuv420p"
    assert cmd[cmd.index("-crf") + 1] == "18"
    assert cmd[cmd.index("-c:v", cmd.index("-i")) + 1] == "libx264"


def test_png_bytes_decodes_and_rejects_other_types():
    raw = b"\x89PNG\r\n\x1a\nxyz"
    assert cv.png_bytes("data:image/png;base64," + base64.b64encode(raw).decode()) == raw
    with pytest.raises(ValueError):
        cv.png_bytes("data:image/jpeg;base64,AAAA")


def test_parse_size():
    assert cv.parse_size("1280x720") == (1280, 720)
    with pytest.raises(argparse.ArgumentTypeError):
        cv.parse_size("big")


def test_default_out_uses_local_stamp():
    assert cv.default_out(datetime.datetime(2026, 11, 1, 7, 5, 3)) == "rhyflitzer-campath-20261101-070503.mp4"
