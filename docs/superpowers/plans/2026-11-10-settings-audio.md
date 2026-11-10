# Settings dialog (audio) — implementation plan for #842

Spec: `docs/superpowers/specs/2026-11-10-settings-audio-design.md` — read it first (wireframe, markup, decisions D1–D5). Node tests first, Playwright in the foreground; commit and push before running Playwright.

## Task 1 — `settings.js` (pure) + `tests/settings.test.mjs`

Write the failing test first:

```js
// tests/settings.test.mjs — #842: the settings dialog's pure rules
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { SETTINGS_STORE, SOUND_VOLUME, soundOnFrom, soundVolFrom, soundGain, settingsKeyAction, musicCaptionKey } from '../settings.js';
const key = (code) => ({ code, shiftKey: false, repeat: false });
test('store keys and defaults', () => {
  assert.deepEqual(SETTINGS_STORE, { sound: 'mm.sound', soundVol: 'mm.soundVol' });
  assert.equal(soundOnFrom(null), true); assert.equal(soundOnFrom('0'), false);
  assert.equal(soundVolFrom(null), SOUND_VOLUME.start); assert.equal(soundVolFrom('7'), 7); assert.equal(soundVolFrom('x'), 10); assert.equal(soundVolFrom('11'), 10);
});
test('soundGain: square law, 0 when off', () => { assert.equal(soundGain(true, 10), 1); assert.equal(soundGain(true, 5), 0.25); assert.equal(soundGain(false, 10), 0); });
test('keys: Esc back, native keys pass, game keys ignored', () => {
  assert.equal(settingsKeyAction(key('Escape')), 'back');
  for (const c of ['Tab', 'Enter', 'NumpadEnter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) assert.equal(settingsKeyAction(key(c)), 'pass', c);
  for (const c of ['KeyM', 'Digit5', 'Digit9', 'Digit0', 'KeyW', 'KeyP']) assert.equal(settingsKeyAction(key(c)), 'ignore', c);
});
test('music caption: menu music on the start screen, car radio in a run', () => { assert.equal(musicCaptionKey(false), 'setMusicMenu'); assert.equal(musicCaptionKey(true), 'setMusicRadio'); });
```

Then `settings.js`:

```js
// settings.js (#842): the settings dialog's pure rules. No DOM, so node --test imports it.
export const SETTINGS_STORE = Object.freeze({ sound: 'mm.sound', soundVol: 'mm.soundVol' });
export const SOUND_VOLUME = Object.freeze({ min: 0, max: 10, start: 10 });   // 10 = today's fixed effects level
export const soundOnFrom = (stored) => stored !== '0';
export function soundVolFrom(stored) {
  const n = Number(stored);
  return stored !== null && stored !== '' && Number.isInteger(n) && n >= SOUND_VOLUME.min && n <= SOUND_VOLUME.max ? n : SOUND_VOLUME.start;
}
export const soundGain = (on, vol) => (on ? (vol / SOUND_VOLUME.max) ** 2 : 0);   // the radio's square law (radio.js trackGain)
const PASS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
export function settingsKeyAction(e) { if (e.code === 'Escape') return 'back'; return PASS.has(e.code) ? 'pass' : 'ignore'; }
export const musicCaptionKey = (inRun) => (inRun ? 'setMusicRadio' : 'setMusicMenu');
```

verify: `node --test tests/settings.test.mjs`

## Task 2 — `pause.js`: the Settings button

Test first (`tests/pause.test.mjs:56,98,106`): insert `'pausesettings'` after `'pauseabout'` in the three expected lists. Then edit `PAUSE_BUTTONS` and `TUTORIAL_PAUSE` in `pause.js` the same way. verify: `node --test tests/pause.test.mjs`.

## Task 3 — `strings.js`

Add in both tables (en at the `#509 About` block, de at `#509 Über`): `setTitle`, `setSub`, `setAudio`, `setSound`, `setSoundCap`, `setMusic`, `setMusicMenu`, `setMusicRadio`, `setOn`, `setOff`, `setHint`, `settingsBtn` with the values from the spec. Change `keyMute` (en `strings.js:365`, de `:1020`) to `'sound off · on (effects)'` / `'Ton aus · an (Effekte)'`. verify: `node --test tests/*.test.mjs`.

## Task 4 — `index.html`: markup and CSS

- Markup: the `#settings` block from the spec, placed right after `#about` (`index.html:713`). `#settingsbtn` (`class="btn small" data-i18n="settingsBtn" style="text-transform:none"`) between `#aboutbtn` and `#musicbtn` (`:565-566`). `#pausesettings` (`class="btn" data-i18n="settingsBtn"`) after `#pauseabout` (`:742`).
- CSS next to `#about` (`:221-253`): `#settings` = the `#about` rule (+ `[hidden]{display:none}`); `.st-panels{flex:1;min-height:0;overflow-y:auto}`; `.st-sec h2` = `.ab-sec h2`; `.st-row` = the grid from the spec, `padding:14px 0;border-bottom:3px solid var(--steel)`; `.st-label` 22px italic uppercase `var(--cream)`; `.st-cap{grid-column:1/-1}` 15px `var(--steel-l)`; `.st-val{min-width:9ch}`; `#settings input[type=range]{width:100%;height:44px;accent-color:var(--sun)}` with the `--sun` focus outline; `@media (max-width:600px){.st-row{grid-template-columns:1fr auto}.st-row input{grid-column:1/-1}}`.
- Add `#settings` to the HUD-hiding selectors at `:257-258` (`body:has(#settings:not([hidden]))`, same lists as `#about`).

## Task 5 — `index.html`: `SFX` sound level and the hub

Import `SETTINGS_STORE, soundOnFrom, soundVolFrom, soundGain, settingsKeyAction, musicCaptionKey` from `./settings.js` at `:824`. In the `SFX` IIFE (`:3995-4055`):

- State: `const snd = { on: soundOnFrom(ls(SETTINGS_STORE.sound)), vol: soundVolFrom(ls(SETTINGS_STORE.soundVol)) }; let muted = !snd.on;` (`ls`/`save` = try/catch `localStorage` like `RADIO.load`/`save`).
- `ctx()` (`:4000`): after the limiter, `const mix = ac.createGain(); mix.gain.value = 0.5; mix.connect(limit); ac.mix = mix; const master = ac.createGain(); master.gain.value = soundGain(snd.on, snd.vol); master.connect(mix); ac.master = master;`
- `graph()` → `return { ac: a, master: a.mix };` (comment: the radio bypasses the effects bus, D1).
- New: `function applySound() { muted = !snd.on; save(SETTINGS_STORE.sound, snd.on ? 1 : 0); save(SETTINGS_STORE.soundVol, snd.vol); if (ac) ac.master.gain.setTargetAtTime(soundGain(snd.on, snd.vol), ac.currentTime, 0.02); }`
- Public: `sound() { return { ...snd }; }`, `setSoundOn(on) { snd.on = !!on; applySound(); }`, `setSoundVol(v) { snd.vol = v; applySound(); }`, `blip() { beep(880, 0.06, 'square', 0.12); }`, `toggle() { snd.on = !snd.on; applySound(); return muted; }`.
- `state()` (`:4052`) adds `sound: { ...snd }`.

verify: `node --test tests/sound.test.mjs` still green (pure part untouched).

## Task 6 — `index.html`: `RADIO.setVolume` and the `SETTINGS` controller

- `RADIO` return object (`:4120`): add `setVolume(v) { S.vol = stepVolume(v, 0); save(RADIO_STORE.vol, S.vol); apply(); }` and `on: () => S.on`.
- Next to the `ABOUT` block (`:5478-5501`):

```js
const SETTINGS = { on: false, from: 'start' };   // #842
function renderSettings() {
  const s = SFX.sound(), r = RADIO.state(), musicOn = r.inRun ? r.on : r.menuOn;
  const sw = (id, on) => { const b = $(id); b.setAttribute('aria-checked', String(on)); b.textContent = tr(on ? 'setOn' : 'setOff'); };
  sw('setsound', s.on); $('setsoundvol').value = s.vol; $('setsoundpct').textContent = tr('radioVolume', s.vol * 10);
  sw('setmusic', musicOn); $('setmusicvol').value = r.vol; $('setmusicpct').textContent = tr('radioVolume', r.vol * 10); $('setmusiccap').textContent = tr(musicCaptionKey(r.inRun));
}
function openSettings(from) { SETTINGS.on = true; SETTINGS.from = from; for (const k in keys) keys[k] = false; closeHelp(); $(from === 'pause' ? 'pause' : 'overlay').hidden = true; $('settings').hidden = false; renderSettings(); $('settingsback').focus(); }
function closeSettings() { if (!SETTINGS.on) return; SETTINGS.on = false; $('settings').hidden = true; const back = SETTINGS.from === 'pause'; $(back ? 'pause' : 'overlay').hidden = false; $(back ? 'pausesettings' : 'settingsbtn').focus(); }
function settingsKey(e) { if (settingsKeyAction(e) !== 'back') return; e.preventDefault(); if (!e.repeat) closeSettings(); }   // 'pass': native; 'ignore': swallowed
$('settingsbtn').onclick = () => openSettings('start'); $('pausesettings').onclick = () => openSettings('pause'); $('settingsback').onclick = closeSettings;
$('setsound').onclick = () => { SFX.setSoundOn(!SFX.sound().on); renderSettings(); };
$('setsoundvol').oninput = (e) => { SFX.setSoundVol(+e.target.value); SFX.blip(); renderSettings(); };
$('setmusic').onclick = () => { RADIO.cmd('power'); renderSettings(); };
$('setmusicvol').oninput = (e) => { RADIO.setVolume(+e.target.value); renderSettings(); };
window.__mm.settings = () => ({ open: SETTINGS.on, from: SETTINGS.from, sound: SFX.sound(), music: (({ on, menuOn, vol }) => ({ on, menuOn, vol }))(RADIO.state()) });
```

- Keydown chain (`:3960`): right after `if (ABOUT.on) { aboutKey(e); return; }` add `if (SETTINGS.on) { settingsKey(e); return; }`.
- Sync from the other paths: call `renderSettings()` after the M toast (`:3960`), in `menuCmd` / `cmd` after `apply()` (`:4100`, `:4111`; a hoisted declaration, callable from the earlier IIFE at runtime) and in the `gg-langchange` listener (`:6003`). `PAUSE_ALL` / `pauseIds` pick `pausesettings` up from `PAUSE_BUTTONS` by themselves; `renderMusicBtn()` stays.


## Task 7 — Playwright: `tests/test_settings.py`, and the pinned pause orders

Copy `boot()` from `tests/test_about.py`; asserts after `b.close()`. A range takes no `page.fill`: set `.value` and dispatch `new Event('input')` in `page.evaluate`.

1. `test_opens_from_start_and_esc_returns`: click `#settingsbtn` → `__mm.settings().open`, `#settings` visible, `#overlay` hidden, title "Settings"; `KeyW` → `__mm.keysDown() == []`; `Escape` → closed, overlay shown, focus `settingsbtn`; `errors == []`.
2. `test_m_and_the_dialog_share_the_sound_switch`: `KeyM` (dialog closed) → open → `#setsound` `aria-checked == 'false'`, text "off"; click it → `sound.on`; slider 4 → `sound.vol == 4`, `#setsoundpct` == "Volume 40 %", `localStorage` `mm.sound == '1'`, `mm.soundVol == '4'`; reload → `sound == {on: True, vol: 4}`.
3. `test_music_row_is_the_menu_music_on_the_start_screen`: `#setmusiccap` == "Menu music"; click `#setmusic` → `#musicbtn` "Music: off", `__mm.radio().menuOn` false; `Digit5` with the dialog closed → reopened switch "on"; slider 3 → `__mm.radio().vol == 3`.
4. `test_opens_from_the_pause_menu_and_back_returns_there`: a run as in `tests/test_about.py:140-150`, pause, click `#pausesettings` → caption "Car radio", `#pause` hidden; `Escape` → `#pause` shown, `__mm.pause().on`, focus `pausesettings`.

Update the pinned orders: insert `"pausesettings"` after `"pauseabout"` in `tests/test_pause.py:137,247`, `tests/test_cruise.py:56`, `tests/test_tutorial.py:176`, `tests/test_about.py:152`.

verify (foreground, generous timeout): `pytest tests/test_settings.py tests/test_about.py tests/test_pause.py tests/test_radio.py tests/test_crash.py -x -q`. `test_crash.py:134` (M mutes a crash) must stay green — M still gates the effects.

## Task 8 — CHANGELOG and docs

Under `## [Unreleased]` → `### Added`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:

```markdown
- `<timestamp>` **Settings** in the main menu and the pause menu: **Sound** and **Music** each with an on/off switch and a volume slider. <kbd>M</kbd>, 5 and 9 / 0 and the Music button change the same values, and the sound setting now survives a reload. <kbd>M</kbd> mutes the effects only; the radio keeps playing.
```

Commit: `feat(ui): settings dialog with sound and music (#842)`.
