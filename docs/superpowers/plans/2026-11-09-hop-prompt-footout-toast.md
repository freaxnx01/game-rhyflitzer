# Hop prompt clears the get-out toast Implementation Plan (#783)

**Goal:** the deck hop prompt clears the "footOut" toast exactly like the plain enter prompt. Spec: `docs/superpowers/specs/2026-11-09-hop-prompt-footout-toast-design.md`.

**Constraints:** buildless; no new hooks; run only `tests/test_plattform_stair.py` (foreground, never in the background, generous timeout); anchor edits on code text, not line numbers (#776/#777 edit `index.html` too).

## Task 1: Failing test, then the fix

**Files:** `tests/test_plattform_stair.py`, `index.html` (`stepEnter()`)

- [ ] Write the failing test after `test_e_at_the_door_jumps_up_...`:

```python
@needs_world
def test_the_hop_prompt_clears_the_get_out_toast(server):
    with sync_playwright() as p:
        b, page, errors = open_world(p, server)
        plat = plattform(page)
        ex, ez = polar(page, 0, 2.0)
        page.evaluate("([x, z]) => window.__mm.place(x, z)", [ex, ez])   # in the car, at the door
        key(page, "z", 300)                                              # get out: toast(tr('footOut'))
        page.wait_for_function("() => window.__mm.platHop() === 'up'", timeout=120000)
        page.wait_for_timeout(1500)                                      # a few more frames
        state = page.evaluate("() => ({ prompt: document.querySelector('#prompt').textContent, toastShown: document.querySelector('#toast').classList.contains('show') })")
        b.close()
    assert errors == []
    assert state["prompt"] != "" and not state["toastShown"], state
```

  If `place` leaves the car too close to the door for `getOut()` to find a free spot, step the car a few metres away first, then walk with `footSim`.
- [ ] Run it, expect FAIL (toast still shown).
- [ ] In `index.html`, `stepEnter()`: replace the two lines starting `const hop = platHop(); if (hop) {` and `if (HUD.enter && !HUD.enterShown && $('toast').textContent === tr('footOut'))` so that the guard comes first and uses `HUD.enter || hop`:

```js
  const hop = platHop();
  if ((HUD.enter || hop) && !HUD.enterShown && $('toast').textContent === tr('footOut')) { toastT = 0; $('toast').classList.remove('show'); }   // #445, #783: the on-foot hint sits right under either prompt and would crowd it
  if (hop) { $('prompt').textContent = tr(hop === 'up' ? 'hopUpPrompt' : 'hopDownPrompt'); HUD.enterShown = true; return; }   // #701: the shortcut's prompt wins over the plain "Enter"
```

  Keep the existing comments' meaning; leave everything else in the function untouched.
- [ ] Run `tests/test_plattform_stair.py` fully; all green.
- [ ] Commit `fix(tower): clear the get-out toast when the deck hop prompt appears`.

## Task 2: Make the hover test check the stair

**Files:** `tests/test_plattform_stair.py`

- [ ] In `test_hover_at_the_door_offers_no_hop_and_the_stair_still_works`, after the `none` assertion value is read, turn hover off with `key(page, "f")` (toggleHover; first turn it on with `key(page, "f")` before reading `none`, and assert `window.__mm.foot().hover` for both), reset the walker to the door at `plat["base"]`, run `foot_sim(page, 3.0, ["KeyW"])` and assert `foot["y"] > plat["base"] + 1` (the walker climbs).
- [ ] Run it. If the walker cannot reach the first tread from the door with `W` (y stays at base), do not fiddle: rename the test to `test_hover_at_the_door_offers_no_hop` and keep only the hover assertion (allowed by the issue's AC).
- [ ] Commit `test(tower): the hover test also walks the stair`.

## Task 3: CHANGELOG

**Files:** `CHANGELOG.md`

- [ ] Under `## [Unreleased]` -> `### Fixed`, add at the top of that subsection (newest first), timestamp in Swiss time (`TZ=Europe/Zurich date +'%Y-%m-%d %H:%M'` at the time of the change), player-facing English:

```markdown
- `<timestamp>` Getting out of the car at the **Plattform Sisslerfeld** door no longer leaves the "you got out" hint **on top of** the "up to the deck" prompt: the hint disappears as the prompt appears.
```

- [ ] Commit `docs(changelog): hop prompt no longer overlaps the get-out hint`.
