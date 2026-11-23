# MP mode switch (#1110) Implementation Plan

**Goal:** The host switches cruise ↔ race in a running multiplayer session through the lobby, without anyone reconnecting.

**Architecture:** A host-only pause-menu button sends the existing `back` message and calls `netBackToLobby()` (the #837 part d path). `netBackToLobby` first closes any open pause dialog and abandons a running run, so it is safe mid-drive. The lobby's existing **Drive together** / **Start race** buttons are the mode choice. No codec change.

**Spec:** `docs/superpowers/specs/2026-11-23-mp-mode-switch-design.md`

**Global constraints:** buildless, no new packages. Run only `node --test tests/pause.test.mjs tests/strings.test.mjs` and the one new Playwright file (not the full suite). Playwright in the foreground. Commit and push before the browser test.

---

### Task 1: `withLobbyButton` in pause.js (TDD)

**Files:** `pause.js`, `tests/pause.test.mjs`

- [ ] **Write the failing test** — append to `tests/pause.test.mjs` and add `withLobbyButton` to the import on line 4:

```js
test('withLobbyButton_WithMainMenu_InsertsChangeModeBeforeIt', () => {
  assert.deepEqual(withLobbyButton(pauseButtonsFor('cruise')),
    ['pauseresume', 'pausevehicle', 'pausestyle', 'pausetimetable', 'pauseabout', 'pausesettings', 'pauselobby', 'pausemenu']);
  const race = withLobbyButton(PAUSE_BUTTONS);
  assert.equal(race[race.indexOf('pausemenu') - 1], 'pauselobby');
});

test('withLobbyButton_WithoutMainMenu_LeavesTheListAlone', () => {
  assert.deepEqual(withLobbyButton(pauseButtonsFor('tutorial')), pauseButtonsFor('tutorial'));
});

test('withLobbyButton_DoesNotChangeItsInput', () => {
  const ids = pauseButtonsFor('cruise');
  withLobbyButton(ids);
  assert.ok(!ids.includes('pauselobby'));
  assert.ok(!PAUSE_BUTTONS.includes('pauselobby'), 'single player never shows it');
});
```

- [ ] Run `node --test tests/pause.test.mjs` → FAIL (`withLobbyButton` is not exported).
- [ ] **Implement** — in `pause.js`, below `pauseButtonsFor`:

```js
// #1110: the multiplayer host's "Change mode" sits just before Main menu; a menu without Main menu (tutorial) has no place for it
export function withLobbyButton(ids) {
  const at = ids.indexOf('pausemenu');
  if (at < 0) return ids;
  return [...ids.slice(0, at), 'pauselobby', ...ids.slice(at)];
}
```

- [ ] Run `node --test tests/pause.test.mjs` → PASS.
- [ ] Commit: `feat(multiplayer): pause rule for the host's change-mode button (#1110)`

### Task 2: string, markup and wiring in index.html

**Files:** `strings.js`, `index.html`

- [ ] `strings.js`: after `pauseMenu: 'Main menu',` (en, ~line 612) add `pauseMpMode: 'Change mode (lobby)',`; after `pauseMenu: 'Hauptmenü',` (de, ~line 1483) add `pauseMpMode: 'Modus wechseln (Lobby)',`.
- [ ] Markup: in `#pause`, directly before `<button id="pausemenu" …>` (~line 991):

```html
      <button id="pauselobby" class="btn" type="button" hidden data-i18n="pauseMpMode">Change mode (lobby)</button>
```

- [ ] Import: add `withLobbyButton` to the `./pause.js` import (~line 1087).
- [ ] `PAUSE_ALL` / `pauseIds` (~lines 7720-7721) become:

```js
const PAUSE_ALL = [...new Set([...PAUSE_BUTTONS, ...pauseButtonsFor('tutorial'), 'pauselobby'])];
const netHostDriving = () => NET.role === 'H' && NET.session;   // #1110: only the host, only while the shared drive runs
const pauseIds = () => { const ids = pauseButtonsFor(R.mode).filter((id) => id !== 'pausetimetable' || POSTAUTO.ready); return netHostDriving() ? withLobbyButton(ids) : ids; };   // #801 / #534 / #1110
```

  Keep the existing trailing comments of the old `pauseIds` line.
- [ ] Shared host helper, next to `netRematch` (~line 7437):

```js
// #837 part d / #1110: the host takes everyone back to the lobby; the link stays, the next mode is picked there
function netHostToLobby() {
  if (NET.role !== 'H' || !NET.session) return;
  NET.link.broadcast({ type: 'back' });
  netBackToLobby();
}
```

  The `NET.session` guard holds for `#mpback` too: the session is still on while the result shows (`test_guest_drop_is_dnf_and_back_to_lobby` waits for it to turn false only after the click).
- [ ] Replace the `#mpback` handler (~line 7499) with `$('mpback').onclick = netHostToLobby;` and add `$('pauselobby').onclick = netHostToLobby;` next to it.
- [ ] `netBackToLobby` (~line 7447) closes the run first:

```js
// #1110: it can now arrive mid-drive -- every pause dialog closes and a running run is abandoned, as on Main menu
function netAbandonRun() {
  closeTimetable(); closeAbout(); closeSettings(); closePause();   // each a no-op when not open; closePause also undoes a vehicle swap
  if (R.state !== 'racing' && R.state !== 'armed') return;         // a finished race keeps its state (the result path)
  trackModeEnd('abandoned');
  R.state = 'ready';
}
function netBackToLobby() {
  netAbandonRun();
  netEndSession();
  // … rest unchanged
}
```

  Order matters: `closeTimetable`/`closeAbout`/`closeSettings` re-show `#pause` when opened from it, and `closePause` hides it again.
- [ ] Run `node --test tests/pause.test.mjs tests/strings.test.mjs` → PASS.
- [ ] Commit: `feat(multiplayer): host switches the mode through the lobby (#1110)` and push the branch.

### Task 3: Playwright test

**Files:** `tests/test_multiplayer_mode_switch.py` (new)

- [ ] Write:

```python
"""#1110: the host switches cruise -> race through the lobby; nobody reconnects.
Slow (Playwright, two heavy pages): run in the foreground."""
from test_multiplayer_cruise import pair_fixture, ready_both  # noqa: F401  (fixture)
from test_multiplayer_lobby import T, connect

IN_SESSION = "() => window.__mm.net().session && document.querySelector('#mplobby').hidden"
IN_LOBBY = "() => !window.__mm.net().session && !document.querySelector('#mplobby').hidden"


def start_cruise(host, guest):
    connect(host, guest)
    ready_both(host, guest)
    host.click("#mpgo")
    for page in (host, guest):
        page.wait_for_function(IN_SESSION, timeout=T)


def test_host_switches_cruise_to_race_without_reconnecting(pair):
    host, guest, errors = pair
    start_cruise(host, guest)
    peers = host.evaluate("() => window.__mm.net().peers")

    guest.click("#pausebtn")
    assert guest.is_hidden("#pauselobby")        # only the host switches
    guest.click("#pauseresume")

    host.click("#pausebtn")
    assert host.is_visible("#pauselobby")
    host.click("#pauselobby")
    for page in (host, guest):
        page.wait_for_function(IN_LOBBY, timeout=T)
    assert host.is_hidden("#pause")
    assert host.evaluate("() => window.__mm.net().peers") == peers
    assert host.is_visible("#mprace") and host.is_visible("#mpgo")

    for page in (host, guest):
        page.click("#mpready")
    host.wait_for_function("() => !document.querySelector('#mprace').disabled", timeout=T)
    host.click("#mprace")
    for page in (host, guest):
        page.wait_for_function("() => window.__mm.net().race && window.__mm.net().race.go", timeout=T)
    assert errors == []


def test_guest_with_open_pause_menu_follows_into_the_lobby(pair):
    host, guest, errors = pair
    start_cruise(host, guest)
    guest.click("#pausebtn")
    guest.click("#pausesettings")
    host.click("#pausebtn")
    host.click("#pauselobby")
    guest.wait_for_function(IN_LOBBY, timeout=T)
    assert guest.is_hidden("#pause") and guest.is_hidden("#settings")
    assert guest.evaluate("() => window.__mm.pause().on") is False
    assert errors == []
```

- [ ] Run `python3 -m pytest tests/test_multiplayer_mode_switch.py -q` in the foreground (`timeout` ≥ 600000) → PASS. If the pages need the throttling flags or a guest pause click times out because the pause only opens in a run, mirror what `tests/test_multiplayer_race_result.py` does.
- [ ] Commit: `test(multiplayer): host switches the mode through the lobby (#1110)`

### Task 4: CHANGELOG

- [ ] Under `## [Unreleased]` → `### Added`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `<timestamp>` Im **Mehrspieler** wechselt der Gastgeber den **Spielmodus**, ohne dass jemand neu verbinden muss: Pause → **Modus wechseln (Lobby)** bringt alle in die Lobby, dort startet er **Gemeinsam losfahren** oder **Rennen starten**.
```

- [ ] Commit: `docs(changelog): mode switch in multiplayer (#1110)`, push, open the PR with `Closes #1110`.
