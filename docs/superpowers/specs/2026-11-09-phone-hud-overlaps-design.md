# Phone HUD overlaps (#776)

On a 390x844 touch phone the driving HUD overlaps itself: the `#game-nav` footer and `#stylebtn` lie over the minimap
(`#br`) and the speedometer (`#bl`), and in the time trial the arrow and distance (`#tc`) land on the mode plate `#tl`.
This is the small, urgent fix. The wider HUD declutter (#773, approach B) comes later and is **not** done here.

## Cause (read from the code and the screenshot, no dry run)

- `#game-nav` is a fixed, wrapping bar at `bottom:60px` (inline style, `index.html` `<nav id="game-nav"`). The only phone
  rule (`@media (max-width:600px)`, the `<style>` block right above it) hides it under the start screen, worlds, about,
  car select, pause and abandon, but not while driving. At 390 px it wraps and sits on `#br` (240x120 at the bottom
  right) and `#bl` (130x130 at the bottom left).
- `#stylebtn` is `left:50%`, `bottom:12px`: centred on the bottom edge, so it covers the minimap and the speedo.
- `#tc` is `left:50%`, `top:12px`, `width:max-content`: centred in the viewport, so the 80x60 arrow sits at x 155..235,
  inside `#tl` (x 16..264 at 390 px, because `.mode` "ZEITFAHREN · HOCHRHEIN" is wider than the 140 px `min-width`).
  `#tl` (right edge 264) also runs 14 px under `#tr` (left edge 250).

## Design

All CSS, in `index.html`; no JS, no markup change.

1. **Footer.** At `max-width:600px` hide `#game-nav` unless a full-screen dialog is open: the dialog rule stays as it is,
   and one more rule, scoped to "no start/worlds/about/car/pause/abandon dialog visible", sets `display:none!important`.
   Result: on a phone the footer shows on none of the driving states. (The inline `display:flex` loses to `!important`.)
2. **Style button.** `@media (pointer:coarse){#stylebtn{display:none}}`. T is a keyboard key; the start screen has its own
   `#stylebtn2`; #773 moves the control into pause/settings.
3. **Time-trial header.** At `max-width:600px`:
   - `#tl .mode`: 13 px, `letter-spacing:1px`, `white-space:nowrap`, `overflow:hidden`, `text-overflow:ellipsis`.
   - `#tl`: `min-width:0`, `max-width:calc(100vw - 32px - 8px - 140px)`; `#tr`: `min-width:0`, `max-width:140px`
     (`#best` `nowrap` + ellipsis). The two plates then share the 358 px between the gutters and never meet.
   - `#tc` gets its own row below the plates: `top:calc(124px + var(--mirror-drop,0px) + env(safe-area-inset-top,0px))`
     (the plates end at about 110 px); `#cpname` gets `max-width:calc(100vw - 132px)` and `text-align:center`, so a long German
     checkpoint name wraps before it reaches `#compass` / `#pausebtn` on the right (x >= 298 / 326).
4. **Right column stays free.** `#pausebtn` (top 208) keeps its place; the 📻 button of #735 (`#radiobtn`, `right:72px`,
   same top as `#pausebtn`, panel below it) is neither moved nor covered. The test includes `#radiobtn`/`#radiopanel` when present.

## Assumptions

- **A1** [high] Plain CSS in `index.html`, no JS. Rejected: moving elements from script. The overlaps come from
  positions and widths (`index.html` `#tc{...left:50%...}`, `#tl{...min-width:200px}`, `@media (max-width:900px){...#tl{min-width:140px}}`).
- **A2** [high] The footer is hidden on phones while driving, not made smaller. Rejected: shrinking or moving it, because the
  issue states "the footer is not shown while driving", and it already is hidden on every dialog at <=600 px (`index.html`, `<style>` above `<nav id="game-nav">`).
- **A3** [med] `#stylebtn` is hidden on `pointer:coarse` only, so a narrow desktop window keeps it (and can still overlap
  there). Rejected: `max-width:600px`, because a mouse user would lose a visible button for nothing. A touch player cannot
  change the style until #773 lands; the issue accepts this.
- **A4** [med] `#tc` on phones moves to a fixed `top:124px` under the plates instead of being measured from `#tl`.
  Rejected: a JS-measured offset. This relies on `#tl` staying one line, which A5 enforces.
- **A5** [med] The world name in `#tl .mode` is truncated with an ellipsis on narrow phones ("ZEITFAHREN · HOCHRH…"),
  because two lines would push the plate into the `#tc` row. Rejected: wrapping the text.
- **A6** [med] The 140 px cap for `#tr` is an estimate from the screenshot (the plate is about 125 px wide with "Bestzeit -").
  The Playwright test is the arbiter: if a real best time is wider, widen the cap and shrink the `#tl` formula to match.
- **A7** [med] The 600 px breakpoint (not the 900 px one of `#tl`/`#navi`) is used, matching the existing `#game-nav` rule
  and the start-screen rules (`index.html` `@media (max-width:600px)`). Phones in landscape (>600 px wide) are out of scope.
- **A8** [high] One Playwright file (Python, like `tests/test_pause.py`) with `has_touch=True` and **no** `is_mobile`, because
  `index.html` has no viewport meta and mobile emulation would lay out at 980 px (`tests/test_pause.py:20`).

## Consequences

- On touch phones there is no on-screen way to switch the graphic style while driving until #773 (the key T stays).
- The language toggle lives in `#game-nav`; on phones it was already hidden on every dialog, and now it is also hidden while
  driving. The start screen has its own language control path (`#gg-lang-toggle` is tested in `tests/test_region.py:116` on the start bar).
- `#tc` moves down about 112 px on phones in all modes (toast, key hints, tutorial hint, water name included), so the toast and
  tutorial hint sit lower. They already share `#tc`; the minimap and `#debug` rules (`#debug` top 324 px portrait) are unchanged.

## Acceptance criteria

- At 390x844 with touch, in cruise and in the time trial, no two of `#tl`, `#tr`, `#tc`'s visible children, `#compass`,
  `#pausebtn`, `#bl`, `#br`, `#touch` buttons, `#game-nav`, `#stylebtn` (and `#radiobtn` when present) overlap, and neither the footer nor
  the style button is visible while driving.
- Start screen, pause, worlds, about and car select look and work as before; desktop (1280x720) is unchanged.
- CHANGELOG has a player-facing entry under [Unreleased] > Fixed.
