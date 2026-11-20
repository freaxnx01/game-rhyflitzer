# iPhone/iPad: hint how to add Rhyflitzer to the home screen (#1080)

Status: enriched 2026-11-18 (quick mode). Builds on #1076 (PR#1079, manifest, apple-touch-icon, `html.installed`).

## Goal

iOS never offers "App installieren"; the only way is Share -> "Zum Home-Bildschirm" (Safari, and Brave/Chrome on iOS
16.4+, all WebKit). Most players do not know. A small, dismissible hint on the start menu tells them, **only on
iPhone/iPad in the browser**, never in the installed app, never on desktop/Android.

**Success criterion:** with an iPhone user agent and no dismissal, `#ioshint` is visible in the start menu with the
text "Play as an app: Share ⬆ → Add to Home Screen" (de: "Als App spielen: Teilen ⬆ → Zum Home-Bildschirm");
the × button hides it and the choice survives a reload; with `html.installed` it is never visible; on a desktop UA it
never shows; `node --test` and the targeted Playwright test pass; empty console.

## Out of scope

- `beforeinstallprompt`, an "Install" button, hints for Android/desktop (Chrome has its own UI).
- Detecting which iOS browser it is (the Share path is the same in all of them).
- Re-showing the hint after a dismissal, a "don't show again" setting, analytics events.
- Changing the manifest, icons, the reload buttons or `editor.html`.

## Today (evidence)

- `index.html:9` inline script adds `html.installed` for fullscreen/standalone display mode or `navigator.standalone === true`.
- `index.html:203` `html:not(.installed) #reloadbtn, ... {display:none}`: the precedent for an installed-state CSS gate.
- `index.html:611-658` the start menu: `.tags`, `.logo`, `.mid`, `.bar` (sticky bottom on phones, `index.html:298`), then
  `.foot` (`:655-658`, blurb and terrain status) as the last child of `.start`.
- `index.html:6215-6220` (#1071): on phones the menu opens scrolled to the end; a `MutationObserver` and a
  `ResizeObserver` on `#overlay .start` re-pin `scrollTop` whenever the height changes. So an in-flow element below
  the bar that appears or disappears is re-pinned in the same frame and cannot move the buttons under a finger.
- `index.html:1113-1118` `applyStaticStrings()` fills `data-i18n` (innerHTML), `data-i18n-aria`; `strings.js:473-475` /
  `:1281-1283` hold `aboutBtn`, `settingsBtn`, `reloadBtn` in en/de.
- Pure helpers live in small DOM-free modules with a node test (`startscreen.js` + `tests/startscreen.test.mjs`);
  localStorage keys are `mm.*` and every access is wrapped in try/catch (`index.html:3816-3817`).
- iPadOS 13+ reports a Mac user agent (`navigator.platform === 'MacIntel'`) but has touch (`maxTouchPoints > 1`);
  real Macs report 0 (or 1 with some trackpads).

## Design

### Placement: first child of `.foot`, below the steel bar

`<p id="ioshint" hidden>` with the text and a × button. Why here: the foot is the quietest part of the menu, it is
below the sticky bar so it never pushes the mode buttons, and it is visible right after the menu opens scrolled to the
end (#1071). The state is decided once at boot from synchronous inputs (user agent, localStorage, `html.installed`)
before the player can touch anything; any height change is absorbed by the existing `ResizeObserver` re-pin. No
fixed/overlay element (it would cover the bar or the tags), no new dialog.

Rejected: the About dialog (nobody opens it, defeats the purpose); a fixed toast at the top or bottom (covers the
tags or the sticky bar, and a fixed element is easy to hit by accident); between logo and bar (grows the area above
the bar, shifts the text slot).

### Pure helper `iosinstall.js`

```js
export function isIos({ ua = '', platform = '', maxTouchPoints = 0 }) {
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}
export function shouldShowIosHint({ ua, platform, maxTouchPoints, installed, dismissed }) {
  return isIos({ ua, platform, maxTouchPoints }) && !installed && !dismissed;
}
```

### Wiring (`index.html`)

- Markup first in `.foot`; CSS next to `.foot` (`:207`), gate `html.installed #ioshint{display:none}` (belt and braces
  with the `hidden` attribute, so adding `installed` later also hides it).
- Module import next to the `startscreen.js` import (`:1025`); boot code after the `reloadbtn` wiring (`:6408`):
  compute `hidden` from `shouldShowIosHint`; the × button hides it and stores `mm.iosHintDismissed = '1'` (try/catch).
- Strings `iosHint`, `iosHintClose` in en and de; `data-i18n` / `data-i18n-aria`.

### Tests

- `tests/iosinstall.test.mjs` (node): iPhone/iPad/iPod UA true; iPadOS Mac UA with `maxTouchPoints 5` true; real Mac
  (`maxTouchPoints 0`) false; Android and desktop false; `installed` and `dismissed` each force false; en/de strings exist.
- `tests/test_iosinstall.py` (Playwright, one file): iPhone UA context; hint visible with the en text; click ×; reload;
  still hidden (localStorage); clear storage, reload, visible, add `installed` class, hidden; desktop UA context: hidden.

## Assumptions

- **A1** [high] The hint lives in `.foot`, not in a dialog or toast. Rejected: About dialog, fixed toast, between
  logo and bar. `index.html:298` (sticky bar) and `:6215-6220` (re-pin on height change) show the foot is the
  layout-safe spot.
- **A2** [high] Reuse the existing `html.installed` class as the installed signal. Rejected: re-implementing
  `matchMedia`/`navigator.standalone` (`index.html:9`).
- **A3** [high] The helper lives in a new small module `iosinstall.js`, not in `startscreen.js` (it is not about the
  start screen's modes). Rejected: inline in `index.html` (not testable by node, `startscreen.js` precedent).
- **A4** [med] iPad detection is `platform === 'MacIntel' && maxTouchPoints > 1`, the standard check; real Macs
  report 0. Rejected: UA-only (misses every iPadOS 13+ default).
- **A5** [med] Dismissal is permanent (`mm.iosHintDismissed = '1'`), no expiry. Rejected: re-show after N days.
- **A6** [med] A single text for all iOS browsers (Share ⬆ -> Add to Home Screen). Brave/Chrome on iOS use the same
  words in their share sheet from iOS 16.4.
- **A7** [low] The "⬆" in the wording is the plain character the issue text used; it may render as an emoji glyph on
  iOS. Rejected: an inline SVG share icon (more code, not asked).
- **A8** [low] No analytics event for show/dismiss. The maintainer may want one later.
- **A9** [low] The hint is shown on every iOS browser visit until dismissed, including in the iOS in-app browsers of
  other apps, where "Add to Home Screen" does not exist. Not detectable reliably; accepted.

## Consequences

- iPhone/iPad players see one extra line at the bottom of the start menu until they dismiss it; all other
  platforms render and measure exactly as before (`hidden`).
- The menu height changes by one line on iOS at first render; the #1071 re-pin keeps the bar in place.
- `mm.iosHintDismissed` is a new localStorage key (shared origin `rhyflitzer.ch`).
