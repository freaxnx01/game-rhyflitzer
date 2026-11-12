# Multiplayer remote car polish Plan (#835 part c)

> Spec: `docs/superpowers/specs/2026-11-12-multiplayer-see-each-other-design.md` (section *Part c polish*). **Needs part b merged** (`NETCARS`, `syncNetCars`, `stepNetCars`, the shared `cloneStageVehicle`, the pose `flags`). No collisions (#836), no race rules (#837).

**Goal:** you can tell who is who, and a leaving player does not just blink out:
- a name tag over each remote car;
- remote head, brake and blinker lamps follow the pose flags;
- a car fades out over 1 s when its player leaves, with a toast on every device;
- F3 shows the net counters.

**Constraints:**
- Buildless and no packages.
- Pure helpers go in `netsync.js` (no DOM, no three.js).
- The name is data: draw it on a canvas, never with `innerHTML`.
- The toast follows the repo rule: `toast(tr('literalKey', …))`.
- DE + EN.
- No key binding.
- **Run only:**
  - `node --test tests/net*.test.mjs tests/strings.test.mjs tests/toast.test.mjs`
  - `pytest tests/test_multiplayer_cruise.py` (foreground)

## Task 1: pure helpers (`netsync.js`)
Files: `netsync.js`, `tests/netsync.test.mjs`.
- [ ] Append the failing tests, run them, expect FAIL:
```js
import { fadeAlpha, FADE, tagScale, remoteLamps, FLAG } from '../netsync.js';
test('fadeAlpha_overOneSecond_linearThenZero', () => {
  assert.equal(FADE, 1000);
  assert.equal(fadeAlpha(0), 1); assert.equal(fadeAlpha(500), 0.5); assert.equal(fadeAlpha(1000), 0); assert.equal(fadeAlpha(5000), 0);
  assert.equal(fadeAlpha(-10), 1);
});
test('tagScale_distance_clampedSoTagStaysReadable', () => {
  assert.equal(tagScale(5), tagScale(0));          // never larger than at 10 m
  assert.ok(tagScale(100) > tagScale(10));          // world size grows with distance (screen size ~constant)
  assert.equal(tagScale(1000), tagScale(400));      // capped far away
});
test('remoteLamps_flags_headBrakeBlinkPhase', () => {
  const f = FLAG.visible | FLAG.head | FLAG.brake | FLAG.left;
  assert.deepEqual(remoteLamps(f, true), { head: true, brake: true, left: true, right: false });
  assert.deepEqual(remoteLamps(f, false), { head: true, brake: true, left: false, right: false });   // blink off-phase
  assert.deepEqual(remoteLamps(FLAG.visible, true), { head: false, brake: false, left: false, right: false });
});
```
- [ ] Implement:
  - `FADE = 1000`.
  - `fadeAlpha(ms)`: `clamp(1 − ms / FADE, 0, 1)`.
  - `tagScale(d)`: `clamp(d, 10, 400) × 0.06`.
  - `FLAG` already exists (part a); import it, do not redefine it.
  - `remoteLamps(flags, flashOn)`: `{ head, brake, left: left && flashOn, right: right && flashOn }`.
- [ ] PASS, commit `feat(multiplayer): fade, tag scale and lamp helpers (#835)`.

## Task 2: name tags
Files: `index.html`.
- **`netTag(name)`:**
  - a 256×64 canvas via the existing `makeTex(w, h, draw)` (`index.html:1103`): dark rounded plate, cream text, `font: bold 34px sans-serif`, `fillText(name)`. The name comes from the lobby and was already cleaned by `cleanName`.
  - It returns a `THREE.Sprite` with `SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false })` and `renderOrder = 10`.
- **In `buildNetCar`:**
  - `e.tag = netTag(name)`, added to the scene (not to the mesh, so it does not inherit the roll);
  - rebuild the tag when the lobby name changes (it does not in v1, but `syncNetCars` compares).
- **In `stepNetCars`:**
  - `e.tag.visible = e.mesh.visible`;
  - position = car position + `(0, roofHeight + 1.2, 0)`, where `roofHeight` is the clone's `Box3` height measured once at build;
  - `s = tagScale(camera.position.distanceTo(tagPos))`, `e.tag.scale.set(s * 4, s, 1)`.
- **Disposal:** with the car (`map.dispose()`, `material.dispose()`).
- **`__mm.netCars()`:** each entry gains `tag: { visible, name }`.
- [ ] Commit `feat(multiplayer): name tags over remote cars (#835)`.

## Task 3: remote lamps
Files: `index.html`.
- **In `cloneStageVehicle`**, while cloning the materials, record per clone `e.lamps = { head: [], tail: [] }`:
  - a cloned material whose original was `carMats.lampHead`, or is in `GLTF_LAMPS.head`, goes to `head`;
  - `carMats.lampTail` / `GLTF_LAMPS.tail` goes to `tail`.
- **Keep the `BLINK.left`/`BLINK.right` children** in the remote clone (part b dropped them). Remember their clone indices as `e.blink = { left, right }`, hidden by default. Still drop `flames`.
- **In `stepNetCars`**, when shown:
  - `l = remoteLamps(s.flags, Math.floor(performance.now() / 350) % 2 === 0)`;
  - levels from the driven car's own rule, no new numbers: `const lv = lampState({ head: l.head, hazard: false, blinker: null, braking: l.brake, flashOn: false })`; head materials `emissiveIntensity = lv.headLevel`, tail materials `= lv.tailLevel` (`lights.js` `LAMP`: tail off 0.45 / rear 1.0 / brake 2.4).
  - `e.blink.left.visible = l.left`, `e.blink.right.visible = l.right`.
- **`__mm.netCars()`:** each entry gains `lamps: l`.
- [ ] Commit `feat(multiplayer): remote car lamps follow the pose flags (#835)`.

## Task 4: fade-out, toast, F3
Files: `index.html`.
- **`syncNetCars()`:** a player no longer in the lobby is not deleted at once.
  - Set `e.leaving = performance.now()` (once).
  - Make its materials transparent: they are clones, so `m.transparent = true; m.needsUpdate = true` touches nobody else.
  - **Guest only:** `toast(tr('mpGuestLeft', name), TOAST_S.event)` for a player who left. The host already toasts in `netHostDrop`, and a guest's own leaving needs no toast.
- **`stepNetCars()`:** for a leaving entry:
  - `a = fadeAlpha(now − e.leaving)`;
  - set `m.opacity = a` on all its materials and `tag.material.opacity = a`;
  - hold the last sampled pose (no track updates);
  - at `a === 0`, remove and dispose, and delete the entry.
- **Return:** a player who comes back in the lobby before the fade ends gets a fresh entry (delete the leaving one first).
- **`netLeave()`:** still removes everything at once (no fade on your own exit).
- **F3:**
  - `debugSection(() => NET.role ? [`net: ${NET.role} · peers ${NET.link ? NET.link.peerIds().length : 0} · bad ${NET.bad} · offset ${Math.round(NET.offset ?? 0)} ms`] : [])`;
  - section lines are plain strings, like `positionLines` in `debug.js`.
- [ ] Commit and push `feat(multiplayer): remote car fades out when its player leaves (#835)` **before** Task 5.

## Task 5: browser test
Files: `tests/test_multiplayer_cruise.py` (append, reuse its helpers and `pair` fixture).
```python
def test_remote_car_has_tag_and_fades_when_guest_leaves(pair):
    host, guest, errors = pair
    connect(host, guest); ready_both(host, guest); host.click("#mpgo")
    host.wait_for_function("() => window.__mm.netCars().some(c => c.id === 1 && c.visible)", timeout=T)
    car = host.evaluate("() => window.__mm.netCars().find(c => c.id === 1)")
    assert car["tag"] == {"visible": True, "name": "Ben"}
    guest.keyboard.press("Escape")                     # pause
    guest.click("#pausemenu")
    if guest.is_visible("#abandonok"): guest.click("#abandonok")
    host.wait_for_function("() => document.querySelector('#toast').textContent === 'Ben has left.'", timeout=T)
    host.wait_for_function("() => !window.__mm.netCars().some(c => c.id === 1)", timeout=T)
    assert net(guest)["role"] is None
    assert errors == []
```
- [ ] Run it in the foreground, plus the part b test in the same file. Commit `test(multiplayer): remote tag and leave fade (#835)`.
