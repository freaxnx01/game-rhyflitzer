# Enterable buildings: marker, prompt, minimap, Jump filter - wireframe

Phase 1 of the UI workflow for #409 (epic #414). **Approved 2026-10-21.** Spec:
`docs/superpowers/specs/2026-10-21-enterable-buildings-register-design.md`.

J dialog, filter off and on (`[x]` = chip on):

```
 Jump to
 +--------------------------------------------+      +--------------------------------------------+
 | Search landmarks                           |      | Search landmarks                           |
 +--------------------------------------------+      +--------------------------------------------+
 [All][Bad Säckingen][Stein]...[Sisseln][Enterable]   [All][Bad Säckingen]...[Sisseln][x Enterable]
 Fridolinsmünster              Bad Säckingen          Plattform Sisslerfeld                   soon
 Holzbrücke                    Bad Säckingen          Bodenackerstrasse 6c                    soon
 ...                                                  Reservoir Hübel                      Münchwilen
 type to search · ↑↓ choose · Enter confirms · Esc    (after the hideout is found:
                                                       Eiffelturm / Atomium  Münchwilen)
```

(the `soon` rows are dimmed; "Enterable" is `Begehbar` in German)

On foot, at an entrance (bottom prompt line; the glow is a soft light on the door, 15 m out):

```
 far (> 15 m)         glow (15 m .. 2.5 m)          at the door (<= 2.5 m)
 +----------------+   +------------------------+    +------------------------+
 |                |   |                        |    |                        |
 |   [building]   |   |   [building]           |    |   [building]           |
 |    |  |        |   |    | ||  <- soft glow  |    |    | ||   (full glow) |
 |                |   |                        |    |                        |
 |                |   |                        |    |      E · Enter         |
 +----------------+   +------------------------+    +------------------------+
```

Minimap: `▯` door glyph (5 x 7 px) on the ready building, over the map, in the usual map yellow.

Flow (one line): foot on + ready entrance within 15 m -> glow; within 2.5 m -> prompt `E · Enter`; `E` -> handler of the entry (#411/#412), else toast.
