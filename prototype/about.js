// about.js (#509): the About dialog's links and keyboard rules. Pure: no DOM, so node --test imports it.

export const ABOUT_LINKS = Object.freeze({
  midtown: 'https://en.wikipedia.org/wiki/Midtown_Madness',   // the article only: its screenshot is not free, never copy it
  osm: 'https://www.openstreetmap.org/copyright',
  swisstopo: 'https://www.swisstopo.admin.ch/',
  plattform: 'https://www.plattform-sisslerfeld.com/',
  threejs: 'https://threejs.org/',
  crashcat: 'https://github.com/isaac-mason/crashcat',
  leaflet: 'https://leafletjs.com/',
  altcha: 'https://altcha.org/',
  fonts: 'https://fonts.google.com/',
  aiInstructions: 'https://github.com/freaxnx01/ai-instructions',
  agentWorkflow: 'https://github.com/freaxnx01/agent-workflow',
  source: 'https://github.com/freaxnx01/game-rhyflitzer',
  glossary: 'https://github.com/freaxnx01/game-rhyflitzer/blob/main/docs/12-project-glossary.md',
});

const PASS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space']);

// like worldsKeyAction (startscreen.js): the dialog owns the keyboard while it is open
export function aboutKeyAction(e) {
  if (e.code === 'Escape') return 'back';
  return PASS.has(e.code) ? 'pass' : 'ignore';
}

// where Back leads: in a run the dialog sits over the paused game, otherwise over the start screen
export const aboutReturn = (inRun) => (inRun ? 'pause' : 'start');