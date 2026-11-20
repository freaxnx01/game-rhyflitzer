# manneken_pis.glb (prepared)

- **Model:** "177_ Manneken Pis In Brussels, Belgium" by **RascalFR**
- **Source:** https://sketchfab.com/3d-models/177--manneken-pis-in-brussels-belgium-fd4be588ea3d4a0fa349ae393a4f3b9f
- **Licence:** Creative Commons Attribution 4.0 (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/

Built by `tools/prepare-manneken.mjs` from the unmodified original at `assets/src/manneken_pis.glb` (#585). This is the
file the game loads, in the Atomium room of the Hübel hideout.

## Modifications

- the 8 scan meshes joined into one, welded and simplified from 694'026 to about 18'000 triangles
- scaled from the scan's units to metres at the bronze's real height of 0.61 m, the base's bottom on y = 0, the
  bounds centred on x = z = 0, the face towards +z
- the scan's material replaced by one own material `Bronze` (dark patinated bronze, metalness 0.6, roughness 0.45);
  normals recomputed smooth
- compressed with `EXT_meshopt_compression`
