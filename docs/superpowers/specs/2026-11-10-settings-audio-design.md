# Settings dialog, first slice: audio (sound and music) — #842

First slice of #546. A **Settings** dialog reachable from the start screen and from the pause menu, with one section, *Audio*: a **Sound** row and a **Music** row, each an on/off switch plus a 0–10 volume slider. Later sections (graphics, language, controls, #546) stack below it.

## What exists today

- `SFX` (`index.html:3995-4055`): one `master` gain (0.5) into a limiter; every effect connects to `a.master`. `toggle()` (`index.html:4034`) flips `muted` and ramps `master` to 0 / 0.5 — **not persisted**, every page load starts unmuted. <kbd>M</kbd> → `toast(tr(SFX.toggle() ? 'muted' : 'soundOn'))` (`index.html:3960`). `graph()` (`index.html:4035`) hands the radio `a.master`, so <kbd>M</kbd> mutes the radio too.
- `RADIO` (`index.html:4059-4135`, rules in `radio.js`): three `<audio>` voices, each through its own gain **into the SFX master**. State `S.on` (car radio power, key `mm.radio`), `S.menuOn` (menu music, key `mm.menuMusic`), `S.vol` 0–10 (key `mm.radioVol`, `VOLUME.start = 6`). `menuGain(vol)` (`radio.js:48`) derives the menu music level from the **same** `S.vol` — one music volume already exists. Keys: 5 = power (start screen: menu music; in a run: radio), 9/0 = volume in a run only (`menuCmd`, `index.html:4098`, ignores them on the start screen). `#musicbtn` (`index.html:566`, `renderMusicBtn` `index.html:5442`) = `RADIO.cmd('power')` on the start screen.
- The About dialog (#509, `index.html:629-713`, `about.js`, `openAbout`/`closeAbout`/`aboutKey` `index.html:5488-5499`) is the model: full-screen `position:fixed` panel on `var(--ink)`, `.ws-head` with a Bungee `h1` and a `.btn` Back, a scrolling body, `ABOUT.from` remembering whether it sits over the start screen or the pause menu, a pure `aboutKeyAction` that owns the keyboard while open, the keydown chain checking `ABOUT.on` before anything else (`index.html:3960`), and `body:has(#about:not([hidden]))` hiding the HUD (`index.html:257`).
- Pause menu buttons are listed in `PAUSE_BUTTONS` / `TUTORIAL_PAUSE` (`pause.js:5-11`); `openPause` holds the sound (`holdSound(true)`, `index.html:5698`), so nothing is audible while the pause menu or a dialog opened from it is up.

## Decisions

### D1 — Sound = effects only; "Sound off" does not mute the music `[med]`

The issue defines *Sound* as "everything that isn't music", so the two rows are independent: Sound off + Music on still plays the radio. This changes <kbd>M</kbd>: it becomes the Sound switch (effects only) instead of a master mute. Rejected: keeping M as a master mute and nesting Music under Sound — then the dialog's Sound switch would silence Music while the Music switch still shows *on*, which contradicts "the dialog shows the values the keys set". A player who wants silence has two switches (5 / the Music button for music).

Audio graph change (`SFX`): a new hub gain `a.mix` (0.5, into the limiter) replaces `master` as the thing the limiter hears; `a.master` becomes the **effects bus** (gain = sound level) into `a.mix`, so every `g.connect(a.master)` in `SFX` stays as it is. `graph()` returns `{ ac, master: a.mix }`, so the radio voices bypass the effects bus. `muted` stays as `!sound.on` for the early-return guards (`if (muted || holds.size) return`).

### D2 — Radio and menu music share one Music volume `[high]`

Already true in code (`menuGain(S.vol)`, `radio.js:48`); the slider edits `S.vol` and `apply()` re-levels whichever voice plays. Rejected: a second volume for the menu music — nothing in the repo wants one, and 9/0 would then need a start-screen meaning.

### D3 — The Music switch is the switch of the place it was opened from `[med]`

Exactly key 5's rule: on the start screen the Music switch is the **menu music** (`S.menuOn`, same as `#musicbtn`), in a run (pause menu) it is the **car radio** (`S.on`). The dialog calls `RADIO.cmd('power')`, which already dispatches on `S.inRun`. A small caption under the row says which one it is (*Menu music* / *Car radio*). Rejected: a third, global music flag — it would be a new value none of the existing keys change, failing the "same values" criterion.

### D4 — Sound level is persisted; M is now persisted too `[high]`

New keys `mm.sound` (`'0'`/`'1'`) and `mm.soundVol` (0–10, start 10 = today's 0.5 master). Loaded at boot like `RADIO_STORE`. <kbd>M</kbd> writes `mm.sound`.

### D5 — Layout: full-screen dialog like About, stacked sections, no tabs `[med]`

One section now, more later. Stacked sections with an uppercase `h2` (the `.ab-sec h2` look) in a scrolling body give #546 a place to append *Graphics*, *Language*, *Controls* without reshaping anything; tabs can come when there are four sections. Volume as `<input type="range" min=0 max=10 step=1>` (native keyboard: arrows/Home/End; native touch), `accent-color: var(--sun)`, shown next to it as `Volume 60 %` (`tr('radioVolume', vol*10)`). The switch is a `.btn.small` with `role="switch"` and `aria-checked`, labelled *on* / *off* (the `pausekeybar` / `musicbtn` pattern).

## Wireframe (1280 px; on a phone the grid collapses to one column per row)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ SETTINGS                 (ws-sub: "Sound and music")          [‹ BACK]   │  .ws-head (h1 Bungee, --sun)
├──────────────────────────────────────────────────────────────────────────┤
│ AUDIO                                                                    │  .st-sec > h2 (like .ab-sec h2)
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Sound            [ ON  ]   ──────────●──────   Volume 100 %          │ │  .st-row: label | switch | range | value
│ │ engine, horn, crashes …                                              │ │  .st-cap (caption, --steel-l, 15px)
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │ Music            [ ON  ]   ────────●────────   Volume  60 %          │ │
│ │ Menu music  (in a run: Car radio · 5 · 9 / 0)                        │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ (later, #546)  GRAPHICS …   LANGUAGE …   CONTROLS …                      │  further .st-sec, appended
├──────────────────────────────────────────────────────────────────────────┤
│ Esc: back                                                 v1.x.y         │  .ab-foot style
└──────────────────────────────────────────────────────────────────────────┘
```

Grid: `.st-row{display:grid;grid-template-columns:minmax(120px,1fr) auto minmax(160px,2fr) auto;gap:12px 16px;align-items:center}`; the caption spans all columns. Below 600 px: `grid-template-columns:1fr auto` and the range + value on a second line.

Markup (ids are the contract for tests and the keydown chain):

```html
<div id="settings" hidden role="dialog" aria-modal="true" aria-labelledby="settingstitle">
  <div class="ws-head"><h1 id="settingstitle" data-i18n="setTitle">Settings</h1><span class="ws-sub" data-i18n="setSub">Sound and music</span>
    <button id="settingsback" class="btn" type="button" data-i18n="carselBack">‹ Back</button></div>
  <div id="settingspanels" class="st-panels">
    <section class="st-sec"><h2 data-i18n="setAudio">Audio</h2>
      <div class="st-row"><span class="st-label" id="setsoundlabel" data-i18n="setSound">Sound</span>
        <button id="setsound" class="btn small" type="button" role="switch" aria-checked="true" aria-labelledby="setsoundlabel">on</button>
        <input id="setsoundvol" type="range" min="0" max="10" step="1" aria-labelledby="setsoundlabel">
        <span id="setsoundpct" class="st-val"></span><p class="st-cap" data-i18n="setSoundCap">engine, horn, crashes …</p></div>
      <div class="st-row"><span class="st-label" id="setmusiclabel" data-i18n="setMusic">Music</span>
        <button id="setmusic" class="btn small" type="button" role="switch" aria-checked="true" aria-labelledby="setmusiclabel">on</button>
        <input id="setmusicvol" type="range" min="0" max="10" step="1" aria-labelledby="setmusiclabel">
        <span id="setmusicpct" class="st-val"></span><p id="setmusiccap" class="st-cap"></p></div>
    </section>
  </div>
  <p class="ab-foot"><span data-i18n="setHint">Esc: back</span></p>
</div>
```

Entry points: `#settingsbtn` (`.btn.small`, in the start screen's `.row.secondary` between About and Music) and `#pausesettings` (after `pauseabout` in `PAUSE_BUTTONS` and `TUTORIAL_PAUSE`).

## Behaviour

- `openSettings(from)` / `closeSettings()` mirror `openAbout` / `closeAbout`: clear `keys`, hide `#overlay` or `#pause`, show `#settings`, focus `#settingsback`; Back / Esc restores the origin and focuses `#settingsbtn` / `#pausesettings`. Opened from pause the sound stays held (nothing audible; the state still changes and is saved). From the start screen the menu music is audible, so the Music slider is heard live; a Sound slider move plays one short blip (`SFX.blip()`) so the level is heard too.
- `settingsKeyAction(e)` (pure, `settings.js`): `Escape` → `'back'`; `Tab`, `Enter`, `NumpadEnter`, `Space`, the four arrows, `Home`, `End`, `PageUp`, `PageDown` → `'pass'` (native focus moves, switch presses, range steps); every other key → `'ignore'`. The keydown chain checks `SETTINGS.on` right after `ABOUT.on`, so <kbd>M</kbd>, 5, 9/0 and the game keys never reach the game while the dialog is open.
- Live binding: `renderSettings()` reads `SFX.sound()` and `RADIO.state()` and writes the four controls, the two `%` texts and the music caption. It runs on open, after every control change, on `gg-langchange`, and from the existing M / 5 / 9 / 0 / `#musicbtn` paths (cheap; `#settings` hidden → the writes are invisible but keep it in sync).
- Switch click: Sound → `SFX.setSoundOn(!on)`; Music → `RADIO.cmd('power')`. Range `input`: Sound → `SFX.setSoundVol(v)`; Music → `RADIO.setVolume(v)` (new: sets `S.vol`, saves `mm.radioVol`, `apply()`, no toast). The 9/0 path keeps `stepVolume`.
- `SFX`: `sound()` → `{ on, vol }`; `setSoundOn(on)`, `setSoundVol(vol)` ramp `a.master` to `soundGain(on, vol)` (`settings.js`: `on ? (vol / 10) ** 2 : 0`, the radio's square law) and save; `toggle()` becomes `setSoundOn(!on)` returning the new muted flag so the M toast stays.
- `tr()` strings (en / de): `setTitle` Settings / Einstellungen, `setSub` Sound and music / Ton und Musik, `setAudio` Audio / Audio, `setSound` Sound / Ton, `setSoundCap` engine, horn, crashes … / Motor, Hupe, Crashs …, `setMusic` Music / Musik, `setMusicMenu` Menu music / Menümusik, `setMusicRadio` Car radio / Autoradio, `setOn` on / ein, `setOff` off / aus, `setHint` Esc: back / Esc: zurück, `settingsBtn` Settings / Einstellungen. Volume text reuses `radioVolume`. `keyMute` becomes "sound off · on (effects)" / "Ton aus · an (Effekte)".
- Debug hook: `window.__mm.settings = () => ({ open, from, sound: SFX.sound(), music: { on, menuOn, vol } })`.

## Tests

- `tests/settings.test.mjs` (node): `SETTINGS_STORE` keys, `soundOnFrom`, `soundVolFrom` (invalid → 10), `soundGain`, `settingsKeyAction`, `musicCaptionKey(inRun)`.
- `tests/pause.test.mjs`: `PAUSE_BUTTONS` / `pauseButtonsFor` lists include `pausesettings` after `pauseabout`. Playwright tests that pin the pause order (`tests/test_pause.py:137,247`, `tests/test_cruise.py:56`, `tests/test_tutorial.py:176`, `tests/test_about.py:152`) get `pausesettings` inserted.
- `tests/test_settings.py` (Playwright, hand-traced boot like `tests/test_about.py`): open from the start screen and Esc back (focus on `#settingsbtn`, game keys don't reach `keysDown`); M flips `#setsound` and the dialog shows it; the Music slider sets `__mm.radio().vol` and `#musicbtn` / key 5 flip `#setmusic`; values survive a reload; from the pause menu the dialog opens over the held game and Back returns to `#pausesettings`.

## Assumptions

- **A1** [med] D1: Sound is effects only; M no longer mutes the music. Rejected: nested master mute. Evidence: the issue's own definition of Sound; `index.html:4035` comment documents today's master routing.
- **A2** [high] D2: one Music volume for radio and menu music. Evidence: `radio.js:48` already derives the menu level from `S.vol`.
- **A3** [med] D3: the Music switch follows key 5's context rule (menu music on the start screen, car radio in a run). Evidence: `index.html:4098-4106` (`menuCmd` / `cmd`).
- **A4** [high] D4: new keys `mm.sound`, `mm.soundVol`; M becomes persistent. Evidence: `index.html:3996` (`muted = false` at boot, never stored).
- **A5** [med] D5: full-screen stacked-section dialog, no tabs yet; later #546 sections append `.st-sec` blocks. Evidence: About's structure (`index.html:629-713`).
- **A6** [low] `#settingsbtn` sits in the start screen's secondary row between About and Music, and `#musicbtn` stays. Evidence: `index.html:562-567`; the issue asks that the button keep working, not that it go.
- **A7** [low] Sound slider feedback: one short blip per change when not held. No repo signal; it is a one-liner and makes "takes effect immediately" audible on the start screen.

## Consequences

- <kbd>M</kbd> survives a reload now (it did not before); a tester who muted last week stays muted.
- <kbd>M</kbd> in a run leaves the radio playing — the F1 help text for M changes with it.
- Opening Settings from the pause menu happens over held sound: the Music/Sound sliders change silently there and are heard on resume.
- `SFX.graph()` returns the new hub, so the radio's level is no longer scaled by the sound volume; the radio's loudness relative to the effects shifts when the sound volume is below 10.
- The start screen's secondary row gains a sixth button; at phone width it wraps one more line.
