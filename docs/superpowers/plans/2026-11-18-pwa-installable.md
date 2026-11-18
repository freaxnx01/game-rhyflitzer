# Installable app: manifest, icons, fullscreen, reload control (#1076) Implementation Plan

**Goal:** rhyflitzer.ch installs as an app from Chrome's menu (manifest, icons, `display: fullscreen`), iOS gets an
`apple-touch-icon`, and the installed fullscreen app shows a **Reload** button on the start screen and in the pause menu.
No service worker, no offline caching.

**Spec:** `docs/superpowers/specs/2026-11-18-pwa-installable-design.md`.

**Icons already exist on `main`** (`assets/icons/`). Do **not** draw, regenerate or edit any image.

**Global constraints:**

- Buildless browser game: no `package.json`, no dependency, no framework, no service worker, no `navigator.serviceWorker`
  anywhere. `const`/`let` only. Do not touch `pause.js`, `editor.html`, `favicon.png`, `assets/icons/*`.
- TDD: write the failing test, run it red, implement, run green. Never edit a test to make it pass (the `SECONDARY` change
  in Task 3 *is* the specified change).
- Node: `node --test tests/pwa.test.mjs` per task; at the end `node --test tests/*.test.mjs`.
- Browser: **only** `pytest tests/test_pwa.py tests/test_start_screen.py -k "pwa or bar_order"`, in the **foreground**
  (never `run_in_background`, `timeout` ≥ 600000), never the full suite; commit and push **before** the run.
- `CHANGELOG.md`: one hand-written player-facing entry (Task 4). Never `git cliff -o`.
- Commits: Conventional Commits, scope `pwa`, footer `Refs #1076`, last commit `Closes #1076`; push after every task;
  draft PR after Task 1. Branch `feature/1076-pwa-installable`.

Files: new `manifest.webmanifest`, `tests/pwa.test.mjs`, `tests/test_pwa.py`; changed `index.html`, `strings.js`,
`tests/test_start_screen.py`, `CHANGELOG.md`.

---

### Task 1: manifest + head tags (`manifest.webmanifest`, `index.html` lines 4-5)

**Failing test** — create `tests/pwa.test.mjs`:

```js
// #1076: the web app manifest, its icons and the head tags that make rhyflitzer.ch installable. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const pngSize = (path) => { const b = readFileSync(new URL(`../${path}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('index.html links the manifest, the theme colour and the apple-touch-icon, and registers no service worker', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#1c1f26">/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon-180\.png">/);
  assert.doesNotMatch(html, /serviceWorker/);
  assert.deepEqual(pngSize('assets/icons/apple-touch-icon-180.png'), [180, 180]);
});

test('manifest: Rhyflitzer, fullscreen, scope /, charcoal colours, three icons that exist at the declared size', () => {
  assert.equal(manifest.name, 'Rhyflitzer'); assert.equal(manifest.short_name, 'Rhyflitzer');
  assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'fullscreen'); assert.equal(manifest.orientation, undefined);
  assert.equal(manifest.theme_color, '#1c1f26'); assert.equal(manifest.background_color, '#1c1f26');
  assert.equal(manifest.prefer_related_applications, undefined);
  assert.deepEqual(manifest.icons.map((i) => [i.src, i.sizes, i.purpose]), [
    ['assets/icons/icon-192.png', '192x192', 'any'], ['assets/icons/icon-512.png', '512x512', 'any'],
    ['assets/icons/icon-512-maskable.png', '512x512', 'maskable']]);
  for (const i of manifest.icons) {
    assert.ok(existsSync(new URL(`../${i.src}`, import.meta.url)), i.src); assert.equal(i.type, 'image/png');
    assert.deepEqual(pngSize(i.src), i.sizes.split('x').map(Number), i.src);
  }
});
```

Run `node --test tests/pwa.test.mjs` → red (no manifest file).

**Implement:** create `manifest.webmanifest` with exactly the JSON from the spec's "Design" section (`id`, `name`,
`short_name`, `start_url`, `scope`, `display`, `background_color`, `theme_color`, `lang: "de"`, three icons with
`type: "image/png"`). In `index.html` insert after line 4 (`<link rel="icon" …>`):

```html
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#1c1f26">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon-180.png">
```

Run green. Commit `feat(pwa): add web app manifest and icons links`.

### Task 2: strings + installed-app detection + reload buttons (`strings.js`, `index.html`)

**Failing test** — append to `tests/pwa.test.mjs`:

```js
import { STRINGS } from '../strings.js';
test('reload control: de/en label, buttons on the start screen and in the pause menu, hidden unless installed', () => {
  assert.equal(STRINGS.en.reloadBtn, 'Reload'); assert.equal(STRINGS.de.reloadBtn, 'Neu laden');
  assert.match(html, /<button id="reloadbtn" class="btn small" type="button" data-i18n="reloadBtn" style="text-transform:none">Reload<\/button>\s*<\/div>/);
  assert.match(html, /id="pausemenu"[^\n]*\n\s*<button id="pausereload" class="btn" type="button" data-i18n="reloadBtn">Reload<\/button>/);
  assert.match(html, /html:not\(\.installed\) #reloadbtn, ?html:not\(\.installed\) #pausereload ?\{ ?display: ?none ?\}/);
  assert.match(html, /display-mode: fullscreen/); assert.match(html, /navigator\.standalone === true/);
  assert.match(html, /\$\('reloadbtn'\)\.onclick = \(\) => location\.reload\(\)/);
  assert.match(html, /\$\('pausereload'\)\.onclick = \(\) => location\.reload\(\)/);
});
```

(Put the `import` with the others at the top.) Run → red.

**Implement:**

1. `strings.js`: after `settingsBtn: 'Settings',` (line 474) add `  reloadBtn: 'Reload',   // #1076: the installed
   fullscreen app has no browser bar to reload from`; after `settingsBtn: 'Einstellungen',` (line 1281) add
   `  reloadBtn: 'Neu laden',`.
2. `index.html`, directly after the three tags from Task 1, the detection script (one line comment + script):

```html
<!-- #1076: the installed app (fullscreen/standalone) has no browser bar, so it shows Reload buttons; see html.installed -->
<script>if (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) document.documentElement.classList.add('installed');</script>
```

3. `index.html` CSS, on its own line after `.row.secondary{margin-top:12px;gap:10px}` (line 197):
   `html:not(.installed) #reloadbtn,html:not(.installed) #pausereload{display:none}   /* #1076 */`
4. Start screen (`.row.secondary`, after `#musicbtn`, line ~639):
   `<button id="reloadbtn" class="btn small" type="button" data-i18n="reloadBtn" style="text-transform:none">Reload</button>`
5. Pause menu, after `#pausemenu` (line 922), before `#pausetutorial`:
   `<button id="pausereload" class="btn" type="button" data-i18n="reloadBtn">Reload</button>`
6. Wiring: append to the `$('aboutbtn').onclick = …` line (6400): ` $('reloadbtn').onclick = () => location.reload();`
   and to the pause wiring line (7404): ` $('pausereload').onclick = () => location.reload();   // #1076`.

Run `node --test tests/pwa.test.mjs` green, then `node --test tests/*.test.mjs`. Commit
`feat(pwa): reload button for the installed fullscreen app`.

### Task 3: browser test (`tests/test_pwa.py`, `tests/test_start_screen.py`)

**Failing tests:**

1. `tests/test_start_screen.py:11`: `SECONDARY = [..., "musicbtn", "reloadbtn"]   # #1076 Reload, hidden on the website`
2. Create `tests/test_pwa.py`:

```python
"""#1076: the installed app shows a Reload button on the start screen and in the pause menu; the website does not.
Slow (Playwright): run in the foreground."""
from playwright.sync_api import sync_playwright

from test_start_screen import boot, READY, T


def test_pwa_reload_button_only_in_the_installed_app(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        assert not page.locator("#reloadbtn").is_visible()
        assert page.locator("#pausereload").count() == 1
        assert page.evaluate("() => document.documentElement.classList.contains('installed')") is False
        page.evaluate("() => document.documentElement.classList.add('installed')")
        assert page.locator("#reloadbtn").is_visible()
        assert page.locator("#reloadbtn").inner_text().strip() == "Reload"
        page.locator("#reloadbtn").click()
        page.wait_for_function(READY, timeout=T)
        assert page.evaluate("() => performance.getEntriesByType('navigation')[0].type") == "reload"
        assert errors == []
        b.close()
```

Commit and push, then run `pytest tests/test_pwa.py tests/test_start_screen.py -k "pwa or bar_order"` in the foreground
(`timeout` ≥ 600000). Both green (if `bar_order` is red, the button's position in `.row.secondary` is wrong — fix `index.html`, not the test). Commit `test(pwa): reload button in the installed app`.

### Task 4: changelog (`CHANGELOG.md`)

Under `## [Unreleased]` → `### Added`, first bullet, with the current Swiss time:

```markdown
- `2026-11-DD HH:MM` **Rhyflitzer als App:** auf dem Handy lässt sich rhyflitzer.ch jetzt über das Chrome-Menü **„App installieren"** auf den Home-Bildschirm legen, mit eigenem Icon (das gelbe „R" im Sonnenuntergang) und im **Vollbild** ohne Browserleiste. Weil dort die Adresszeile fehlt, gibt es in der App einen Knopf **„Neu laden"** im Startmenü und im Pausemenü. Offline spielen geht nicht, die Welt wird weiterhin geladen.
```

Commit `docs(pwa): changelog for the installable app`, footer `Closes #1076`. Push, mark the PR ready.

### Done when

`node --test tests/*.test.mjs` and the two targeted Playwright tests are green; `git grep serviceWorker` finds nothing;
the PR touches only the files listed above. Deploy checks (maintainer): `curl -sI` of the manifest, DevTools → Manifest,
Android "App installieren".
