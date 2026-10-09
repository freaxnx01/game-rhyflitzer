// #127: the playable regions. Pure: no DOM, no three.js. Hochrhein is the default and keeps today's values exactly.
import { VILLAGES, VILLAGES_EHRENDINGEN } from './world.js';
import { GEMEINDEN, LANDMARK_INFO, GEMEINDEN_EHRENDINGEN, LANDMARK_INFO_EHRENDINGEN } from './landmarks.js';

export const DEFAULT_REGION = 'hochrhein';
export const REGIONS = {
  hochrhein: {
    id: 'hochrhein', name: 'Hochrhein', world: '../data/world_hochrhein.json', terrain: '../data/terrain_hochrhein.mmh',
    idbKey: 'terrain', bestKey: 'mm.best2', strings: { intro: 'intro', finished: 'finishedText', blurb: 'blurbOsm' },
    villages: VILLAGES, gemeinden: GEMEINDEN, landmarks: LANDMARK_INFO,
    treeBox: [-3100, 3100, -1800, 1900], forestAbove: 18, handFallback: true,
  },
  ehrendingen: {
    id: 'ehrendingen', name: 'Ehrendingen', world: '../data/world_ehrendingen.json', terrain: '../data/terrain_ehrendingen.mmh',
    idbKey: 'terrain:ehrendingen', bestKey: 'mm.best2.ehrendingen',
    strings: { intro: 'introEhrendingen', finished: 'finishedEhrendingen', blurb: 'blurbOsmEhrendingen' },
    villages: VILLAGES_EHRENDINGEN, gemeinden: GEMEINDEN_EHRENDINGEN, landmarks: LANDMARK_INFO_EHRENDINGEN,
    treeBox: [-1520, 1840, -2225, 2065], forestAbove: 90, handFallback: false,   // box = pipeline geo.EHRENDINGEN_BBOX in game metres; +90 m ≈ 495 m a.s.l. (spec A6)
  },
};

export function regionFromQuery(search) {
  const id = (new URLSearchParams(search).get('region') || '').toLowerCase();
  return id in REGIONS ? id : DEFAULT_REGION;
}

export function regionSearch(search, id) {
  const p = new URLSearchParams(search);
  p.delete('region');
  if (id !== DEFAULT_REGION) p.set('region', id);
  const s = p.toString();
  return s ? `?${s}` : '';
}
