# Holzbrücke Deck Reaches Its Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everywhere between the Holzbrücke's drawn rails is deck, so the true-to-size car (#122) scrapes along a rail and stays on the bridge.

**Architecture:** The wooden hero span is drawn (deck strip and rail OBBs) on one straight chord. The physical deck (`onBridge`) follows the OSM polyline, which bends up to 1.55 m off that chord. A rail-limited car at `r = 1.3 m` can reach the gap (it could not at `r = 1.69 m`). Fix: hero pieces carry their span (`p.hero = hb`), and `onBridge` also accepts points inside the chord corridor for the nearest hero piece. Car size and collider stay as they are.

**Tech Stack:** Vanilla JS (`prototype/index.html`), pytest + Playwright (Chromium, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-08-holzbruecke-deck-reaches-rails-design.md` (issue #137).

## Global Constraints

- Buildless static game: no new packages (CLAUDE.md).
- Do **not** change `VEHICLES.compact.scale` (1.0) or `collision.r` (1.3). `test_vehicles.py::test_compact_car_is_true_to_size` must stay green.
- Do not touch `collide()`, the rail OBBs, or the hero/stone meshes. The fix lives only in `onBridge` and in the heroes loop wiring.
- CHANGELOG entries are hand-written, player-facing, English. Never `git cliff -o CHANGELOG.md`.
- Browser tests run in the foreground, capped: `systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 <python> -m pytest … </dev/null`. Run only the affected test files, not the full suite. Commit and push before long verification.

## Review Focus

1. **The deck is not just wider.** Expected: points 4.5 m off the chord over the river stay the river bed (`ground < −1`). Pinned by the outside half of the new test.
2. **Height comes from the nearest piece.** Expected: a chord-corridor point uses `bridgeSurfaceAt(nearest hero piece, n.t)`, the same as `hAt` draws. No step where the corridor rule takes over from `n.d <= hw`. The `h0`/`h1` of the current wood piece are 0, so watch this on a world rebuild with measured terrain.
3. **Car size untouched.** `scale` 1.0, `collision.r` 1.3. Diff must not touch `VEHICLES`.

---

### Task 1: Pin the deck hole (RED)

**Files:**
- Test: `prototype/tests/test_smoke.py` (append after `test_car_slides_along_holzbruecke_rails`)

**Interfaces:**
- Consumes: `WORLD`, `MMH_ROUTE`, `ARGS`, `server` fixture; `window.__mm.ground(x, z, y)`.

- [ ] **Step 1: Write the failing test.** Append to `prototype/tests/test_smoke.py`:

```python
@pytest.mark.skipif(not WORLD.exists(), reason="run pipeline/osm.py build first")
def test_holzbruecke_deck_reaches_its_rails(server):
    """#137: the Holzbrücke is drawn as one straight span between its rails, but its OSM line bends up to 1.5 m off
    that span. Everywhere between the drawn rails must be deck, not the Rhine 3 m below, whatever the car's collider.
    Well outside the rails over the river stays water, so the deck is not just made wider."""
    import json, math
    w = json.loads(WORLD.read_text(encoding="utf-8")); hb = w["anchors"]["landmarks"]["holzbruecke"]
    def near(r):
        return min(math.dist((hb["x"], hb["z"]), p) for p in r["pts"]) < 120
    pts = [p for r in w["roads"] if r.get("bridge") and near(r) for p in r["pts"]]
    a, b = max(((p, q) for p in pts for q in pts), key=lambda pq: math.dist(*pq))
    length = math.dist(a, b); ux, uz = (b[0] - a[0]) / length, (b[1] - a[1]) / length
    at = lambda t, s: [a[0] + ux * t - uz * s, a[1] + uz * t + ux * s]
    inside = [(t, s) for t in range(10, int(length) - 9, 5) for s in (-2.2, 2.2)]
    outside = [(t, s) for t in range(60, 141, 10) for s in (-4.5, 4.5)]
    with sync_playwright() as p:
        br = p.chromium.launch(args=ARGS); page = br.new_page(viewport={"width": 480, "height": 270})
        page.route(MMH_ROUTE, lambda r: r.fulfill(status=404, body=""))
        page.goto(f"{server}/prototype/index.html")
        page.wait_for_function("() => window.__mm && window.__mm.sim && document.querySelector('#worldstatus')?.textContent", timeout=180000)
        ground = lambda ps: page.evaluate(f"() => {json.dumps([at(t, s) for t, s in ps])}.map(([x, z]) => window.__mm.ground(x, z, 1e4))")
        g_in, g_out = ground(inside), ground(outside)
        br.close()
    holes = [(t, s, g) for (t, s), g in zip(inside, g_in) if g <= -1]
    widened = [(t, s, g) for (t, s), g in zip(outside, g_out) if g >= -1]
    assert holes == [], holes       # between the rails: deck
    assert widened == [], widened   # outside the rails over the Rhine: still water
```

- [ ] **Step 2: Run, expect FAIL.** `cd <worktree> && systemd-run --user --scope -q -p MemoryMax=3G -p MemorySwapMax=0 <python> -m pytest -q prototype/tests/test_smoke.py -k holzbruecke </dev/null`.
  Expected: both Holzbrücke tests fail. The new one lists about 34 holes (e.g. `(15, -2.2, -3)` … `(65, -2.2, -3)`, `(75, 2.2, -3)` … `(185, 2.2, -3)`), and `widened` is empty. The slide test fails with the car at about `y = −1.2`, `bridge` false.

- [ ] **Step 3: Commit** `test(world): pin the Holzbrücke deck between its rails (#137)`.

### Task 2: Make the physical deck match the drawn span (GREEN)

**Files:**
- Modify: `prototype/index.html`: `onBridge` (`:383-386`), heroes loop (`:933`, right after `hb.rot = Math.atan2(hb.uz, hb.ux);`)

**Interfaces:**
- Produces: `piece.hero = { a, b, len, ux, uz, hw, rot, kind, y0, pcs }` on every OSM bridge piece drawn through `heroBridge`'s straight-chord path (wood; stone only without `STONE_AXIS`).
- Consumes: `bridgeLocal(b, x, z)` (`:376`) returns `[t along, s lateral]`; `nearestOnPolyline` from `world.js`.

- [ ] **Step 1: Wire the hero span to its pieces.** In the heroes loop, directly after `hb.rot = Math.atan2(hb.uz, hb.ux);` (line ~933), add:

```js
      hb.pcs = pcs; for (const p of pcs) p.hero = hb;   // #137: onBridge measures the drawn straight span too, so deck and rails agree
```

- [ ] **Step 2: Accept the chord corridor in `onBridge`.** Above `function onBridge` add:

```js
// #137: a hero span is drawn (deck, rails) on one straight chord, but its OSM pieces bend up to 1.55 m off it. A point between the
// drawn rails is deck, measured against the chord, for the hero piece nearest to it (whose surface hAt draws there)
function inHeroDeck(b, x, z, d) { const h = b.hero; if (!h) return false; const [t, s] = bridgeLocal(h, x, z); if (t < 0 || t > h.len || Math.abs(s) > h.hw) return false; return h.pcs.every(o => o === b || nearestOnPolyline(o.r.pts, x, z).d >= d); }
```

and in the OSM branch of `onBridge` change the condition `n.d <= b.hw &&` to `(n.d <= b.hw || inHeroDeck(b, x, z, n.d)) &&`. Leave everything else in that line as it is (`ownsEnd`, `b.approach || bridgeAccepts(...)`, return value).

The broad phase needs no change: `BRIDGE_GRID` registers each piece with a `b.hw * 2 = 5.2 m` pad. That covers the farthest corridor point (1.55 + 2.6 = 4.15 m off the polyline).

- [ ] **Step 3: Run, expect PASS.** `… -m pytest -q prototype/tests/test_smoke.py -k holzbruecke </dev/null`. Both Holzbrücke tests pass: both ±8° runs stay on the deck, travel > 35 m and keep > 10 m/s; no holes; nothing widened.

- [ ] **Step 4: Regression guards (targeted).** `… -m pytest -q prototype/tests/test_smoke.py prototype/tests/test_vehicles.py prototype/tests/test_fridolinsbruecke.py prototype/tests/test_jump.py prototype/tests/test_underpass.py </dev/null`. All green. `test_compact_car_is_true_to_size` must pass unchanged. If one fails, re-run it on `main` first: identical numbers mean it was already red.

- [ ] **Step 5: Commit** `fix(world): the Holzbrücke deck reaches its rails (#137)`, push.

### Task 3: Docs

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Fixed`, create the subsection if missing), `test-todo.md` (append a section)

- [ ] **Step 1: CHANGELOG.** Under `## [Unreleased]` → `### Fixed`: „Scraping the side of the Holzbrücke no longer drops you into the Rhine. Since the car is back to its real size, it could slip off the deck between the rails where the old bridge bends. Now everything between the railings is solid planks."

- [ ] **Step 2: test-todo.md.** Append:

```markdown
## Holzbrücke deck reaches the rails (#137)

- [ ] Drive over the Holzbrücke hugging the left rail, then the right rail, the whole length in both directions: the car stays on the planks, never sinks into the Rhine.
- [ ] Steer into a rail at speed: the car scrapes along and keeps going.
- [ ] Fridolinsbrücke: hugging either parapet still keeps the car on the deck.
```

- [ ] **Step 3: Commit** `docs(changelog): the Holzbrücke holds the true-size car (#137)`, push.
