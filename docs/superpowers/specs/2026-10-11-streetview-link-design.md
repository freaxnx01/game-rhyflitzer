# F3 Street View link opens a black page (#212)

## Findings (2026-10-11, no dry run beyond the URL check)

- `streetViewUrl` in `prototype/debug.js` builds `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=LAT,LON&heading=H&pitch=0&fov=90`. For the issue's spot it produces `...viewpoint=47.553215,7.990035&heading=187&pitch=0&fov=90`. That is exactly Google's documented Maps URLs `map_action=pano` scheme (`viewpoint` required, `heading`, `pitch`, `fov` optional). The URL is **not malformed**.
- `curl` of the URL only reaches Google's consent wall (HTTP 302 to `consent.google.com`), so the rendering cannot be reproduced from the agent box. The black picture needs a real browser.
- The screenshot's resolved address bar is `google.com/maps/@47.553215,7.990035,0a,90y,187h,90t/data=!3m3!1e1!3m1!6shttps://streetviewpixels-pa...`. A normal Street View address carries a zoom like `3a,75y,...`; here it is `0a` and the pano is addressed by a thumbnail URL. Google found a position (pegman in Sisseln, minimap shows Hallenbad Sisslerfeld) but no loadable panorama. Two readings: no coverage on that private-looking street at that exact point, or Google's handling of `fov=90` and `pitch=0` as explicit overrides (`0a`).
- The heading convention is fine: `187` in the URL equals the debug panel's `187°`.

## Design

Make the link as tolerant as Google allows, keep the button, and do not guess further:

- Variant A (default): `viewpoint` plus `heading` only, dropping `pitch=0&fov=90` (both are Google's defaults, so nothing is lost, and the `0a` override goes away).
- Variant B (fallback if A still shows black): the older panorama URL `https://www.google.com/maps?layer=c&cbll=LAT,LON&cbp=0,HEADING,0,0,0`, which snaps to the nearest panorama.
- Test the final choice on two spots with certain coverage (Hauptstrasse Sisseln, Bahnhof Bad Säckingen) as well as the issue spot, to tell "URL wrong" from "no coverage here".

If every variant is black at the issue spot but works at the other two, the link is right and the spot has no coverage: close the issue with that note and keep the URL unchanged (then only the test and CHANGELOG tasks are dropped).

**Local-only: no** (code and tests only).
