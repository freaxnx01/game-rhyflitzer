# Key toast overlaps the debug panel on phones (#178) — design

## Root cause (reproduced 2026-10-10)

`test_toast.py::test_key_toast_is_centred_below_the_checkpoint_block[touch-phone]` fails on `main` (4587571) with:

- layout viewport **980 x 2121** (`is_mobile=True` and `index.html` has no `<meta name="viewport">`, so a phone lays the page out at 980 CSS px; this is the real phone layout, not a test artefact)
- toast rect `[329, 225, 650, 291]` (centred, below `#roadname` which ends at 201.6, plus its 10 px margin and the -3 degree tilt)
- debug panel rect `[16, 120, 414.5, 226.9]`

They overlap by 85 px horizontally and **2 px vertically**. Cause: `index.html` line 47, `@media (pointer:coarse){#debug{bottom:auto;top:calc(120px + env(safe-area-inset-top,0px))}}` pins the panel's **top** at 120 px, directly under `#tl`. The panel used to be shorter; the legend button (#74) and the map-links row (#160) grew it until its bottom (227) reached the band where the toast sits (it starts about 225 and may extend to the middle of the screen: the #75 contract is "toast bottom <= half the viewport"). The test is right; the panel is in the toast's band. On the fine-pointer layouts (`desktop`, `narrow-window`) the panel is bottom-anchored and never meets the toast.

## Design

On coarse pointers in **portrait**, anchor the panel to the bottom again, above the steering buttons (`#tL`/`#tR` occupy `bottom: 230px .. 314px` on the left), instead of hanging it from the top:

```css
@media (pointer:coarse) and (orientation:portrait){#debug{top:auto;bottom:calc(330px + env(safe-area-inset-bottom,0px))}#debuglegend{max-height:max(120px,calc(100vh - 610px))}}
```

- bottom 330 px = the steering buttons' top edge (314 px) plus a 16 px gap, so the closed and the open panel never touch the buttons or the toast band (upper half).
- The legend's `max-height` keeps the open panel's top below `#tl`: panel (about 145 px with the links row) + legend <= `100vh - 330px - 130px`, i.e. legend <= `100vh - 605px`; `610px` leaves a few px. `max(120px, ...)` keeps a readable legend on a short screen.
- Landscape phones keep the current top-anchored rule untouched (no regression there; a landscape phone has only about 450 CSS px of height, out of scope).

A new test guards the new anchor, which the toast test does not: on a phone the open debug panel stays clear of `#tl` and of the steering buttons (it may already pass before the CSS change; the existing toast test is the red one).

## Acceptance Criteria

- [ ] `test_toast.py` passes completely, including `test_key_toast_is_centred_below_the_checkpoint_block[touch-phone]` (no assertion loosened).
- [ ] New `test_toast.py::test_debug_panel_clears_the_hud_on_a_phone`: with `?debug` on `touch-phone` and the legend open, the panel does not overlap `#tl`, `#tL`, `#tR`, `#tG`, `#tB`, `#tH` and lies fully inside the viewport.
- [ ] `test_debug.py::test_tap_on_the_question_button_opens_the_legend` and `::test_panel_with_the_legend_open_stays_on_screen[phone]` stay green.
- [ ] `test_navi.py` (its `touch-phone` view lists `debug` among the overlap checks) stays green.
- [ ] Desktop and narrow-window layouts unchanged (CSS is gated by `pointer:coarse` and `orientation:portrait`).

## Assumptions

- **A1** [high] Fix in CSS (panel position), not the toast. Rejected: moving the toast down or shrinking it: the toast contract (#75) is "centred, below the checkpoint block, upper half", and the debug panel is a developer tool that should yield. Evidence: `index.html:28`, `:47`; rects above.
- **A2** [med] Bottom anchor above the steering buttons, portrait only. Rejected: `top: calc(50vh + 8px)` (the #navi pattern at `index.html:44`): it runs into the left steering buttons on a true 390x844 layout and in landscape. Rejected: shaving 2 px off the panel (fragile: a longer toast wrap moves the toast).
- **A3** [med] "Phone" means the 980 px layout the game really gets on phones today (no viewport meta). A future viewport meta would give a 390 px layout where the bottom anchor leaves the panel at y of about 407 on an 844 px screen, 15 px inside the toast band's end; revisit then.
- **A4** [high] The `330px` / `610px` numbers come from the CSS on `main` (`#tL` bottom 230 + 84 high, `#tl` ends near 100 px); the implementer confirms them by running the new test and may adjust by a few px, never by loosening an assertion.

## Consequences

- On phones in portrait the debug panel now sits low-left, above the steering circles, instead of high-left.
- The `?` legend button moves with the panel; its 36 px tap size is unchanged.
