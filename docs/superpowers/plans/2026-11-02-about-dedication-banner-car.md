# Dedication Banner Car Implementation Plan (#613)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When the About dialog opens, a small orange side-view car drives in from the left towing the dedication text on a rope, brakes with a small overshoot and parks to the right of the text, which settles centred and readable. CSS and inline SVG only; static under `prefers-reduced-motion`.

**Spec:** `docs/superpowers/specs/2026-11-02-about-dedication-banner-car-design.md` (concept, car artwork, assumptions).

**Tech:** `index.html` (CSS block around line 172-207, markup around line 488), `tests/test_about.py` (Playwright, pytest), `CHANGELOG.md`. No JS, no `strings.js` change, no new dependency.

## Global Constraints

- `#aboutdedication` stays a plain `<p data-i18n="aboutDedication">` containing text only. `applyStaticStrings` (`index.html:688`) overwrites its `innerHTML` on load and on every language switch, so the rope and the car are siblings of the `<p>`, never children.
- The text key `aboutDedication` in `strings.js` (en line 269, de line 719) is not changed. `tests/test_about.py:41,82` compare `inner_text("#aboutdedication")` with the exact strings.
- `.ab-dedication` must clip (`overflow: hidden`): `tests/test_about.py::test_phone_width_never_scrolls_sideways` asserts `#about.scrollWidth <= clientWidth` at 375 px and the unit starts off-stage to the left.
- Keep DOM order: dedication section before the `role=tablist` (`tests/test_about_tabs.py:35`).
- Tests: `python -m pytest tests/test_about.py tests/test_about_tabs.py -q` **in the foreground**, with a generous timeout. Do not run the full suite. Commit and push the branch before running the tests.
- Surgical edits only; match the one-line CSS style of the file.

## Files

| File | Change |
|---|---|
| `index.html` | CSS: rewrite `.ab-dedication`, add `.ab-tow`, `.ab-rope`, `.ab-car`, `.ab-wheel`, four `@keyframes`, a reduced-motion rule, phone sizes. Markup: wrap the `<p>` in `.ab-tow`, add rope span and car SVG. |
| `tests/test_about.py` | Two new tests: animated entrance ends parked; reduced motion is static. |
| `CHANGELOG.md` | Player-facing entry under `[Unreleased]`. |

### Task 1: Failing tests for the parked layout and reduced motion

**Files:** `tests/test_about.py`

- [ ] **Step 1: Write the failing tests.** Append after `test_phone_width_never_scrolls_sideways` (before `def start_race`):

```python
TOW_LAYOUT = """() => {
  const q = s => document.querySelector('#about ' + s);
  const text = document.getElementById('aboutdedication').getBoundingClientRect();
  const car = q('.ab-car').getBoundingClientRect(), stage = q('.ab-dedication').getBoundingClientRect();
  return { carRightOfText: car.left >= text.right, inside: text.left >= stage.left && car.right <= stage.right,
           carWidth: car.width, aria: q('.ab-car').getAttribute('aria-hidden'),
           transform: getComputedStyle(q('.ab-tow')).transform,
           anims: q('.ab-tow').getAnimations({ subtree: true }).length };
}"""


def test_dedication_car_drives_in_and_parks_beside_the_text(server):
    """#613: car, rope and text enter as one unit from the left; afterwards the car stands to the right of the text."""
    with sync_playwright() as p:
        b, page, errors = boot(p, server)
        page.click("#aboutbtn")
        running = page.evaluate(TOW_LAYOUT)["anims"]
        page.evaluate("() => Promise.all(document.querySelector('#about .ab-tow').getAnimations({ subtree: true }).map(a => a.finished))")
        parked = page.evaluate(TOW_LAYOUT)
        dedication = page.inner_text("#aboutdedication")
        b.close()
    assert running >= 4, running                       # drive, flutter, bob, two wheels
    assert parked["carRightOfText"] and parked["inside"] and parked["transform"] == "none", parked
    assert parked["aria"] == "true" and parked["carWidth"] == 72, parked
    assert dedication == "This game is dedicated to Juliska"
    assert errors == []


def test_dedication_is_static_under_reduced_motion(server):
    with sync_playwright() as p:
        b, page, errors = boot(p, server, viewport=(375, 740))
        page.emulate_media(reduced_motion="reduce")
        page.click("#aboutbtn")
        parked = page.evaluate(TOW_LAYOUT)
        b.close()
    assert parked["anims"] == 0 and parked["transform"] == "none", parked
    assert parked["carRightOfText"] and parked["inside"] and parked["carWidth"] == 48, parked
    assert errors == []
```

- [ ] **Step 2: Run, expect FAIL** (`.ab-car` is null → TypeError in evaluate): `python -m pytest tests/test_about.py -q -k dedication`.

### Task 2: Markup — the tow unit

**Files:** `index.html` (around line 488)

- [ ] **Step 1: Replace** the section

```html
  <section class="ab-dedication">
    <p id="aboutdedication" data-i18n="aboutDedication">This game is dedicated to Juliska</p>
  </section>
```

with

```html
  <!-- #613 the dedication drives in: a small car tows the text as a banner, then parks beside it (CSS only; the <p> keeps text only, applyStaticStrings rewrites its innerHTML) -->
  <section class="ab-dedication">
    <div class="ab-tow">
      <p id="aboutdedication" data-i18n="aboutDedication">This game is dedicated to Juliska</p>
      <span class="ab-rope" aria-hidden="true"></span>
      <svg class="ab-car" viewBox="0 0 96 48" aria-hidden="true" focusable="false">
        <path d="M0 24h12" stroke="#b9bfc9" stroke-width="3" stroke-linecap="round"/>
        <path d="M12 38V26q0-5 5-5h9l7-11q2-3 6-3h19q4 0 7 3l9 11h12q6 0 6 6v11q0 2-2 2H14q-2 0-2-2z" fill="#ff7a1a" stroke="#14171d" stroke-width="3" stroke-linejoin="round"/>
        <path d="M34 21l5.5-9h11v9z" fill="#8fd8e8" stroke="#14171d" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M54 12h8q2.5 0 4 2l5.5 7H54z" fill="#8fd8e8" stroke="#14171d" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M12 36h80" stroke="#b9bfc9" stroke-width="3"/>
        <rect x="86" y="27" width="6" height="5" rx="1.5" fill="#f5efe0" stroke="#14171d" stroke-width="2"/>
        <rect x="13" y="27" width="4" height="5" rx="1" fill="#e0322d"/>
        <g class="ab-wheel"><circle cx="30" cy="38" r="8" fill="#14171d" stroke="#7d8593" stroke-width="3"/><path d="M30 33v10M25 38h10" stroke="#b9bfc9" stroke-width="2"/></g>
        <g class="ab-wheel"><circle cx="72" cy="38" r="8" fill="#14171d" stroke="#7d8593" stroke-width="3"/><path d="M72 33v10M67 38h10" stroke="#b9bfc9" stroke-width="2"/></g>
      </svg>
    </div>
  </section>
```

Geometry of the body path (for anyone adjusting it): bottom-left (12,38) up to (12,26), rounded to (17,21), rear deck to (26,21), rear pillar up to (33,10), rounded roof from (39,7) to (58,7), down the windscreen to (74,21), bonnet to (86,21), rounded nose to (92,27), down to (92,38), rounded corners to the floor at y 40. Wheels sit at y 38 with r 8, so the tyres reach y 46 inside the 48 viewBox. The tow hook at y 24 is the vertical centre of the rendered car, which is where the flex-centred rope meets it.

- [ ] **Step 2: Check** `grep -n 'ab-tow\|ab-car\|ab-rope' index.html` shows the markup once, and the `<p>` still has `id="aboutdedication" data-i18n="aboutDedication"` and only text inside.

### Task 3: CSS — stage, unit, animations, reduced motion, phone

**Files:** `index.html` (CSS lines 174-175 and the phone block at line 207)

- [ ] **Step 1: Replace** the two lines

```css
.ab-dedication{padding:14px 20px;text-align:center;background:linear-gradient(#3a404b,#23272f);border:5px solid;border-color:var(--steel-l) var(--ink) var(--ink) var(--steel-l)}
#aboutdedication{margin:0;font-family:Bungee,sans-serif;font-size:clamp(22px,4vw,36px);line-height:1.2;color:var(--sun)}
```

with

```css
/* #613 the dedication drives in: .ab-tow (text, rope, car) enters from the left, the car brakes with a hair of overshoot and parks beside the text.
   .ab-dedication clips so the off-stage unit never widens #about (phone test). Reduced motion: the parked picture, no animation. */
.ab-dedication{position:relative;overflow:hidden;padding:14px 20px;text-align:center;background:linear-gradient(#3a404b,#23272f);border:5px solid;border-color:var(--steel-l) var(--ink) var(--ink) var(--steel-l)}
.ab-tow{display:flex;align-items:center;justify-content:center;animation:ab-drive 2s cubic-bezier(.25,.85,.35,1.1) both}
#aboutdedication{margin:0;min-width:0;font-family:Bungee,sans-serif;font-size:clamp(22px,4vw,36px);line-height:1.2;color:var(--sun);transform-origin:100% 50%;animation:ab-flutter 2s ease-in-out both}
.ab-rope{flex:none;width:26px;height:0;margin-left:10px;border-top:3px solid var(--steel-l)}
.ab-car{flex:none;width:72px;height:36px;overflow:visible;animation:ab-bob .3s ease-in-out 6 both}
.ab-wheel{transform-box:fill-box;transform-origin:center;animation:ab-spin .4s linear 5 both}
@keyframes ab-drive{from{transform:translateX(calc(-50vw - 100%))}to{transform:none}}
@keyframes ab-flutter{0%,100%{transform:none}20%{transform:skewY(2.5deg)}40%{transform:skewY(-2deg)}60%{transform:skewY(1.5deg)}80%{transform:skewY(-.8deg)}}
@keyframes ab-bob{0%,100%{transform:none}50%{transform:translateY(-1.5px)}}
@keyframes ab-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ab-tow,#aboutdedication,.ab-car,.ab-wheel{animation:none}}
```

Why `calc(-50vw - 100%)`: `.ab-tow` is a block-level flex container, so `100%` is the stage width `S`; the unit's right edge then sits at `S - 50vw - S = -50vw`, off-stage on every viewport. Why `transform: none` at the end: the tests read `getComputedStyle(.ab-tow).transform == "none"`, which `fill-mode: both` keeps after the last frame.

- [ ] **Step 2: Phone sizes.** In the `@media (max-width:600px)` block, extend the existing `#about{…}` line (line 207):

```css
  #about{padding:12px 16px 16px;gap:12px}.ab-car{width:48px;height:24px}.ab-rope{width:16px}.ab-tabs [role=tab]{flex-basis:40%;padding:0 8px;letter-spacing:1px}.ab-people,.ab-credits{grid-template-columns:minmax(0,1fr)}
```

- [ ] **Step 3: Commit and push the branch**, then run `python -m pytest tests/test_about.py tests/test_about_tabs.py -q` in the foreground (timeout 600000). Expect all green, including the two new tests, `test_german_texts` and `test_phone_width_never_scrolls_sideways`.

### Task 4: Changelog

**Files:** `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]`, add an `### Added` section above `### Changed` (if none exists yet) with one entry, Swiss local time of the commit:

```markdown
### Added

- `2026-11-02 HH:MM` **About**: the **dedication to Juliska** now drives in. A small orange car tows the text in from the left as a banner, brakes and parks beside it; after that the text stands still and readable as before. With „reduce motion" enabled in the system settings the car and the text are simply shown parked.
```

- [ ] **Step 2:** Commit `feat(about): the dedication drives in, towed as a banner by a small car (#613)` and push.

## Verification checklist (PR description)

- `python -m pytest tests/test_about.py tests/test_about_tabs.py -q` green (paste the summary line).
- `grep -c 'ab-wheel' index.html` → 3 (one CSS rule, two groups).
- No JS diff: `git diff main -- index.html | grep '^[+-]' | grep -v '^[+-][+-]' | grep -c 'function\|=>'` → 0.
