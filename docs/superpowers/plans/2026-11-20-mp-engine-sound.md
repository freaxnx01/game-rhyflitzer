# Engine sound in multiplayer (#1114) - plan

Spec: `docs/superpowers/specs/2026-11-20-mp-engine-sound-design.md`. Buildless, edit `index.html` directly (it is the source in this repo).

## Task 1 - failing test
Files: `tests/test_multiplayer_cruise.py` (add a test after `test_two_players_see_each_other_drive`, reuse the `pair` fixture, `connect`, `ready_both`, `T`).

```python
def test_both_players_have_engine_sound(pair):
    """#1114: a multiplayer session starts the engine voice on both pages, with no single-player run first."""
    host, guest, errors = pair
    connect(host, guest)
    ready_both(host, guest)
    for page in (host, guest):
        assert page.evaluate("() => window.__mm.audio().ctx") == "none"   # nothing has started audio yet
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(
            "() => window.__mm.net().session && window.__mm.audio().ctx !== 'none'", timeout=T)
        page.wait_for_function("() => window.__mm.audio().mix !== null", polling=250, timeout=T)
    assert errors == []
```

If the `ctx == 'none'` pre-check fails (something else already creates the context), drop it and keep the post-start asserts, and report that. Run it and confirm it FAILS on the current code (ctx stays 'none'):

`env PW_CDP_ENDPOINT= systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python3 -m pytest tests/test_multiplayer_cruise.py -k engine_sound -x`

Foreground, never `run_in_background`; generous timeout (600000 ms).

## Task 2 - the fix
File: `index.html`, function `netStartSession` (~line 7184). After `if (NET.session) return;` and `NET.session = true;` add:

```js
  SFX.start();                                                     // #1114: the engine voice (every single-player button does this before startRace)
```

Nothing else in `index.html`.

## Task 3 - verify
- Re-run the Task 1 command: it must pass.
- Run `tests/test_multiplayer_cruise.py` once in full (same wrapper) and `node --test tests/sound.test.mjs`. Do not run the full suite.
- Commit and push the branch before running the Playwright tests.

## Task 4 - changelog
`CHANGELOG.md`, under `## [Unreleased]` in `### Fixed` (create the heading if missing), newest first, in German, local time via `TZ=Europe/Zurich date '+%F %H:%M'`:

`- \`<timestamp>\` Im **Mehrspieler** hört man jetzt den **Motor**, auch wenn man vorher keine Einzelfahrt gestartet hat.`

## Done when
Test passes, full cruise file passes, `netStartSession` is the only `index.html` change, PR titled `fix(multiplayer): engine sound in a multiplayer session (#1114)` with `Closes #1114`.
