# Data sources

Strategy: **OSM for structure** (roads, water, land use), **official geodata for buildings, roofs, terrain and aerial imagery** on both sides of the Rhine. Everything is converted once by a preprocessing script into an own tile format.

## OpenStreetMap

What we get:
- Roads: type, lanes, one-way, surface, bridges/tunnels (layer), sometimes width and speed limit
- Building footprints: sometimes levels, height, roof shape, color (patchy)
- Rhine, streams, forest, fields, railways, individual trees, POIs

What we don't get: facades, textures, reliable heights.

Source: Overpass API (one-time extract per region). License: ODbL (attribution required).

## Switzerland: swisstopo (free since 2021)

| Data | Product |
|---|---|
| Buildings with roof shapes | swissBUILDINGS3D |
| Terrain | swissALTI3D |
| Aerial imagery | SWISSIMAGE |

Delivered in 1 km tiles. Free with attribution.

## Germany: LGL Baden-Württemberg Open GeoData

| Data | Product |
|---|---|
| Buildings with standardized roof shapes (gabled, hipped, mansard, shed, pyramid); no dormers, no facade textures | 3D-Gebäudemodell LoD2 (CityGML, 2 × 2 km tiles) |
| Terrain / surface | DGM / DOM, various resolutions |
| Aerial imagery | DOP20 (20 cm ground resolution) |

License: Datenlizenz Deutschland – Namensnennung 2.0 (attribution: "Datengrundlage: LGL, www.lgl-bw.de").

Size reference: about 50 MB CityGML for an average municipality with 5,000 buildings; far less after conversion to a compact binary format.

Portal: https://opengeodata.lgl-bw.de/

## Textures

No open facade data exists on either side.

- **Roofs and ground**: aerial imagery (sampled colors or direct texture)
- **Facades**: procedural, based on CC0 materials (Poly Haven, ambientCG): plaster, sandstone, half-timbering, shutters
- **Hero assets**: hand-built in Blender, own photos / photogrammetry as reference

## To verify before building

- Current license terms of all sources, and attribution requirements in the game credits
