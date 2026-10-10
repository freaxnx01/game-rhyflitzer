# Only the side windows are dark (#225) — design

Status: enriched 2026-10-10 (`--quick`). Playtest entry 23 of `docs/ai-notes/feedback/2026-10-10-playtest.md`.

## Finding: already fixed on `main` by #183

The tester's two screenshots (`entry-23-windows-1.jpg`, `-2.jpg`, timestamps 13h09 local) show the **old box-shaped compact**
(hard edges, flat painted roof, no glass on windscreen or rear). #183 (lofted realistic compact, #164) merged at **16:38 local**,
about 3.5 h after the screenshots. The triage note "#164 is not merged" was written before that merge.

Verified 2026-10-10 on `main` @ `cda3b21`:

- Node probe on `loftBody(COMPACT)`: glass triangles exist on the windscreen span (`x` about 0.15 to 0.85, `|z| < 0.62`, 4 tris),
  on the rear window (`x` about -2.15 to -1.35, 8 tris) and on the door glass (about 60 tris).
- Headless render (800x450, real world), chase view and **B** look-back: the rear window and the windscreen are dark glass,
  same colour as the side windows (`__mm.glass()` returns colour 0x0b0f14, opaque, for car and helicopter).

So there is no code defect left. What is missing is a guard: `carbody.test.mjs` only checks that *some* span has `top` and *some* has
`side` (line `assert.ok(st.some(s => s.span?.top) && st.some(s => s.span?.side), 'some glass')`), and `loftBody` is only tested for
`glassIndices.length > 0`. A later station edit could drop the windscreen and every test would stay green, which is exactly what
the tester saw on the old body.

## Decision

[needs maintainer] Close #225 as "fixed by #183" (no work), or land the small regression guard below. The plan implements the guard;
if the maintainer prefers closing, skip the plan. Either way: re-check on the deployed build first (the old screenshots predate the fix).

## Guard

One Node test in `prototype/tests/carbody.test.mjs`, no browser, no production code change: from `loftBody(COMPACT)`, classify each glass
triangle by its centroid. Require at least one glass triangle on the top half (|z| < 0.62, y above the belt) forward of the cabin
(`x > 0`, the windscreen), one behind it (`x < -1.3`, the rear window) and one on the side (|z| >= 0.62, the door glass).
