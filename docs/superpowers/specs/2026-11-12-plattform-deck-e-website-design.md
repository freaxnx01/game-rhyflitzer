# Plattform deck: E goes down, V opens the Verein website (#914)

## Problem

On the Plattform deck two prompts claim the same key: `#prompt` shows "E · Hinunter" and the Verein plate below it shows
"E · Website öffnen ↗" (#887, PR#908). `contextKeyAction` ranks the hop above the website (`controls.js:100-108`), and on the
deck the hop `'down'` is always active, so E always hops down; the website opens only by clicking the link.

## Design

One panel, website on its own key (confirmed, see Assumptions A1):

- **E** keeps its whole chain (lift, leave, hop, enter, board, timetable). The `'website'` result leaves
  `contextKeyAction` (`onDeck` parameter removed), together with `CONTEXT_LABELS.website` and the string `barWebsite`.
- **V** (KeyV, "Verein") is a new foot/indoors action `'website'` in the `WALK` table of `controls.js`. It acts only while
  `platOnDeck()` is true; the dispatcher in `index.html` (keydown, `:4368`) handles it before the `FOOT.on`
  block, which would otherwise swallow V (`foot.js:115` FOOT_BLOCKED). Off the deck V stays swallowed as today.
- The plate becomes the second line of the E prompt: flush under `#prompt`, same colours, text
  `Verein Plattform Sisslerfeld · V Website ↗`. On the deck band where no E action is active the plate stands alone
  (as in #887) and reads the same. The link stays a real `<a>`: click and tap work, `href` stays
  `ABOUT_LINKS.plattform` (`index.html:5932`).
- Opening: the V key calls `window.open(ABOUT_LINKS.plattform, '_blank', 'noopener')` (the call #887 made from
  `runContextKey`, moved). The game already pauses when the tab opens (`visibilitychange` -> `openPause`, `index.html:6525`); nothing to add.
- Strings in `strings.js` en + de: `vereinOpen` = `V Website ↗` / `V Website öffnen ↗`; `vereinName` unchanged; the
  separator ` · ` sits in the markup between name and link. `barWebsite` is deleted in both languages.

## Assumptions

- **A1** [confirmed] How do "E · Hinunter" and the Verein website link fit together on the deck? Answer: "One panel, website on own key": a single prompt: 'E · Hinunter' plus a second line 'Verein Plattform Sisslerfeld · <key> Website ↗' (also tappable/clickable). The key is picked by the agent (A2).
- **A2** [high] The key is **V**. Evidence: `controls.js` `WALK` (foot and indoors) binds W A S D arrows, Space, Z, J, F1, E, Shift, N, B, G, Y, T, X, M, Backquote, 5-0, `[` `;` `'`, F (hover menu); V appears only in the `car` table (`hideCar`, `controls.js:50`). On foot V is swallowed (`foot.js:115` FOOT_BLOCKED: C O I U H Q L V ...), so it does nothing there today. Grep of every `Key[A-Z]` in `*.js` and `index.html`: `pause.js` binds Escape, KeyP, KeyX (paused only); `train.js` its own table (loco context); `heli.js`, `route.js` (autopilot take-over keys), `debug.js` (Ctrl+D/H), `tutorial.js` (KeyS hint) - none binds V. `index.html` handles V only in the dispatcher's car branch (`if (e.code === 'KeyV')`, behind the FOOT block) and the help row. Other free-on-foot letters (C, H, I, O, Q, U, L) all read worse; N and Shift excluded by the caller. V = "Verein".
- **A3** [high] The key bar (`barEntries`) is not changed; the E cap keeps showing the hop. The plate carries the V hint itself.
- **A4** [confirmed] Visual join: the plate sits directly under `#prompt` with no gap and a dashed top border, in `#prompt`'s palette, rather than being merged into `#prompt`'s text node (which `stepEnter` rewrites every frame). Rejected: appending the line into `#prompt` (`index.html:4952-4960` overwrite `textContent`, and `#prompt:not(:empty)::first-letter` styles the E cap). Evidence: `index.html:51-58`. Confirmed 2026-11-12: "Flush under the prompt".
- **A5** [confirmed] The help overlay row for V (`index.html:490`, "show / hide the car") stays as is; the V-on-deck hint lives on the plate, not in the help. Confirmed 2026-11-12: "Plate only".
- **A6** [high] Lands after #913: both edit controls.js (#913 touches the nitro entries; this touches `WALK`, `CONTEXT_LABELS` and `contextKeyAction`). Rebase onto it; no logical overlap.

## Consequences

- E on the deck outside the hop bands now does nothing (it opened the website in #887); the website needs V, a click or a tap.
- A player who pressed E for the website at the old spot must learn V; the plate says so on screen.
- `barWebsite` disappears from both languages; nothing else read it (`rg barWebsite`).
- The Playwright test from #887 asserted `action == "website"`; it now asserts the V path instead.

## Acceptance criteria

- On the deck with an active hop, `#prompt` reads the hop text and the plate directly below reads "Verein Plattform Sisslerfeld · V Website ↗"; E hops, V opens the website.
- On the deck without a hop, the plate shows alone, V opens it, E does nothing.
- Click or tap on the link still opens the website; the game pauses when the tab opens.
- V off the deck (foot) does nothing; V in the car still hides the car.
- `contextKeyAction` no longer returns `'website'`; `controls.js` has no E/V conflict (`conflicts()` empty).
- de and en strings present; the existing #887 tests are updated to V.
