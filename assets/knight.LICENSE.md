# knight.glb — licence and credit

- **Title:** KITT - Knight Rider
- **Author:** thenerdybirdy (Sketchfab user thenerdybirdy, https://sketchfab.com/thenerdybirdy)
- **Source:** https://sketchfab.com/3d-models/kitt-knight-rider-60443abd88ef4cb7ab1df9ac5f622a36
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`knight.glb` is a derivative of that model, made with `tools/prepare-knight.mjs`. In the game the car is called "Rhy Knight";
the attribution above names the original work's title as the licence requires. The game is a non-commercial fan project and
shows no maker's badge and no number plate.

## Modifications

- Units and frame: scaled to a 2.565 m wheelbase in metres (4.85 m long), rotated so the front points along +x, the origin between the axles, wheels on y = 0.
- The tyres and hubcaps grouped into four wheel nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the tyre centre, so they roll and steer; set symmetric (the original's front tyres sat 2 cm out of line).
- The rear number plate ("KNIGHT", California) painted over in the body texture.
- The bumper lamps and the tail band split off the body by their texture colour, so they light up with the head lamps and the brakes.
- The static scanner strip kept as a dark backing, with eight new lens segments in front of it that the game lights in turn.
- The interior's photo textures and the normal maps removed; new plain materials, all double-sided. The body and the hubcaps keep their textures.
- Normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
