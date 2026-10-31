# bus.glb — licence and credit

- **Title:** Mercedes+CITARO+II+RATP
- **Author:** moussasy.sy715 (Sketchfab, https://sketchfab.com/moussasy.sy715)
- **Source:** https://sketchfab.com/3d-models/mercedescitaroiiratp-93010eea7663482e8f1ca17168af6d8a
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`bus.glb` is a derivative of that model, made with `tools/prepare-bus.mjs` (#478). In the game the vehicle is called
"Regional Bus" and carries no maker or operator branding; the attribution above names the original work's title as the
licence requires. No endorsement by the author, the maker or the operator is implied.

## Modifications

- Units and frame: node transforms baked (inches to metres), rotated so the front points along +x, centred on the body, wheels on y = 0; a stray part beside the bus and the edge lines removed.
- The four wheels split into their own nodes (`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`) with the origin at the wheel centre, so they roll and steer; their geometry simplified to about a third.
- Repainted from the RATP livery to a Swiss regional bus look: yellow body, white roof, black window band, an added red stripe under the windows; all materials made non-metallic.
- Removed: the RATP logos, the "Entrée" door sticker, the maker's star emblems and the model and maker lettering front and rear.
- The destination display and the number plate textures replaced by new ones ("811 Sisseln", "AG · 4332").
- The head and tail lamp lenses got their own materials so the game can light them; compressed with `EXT_meshopt_compression`.
