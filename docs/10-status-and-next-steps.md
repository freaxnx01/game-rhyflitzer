# Status and next steps

Handover from the kickoff sessions (2026-09-28/29). Read this first when picking the project up.

## Decisions

| Topic | Decision |
|---|---|
| Name | **Map Madness** (public name). **Rhyflitzer** is the codename and the name of the curated home region. Repo stays `game-rhyflitzer`. |
| Audience | Dedicated to my daughter (10). Fun, bold, a bit cheeky, never grim. |
| Repo | Public on GitHub, code under MIT. Geodata keeps its own licences (attribution in credits). |
| Graphic styles | "Original" = Midtown Madness 2 look (2000): filtered textures, vertex lighting, hard fog. "Smooth" = slowroads-like. Toggle with T. |
| v0 scope | No traffic, pedestrians or cops. Checkpoint race, blitz, cruise. |
| Start region | Sisseln, Sisslerfeld, Stein, Bad Säckingen (Holzbrücke as the forbidden shortcut). |
| Controls | Space = accelerate (W/↑ also), A/D or ←/→ = steer, S/↓ = brake/reverse, Ctrl = handbrake, R = reset to road, T = style, H = horn, M = mute. |
| Player car | Navy-blue compact hatchback in the Mazda 3 class. Own design, not a replica of a real model. Plate "AG · 4334". |
| Textures | No Google Street View / Apple / Bing imagery. Own photos, Mapillary/KartaView (CC BY-SA), swisstopo/LGL aerials. See [06](06-photo-capture.md). |
| Logos | None until permission is granted. See [07](07-brands-and-permissions.md). |

## Prototype internals (`prototype/index.html`)

Single-file three.js, buildless. The world is **hand-traced**, not generated:

- `W(px, py)`: coordinates traced from an OSM screenshot at zoom 15 (125 % display scaling), **2.54 m per pixel**, pixel (960, 500) = world origin. Covers the whole region.
- `V(px, py)`: Sisseln village traced from an OSM screenshot at zoom 18, **0.385 m per pixel**, anchored so pixel (1000, 705) on the Hauptstrasse = world (1829, −284.5).
- World axes: x = east, z = south, metres. Approximate georeference of the origin: **47.5506 N, 7.9671 E** (errors of tens of metres).
- Terrain: `terrainH()` is **made up** (smooth terrace, hills, noise) unless a measured `.mmh` is loaded from the start screen (see [08](08-pipeline-terrain.md)).
- Buildings are merged per material role; trees are one merged billboard mesh (Original) or InstancedMesh cones (Smooth).
- Sound is synthesized with WebAudio (engine, rumble, checkpoint, finish, crash, splash, horn). No audio files.

### Guessed, not verified

- Smile-Kreisel position: placed at Sisseln's west entry, before the climb.
- Terrace edge and the Hauptstrasse climb/right curve toward Laufenburg: invented. **Known to be wrong**; fix with measured terrain.
- Heights of buildings, number of floors, facade colours: random within plausible ranges.

### Known issues

- Roads follow the terrain but have no embankments; on slopes they can cut into or float above the ground.
- The Kreisel's ring road is sampled per vertex and may clip into sloped ground.
- The hand-traced river and roads don't line up exactly with measured terrain.
- Only two facade textures for all houses.

### Small ideas not yet in `ideas.md`

- A third graphic style "Retro" (MM1 look): `NearestFilter` textures, low render resolution.
- Hero assets beyond the Holzbrücke and Münster: Trompeterschloss, Laufenburg and Rheinfelden landmarks, Plattform Sisslerfeld.

## Next steps

1. **Run the terrain pipeline** for the default region, load the `.mmh`, check the Sisseln Hauptstrasse climb and curve toward Laufenburg.
2. **Pipeline step 2: OSM** roads, river and buildings from a Geofabrik extract cut with osmium (not the public Overpass API). Replaces the hand-traced layout and fixes the georeference.
3. **Buildings with roofs**: swissBUILDINGS3D and LGL LoD2 into the pipeline.
4. **Title screen**: pick A (Sunset Steel) or B (Blue Chrome), then implement menus per [09](09-design-workflow.md).
5. **Permissions**: email Gemeinde Sisseln (Sissila, Wappen, photos, Kreisel) and Volg, using the template in [07](07-brands-and-permissions.md).
6. **First GoPro test**: one pass along the Sisseln Hauptstrasse, check how many frames are sharp enough to texture ten houses.
7. **Hero assets** in Blender: Holzbrücke first, then Fridolinsmünster.

## Tooling notes

- The bridge MCP server only allows Markdown paths (`*.md`, `docs/**/*.md`, `ideas/**/*.md`). Add `pipeline/**`, `prototype/**` and `design/**` to its allowlist so sessions without a clone can commit code.
- Claude app sessions can commit code by attaching the repo with push access (clone in the cloud container).
- Design round trip between the Claude app and the CLI: see [09](09-design-workflow.md).
