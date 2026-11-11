# Radio tests: autoplay over CDP (#856)

## Problem
`tests/test_radio.py` passes `--autoplay-policy=no-user-gesture-required` in `ARGS` (line 11) to `chromium.launch`. With `PW_CDP_ENDPOINT` set, `tests/gpu_browser.py:remote_launch` replaces `launch` with `connect_over_cdp`, which attaches to an already running Chromium: launch args never apply, so autoplay stays blocked. Measured in the issue: `test_menu_music_starts_during_loading` and `test_keys_drive_the_radio_and_show_the_display` fail on the GPU browser, pass on the CI runner.

## Findings
- Autoplay policy is a browser **process** flag. CDP has no per-context or per-page setting for it (no `Emulation.*` or `Browser.*` command sets it), and Playwright's `new_context` has no option for it. So it cannot be switched on from the test side. (From knowledge of the CDP domains, not measured; see A1.)
- What works on both browsers is a real user gesture: the game already has a blocked-autoplay path that starts the menu music on the first key (`test_menu_music_blocked_autoplay_waits_for_the_first_key`, `tests/test_radio.py:79-92`).
- The third wanted item is already met: `test_pause_pauses_and_resumes_the_radio` uses `open_game(..., srf_hits=hits)`, which routes the SRF URL to a local mp3 via `stub_srf` (`tests/test_radio.py:17-21,152-156`), and `hermetic_api.route_srf` aborts the live host in every context. The flakiness against the live stream predates #735.

## Design
1. `over_cdp()` helper in `tests/test_radio.py`: true when the GPU browser hook is active (`conftest.GPU["endpoint"]`).
2. `open_game`: after the page is loaded, when `over_cdp()`, press `Shift` once (a user activation, the same key the blocked-path test uses) so the document may play audio. Every test that goes through `open_game` (including the two #845 Argovia tests) gets it without changes.
3. `test_menu_music_starts_during_loading` asserts that the track is fetched **at load start**, before any gesture. That is impossible without the flag over CDP: `pytest.skip` with a clear reason when `over_cdp()`. It stays a real test on the CI runner.
4. `test_menu_music_blocked_autoplay_waits_for_the_first_key` stays as is: it launches without the flag locally, and over CDP the remote browser keeps its default policy. If the GPU browser server itself was started with the autoplay flag, the test fails there; then skip it on CDP too (A3).
5. The pause test needs no change.

## Out of scope
Starting the GPU browser server (CT 141, #304) with `--autoplay-policy=no-user-gesture-required`: would make all tests simple but changes shared infra. Parked as an option.

## Overlap with #845
#845 appends `test_key_6_cycles_through_argovia` and `test_argovia_failure_falls_back_to_rhyflitzer_fm` plus helpers `ARGOVIA`/`stub_url` at the **end** of `tests/test_radio.py` and edits `tests/hermetic_api.py`/`tests/test_hermetic_api.py`. This issue edits the header (imports, `over_cdp`), `open_game`, and the first test only. Hunks do not touch; whichever lands second rebases cleanly. This issue does not touch `hermetic_api.py`.
