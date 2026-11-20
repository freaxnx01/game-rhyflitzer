# Manneken Pis in the Atomium room — design (#585)

## Goal

The Manneken Pis joins the Atomium (#355) and the fries figure (#451) in star room 1 (`atomium` in `ROOMS`,
`rooms.js`) as a small "Brussels corner". **Life size** (decided 2026-11-17, "Echt, mit Brunnen-Ecke"): the
bronze boy is about 61 cm tall, so it stands as in Brussels, in its **stone niche on a house corner** (Rue de
l'Étuve / Rue du Chêne), about 2 m up on a pedestal over a stone basin, behind a wrought-iron railing, with
**a thin animated water jet** into the basin (decided 2026-11-17, "Ja, mit Wasserstrahl").

## The figure

- Source: „177_ Manneken Pis In Brussels, Belgium" by **RascalFR** (Sketchfab, CC BY 4.0,
  https://sketchfab.com/3d-models/177--manneken-pis-in-brussels-belgium-fd4be588ea3d4a0fa349ae393a4f3b9f),
  committed unmodified at `assets/src/manneken_pis.glb` (19.7 MB, see its LICENSE.md). The right pose (hand on
  the hip), a 3D-print scan: 694k triangles in 8 meshes, one material, no textures, Z up, about 58 × 45 × 130
  units, a small square base under the feet.
- `tools/prepare-manneken.mjs` (the estate/delorean prep pattern) makes `assets/models/manneken_pis.glb`: merged
  into one mesh, simplified to **14k–22k triangles**, metres, +y up, the base's bottom on y = 0, centred on the
  feet, **total height 0.61 m**, the face towards **+z** (Sketchfab's default view, as in its thumbnail), one
  material `Bronze` (dark patinated bronze: base colour `#5b4a2e`, metalness 0.6, roughness 0.45),
  `EXT_meshopt_compression`, ≤ 600 KB. It prints the jet's start (the frontmost vertex near the centre line at
  36–46 % of the height), which goes into `MANNEKEN.jet.from`.
- Loaded lazily on building the room (GLTFLoader + MeshoptDecoder, as `loadModel`), with the corner standing
  already; offline, the corner stays without the boy, and the room still works.

## The corner (procedural, `mannekenmesh.js`)

Frame: +x towards the portal (the face), y up, z across; the origin is the corner's foot on the floor.

- Two house-wall slabs in cream plaster (`#e6dcc4`), 6 m high, 3.2 m long, 0.6 m thick, meeting at a right
  angle behind the niche (the corner points at the viewer), with a stone plinth band 0.5 m and a cornice at 6 m.
- In the chamfered front: a grey bluestone (`#6f7378`) niche frame, 1.6 m wide, arched, 3.4 m to the arch's top,
  recessed 0.6 m; a small shell over the arch.
- Inside: a stone basin (half-round, 1.4 m across, rim 0.7 m high, water surface 0.6 m), a pedestal column
  (0.35 m across) whose top is at **1.9 m**; the figure stands on it.
- In front: a wrought-iron railing (`#1e1e1e`) on a half circle of 1.9 m radius round the niche, 1.2 m high,
  bars every 0.12 m, a top rail with small spear tips.
- The jet: a thin tube (radius 0.012 m) along a parabola from `jet.from` (figure frame, scaled) to the water,
  about 0.5 m ahead; translucent pale blue with a stripe texture whose offset scrolls each frame so it reads as
  flowing.
- About 4000 triangles without the figure; one merged mesh per colour (the fries pattern).

## Placement and collision (`manneken.js`, pure)

- `MANNEKEN.at = [-60, -34]` in the room frame (a towards the far edge, b across): on the portal side of the
  Atomium, about 19 m from the fries figure at [-55, -52], off the drive line (|b| > 20 + reach), inside the
  gravel loop and clear of the Atomium's feet (the checks `fries.test.mjs` makes for the fries).
- Facing the portal, as the fries.
- One box collider over the walls, the basin and the railing: 4.6 m along x (from the wall backs to the railing
  front), 6.6 m across, solid to 6.3 m, `low: true`.

## Wiring

- `ROOMS[1]` gains `corner: MANNEKEN`; `roomLayout` places it (`mannekenPlacement`) and adds its collider;
  `index.html` builds it in `buildRoom` (`roomManneken`), steps the jet in the loop (`stepManneken(dt)`), and
  `window.__mm.manneken()` reports `{ x, z, th, y, loaded, tris, height, colliders }`.
- Credits: `CREDITS.md`, README's model list, `creditManneken` (EN/DE) in `strings.js` with its `<small>` in
  the F1 help, `assets/models/manneken_pis.LICENSE.md`, a CHANGELOG entry.

## Testing

- Node: `tests/manneken_asset.test.mjs` (budget, height, material, licence), `tests/manneken.test.mjs`
  (placement checks, facing, collider, the jet's arc ends in the basin, other rooms have no corner).
- Playwright (`tests/test_hideout.py`, one new test): entering room 1 loads `manneken_pis.glb` once, the boy
  stands 0.61 m tall on the pedestal at floor + 1.9 m, the corner is solid and the car passes beside it; leaves a
  close screenshot.

## Out of scope

Walking into the niche, the boy's costumes, sound of water, a street sign.
