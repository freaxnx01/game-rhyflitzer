# Border info popup — wireframe (#396)

Approved by the maintainer 2026-10-20 (phase 1). Opens on a double-click (touch: double-tap) on one of the two CH/DE border lines on the Holzbrücke deck; closes with Esc, ✕ or a click outside. The game pauses while it is open. The clicked line is highlighted at the top. DE and EN via `strings.js`.

```
┌───────────────────────────────────────────────┐
│  Landesgrenze auf der Holzbrücke           ✕  │
├───────────────────────────────────────────────┤
│  ▬ gelb  Neue Grenze – Rheinmitte             │
│          8,2 m näher bei Stein                │
│          Deutsch: 110 m der Brücke            │
│  ▬ weiss Alte Grenze – Talweg (seit 1808)     │
│          Deutsch: 102 m der Brücke            │
│                                               │
│  Neu vermessen von swisstopo und dem          │
│  Landratsamt Waldshut. Die Fridolinsinsel     │
│  liegt jetzt ganz in Deutschland.             │
│  Staatsvertrag Konstanz–Basel: Vernehmlassung │
│  2025.                                        │
│                                               │
│  Quellen: Aargauer Zeitung · Blick · swisstopo│
└───────────────────────────────────────────────┘
```

Sources (links in the popup, open in a new tab):

- Aargauer Zeitung, 2023-06-05: https://www.aargauerzeitung.ch/aargau/fricktal/bad-saeckingenstein-die-schweiz-verliert-terrain-die-deutsch-schweizerische-landesgrenze-verschiebt-sich-auf-der-holzbruecke-um-820-meter-richtung-stein-ld.2466800
- Blick, 2026-07-29: https://www.blick.ch/politik/das-steckt-hinter-dem-strich-auf-der-bruecke-deutschland-waechst-um-8-2-meter-auf-kosten-der-schweiz-id22143603.html
- swisstopo, 2025-06-25: https://www.swisstopo.admin.ch/de/einheitlicher-vertrag-soll-verlauf-und-unterhalt-der-staatsgrenze-mit-deutschland-regeln
