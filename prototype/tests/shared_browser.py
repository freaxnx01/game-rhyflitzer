"""#303: one browser process per test file, and no drawing unless a test asks for it.

conftest.py swaps `sync_playwright` in each test module for `shared_sync_playwright(pool)`, so the tests keep their
`with sync_playwright() as p: br = p.chromium.launch(...)` shape. The first launch in a module starts the browser; later
tests in the same module get the same process (shaders stay compiled) with fresh contexts. `close()` only closes the
test's contexts; the process ends with the module. `reuse=False` gives every launch its own process (the old behaviour).
"""
import contextlib

NORENDER_SCRIPT = "window.__MM_NORENDER = true;"


class BrowserProxy:
    def __init__(self, real, pool, owned):
        self.real, self._pool, self._owned = real, pool, owned
        self._contexts = []

    def _prepared(self, target):
        if self._pool.norender:
            target.add_init_script(NORENDER_SCRIPT)
        return target

    def new_context(self, *args, **kwargs):
        context = self.real.new_context(*args, **kwargs)
        self._contexts.append(context)
        return self._prepared(context)

    def new_page(self, *args, **kwargs):
        page = self.real.new_page(*args, **kwargs)
        self._contexts.append(page.context)
        return self._prepared(page)

    def close(self):
        if self._owned:
            self.real.close()
            return
        # Only what this test created. `real.contexts` also holds a CDP browser's own default context, and closing that
        # one makes Playwright drop the whole connection: the next test then reconnects while the old one is going down.
        contexts, self._contexts = self._contexts, []
        for context in contexts:
            context.close()

    def __getattr__(self, name):
        return getattr(self.real, name)


class BrowserPool:
    def __init__(self, launch, reuse=True):
        self._launch, self._reuse, self._browsers, self.norender = launch, reuse, {}, True

    def get(self, args, kwargs):
        if not self._reuse:
            return BrowserProxy(self._launch(*args, **kwargs), self, owned=True)
        key = repr((args, sorted(kwargs.items())))
        browser = self._browsers.get(key)
        if browser is None or not browser.is_connected():
            browser = self._browsers[key] = self._launch(*args, **kwargs)
        return BrowserProxy(browser, self, owned=False)

    def close_all(self):
        browsers, self._browsers = list(self._browsers.values()), {}
        for browser in browsers:
            browser.close()


class _Chromium:
    def __init__(self, pool):
        self._pool = pool

    def launch(self, *args, **kwargs):
        return self._pool.get(args, kwargs)


class _Playwright:
    def __init__(self, pool):
        self.chromium = _Chromium(pool)


def shared_sync_playwright(pool):
    """A `sync_playwright` replacement: its `with` yields a chromium that hands out the pool's browsers and stops nothing."""
    @contextlib.contextmanager
    def sync_playwright():
        yield _Playwright(pool)
    return sync_playwright
