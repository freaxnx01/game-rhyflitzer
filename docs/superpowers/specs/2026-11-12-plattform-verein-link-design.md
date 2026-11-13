# Verein link on the Plattform deck (#887)

## Why

The Verein Plattform Sisslerfeld pitches an NFZ article about the game with the focus on the Plattform (milestone
`nfz-ready`). A reader who walks up the Plattform in the game (the tutorial leads every newcomer there, #534) should
see who stands behind the real tower and reach its website from there. Today the only link is in About → Credits
(`index.html:742`); on the deck there is nothing (`index.html:4365` only toasts "the stair is open" at the door).

## What the player sees (the maintainer's decisions)

- **On the deck, permanently:** while the player stands on the Plattform deck, a small plate shows the name
  **"Verein Plattform Sisslerfeld"** and a way to **open the website in a new tab**. It stays up as long as the player
  is on the deck (not a one-off toast) and disappears when they leave it (stair down, hop down, jump off).
- The website is `ABOUT_LINKS.plattform` (`about.js:10`, `https://www.plattform-sisslerfeld.com/`), opened in a new
  tab; the game is not navigated away.

## How it works (builder's calls, approved in chat as a playback)

- **Where "on the deck" is:** a new pure `plattformOnDeck(frame, base, pos)` in `plattform.js`: true when
  `pos.y >= base + P.deck.y - HOP.deckSlack` (the same height test `plattformHop` uses, `plattform.js:117`) and the
  horizontal distance to the frame centre is at most the deck's circumradius `P.deck.side / sqrt(3)`. In the game it
  is only asked on foot and not while hovering, like `platHop` (`index.html:4702`).
- **The key:** E, the one context key on foot (`index.html:4705`, `controls.js:92`). A new lowest-priority context
  action `'website'`: everything that exists wins over it, so at the stair head E still hops down (`'down'`).
  `contextKeyAction` gains an `onDeck = false` input and returns `'website'` when nothing else is up and `onDeck`.
  Its label (`CONTEXT_LABELS.website = 'barWebsite'`) makes the key bar show "E Website ↗" and the phone's context
  button (`#tE`, `stepTouch`, `index.html:4183`) show it too, so touch works with no extra code.
- **The plate:** a new `<div id="vereinplate">` in the HUD next to `#prompt` (`index.html:459`) holding the name and a
  link `<a id="vereinlink" target="_blank" rel="noopener">` whose `href` is set from `ABOUT_LINKS.plattform` by JS
  (like the About links, `index.html` `#about a[data-link]`). Text from `strings.js`: name unchanged in both
  languages; link label "E · Open website ↗" / "E · Website öffnen ↗". Shown/hidden every frame from the same
  `onDeck` test (attribute `hidden` only, no rebuild). Mouse click on the link works when the pointer is not locked;
  on foot with pointer lock the E key is the way.
- **Opening:** `runContextKey()` on `'website'` calls `window.open(ABOUT_LINKS.plattform, '_blank', 'noopener')`
  (a keydown is a user activation, so popup blockers allow it). The tab switch pauses the game through the existing
  `visibilitychange` handling; nothing new.
- **The `#prompt` line:** unchanged; the plate is its own element so the hop prompt at the stair head still shows.
- **Builder's calls (minor, settled):** the plate sits directly under `#prompt` in the same HUD column, so it follows
  the prompt's phone layout; it is hidden while paused or while the overlay/menu is open (`PAUSE.on`,
  `!$('overlay').hidden`); `'website'` is checked last in `contextKeyAction`, after the timetable, so any present or
  future E action on the deck wins over it.

## Non-goals

- No 3D info board in the model, no change to the Credits entry, no logo/branding of the Verein beyond its name.
- No new key binding (E only).

## Acceptance criteria

- `node --test tests/plattform.test.mjs`: `plattformOnDeck` true on the deck centre ring at deck height, false at
  ground level under the deck, false on deck height but outside the circumradius.
- `node --test tests/controls.test.mjs`: `contextKeyAction({ onDeck: true })` is `'website'`;
  `contextKeyAction({ hop: 'down', onDeck: true })` is `'down'`; `contextLabel('website')` is `'barWebsite'`.
- Playwright (one new file): on foot on the deck (`platHopGo('up')` path via `window.__mm`), `#vereinplate` is
  visible with "Verein Plattform Sisslerfeld" and `#vereinlink` has the `href` above and `target="_blank"`;
  `window.__mm.keybar().action === 'website'` away from the stair head; after hopping down the plate is hidden;
  pressing E on the deck calls `window.open` with the URL (stubbed in the test). No page errors.
- `strings.js` has `barWebsite`, `vereinName`, `vereinOpen` in `en` and `de`.
- CHANGELOG entry under `[Unreleased]`.
