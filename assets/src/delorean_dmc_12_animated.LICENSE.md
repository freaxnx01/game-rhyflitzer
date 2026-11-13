# delorean_dmc_12_animated.glb (source, unmodified)

- **Model:** "DeLorean DMC 12 (Animated)" by **JEX-D**
- **Source:** https://sketchfab.com/3d-models/delorean-dmc-12-animated-e90955c1dce945dfbcac09886b9f310e
- **Licence:** Creative Commons Attribution 4.0 (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
- **Downloaded:** 2026-11-11 via the Sketchfab API (GLB, 656,732 bytes)

This is the unmodified original, kept as the input for `tools/prepare-delorean.mjs` (#831). The game does not load
this file; it loads the prepared, unbranded `assets/delorean.glb`.

Contents seen in the file (for the prep script): 16 materials, no textures, 18 animations. Nodes `C`, `D`, `M`,
`M.001` (likely the "DMC" letters) and `DeLorean Body_license plate_0` are branding and must be removed; the
two wheel nodes `DeLorean wheels.001/.002` must be split into four; the gull-wing doors are `door` and `door.001`.
