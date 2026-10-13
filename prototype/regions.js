// #127: the playable regions. Pure: no DOM, no three.js. Hochrhein is the default and keeps today's values exactly.
import { VILLAGES, VILLAGES_EHRENDINGEN, BORDER_DE } from './world.js';
import { GEMEINDEN, LANDMARK_INFO, GEMEINDEN_EHRENDINGEN, LANDMARK_INFO_EHRENDINGEN } from './landmarks.js';
import { STRINGS } from './strings.js';

export const DEFAULT_REGION = 'hochrhein';
export const REGIONS = {
  hochrhein: {
    id: 'hochrhein', name: 'Hochrhein', world: '../data/world_hochrhein.json', terrain: '../data/terrain_hochrhein.mmh',
    idbKey: 'terrain', bestKey: 'mm.best2', strings: { intro: 'intro', finished: 'finishedText', blurb: 'blurbOsm' },
    villages: VILLAGES, gemeinden: GEMEINDEN, landmarks: LANDMARK_INFO, borderDe: BORDER_DE,   // borderDe: German Gemeinde names that make a boundary line the national border (#73)
    motorwayRef: 'A3',   // #226: every motorway in this world is the A3
    treeBox: [-3100, 3100, -1800, 1900], forestAbove: 18, handFallback: true, openWoods: [[-1222, 166]],   // #214: the Fridolinsinsel is an OSM wood; its edge walls stopped the car on the bed, so the wood is dropped
  },
  ehrendingen: {
    id: 'ehrendingen', name: 'Ehrendingen', world: '../data/world_ehrendingen.json', terrain: '../data/terrain_ehrendingen.mmh',
    idbKey: 'terrain:ehrendingen', bestKey: 'mm.best2.ehrendingen',
    strings: { intro: 'introEhrendingen', finished: 'finishedEhrendingen', blurb: 'blurbOsmEhrendingen' },
    villages: VILLAGES_EHRENDINGEN, gemeinden: GEMEINDEN_EHRENDINGEN, landmarks: LANDMARK_INFO_EHRENDINGEN, borderDe: [],   // no national border inside this region
    treeBox: [-1520, 1840, -2225, 2065], forestAbove: 90, handFallback: false, openWoods: [],   // box = pipeline geo.EHRENDINGEN_BBOX in game metres; +90 m ≈ 495 m a.s.l. (spec A6)
  },
};

export function regionFromQuery(search) {
  const id = (new URLSearchParams(search).get('region') || '').toLowerCase();
  return id in REGIONS ? id : DEFAULT_REGION;
}

export function regionSearch(search, id) {
  const p = new URLSearchParams(search);
  p.delete('region'); p.delete('world');
  if (id !== DEFAULT_REGION) p.set('region', id);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/* #167: a generated world (?world=<id>, region editor) as a region. Everything comes from the world's `region` block
   (pipeline region.py, #166); the storage keys derive from the id, so worlds never share a best time or a terrain. */
export function generatedRegion(id, world) {
  const r = world.region, race = world.anchors.cps.length > 0;
  return {
    id: `world:${id}`, worldId: id, generated: true, name: r.name, world: null, terrain: null,
    idbKey: `terrain:world:${id}`, bestKey: `mm.best2.world.${id}`,
    strings: { intro: race ? 'introWorld' : 'introWorldFree', finished: 'finishedWorld', blurb: 'blurbOsmWorld' },
    villages: r.villages, gemeinden: r.gemeinden, landmarks: [], borderDe: [],
    jlist: r.jlist.map((e) => ({ n: e.n, g: e.g ?? r.name, x: e.x, z: e.z })),
    treeBox: r.treeBox, forestAbove: r.forestAbove ?? Infinity, handFallback: false, race,
  };
}
