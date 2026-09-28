# Technical architecture

## Stack

- three.js, vanilla JS, **buildless** (ES modules + importmap from jsDelivr)
- Physics: Rapier (`@dimforge/rapier3d-compat`, WASM) with its raycast vehicle controller
- Preprocessing: separate script (Node or Python) that turns OSM + swisstopo + LGL data into static tile files. The game itself stays buildless.
- Hosting: self-hosted static files; tiles served from own server

## Why it is feasible

MM1 is 1999 technology: a few km² of city, low-poly buildings, simple traffic, a handful of opponents. WebGL/WebGPU with three.js handles that on a laptop. Proofs: Bruno Simon's three.js driving portfolio, slowroads.io.

## The four hard parts

1. **Vehicle feel.** Arcade tuning (grip, jumps, crash forgiveness) takes the most iteration.
2. **The city.** Extrusion of footprints works at any angle. Roads at irregular junctions are the painful part. Trick for old towns: don't build road meshes, **paint street and plaza areas from OSM into the ground texture** — the ground between houses is the road.
3. **Traffic and opponents.** OSM road network = graph. Traffic follows lanes with simple steering and braking; physics only for nearby cars. Opponents: A* over the road graph plus rubber-banding (as MM1 did).
4. **Game structure.** Cheap: checkpoint, blitz, circuit are triggers plus a timer.

## Narrow streets

- Camera: chase cam must pull in or rise over roofs when blocked
- AI: less traffic in old towns, more on through roads
- Physics: wall collisions slide the car along instead of stopping it dead

## Procedural facades

Facade shader / texture atlas placing windows, shutters, doors, plaster colors from footprint and height. Variants: plastered, half-timbered, sandstone. One generator per graphic style.

## Performance

- Split world into chunks; merge buildings per chunk into one mesh
- InstancedMesh for trees, lamps, cars
- Fog as cheap LOD

## Large worlds (Fricktal and beyond)

- **Chunk streaming**: only tiles near the player are loaded
- **Terrain LOD**: quadtree terrain; small fine-meshed tiles near the car (a vertex every 1–2 m), progressively merged coarser tiles in the distance. Hide seams with skirts or vertex morphing to avoid cracks and popping.
- **Origin rebasing**: beyond ~10 km from origin float precision jitters; periodically shift the world back to the origin
- Estimated total data: a few hundred MB on the server, streamed per chunk

The v0 region (~5 × 3 km) may not need streaming at all: load everything, test look and driving first.

## Scope estimate

- A few weekends: car drives through an OSM-generated town, checkpoint race against the clock
- Longer: traffic, AI opponents, pedestrians diving aside, minimap, sound. The last 30% (feel, bugs, weak-hardware performance) takes as long as the first 70%.

## Next steps

1. Preprocessing script for the v0 region (OSM + swisstopo + LGL → tiles)
2. Visual prototype of the MM1 style in Claude Design
3. First playable tile: one 2 × 2 km area around Bad Säckingen / Stein, both styles
