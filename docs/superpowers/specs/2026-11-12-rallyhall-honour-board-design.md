# Honour board for Elfyn Evans in the rally hall (#907)

## Why

The maintainer wants an honour board in the rally hall (star room 5, #859 / PR#860): **"Elfyn Evans"** /
**"WRC World Champion 2026"**. Fact checked 2026-11-12 (issue comment): Evans and co-driver Scott Martin are the 2026
FIA World Rally Champions (title won at Rally Italia Sardegna).

## What the player sees

- A dark board with a gold frame and gold lettering on the hall's **back wall, behind the red Evans car** (b = 0),
  below the dark glass band. Main line **Elfyn Evans**, second line **WRC World Champion 2026**, a smaller third line
  **& Scott Martin**.
- Canvas texture drawn at build time, no external asset, no logo, no team/brand mark. Same text in `de` and `en`
  (proper names plus a title the maintainer fixed), so no `strings.js` keys and no relabel on language change.

## How it works

- **Layout (hall frame, `rallyhall.js`, `RALLYHALL.board`):** the hall's frame has a along its depth, b across, y = 0
  on the floor, the back wall's inside face at a = 19.4 (`rallyhall.js:12`, `hall.d/2 - wall`) and the dark glass band
  at y 3 - 9 (`rallyhallmesh.js:55`). The board is a plane at a = 19.34 (6 cm off the wall, in front of the band's
  plane at 19.30 - 19.35 but below it, y 0.8 - 3.0), b = 0, 6.0 m wide, 2.2 m high, facing -a (towards the open front).
  Pure function `boardLayout(cfg)` returns `{ a, b, y0, w, h, lines }`; `lines` are `{ text, size, colour }` with
  `size` the line's cap-height share of the board height.
- **Readable on foot at about 3 m:** the main line's letter height is at least 0.4 m (0.4 m subtends 7.6 deg at 3 m);
  the car cannot get nearer than 2.5 m to the wall (back wall collider + car radius 2.6, `rooms` test), so a
  3 m viewing spot at a = 16.3 is free floor.
- **Blocks nothing:** it hangs on the wall and adds **no collider** (the 9 colliders stay 9). The nearest car podium
  collider ends at a = 7, 12 m away. The front, the apron and the passage between podiums and wall are untouched.
- **Mesh (`rallyhallmesh.js`):** `buildBoard(cfg)` returns a group (`userData.role = 'rallyhallboard'`): a 6 cm dark
  panel box, four thin gold frame boxes, and a plane with the canvas texture (`MeshBasicMaterial`, so the lettering is
  not shaded dark). The canvas is 1536 x 563, drawn with the Barlow Condensed stack `index.html:3960` already uses.
  `buildHall` adds it to the hall group, so `roomRallyhall` places and `disposeGroup(ROOM.group)` frees it with the
  room (geometry, material, and the texture map, `index.html:3847`). No `index.html` change is needed beyond reading
  the new fields in the debug hook.
- **Debug hook:** `ROOM.rallyhall` gets `board: { text, found }` (the lines, and whether the board mesh is in the hall group) so the
  Playwright test can check it.

## Assumptions

- **A1** [high] The board lives in `buildHall` (hall frame), not in `index.html`.
  Rejected: a separate `roomBoard` in `index.html`. `index.html:3921-3923` already places and disposes one hall group,
  and the dedication plaque (`index.html:4041`) shows the extra code a separate placement needs.
- **A2** [high] Back wall behind the Evans car, below the glass band, not on a side wall.
  Rejected: a side wall at b = +-35.4. It is 13 m from the nearest podium; the back wall is the first thing you face
  from the open front and the red car (b = 0, `rallyhall.js:18`) stands in front of it.
- **A3** [med] Third line "& Scott Martin" is included, small (about 45 % of the main line).
  Rejected: omitting it. The fact comment names him as co-champion; "&" keeps it language-neutral, no `strings.js`
  key. Dropping it is deleting one `lines` entry.
- **A4** [high] Gold (`#d4a83a`) on dark (`0x14171c`) with a gold frame, like the dedication plaque's
  `#c9a45c` (`index.html:4054`); no `colours` key needed beyond a `board` sub-object.
- **A5** [high] No collider and no new `strings.js` keys. Rejected: a solid board; it hangs flat on the wall.

## Consequences

- Triangles: about 70 more (6 boxes + 1 plane), well inside the existing 500 - 30000 band (`tests/test_hideout.py:1243`).
- One more 1536 x 563 texture per room entry (about 3.5 MB GPU), freed with the room.
- The wall below the glass band is no longer bare; the Evans car sits in front of the board's middle from the far
  front, so the board reads fully only from the floor between podiums and wall.

## Acceptance Criteria

- [ ] A board with "Elfyn Evans", "WRC World Champion 2026" (and "& Scott Martin") hangs on the rally hall's back wall.
- [ ] Main-line letter height >= 0.4 m; the board lies on the wall (a within 0.1 m of the wall face), inside the
      wall's width and below the glass band.
- [ ] No collider added (still 9); no car podium or passage is covered.
- [ ] Canvas texture only, no external asset, no logo; no new strings.
- [ ] Freed with the room (`disposeGroup`); the rally hall Playwright test still passes with the board present.
