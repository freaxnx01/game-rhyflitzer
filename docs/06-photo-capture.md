# Photo capture

How to get real-world imagery for hero assets and facade textures, using a phone and a GoPro.

Two separate jobs:

| Job | Goal | Tool |
|---|---|---|
| Hero asset | 3D reference for a single landmark (e.g. Plattform Sisslerfeld, Holzbrücke) | Phone photogrammetry, optionally drone |
| Street capture | Facade textures for many ordinary buildings | GoPro (or 360 camera) from car or on foot |

## 1. Hero assets: photogrammetry

### Apps (Android)

- **RealityScan** (Epic, free): shows previous shots in AR around the object and aligns cameras live, so coverage gaps are visible while shooting. Processing in the cloud, export via Sketchfab.
- **Polycam** (free tier, full export paid): photo mode with capture guidance, works without LiDAR, exports GLB/OBJ.
- **Meshroom** (desktop, free, open source): process your own photos locally, no photo limit, no cloud. Preferred for self-hosting.

### Capture recipe for a tower / platform

1. 150–300 photos in three rings around the object at different heights, 60–80 % overlap between neighbouring shots.
2. Overcast day: no hard shadows, no blown-out sky.
3. Close-ups of details (railings, joints, stairs) in addition to the rings.
4. Upper parts can't be captured from the ground. A drone orbit at mid height and at the top fills the gap.

### Limits

- Thin steel lattice (viewing platforms, railings) photogrammetry handles badly: little surface, sky behind it. Scan the base, model the lattice by hand from measurements and photos.
- The raw scan (millions of triangles) is **reference only**. In Blender, retopologize a clean low-poly model and bake textures from the scan.

## 2. Street capture: GoPro for facades

### Camera choice

| Camera | Verdict |
|---|---|
| GoPro | Good. Timelapse photo mode gives sharp stills with GPS per shot. |
| Dash cam | Reference only. Forward-facing, fisheye, heavy compression, low resolution. Facades seen at grazing angles. |
| 360 camera (GoPro Max, Insta360) | Best for streets. One pass captures both sides. What Mapillary contributors use. |

### Settings

- Mode: **timelapse photo**, interval 0.5 s (car) or 1 s (walking)
- Lens: **Linear** (straight lines stay straight), not wide/fisheye
- **GPS on** (needed later to match photos to buildings)
- Aim: **sideways**, 90° to the driving direction, tilted up 10–15° to catch the roofline

### Mounting in the car

**Inside a rear side window** (default)
- GoPro suction cup mount with lever (official or copy, about CHF 20–40)
- Clean the glass inside and out first
- Rear window: nothing flies off, no wind shake, doesn't block the driver's view
- Main problem: reflections of the car interior. Put the lens right against the glass, or use a rubber lens hood or a black cloth around it

**Outside, on rear side window or door** (sharper)
- Suction mount plus a **safety tether** (every GoPro mount has a loop)
- No glass in the way, noticeably sharper images
- Fine at 20–30 km/h in town, not on the motorway

### Driving

- 20–30 km/h
- One pass per side: drive the street, turn around, drive it back. Or two cameras, one per side
- Overcast day or early morning: even light, fewer reflections, fewer people and cars

### On foot

- Hand-held or chest mount facing sideways, walk slowly along the facades
- The right method for old towns and narrow lanes (Bad Säckingen old town)

## 3. What to do with the imagery

1. **Facade textures** (main value): pick a sharp frame, correct the perspective, crop to one facade, use it as texture for the matching LoD2 building wall.
2. **3D of a short street segment**: extract 2–3 frames per second (`ffmpeg -i in.mp4 -vf fps=2 frames/%05d.jpg`), process with Meshroom or COLMAP. Works for short sections, not whole towns.
3. **Later, automated (v2+)**: use GPS position and heading of each photo to project it onto the right LoD2 walls in the pipeline. Capturing with GPS now keeps this option open.

## 4. Texture sources and their licences

| Source | Usable as game texture? | Notes |
|---|---|---|
| Own GoPro / phone captures | Yes | No strings attached. Preferred. |
| Mapillary | Yes, with conditions | CC BY-SA 4.0: attribution, and derived textures must carry the same licence. Fine for an open hobby project. |
| KartaView (formerly OpenStreetCam) | Yes, with conditions | CC BY-SA, same as Mapillary. |
| swisstopo SWISSIMAGE / LGL DOP20 | Yes, with attribution | Roofs and ground only (aerial). |
| **Google Street View / Maps** | **No** | Google's terms forbid extracting, storing, or making derivative works from the imagery. Screenshots as textures are a licence violation, and a public repo makes it visible. Use it only to look. |
| Bing Streetside, Apple Look Around | No | Same kind of terms. |

## 5. Legal (not legal advice, check before publishing)

- **Buildings from public ground**: generally allowed in both countries, including commercial use (Panoramafreiheit: CH Art. 27 URG, DE §59 UrhG).
- **People and number plates**: must be blurred or cropped before anything ends up in a public game or repo.
- **Mapillary**: uploaded images become openly licensed (CC BY-SA 4.0). Existing Mapillary imagery of the region can serve as reference.

## First test

One pass along the Sisseln Hauptstrasse with a GoPro on a rear side window. Check how many frames are sharp enough to texture ten houses.
