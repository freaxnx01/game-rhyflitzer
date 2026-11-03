// startscreen.js (#346): pure helpers of the start screen and the Worlds dialog.
// No DOM, no three.js, so node --test imports it.

export const MODES = ['cruise', 'trial', 'blitz', 'hunt', 'view'];
// #551: a generated world without a race has no checkpoints, so only these two make sense there
const RACELESS_MODES = ['cruise', 'hunt'];

// #508: the viewpoint hunt needs a world with hand-picked viewpoints (viewpoints.js)
const allowedModes = (raceless, hasViewpoints) => (raceless ? RACELESS_MODES : MODES).filter(m => m !== 'view' || hasViewpoints);

// #551: the preselected mode: ?mode= when it names an allowed mode, else cruise (the default)
export function startModeFrom(search, raceless, hasViewpoints = false) {
  const wanted = new URLSearchParams(search).get('mode');
  return allowedModes(raceless, hasViewpoints).includes(wanted) ? wanted : 'cruise';
}

// the mode the slot shows when nothing is focused: the last played one (localStorage mm.lastMode), validated
export function lastModeFrom(stored, raceless, hasViewpoints = false) {
  return allowedModes(raceless, hasViewpoints).includes(stored) ? stored : 'cruise';
}

export function modeTextKey(mode, regionStrings) {
  if (mode === 'cruise') return 'cruiseIntro';
  if (mode === 'view') return 'viewIntro';
  if (mode === 'blitz') return 'blitzIntro';
  if (mode === 'hunt') return 'huntIntro';
  return regionStrings.intro;
}

// #551: the modes that race the five checkpoints and the finish
export function hasCheckpoints(mode) {
  return mode === 'trial' || mode === 'blitz';
}

// "Hochrhein Edition" for the two built-in regions; a generated world has an arbitrary name and gets it plain
export function editionText(region, tr) {
  return region.generated ? region.name : tr('edition', region.name);
}

// like carselKeyAction (carselect.js): the dialog owns the keyboard while it is open
export function worldsKeyAction(e, onRow) {
  if (e.code === 'Escape') return 'back';
  if (onRow && e.code === 'ArrowDown') return 'next';
  if (onRow && e.code === 'ArrowUp') return 'prev';
  if (e.code === 'Tab' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') return 'pass';
  // all game keys are ignored; browser defaults untouched
  return 'ignore';
}

// the localStorage key of a selection's best time, as regions.js derives it (generatedRegion: mm.best2.world.<id>)
export function bestKeyFor(sel, regions) {
  return sel.kind === 'region' ? regions[sel.id].bestKey : `mm.best2.world.${sel.id}`;
}
