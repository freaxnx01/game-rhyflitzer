// startscreen.js (#346): pure helpers of the start screen and the Worlds dialog.
// No DOM, no three.js, so node --test imports it.

export const MODES = ['trial', 'blitz', 'hunt'];

// the mode the slot shows when nothing is focused: the last played one (localStorage mm.lastMode), validated
export function lastModeFrom(stored, raceless) {
  if (raceless) return 'hunt';
  return MODES.includes(stored) ? stored : 'trial';
}

export function modeTextKey(mode, regionStrings) {
  if (mode === 'blitz') return 'blitzIntro';
  if (mode === 'hunt') return 'huntIntro';
  return regionStrings.intro;
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
