"""#169: the region editor page against stubbed WMTS tiles, geo.admin identify, the Switzerland outline and the build API.
Slow (Playwright): run in the foreground, frame-light (no WebGL, small viewport). Does not need #166's outline file or a network."""
import base64
import io
import json
import re
import secrets
import time
import zipfile
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[2]
API = re.search(r"WORLD_HOST = '([^']+)'", (ROOT / "prototype" / "worlds.js").read_text(encoding="utf-8")).group(1)   # the one host constant, #167
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
EHR = [2667000, 1259750, 2669000, 1261750]
HOLE = [2650250, 1250250, 2652250, 1252250]   # inside the outline's hole: outside Switzerland
ID = "0123456789ab"
# a square country 2600000..2700000 / 1200000..1300000 with a 3 x 4 km hole (a Büsingen) at 2650000..2653000 / 1250000..1254000
OUTLINE = {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [
    [[2600000, 1200000], [2700000, 1200000], [2700000, 1300000], [2600000, 1300000], [2600000, 1200000]],
    [[2650000, 1250000], [2653000, 1250000], [2653000, 1254000], [2650000, 1254000], [2650000, 1250000]]]}}


def challenge():
    """A PoW-v2 challenge as #168 issues it (cost 1, so the widget solves it at once); fresh salt and nonce per call. The signature is not checked by the stub."""
    return {"parameters": {"algorithm": "PBKDF2/SHA-256", "cost": 1, "keyLength": 32, "keyPrefix": "00", "nonce": secrets.token_hex(16),
                           "salt": secrets.token_hex(16), "expiresAt": 4102444800}, "signature": "stub"}


META = {"format": "MMR1", "id": ID, "name": "Ehrendingen · Freienwil", "race": True, "license": "ODbL"}
FILES = {"world.json": b'{"format": "MMW1"}', "terrain.mmh": b"MMH1" + bytes(12)}


def job(state, step=None, position=None, error=None):
    """#168's job view: the answer of POST /api/jobs and GET /api/jobs/<id>."""
    return {"id": ID, "state": state, "step": step, "error": error, "message": None, "lv95": EHR, **({"position": position} if position else {})}


IDENTIFY = {"results": [{"attributes": {"jahr": 2026, "is_current_jahr": True, "gemname": "Ehrendingen <b>x</b>"}}]}


class Api:
    """The stubbed build API. `script` is the list of GET /api/jobs/<id> answers in order; `post` the POST answer (status, body) or a list of them;
    `challenge` the GET /api/challenge answer (None: a fresh valid challenge); `challenge_delay` slows it down so the "checking" state can be seen."""
    def __init__(self, post=(202, job("queued", position=3)), script=(), meta=(200, META),
                 preview=(200, {"id": ID, "exists": False, "name": "Ehrendingen", "gemeinden": ["Ehrendingen"], "raceOk": False}), challenge=None, challenge_delay=0.0):
        self.post = [post] if isinstance(post, tuple) else list(post)
        self.script, self.preview, self.meta, self.posts, self.gets, self.previews = list(script), preview, meta, [], 0, 0
        self.challenge_answer, self.challenge_delay, self.challenges = challenge, challenge_delay, 0

    def route(self, r):
        url, m = r.request.url, r.request.method
        if url.endswith("/api/jobs") and m == "POST":
            self.posts.append(json.loads(r.request.post_data)); st, body = self.post.pop(0) if len(self.post) > 1 else self.post[0]
        elif url.endswith("/api/challenge"):
            self.challenges += 1; time.sleep(self.challenge_delay); st, body = self.challenge_answer or (200, challenge())
        elif "/api/preview" in url:
            self.previews += 1; st, body = self.preview
        elif f"/api/jobs/{ID}" in url:
            self.gets += 1; st, body = self.script.pop(0) if len(self.script) > 1 else self.script[0]
        elif url.endswith(f"/worlds/{ID}/meta.json"):
            st, body = self.meta
        elif f"/worlds/{ID}/" in url:
            return r.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, content_type="application/octet-stream", body=FILES[url.rsplit("/", 1)[1]])
        else:
            return r.fulfill(status=404, body="")
        r.fulfill(status=st, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body))


def open_page(p, server, api, query=f"?bbox={','.join(map(str, EHR))}", viewport=(900, 700), lang=None, outline=OUTLINE, locale="en-US"):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale=locale, has_touch=viewport[0] < 500)
    if lang:
        ctx.add_init_script(f"try {{ localStorage.setItem('gg-lang', '{lang}'); }} catch (e) {{}}")
    page = ctx.new_page(); errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.route("**/wmts.geo.admin.ch/**", lambda r: r.fulfill(status=200, content_type="image/png", body=PNG))
    page.route("**/fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=""))
    page.route("**/api3.geo.admin.ch/**", lambda r: r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(IDENTIFY)))
    page.route("**/pipeline/ch_outline.geojson", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(outline)) if outline else r.fulfill(status=404, body=""))
    page.route(f"{API}/**", api.route)
    page.goto(f"{server}/editor/{query}")
    page.wait_for_function("() => window.__ed && window.__ed.state() === 'edit'", timeout=60000)
    return b, page, errs


def frame_box(page):
    return page.locator("#frame .body").bounding_box()


def drag(page, x0, y0, x1, y1):
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2); page.mouse.move(x1, y1); page.mouse.up()


def test_loads_with_the_frame_from_the_url_and_the_name_as_text(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api())
        page.wait_for_function("() => document.querySelector('#name').textContent.includes('Ehrendingen')", timeout=20000)
        got = page.evaluate("() => ({ rect: window.__ed.rect(), size: document.querySelector('#size').textContent, name: document.querySelector('#name').textContent,"
                            " nameHtml: document.querySelector('#name').innerHTML, build: document.querySelector('#buildbtn').disabled, warn: document.querySelector('#warn').hidden,"
                            " attribution: document.querySelector('.leaflet-control-attribution').textContent, tiles: document.querySelectorAll('.leaflet-tile').length })")
        b.close()
    assert errs == []
    assert got["rect"] == EHR and got["size"] == "2 × 2 km" and got["build"] is False
    assert got["name"] == "Ehrendingen <b>x</b>" and "&lt;b&gt;" in got["nameHtml"]   # textContent, never markup
    assert got["warn"] is False   # preview said raceOk: false → free-driving note
    assert "swisstopo" in got["attribution"] and got["tiles"] > 0


def test_drag_moves_and_snaps_corner_resizes_and_clamps_keyboard_moves(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api())
        bx = frame_box(page); cx, cy = bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2
        drag(page, cx, cy, cx + 37, cy + 23)
        r1 = page.evaluate("() => window.__ed.rect()")
        assert all(v % 250 == 0 for v in r1) and r1 != EHR and r1[2] - r1[0] == 2000
        assert "bbox=" + ",".join(map(str, r1)) in page.url
        ne = page.locator("#frame .h.ne").bounding_box(); hx, hy = ne["x"] + 22, ne["y"] + 22
        drag(page, hx, hy, hx + 600, hy - 600)   # far beyond 4 km at this zoom
        r2 = page.evaluate("() => window.__ed.rect()")
        assert r2[0] == r1[0] and r2[1] == r1[1] and r2[2] - r2[0] == 4000 and r2[3] - r2[1] == 4000
        page.locator("#frame .body").focus(); page.keyboard.press("ArrowLeft"); page.keyboard.press("Shift+ArrowDown")
        r3 = page.evaluate("() => window.__ed.rect()")
        b.close()
    assert errs == []
    assert r3[0] == r2[0] - 250 and r3[2] == r2[2] - 250 and r3[3] - r3[1] == 3750 and r3[1] == r2[1]


def test_a_corner_dragged_past_the_opposite_one_keeps_the_fixed_corner(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api())
        se = page.locator("#frame .h.se").bounding_box(); sx, sy = se["x"] + 22, se["y"] + 22
        drag(page, sx, sy, sx - 600, sy - 30)   # far west past the west edge (flips, exceeds 4 km), slightly up
        r = page.evaluate("() => window.__ed.rect()")
        b.close()
    assert errs == []
    assert r[2] == EHR[0] and r[3] == EHR[3] and r[2] - r[0] == 4000   # the old nw point stays as the ne corner


def test_outside_switzerland_and_the_hole_disable_build(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api())
        page.evaluate("() => window.__ed.setRect([2698000, 1259750, 2702000, 1261750])")   # across the border
        out = page.evaluate("() => ({ d: document.querySelector('#buildbtn').disabled, msg: document.querySelector('#chmsg').textContent, hidden: document.querySelector('#chmsg').hidden,"
                            " red: document.querySelector('.frame-poly').classList.contains('out') })")
        page.evaluate("() => window.__ed.setRect([2649500, 1249500, 2653500, 1253500])")   # the hole inside the frame
        hole = page.evaluate("() => document.querySelector('#buildbtn').disabled")
        page.evaluate(f"() => window.__ed.setRect({EHR})")
        back = page.evaluate("() => document.querySelector('#buildbtn').disabled")
        b.close()
    assert errs == [] and out == {"d": True, "msg": "The frame must lie entirely inside Switzerland.", "hidden": False, "red": True}
    assert hole is True and back is False


def test_a_frame_moved_outside_switzerland_drops_name_note_and_pending_preview(server):
    api = Api()
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.wait_for_function("() => document.querySelector('#name').textContent.includes('Ehrendingen') && !document.querySelector('#warn').hidden", timeout=20000)
        page.evaluate("(r) => window.__ed.setRect(r)", HOLE)
        now = page.evaluate("() => ({ name: document.querySelector('#name').textContent, warn: document.querySelector('#warn').hidden, pv: window.__ed.preview() })")
        before = api.previews
        page.evaluate("([a, h]) => { window.__ed.setRect(a); window.__ed.setRect(h); }", [[2667250, 1259750, 2669250, 1261750], HOLE])   # inside, then outside within 400 ms
        page.wait_for_timeout(1200)   # a leaked timer would have fired its preview by now
        after = api.previews
        b.close()
    assert errs == []
    assert now == {"name": "—", "warn": True, "pv": {"name": None, "race": None, "exists": False}}
    assert after == before


def test_build_queued_steps_done_drive_share_download(server):
    api = Api(script=[(200, job("queued", position=2)), (200, job("building", "terrain")), (200, job("ready", "done"))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn")
        page.wait_for_function("() => document.querySelector('#steps li.on')?.textContent === 'Queued (#2)'", timeout=20000)
        page.wait_for_function("() => window.__ed.state() === 'done'", timeout=30000)
        page.wait_for_function("() => document.querySelector('#rname').textContent === 'Ehrendingen · Freienwil'", timeout=10000)   # meta.json
        got = page.evaluate("() => ({ name: document.querySelector('#rname').textContent, drive: document.querySelector('#drivebtn').getAttribute('href'),"
                            " share: document.querySelector('#sharein').value, warn: document.querySelector('#rwarn').hidden,"
                            " edit: document.querySelector('#edit').hidden, drivePx: document.querySelector('#drivebtn').getBoundingClientRect().height })")
        b.close()
    assert errs == [] and [p["lv95"] for p in api.posts] == [EHR] and api.gets >= 3 and api.challenges == 1
    assert set(json.loads(base64.b64decode(api.posts[0]["altcha"]))) >= {"challenge", "solution"}   # the widget really solved the stub challenge
    assert got == {"name": "Ehrendingen · Freienwil", "drive": f"../?world={ID}", "share": f"https://github.freaxnx01.ch/game-rhyflitzer/?world={ID}",
                   "warn": True, "edit": True, "drivePx": 64}


def test_cached_world_is_done_at_once_and_free_driving_is_said(server):
    api = Api(post=(200, job("ready", "done")), script=[(500, {})], meta=(200, {**META, "name": "Ehrendingen", "race": False}))
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'done'", timeout=20000)
        page.wait_for_function("() => document.querySelector('#rname').textContent === 'Ehrendingen'", timeout=10000)   # meta.json
        page.wait_for_timeout(2500)
        warn = page.evaluate("() => document.querySelector('#rwarn').hidden")
        b.close()
    assert errs == [] and api.gets == 0 and warn is False


@pytest.mark.parametrize("post,script,text", [
    ((400, {"error": "outside-ch"}), [], "The frame must lie entirely inside Switzerland."),
    ((400, {"error": "too-big"}), [], "That frame is not allowed: 1 × 1 to 4 × 4 km."),
    ((403, {"error": "human_check_failed"}), [], "The human check did not work. Please try again."),   # refused twice: the retry is also refused
    ((400, {"error": "bad-request"}), [], "That frame is not allowed: 1 × 1 to 4 × 4 km."),
    ((429, {"error": "daily-limit"}), [], "You have built enough worlds for today — try again tomorrow, or drive one you built."),
    ((429, {"error": "one-at-a-time"}), [], "You already have a world being built. Wait until it is done, then build the next one."),
    ((429, {"error": "server-daily-limit"}), [], "The server has built all the worlds it can for today. Try again tomorrow."),
    ((503, {"error": "busy"}), [], "The server is busy right now. Try again in a few minutes."),
    ((500, {}), [], "The server is not reachable. Check your connection and try again."),
    ((202, job("queued", position=1)), [(200, job("failed", error="too-complex"))], "Too many buildings or roads in this frame. Try a smaller one."),
    ((202, job("failed", error="too-complex")), [], "Too many buildings or roads in this frame. Try a smaller one."),   # the same frame failed before: the POST itself says so, no polling
    ((413, {"error": "too-large"}), [], "The server is not reachable. Check your connection and try again."),
    ((202, job("queued", position=1)), [(200, job("failed", error="source-unreachable"))], "A data source is not reachable right now. Try again later."),
    ((202, job("queued", position=1)), [(200, job("failed", error="timeout"))], "The build failed. Try a different frame."),
    ((202, job("queued", position=1)), [(200, job("expired"))], "This world has expired. Build it again."),
])
def test_every_error_has_a_sentence_and_change_the_frame_returns(server, post, script, text):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(post=post, script=script))
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'failed'", timeout=20000)
        msg = page.text_content("#failmsg")
        page.click("#changebtn")
        after = page.evaluate("() => ({ s: window.__ed.state(), rect: window.__ed.rect(), fail: document.querySelector('#fail').hidden })")
        b.close()
    assert errs == [] and msg == text and after == {"s": "edit", "rect": EHR, "fail": True}


def test_root_editor_html_redirects_with_the_bbox_from_167(server):
    """#167's expired-world panel links ../editor.html?bbox=… (whole LV95 metres); the stub must land on editor/ with the frame."""
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(), query="")
        page.goto(f"{server}/editor.html?bbox=2666500,1257750,2670000,1261750")
        page.wait_for_function("() => location.pathname.endsWith('/editor/') && window.__ed && window.__ed.state() === 'edit'", timeout=60000)
        got = page.evaluate("() => ({ rect: window.__ed.rect(), search: location.search })")
        page.goto(f"{server}/editor.html?bbox=junk")
        page.wait_for_function("() => window.__ed && window.__ed.state() === 'edit'", timeout=60000)
        junk = page.evaluate("() => window.__ed.rect()")
        b.close()
    assert errs == []
    assert got == {"rect": [2666500, 1257750, 2670000, 1261750], "search": "?bbox=2666500,1257750,2670000,1261750"}
    assert junk == EHR   # the default frame, no error


def test_root_editor_html_meta_refresh_only_without_javascript():
    html = (ROOT / "editor.html").read_text(encoding="utf-8")
    assert re.search(r"<noscript>\s*<meta http-equiv=\"refresh\"[^>]*url=editor/\"\s*>\s*</noscript>", html)
    assert html.count("http-equiv") == 1 and 'location.replace("editor/" + location.search + location.hash)' in html


def test_the_human_check_runs_only_when_build_is_pressed_and_shows_its_state(server):
    api = Api(challenge_delay=1.0)
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.wait_for_function("() => document.querySelector('#name').textContent.includes('Ehrendingen')", timeout=20000)
        page.evaluate(f"() => window.__ed.setRect({[2667250, 1259750, 2669250, 1261750]})")   # frame moves and previews never ask for a challenge
        page.wait_for_timeout(800)
        before = api.challenges
        page.click("#buildbtn")
        page.wait_for_function("() => window.__ed.state() === 'verifying'", timeout=5000)
        shown = page.evaluate("() => ({ text: document.querySelector('#humanmsg').textContent, hidden: document.querySelector('#humanmsg').hidden, build: document.querySelector('#buildbtn').disabled })")
        page.wait_for_function("() => window.__ed.state() === 'queued'", timeout=60000)
        b.close()
    assert errs == [] and before == 0 and api.challenges == 1
    assert shown == {"text": "Checking you're human…", "hidden": False, "build": True}


def test_a_refused_solution_is_retried_once_with_a_fresh_challenge(server):
    api = Api(post=[(403, {"error": "human_check_failed"}), (202, job("queued", position=1))],
              script=[(200, job("queued", position=1))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'queued'", timeout=60000)
        b.close()
    assert errs == [] and api.challenges == 2 and len(api.posts) == 2 and api.posts[0]["altcha"] != api.posts[1]["altcha"]


def test_a_refused_challenge_is_a_sentence_not_a_human_check_error(server):
    api = Api(challenge=(503, {"error": "human-check-unavailable"}))
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'failed'", timeout=20000)
        msg = page.text_content("#failmsg")
        b.close()
    assert errs == [] and api.posts == [] and msg == "The server is not reachable. Check your connection and try again."


def test_an_existing_world_needs_no_human_check(server):
    api = Api(preview=(200, {"id": ID, "exists": True, "name": "Ehrendingen", "gemeinden": ["Ehrendingen"], "raceOk": True}), post=(202, job("queued", position=1)))
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.wait_for_function("() => window.__ed.preview().exists === true", timeout=20000)
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'queued'", timeout=20000)
        b.close()
    assert errs == [] and api.challenges == 0 and api.posts == [{"lv95": EHR}]


def test_an_existing_world_that_expired_meanwhile_gets_one_human_check_and_a_second_post(server):
    api = Api(preview=(200, {"id": ID, "exists": True, "name": "Ehrendingen", "gemeinden": ["Ehrendingen"], "raceOk": True}),
              post=[(403, {"error": "human_check_failed", "message": "x"}), (202, job("queued", position=1))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.wait_for_function("() => window.__ed.preview().exists === true", timeout=20000)
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'queued'", timeout=60000)
        b.close()
    assert errs == [] and api.challenges == 1 and len(api.posts) == 2 and "altcha" not in api.posts[0] and "altcha" in api.posts[1]


def test_download_packs_the_three_files_into_a_zip(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(post=(200, job("ready", "done"))))
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'done'", timeout=20000)
        with page.expect_download() as info:
            page.click("#dlbtn")
        name = info.value.suggested_filename
        blob = Path(info.value.path()).read_bytes()   # read it before closing: Playwright deletes its artifacts with the browser
        b.close()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names, world = sorted(z.namelist()), z.read("world.json")
    assert errs == [] and name == f"rhyflitzer-{ID}.zip"
    assert names == ["LICENSE-ODbL.txt", "meta.json", "terrain.mmh", "world.json"] and world == FILES["world.json"]


def test_space_on_the_download_link_downloads_the_world(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(post=(200, job("ready", "done"))))
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'done'", timeout=20000)
        page.focus("#dlbtn")
        with page.expect_download() as info:
            page.keyboard.press("Space")
        name = info.value.suggested_filename
        b.close()
    assert errs == [] and name == f"rhyflitzer-{ID}.zip"


def test_the_size_follows_the_browser_region_de_de(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(), lang="de", locale="de-DE")
        page.evaluate("() => window.__ed.setRect([2667000, 1259750, 2669500, 1261750])")   # 2.5 km wide
        size = page.evaluate("() => document.querySelector('#size').textContent")
        b.close()
    assert errs == [] and size == "2,5 × 2 km"


@pytest.mark.parametrize("preview", [(404, {}), (429, {"error": "preview-rate-limit"}), (200, {"id": ID, "exists": False, "name": None, "gemeinden": [], "raceOk": None, "reason": "no-road-index"})])
def test_no_usable_preview_means_no_warning_before_the_build(server, preview):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(preview=preview))
        page.wait_for_function("() => document.querySelector('#name').textContent.includes('Ehrendingen')", timeout=20000)   # the name comes from geo.admin, not from the preview
        warn = page.evaluate("() => document.querySelector('#warn').hidden")
        b.close()
    assert errs == [] and warn is True


def test_phone_layout_de(server):
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, Api(), viewport=(360, 740), lang="de")
        got = page.evaluate("""() => { const r = (s) => document.querySelector(s).getBoundingClientRect();
            return { scrollW: document.documentElement.scrollWidth, panelBelowMap: r('#panel').top >= r('#mapwrap').bottom - 1, build: r('#buildbtn').height,
                     handle: r('#frame .h.nw').width, lang: document.documentElement.lang, build_t: document.querySelector('#buildbtn').textContent,
                     hint: document.querySelector('#hint').textContent, toggle: document.querySelector('#gg-lang-toggle')?.textContent }; }""")
        page.click("#gg-lang-toggle")
        en = page.evaluate("() => document.querySelector('#buildbtn').textContent")
        b.close()
    assert errs == []
    assert got["scrollW"] <= 360 and got["panelBelowMap"] and got["build"] >= 44 and got["handle"] >= 44
    assert got["lang"] == "de" and got["build_t"] == "Bauen" and "Grösse" in got["hint"] and got["toggle"] == "DE"
    assert en == "Build"


@pytest.mark.parametrize("answer", [(404, {"error": "unknown", "message": "no such job"}), (200, {"id": ID, "state": "weird", "step": None})])
def test_polling_ends_on_a_gone_job_or_an_unparseable_answer(server, answer):
    api = Api(script=[answer])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'failed'", timeout=30000)
        msg, lost = page.text_content("#failmsg"), page.evaluate("() => document.querySelector('#lost').hidden")
        page.wait_for_timeout(5500)   # a retry would show up as a second GET
        b.close()
    assert msg == "The server is not reachable. Check your connection and try again." and lost is True and api.gets == 1


def test_polling_keeps_retrying_on_a_5xx(server):
    api = Api(script=[(500, {}), (200, job("ready", "done"))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'done'", timeout=30000)
        b.close()
    assert api.gets == 2


SLOW_JOB_GETS = """() => { const real = window.fetch; window.__jobGets = 0;
    window.fetch = async (url, ...rest) => { const slow = String(url).includes('/api/jobs/'); if (slow) window.__jobGets++;
        const res = await real(url, ...rest); if (slow) await new Promise((r) => setTimeout(r, 1500)); return res; }; }"""


def test_a_tab_switch_during_a_poll_does_not_start_a_second_poll_chain(server):
    api = Api(script=[(200, job("queued", position=1))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.evaluate(SLOW_JOB_GETS)
        page.click("#buildbtn")
        page.wait_for_function("() => window.__jobGets === 1", timeout=20000)   # the first poll is in flight
        page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_function("() => window.__jobGets >= 3", timeout=20000)
        page.wait_for_timeout(800)   # a second chain would have fired its third poll by now
        gets = page.evaluate("() => window.__jobGets")
        b.close()
    assert errs == [] and gets == 3


def test_a_poll_answer_arriving_after_change_the_frame_is_ignored(server):
    api = Api(script=[(200, job("queued", position=1))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.evaluate(SLOW_JOB_GETS)
        page.click("#buildbtn")
        page.wait_for_function("() => window.__jobGets === 1", timeout=20000)
        page.evaluate("() => { window.__ed.job(); document.querySelector('#changebtn').click(); }")
        page.wait_for_timeout(2500)   # the late answer has arrived
        got = page.evaluate("() => window.__ed.state()")
        b.close()
    assert errs == [] and got == "edit"


def test_connection_lost_appears_after_three_misses_not_two(server):
    api = Api(script=[(500, {})])   # every poll misses; the last answer repeats
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn")
        page.wait_for_function("() => window.__ed.state() === 'queued'", timeout=20000)
        deadline = time.time() + 20
        while api.gets != 2 and time.time() < deadline:
            page.wait_for_timeout(250)
        assert api.gets == 2
        assert page.evaluate("() => document.querySelector('#lost').hidden") is True   # not after two misses
        while api.gets != 3 and time.time() < deadline:
            page.wait_for_timeout(250)
        assert api.gets == 3
        page.wait_for_function("() => !document.querySelector('#lost').hidden", timeout=5000)
        text = page.text_content("#lost")
        b.close()
    assert errs == [] and text == "Connection lost, retrying…"


def test_a_hidden_tab_does_not_poll_a_visible_one_polls_at_once(server):
    api = Api(script=[(200, job("queued", position=1))])
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api)
        page.click("#buildbtn")
        page.wait_for_function("() => window.__ed.state() === 'queued'", timeout=20000)
        page.evaluate("() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })")
        g = api.gets
        page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_timeout(600)
        assert api.gets == g   # a hidden tab does not poll
        t0 = time.time()
        page.evaluate("() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })")
        page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        while api.gets <= g and time.time() - t0 < 3:
            page.wait_for_timeout(100)
        grew_at = time.time() - t0
        b.close()
    assert errs == [] and api.gets > g   # the page polls at once, not after the 2 s delay
    assert grew_at < 1   # grew within 1 s of the event


def test_the_language_switch_reaches_every_text(server):
    probe = """() => ({ frame: document.querySelector('#frame .body').getAttribute('aria-label'), handle: document.querySelector('#frame .h.nw').getAttribute('aria-label'),
        map: document.querySelector('#map').getAttribute('aria-label'), title: document.title, navLabel: document.querySelector('#game-nav').getAttribute('aria-label'),
        links: [...document.querySelectorAll('#game-nav a')].slice(1).map((a) => a.textContent), dlmsg: document.querySelector('#dlmsg').textContent })"""
    api = Api(post=(200, job("ready", "done")))
    with sync_playwright() as p:
        b, page, errs = open_page(p, server, api, lang="en")
        page.route(f"{API}/worlds/{ID}/terrain.mmh", lambda r: r.fulfill(status=500, headers={"Access-Control-Allow-Origin": "*"}, body=""))
        page.click("#buildbtn"); page.wait_for_function("() => window.__ed.state() === 'done'", timeout=20000)
        page.click("#dlbtn"); page.wait_for_function("() => !document.querySelector('#dlmsg').hidden", timeout=10000)
        en = page.evaluate(probe)
        page.click("#gg-lang-toggle")
        de = page.evaluate(probe)
        b.close()
    assert errs == []
    assert en == {"frame": "World frame on the map", "handle": "Resize corner NW", "map": "Map of Switzerland", "title": "Region editor · Map Madness",
                  "navLabel": "Game navigation", "links": ["More Games…", "Source", "Feedback"], "dlmsg": "The download did not work. Try again."}
    assert de == {"frame": "Welt-Rahmen auf der Karte", "handle": "Ecke NW ziehen", "map": "Karte der Schweiz", "title": "Region-Editor · Map Madness",
                  "navLabel": "Spielnavigation", "links": ["Weitere Spiele…", "Quellcode", "Feedback"], "dlmsg": "Der Download hat nicht geklappt. Versuch es noch einmal."}
