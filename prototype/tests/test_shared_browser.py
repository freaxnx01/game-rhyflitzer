"""#303: the shared browser pool, tested with fakes. No browser is started here."""
import shared_browser as sb


class FakeContext:
    def __init__(self): self.scripts, self.closed = [], False
    def add_init_script(self, script): self.scripts.append(script)
    def close(self): self.closed = True


class FakePage:
    def __init__(self, context): self.context = context
    def add_init_script(self, script): self.context.add_init_script(script)


class FakeBrowser:
    def __init__(self): self.contexts, self.connected, self.closes = [], True, 0
    def is_connected(self): return self.connected
    def new_context(self, **kw): c = FakeContext(); self.contexts.append(c); return c
    def new_page(self, **kw): return FakePage(self.new_context())
    def close(self): self.closes += 1


def make_pool(reuse=True):
    launched = []
    def launch(*a, **k): b = FakeBrowser(); launched.append(b); return b
    return sb.BrowserPool(launch, reuse=reuse), launched


def test_same_launch_args_reuse_one_browser_and_other_args_get_another():
    pool, launched = make_pool()
    a, b, c = pool.get((["--x"],), {}), pool.get((["--x"],), {}), pool.get((["--y"],), {})
    assert a.real is b.real and a.real is not c.real and len(launched) == 2


def test_a_disconnected_browser_is_launched_again():
    pool, launched = make_pool()
    pool.get((), {}).real.connected = False
    pool.get((), {})
    assert len(launched) == 2


def test_close_closes_the_contexts_but_not_the_process():
    pool, launched = make_pool()
    proxy = pool.get((), {})
    proxy.new_context(); proxy.new_page()
    proxy.close()
    assert all(c.closed for c in launched[0].contexts) and launched[0].closes == 0


def test_close_leaves_a_context_the_test_did_not_create_open():
    """CDP: the remote browser's own default context is in `contexts`, and closing it disconnects the whole connection."""
    pool, launched = make_pool()
    proxy = pool.get((), {})
    default = FakeContext(); launched[0].contexts.append(default)
    mine = proxy.new_context()
    page = proxy.new_page()
    proxy.close()
    assert mine.closed and page.context.closed and not default.closed


def test_close_all_closes_every_process_once():
    pool, launched = make_pool()
    pool.get((), {}); pool.get((["--y"],), {})
    pool.close_all(); pool.close_all()
    assert [b.closes for b in launched] == [1, 1]


def test_without_reuse_every_launch_is_a_new_process_that_close_ends():
    pool, launched = make_pool(reuse=False)
    a, b = pool.get((), {}), pool.get((), {})
    assert a.real is not b.real and len(launched) == 2
    a.close()
    assert launched[0].closes == 1


def test_norender_adds_the_init_script_to_pages_and_contexts():
    pool, _ = make_pool()
    pool.norender = True
    proxy = pool.get((), {})
    assert proxy.new_page().context.scripts == [sb.NORENDER_SCRIPT]
    assert proxy.new_context().scripts == [sb.NORENDER_SCRIPT]


def test_render_mode_adds_no_init_script():
    pool, _ = make_pool()
    pool.norender = False
    assert pool.get((), {}).new_page().context.scripts == []


def test_the_stand_in_hands_out_pool_browsers_and_never_stops_anything():
    pool, launched = make_pool()
    with sb.shared_sync_playwright(pool)() as p:
        p.chromium.launch(args=["--x"])
    assert len(launched) == 1 and launched[0].closes == 0
