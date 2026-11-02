# The dedication drives in: a small car tows it as a banner (#613)

## Problem

The dedication in the About dialog („This game is dedicated to Juliska" / „Dieses Spiel ist Juliska gewidmet") is a
static yellow Bungee line in a steel frame (`index.html:174-175`, markup `index.html:488-490`). The maintainer wants
it **playful and moving**; the issue suggests a small vehicle that tows the text as a banner, like a plane with an
advertising banner. It is part of the preparation for the article in the Neue Fricktaler Zeitung.

## Concept: banner tow

The dedication frame becomes a small stage. When the dialog opens, a **small orange side-view car** drives in from
the left edge, **towing the dedication text behind it on a rope** like a banner. The car, the rope and the text move
as one unit; the wheels spin, the car bobs, the text flutters a little. The car brakes with a slight overshoot and
parks at the right of the text; the text settles into its normal, fully readable position, centred in the frame, with
the car standing beside it. After that nothing moves. The whole entrance takes 2 s and replays each time the dialog is
opened.

Order on screen, left to right: `[dedication text] ---rope--- [car, facing right]`.

Final state (and the only state under `prefers-reduced-motion: reduce`): text and car centred in the frame, no motion.

### The car (inline SVG, drawn in the game's own palette)

A cheerful little hatchback, side view, facing right, 96 x 48 viewBox, rendered 72 x 36 px (48 x 24 px on phones):

- Body in **signal orange** `#ff7a1a` (`--signal`) with a 3 px **ink** `#14171d` outline, rounded: a low body
  (y 21..40) with a cabin on top (roof y 7, rear pillar sloped, windscreen sloped). Orange, not sun-yellow, so the car
  stands out against the yellow text.
- Two windows in the dialog's link blue `#8fd8e8` with a 2.5 px ink outline.
- Headlight: a cream `#f5efe0` rounded rectangle at the front; tail light: a small red `#e0322d` rectangle at the back;
  a `--steel-l` (`#b9bfc9`) bumper strip across the lower body.
- Two wheels: ink `#14171d` discs, r 8, with a `--steel` `#7d8593` tyre ring and a `--steel-l` cross as spokes (so
  spinning is visible). Each wheel is a `<g class="ab-wheel">` that rotates around its own centre.
- A short `--steel-l` tow hook line at the left edge of the SVG (y 24, the vertical centre of the rendered car) that
  continues the rope.

The rope is a `<span class="ab-rope">`: 26 px wide, 3 px `--steel-l` top border, between text and car.

### Motion (CSS only)

| Element | Animation | Duration |
|---|---|---|
| `.ab-tow` (text + rope + car) | `translateX(calc(-50vw - 100%))` → `none`, `cubic-bezier(.25,.85,.35,1.1)` (coasts in, overshoots by a hair, settles = brake nod) | 2 s |
| `#aboutdedication` | `skewY` flutter ±2.5° decaying to 0, origin at the rope end (right edge) | 2 s |
| `.ab-car` | bob `translateY(-1.5px)`, 6 iterations | 0.3 s each |
| `.ab-wheel` | `rotate(360deg)` linear, 5 iterations | 0.4 s each |

All with `animation-fill-mode: both`, so the unit is off-stage before the first frame and exactly in place after the
last. `prefers-reduced-motion: reduce` sets `animation: none` on all four, which is the final state.

## Constraints that shape the implementation

- `applyStaticStrings` writes `innerHTML` of every `[data-i18n]` element (`index.html:688`), on load and on every
  language change. The text therefore stays a plain `<p id="aboutdedication" data-i18n="aboutDedication">` with text
  only; the rope and the car are **siblings** inside a new `.ab-tow` wrapper, never children of the `<p>`.
- `tests/test_about.py:41,82` assert `inner_text("#aboutdedication")` equals the plain string in en and de, and
  `tests/test_about_tabs.py:35` asserts the dedication precedes the tab list in DOM order. Both hold: the `<p>` keeps
  its id, text and position; `strings.js` is unchanged.
- `tests/test_about.py:test_phone_width_never_scrolls_sideways` asserts `#about.scrollWidth <= clientWidth` at
  375 px. A translated child extends the scrollable overflow of its nearest non-clipping ancestor, so
  `.ab-dedication` gets `position: relative; overflow: hidden` and clips the unit while it is off-stage.
- Phone layout (`index.html:207`, `max-width: 600px`): car 48 x 24 px, rope 16 px; the text is a shrinking flex item
  (`min-width: 0`) and wraps to a second line beside the car when it has to (it already wraps at 375 px today).
- The SVG is `aria-hidden="true" focusable="false"`; screen readers get the text alone, as today.
- No JavaScript, no new three.js scene, no new dependency. Opening the dialog (`openAbout`, `index.html:4376`) removes
  `hidden`; a CSS animation on an element that goes from `display: none` to rendered starts from its first frame, so
  the entrance replays on every open with no code.

## Acceptance Criteria

- [ ] Opening About (start screen, pause menu, command search) shows a small orange side-view car driving in from
      the left and towing the dedication text on a rope; wheels spin, the text flutters, the car brakes with a small
      overshoot and parks to the right of the text.
- [ ] After about 2 s everything stands still: the text is centred in the frame, fully readable, in the same font,
      size and colour as before; the car stays parked beside it.
- [ ] `#aboutdedication` is still a plain `<p data-i18n="aboutDedication">` with text only, en/de as today;
      `tests/test_about.py` and `tests/test_about_tabs.py` pass unchanged.
- [ ] With `prefers-reduced-motion: reduce` nothing animates: text and car are shown in the final position at once.
- [ ] At 375 px width the dialog does not scroll sideways (the existing phone test passes); the car is 48 px wide and
      the text may wrap beside it.
- [ ] The car SVG is `aria-hidden`; no JavaScript, no new dependency; the page loads with an empty console.
- [ ] `CHANGELOG.md` has a player-facing entry under `[Unreleased]`.

## Assumptions

- **A1** [med] Banner tow, not a marquee: the car, rope and text enter as one unit and stop. Rejected: an endless
  ticker (the issue itself calls it less readable) and a car that crosses the frame and leaves (the dedication would
  look the same as today once it is gone). Evidence: issue body, „bleibt dann lesbar stehen".
- **A2** [med] The car stays parked to the right of the text permanently, and that parked picture is also what
  reduced-motion users see. Rejected: fading the car out after arrival; a reduced-motion state without the car
  (that would hide the playful element from exactly the people who asked for no motion, not for less fun).
- **A3** [med] The car is signal orange (`--signal`, `#ff7a1a`) with ink outlines, blue windows, cream headlight —
  the start screen's palette (`index.html:125` uses signal and burnt under the sun-yellow title). Rejected: a
  sun-yellow car (would merge with the yellow text) and a steel-grey one (reads as a background shape). A generic
  hatchback, not a Mini or Beetle: the game's vehicles are unbranded by project rule.
- **A4** [high] The rope and car are siblings of the `<p>`, not inside it, because `applyStaticStrings` replaces the
  `<p>`'s `innerHTML` on load and on every language switch (`index.html:688`).
- **A5** [high] `.ab-dedication` clips (`overflow: hidden`) so the off-stage unit cannot widen `#about`
  (`tests/test_about.py:90-92`).
- **A6** [med] The entrance replays on every open of the dialog, not only the first time. Rejected: a one-shot flag
  in JS (more code; the 2 s drive-in is the point of the feature, and the dialog is opened rarely).
- **A7** [med] 2 s total, ease-out with a slight overshoot; no sound. Rejected: an engine or horn sound (nothing
  asked for it, and a sound in an information dialog is intrusive).
- **A8** [high] Nothing moves after the car has parked (no idle exhaust, no swaying rope): readability at the end is
  an explicit requirement.
- **A9** [med] Same animation on phones with a 48 px car; the text may wrap to two lines beside it. Rejected: stacking
  the car under the text on phones (the tow picture falls apart).
- **A10** [med] Two Playwright tests are added to `tests/test_about.py` (animated entrance ends in the parked layout;
  reduced motion has no animations), and only `tests/test_about.py` and `tests/test_about_tabs.py` are run, not the
  full suite (memory: targeted browser tests for small changes).

## Consequences

- The dedication frame grows by the car's height on wide screens where the text is a single line (36 px car in a
  frame whose text line was ~43 px: no visible change) and by one wrapped line on narrow phones in German, where the
  car takes 48 px + 16 px rope out of the text width.
- Opening About during a paused run plays the same entrance; the race stays paused.
- The hub screenshot (`freaxnx01.github.io`, captured by its own script) is not affected: it captures the start
  screen, not the About dialog.
