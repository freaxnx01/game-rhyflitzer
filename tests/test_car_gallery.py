"""#626: the garage gallery in Choose car -- every vehicle at once, each with a live photo, its name and class; a click picks it.
Hand-traced layout (world + terrain blocked). Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_carselect import T, carsel, open_carsel, open_page

GALLERY_JS = "() => window.__mm.carGallery()"
ALL_PHOTOS = "() => { const g = window.__mm.carGallery(); return g.open && g.tiles.every(t => t.photo || t.failed); }"
# a photo is a picture, not an empty frame: the luminance of its pixels spreads
SPREAD_JS = """(id) => new Promise((ok) => { const img = document.querySelector(`#csgallery [data-id="${CSS.escape(id)}"] img`), c = document.createElement('canvas');
  const go = () => { c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 16) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += y; s2 += y * y; n++; } ok(Math.sqrt(s2 / n - (s / n) ** 2)); };
  if (img.complete && img.naturalWidth) go(); else img.onload = go; })"""


def open_gallery(page):
    open_carsel(page)
    page.click("#csgallerybtn")
    page.wait_for_function("() => window.__mm.carGallery().open && !document.querySelector('#csgallery').hidden", timeout=T)


def test_gallery_shows_every_vehicle_with_a_photo_name_and_class(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        before = page.evaluate("() => window.__mm.carStats()")
        open_gallery(page)
        assert page.is_hidden("#csstage") and page.is_hidden("#carsel .cs-info"), "the grid takes the turntable's place"
        page.wait_for_function(ALL_PHOTOS, timeout=240000)
        g = page.evaluate(GALLERY_JS)
        texts = page.evaluate("() => [...document.querySelectorAll('#csgallery [data-id]')].map(t => ({ id: t.dataset.id, name: t.querySelector('.cs-tname').textContent, cls: t.querySelector('.cs-tclass').textContent, pressed: t.getAttribute('aria-pressed') }))")
        spread = {i: page.evaluate(SPREAD_JS, i) for i in ("compact", "estate", "bus")}
        after = page.evaluate("() => window.__mm.carStats()")
        state = carsel(page)
        b.close()
    assert [t["id"] for t in g["tiles"]] == g["ids"] and len(g["ids"]) == state["count"], g
    assert not [t for t in g["tiles"] if t["failed"]], g
    assert all(t["name"] and t["cls"] for t in texts), texts
    assert [t["id"] for t in texts if t["pressed"] == "true"] == ["compact"], texts
    assert all(s > 12 for s in spread.values()), spread
    assert after == before and state["id"] == "compact", (before, after, state)   # photographing every car leaves the stage car as it was
    assert not errors, errors


def test_a_tile_picks_the_vehicle_and_returns_to_the_turntable(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_gallery(page)
        page.click("#csgallery [data-id=delorean]")
        page.wait_for_function("() => !window.__mm.carGallery().open", timeout=T)
        state, shown = carsel(page), page.is_visible("#csstage")
        b.close()
    assert state["open"] and state["id"] == "delorean" and shown, state
    assert not errors, errors


def test_escape_and_back_close_only_the_gallery(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server)
        open_gallery(page)
        page.keyboard.press("Escape")
        esc = (page.evaluate(GALLERY_JS)["open"], carsel(page)["open"])
        page.click("#csgallerybtn")
        page.click("#csback")
        back = (page.evaluate(GALLERY_JS)["open"], carsel(page)["open"])
        b.close()
    assert esc == (False, True) and back == (False, True), (esc, back)
    assert not errors, errors


def test_gallery_on_a_phone_in_german(server):
    """360 px wide: two tiles a row, no sideways scrolling; the button reads Alle Fahrzeuge."""
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, phone=True)
        page.evaluate("() => window.ggSetLang('de')")
        open_carsel(page)
        label = page.text_content("#csgallerybtn")
        page.click("#csgallerybtn")
        page.wait_for_function("() => window.__mm.carGallery().open", timeout=T)
        cols = page.evaluate("() => getComputedStyle(document.querySelector('#csgallery')).gridTemplateColumns.split(' ').length")
        wide = page.evaluate("() => document.querySelector('#carsel').scrollWidth > document.querySelector('#carsel').clientWidth")
        b.close()
    assert label == "Alle Fahrzeuge" and cols == 2 and not wide, (label, cols, wide)
    assert not errors, errors
