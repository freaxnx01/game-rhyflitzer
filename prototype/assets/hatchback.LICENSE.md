# hatchback.glb — licence and credit

- **Title:** 2020 Mazda 3 Hatchback
- **Author:** OUTPISTON (Sketchfab)
- **Source:** https://skfb.ly/pAOpM
- **Licence:** CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/

`hatchback.glb` is a derivative of that model, made with `tools/prepare-hatchback.mjs` (#236). In the game the car is called
"Hatchback"; the attribution above names the original work's title as the licence requires.

## Modifications

- Units and frame: scaled to 4.46 m length in metres, rotated so the front points along +x, origin on the axle midpoint, wheels on y = 0.
- The four wheels split into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the wheel centre, so they roll and steer.
- Simplified from ~473 000 to ~21 000 triangles (meshopt), compressed with `EXT_meshopt_compression`.
- All textures removed; the 26 original materials merged into eight by role (paint, glass, trim, head lamps, tail lamps, tyre, rim, interior).
- Chrome trims replaced by grey plastic; the paint is a white base with a mild gloss that the game tints.
- The windows are cheap see-through glass (alpha-blended, no transmission); the lamp glass is opaque and emissive.
- Badges and lettering removed: front emblem turned into a plain dark plate, rear emblem body-coloured and flush, rear lettering deleted, rim badges gone.
- Repainted: red by default, repaintable in the game.

This modified file stays under CC BY-NC-SA 4.0; the game stays non-commercial.
