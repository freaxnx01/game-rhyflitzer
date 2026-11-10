# Sign poles must not stick out above or through the panel (#822)

## Problem
Tester: "Bei Verkehrstafeln soll die Stange nicht über die Tafel ragen". Every pole is a grey cylinder of radius 0.05 m
(poles are also in front of / through the panel face because panels sit at only +-0.02 m).

## Audit (code read, no dry run)
| Builder | Where | Pole | Panel | Flaw |
|---|---|---|---|---|
| `roadSign` Fahrverbot | index.html:1828-1841 | 0..2.6, axis z=0 | disc, centre 2.1, size 0.9 (visible top ~2.54) | pole top 2.6 above the disc; pierces face (panel z=+-0.02 < r 0.05) |
| `roadSign` Baustelle | same | 0..2.6 | triangle, centre 2.15, size 1.0; apex 10/256 below texture top = 2.611; half-width 0.536 per m below the apex | pole 5 cm wider than the tip, shows beside it; pierces face |
| `signW` place-name board | ~2218 | 2 poles 0..3.0 at x=+-0.9, z=0 | box 2.4x1.2x0.08, centre 2.4 (top 3.0) | pole top flush with the board top (z-fight cap), radius 0.05 > half depth 0.04 so the pole pokes 1 cm out front and back |
| `parkingSign` | ~2084 | 0..2.6 at the board axis | plane 0.7, centre 2.3 | pole passes through the plane (shows in front of the P) |
| `crashSign` | ~2150 | r 0.06, 0..2.8 | plane 2.6x0.9, centre 2.5 (top 2.95) | pole passes through the plane |
| `speedDisplayBuild` | ~2188 | 0..2.8 | housing 0.8x1.2, centre 2.2 (top 2.8), depth 0.12 | pole top coplanar with the housing top (cap z-fight); pole inside the housing otherwise OK |
| `busStop` (#795, landed) | ~2133 | inverted U: legs at x=0 and x=-1, sign at x=-0.5 w 0.9 | sign spans -0.95..-0.05 | none: legs are beside the sign by design, the bar is a frame, not a pole |
| #797 signs | not built yet | | | must use the new helper |
Out of scope (not signs): cave lamp posts (~1954, pole + lamp head).

## Design
New pure module `signpole.js` (no THREE):
- `POLE_R = 0.05`, `FACE_GAP = 0.06` (panel centre offset from the pole axis: radius + 1 cm, so the pole sits behind the panel).
- `poleTop(panel, r = POLE_R, margin = 0.02)` returns the highest y the pole may reach so it is fully hidden behind the panel:
  - `{shape:'rect', y, h}`: `y + h/2 - margin`.
  - `{shape:'disc', y, d}` (visible diameter d): the chord of half-width `r + margin/2` : `y + sqrt((d/2)^2 - (r + margin/2)^2) - margin`.
  - `{shape:'tri', apex, slope}` (visible apex y, half-width per metre of height): `apex - (r + margin/2) / slope - margin`.
- `signPanelZ(back) = back ? -FACE_GAP : FACE_GAP`.
Builders compute pole height from `poleTop` (pole base stays at ground), panels move to +-FACE_GAP. No visible look change except the pole no longer showing above or in front of the sign.

Alternatives rejected: shrinking the pole radius (still pierces at 0.02 m; a thin pole looks wrong); hiding the pole above with a cap (the tip would still show beside a triangle).

## Assumptions
- **A1** [high] Fix lives in all sign builders that carry a pole, not only `roadSign`. Rejected: roadSign only. The audit table shows the same flaw in `signW`, `parkingSign`, `crashSign`, the speed display; the AC says "every road sign".
- **A2** [high] Pole stays at its axis and the panel moves forward (+0.06), instead of moving the pole. Rejected: moving the pole back (changes every sign's collision/placement origin, `ROAD_SIGNS` x/z).
- **A3** [med] `signW` poles move behind the board (z=-0.09) and stop 5 cm below the top, since the box is only 0.08 deep. Rejected: leaving them in the box at z=0 (the radius 0.05 exceeds the half depth 0.04).
- **A4** [med] The speed display pole just ends 5 cm below the housing top (no layout change); `SPEED_DISPLAY` config is untouched.
- **A5** [high] The PostAuto stop (#795) is left alone. Rejected: touching `busstop.js`: legs stand beside the face and #795 is merged.
- **A6** [med] Test is a `node --test` unit test of the helper plus a source-level check of the builder constants is not done; the builders are covered by the manual playtest. Rejected: Playwright (no dry runs; too slow).

## Consequences
- Pole looks 2 to 10 cm shorter on road signs; the back face of a two-sided panel now sits 6 cm behind the front instead of 4 cm.
- Collision: none of these poles has an OBB (`roadSign`, `parkingSign`, `crashSign`); unchanged.
- #797 (speed-limit, place signs) should use `poleTop`; mention in its enrich.
