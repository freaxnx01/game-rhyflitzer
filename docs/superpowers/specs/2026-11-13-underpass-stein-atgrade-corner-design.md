# #844 Stein underpass: no trough-wall run end at an at-grade corner (design, re-enrichment)

Supersedes `2026-11-11-underpass-stein-south-wall-stub-design.md`. PR#886 implemented that spec and was closed: it removed
the wrong piece (the main road's stub) and its rule A3 ("drop a piece where its own road is not lowered") dropped walls at
~40 sites, opening 1.88 m cut faces at Kapfstrasse.

## Measured cause (headless, GPU browser, main `e3d35fd`, 2026-11-13)

South of Stein the main road w107160628 (road 914, w 5.5) runs south into its rail underpass. Its cut starts shallow:
cutDepth 0.23 m at z 1177.9, 0.65 at z 1181.8, 1.24 at z 1185.4, 2.87 at z 1190. The service road w1216639317 (road 2959,
w 4.0, (-883.3, 1181.8) -> (-948.5, 1180.8)) leaves it westwards at z 1181.8 and is lowered 0.8-1.1 m along its first metres.

Two trough-wall pieces stand at the at-grade corner north of the service road's mouth, at the main road's west edge:

| piece | road | centre | len | floor / top |
|---|---|---|---|---|
| east end of the service road's north run (`side` 1) | 2959 | (-887.91, 1177.73) | 2.03 | 18.80 / 20.58 |
| end of the main road's west run (the "stub") | 914 | (-887.64, 1177.95) | 1.00 | 18.83 / 20.62 |

Both are built by `troughPiece` (`index.html:2740`), called from the run loop at `index.html:2735`. Neither is filtered by
`index.html:2748`, because the service road's cut lowers their band.

On the tester's line (`(-881.7, 1143.9)`, 188 deg, 50 km/h, gas held) `__mm.sim` hits them at (-885.82, 1175.92): speed
26.0 -> 5.0 m/s in 0.1 s. PR#886 removed only the stub and the car still hit the service road's piece (26.3 -> 4.0 m/s at
(-886.2, 1175.95), comment on #844).

## Design

A trough-wall piece is dropped (recorded in `SLOPES`, no box, no collider) when **all** hold:

1. it is the end piece of its run (within half a station of `t0` or `t1`);
2. the run is stopped there by another road (the point 0.3 m past the end lies in another road's corridor + slack, the
   same test `runCorners` uses, `index.html:2764-2767`);
3. at that corner one of the two roads is at grade: `cutDepth` <= 0.1 at the run road's point at `t`, or at the other road's
   nearest point.

This is the rule of the maintainer's experiment branch `pr886-exp-atgrade-corner` @ 83d6997, re-measured on current main
with PR#886's `SLOPES` / `openCutFaces` changes:

- `SLOPES`: 5 pieces at 3 sites: both Stein pieces, (-976.92, 1213.77), and (3456.01, 4130.36) + (3460.35, 4138.26).
- `__mm.openCutFaces()`: `count` 0, `slope` 37, `slopeMax` 0.81 m (at Stein; every other slope point <= 0.5 m).
- Tester line, 188 deg: no drop until z 1183.29, where it meets the real cut's wall (cut 1.24 m deep).
- Lane line (lane centre `(-880.45, 1143.9)`, 186.4 deg): no drop through z 1231.
- Kept: the main road's west run in the real cut (-888.54, 1185.99), its `runCorners` piece (-888.15, 1185.4), the service
  road's next north piece (-889.94, 1177.70) and its whole south run.

`runCorners`, `cornerPiece`, `wallSpans`, `UNDERPASS`, `cutNetwork` and the arm grades stay unchanged.

## Testing

`tests/test_underpass.py`: one new test for the Stein corner (walls, slopes, the two drive lines) and the slope bound in
`test_no_open_cut_faces` (world-wide `slopeMax` <= 1.0, Stein's pieces among `__mm.slopes()`), plus a Kapfstrasse guard
(both walls PR#886 dropped stay). The PR#886 assertion "every slope point within 3 m of the stub" is not carried over.

`test_every_underpass_has_headroom` is red on main already (PR#886 CI, #844 comment) and is out of scope.
