# Every village and its station in the J list, CH and DE apart (#782)

## Why

Playtest 2026-11-09: the Bahnhof Frick stands in the world since PR#769 (#761) but J cannot reach it. Nine of the fifteen
places in the Hochrhein world are not in the J list at all, because `landmarks.js` `GEMEINDEN` only knows six. New players
(e.g. NFZ readers) are local: they look for *their* village first. The world straddles the Rhine, so the list
should show which side a place is on.

## Decision (maintainer, 2026-11-09)

- Every village in the world gets a Gemeinde chip in J, with at least a **village-centre** entry and its **station** where it
  has one. Existing Gemeinden keep their entries; they get no extra centre entry.
- **CH and DE apart, as two chip rows** (chosen from three mockups): the row with `All` and `Enterable` as today, then a row
  labelled `CH` with the Swiss Gemeinden, then a row labelled `DE` with the German ones. Each list row shows its Gemeinde and
  country, e.g. `Frick · CH`.

## Measured (2026-11-09)

OSM `place=*` nodes in the world bbox, their Gemeinde (OSM `admin_level=8` relation containing the node), the game point
(`geo.Frame` at the world origin) and the nearest jumpable road (not a bridge, not a motorway; `index.html` `jumpable`):

| Place | Country | Gemeinde (OSM) | Game point (x, z) | Nearest road |
|---|---|---|---|---|
| Wallbach (village) | DE | Wallbach (Stadtteil of Bad Säckingen) | (-3984.9, -1744.8) | 8 m, Rheinstraße |
| Lohnberg (hamlet) | CH | **Zuzgen** | (-3721.1, 2697.5) | 5 m |
| Mumpf | CH | Mumpf | (-3484.8, 596.6) | 4 m, Hintere Dorfstrasse |
| Hellikon | CH | Hellikon | (-3142.8, 4582.5) | 26 m, Im Baumgarten |
| Obermumpf | CH | Obermumpf | (-2160.9, 2378.8) | 20 m, Mühlacker |
| Oeschgen | CH | Oeschgen | (3788.1, 3471.3) | 3 m, Schulgasse |
| Frick | CH | Frick | (4040.6, 4762.8) | 8 m, Zwidellen |
| Murg | DE | Murg | (4361.6, -689.8) | 14 m, Langmattstraße |
| Rothaus (hamlet) | DE | Murg | (2581.9, -838.3) | 5 m |

Stations not yet in J:

| Station | OSM | Source for J |
|---|---|---|
| Bahnhof Frick | building w164951714 (in the world file) | `building: 164951714` |
| Bahnhof Mumpf | building w1556606688 (in the world file) | `building: 1556606688` |
| Murg (Baden) | halt n3255719712, no building | `at: [3877.0, -347.8]` (29 m from the Hauptstraße) |

Wallbach has **no station**: `CH-Wallbach` and `D-Wallbach` in OSM are Rhine **ferry terminals**. Wallbach AG (the Swiss
village) lies outside the world bbox; only its ferry landing is inside. Neither goes in.

## Design

### Data (`landmarks.js`)

- `GEMEINDEN` (west → east by the place node's x; the existing six keep their relative order):
  `['Wallbach', 'Zuzgen', 'Mumpf', 'Hellikon', 'Obermumpf', 'Bad Säckingen', 'Stein', 'Münchwilen', 'Schupfart', 'Eiken',
  'Sisseln', 'Oeschgen', 'Frick', 'Murg']`.
- New `export const GEMEINDEN_DE = ['Wallbach', 'Bad Säckingen', 'Murg']`. Every other Gemeinde is Swiss.
- New `LANDMARK_INFO` entries, appended to their Gemeinde's block (order inside a Gemeinde = table order):

| name | gemeinde | source |
|---|---|---|
| Dorfzentrum Wallbach | Wallbach | `at: [-3984.9, -1744.8]` |
| Lohnberg | Zuzgen | `at: [-3721.1, 2697.5]` |
| Dorfzentrum Mumpf | Mumpf | `at: [-3484.8, 596.6]` |
| Bahnhof Mumpf | Mumpf | `building: 1556606688` |
| Dorfzentrum Hellikon | Hellikon | `at: [-3142.8, 4582.5]` |
| Dorfzentrum Obermumpf | Obermumpf | `at: [-2160.9, 2378.8]` |
| Dorfzentrum Oeschgen | Oeschgen | `at: [3788.1, 3471.3]` |
| Dorfzentrum Frick | Frick | `at: [4040.6, 4762.8]` |
| Bahnhof Frick | Frick | `building: 164951714` |
| Dorfzentrum Murg | Murg | `at: [4361.6, -689.8]` |
| Bahnhof Murg (Baden) | Murg | `at: [3877.0, -347.8]` |
| Rothaus | Murg | `at: [2581.9, -838.3]` |

  J already lands on the jumpable road nearest an entry's point (`index.html` `jumpTo` → `nearestJumpable`), so no `jump`
  spot is needed. `LANDMARK_INFO` grows from 33 to 45.
- New pure helper `chipRows(gemeinden, de)`: splits the present Gemeinden (in their west → east order) into
  `[{ country: 'CH', gemeinden: [...] }, { country: 'DE', gemeinden: [...] }]`, dropping an empty row. With `de` empty it
  returns one row with `country: null` (no label), which is today's look.

### Region wiring (`regions.js`)

- Hochrhein gets `gemeindenDe: GEMEINDEN_DE`; Ehrendingen and generated regions get `gemeindenDe: []`, so their J dialog stays
  exactly as today (one unlabelled chip row, no country suffix in the list).

### J dialog (`index.html` `renderJump`)

- **J mode only.** The drive (O) and navi (I) modes keep their single `placeChips` row unchanged.
- Chip markup: the `All` chip and the `Enterable` chip first, then one row per `chipRows` entry: a small label (`CH` / `DE`,
  not translated, same in both languages) followed by that row's Gemeinde buttons. Buttons keep `data-g` and the click
  handler unchanged, so filtering works as before.
- List rows: the right-hand label becomes `<Gemeinde> · <CH|DE>` when the region has a `gemeindenDe` list, for **every row
  whose `g` is a Gemeinde of the region** (including the rows `jumpRowsFor` builds under the Enterable chip). Rows without one
  keep their label: the random spot (`g: null`), a `soon` row (`enterableSoon`), a street row (`streetIn`).
- The Enterable chip moves from after the Gemeinde chips to the first row, after `All`. Tests locate it by `data-enterable`;
  `tests/test_jump.py` line ~97, which asserts the chip text order `CHIPS + ["Enterable"]`, is updated to the new order.
- CSS: each country row is its own flex line (`flex-basis: 100%` wrapper), the label dimmed (`#8b93a3`), fixed width so the
  buttons line up. It must still fit at phone width (wraps inside the row).

## Non-goals

- No new buildings, models or station markers; the entries point at what the world already has.
- No change to the village signs, the national border line (`BORDER_DE`), or the drive/navi chips.
- No `Dorfzentrum` entries for the six Gemeinden that already have entries.
- No Wallbach station (there is none) and no Wallbach AG (outside the world).

## Calls made by the designer (check these)

- **Wallbach as its own chip**, although it is a Stadtteil of Bad Säckingen: it is its own village on the ground and in the
  approved mockup.
- **Lohnberg under Zuzgen**, not as its own chip and not under Mumpf: OSM puts it in the Gemeinde Zuzgen. Zuzgen's village is
  outside the world, so Zuzgen's chip has only Lohnberg.
- **Rothaus under Murg** (OSM Gemeinde Murg).
- Names: `Dorfzentrum <Ort>` (searchable by the village name, since search only matches the entry name), stations
  `Bahnhof <Ort>`, the Murg halt `Bahnhof Murg (Baden)` after its OSM name.
- `CH` / `DE` labels are not translated.

## Acceptance

- `GEMEINDEN`, `GEMEINDEN_DE` and the 12 new `LANDMARK_INFO` entries as above (node tests); every Gemeinde has at least one
  entry; every `building` id exists in `data/world_hochrhein.json` (node test).
- `chipRows` splits CH/DE in west → east order, drops an empty row, and returns one unlabelled row without a DE list (node).
- In the Hochrhein world, J shows a `CH` row and a `DE` row; clicking `Frick` lists Dorfzentrum Frick and Bahnhof Frick with
  `Frick · CH`; Enter on Bahnhof Frick puts the car within 60 m of the station building (Playwright, `tests/test_jump.py`).
- Ehrendingen's J dialog is unchanged (existing tests stay green).
- Existing J tests updated only where they pin the old chip list or the entry count.
