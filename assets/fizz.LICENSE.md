# fizz.glb — licence and credit

- **Title:** XYZ School - NY marathon - Coca-Cola truck
- **Author:** leslava (Sketchfab user leslava, https://sketchfab.com/leslava)
- **Source:** https://sketchfab.com/3d-models/xyz-school-ny-marathon-coca-cola-truck-ec3b1538e99848a39153c8533a5658ff
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`fizz.glb` is a derivative of that model, made with `tools/prepare-fizz.mjs`. In the game the truck is called "Rhy Fizz";
the attribution above names the original work's title as the licence requires. The model carries no brand, logo or lettering,
and the game adds none: the truck is a generic drinks truck. The game is a non-commercial fan project.

## Modifications

- Taken out of its diorama: the snowy base, the road and the trees removed.
- Units and frame: levelled by the tractor's wheel centres (the diorama is tilted by about 5°), scaled to metres (11 m long), the front along +x, the origin at the middle of the length, wheels on y = 0.
- The trailer, modelled bent as if in a curve, straightened section by section; its wheels moved with it and set square on their axles.
- The ten wheels moved into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL` … `wheel_RR4`) with the origin at the tyre centre, so they roll and steer.
- Added: fairy lights along the trailer's edges and round its tail, which light up with the head lamps, and two tail lamps.
- New plain materials in the original's colours, all double-sided; normals rebuilt, geometry compressed with `EXT_meshopt_compression`.
