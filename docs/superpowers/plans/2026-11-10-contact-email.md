# Contact email in the game (#853) Implementation Plan

**Goal:** A "Contact"/"Kontakt" link in the footer and the written-out address in About → "The game", per language
(DE `kontakt@rhyflitzer.ch`, EN `hello@freax.games`). Neither address nor `mailto:` may appear in the shipped `index.html`.

**Architecture:** `about.js` (pure, node-tested) assembles the address from parts. `index.html` has the empty
elements plus one `renderContact()` that fills `href` and text at boot and on `gg-langchange`. The labels use the
existing `data-i18n` keys in `strings.js`.

**Global constraints:**
- Never write either address, `@rhyflitzer.ch`, `@freax.games` or `mailto:` into `index.html` (Task 2 tests this).
- The other footer links stay as they are (English, unchanged).
- Buildless: no new dependencies.

---

### Task 1: `contactAddress` / `contactHref` in `about.js`

**Files:** `about.js`, `tests/about.test.mjs`

- [ ] **Step 1: Write the failing test.** In `tests/about.test.mjs` extend the import to
  `import { ABOUT_LINKS, ABOUT_TABS, aboutKeyAction, aboutReturn, aboutTabIndex, contactAddress, contactHref } from '../about.js';`
  and append:

```js
test('contactAddress: German and English address, unknown language falls back to English', () => {
  assert.equal(contactAddress('de'), 'kontakt@rhyflitzer.ch');
  assert.equal(contactAddress('en'), 'hello@freax.games');
  assert.equal(contactAddress('fr'), 'hello@freax.games');
  assert.equal(contactAddress(undefined), 'hello@freax.games');
});

test('contactHref: mailto plus the address of the language', () => {
  assert.equal(contactHref('de'), 'mailto:kontakt@rhyflitzer.ch');
  assert.equal(contactHref('en'), 'mailto:hello@freax.games');
});
```

- [ ] **Step 2:** `node --test tests/about.test.mjs` → fails (not exported).
- [ ] **Step 3: Implement** in `about.js`, after `ABOUT_LINKS`:

```js
// #853: the contact address per language, in parts: only JS joins them, so the shipped HTML holds no address for crawlers
const CONTACT = Object.freeze({ de: ['kontakt', 'rhyflitzer.ch'], en: ['hello', 'freax.games'] });

export function contactAddress(lang) {
  const [user, host] = CONTACT[lang] ?? CONTACT.en;
  return [user, host].join('@');
}

export function contactHref(lang) {
  return ['mailto', contactAddress(lang)].join(':');
}
```

- [ ] **Step 4:** `node --test tests/about.test.mjs` → passes. Commit `feat(about): contact address per language (#853)` and push.

### Task 2: guard test: no address in `index.html`

**Files:** `tests/about.test.mjs`

- [ ] **Step 1: Write the test** (add `import { readFileSync } from 'node:fs';` at the top):

```js
test('index.html carries no contact address and no mailto (#853: crawlers read the raw HTML)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const bad of ['kontakt@', 'hello@', '@rhyflitzer.ch', '@freax.games', 'mailto:']) assert.ok(!html.includes(bad), bad);
});
```

- [ ] **Step 2:** `node --test tests/about.test.mjs` → passes today and must keep passing after Task 3. Commit
  `test(about): no contact address in the static HTML (#853)` and push.

### Task 3: footer link, About line, `renderContact()`

**Files:** `index.html`, `strings.js`, new `tests/test_contact.py`

- [ ] **Step 1: Write the failing Playwright test** `tests/test_contact.py` (copy `ARGS`, `READY` and `boot()` from
  `tests/test_about_tabs.py`, same blocked-world routes):

```python
"""#853: the contact address -- footer link and About line, per language, set by JS only.
Slow (Playwright): run in the foreground, only this file."""
# ... ARGS, READY, boot() as in tests/test_about_tabs.py ...


def test_contact_follows_the_language_in_footer_and_about(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.evaluate("() => window.ggSetLang('en')")
        en_nav = page.evaluate("() => { const a = document.getElementById('navcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        page.click("#aboutbtn")
        page.click("#abouttab-game")
        en_about = page.evaluate("() => { const a = document.getElementById('aboutcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        page.evaluate("() => window.ggSetLang('de')")
        de_nav = page.evaluate("() => { const a = document.getElementById('navcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        de_about = page.evaluate("() => { const a = document.getElementById('aboutcontact'); return [a.textContent.trim(), a.getAttribute('href')]; }")
        b.close()
    assert en_nav == ["Contact", "mailto:hello@freax.games"], en_nav
    assert en_about == ["hello@freax.games", "mailto:hello@freax.games"], en_about
    assert de_nav == ["Kontakt", "mailto:kontakt@rhyflitzer.ch"], de_nav
    assert de_about == ["kontakt@rhyflitzer.ch", "mailto:kontakt@rhyflitzer.ch"], de_about
    assert errors == []
```

- [ ] **Step 2:** run it (foreground, under the memory cap):
  `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 pipeline/.venv/bin/python -m pytest tests/test_contact.py -q`
  → fails (no `#navcontact`).
- [ ] **Step 3: Strings.** In `strings.js`, after `aboutPrivacyLink` in `en`: `navContact: 'Contact',` and
  `aboutContact: 'Contact:',`; after `aboutPrivacyLink` in `de`: `navContact: 'Kontakt',` and `aboutContact: 'Kontakt:',`.
- [ ] **Step 4: Footer.** In `index.html` `#game-nav`, right after the "Feedback" `<a>`, insert (no `href`: JS sets it):

```html
  <span style="color:#5a6072" aria-hidden="true">·</span>
  <a id="navcontact" data-i18n="navContact" style="color:#8fd8e8;text-decoration:none">Contact</a>
```

- [ ] **Step 5: About line.** In `#aboutpanel-game`, after `<p><a data-link="privacy" data-i18n="aboutPrivacyLink"></a></p>`:

```html
      <p><span data-i18n="aboutContact"></span> <a id="aboutcontact"></a></p>
```

- [ ] **Step 6: `renderContact()`.** Extend the import of `./about.js` with `contactAddress, contactHref`. Next to the
  `#about a[data-link]` loop add:

```js
// #853: the contact address is only ever written by JS, per language (footer link + the About line to copy by hand)
function renderContact() {
  const lang = window.GG_LANG, href = contactHref(lang);
  $('navcontact').href = href;
  $('aboutcontact').href = href;
  $('aboutcontact').textContent = contactAddress(lang);
}
renderContact();
```

  and append `renderContact();` to the `gg-langchange` listener that calls `rerenderAll()`. If `$` is not yet
  defined at that spot, use `document.getElementById`.
- [ ] **Step 7:** run `tests/test_contact.py` → passes; `node --test tests/*.test.mjs` → all pass (the Task 2 guard
  still green). Also run `tests/test_about_tabs.py` (the "The game" panel changed).
- [ ] **Step 8: CHANGELOG.** Under `[Unreleased]` → `### Added` (create the heading if missing), newest first, time
  from `TZ=Europe/Zurich date '+%F %H:%M'`:
  ``- `YYYY-MM-DD HH:MM` A **contact address** in the footer ("Kontakt"/"Contact") and under About → The game: write to the game without a GitHub account.``
- [ ] **Step 9:** commit `feat(ui): contact email in footer and About (#853)` and push.
