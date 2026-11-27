// courses.js (#1117): the race courses -- the region's own course plus four more on the Hochrhein, the rotation,
// the best-time keys and the seeded random draw. Pure: no DOM, no three.js, so node --test imports it.
// Coordinates are game metres of the OSM world (data/world_hochrhein.json), measured 2026-11-27 (spec table).
export const COURSE_STORE = Object.freeze({ mode: 'mm.courseMode', idx: 'mm.courseIdx' });
export const COURSE_MODES = ['turn', 'random'];
export const courseModeFrom = (stored) => (stored === 'random' ? 'random' : 'turn');

const p = (n, x, z) => ({ n, x, z });
const BAHNHOF_SISSELN = p('Bahnhof Sisseln', 1938.5, 530.4), SISSLERFELD = p('Sisslerfeld', 88.9, 406.4);
const GETEC = p('GETEC Park Stein', -563.9, -431.8), STEIN_DORF = p('Stein Dorf', -934.7, 520.7);
const BAHNHOF_STEIN = p('Bahnhof Stein-Säckingen', -1368.2, 988.3), PLATTFORM = p('Plattform Sisslerfeld', 330.0, 418.6);
const REF_KIRCHE = p('Reformierte Kirche Stein', -1178.0, 795.9), GALLUSTURM = p('Gallusturm', -1254.8, -408.5);
const SMILE = p('Smile-Kreisel', 1270.0, -148.0);

export const HOCHRHEIN_COURSES = [
  { id: 'eiken', key: 'courseEiken', cps: [p('LANDI-Turm', 1832.7, 627.7), p('Bahnhof Eiken', 1709.8, 1936.5), p('Güggeli-Foodtruck', 1921.6, 2249.8), PLATTFORM, REF_KIRCHE], finish: GALLUSTURM },
  { id: 'twoBridges', key: 'courseTwoBridges', cps: [SMILE, SISSLERFELD, GETEC, GALLUSTURM, REF_KIRCHE], finish: p('Schloss Schönau', -1378.0, -5.6) },
  { id: 'mumpf', key: 'courseMumpf', cps: [SMILE, PLATTFORM, STEIN_DORF, BAHNHOF_STEIN, p('Dorfzentrum Mumpf', -3484.8, 596.6)], finish: p('Bahnhof Bad Säckingen', -1381.9, -558.6) },
  { id: 'bergsee', key: 'courseBergsee', cps: [p('Straussenfarm Sisseln', 2345.0, -318.0), BAHNHOF_SISSELN, PLATTFORM, STEIN_DORF, p('Aqualon Therme', -1996.1, -1083.2)], finish: p('Bergsee', -2281.8, -2179.9) },
];

// the region's own course first; the four Hochrhein courses only on the OSM Hochrhein world (the hand fallback uses other coordinates)
export function courseList(regionId, osm, cps, finish) {
  if (!cps.length) return [];
  const own = { id: 'classic', key: 'courseClassic', cps, finish };
  return regionId === 'hochrhein' && osm ? [own, ...HOCHRHEIN_COURSES] : [own];
}

// the index after the stored one (the last course started), wrapping; 0 when nothing valid is stored
export function nextCourseIndex(stored, count) {
  const n = Number(stored);
  const valid = stored !== null && stored !== '' && Number.isInteger(n) && n >= 0 && n < count;
  return valid ? (n + 1) % count : 0;
}

// course 1 keeps today's key, so no stored best time is lost; a random course has none
export function courseBestKey(baseKey, id) {
  if (id === 'random') return null;
  return id === 'classic' ? baseKey : `${baseKey}.${id}`;
}
