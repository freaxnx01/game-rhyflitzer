"""#348: no browser test talks to the deployed API. Every new browser context answers the production gallery URL with an
empty list, so the page's boot-time gallery fetch (index.html showGallery) never leaves the browser and never trips the
API's CORS policy, which admits only the Pages origin and makes Chromium log a console error on a test page. A test's
own page.route() wins over this context route (Playwright: page routes take precedence), so test_gallery.py keeps its
stubs. conftest.py wires it."""
GALLERY = "https://rhyflitzer-api.freaxnx01.ch/api/gallery"   # WORLD_HOST in worlds.js + /api/gallery
CORS = {"Access-Control-Allow-Origin": "*"}


def answer_empty_gallery(route):
    route.fulfill(status=200, headers=CORS, content_type="application/json", body="[]")


def route_gallery(context):
    context.route(GALLERY, answer_empty_gallery)


def hermetic_new_context(original):
    """A Browser.new_context replacement: the new context answers the gallery."""
    def new_context(self, *args, **kwargs):
        context = original(self, *args, **kwargs)
        route_gallery(context)
        return context
    return new_context


def hermetic_new_page(original):
    """A Browser.new_page replacement: the page's own context answers the gallery before the test navigates."""
    def new_page(self, *args, **kwargs):
        page = original(self, *args, **kwargs)
        route_gallery(page.context)
        return page
    return new_page