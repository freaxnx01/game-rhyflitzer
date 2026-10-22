# Enter Bodenackerstrasse 6c, stage 1: stair hall, lift, roof, and multi-level walking (#411, #412)

Status: enriched 2026-10-22, maintainer decisions applied 2026-10-22 (epic #414). Depends on **PR#437** (#410, `prototype/bodenacker6.js`, the
modelled block) and **PR#438** (#409, `prototype/enterables.js`, the register, the `E` key on foot, the `ready` flag): **both must be merged
first**; this spec uses their APIs as specified there. Sibling specs: `2026-10-21-bodenackerstrasse-6-model-design.md` (#410),
`2026-10-21-enterable-buildings-register-design.md` (#409), `2026-10-17-on-foot-design.md` (#202).

## Intent

On foot (Z), the player walks to the glass entrance porch of **Bodenackerstrasse 6c** in Sisseln, presses **E**, the door leaf swings open, and
the player walks into the stair hall: an entrance hall on the ground floor (**EG**), a stair tower with two flights and a half landing per
storey up to the **9. OG**, a lift next to the stairs, and a door in the roof-top housing onto the **roof**. One window per landing looks out
onto the real Sisseln, because the interior is built **in place** at the real location of the block (no teleport, no loading level). The roof
is walkable up to its edge.

Stage 1 is the **hall, the lift and the roof only**. The flats behind the landing doors are **stage 2** (own spec later) and the hideout
objects (Eiffel, Atomium) reuse the same technology later; neither is designed here.

## Scope

In scope: **#412 groundwork** (walking on more than one level: a new pure module `prototype/walkways.js`) with 6c as its first consumer, and
**#411 stage 1** (the hall, lift, windows, roof). Everything else found on the way is written down, not acted on.

Out of scope: flats (stage 2), the other three houses 6a/6b/6d (the module is keyed on the house, so they follow cheaply), the Plattform
Sisslerfeld, hideout objects, touch controls for the lift (the keypad buttons are clickable and tappable, but there is no on-screen E), a
walking/ride sound beyond what exists.

## Privacy rule (public repository, strict)

Bodenackerstrasse 6c is a real residential building. Code, comments, tests, strings, the changelog, commits and the PR carry only the **public
address** and what any visitor sees in a stair hall. Nothing personal about residents (no names, no private details), no real floor plan. The
landing doors are plain closed doors with no names, numbers or mats. Grep the diff for personal words before every commit.

## Decisions (maintainer, 2026-10-22)

1. **Groundwork:** walkable surfaces are slabs (flat floors, OBB or polygon footprint), ramps (stair flights: a sloped plane for collision, drawn
   as steps), walls with a **height range** (block only on their level) and ceilings (stop jumping through the storey above). `footFloor` gets a
   second source, "the walkway surface under me within stepUp"; walking outside is unchanged. **Hover (F) is off inside the building.** 2D wall
   collision respects the walls' height ranges.
2. **6c at its real location (seamless).** The interior is built lazily within about 40 m of 6c and disposed when leaving. Its position comes from
   `bodenackerHouse(layout, '6c')`. **E** at the porch door (the #409 prompt) swings the door leaf open; the player walks through the porch into an
   entrance hall. Stair tower **2.40 m wide between 0.15 m walls**, two flights with a half landing per storey, **10 storeys**: EG, 1.-9. OG, then a
   door in the roof-top housing onto the roof. **One window per landing** to look out with free mouse look-around onto the real Sisseln. The roof is
   walkable up to its edge with an invisible railing there (cannot fall). **Lift:** shaft next to the stairs, a visibly moving cabin, the `lift.js`
   state machine reused, a **keypad panel** (DOM, de/en) with buttons **EG, 1-9, Dach/Roof** by click/tap or the keys **0-9 and D**; **E** on each
   storey calls the lift. **Flat doors** on the landings are visible but closed. Inside: first-person camera forced (**C does nothing**), the HUD
   shows **"6c · 4. OG"** (en: "6c · 4th floor"; EG = ground floor). Exit by walking out the door; **R** goes back to the car as usual.
   `bodenackerstrasse-6c` gets `ready: true` at the end.
3. **Tests:** node tests for ramps, heights, ceilings, wall height ranges, lift targets and the stair layout per storey; **one** Playwright test
   (jump to 6c, E in, lift to the 5th floor, stand at a window, roof).
4. Floors are named Swiss everywhere: **EG, 1. OG ... 9. OG, Dach**.

## Assumptions made by this spec (change them by editing the constants named in brackets)

- **A1** The hall's own coordinates: the interior is generated from the porch (`porch.entrance`, `porch.w`, `porch.d` of #410) and the level heights, **not** from the
  `stairs[]` rectangle of #410 (3.0 m deep), which is a hint for the exterior only. [`STAIRHALL` in `stairhall.js`]
- **A2** The stair tower is 2.40 m wide between walls, so it is wider than 6c's glass porch (2.3 m). The lift shaft sits on the right of the
  landing. The roof-top housing of **6c only** is therefore rebuilt as the tower's outline (4.0 m wide, 4.85 m deep, same 2.6 m rise) instead of
  #410's 2.4 x 3.0 m box; houses 6a/6b/6d keep #410's housing. The housing is a few white boxes, built once with the block (so it is there from far
  away), hidden while the detailed interior group is built.
- **A3** The exterior walls of #410 are single quads, drawn from the outside only (front faces). Seen from the inside they are invisible, so the
  hall's own walls enclose the tower and a "window" is simply a hole in the hall's wall: you look through it and see the real world. The plan has an
  explicit check (a camera ray through the window), and a fallback if a wall turns out to be double-sided.
- **A4** The ground floor (EG) is at the terrain height at the door, `eg = max(floors.floors[0], terrainH(entrance))`; storeys 1-9 follow at
  `floors.pitch`, the roof is `floors.roof`. (The last flights climb a little more, 3.03 m instead of 2.53 m.)
- **A5** The landing windows are in the façade wall at every storey landing 1.-9. OG (not on the half landings: the half landing is at the far end
  of the tower, away from the façade). The EG has the door instead.
- **A6** The cabin travels at 2.5 m/s (at least 1.5 s), door 1 s; after an arrival the door stays open 4 s, or as long as someone stands inside.
  [`TOWER_LIFT` in `towerlift.js`]
- **A7** The key **D** for "Dach" is only a lift key while the keypad is open (the walker stands in the cabin); it does not sidestep then.
- **A8** Windows are open holes (no glass pane): glass would need a transparent pass for nothing. The porch keeps #410's glass.

## Architecture

Three new pure modules (no three.js, no DOM, node-tested), glue in `index.html`:

| Module | Job |
|---|---|
| `prototype/walkways.js` | slabs, ramps, walls with a height range, ceilings; `walkwayFloor`, `walkwayCeiling`, `headBump`, `walkwayPush`, `wallActive` |
| `prototype/stairhall.js` | the 6c hall as a walkway set from `(entrance, porch, floors, eg)`; level heights, floor names and labels, the hall frame, `hallArea`, `bodyColliderOff`, the roof deck |
| `prototype/towerlift.js` | the cabin: 11 stops, re-timed rides on top of `lift.js`, door state, `call(k)` |
| `prototype/foot.js` | `footFloor(..., walkway)` second source; `footKeyAction(code, indoors)` blocks F inside |
| `prototype/index.html` | build/dispose the meshes, wire the walkways into `stepOnFoot`, the door, the keypad, the HUD, the roof |

### The hall frame (`stairhall.js`)

`a` = metres into the building from the façade line, along `entrance.th`; `b` = metres to the right of that heading; `world(a, b) = O + a·(cos th, sin th) + b·(−sin th, cos th)`,
with `O = entrance + porch.d · (cos th, sin th)`. The porch lies at `a < 0`.

```text
 plan (a down, b across; walls 0.15)

 b      -1.35 -1.2        0        1.2 1.35      2.5 2.65
 a 0     ┌─────┬──────────┴──────────┬────┬────────┬───┐  façade wall (windows 1.-9. OG, door at EG)
         │left │  landing (a 0.15…1.3)    │ div│ shaft  │rt │  lift door gap a 0.3…1.1 in the divider
 a 1.3   │wall ├─────────┬────┬──────┤    │ 1.35…  │   │
         │     │ flight A│well│flightB│    │ 2.5    │   │  A climbs away from the landing, B climbs back
 a 3.5   │     ├─────────┴────┴──────┤    └────────┴───┘
         │     │ half landing (3.5…4.7)
 a 4.85  └─────┴─────────────────────┘  back wall

 a < 0: the glass porch (w ≈ 2.3, d ≈ 2.9), its door leaf on the tip face
```

Flight A (left, `b −1.2 … −0.1`) climbs from the landing at `a 1.3` to the half landing at `a 3.5`; flight B (right, `b 0.1 … 1.2`) climbs back
from the half landing to the next landing. The 0.2 m well between them is a wall (a handrail). Two storeys are always exactly one pitch apart in
the same plan position, so the underside of the flight above is the ceiling over the flight below, 2.33 m up (the walker needs 1.9 m).

Heights: `levels[0..9] = eg + k·pitch`, `levels[10] = floors.roof`; half landing of storey k at the midpoint to the next level.

### Walkways (`walkways.js`)

A walkway set is `{ slabs, ramps, walls, ceilings }`; every shape is an OBB in the colliders' frame `{ x, z, hw, hd, c, s }` (`hw` along the heading `(c, s)`):

- `slab { ..., y }` (or `poly: [[x, z], ...]` with optional `holes: [rect]`) is a flat floor with its top at `y`, 0.2 m thick.
- `ramp { ..., y0, y1 }` rises along its heading from `y0` (at `−hw`) to `y1` (at `+hw`).
- `wall { ..., y0, y1, off? }` blocks only a walker whose body `[y, y + 1.9]` overlaps `[y0, y1]` (5 cm tolerance); `off: true` is an open door.
- `ceiling { ..., y }` is an underside; slab and ramp undersides count as ceilings too.

`walkwayFloor(walk, x, z, y)` = the highest surface at most `stepUp` (0.6 m) above the feet, or `null`. `footFloor` takes it as a **seventh argument** and returns
`max(ground, boxes, walkway)`. Outside a building, `walkway` is `null` and nothing changes. `headBump` clamps the head under a ceiling. `walkwayPush`
returns the pushes of the walls active at the walker's height; `index.html` applies them like `collideFoot` does.

### Seamless interior (`index.html`)

State `INT = { hall, on, group, lift, door, ... }`. `HALL6C = stairHall(...)` and the roof deck are computed once when the block is built
(pure and cheap, so the walkway set exists even while no mesh does).

- **Lifecycle:** each frame, if the distance to the entrance is under 40 m and the meshes are not built, build `INT.group` (one mesh per material, merged); over 55 m, dispose
  it. Inside the 40-55 m band nothing changes (hysteresis).
- **The building's own collider** (the OSM outline, #410's `pushOBB` with `ring`) is tagged `bodenacker6: true` and skipped in `footSolids` while
  `bodyColliderOff(hall, x, z, doorOpen)` is true: inside the porch or tower, or within 1.5 m of the open door. Outside that it still blocks, so
  the rest of the block stays solid.
- **Ground:** inside the porch or tower the "ground" source is `levels[0] − 1` (the terrain under the building must not lift the walker), the EG slab is the floor.
- **Hover** is blocked (`footKeyAction('KeyF', INT.indoors)`), and `stepOnFoot` clears an active hover when the walker comes in through the door.
- **First person:** already true on foot (`footCamera`); `C` is in `FOOT_BLOCKED`, so nothing changes; a test pins both.

### Door, windows, flat doors

- **Entrance door:** the leaf of #410 is a dark 1.0 x 2.2 m box in the merged geometry; for house 6c that one box is skipped and a separate hinged
  leaf mesh takes its place, permanently (visible from far). `ENTER_HANDLERS['bodenackerstrasse-6c']` sets the door target to 1; the leaf swings about 100 degrees
  and the wall `porch:door` is `off` above 0.6 open. It swings shut again when the walker is outside and more than 4 m away (`doorShouldClose`).
- **Landing windows:** the front wall is one piece per storey; the builder cuts a 1.2 x 1.1 m opening (sill 0.9 m, head 2.0 m above the landing) into storeys 1-9. The wall's collision stays whole.
- **Flat doors:** a closed, plain door (0.9 x 2.05 m, dark wood colour, no number) on the left wall of every landing EG-9. OG; purely visual.
- **Roof door:** a leaf in the housing's left wall onto the roof; it opens by itself within 1.5 m of it and shuts again beyond 3 m.

### Lift (`towerlift.js` + glue)

`createTowerLift(levels)` stops at the 11 levels. A trip re-times the `lift.js` machine (`setTimes({ ride })`), then lets it run
closing, moving, opening; `y` is eased between the levels. `call(k)` is refused while a trip runs. The cabin is a **dynamic slab** (its `y`
updated every frame) in the shaft; the shaft walls are static; the divider wall has a door gap per level closed by a **leaf wall** that is `off` only
while the cabin stands there with the door fully open. So the walker rides by simply standing on the moving slab (grounded stick, trip speed 2.5 m/s is far
under the step limit per frame).

- **Call:** `E` within 1.3 m of a landing's lift door calls the lift to that storey (prompt "E · call the lift" / "E · Lift rufen").
- **Keypad:** a DOM panel (`#liftpad`), shown while the walker stands in the cabin: buttons EG, 1...9, Dach/Roof (4 x 3 grid), the current level highlighted; click or tap or keys `0`-`9` and `D`. Keys are consumed before the walk keys.
- **Indicator:** the existing `#liftfloor` display is not reused (it shows the freight lift's depth); `#mapfloor` in the minimap bar shows the level label.

### Roof

The roof deck is a polygon slab (the body ring) at `floors.roof` with the tower cut out as a hole (the stairs are below); along every ring edge an
invisible wall 1.2 m high (`tag: 'edge'`) keeps the walker on the roof. The housing around the tower has a ceiling at its top, the left wall has the door. The
stairs end in the roof lobby inside the housing; a handrail wall stops the walker stepping onto the left flight's top.

### HUD

`#mapfloor` (new, in the minimap bar, hidden unless the walker is indoors or on the roof) shows `hudFloorText('6c', k, lang)`: "6c · 4. OG" / "6c · 4th floor", EG "6c · EG" / "6c · ground floor", roof "6c · Dach" / "6c · roof". `k = floorAtY(levels, P.y)`.

## Testing

- `node --test prototype/tests/*.test.mjs`: `walkways.test.mjs`, `stairhall.test.mjs`, `towerlift.test.mjs`, additions to `foot.test.mjs`, `strings.test.mjs` (de/en parity) and
  `enterables.test.mjs` (6c is ready). The stair test **walks the centre line of every storey** and asserts a floor everywhere, no step above 0.2 m, 1.9 m
  of headroom and no wall in the way.
- One Playwright test `prototype/tests/test_enter_6c.py` (foreground, after commit and push): jump to 6c, E in, lift to the 5th floor, stand at the window (a camera ray
  leaves the building), lift to the roof, walk to the roof edge without falling.
- Existing `test_bodenacker6.py`, `test_building_collision.py`, `test_on_foot.py` and `test_row_houses.py` stay green.

## Acceptance criteria

- [ ] `walkways.js`, `stairhall.js`, `towerlift.js` exist, are pure (no three.js, no DOM) and their node tests pass; `footFloor` has the walkway source and
      `footKeyAction('KeyF', true)` blocks hover; all older foot tests are unchanged and green.
- [ ] On foot in front of 6c, the E prompt shows (#409); E swings the door leaf open; the walker walks through the porch into the entrance hall without teleporting.
- [ ] Inside, F does nothing, C does nothing, the view is first person; the HUD shows "6c · EG" / "6c · ground floor".
- [ ] All ten storeys and the roof level can be reached on foot over the stairs (the node test proves it) and by lift; the HUD shows "6c · 4. OG" / "6c · 4th floor" etc.
- [ ] The lift cabin is visibly moving, its door opens at the stop; the keypad (EG, 1-9, Dach/Roof) works by click and by keys 0-9 and D; E on a landing calls the lift; the same panel is in German and English.
- [ ] Each landing 1.-9. OG has a window to look out through onto the real Sisseln (free mouse look); closed flat doors on the landings; nothing personal on them.
- [ ] The roof is reachable through the housing door and walkable to its edge; the walker cannot fall off.
- [ ] Walls block only on their own storey (a walker on the 5th floor is not blocked by a wall of the 4th); jumping does not pass through the storey above.
- [ ] Walking out the door returns to the street; R returns to the car; the interior is disposed beyond 55 m; the register entry `bodenackerstrasse-6c` is `ready: true` with its entrance.
- [ ] Nothing outside 6c changes (other buildings, other houses of the block, the hideout lift); no personal data anywhere in the diff.
- [ ] CHANGELOG entry (player voice, only the address named); Playwright `test_enter_6c.py` green; full node suite green.

## Out of scope / discoveries (not work)

- The flats behind the landing doors (stage 2); the other three houses; walking sound in the lift; touch controls (no on-screen E).
- The #410 housing of 6a/6b/6d keeps its smaller size, so 6c's housing is visibly larger (A2); harmonising is a follow-up.
- If the exterior walls turn out to be double-sided (A3), the fallback is a per-wall `side` switch in the block's wall material; do not change other buildings.
