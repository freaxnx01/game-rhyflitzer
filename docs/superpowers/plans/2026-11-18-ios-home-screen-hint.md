# iOS home-screen hint Implementation Plan (#1080)

Spec: `docs/superpowers/specs/2026-11-18-ios-home-screen-hint-design.md`. Buildless vanilla JS; edit `index.html`,
`strings.js`, add `iosinstall.js` and two tests. Do not touch the manifest, icons or reload buttons. Run the node
tests and the ONE Playwright file named below in the foreground (never run the whole pytest suite, it takes ~2 h).
Commit after each task (Conventional Commits).

## Task 1: pure helper + node test (TDD)

Create `tests/iosinstall.test.mjs` first:

```js
// #1080: when to show the "add to home screen" hint. Pure, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIos, shouldShowIosHint } from '../iosinstall.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const base = { ua: IPHONE, platform: 'iPhone', maxTouchPoints: 5, installed: false, dismissed: false };

test('isIos: iPhone, iPad and iPod user agents', () => {
  assert.equal(isIos({ ua: IPHONE }), true);
  assert.equal(isIos({ ua: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' }), true);
  assert.equal(isIos({ ua: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)' }), true);
});

test('isIos: iPadOS reports a Mac user agent but has touch', () => {
  assert.equal(isIos({ ua: IPAD_MAC, platform: 'MacIntel', maxTouchPoints: 5 }), true);
});

test('isIos: a real Mac, Android, and an empty input are not iOS', () => {
  assert.equal(isIos({ ua: IPAD_MAC, platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isIos({ ua: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 }), false);
  assert.equal(isIos({}), false);
});

test('shouldShowIosHint: shown on iOS in the browser until dismissed', () => {
  assert.equal(shouldShowIosHint(base), true);
});

test('shouldShowIosHint: never in the installed app, never after a dismissal, never off iOS', () => {
  assert.equal(shouldShowIosHint({ ...base, installed: true }), false);
  assert.equal(shouldShowIosHint({ ...base, dismissed: true }), false);
  assert.equal(shouldShowIosHint({ ...base, ua: ANDROID, platform: 'Linux armv81' }), false);
});
```

Run `node --test tests/iosinstall.test.mjs`: it must fail (module missing). Then create `iosinstall.js`:

```js
// iosinstall.js (#1080): when to show the "add to home screen" hint. No DOM, so node --test imports it.

// iPhone/iPad/iPod say so in the user agent; iPadOS 13+ reports a Mac (MacIntel) but, unlike a real Mac, has touch
export function isIos({ ua = '', platform = '', maxTouchPoints = 0 }) {
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

// only in the iOS browser: the installed app already is the goal, a dismissed hint stays gone
export function shouldShowIosHint({ ua, platform, maxTouchPoints, installed, dismissed }) {
  return isIos({ ua, platform, maxTouchPoints }) && !installed && !dismissed;
}
```

Run the test again: all pass. Commit `feat(pwa): add the iOS home-screen hint rule (#1080)`.

## Task 2: strings

In `strings.js`, directly after the line `  reloadBtn: 'Reload',   // #1076: ...` (en block) add:

```js
  iosHint: 'Play as an app: Share ⬆ → Add to Home Screen',   // #1080: iPhone/iPad, in the browser only
  iosHintClose: 'Dismiss',
```

Directly after `  reloadBtn: 'Neu laden',` (de block) add:

```js
  iosHint: 'Als App spielen: Teilen ⬆ → Zum Home-Bildschirm',
  iosHintClose: 'Schliessen',
```

Add to `tests/iosinstall.test.mjs` (and `import { STRINGS } from '../strings.js';` at the top; `tests/pwa.test.mjs:5` shows how the
STRINGS export is used and indexed per language, copy that access pattern):

```js
test('strings: the hint and its close label exist in en and de, and name the Share path', () => {
  for (const lang of ['en', 'de']) {
    assert.ok(STRINGS[lang].iosHint.includes('⬆'), lang);
    assert.ok(STRINGS[lang].iosHintClose, lang);
  }
  assert.match(STRINGS.de.iosHint, /Home-Bildschirm/);
});
```

Run `node --test tests/iosinstall.test.mjs`. Commit `feat(pwa): add iOS hint strings (#1080)`.

## Task 3: markup, CSS, wiring in index.html

1. Import: directly after the line starting `import { MODES, lastModeFrom, startModeFrom,` (`index.html:1025`) add
   `import { shouldShowIosHint } from './iosinstall.js';   // #1080`.
2. Markup: in `<div class="foot">` (`index.html:655`) insert as the FIRST child, before `<p id="blurb">`:

```html
      <p id="ioshint" hidden><span data-i18n="iosHint">Play as an app: Share ⬆ → Add to Home Screen</span><button id="ioshintx" type="button" data-i18n-aria="iosHintClose" aria-label="Dismiss">×</button></p>
```

3. CSS: directly after the line `.foot p{margin:0}#blurb{...}...` (`index.html:208`) add:

```css
#ioshint{flex-basis:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;color:var(--sun)}   /* #1080: below the sticky bar, never moves the buttons */
#ioshint[hidden],html.installed #ioshint{display:none}
#ioshintx{min-width:44px;min-height:44px;padding:0;font:inherit;font-size:24px;line-height:1;color:var(--cream);background:none;border:0;cursor:pointer}
```

4. Wiring: add a new line directly after the line containing `$('reloadbtn').onclick = () => location.reload();`
   (`index.html:6408`):

```js
// #1080: iPhone/iPad in the browser: how to add the game to the home screen. Decided once at boot; the foot sits below the sticky bar and #1071's ResizeObserver re-pins the scroll.
{ const IOS_HINT_KEY = 'mm.iosHintDismissed', hint = $('ioshint');
  let dismissed = false; try { dismissed = localStorage.getItem(IOS_HINT_KEY) === '1'; } catch (e) { }
  hint.hidden = !shouldShowIosHint({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, installed: document.documentElement.classList.contains('installed'), dismissed });
  $('ioshintx').onclick = () => { hint.hidden = true; try { localStorage.setItem(IOS_HINT_KEY, '1'); } catch (e) { } }; }
```

Run `node --test tests/*.test.mjs` (all must pass). Commit `feat(pwa): show iPhone players how to add the game to the home screen (#1080)`.

## Task 4: Playwright test (one file)

Create `tests/test_iosinstall.py` (`boot()` has no user-agent option, so open the context here; reuse `ARGS`, `READY`, `T`):

```python
"""#1080: the iOS home-screen hint shows on an iPhone in the browser, stays dismissed, never shows in the installed app or on desktop.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_start_screen import ARGS, READY, T

IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def open_page(p, server, ua, touch):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(user_agent=ua, viewport={"width": 390, "height": 844}, has_touch=touch, locale="en-US")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/data/terrain_*.mmh", lambda r: r.fulfill(status=404, body=""))
    page.goto(f"{server}/index.html")
    page.wait_for_function(READY, timeout=T)
    return b, page, errors


def test_ios_hint_shows_dismisses_and_hides_when_installed(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, IPHONE, True)
        hint = page.locator("#ioshint")
        assert hint.is_visible()
        assert "Add to Home Screen" in hint.inner_text()
        page.locator("#ioshintx").click()
        assert not hint.is_visible()
        page.reload()
        page.wait_for_function(READY, timeout=T)
        assert not page.locator("#ioshint").is_visible()
        page.evaluate("() => localStorage.removeItem('mm.iosHintDismissed')")
        page.reload()
        page.wait_for_function(READY, timeout=T)
        assert page.locator("#ioshint").is_visible()
        page.evaluate("() => document.documentElement.classList.add('installed')")
        assert not page.locator("#ioshint").is_visible()
        assert errors == []
        b.close()


def test_ios_hint_is_hidden_on_desktop(server):
    with sync_playwright() as p:
        b, page, errors = open_page(p, server, DESKTOP, False)
        assert not page.locator("#ioshint").is_visible()
        assert errors == []
        b.close()
```

Run only `python -m pytest tests/test_iosinstall.py tests/test_pwa.py -q` in the foreground (generous timeout). If
`test_start_screen.py` bar-order tests also exist for the foot they are unaffected; do not run them.
Commit `test(pwa): iOS hint Playwright test (#1080)`.

## Task 5: CHANGELOG

Under `## [Unreleased]` / `### Added` insert as the first entry (use the current Europe/Zurich time, format `YYYY-MM-DD HH:MM`):

```md
- `2026-11-18 HH:MM` **Hinweis fürs iPhone:** Wer Rhyflitzer auf dem **iPhone oder iPad** im Browser öffnet, sieht unten im Startmenü jetzt einen Tipp, wie das Spiel als App auf den Home-Bildschirm kommt: **Teilen ⬆ → Zum Home-Bildschirm**. Mit dem **×** verschwindet der Hinweis für immer; in der installierten App und auf allen anderen Geräten erscheint er nie.
```

Commit `docs(changelog): iOS home-screen hint (#1080)`. Open the PR with `Closes #1080`.
