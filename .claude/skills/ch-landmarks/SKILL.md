---
name: ch-landmarks
description: Lädt 3D-Gebäudemodelle aus swissBUILDINGS3D 3.0 (swisstopo) für Schweizer Landmarks wie die Holzbrücke Stein–Bad Säckingen oder Feldschlösschen Rheinfelden und baut sie als GLB ins Spiel ein. Verwenden, wenn ein Gebäude, eine Brücke oder ein Areal auf Schweizer Boden ins Spiel soll oder landmarks.yaml geändert wurde.
---

# CH-Landmarks: swissBUILDINGS3D → Rhyflitzer

Holt Gebäude aus den offenen 3D-Daten von swisstopo, wählt sie über Koordinaten aus,
prüft sie und legt sie als GLB in Spielkoordinaten ab. Nur Schweiz und Liechtenstein —
für die deutsche Rheinseite (Bad Säckingen) braucht es später eine eigene Quelle (LGL BW LoD2).

## Dateien

| Pfad | Rolle | Git |
|---|---|---|
| `landmarks.yaml` | Was geladen wird — pflegt der Mensch | ja |
| `landmarks.lock.json` | Aufgelöste Kachel, Prüfsumme, `gml:id` | ja |
| `assets/landmarks/<id>.glb` | Modelle im Spiel (`mode: block`) | ja |
| `assets/landmarks/index.json` | Ladeliste fürs Spiel inkl. Nullpunkt | ja |
| `blender/ref/<id>.ref.glb` | Massstabs-Käfig zum Nachmodellieren (`mode: hero`) | ja |
| `CREDITS.md` | Quellenangabe swisstopo (Pflicht) | ja |
| `.cache/geodata/` | Heruntergeladene Kacheln | **nein**, in `.gitignore` |

## Referenzierung in landmarks.yaml

```yaml
crs: EPSG:2056
origin: {e: 2640000, n: 1266000, h: 300}   # Spiel-Nullpunkt LV95, einmalig, nie ändern
landmarks:
  - id: holzbruecke-saeckingen
    select: {point: [2638590.49, 1266920.23]}
    expect: {typ: "Brücke gedeckt", roof_max: 296.56, tolerance_m: 1.0}
    mode: hero
```

- **`select.point`** — ein Punkt *auf* dem Objekt in LV95. Treffer = Objekt, dessen 2D-Grundriss den Punkt enthält (±0.5 m). Muss genau ein Objekt treffen.
- **`select.polygon`** — Areal in LV95; alle Objekte, deren Grundriss im Polygon liegt. Optional `egids: [...]` als zusätzlicher Filter.
- **`expect`** — Plausibilitätsprüfung; bei Abweichung wird nichts geschrieben:
  - `typ`: irgendein Attributwert des Objekts muss exakt (ohne Gross/Klein) passen
  - `roof_max`: höchster Punkt in m ü. M., Toleranz `tolerance_m`
  - `min_count`: Mindestanzahl Treffer (für Polygone)
- **`mode`** — `block` = direkt ins Spiel; `hero` = nur Referenz für Blender

Koordinaten liest der Mensch in map.geo.admin.ch ab (Statusleiste unten, LV95).
Die Werte für `typ` und `roof_max` zeigt dort der Klick auf das Objekt (Objekt-Information).

`gml:id` und EGID werden **nicht** als Schlüssel in landmarks.yaml verwendet: `gml:id` kann
sich zwischen Jahrgängen ändern, und Brücken haben keine EGID. Die aufgelöste `gml:id`
steht in `landmarks.lock.json`.

## Ablauf

1. **Abhängigkeiten** (einmalig):
   `pip install pyproj lxml shapely trimesh numpy requests pyyaml mapbox-earcut`
   Für `--draco` zusätzlich Node/npx (lädt `@gltf-transform/cli` bei Bedarf).
2. **Neuer Landmark:** Eintrag in `landmarks.yaml` ergänzen. Fehlen Koordinaten, den Menschen
   danach fragen — **niemals Koordinaten raten oder aus dem Gedächtnis einsetzen**.
3. **Immer zuerst prüfen:**
   `python .claude/skills/ch-landmarks/scripts/fetch_landmarks.py --config landmarks.yaml --only <id> --inspect`
   Ausgabe dem Menschen zeigen: Kachel, Treffer, Objekttyp (`Building`/`Bridge`/…), alle Attribute, Höhen.
4. **Kein Treffer oder `expect` verletzt:** nicht anpassen, bis es passt. Die Ausgabe listet die
   drei nächsten Objekte mit Abstand — dem Menschen zeigen und den richtigen Punkt bestätigen lassen.
   `expect` nur mit Werten befüllen, die aus `--inspect` oder dem Viewer stammen.
5. **Export:** gleicher Aufruf ohne `--inspect`, für `block` mit `--draco`.
6. **Prüfen:** Dreieckszahl in der Ausgabe, `index.json` angesehen, Modell im Spiel geladen.
7. **Commit:** `landmarks.yaml`, `landmarks.lock.json`, GLB, `index.json`, `CREDITS.md` —
   Conventional Commit, z. B. `feat(landmarks): add holzbruecke-saeckingen`.

Exit-Code ≠ 0 heisst: mindestens ein Landmark wurde nicht geschrieben. Nicht ignorieren.

## Datenquelle (STAC)

- Collection `ch.swisstopo.swissbuildings3d_3_0` auf `https://data.geo.admin.ch/api/stac/v0.9`
- Das Skript nimmt nur Items mit `geoadmin:variant: tiled` und CityGML-Asset
  (`application/x.gml+zip`), pro Kachel den neuesten Jahrgang.
  Die schweizweiten `fullcoverage`-Items (FileGDB, ganze Schweiz) werden bewusst ignoriert.
- Downloads werden per `checksum:multihash` (SHA-256) geprüft.
- STAC erwartet `bbox` in WGS84; das Skript rechnet aus LV95 um.

## Koordinaten im Spiel

`x = E − origin.e`, `y = H − origin.h`, `z = −(N − origin.n)` — Meter, Y-up, echte Rotation
(Winding bleibt erhalten). Die Geometrie ist bereits verschoben: im Spiel **ohne** zusätzliche
Position an `(0,0,0)` einhängen. Der Nullpunkt steht auch in `index.json → origin`.

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const { landmarks } = await (await fetch('assets/landmarks/index.json')).json();
for (const [id, lm] of Object.entries(landmarks)) {
  const gltf = await loader.loadAsync(`assets/landmarks/${lm.file}`);
  gltf.scene.name = id;
  scene.add(gltf.scene);
}
```

## Bekannte Grenzen

- **Brücken:** swissBUILDINGS3D liefert nur die Hülle (Dach + Wände), kein Fachwerk, keine
  Pfeiler. Darum `mode: hero` — die Hülle ist Massstab und Achsverlauf für das handmodellierte Asset.
- **Objekttyp:** Ob ein Objekt im CityGML als `Building` oder `Bridge` vorliegt, und wie das
  Attribut für den Typ heisst, beim ersten `--inspect` nachsehen statt annehmen.
  Befund Kachel 1049-33 (Jahrgang 2024, geprüft 2026-10-10): alle 1164 Top-Level-Objekte sind
  `Building`, es gibt kein `Bridge`. Der Typ steht im generischen Attribut `OBJEKTART`, die
  Werte sind ohne Umlaute geschrieben (`Bruecke gedeckt`, `Gebaeude Einzelhaus`) — der Viewer
  zeigt dagegen „Brücke gedeckt“. Die Dachhöhe steht in `DACH_MAX`.
- **Sammel-Objekte:** Die Holzbrücke ist kein eigenes Top-Level-Objekt, sondern ein
  `BuildingPart` (`ID_62E48E33-707A-4079-8CA2-B966E2A4E3D5`) in einem `Building` mit der
  `gml:id` `ID_`, das zusätzlich ein fremdes Gebäude 690 m weiter enthält. Das Skript wählt
  nur Top-Level-Objekte und mischt deren Attribute und Höhen (z bis 298.49 statt 296.56).
  Offen: Auswahl auf `BuildingPart`-Ebene.
- **Keine Texturen:** Modelle sind untexturiert; Materialien setzt das Spiel.
- **Normalen:** CityGML garantiert keine konsistente Orientierung. Bei Löchern im Mesh im Spiel
  `side: THREE.DoubleSide` setzen und melden.
- **Lizenz:** freie Nutzung mit Quellenangabe. `CREDITS.md`-Eintrag nie entfernen.

## Selbstverbesserung

Wenn du auf Blocker stösst, finde eine Lösung und halte sie in dieser Datei fest, damit der
nächste Lauf sie nicht neu herleiten muss. Davon ausgenommen und nie zu lockern: „niemals
Koordinaten raten oder aus dem Gedächtnis einsetzen“ und „`expect` nicht anpassen, bis es passt“.
