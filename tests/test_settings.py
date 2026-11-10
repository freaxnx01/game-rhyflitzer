"""#842: the settings dialog -- Sound (the effects bus) and Music (menu music on the start screen,
car radio in a run), each an on/off switch and a volume slider. Hand-traced layout like
tests/test_about.py: fast and deterministic. Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent"


def boot(p, server, locale="en-US", viewport=(1280, 720)):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale=locale)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=240000)
    return b, page, errors


def set_range(page, sel, value):
    page.evaluate("([sel, v]) => { const r = document.querySelector(sel); r.value = String(v); r.dispatchEvent(new Event('input')); }", [sel, value])


def test_opens_from_start_and_esc_returns(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        assert page.inner_text("#settingsbtn") == "Settings"
        page.click("#settingsbtn")
        state = page.evaluate("() => window.__mm.settings()")
        visible = page.is_visible("#settings") and not page.is_visible("#overlay")
        title = page.inner_text("#settingstitle")
        page.keyboard.press("KeyW")
        held = page.evaluate("() => window.__mm.keysDown()")
        page.keyboard.press("Escape")
        after = page.evaluate("() => ({ settings: window.__mm.settings(), overlay: !document.getElementById('overlay').hidden, focus: document.activeElement.id })")
        b.close()
    assert state["open"] is True and state["from"] == "start", state
    assert state["sound"] == {"on": True, "vol": 10}, state          # a fresh browser starts unmuted at the old fixed level
    assert visible and title == "Settings"
    assert held == [], held                                          # game keys never reach the game behind the dialog
    assert after == {"settings": {"open": False, "from": "start", "sound": {"on": True, "vol": 10},
                                   "music": {"on": True, "menuOn": True, "vol": 6}}, "overlay": True, "focus": "settingsbtn"}, after
    assert errors == []


def test_m_and_the_dialog_share_the_sound_switch(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.keyboard.press("KeyM")                                  # dialog closed: M mutes the effects
        page.click("#settingsbtn")
        muted = page.evaluate("() => ({ checked: document.getElementById('setsound').getAttribute('aria-checked'), text: document.getElementById('setsound').textContent })")
        page.click("#setsound")                                      # the switch turns the sound back on
        on = page.evaluate("() => window.__mm.settings().sound")
        set_range(page, "#setsoundvol", 4)
        slid = page.evaluate("() => ({ sound: window.__mm.settings().sound, pct: document.getElementById('setsoundpct').textContent, ls: { on: localStorage.getItem('mm.sound'), vol: localStorage.getItem('mm.soundVol') } })")
        page.reload()
        page.wait_for_function(READY, timeout=240000)
        kept = page.evaluate("() => window.__mm.settings().sound")   # D4: the sound level survives a reload
        b.close()
    assert muted == {"checked": "false", "text": "off"}, muted       # the dialog shows what M did
    assert on == {"on": True, "vol": 10}, on
    assert slid == {"sound": {"on": True, "vol": 4}, "pct": "Volume 40 %", "ls": {"on": "1", "vol": "4"}}, slid
    assert kept == {"on": True, "vol": 4}, kept
    assert errors == []


def test_music_row_is_the_menu_music_on_the_start_screen(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#settingsbtn")
        caption = page.inner_text("#setmusiccap")
        page.click("#setmusic")                                      # the Music switch is the menu music here (D3, key 5's rule)
        off = page.evaluate("() => ({ btn: document.getElementById('musicbtn').textContent, pressed: document.getElementById('musicbtn').getAttribute('aria-pressed'), music: window.__mm.radio().menuOn, sw: document.getElementById('setmusic').getAttribute('aria-checked') })")
        page.keyboard.press("Escape")
        page.keyboard.press("Digit5")                                # with the dialog closed, 5 flips the same switch
        page.click("#settingsbtn")
        back = page.evaluate("() => ({ checked: document.getElementById('setmusic').getAttribute('aria-checked'), text: document.getElementById('setmusic').textContent })")
        set_range(page, "#setmusicvol", 3)
        vol = page.evaluate("() => ({ vol: window.__mm.radio().vol, pct: document.getElementById('setmusicpct').textContent, ls: localStorage.getItem('mm.radioVol') })")
        b.close()
    assert caption == "Menu music", caption
    assert off == {"btn": "Music: off", "pressed": "false", "music": False, "sw": "false"}, off
    assert back == {"checked": "true", "text": "on"}, back
    assert vol == {"vol": 3, "pct": "Volume 30 %", "ls": "3"}, vol
    assert errors == []


def start_race(page):
    page.click("#startbtn")
    page.wait_for_function("() => window.__mm.pause().state === 'armed' || window.__mm.pause().state === 'racing'", timeout=120000)


def test_opens_from_the_pause_menu_and_back_returns_there(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        start_race(page)
        page.keyboard.press("Escape")
        page.wait_for_function("() => window.__mm.pause().on", timeout=60000)
        page.click("#pausesettings")
        opened = page.evaluate("() => ({ settings: window.__mm.settings(), pause: !document.getElementById('pause').hidden, caption: document.getElementById('setmusiccap').textContent, sound: window.__mm.settings().sound })")
        page.keyboard.press("Escape")
        after = page.evaluate("() => ({ settings: window.__mm.settings().open, pauseShown: !document.getElementById('pause').hidden, paused: window.__mm.pause().on, focus: document.activeElement.id })")
        b.close()
    assert opened["settings"]["open"] is True and opened["settings"]["from"] == "pause", opened
    assert opened["pause"] is False, opened
    assert opened["caption"] == "Car radio", opened                  # in a run the Music row is the car radio
    assert opened["settings"]["music"]["on"] is True, opened
    assert after == {"settings": False, "pauseShown": True, "paused": True, "focus": "pausesettings"}, after   # Esc goes back, it does not resume
    assert errors == []
