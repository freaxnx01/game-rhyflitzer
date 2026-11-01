# Debug jump to every hideout room — implementation plan (#591)

**Spec:** `docs/superpowers/specs/2026-10-31-debug-jump-hideout-rooms-design.md`.

**Layout:** the game lives in the repo root (since 2e8cb91). There is no `prototype/` directory any more.

**TDD:** each task starts with a red test.

**Commit and push** after every task.

**Tests:**
- Node: `node --test tests/*.test.mjs`
- Playwright, run only the touched files:
  `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 python3 -m pytest tests/test_testhub.py tests/test_debug.py -x -q`

## Task 1 — `roomTargets` (pure, `testhub-targets.js`)

**Failing tests** in `tests/testhub-targets.test.mjs`:

```js
import { roomTargets, buildTargets, TARGET_ID_RE } from '../testhub-targets.js';

const RINGS_CTX = [
  { n: 1, spawn: { x: 1, z: 2, th: 0.5 }, rooms: [
    { id: 'eiffel', name: 'La Tour Eiffel', view: { x: 10, z: 20, th: 1.5 }, spawn: { x: 3, z: 4, th: 0 } },
    { id: 'room3', name: null, view: null, spawn: { x: 5, z: 6, th: 2 } },
  ] },
  { n: 2, spawn: { x: 1, z: 2, th: 0.5 }, rooms: [
    { id: 'r2room0', name: 'Enterprise', view: { x: 7, z: 8, th: 1 }, spawn: { x: 0, z: 0, th: 0 } },
  ] },
];

test('roomTargets: a ring target at its lift exit, then its rooms, ring by ring', () => {
  const t = roomTargets(RINGS_CTX);
  assert.deepEqual(t.map(x => x.id), ['hideout.ring1', 'hideout.r1.eiffel', 'hideout.r1.room3', 'hideout.ring2', 'hideout.r2.r2room0']);
  assert.deepEqual(t[0], { id: 'hideout.ring1', label: 'Hideout: Ring 1', kind: 'spot', spot: { x: 1, z: 2, th: 0.5, room: 'ring' } });
  assert.equal(t[3].spot.room, 'ring2');
});
test('roomTargets: an object room uses its view and name, an empty room its spawn', () => {
  const t = roomTargets(RINGS_CTX);
  assert.deepEqual(t[1], { id: 'hideout.r1.eiffel', label: 'Hideout: Ring 1 · La Tour Eiffel', kind: 'spot', spot: { x: 10, z: 20, th: 1.5, room: 'eiffel' } });
  assert.deepEqual(t[2], { id: 'hideout.r1.room3', label: 'Hideout: Ring 1 · Room 3 (empty)', kind: 'spot', spot: { x: 5, z: 6, th: 2, room: 'room3' } });
  assert.equal(t[4].label, 'Hideout: Ring 2 · Enterprise');
});
test('roomTargets: every id is a valid target id; no rings -> no targets', () => {
  for (const x of roomTargets(RINGS_CTX)) assert.match(x.id, TARGET_ID_RE);
  assert.deepEqual(roomTargets(null), []);
});
test('buildTargets: adds the room targets and keeps hideout.tower as it was', () => {
  const t = buildTargets({ entries: [], underwater: null, hideout: { mouth: [0, 0], heading: 0, tower: { x: 10, z: 20, th: 1.5 } }, rings: RINGS_CTX });
  assert.ok(t.some(x => x.id === 'hideout.r2.r2room0'));
  assert.deepEqual(t.find(x => x.id === 'hideout.tower').spot, { x: 10, z: 20, th: 1.5, room: 'eiffel' });
});
```

**Implementation:**

- The room number in an empty label is its index in its ring: `Room ${k}`.
- The ring's level id is `'ring'` for n = 1 and `'ring2'` for n = 2. Derive it as `n === 1 ? 'ring' : 'ring' + n`,
  which matches `RINGS[].id` in `rooms.js`.

```js
// #591: every ring (at its lift exit) and every room of both rings, for the Testhub and the Ctrl+D panel
export function roomTargets(rings) {
  if (!rings) return [];
  return rings.flatMap(({ n, spawn, rooms }) => [
    spot(`hideout.ring${n}`, `Hideout: Ring ${n}`, spawn.x, spawn.z, spawn.th, { room: n === 1 ? 'ring' : `ring${n}` }),
    ...rooms.map((r, k) => {
      const p = r.view || r.spawn, label = r.name ? `Hideout: Ring ${n} · ${r.name}` : `Hideout: Ring ${n} · Room ${k} (empty)`;
      return spot(`hideout.r${n}.${r.id}`, label, p.x, p.z, p.th, { room: r.id });
    }),
  ]);
}
```

- `buildTargets({ entries, underwater, hideout, rings })` appends `...roomTargets(rings)` after the spot targets.
- Update the header comment: `room` is now any ring or room level id.

## Task 2 — Jump into any ring or room (`index.html`)

1. In `testhubContext()`, add `rings`. It is `null` without `HIDE`. Otherwise it is one entry per ring:
   ```js
   rings: HIDE ? RINGS.map((g, i) => ({ n: i + 1, spawn: ringSpawn(), rooms: ROOM.layouts.filter(L => L.ring === g.id).map(L => ({ id: L.id, name: g.rooms[L.k].name, view: L.towerView, spawn: L.spawn })) })) : null,
   ```
2. Replace the Eiffel-only branch in `testhubGo` with a call to a new `jumpBelow(s.room, s, target.label)`:
   ```js
   // #591: a debug jump to any ring or room below -- build it (rings never visited included), jump like any jump, then step down into it
   function jumpBelow(id, s, label) {
     const g = ringOf(id); if (!g) return;
     ringBuild(g);
     if (isRoomLevel(id)) { const k = roomIndex(id); ensureRoom(k); if (ROOM.layouts[k].object && !modelState(k).started) loadModel(k); }
     placeOnRoad(s.x, s.z, s.th, label); LIFT_RIDE.place(g.stop); LEVELS.set(id); P.y = g.y; P.safe = [s.x, s.z, s.th]; resetCar();
     camPos.set(s.x - Math.cos(s.th) * 12, P.y + 4, s.z - Math.sin(s.th) * 12); camera.position.copy(camPos); restShadow();
   }
   ```
   - `ringBuild(g)` registers the ring's room levels too, so `LEVELS.set(id)` finds them.
   - Keep the `ensureRoom(0)` / `loadEiffel` behaviour for `hideout.tower`: it now goes through `jumpBelow('eiffel', …)`.
     `loadModel(0)` is what `loadEiffel` calls.
   - `ringOf` is already imported from `rooms.js` (`index.html:608`). `isRoomLevel` is not: add it to that import.
     `roomIndex` and `modelState` are defined in `index.html` (around lines 2827 and 3125).
3. **Failing Playwright test** in `tests/test_testhub.py`, next to `test_hideout_targets_put_the_car_at_the_gate_and_in_the_eiffel_room`,
   with the same `@needs_world` and helpers:
   ```python
   @needs_world
   def test_ring_and_room_targets_reach_both_rings_unvisited(server):
       with sync_playwright() as p:
           b, page, errors, _ = new_page(p, server, "?dev=1", block_world=False)
           start(page)
           page.wait_for_function("() => window.ggTesthub && window.ggTesthub.regs['hideout.r2.r2room0']", timeout=30000)
           ids = reg_ids(page)
           go(page, "hideout.r2.r2room0"); ent = page.evaluate("() => window.__mm.level()")
           go(page, "hideout.r1.atomium"); ato = page.evaluate("() => window.__mm.level()")
           go(page, "hideout.ring2"); r2 = page.evaluate("() => window.__mm.level()")
           b.close()
       assert errors == []
       assert sum(1 for i in ids if i.startswith("hideout.r1.") or i.startswith("hideout.r2.")) == 16, ids
       assert {"hideout.ring1", "hideout.ring2", "hideout.tower", "hideout.gate"} <= set(ids), ids
       assert ent["id"] == "r2room0" and abs(ent["y"] + 1200) < 1, ent
       assert ato["id"] == "atomium" and abs(ato["y"] + 600) < 1, ato
       assert r2["id"] == "ring2" and abs(r2["y"] + 1200) < 1, r2
   ```
   - If `go()` returns before the level switch, poll `__mm.level().id` with `wait_for_function`. Do not sleep.
   - The existing hideout test must stay green.

## Task 3 — The Ctrl+D panel row (`index.html`, `strings.js`)

1. **Markup** inside `#debug`, before `#knockreset`:
   ```html
   <div id="debugjump" hidden><label for="debugjumpsel" data-i18n="dbgJumpLabel">Hideout</label> <select id="debugjumpsel"></select> <button id="debugjumpgo" type="button" data-i18n="dbgJumpGo">Go</button></div>
   ```
2. **CSS:** `#debugjump` in the style of `#debuglinks`: flex with a gap of 6 px, `white-space: normal`, `[hidden]{display:none}`.
   The select and the button inherit the font, with `#8fd8e8` text on `#14171d` and a 1 px `#3a404b` border. Add it to
   the `flex:none` list on line 60.
3. **Strings:** `strings.js` gets `dbgJumpLabel` ('Hideout' / 'Höhle') and `dbgJumpGo` ('Go' / 'Hin') in `en` and `de`.
4. **Script,** next to the `#knockreset` listener (around `index.html:4627`):
   ```js
   // #591: jump to any ring or room below from the debug panel -- the same targets as the Testhub
   const DEBUG_JUMPS = HIDE ? buildTargets(testhubContext()).filter(t => t.kind === 'spot' && t.spot.room && t.id !== 'hideout.tower') : [];
   $('debugjump').hidden = !DEBUG_JUMPS.length;
   $('debugjumpsel').replaceChildren(...DEBUG_JUMPS.map((t, i) => Object.assign(document.createElement('option'), { value: String(i), textContent: t.label.replace(/^Hideout: /, '') })));
   $('debugjump').addEventListener('click', e => e.stopPropagation());
   $('debugjumpgo').addEventListener('click', e => { const t = DEBUG_JUMPS[+$('debugjumpsel').value]; if (t) testhubGo(t); $('debugjumpsel').blur(); e.currentTarget.blur(); });
   ```
   - `testhubContext` and `testhubGo` are function declarations, so they are hoisted. `ROOM.layouts` must be ready
     here. Place the block after `ROOM` is defined; line 4627 is after it.
   - If `testhubContext()` reads `UWS.counts` before it exists, that does not matter: only `.spot.room` targets are kept.
   - Also stop `keydown` on the select from reaching the game's key handler, if arrow keys in the open select steer
     the car. Check this in the test. If the game reads keys from `window`, add
     `$('debugjumpsel').addEventListener('keydown', e => e.stopPropagation())`.
5. **Failing Playwright test** in `tests/test_debug.py`, using that file's helpers to open the panel:
   ```python
   def test_debug_panel_jumps_to_any_hideout_room(server):
       # real world (the hideout exists only there): Ctrl+D, 18 options, pick the Ferris wheel, Go -> room6 at y -600
       ...
       opts = page.eval_on_selector_all("#debugjumpsel option", "os => os.map(o => o.textContent)")
       assert len(opts) == 18 and "Ring 1 · Ferris wheel" in opts and "Ring 2 · Enterprise" in opts, opts
       page.select_option("#debugjumpsel", label="Ring 1 · Ferris wheel"); page.click("#debugjumpgo")
       page.wait_for_function("() => window.__mm.level().id === 'room6'", timeout=60000)
       assert abs(page.evaluate("() => window.__mm.level().y") + 600) < 1
       assert "copied" not in page.inner_text("#toast").lower() and "kopiert" not in page.inner_text("#toast").lower()   # Go did not copy the panel
   ```
   - Mark the test `@needs_world` the way `test_testhub.py` does. Copy the decorator and the world loading from there
     if `test_debug.py` has none.
   - Check the real text of the `copied` string in `strings.js` and assert on it.

## Task 4 — Changelog and the full run

- **`CHANGELOG.md`** under `[Unreleased]`, newest first, timestamp from `TZ=Europe/Zurich date '+%F %H:%M'`:
  > `<ts>` **For testers:** the debug panel (<kbd>Ctrl</kbd> <kbd>D</kbd>) has a **Hideout** list with every room in **ring 1** and **ring 2**, by name, and both rings themselves. Pick one and press **Go** to be there at once, even in a ring you have never driven to. The Testhub (`?dev=1`) has the same jumps.
- **Run:**
  - `node --test tests/*.test.mjs`;
  - the two Playwright files above;
  - `tests/test_hideout.py -k "eiffel or tower"`, to be sure the Eiffel room path still works.
