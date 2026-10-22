// #409: the enterable-buildings register -- one list of everything that will be enterable, with the markers' pure
// decisions. Pure: no DOM, no three.js. #410-#413 flip `ready` and add `ENTER_HANDLERS[id]`; this module stays as is.
// Privacy: names only the public address (Bodenackerstrasse 6c, Sisseln) and that a building will be enterable --
// nothing about who or what is inside, in any direction or storey, here or in any string.
import { foldText } from './landmarks.js';

export const KINDS = ['building', 'tower', 'hideout'];
export const GLOW_RANGE = 15;   // the entrance glows from here (on foot)
export const PROMPT_RANGE = 2.5;   // = WALKER.enterReach: from here the E prompt shows

export const ENTERABLE_INFO = [
  { id: 'bodenackerstrasse-6c', kind: 'building', name: { de: 'Bodenackerstrasse 6c', en: 'Bodenackerstrasse 6c' },
    gemeinde: 'Sisseln', landmark: 'Bodenackerstrasse 6c', building: 171822634, level: 'surface', ready: false, secret: false, entrances: [] },
  { id: 'plattform-sisslerfeld', kind: 'tower', name: { de: 'Plattform Sisslerfeld', en: 'Plattform Sisslerfeld' },
    gemeinde: 'Münchwilen', landmark: 'Plattform Sisslerfeld', anchor: 'plattform', level: 'surface', ready: false, secret: false, entrances: [] },
  { id: 'eiffel', kind: 'hideout', name: { de: 'Eiffelturm', en: 'Eiffel Tower' }, gemeinde: 'Münchwilen',
    landmark: 'Reservoir Hübel', room: 'eiffel', level: 'eiffel', ready: false, secret: true, entrances: [] },
  { id: 'atomium', kind: 'hideout', name: { de: 'Atomium', en: 'Atomium' }, gemeinde: 'Münchwilen',
    landmark: 'Reservoir Hübel', room: 'atomium', level: 'atomium', ready: false, secret: true, entrances: [] },
];

// the same position rules as landmarkEntries: at, then an anchors key, a room centre, or a building's ring mean
function ringMean(ring) { let x = 0, z = 0; for (const [px, pz] of ring) { x += px; z += pz; } return { x: x / ring.length, z: z / ring.length }; }

function sourcePos(item, anchors, roomCentres, byId) {
  if (item.at) return { x: item.at[0], z: item.at[1] };
  if (item.anchor) { const a = anchors[item.anchor]; return a ? { x: a.x, z: a.z } : null; }
  if (item.room) { const c = roomCentres[item.room]; return c ? { x: c[0], z: c[1] } : null; }
  const b = byId.get(Number(item.building));
  return b && b.ring && b.ring.length ? ringMean(b.ring) : null;
}

// rel: [along, across] on the entrance's own heading (th = the direction you walk in)
function absEntrance(e, p) {
  const { rel, ...rest } = e;   // rel is resolved away: the entrance becomes absolute
  if (!rel) return rest;
  const [a, b] = rel, fx = Math.cos(rest.th), fz = Math.sin(rest.th);
  return { ...rest, x: p.x + a * fx - b * fz, z: p.z + a * fz + b * fx };
}

export function enterableEntries(info, anchors, buildings, roomCentres) {
  const byId = new Map((buildings || []).map(b => [Number(b.id), b]));
  const found = [];
  for (const item of info) {
    const p = sourcePos(item, anchors || {}, roomCentres || {}, byId);
    if (p) found.push({ ...item, x: p.x, z: p.z, entrances: item.entrances.map(e => absEntrance(e, p)) });
  }
  return found;
}

// hideout objects stay secret (J filter, minimap, glow) until the hideout has been found
export const visibleEnterables = (entries, revealed) => entries.filter(e => revealed || !e.secret);

export function enterableName(entry, lang) {
  const n = entry.name || {};
  return n[lang] || n.en;
}

// the nearest ready entrance on the walker's level, within range: { entry, entrance, d } or null
export function nearestEntrance(entries, level, x, z, range) {
  let best = null;
  for (const e of entries) {
    if (!e.ready || e.level !== level) continue;
    for (const en of e.entrances) {
      const d = Math.hypot(x - en.x, z - en.z);
      if (d > range) continue;
      if (!best || d < best.d) best = { entry: e, entrance: en, d };
    }
  }
  return best;
}

export const enterPrompt = (near) => near && near.d <= PROMPT_RANGE ? { id: near.entry.id, key: 'KeyE' } : null;

// 0 at GLOW_RANGE, smoothstepped to 1 at PROMPT_RANGE and nearer
export function glowStrength(d) {
  const t = Math.max(0, Math.min(1, (GLOW_RANGE - d) / (GLOW_RANGE - PROMPT_RANGE)));
  return t * t * (3 - 2 * t);
}

const soon = (row, ready) => ready ? { ...row } : { ...row, soon: true };

// the J rows for the filter-on list, in J order: open entries as their landmark row (dimmed while none is ready),
// hideout objects as their own names once revealed -- until then the one plain landmark row, which names nothing
function enterableRows(jumpEntries, enterables, filter, revealed) {
  const vis = visibleEnterables(enterables, revealed);
  const rows = [];
  for (const r of jumpEntries) {
    const open = vis.filter(e => !e.secret && e.landmark === r.n);
    if (open.length) { rows.push(soon(r, open.some(e => e.ready))); continue; }
    const hidden = vis.filter(e => e.secret && e.landmark === r.n);
    if (hidden.length) { rows.push(...hidden.map(e => soon({ ...r, n: enterableName(e, filter.lang) }, e.ready))); continue; }
    if (enterables.some(e => e.secret && e.landmark === r.n)) rows.push({ ...r });
  }
  return rows;
}

// the J list: plain filtering when the chip is off (the same objects), the register's rows when it is on
export function jumpRowsFor(jumpEntries, enterables, filter, revealed) {
  const rows = filter.enterable ? enterableRows(jumpEntries, enterables, filter, revealed) : [...jumpEntries];
  const q = foldText((filter.q || '').trim());
  return rows.filter(e => (!filter.g || e.g === filter.g) && (!q || foldText(e.n).includes(q)));
}
