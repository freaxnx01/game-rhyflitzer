# Contact email in the game (#853)

## Why

Feedback today only goes through the footer's "Feedback" link, which opens a new GitHub issue and so needs a
GitHub account. The Verein Plattform Sisslerfeld is pitching an article about the game to the Neue Fricktaler
Zeitung (milestone `nfz-ready`). Its readers are mostly not gamers and have no GitHub account. They need a plain
email address.

## What the player sees

- **Footer (`#game-nav`)**: a new link right after "Feedback". In German it reads **"Kontakt"** and opens
  `kontakt@rhyflitzer.ch`. In English it reads **"Contact"** and opens `hello@freax.games`. Switching the
  language changes both the label and the address at once.
- **About → tab "The game" / "Das Spiel"**: a new line after the privacy link shows the address of the current
  language **written out** as a link (label "Contact:" / "Kontakt:"), so it can be copied by hand.

Both addresses are Mailcow aliases to the maintainer's inbox, set up on 2026-11-10.

## Spam protection (the hard rule)

The shipped `index.html` must **not** contain either address, any `user@host` fragment of them, or `mailto:`.
The address is assembled from parts in `about.js` and written into the DOM by JavaScript at boot and on every
language change. A crawler reading the raw HTML finds nothing.

## Decisions (the maintainer's)

- Placement: footer **and** About ("Footer + About").
- Footer label follows the language: "Contact" / "Kontakt". Address per language: DE `kontakt@rhyflitzer.ch`,
  EN `hello@freax.games`.
- Obfuscated: assembled by JS, never plain text or `mailto:` in static HTML.

## Builder's calls (mine, not the maintainer's)

- The other footer links (More Games, Source, Feedback) stay English as today. Only the new link is translated.
- The logic lives in the existing pure module `about.js` next to `ABOUT_LINKS`: `contactAddress(lang)` and
  `contactHref(lang)`. Unknown languages fall back to English.
- The footer label uses the existing `data-i18n` mechanism (`applyStaticStrings` already re-runs on
  `gg-langchange` via `rerenderAll`). The two `href`s and the About address text are set by one small
  `renderContact()` in `index.html`, called at boot and on `gg-langchange`.
- The footer link opens the mail client in the same tab (`mailto:` needs no `target=_blank`).

## Non-goals

- No contact form, no captcha, no server.
- No change to the existing "Feedback" GitHub link.
- No translation of the other footer links.

## Emergency brake

If spam gets out of hand, disable or replace the alias in Mailcow. If an address changes, only `about.js`
changes.

## Acceptance criteria

- `node --test tests/about.test.mjs`: `contactAddress('de') === 'kontakt@rhyflitzer.ch'`,
  `contactAddress('en') === 'hello@freax.games'`, unknown language → English; `contactHref` is `mailto:` + address.
- A node test reads `index.html` and asserts it contains none of `kontakt@`, `hello@`, `@rhyflitzer.ch`,
  `@freax.games` or `mailto:`.
- Playwright: in English the footer shows "Contact" with `href="mailto:hello@freax.games"` and About "The game"
  shows `hello@freax.games`; after switching to German the footer shows "Kontakt" with
  `href="mailto:kontakt@rhyflitzer.ch"` and About shows `kontakt@rhyflitzer.ch`. No page errors.
- CHANGELOG entry under `[Unreleased]`.
