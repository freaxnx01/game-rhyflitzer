# Sisseln 1952 — PR 1: black-and-white look — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** <kbd>Ctrl</kbd>+<kbd>B</kbd> switches the 3D view to an old-photo look (greyscale, subtle grain, light vignette) and back; HUD and minimap stay in colour.

**Architecture:** No WebGL post-processing pass: a CSS `filter: grayscale(1)` on the WebGL canvas `#gl` plus a fixed, click-through overlay `#oldphoto` (vignette gradient + grain texture) stacked directly above `#gl` and below every HUD element. Driven by one body class `mono`, exactly like `hud-off` (#305). Zero per-frame cost. Photos (<kbd>X</kbd>, album thumbs) are greyed at capture time so they match what the player sees.

**Tech Stack:** vanilla JS ES modules, CSS, `node:test`, pytest + Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-sisseln-1952-design.md` (issue #530). This plan covers delivery step 1 only; PRs 2–5 get their own plans.

## Global Constraints

- Use Test-Driven Development for every task: write a failing test first, watch it fail, implement minimally to pass, verify green.
- Black-and-white is switchable on and off, **independently** of the time layer (which doesn't exist yet in this PR).
- Grey scope: **3D view only**; HUD and minimap stay in colour.
- Look: **subtle grain + light vignette, neutral grey (no sepia)**.
- Off at start; no persistence.
- All new UI text in `de` and `en` via `strings.js`. German text uses capitalised `Du`/`Dir` and real umlauts.
- Shortcut must be free in **all** `*.js` files and `index.html` (checked: plain <kbd>B</kbd> is "look back", hold, `controls.js:21`; no Ctrl+B anywhere). Handled **before** `keys[e.code] = true` so Ctrl+B never starts looking back.
- Browser tests: run only the affected Playwright test(s), in the foreground (no full suite, never `run_in_background`).
- Commits reference `#530`; Conventional Commits; branch `issue-530-sisseln-1952` from `origin/main`.

## Review Focus

1. **Ctrl+B held / auto-repeat** must toggle once, not flicker — `!e.repeat` like Ctrl+H (Task 2 Playwright test holds nothing but presses twice; the repeat guard is pinned by the node test of the key helper only. Reviewer: check the `!e.repeat` guard in the handler).
2. **Ctrl+B must not trigger "look back"** (plain B) — test: after Ctrl+B, `window.__mm` camera is not in back mode / `keys.KeyB` falsy (Task 2).
3. **HUD-off + mono together**: `#oldphoto` must not hide with `hud-off`, and must not cover the toast or dialogs (z-order by DOM position; Task 2 checks `#map` filter is `none`).
4. **Photo in mono** comes out grey; photo with mono off stays in colour (Task 3).
5. **Language switch** while mono is on: toast/help text follows `gg-langchange` via existing `tr()` (covered by strings parity test, Task 1).

---

### Task 1: key helper + strings

**Files:**
- Create: `oldphoto.js`
- Modify: `strings.js` (en block near `hudOff` ~line 203, de block near ~line 735)
- Test: `tests/oldphoto.test.mjs`; existing `tests/strings.test.mjs` must stay green (it checks en/de key parity)

**Interfaces:**
- Produces: `export function isMonoKey(key): boolean` — `key` is KeyboardEvent-like `{ code, ctrlKey }`; true only for `code === 'KeyB' && ctrlKey`.
- Produces string keys: `monoOn`, `monoOff`, `keyMono`.

- [ ] **Step 1: Write the failing test** `tests/oldphoto.test.mjs`

```js
test('isMonoKey: Ctrl+B only; a bare B stays look-back', () => {
  assert.equal(isMonoKey({ code: 'KeyB', ctrlKey: true }), true);
  assert.equal(isMonoKey({ code: 'KeyB', ctrlKey: false }), false);
  assert.equal(isMonoKey({ code: 'KeyH', ctrlKey: true }), false);
});
test('strings: mono toast and help label exist in en and de', () => {
  for (const lang of ['en', 'de']) for (const k of ['monoOn', 'monoOff', 'keyMono']) assert.notEqual(translate(lang, k), k, `${lang}.${k}`);
  assert.match(translate('en', 'monoOn'), /Ctrl\+B/);   // says how to get colour back
  assert.match(translate('de', 'monoOn'), /Ctrl\+B/);
});
```

(Check `translate`'s exact signature in `strings.js` / `tests/strings.test.mjs` first and adapt the call.)

- [ ] **Step 2: Run, expect FAIL** — `node --test tests/oldphoto.test.mjs` (module not found).
- [ ] **Step 3: Implement** `isMonoKey` in `oldphoto.js` (header comment `// #530: …`, pure, no DOM) and the strings:
  - en: `monoOn: 'Black and white · Ctrl+B for colour'`, `monoOff: 'Colour'`, `keyMono: 'black and white like an old photo, and back'`
  - de: `monoOn: 'Schwarzweiss · Ctrl+B für Farbe'`, `monoOff: 'Farbe'`, `keyMono: 'Schwarzweiss wie ein altes Foto, und zurück'`
- [ ] **Step 4: Run** `node --test tests/oldphoto.test.mjs tests/strings.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(look): Ctrl+B key helper and strings for black-and-white (#530)`

### Task 2: the look and the toggle

**Files:**
- Modify: `index.html` — CSS block (near `#gl` rule, line ~10, and the `body.hud-off` rule ~line 14), markup right after `<canvas id="gl">` (~line 307), help list next to `ctrl+KeyH` (~line 368), import line (~line 651), keydown handler (~line 3498, next to `isHudKey`), a `toggleMono()` next to `toggleHudShown()` (~line 4962)
- Test: `tests/test_mono_toggle.py` (model: `tests/test_hud_toggle.py`, same blocked-data setup)

**Interfaces:**
- Consumes: `isMonoKey` (Task 1).
- Produces: `body.mono` class; element `#oldphoto`; `function toggleMono()` in `index.html` (command: flips the class, toasts `monoOn`/`monoOff`).

- [ ] **Step 1: Write the failing test** `test_ctrl_b_turns_the_3d_view_grey_and_back(server)`:
  - start the game like `test_hud_toggle.py`; press `Control+b`; wait for `body.mono`
  - assert `getComputedStyle(#gl).filter` contains `grayscale(1)`
  - assert `getComputedStyle(#map).filter == 'none'` and `#oldphoto` is displayed (`display != 'none'`) with `pointer-events: none`
  - assert toast text contains `Ctrl+B`
  - assert `window.__mm` shows no look-back (read `keys.KeyB` via whatever debug hook exists; if none, assert `CAM.back` falsy through an existing `__mm` export — add `__mm.camBack` only if nothing exists)
  - press `Control+b` again; wait for no `body.mono`; `#gl` filter is `none`, `#oldphoto` not displayed
  - `errors == []`
- [ ] **Step 2: Run, expect FAIL** — `python -m pytest tests/test_mono_toggle.py -v` (timeout waiting for `body.mono`).
- [ ] **Step 3: Implement**
  - CSS: `#oldphoto{position:fixed;inset:0;pointer-events:none;display:none;background:<vignette radial-gradient, transparent centre → rgba(0,0,0,.35) corners>, <grain>}` and `body.mono #gl{filter:grayscale(1) contrast(1.05)}`, `body.mono #oldphoto{display:block}`. Grain: an inline SVG `feTurbulence` data-URI tile with low opacity (≈0.06–0.08), `mix-blend-mode: overlay`. Keep it subtle; static grain is fine.
  - Markup: `<div id="oldphoto" aria-hidden="true"></div>` directly after `#gl`, no z-index (DOM order puts it above the canvas, below the HUD).
  - Keydown: `if (isMonoKey(e)) { e.preventDefault(); if (!e.repeat) toggleMono(); return; }` right after the `isHudKey` line, i.e. before `keys[e.code] = true`.
  - Help: `<kbd data-cmd="ctrl+KeyB">Ctrl · B</kbd><span data-i18n="keyMono">…</span>` after the Ctrl·H row.
- [ ] **Step 4: Run** `python -m pytest tests/test_mono_toggle.py tests/test_hud_toggle.py -v` — PASS. Then `node --test tests/*.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(look): Ctrl+B shows the 3D view in black and white (#530)`

### Task 3: photos match the look

**Files:**
- Modify: `index.html` `capturePhoto()` / `captureThumb()` (~lines 5033–5035)
- Test: extend `tests/test_mono_toggle.py` with `test_photo_is_grey_in_mono(server)`; find the existing photo test (grep `photoSink` / `capturePhoto` in `tests/*.py`) and reuse its way of grabbing the PNG.

**Interfaces:**
- Produces: `function photoCanvas(): HTMLCanvasElement` in `index.html` (query) — returns `canvas` when `body.mono` is off, else a same-size 2D canvas drawn from `canvas` with `ctx.filter = 'grayscale(1)'`. `capturePhoto` calls `photoCanvas().toBlob(...)`, `captureThumb` draws from `photoCanvas()`. Grain/vignette are **not** baked in (my call: clean grey photo).

- [ ] **Step 1: Write the failing test** — with mono on, take a photo; decode the PNG (Pillow); assert every sampled pixel has `r == g == b` (±1). With mono off, assert at least one sampled pixel is coloured (sky). 
- [ ] **Step 2: Run, expect FAIL** (photo is in colour).
- [ ] **Step 3: Implement** `photoCanvas()` and route both captures through it.
- [ ] **Step 4: Run** `python -m pytest tests/test_mono_toggle.py -v` — PASS.
- [ ] **Step 5: Commit** `feat(look): photos taken in black and white come out grey (#530)`

### Task 4: changelog + PR

**Files:** Modify `CHANGELOG.md` (`[Unreleased]` → `### Added`, newest first)

- [ ] **Step 1:** Add entry with `TZ=Europe/Zurich date '+%F %H:%M'`:
  `` `<ts>` <kbd>Ctrl</kbd> <kbd>B</kbd> shows the world in **black and white**, like an **old photo** with a little grain and darker corners; press it again for colour. Speedometer and map stay in colour, photos you take come out grey. ``
- [ ] **Step 2:** `node --test tests/*.test.mjs` and `python -m pytest tests/test_mono_toggle.py tests/test_hud_toggle.py -v` — all PASS.
- [ ] **Step 3: Commit** `docs(changelog): black-and-white look (#530)`, push, open PR `feat(look): black-and-white old-photo view (Ctrl+B)` with body referencing `Part of #530` (not `Closes` — four more PRs follow).
