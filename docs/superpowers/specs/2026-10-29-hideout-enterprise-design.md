# Enterprise NCC-1701-D in ring-2 room 0 (#491)

Status: enriched 2026-10-29. Builds on the second ring (#489, spec `2026-10-29-hideout-second-ring-design.md`,
plan `2026-10-29-hideout-second-ring.md`) and follows the Titanic room (#422) for a lazily fetched third-party
model. **Requires #489 merged** — every identifier below (`RINGS`, `ROOMS2`, `NEXT_ROOMS2`, `roomLayout(k, room,
ring)`, `BELOW_LOOKS`, `belowKind`, flat `ROOM.layouts` with ring-2 room k at index `8 + k`) is #489's.

The asset is already on `main`: `prototype/assets/models/enterprise_d.glb` (commit `feat(assets): Enterprise-D
model for the second ring (#491)`), built by `tools/prepare-enterprise.mjs`, credited in `README.md` and
`prototype/assets/models/enterprise_d.LICENSE.txt`.

## Goal

Ring-2 room 0 (`r2room0`, the first spoke right of the lift exit, `NEXT_ROOMS2[0]`) holds the **U.S.S. Enterprise
NCC-1701-D at life size (642.5 m), hovering** over a dark **holodeck floor with a glowing light-blue grid** under a
**starry sky with a coloured nebula**. The car drives in from the portal, under the saucer and under the
engineering hull; the helicopter flies round and over the ship. The ship is lit by a strong side key light and a
low fill so it reads as the Enterprise and not a silhouette; its window rows, the blue warp grilles, the red
bussard collectors and the deflector glow. The lettering **„U.S.S. ENTERPRISE NCC-1701-D"** is readable on the
saucer, top and underside.

**Success criterion:** driving into ring-2 spoke 0 builds the room with the grid floor and the star dome and
fetches `enterprise_d.glb` then (not before); the ship appears hovering 25 m over the floor, bow towards the
portal, 642.5 m long, with its lettering; the car drives freely from the portal to the far corners, including
under the whole ship; `node --test prototype/tests/*.test.mjs` and `pytest prototype/tests/test_hideout.py -k
enterprise` pass; the console stays empty.

## Non-goals

- Entering the ship on foot, a hangar, an interior (#412).
- Any other ring-2 room, any change to ring 1, or to #489's lift, ring look and room template beyond what this
  room needs (`look` on a room, a per-room look in `fadeBelowLook`).
- Colliders that keep the **helicopter** out of the ship: the ship hovers above everything the car can reach, and
  the heli flies through it as it flies through the Eiffel Tower's lattice (#277) — the same rule.
- A Testhub target, hub screenshot, J-list entry, spoke sign, sound, phaser, moving parts, LOD.
- Trees, gravel paths, clouds or a meadow in this room (the holodeck replaces them, binding).
- Changing the model's textures (its own lettering is too small — see Asset facts — so the room draws its own).

## Binding decisions (maintainer)

1. **Life size (642 m) in `r2room0`, hovering** high enough that the car drives under the saucer; colliders only
   where a part comes near the floor.
2. **Lettering „U.S.S. ENTERPRISE NCC-1701-D" visible** — the one exception to the unbranded rule, for this
   object only.
3. **Room look:** starry sky with a coloured nebula on the dome; fog off or very thin; strong side key light
   ("starlight") and a low hemisphere fill; emissive window rows, blue warp nacelles, red bussard collectors,
   glowing deflector.
4. **Floor: dark with a glowing light-blue grid** (holodeck), readable while driving, cheap to render. Replaces
   the meadow look for this room only.
5. **Lazy loading** on entering the room, as the Titanic; nothing or a simple stand-in while it loads.
6. Credits in the CHANGELOG entry as for the Titanic (model name, author, CC BY 4.0).

## Asset facts (measured 2026-10-29, `tools/prepare-enterprise.mjs` on the Sketchfab original)

- Source: „Enterprise D 2 8 Simple Bake Export" by HaughtyGrayAlien, CC BY 4.0, uid
  `02aeda1aaafd4a3591892ed5a2aeac33`; re-confirmed through the Sketchfab API (licence slug `by`, author
  `HaughtyGrayAlien`, 1 199 440 faces, 604 723 vertices). Original glb 104 MB, sixteen 1024 px PNG textures (4 MB),
  four materials (saucer, drive section, nacelles, "aux" = pylons, bridge, shuttlebays, deflector, greebles), each
  with base colour, metallic-roughness, normal and emissive maps.
- Shipped `enterprise_d.glb`: **6.0 MB, 239 884 triangles** (saucer 42 645, drive 26 412, nacelles 18 140, aux
  152 687), WebP textures (1.26 MB in all), meshopt + `EXT_texture_webp`; loads in three r170's `GLTFLoader` with
  the meshopt decoder with an empty console (checked headless, 2026-10-29).
- Frame: metres, **bow on +x, +y up, +z starboard**; **y = 0 at the lowest hull point**, x = z = 0 the centre of the
  bounding-box footprint. Bounds x −321.25 … 321.25, y 0 … 143.1, z −238.3 … 238.3: **length 642.5 m, beam
  476.7 m, height 143.1 m** (the real ship: 642.5 × 467.1 × 137.5 — the model is 2 % wider and 4 % taller).
- Nodes `enterprise` → `saucer`, `drive`, `nacelles`, `aux`, one mesh each; materials named as the nodes, each
  `extras: { glow: <section> }`, `emissiveFactor` white, `metallicFactor` 0.25.
- Underside profile (x slice → lowest point, in metres): stern −325 … −200: 20 (the nacelles' underside, z ±151);
  −175 … −100: **0 … 3 (the engineering hull's underside, z ±145)**; −75 … −25: 2.5 … 6; the neck −25 … 25: 14 … 42;
  **the saucer, x 25 … 321: 81 … 102** (lowest at x 100 … 150, the saucer's centre). Saucer top 123 … 135 along
  x 200 … 300; the bridge at x 100 … 125 is the top, 143.
- **Lettering in the textures: present but unreadable.** The saucer map carries „NCC-1701-D" about 8 px tall and
  „U.S.S. ENTERPRISE" about 4 px tall at 1024 px, in dull red — a blur in the game (confirmed in the headless top
  view). The room draws its own (Design → Lettering).

## Today (evidence, after #489)

- `prototype/rooms.js`: `ROOMS2` eight `{ id: 'r2room K', name: null, object: null }`; `RINGS[1] = { id: 'ring2',
  stop: 'ring2', y: −1200, half: 500, rooms: ROOMS2 }`; `roomLayout(k, room, ring)` builds the ring walls, the
  portal tunnel, object feet/hull/basin/figure/artemis colliders, two tree rows, gravel paths; `fly: { wall:
  475, ceiling: 420 }`. `spokeSigns` skips rooms with `signed === false`.
- `prototype/hideout.js`: `TITANIC = { key, h, scale, anchor, alongV, flat, length, hull, hullH, draught, basin, url,
  loadWithin }` — the descriptor shape `loadModel` reads.
- `prototype/index.html`: `ensureRoom(k)` builds `roomMeshes(group, R)` (lawn, paths, trees, clouds, portal) and
  calls `loadModel(k)` when `R.object.url` is set; `loadModel` scales by `O.scale`, anchors by `O.anchor`, turns
  by `alongV`, sinks by `draught`, flat-shades by `flat`, counts triangles into `ROOM.states[k]`; `attachModel(k)`
  adds `ROOM.models[k]` to `ROOM.group`. `roomTrees` calls `speciesMeshes(trees …)` and `group.add(...meshes)` —
  with no trees that is `group.add()` and a three.js console warning, so an empty room must skip it.
- Looks: `ROOM_LOOK` (meadow: fog `#cfe2f3` 0.00045, sky `#3f7fd6`/`#d9e9f7`, hemi 0.85, sun 1.1), `BELOW_LOOKS =
  { ring, ring2, room }`, `fadeBelowLook(q)` blends `BELOW_LOOKS[BELOW.kind]` with `SPOKE_DARK`; `setBelowLook(kind)`
  shows `sunSprite` in a room. `sun` is a directional light at a fixed offset `(−300, +400, −200)` from the car
  (`camTail`), so it always comes from the same upper-front-left quarter; `hemi` the hemisphere light. The sky is
  one `BackSide` sphere of radius 3800 on the camera (`sky`, `skyMat`, `depthWrite: false`, no `renderOrder`);
  the camera's far plane is 4200.
- `GLTFLoader` puts a material's `extras` into `material.userData`.
- `makeTex(w, h, draw, opts)` draws a canvas texture (sRGB, repeat wrapping); `textTex(text, w, h, bg, fg, font)`
  draws a text plate (#489's "2").
- Tests: `prototype/tests/rooms.test.mjs` (`rooms2`, `blocked`, `toWorld`, `toLocal`), `test_hideout.py`
  (`enter_cabin(page, h, level, times)`, `FREIGHT_SLOW_DWELL`, `RIDE_DONE`, `into_room(page, k, id, y)`,
  `__mm.pushAt`, `__mm.sim`, the Titanic test as the model-room template).

## Design

### Where the ship hangs (author's calls)

```
                    far edge (a = +500)
      ┌──────────────────────────────────────────┐
      │   ·  ·   ·    *   ·   nebula  ·    ·  ·   │   star dome, r 1500, centred on the room
      │           ╭───╮ nacelles                   │
      │        ╭──┴───┴──╮  stern                  │   bow towards the portal, yawed 30° to the
      │     ╭──┴─────────┴──╮ (x = −321)           │   right of the portal axis (3/4 view on approach)
      │     │   engineering  │                      │
      │     ╰────┐ hull ┌────╯ underside 25 m up    │   lowest hull point: 25 m over the grid
      │       ╭──┴──────┴──╮                        │
      │     ╭─┴────────────┴─╮  saucer, Ø 477 m     │   saucer underside 106 … 127 m over the grid
      │     │  U.S.S. ENTERPRISE  (underside too)   │
      │     ╰──────┐  bow ┌──╯ (x = +321, 222 m     │
      │             ╰────╯      from the portal)    │
      │ ░░░░░░░░░░ grid 10 m ░░░░░░░░░░░░░░░░░░░░░░ │
      └──────────────────┐ ┌────────────────────────┘
                     portal (a = −500)
```

- **Position:** the ship's footprint centre on the room centre, **hover 25 m**: the lowest hull point (the
  engineering hull's underside, 290 m across) 25 m over the floor, the saucer underside 106 m, the bridge 168 m —
  well under the 420 m fly ceiling, so the helicopter clears it with 250 m to spare (its `maxAgl` is 400).
  25 m is enough for the bus (3.5 m) and the hovering walker, and low enough that the hull fills the view.
- **Heading:** bow towards the portal, **yawed 30°** so the approach shows the classic three-quarter view (saucer
  curve and one nacelle) instead of a flat disc head-on. Yawed, the ship spans 794 × 734 m, inside the 1000 m
  room with 100 m to the walls; the bow tip lies 222 m past the portal face.
- **Colliders: none from the ship** (decision 1's "only where a part comes near the floor": nothing is within
  25 m of it). The room keeps its ring walls and portal tunnel. The helicopter may fly through the hull
  (non-goal, as the Eiffel lattice).
- **Hover bob:** ±1.5 m over a 14 s sine, applied per frame to the model root (`enterpriseHover(t)`); the lettering
  decals are children of the root and ride along. Pure, trivially testable; no collider follows it since there
  is none.
- **Stand-in while loading: none** (decision 5 allows it). The grid, the dome and the lights are there at once;
  the 6 MB ship pops in when fetched (the Titanic shows nothing either). `ROOM.states[8].placeholder` is `false`.

### Descriptor and placement (`prototype/enterprise.js`, pure)

```js
export const ENTERPRISE = { key: 'enterprise', h: 143.1, length: 642.5, beam: 476.7, scale: 1, anchor: [0, 0, 0],
  hover: 25, yaw: Math.PI / 6, bob: { amp: 1.5, period: 14 }, glow: { saucer: 1.6, drive: 1.6, aux: 1.8, nacelles: 2.6 },
  lettering: [ … ], url: './assets/models/enterprise_d.glb', loadWithin: 400 };
```

`enterprisePlacement(room, cfg)` → `{ x, z, y, th }`: the room centre, `room.y + cfg.hover`, heading `th` =
portal direction + π (bow at the portal) + `yaw` (positive = turned towards +v, the right when driving in).
`loadModel` gets one new branch: an object with `hover` is placed by `enterprisePlacement` (position, `rotation.y
= −th`, scale 1) instead of the anchor/alongV/draught arithmetic, and materials whose `userData.glow` names a
section get `emissiveIntensity = cfg.glow[section]`.

`ROOMS2[0]` becomes `{ id: 'r2room0', name: 'Enterprise', object: ENTERPRISE, signed: false, look: 'space' }`
(unsigned like every object room: no spoke sign, finding it stays a surprise). `roomLayout` with `room.look ===
'space'` returns `trees: []`, `paths: []`, `look: 'space'`; everything else (walls, portal, spawn, fly) as before.
`NEXT_ROOMS2` is unchanged (room 0 was first in line).

### Look (`SPACE_LOOK`, author's calls inside decision 3)

- `SPACE_LOOK = { fog: '#04050a', density: 0.00008, skyTop: '#04050a', skyHor: '#04050a', hemiSky: '#8fa3c8',
  hemiGround: '#141a26', hemi: 0.45, sun: 2.2 }` — the global sky sphere goes near-black behind the star dome, the
  fog is thin enough that at 1000 m it takes 0.6 % (stars untouched), the hemisphere is a cool low fill, and the
  **sun becomes the key light** at 2.2: it comes from the upper-front-left of the car, i.e. from the side and above
  the ship whichever way the car points — the "starlight". `sunSprite` is hidden in this look (no sun disc among
  stars). `fadeBelowLook` takes the room's look (`ROOM.layout.look === 'space' ? SPACE_LOOK : ROOM_LOOK`) for
  `kind === 'room'`; the spoke fade to `SPOKE_DARK` is unchanged.
- **Star dome:** a `SphereGeometry(1500, 32, 16)`, `BackSide`, `MeshBasicMaterial` with `fog: false`,
  `depthWrite: false`, `renderOrder: 1` (drawn after the global sky), centred on the room centre at the floor,
  part of the room group. Its texture is a 2048 × 1024 canvas drawn once per build from `starField(seed)`: about
  2200 stars (1–2 px, a few 3 px with a soft halo, brightness and a slight blue/amber tint from the seed), three
  nebula clouds as overlapping radial gradients (violet `#6a3fb0`, teal `#2a8f9c`, magenta `#b03f8a`, alpha ≤ 0.35)
  in the upper half, a faint milky band. `starField` is pure (positions, sizes, tints, the clouds) and tested;
  the canvas drawing is `index.html`'s. The dome's lower third (below the floor) is just dark.
- **Holodeck floor:** one `PlaneGeometry(1000, 1000)` with a `MeshBasicMaterial` (unlit — cheap, and the grid glows
  by itself) whose texture is a 256 px tile from `makeTex`: `#05070d` ground, a 2 px `#5fd0ff` line on two edges,
  a 1 px `#1f4a66` half-line in the middle, repeated every **10 m** (`repeat 100 × 100`, anisotropy from
  `makeTex`). `HOLODECK = { cell: 10, line: '#5fd0ff', sub: '#1f4a66', ground: '#05070d' }` pure. The outer edge
  gets a brighter 1 m rim strip (`flatStrip`, `#8fe0ff`) along the four walls so the invisible wall reads. The
  portal face, spoke lining and tunnel stay as in every room.
- **Ship materials:** the glb's own (base, metal-rough, normal, emissive maps); `emissiveIntensity` per section
  from `ENTERPRISE.glow` (nacelles 2.6 — grilles and bussards, aux 1.8 — deflector, saucer/drive 1.6 — window
  rows). No other material change.

### Lettering (decision 2, author's calls)

The model's lettering is a blur (Asset facts), so the room drapes four **canvas text decals** on the saucer:

| side | text | centre x (ship frame) | width across (z) | letter height |
|---|---|---|---|---|
| top | `U.S.S. ENTERPRISE` | 235 | 180 m | 14 m |
| top | `NCC-1701-D` | 205 | 150 m | 20 m |
| underside | `U.S.S. ENTERPRISE` | 235 | 180 m | 14 m |
| underside | `NCC-1701-D` | 205 | 150 m | 20 m |

`ENTERPRISE.lettering` lists them (`{ side, text, x, w, h }`); `letteringFrame(side)` gives the plane's rotation
so the letters' "up" points to the bow (+x) and the face points away from the hull (+y on top, −y below) — the
registry reads the right way round from above and for the car looking up. Each decal is a `PlaneGeometry(w, h,
24, 4)` whose vertices are **draped** on the saucer: for each vertex a `Raycaster` from 300 m above (top) or 5 m
below (underside) along ±y, against the `saucer` node only (42k triangles: 125 rays × 4 decals in well under a
second, once per room build), vertex y = hit y ± 0.6 m. Text: bold condensed sans (`"Barlow Condensed"` as the
"2" plate), colour `#d8dfe9` with a 1 px dark outline, transparent canvas (`makeTex` with `alpha: true`),
`MeshBasicMaterial` `transparent`, `depthWrite: false`, `polygonOffset −2`, `DoubleSide`. Decals are children of
the model root (they bob with it) and are built once in `attachModel` (`root.userData.lettered`). Where no ray
hits (the saucer's edge gap), the vertex takes its neighbour's height — the line stays flat there.

### Debug hook

`window.__mm.enterprise()` → `{ ...ROOM.states[8], hover: ENTERPRISE.hover, y: model root y, th, lettering:
<decals built>, look: ROOM.layout.look, sun: sun.intensity, sunDisc: sunSprite.visible }` or `null` before the
room is built.

### Credits

`creditEnterprise` in `strings.js` (en: `3D model „Enterprise D 2 8 Simple Bake Export" by HaughtyGrayAlien
(Sketchfab), CC BY 4.0; decimated and compressed`, de accordingly) and a `<small data-i18n="creditEnterprise">`
in the F1 help after `creditModelT`. README and LICENSE are already in.

## Constraints

- Buildless; no new dependency; `const`/`let`; the pure numbers in `prototype/enterprise.js` with `node --test`;
  `index.html` only wires (room meshes, dome, decals, hook).
- **#489 lands first** (its `rooms.js`, `underground.js`, `lift.js`, `index.html` changes are the base). Anchor every
  edit by identifier, never by line.
- Ring 1 regression: every existing node test passes unchanged; #489's `rooms.test.mjs` tests that expect every
  ring-2 room empty are rewritten for room 0 (the plan lists them); the existing Playwright tests are not rerun —
  only `-k enterprise`.
- Performance: 240k triangles in one room, textures 1.3 MB, the dome one 2048 × 1024 texture, the floor one 256 px
  tile; no shadows, no lights beyond the style's sun and hemi.

## Acceptance criteria

- [ ] Riding to ring 2 and driving into spoke 0 past 52 m switches to `r2room0`; the room has a dark floor with a
      light-blue 10 m grid and a star dome with a coloured nebula, no trees, paths or clouds; the fog is
      `#04050a` and the sun disc is hidden; `__mm.below().object` is `true`.
- [ ] `enterprise_d.glb` is requested exactly once, on entering the room, not before (`page.on("request")` as
      the Titanic test).
- [ ] `__mm.enterprise()` after the load: `loaded` true, `placeholder` false, `tris` between 200 000 and 260 000,
      `height` ≈ 143.1, the model root's y = −1200 + 25 ± 2 (the bob), `lettering` 4.
- [ ] The ship is 642.5 m long, bow towards the portal turned 30° to the right of the portal axis
      (`enterprisePlacement` node test; in the browser `th` matches).
- [ ] The car drives from the spawn to the room centre (under the engineering hull) and to all four corners
      (`__mm.pushAt` finds no push at the centre, under the saucer centre at ship x 125 and at the corners;
      the walls at 499 still push).
- [ ] The helicopter is clamped 475 m from the centre and 420 m over the floor (unchanged #489 clamp), i.e.
      above the bridge (168 m).
- [ ] Each ship material with `userData.glow` has `emissiveIntensity` ≥ 1.6; the nacelles 2.6 (browser check
      through the hook or a traverse).
- [ ] The four lettering decals exist, read `U.S.S. ENTERPRISE` and `NCC-1701-D`, lie on the saucer (every vertex
      within 1 m of a raycast hit; letters' up = +x), one pair on top, one on the underside; a screenshot from
      under the saucer shows the underside pair.
- [ ] Ring-2 rooms 1–7 stay empty meadows; ring 1 is untouched; `spokeSigns(ROOMS2)` is still `[]`.
- [ ] `node --test prototype/tests/*.test.mjs` passes; `pytest prototype/tests/test_hideout.py -k enterprise`
      passes; the console stays empty (no `Object3D.add` warning from an empty tree list).
- [ ] `creditEnterprise` exists in `en` and `de` and shows in the F1 help.
- [ ] `CHANGELOG.md` has a player-facing entry under `[Unreleased]` → `### Added` naming the model, the author and
      CC BY 4.0.
