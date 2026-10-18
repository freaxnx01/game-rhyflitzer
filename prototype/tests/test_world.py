"""#167: a generated world (?world=<id>) against a local world host with fixture files. Slow (Playwright): run in the foreground."""
import json
import struct
import zipfile
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
EHR = ROOT / "data" / "world_ehrendingen.json"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
needs_ehr = pytest.mark.skipif(not EHR.exists(), reason="Ehrendingen world not built")
ID, RAW_ID, FILE_ID, FREE_ID, XSS_ID, NAN_ID = "0123456789ab", "abcdefabcdef", "fedcba987654", "111122223333", "444455556666", "777788889999"
BOX = [-1520, 1840, -2225, 2065]
LV95 = [2666500, 1257750, 2670000, 1261750]
PAYLOAD = '<img src=x onerror="window.__xss=1">'
T = 240000
MODES_DISABLED = "() => ['startbtn', 'blitzbtn', 'huntbtn'].map(i => document.getElementById(i).disabled)"


def flat_mmh(path, box):
    """A tiny flat terrain covering the box: fast to parse, still a real MMH1."""
    x0, x1, z0, z1 = box
    w, h, step = 17, 17, max(x1 - x0, z1 - z0) / 16
    hj = json.dumps({"format": "MMH1", "w": w, "h": h, "step": step, "x0": x0, "z0": z0, "base": 400.0, "min": 0, "max": 0, "sources": ["test"]}).encode()
    hj += b" " * ((-(8 + len(hj))) % 4)
    path.write_bytes(b"MMH1" + struct.pack("<I", len(hj)) + hj + struct.pack(f"<{w * h}f", *([0.0] * (w * h))))


def make_world(root, wid, *, race=True, name="Testdorf"):
    w = json.loads(EHR.read_text("utf-8"))
    lm = next(iter(w["anchors"]["landmarks"].values()))
    w["region"] = {"id": wid, "name": name, "gemeinden": [name], "villages": [{"t": "TESTDORF", "x": 26.2, "z": 127.2, "r": 450}],
                   "jlist": [{"n": "Testkirche", "kind": "place_of_worship", "x": lm["x"], "z": lm["z"], "g": name}],
                   "treeBox": BOX, "forestAbove": None, "race": {"par": 400, "len": 5000} if race else None}
    w["anchors"]["landmarks"] = {}
    if not race:
        w["anchors"]["cps"] = []
        w["anchors"].pop("finish", None)
    d = root / "worlds" / wid
    d.mkdir(parents=True, exist_ok=True)
    (d / "world.json").write_text(json.dumps(w), "utf-8")
    flat_mmh(d / "terrain.mmh", BOX)
    meta = {"format": "MMR1", "id": wid, "pipelineVersion": "1", "name": name, "bbox": {"lv95": LV95, "lonlat": [8.32, 47.47, 8.37, 47.51]},
            "built": "2026-10-10T08:00:00+00:00", "sources": ["Terrain: swissALTI3D © swisstopo"],
            "license": "Contains information from OpenStreetMap ... ODbL 1.0", "lastPlayed": None}
    (d / "meta.json").write_text(json.dumps(meta), "utf-8")
    return d


def make_zip(path, d, *, skip=(), extra=None, replace=None):
    """A world zip from a fixture directory; skip names, add raw entries, or replace an entry's bytes."""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for n in ("world.json", "terrain.mmh", "meta.json"):
            if n not in skip:
                z.writestr(n, (replace or {}).get(n, (d / n).read_bytes()))
        z.writestr("LICENSE-ODbL.txt", "ODbL")
        for n, data in (extra or {}).items():
            z.writestr(n, data)
    return path


def boot(p, server, host, wid=None, extra="", size=(480, 270)):
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={"width": size[0], "height": size[1]})
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    q = f"?worldhost={host}" + (f"&world={wid}" if wid else "") + extra
    page.goto(f"{server}/prototype/index.html{q}")
    page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=T)
    return b, page


def open_worlds(page, files=False):
    """#346: the region rows, the gallery and the file controls moved into the Worlds dialog. Under 600 px the FILES
    <details> opens collapsed by design, so a test that needs the file controls asks for them."""
    page.click("#worldbtn")
    page.wait_for_function("() => !document.querySelector('#worlds').hidden", timeout=T)
    if files:
        page.evaluate("() => { document.getElementById('wpfiles').open = true; }")
        page.wait_for_selector("label[for=worldfile]", state="visible", timeout=T)


@needs_ehr
def test_world_loads_from_the_host(server, world_host):
    url, root = world_host
    make_world(root, ID)
    with sync_playwright() as p:
        b, page = boot(p, server, url, ID)
        assert page.evaluate("() => [window.__mm.region, window.__mm.layout]") == [f"world:{ID}", "osm"]
        assert page.evaluate("() => window.__mm.world") == {"id": ID, "from": "host", "name": "Testdorf"}
        assert page.text_content("#edition") == "Testdorf"     # #346: a generated world names itself on the plate, without "Edition"
        assert page.is_visible("#startbtn") and page.is_visible("#blitzbtn")
        assert "Testdorf" in page.text_content("#modetext")
        open_worlds(page)
        assert page.is_visible("#region-world") and page.text_content("#region-world") == "Testdorf"
        assert page.get_attribute("#region-world", "aria-pressed") == "true"
        assert page.get_attribute("#region-hochrhein", "aria-pressed") == "false"
        page.keyboard.press("Escape")
        page.evaluate("() => document.getElementById('startbtn').click()")
        page.keyboard.press("KeyJ")
        assert {"n": "Testkirche", "g": "Testdorf"} in page.evaluate("() => window.__mm.jumpList()")
        b.close()


@needs_ehr
def test_world_without_race_is_free_driving(server, world_host):
    url, root = world_host
    make_world(root, FREE_ID, race=False)
    with sync_playwright() as p:
        b, page = boot(p, server, url, FREE_ID)
        assert page.evaluate("() => window.__mm.world.id") == FREE_ID
        assert not page.is_visible("#startbtn") and not page.is_visible("#blitzbtn")
        assert page.is_visible("#huntbtn")
        c = page.evaluate("() => window.__mm.car()")
        x0, x1, z0, z1 = BOX
        assert x0 <= c["x"] <= x1 and z0 <= c["z"] <= z1
        assert page.evaluate("() => window.__mm.blitz().cps") == []
        page.click("#huntbtn")
        assert page.evaluate("() => window.__mm.hunt().mode") == "hunt"
        b.close()


@needs_ehr
def test_download_world_zip(server, world_host):
    url, root = world_host
    d = make_world(root, ID)
    with sync_playwright() as p:
        b, page = boot(p, server, url, ID)
        open_worlds(page, files=True)
        with page.expect_download() as dl:
            page.click("#worlddl")
        path = dl.value.path()
        assert dl.value.suggested_filename == f"rhyflitzer-{ID}.zip"
        with zipfile.ZipFile(path) as z:
            assert set(z.namelist()) == {"world.json", "terrain.mmh", "meta.json", "LICENSE-ODbL.txt"}
            assert z.read("world.json") == (d / "world.json").read_bytes()
            assert z.read("terrain.mmh") == (d / "terrain.mmh").read_bytes()
            assert b"ODbL" in z.read("LICENSE-ODbL.txt")
        b.close()


def test_download_button_only_in_a_generated_world(server, world_host):
    url, _ = world_host
    with sync_playwright() as p:
        b, page = boot(p, server, url)
        open_worlds(page, files=True)
        assert not page.is_visible("#worlddl") and page.is_visible("label[for=worldfile]")
        b.close()


def test_expired_link_offers_build_again(server, world_host):
    url, root = world_host
    (root / "api" / "worlds").mkdir(parents=True, exist_ok=True)
    (root / "api" / "worlds" / RAW_ID).write_text(json.dumps({"id": RAW_ID, "status": "expired", "bbox": {"lv95": LV95}}))
    with sync_playwright() as p:
        b, page = boot(p, server, url, RAW_ID, size=(1024, 720))
        assert page.is_visible("#worldgone") and page.evaluate("() => window.__mm.region") == "hochrhein"
        assert page.evaluate("() => window.__mm.worldGone.reason") == "expired"
        assert page.get_attribute("#buildagain", "href").endswith("editor.html?bbox=" + ",".join(map(str, LV95)))
        assert "expired" in page.text_content("#worldgonetitle")
        assert page.evaluate(MODES_DISABLED) == [True, True, True]     # #346: the error state has no world to drive
        assert page.evaluate("() => document.activeElement.id") == "worldbtn"
        page.click("#drivehere")
        assert not page.is_visible("#worldgone") and "world=" not in page.url
        assert page.evaluate(MODES_DISABLED) == [False, False, False]  # DRIVE HERE brings the three mode buttons back…
        assert page.evaluate("() => document.activeElement.id") == "startbtn"    # …and focuses the first of them
        b.close()
        b, page = boot(p, server, url, "999988887777")
        assert "never existed" in page.text_content("#worldgonetext")
        assert page.get_attribute("#buildagain", "href").endswith("editor.html")
        assert page.evaluate(MODES_DISABLED) == [True, True, True]     # every reason disables them, not just "expired"
        b.close()


def test_unreachable_host_says_offline(server):
    with sync_playwright() as p:
        b, page = boot(p, server, "http://127.0.0.1:9", RAW_ID)
        assert page.is_visible("#worldgone") and "cannot be reached" in page.text_content("#worldgonetext")
        assert not page.is_visible("#buildagain")
        b.close()


@needs_ehr
def test_upload_world_zip_plays_offline(server, world_host, tmp_path):
    url, root = world_host
    d = make_world(root, FILE_ID)
    z = make_zip(tmp_path / "w.zip", d)
    for f in d.iterdir():                      # the host no longer has it: only the saved copy can serve it
        f.unlink()
    with sync_playwright() as p:
        b, page = boot(p, server, url)
        open_worlds(page, files=True)
        with page.expect_navigation(wait_until="commit", timeout=T):
            page.set_input_files("#worldfile", str(z))
        page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=T)
        assert f"world={FILE_ID}" in page.url
        assert page.evaluate("() => window.__mm.world.from") == "file"
        open_worlds(page, files=True)
        assert page.is_visible("#worldforget")
        page.click("#worldforget")                             # #346: removing a saved copy asks first
        assert page.is_visible("#worldforgetask") and not page.is_visible("#worldforget")
        with page.expect_navigation(wait_until="commit", timeout=T):
            page.click("#worldforgetyes")
        page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=T)
        assert "never existed" in page.text_content("#worldgonetext")
        b.close()


@needs_ehr
def test_bad_zips_are_refused(server, world_host, tmp_path):
    url, root = world_host
    d = make_world(root, FILE_ID)
    big = tmp_path / "big.zip"; big.write_bytes(b"\0" * 33_000_000)
    text = tmp_path / "text.zip"; text.write_text("this is not a zip")
    bad_mmh = (d / "terrain.mmh").read_bytes().replace(b"MMH1", b"XXXX", 1)
    bad_meta = json.loads((d / "meta.json").read_text())
    bad_meta["id"] = "../../x"
    cases = [big, text,
             make_zip(tmp_path / "trav.zip", d, skip=("world.json",), extra={"../world.json": (d / "world.json").read_bytes()}),
             make_zip(tmp_path / "noterrain.zip", d, skip=("terrain.mmh",)),
             make_zip(tmp_path / "magic.zip", d, replace={"terrain.mmh": bad_mmh}),
             make_zip(tmp_path / "id.zip", d, replace={"meta.json": json.dumps(bad_meta).encode()})]
    with sync_playwright() as p:
        b, page = boot(p, server, url)
        open_worlds(page, files=True)
        start = page.url
        for z in cases:
            page.evaluate("() => { document.getElementById('worldfilestatus').textContent = ''; }")
            page.set_input_files("#worldfile", str(z))
            page.wait_for_function("() => document.getElementById('worldfilestatus').textContent.startsWith('Not a usable world file')", timeout=60000)
            assert page.url == start, z.name
        keys = page.evaluate("""() => new Promise((res) => { const r = indexedDB.open('mapmadness', 1);
            r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result); }; })""")
        assert not [k for k in keys if str(k).startswith("world:")]
        b.close()


@needs_ehr
def test_world_name_is_text(server, world_host):
    url, root = world_host
    make_world(root, XSS_ID, name=PAYLOAD)
    with sync_playwright() as p:
        b, page = boot(p, server, url, XSS_ID)
        assert page.text_content("#edition") == PAYLOAD
        open_worlds(page)
        assert page.text_content("#region-world") == PAYLOAD
        assert page.locator("#worlds img").count() == 0
        page.keyboard.press("Escape")
        page.evaluate("() => document.getElementById('startbtn').click()")
        page.keyboard.press("KeyJ")
        assert page.locator("#overlay img, #worlds img, #jumplist img, #jumpchips img, #toast img").count() == 0
        assert page.evaluate("() => window.__xss") is None
        b.close()


@needs_ehr
def test_stream_with_a_repeated_point_has_no_nan_water(server, world_host):
    """#319: a stream whose first point repeats (as the build service wrote it for Ehrendingen and Lenzburg) made NaN
    vertices in the water mesh and three.js logged 'Computed radius is NaN'."""
    url, root = world_host
    d = make_world(root, NAN_ID)
    w = json.loads((d / "world.json").read_text("utf-8"))
    w["streams"][0]["pts"] = [w["streams"][0]["pts"][0]] + w["streams"][0]["pts"]
    (d / "world.json").write_text(json.dumps(w), "utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_page(viewport={"width": 480, "height": 270})
        logs = []
        page.on("console", lambda m: logs.append(m.text))
        page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html?worldhost={url}&world={NAN_ID}")
        page.wait_for_function("() => window.__mm && window.__mm.sim", timeout=T)
        page.wait_for_timeout(3000)
        assert page.evaluate("() => window.__mm.world.id") == NAN_ID
        assert not [t for t in logs if "Computed radius is NaN" in t]
        b.close()
