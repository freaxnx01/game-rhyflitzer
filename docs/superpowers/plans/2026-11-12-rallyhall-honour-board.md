# Rally hall honour board (#907) Implementation Plan

**Goal:** A gold-on-dark honour board "Elfyn Evans / WRC World Champion 2026 / & Scott Martin" on the back wall of the
rally hall.

**Architecture:** `RALLYHALL.board` + pure `boardLayout()` in `rallyhall.js`; `buildBoard()` (canvas texture) in
`rallyhallmesh.js`, added by `buildHall`; the debug hook reports it.

**Tech Stack:** vanilla JS ES modules, node:test, Playwright (Python).

**Spec:** `docs/superpowers/specs/2026-11-12-rallyhall-honour-board-design.md`

## Global Constraints

- Canvas texture only; no external asset, no logo, no brand or team mark, no `strings.js` keys.
- No new collider: `rallyhallPlacement` keeps its 9 colliders.
- Run `node --test tests/rallyhall.test.mjs tests/rooms.test.mjs` and then only the rally hall Playwright test
  (`-k rallyhall`, foreground) under `systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`.
- Small change: do not run the full Playwright suite.

## Review Focus

- The board's plane must not overlap the dark glass band (`rallyhallmesh.js:55`): y1 = y0 + h <= 3.0.
- `counts.rallyhall == 1` and `tris` in 500 - 30000 in the existing Playwright test must still hold (the board's role
  is `rallyhallboard`).

---

### Task 1: layout numbers (rallyhall.js) with node tests

**Files:** Modify `rallyhall.js`, `tests/rallyhall.test.mjs`.

- [ ] **Step 1: failing tests** appended to `tests/rallyhall.test.mjs`:

```js
import { boardLayout } from '../rallyhall.js';

test('boardLayout_TextIsTheHonour_MainLineReadableAt3m_ThirdLineSmaller', () => {
  const B = boardLayout(RALLYHALL);
  assert.deepEqual(B.lines.map(l => l.text), ['Elfyn Evans', 'WRC World Champion 2026', '& Scott Martin']);
  assert.ok(B.lines[0].size * B.h >= 0.4, 'main line letters are at least 0.4 m');
  assert.ok(B.lines[2].size < B.lines[0].size && B.lines[1].size < B.lines[0].size);
});

test('boardLayout_OnTheBackWallBehindEvans_BelowTheGlassBand_NoCollider_FreeFloorAt3m', () => {
  const B = boardLayout(RALLYHALL), H = RALLYHALL.hall, wallFace = H.d / 2 - H.wall;
  assert.ok(B.a <= wallFace && wallFace - B.a <= 0.1, 'hangs within 10 cm of the wall face');
  assert.ok(B.b - B.w / 2 >= -(H.w / 2 - H.wall) && B.b + B.w / 2 <= H.w / 2 - H.wall, 'inside the wall width');
  assert.ok(B.y0 >= H.floor && B.y0 + B.h <= H.glass.y0, 'between floor and the glass band');
  const evans = RALLYHALL.cars.find(c => c.id === 'evans'); near(B.b, evans.at[1], 1e-9, 'behind the Evans car');
  assert.ok(evans.at[0] + RALLYHALL.podium.hw < B.a - 3, 'a 3 m viewing spot lies beyond the podium collider');
  assert.equal(rallyhallPlacement(room, RALLYHALL).colliders.length, 9);
});
```

verify: `node --test tests/rallyhall.test.mjs` fails (no `boardLayout`).

- [ ] **Step 2: implement.** In `rallyhall.js` add to `RALLYHALL`
  `board: { a: 19.34, b: 0, y0: 0.8, w: 6.0, h: 2.2, panel: 0x14171c, gold: 0xd4a83a, lines: [{ text: 'Elfyn Evans', size: 0.22, y: 0.30, weight: 800 }, { text: 'WRC World Champion 2026', size: 0.14, y: 0.58, weight: 700 }, { text: '& Scott Martin', size: 0.09, y: 0.80, weight: 600 }] }`
  (`size` = letter height as a share of `h`: 0.22 x 2.2 = 0.48 m; `y` = baseline-centre as a share of `h` from the
  top) and, below `carExtent`:

```js
// #907: the honour board on the back wall behind the Evans car -- plain numbers in the hall frame (a into the room,
// b across, y up from the floor); rallyhallmesh.js draws it. Hangs on the wall, so it adds no collider.
export function boardLayout(cfg = RALLYHALL) { const { a, b, y0, w, h, lines } = cfg.board; return { a, b, y0, w, h, lines }; }
```

Run `node --test tests/rallyhall.test.mjs` -> green. Commit `feat(hideout): honour board layout for the rally hall`.

### Task 2: mesh (rallyhallmesh.js)

**Files:** Modify `rallyhallmesh.js`. Verified by Task 3's browser test (this file is not unit-tested, see its header).

- [ ] **Step 1:** import `boardLayout`. Add `buildBoard(cfg = RALLYHALL)` returning a `THREE.Group` with
  `userData.role = 'rallyhallboard'`, in the hall frame: group position `(B.a, B.y0 + B.h / 2, B.b)`, rotation.y so the
  plane's normal faces -a (`-Math.PI / 2`: a plane's normal is +z; in the hall frame +x is a, +z is b, so rotate
  `-PI/2` turns +z to -x... confirm in the browser screenshot that the lettering reads correctly, not mirrored; flip by
  `Math.PI` if it is). Children: panel `BoxGeometry(0.06, h, w)` in `board.panel` (`MeshLambertMaterial`), four frame
  strips 0.08 wide in `board.gold`, the lettering plane `PlaneGeometry(w - 0.3, h - 0.3)` with
  `MeshBasicMaterial({ map })`, set 0.04 in front of the panel (towards -a).
- [ ] **Step 2:** `drawBoard(g, w, h, B)`: fill panel colour, stroke a gold inner rule; for each line
  `g.font = \`${line.weight} ${Math.round(line.size * 1.4 * H)}px "Barlow Condensed", "Arial Narrow", sans-serif\``
  (cap height is about 0.7 of the font px, so px = size x canvas height / 0.7 for the canvas height `H` that spans the
  plane's `h - 0.3`; compute from `line.size * B.h / (B.h - 0.3)` so the metre size holds), `textAlign center`,
  `textBaseline middle`, gold fill, `fillText(text, w / 2, line.y * H, w - 120)`. Canvas 1536 x 563
  (`CanvasTexture`, `colorSpace = SRGBColorSpace`, `anisotropy = 4`). The font may not be loaded at build time:
  accept the fallback stack (Arial Narrow) like `drawFerrisSign`.
- [ ] **Step 3:** in `buildHall` add `group.add(buildBoard(cfg));` after the cars.

### Task 3: debug hook and Playwright check

**Files:** Modify `index.html` (`roomRallyhall`, ~3923), `tests/test_hideout.py` (`test_rallyhall_room_builds...`, ~1222).

- [ ] **Step 1:** in `roomRallyhall` add to the `ROOM.rallyhall` object
  `board: { text: boardLayout(RALLYHALL).lines.map(l => l.text), found: hall.children.some(o => o.userData.role === 'rallyhallboard') }`
  (import `boardLayout` from `./rallyhall.js`, `index.html:942`).
- [ ] **Step 2:** in the existing Playwright test add after `a = ...`:
  `assert a["board"]["text"][:2] == ["Elfyn Evans", "WRC World Champion 2026"] and a["board"]["found"], a`;
  also keep every existing assertion (`counts.rallyhall == 1`, `tris`, `colliders == 9`). Add a second screenshot
  for the human check: place the view at 3 m from the board (`sim(...)` at a = 16.3, b = 0 looking at +a, as the existing
  `view` call does for the front) and save `rallyhall-board.png` to `tmp_path`; look at it once: the lettering must read
  left to right, not mirrored, and sit below the glass band.
- [ ] **Step 3:** run `node --test tests/rallyhall.test.mjs tests/rooms.test.mjs`, then the single Playwright test.
  Add a `CHANGELOG.md` `[Unreleased]` line in player voice (the stack's rule): „In der Rally-Halle hängt jetzt eine
  Ehrentafel für Elfyn Evans, WRC-Weltmeister 2026.“ Commit `feat(hideout): honour board for Elfyn Evans in the rally hall`
  with `Closes #907`.
