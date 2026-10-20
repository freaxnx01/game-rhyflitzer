# Border info popup — flow (#396)

Approved by the maintainer 2026-10-20 (phase 2). Wireframe: [wireframe.md](wireframe.md).

**Key rule:** a double-click / double-tap on `#gl` already beams the car (#165). The border lines are picked **first**; only when the ray misses them does the beam run, unchanged.

## User journey

```mermaid
flowchart TD
  A[Double-click / double-tap on the game view] --> B{Other view open?<br/>pause, jump list, help, start screen}
  B -- yes --> X[do nothing]
  B -- no --> C{Ray hits a border line?<br/>border lines are tested first}
  C -- no --> D[as today: beam to the spot]
  C -- yes, yellow or white --> E[game paused, keys released]
  E --> F[info popup open<br/>clicked line highlighted]
  F --> G{Close?}
  G -- Esc / ✕ / click outside --> H[popup closed, game runs on]
  G -- source clicked --> I[article opens in a new tab<br/>popup stays open]
  I --> F
  F -- language switched --> F
```

## Components and state

```mermaid
flowchart TD
  subgraph pure[holzbruecke.js · pure, node-testable]
    P1[line positions<br/>102 m / 110 m from the Säckingen end]
  end
  subgraph idx[index.html]
    M[two line meshes<br/>always visible]
    PK[borderPick: ray against the two line meshes only]
    DC[double-click handler on #gl<br/>and double-tap handler for touch]
    BI[BORDERINFO state<br/>open? which line?]
    DL[#borderinfo panel in the DOM<br/>like #jump / help]
    BM[beamTo · unchanged]
  end
  ST[strings.js · DE/EN texts]
  P1 --> M
  DC --> PK
  PK -- hit --> BI
  PK -- miss --> BM
  BI --> DL
  ST --> DL
  DL -- Esc / ✕ / outside --> BI
```

## Screen inventory

- No screen beyond the popup; sources are external links in a new tab.
- No error or empty states: the texts are static in the game, nothing is loaded.
- While open the game is paused like the jump list (J); it does not switch to the pause menu.
