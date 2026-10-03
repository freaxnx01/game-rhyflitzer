# Rear-View Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the cockpit view a small rear-view mirror at the top centre of the screen shows what is behind the car, live. No key, no setting.

**Architecture:** A pure module `prototype/mirror.js` decides *whether* (`mirrorVisible`), *where* (`mirrorRect`) and *when* (`mirrorDue`) the mirror draws. `prototype/index.html` owns a second `PerspectiveCamera`, a 256 × 80 `WebGLRenderTarget` and a tiny ortho scene with one flipped textured quad. After the main `renderer.render`, `drawMirror()` (re-)renders the target every second frame and draws the quad into a scissored inset of the canvas.

**Tech Stack:** vanilla JS + three.js in the buildless `prototype/index.html`; `node --test` for `mirror.js`; Playwright + pytest for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-03-rear-view-mirror-design.md`

## Global Constraints

- Cockpit view only (`CAM_VIEWS[camView].k === 'cockpit'`). Chase, near and bumper views: unchanged, no mirror, no extra render.
- Hidden when: B held (`CAM.back`), `FLY.on`, start/result overlay visible, Tab held (`keys.Tab`), touch device (`matchMedia('(pointer:coarse)')`, read once).
- **No new key**, no change to `strings.js`, the F1 help, the touch bar or the `keydown` listener.
- Pause (#83): the quad is redrawn from the last target, the target is **not** re-rendered.
- During the mirror pass `renderer.shadowMap.autoUpdate` is false; restore it afterwards. Restore the clear colour, the scissor test and the viewport too: the main render must be unaffected.
- The mirror camera far plane is 4200 (the sky dome has radius 3800 and sits at the main camera; do not shorten it).
- Camera position uses `vehEye('cockpit')` (already scaled by `VEH.scale`, `index.html:1083`) with the side offset forced to 0.
- When the mirror is not visible the frame must cost nothing extra (no render, no target work). Existing tests stay unchanged and green, in particular `test_rebuilds_free_gpu_memory` (`prototype/tests/test_vehicles.py:153`) and `test_look_back.py`.
- `prototype/index.html`: dense one-line style, short `//` comments, match the surrounding code, do not reformat neighbours. No framework, no bundler, no `package.json`.
- Do not touch `data/` or `pipeline/`.
- **Slow headless renderer:** it draws under 1 fps. Every browser check polls the end state with `page.wait_for_function` (frame counters, `__mm.mirror()`), never a fixed sleep. Use 320 × 180 viewports.
- Commands (repo root): node `node --test prototype/tests/*.test.mjs`. Playwright: `cd pipeline && systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 python -m pytest ../prototype/tests/test_mirror.py -x` (same invocation as the other browser tests; check `test_look_back.py`'s header if it differs). Run in the **foreground**, never in the background.
- Commit after every task, Conventional Commits, `git add <paths>`, never `-A`. Push the branch **before** the Playwright runs.

## Review Focus

- **Render state leaks:** `setRenderTarget(null)`, `setScissorTest(false)`, the viewport, `autoClear` and the clear colour must all be restored, or the main picture breaks in some views only.
- **Shadow map:** `autoUpdate` back to its previous value even if the render throws (`try/finally`).
- **Tone mapping:** the quad uses `toneMapped: false`, so in the smooth style (ACES) the mirror looks a little different from the main picture. Judge it in the test-todo screenshot; do not tune it blindly.
- **GPU leak test:** one render target and one texture exist from start and never grow.

## File Structure

- Create `prototype/mirror.js` — pure logic.
- Create `prototype/tests/mirror.test.mjs` — node unit tests.
- Create `prototype/tests/test_mirror.py` — Playwright checks.
- Modify `prototype/index.html` — import, camera/target/quad, `drawMirror`, two call sites in `loop`, `__mm.mirror` hook.
- Modify `CHANGELOG.md` — one `[Unreleased]` / `Added` sentence.
- Modify `test-todo.md` — a playtest entry (direct to main per the repo's convention).

---

### Task 1: Pure logic `mirror.js` (test first)

**Files:** Create `prototype/mirror.js`, `prototype/tests/mirror.test.mjs`.

**Interfaces:**

```js
export const MIRROR = { w: 256, h: 80, fov: 36, near: 0.5, far: 4200, every: 2, widthFrac: 0.22, minW: 220, maxW: 420, top: 12, border: 4, drop: 0.1 };
export function mirrorVisible(s)             // s: { view, back, flying, overlay, fullMap, touch } -> boolean
export function mirrorRect(w)                // screen width in CSS px -> { x, y, w, h } (y measured from the top edge)
export function mirrorDue(frame, wasVisible) // true when the target must be re-rendered this frame
```

- [ ] **Step 1: Write the failing test**

```js
// prototype/tests/mirror.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIRROR, mirrorVisible, mirrorRect, mirrorDue } from '../mirror.js';

const COCKPIT = { view: 'cockpit', back: false, flying: false, overlay: false, fullMap: false, touch: false };

test('mirrorVisible: shows in the cockpit view only', () => {
  assert.equal(mirrorVisible(COCKPIT), true);
  for (const view of ['chase', 'near', 'bumper']) assert.equal(mirrorVisible({ ...COCKPIT, view }), false, view);
});

test('mirrorVisible: hidden while looking back, flying, in the overlay, with the full map or on touch', () => {
  for (const key of ['back', 'flying', 'overlay', 'fullMap', 'touch']) assert.equal(mirrorVisible({ ...COCKPIT, [key]: true }), false, key);
});

test('mirrorRect: 22 % of the width clamped to 220-420 px, 3.2:1, centred, 12 px from the top', () => {
  const r = mirrorRect(1000);
  assert.equal(r.w, 220); assert.equal(r.h, 220 * MIRROR.h / MIRROR.w); assert.equal(r.x, (1000 - 220) / 2); assert.equal(r.y, 12);
  assert.equal(mirrorRect(320).w, 220);
  assert.equal(mirrorRect(3000).w, 420);
  assert.equal(mirrorRect(1600).w, 352);
});

test('mirrorDue: every second frame, and at once when it has just become visible', () => {
  assert.equal(mirrorDue(0, true), true);
  assert.equal(mirrorDue(1, true), false);
  assert.equal(mirrorDue(2, true), true);
  assert.equal(mirrorDue(1, false), true);
});
```

- [ ] **Step 2: Run it, expect failure** — `node --test prototype/tests/mirror.test.mjs` fails with `Cannot find module '../mirror.js'`.

- [ ] **Step 3: Implement**

```js
// #92: rear-view mirror -- pure decisions, no three.js, no DOM. Unit-tested with `node --test prototype/tests/*.test.mjs`.
export const MIRROR = { w: 256, h: 80, fov: 36, near: 0.5, far: 4200, every: 2, widthFrac: 0.22, minW: 220, maxW: 420, top: 12, border: 4, drop: 0.1 };

// s: { view: CAM_VIEWS[..].k, back: B held, flying: FLY.on, overlay: start/result screen open, fullMap: Tab held, touch: pointer:coarse }
export function mirrorVisible(s) {
  if (s.view !== 'cockpit') return false;
  return !(s.back || s.flying || s.overlay || s.fullMap || s.touch);
}

export function mirrorRect(screenW) {
  const w = Math.min(MIRROR.maxW, Math.max(MIRROR.minW, Math.round(screenW * MIRROR.widthFrac)));
  return { x: (screenW - w) / 2, y: MIRROR.top, w, h: w * MIRROR.h / MIRROR.w };
}

export function mirrorDue(frame, wasVisible) {
  return !wasVisible || frame % MIRROR.every === 0;
}
```

- [ ] **Step 4: Run it, expect pass** — 4 tests green; then the full node suite `node --test prototype/tests/*.test.mjs`.
- [ ] **Step 5: Commit** — `git add prototype/mirror.js prototype/tests/mirror.test.mjs`; `feat(mirror): pure visibility, rect and timing rules (#92)`.

---

### Task 2: Failing browser tests

**Files:** Create `prototype/tests/test_mirror.py`.

Open the hand layout exactly like `test_look_back.py` (copy its imports, `MMH_ROUTE`, `ARGS`, `WAIT`, `open_hand` and `wait_frames` unchanged). The tests rely on the hook `__mm.mirror()` → `{ visible, renders, frame, rect: {x,y,w,h}, pos: [x,y,z], look: [x,y,z] }` (Task 3).

- [ ] **Step 1: Write the tests**

```python
"""#92: rear-view mirror. Hand-traced layout. Poll the end state; the headless renderer draws under 1 fps."""
from playwright.sync_api import sync_playwright
# + the imports, MMH_ROUTE, ARGS, WAIT, open_hand and wait_frames copied from test_look_back.py

MIRROR = "() => window.__mm.mirror()"
FWD = "(m => { const th = window.__mm.heading(); return m.look[0] * Math.cos(th) + m.look[2] * Math.sin(th); })(window.__mm.mirror())"


def start_in_view(page, presses):
    page.click("#startbtn", timeout=180000)
    for _ in range(presses):
        page.keyboard.press("KeyC")
    page.wait_for_function(f"() => window.__mm.camView === {presses}", timeout=WAIT)


def test_mirror_shows_only_in_the_cockpit_view(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        page.click("#startbtn", timeout=180000)
        wait_frames(page)
        chase = page.evaluate(MIRROR)
        page.keyboard.press("KeyC"); page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 2 && window.__mm.mirror().visible", timeout=WAIT)
        cockpit = page.evaluate(MIRROR)
        page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 3 && !window.__mm.mirror().visible", timeout=WAIT)
        b.close()
    assert chase["visible"] is False, chase
    assert cockpit["rect"]["w"] == 220 and cockpit["rect"]["y"] == 12, cockpit


def test_mirror_camera_looks_back_from_the_cockpit_eye(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function(f"() => window.__mm.mirror().visible && {FWD} < -0.9", timeout=WAIT)
        b.close()


def test_mirror_renders_every_second_frame_and_stops_when_hidden(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible && window.__mm.mirror().renders > 2", timeout=WAIT)
        r0, f0 = page.evaluate("() => [window.__mm.mirror().renders, window.__mm.mirror().frame]")
        page.wait_for_function(f"() => window.__mm.mirror().frame >= {f0 + 6}", timeout=WAIT)
        r1, f1 = page.evaluate("() => [window.__mm.mirror().renders, window.__mm.mirror().frame]")
        page.keyboard.press("KeyC")
        page.wait_for_function("() => !window.__mm.mirror().visible", timeout=WAIT)
        r2 = page.evaluate("() => window.__mm.mirror().renders")
        wait_frames(page, 4)
        r3 = page.evaluate("() => window.__mm.mirror().renders")
        b.close()
    assert (f1 - f0) // 2 - 1 <= r1 - r0 <= (f1 - f0) // 2 + 1, (r0, r1, f0, f1)   # half the frames
    assert r3 == r2, (r2, r3)                                                       # nothing rendered while hidden


def test_mirror_hides_while_b_or_tab_is_held_and_returns(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        for key in ("KeyB", "Tab"):
            page.keyboard.down(key)
            page.wait_for_function("() => !window.__mm.mirror().visible", timeout=WAIT)
            page.keyboard.up(key)
            page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        b.close()


def test_mirror_is_off_in_the_helicopter(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.wait_for_function("() => window.__mm.mirror().visible", timeout=WAIT)
        page.keyboard.press("KeyF")
        page.wait_for_function("() => window.__mm.fly().on && !window.__mm.mirror().visible", timeout=WAIT)
        b.close()


def test_mirror_freezes_in_pause(server):
    with sync_playwright() as p:
        b, page = open_hand(p, server)
        start_in_view(page, 2)
        page.keyboard.down("Space")
        page.wait_for_function("() => window.__mm.pause().state === 'racing' && window.__mm.pause().t > 0.3", timeout=WAIT)
        page.keyboard.press("Escape"); page.keyboard.up("Space")
        page.wait_for_function("() => window.__mm.pause().on", timeout=WAIT)
        r0 = page.evaluate("() => window.__mm.mirror().renders")
        f0 = page.evaluate("() => window.__mm.pause().frame")
        page.wait_for_function(f"() => window.__mm.pause().frame >= {f0 + 4}", timeout=WAIT)
        state = page.evaluate(MIRROR)
        b.close()
    assert state["renders"] == r0 and state["visible"] is True, state


def test_mirror_is_off_on_touch_devices(server):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        page = b.new_context(viewport={"width": 320, "height": 180}, has_touch=True, is_mobile=True).new_page()
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.route("**/data/world_hochrhein.json", lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.mirror && document.querySelector('#worldstatus')?.textContent", timeout=240000)
        page.click("#startbtn", timeout=180000)
        for _ in range(2):
            page.keyboard.press("KeyC")
        page.wait_for_function("() => window.__mm.camView === 2", timeout=WAIT)
        wait_frames(page, 3)
        state = page.evaluate(MIRROR)
        b.close()
    assert state["visible"] is False and state["renders"] == 0, state
```

- [ ] **Step 2: Run it, expect failure** — every test times out on `window.__mm.mirror` missing (expected before Task 3).
- [ ] **Step 3: Commit** — `git add prototype/tests/test_mirror.py`; `test(mirror): browser checks for the rear-view mirror (#92)`.

---

### Task 3: Wire it into `index.html`

**Files:** Modify `prototype/index.html`.

- [ ] **Step 1: Import** next to the heli import (`:243`):

```js
import { MIRROR, mirrorVisible, mirrorRect, mirrorDue } from './mirror.js';
```

- [ ] **Step 2: Objects**, after `const camera = ...` (`:874`; `scene` and `renderer` already exist above it):

```js
// ---------- rear-view mirror (#92) ----------
const MIR = { cam: new THREE.PerspectiveCamera(MIRROR.fov, MIRROR.w / MIRROR.h, MIRROR.near, MIRROR.far), rt: new THREE.WebGLRenderTarget(MIRROR.w, MIRROR.h), scene: new THREE.Scene(), ortho: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), frame: 0, renders: 0, visible: false, rect: { x: 0, y: 0, w: 0, h: 0 }, touch: matchMedia('(pointer:coarse)').matches };
{ const g = new THREE.PlaneGeometry(2, 2), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); MIR.scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: MIR.rt.texture, toneMapped: false }))); }   // a mirror image is reversed: flip the quad, not the projection
```

- [ ] **Step 3: `drawMirror(frozen)`** after `stepCamera` (`:1096`):

```js
function aimMirror() { const fx = Math.cos(P.th), fz = Math.sin(P.th), [ex, ey] = vehEye('cockpit'), y = P.y + ey + MIRROR.drop; MIR.cam.position.set(P.x + fx * ex, y, P.z + fz * ex); MIR.cam.lookAt(P.x - fx * 40, y - 0.3, P.z - fz * 40); }   // centre line, looking straight back
function renderMirrorTarget() { const sh = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false; try { aimMirror(); renderer.setRenderTarget(MIR.rt); renderer.render(scene, MIR.cam); } finally { renderer.setRenderTarget(null); renderer.shadowMap.autoUpdate = sh; } MIR.renders++; }
function drawMirrorQuad(r) { const b = MIRROR.border, y = innerHeight - r.y - r.h, c = new THREE.Color(), ca = renderer.getClearAlpha(); renderer.getClearColor(c); renderer.autoClear = false; renderer.setScissorTest(true);
  renderer.setViewport(r.x - b, y - b, r.w + 2 * b, r.h + 2 * b); renderer.setScissor(r.x - b, y - b, r.w + 2 * b, r.h + 2 * b); renderer.setClearColor(0x8a93a3, 1); renderer.clear(true, true, false);   // steel-light frame, as #br
  renderer.setViewport(r.x, y, r.w, r.h); renderer.setScissor(r.x, y, r.w, r.h); renderer.render(MIR.scene, MIR.ortho);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight); renderer.setClearColor(c, ca); renderer.autoClear = true; }
function drawMirror(frozen) { const was = MIR.visible; MIR.visible = mirrorVisible({ view: CAM_VIEWS[camView].k, back: CAM.back, flying: FLY.on, overlay: !$('overlay').hidden, fullMap: !!keys.Tab, touch: MIR.touch }); if (!MIR.visible) return;
  if (!frozen) { MIR.frame++; if (mirrorDue(MIR.frame, was)) renderMirrorTarget(); } MIR.rect = mirrorRect(innerWidth); drawMirrorQuad(MIR.rect); }
```

`setViewport`/`setScissor` take CSS pixels and apply the pixel ratio themselves, so the rect needs no scaling. `CAM.back` is updated in `stepCamera`, which runs before `drawMirror` in the same frame. In the pause branch `MIR.frame` does not advance, so `mirror().frame` is only a render-frame counter.

- [ ] **Step 4: Call sites in `loop`** (`:1223`): in the pause branch turn `renderer.render(scene, camera); requestAnimationFrame(loop); return;` into `renderer.render(scene, camera); drawMirror(true); requestAnimationFrame(loop); return;`, and at the end of the normal frame `renderer.render(scene, camera); requestAnimationFrame(loop);` into `renderer.render(scene, camera); drawMirror(false); requestAnimationFrame(loop);`. Edit only those two statements inside `loop`.

- [ ] **Step 5: Test hook** next to `__mm.cam` (`:1054`):

```js
window.__mm.mirror = () => { const l = MIR.cam.getWorldDirection(new THREE.Vector3()); return { visible: MIR.visible, renders: MIR.renders, frame: MIR.frame, rect: { ...MIR.rect }, pos: MIR.cam.position.toArray(), look: [l.x, l.y, l.z] }; };
```

`MIR.cam` is only aimed when the target renders; the look-direction test waits for `visible` first, and `mirrorDue` is true on the first visible frame, so one render has happened by then.

- [ ] **Step 6: Run** `node --test prototype/tests/*.test.mjs`, push the branch, then `test_mirror.py` in the foreground: all green.
- [ ] **Step 7: Commit** — `git add prototype/index.html`; `feat(mirror): rear-view mirror in the cockpit view (#92)`.

---

### Task 4: Regression run, changelog, playtest note

**Files:** Modify `CHANGELOG.md`, `test-todo.md`.

- [ ] **Step 1: Full regression** — the whole pytest suite (with the `systemd-run` cap) and `node --test prototype/tests/*.test.mjs`. Watch `test_rebuilds_free_gpu_memory` (the render target and its texture exist from start and must not grow the baseline), `test_look_back.py`, `test_pause.py`, `test_heli.py`, `test_smoke.py::test_hud_bundle` (holds Tab). If the GPU leak test fails, fix the cause (the target is created once, never in a rebuild path); do not change the test.
- [ ] **Step 2: Changelog** — under `## [Unreleased]` / `### Added`, in the player's voice:

```
- In the cockpit view a rear-view mirror at the top of the screen shows what is behind you, so you can see who is chasing you without holding **B**. It disappears while you look back, fly the helicopter or hold **Tab**, and it is switched off on phones and tablets.
```

- [ ] **Step 3: test-todo** — add a playtest entry to `test-todo.md` (committed straight to `main`, only that file): the mirror shows in the cockpit view; the picture is reversed like a real mirror (something on your left appears on the left of the mirror); original vs smooth style look; frame rate in the OSM world with the mirror on vs off (F3); frozen in pause; gone with B, Tab, F and the other views; absent on a phone.
- [ ] **Step 4: Commit** — `git add CHANGELOG.md`; `docs(changelog): rear-view mirror (#92)`. Commit `test-todo.md` separately on `main`.
