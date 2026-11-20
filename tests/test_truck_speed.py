"""#1122: the Rhy Tanker and the Rhy Mixer really reach about 80 km/h on a straight dry road (100 km/h with nitro) and still pull
away slowly; the compact is unchanged. Slow (Playwright): run in the foreground."""
import pytest
from playwright.sync_api import sync_playwright

from test_carselect import open_page, wait_frames

COMPACT_20S_KMH = 154.5   # measured on main before the change


def drive_kmh(page, secs, hold):
    return page.evaluate("([s, h]) => window.__mm.sim(0, 0, window.__mm.heading(), 0, s, h).speed * 3.6", [secs, hold])


def pick(page, vid):
    if vid == "compact":
        page.evaluate("() => window.__mm.setVehicle(window.__mm.vehicles().compact)")
    else:
        page.evaluate("async (id) => { await window.__mm.loadVehicle(id); window.__mm.setVehicle(window.__mm.vehicles()[id]); }", vid)
    wait_frames(page)


def measure(server, vid):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        pick(page, vid)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        r = {"s5": drive_kmh(page, 5, ["KeyW"]), "s40": drive_kmh(page, 40, ["KeyW"]), "s20": drive_kmh(page, 20, ["KeyW"]), "n40": drive_kmh(page, 40, ["KeyW", "KeyN"])}
        b.close()
    assert not errors, errors
    return r


@pytest.mark.parametrize("vid", ["tanker", "mixer"])
def test_truck_reaches_80_kmh_100_with_nitro_and_pulls_away_slowly(server, vid):
    r = measure(server, vid)
    print(vid, r)
    assert 78 <= r["s40"] <= 84, r
    assert 95 <= r["n40"] <= 115, r
    assert r["s5"] < 50, r


def test_compact_top_speed_is_unchanged(server):
    r = measure(server, "compact")
    print("compact", r)
    assert abs(r["s20"] - COMPACT_20S_KMH) <= 2, r
