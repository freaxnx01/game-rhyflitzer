"""#348: no browser test talks to the deployed API. Every new browser context answers the production gallery URL with an
empty list, so the page's boot-time gallery fetch (index.html showGallery) never leaves the browser and never trips the
API's CORS policy, which admits only the Pages origin and makes Chromium log a console error on a test page. A test's
own page.route() wins over this context route (Playwright: page routes take precedence), so test_gallery.py keeps its
stub. conftest.py wires it.
#534: every new context also starts as a returning player (`mm.tutorialDone` set) unless the page URL contains
`firstvisit`, so the first-visit tutorial preselect does not change what the other tests see.
#735: every new context also aborts the SRF 3 stream host, so no browser test reaches the real live stream; a test's own
page.route() stub (a local mp3) still wins over the context route.
#845: Radio Argovia's stream host (and its 302 redirect target chmedia.streamabc.net) are aborted too."""
GALLERY = "https://rhyflitzer-api.freaxnx01.ch/api/gallery"   # WORLD_HOST in worlds.js + /api/gallery
CORS = {"Access-Control-Allow-Origin": "*"}
SRF_GLOB = "https://*.srg-ssr.ch/**"   # #735: the SRF 3 stream and its livestreaming-node-N redirect targets
ARGOVIA_GLOBS = ("https://stream.streambase.ch/**", "https://*.streamabc.net/**")   # #845: Radio Argovia and its redirect target


def answer_empty_gallery(route):
    route.fulfill(status=200, headers=CORS, content_type="application/json", body="[]")


def route_gallery(context):
    context.route(GALLERY, answer_empty_gallery)


def abort_srf(route):
    route.abort()


def route_srf(context):
    for glob in (SRF_GLOB, *ARGOVIA_GLOBS):
        context.route(glob, abort_srf)


# #534: a fresh context is a first visitor and would get the tutorial preselected; tests opt in with ?firstvisit=1
SEED_TUTORIAL_DONE = """(() => { if (location.search.includes('firstvisit')) return;
  try { if (localStorage.getItem('mm.tutorialDone') === null) localStorage.setItem('mm.tutorialDone', '1'); } catch (e) {} })();"""


def seed_returning_player(context):
    context.add_init_script(SEED_TUTORIAL_DONE)


def hermetic_new_context(original):
    """A Browser.new_context replacement: the new context answers the gallery and starts as a returning player."""
    def new_context(self, *args, **kwargs):
        context = original(self, *args, **kwargs)
        route_gallery(context)
        route_srf(context)
        seed_returning_player(context)
        return context
    return new_context


def hermetic_new_page(original):
    """A Browser.new_page replacement: the page's own context answers the gallery before the test navigates."""
    def new_page(self, *args, **kwargs):
        page = original(self, *args, **kwargs)
        route_gallery(page.context)
        route_srf(page.context)
        seed_returning_player(page.context)
        return page
    return new_page