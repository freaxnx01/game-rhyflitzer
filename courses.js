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

// the random draw (#1117): within `radius` m of the start, `minGap` m apart, length lo..hi x course 1's
export const RANDOM = Object.freeze({ radius: 4000, minGap: 300, lo: 0.75, hi: 1.25, tries: 200 });

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// the length in the order the arrow guides: always the nearest open checkpoint (stepRace), then the finish
export function nearestFirstLength(start, cps, finish, legLen) {
  let cur = start, total = 0;
  const left = [...cps];
  while (left.length) {
    let k = 0;
    for (let i = 1; i < left.length; i++) if (dist(cur, left[i]) < dist(cur, left[k])) k = i;
    const next = left.splice(k, 1)[0];
    total += legLen(cur, next);
    cur = next;
  }
  return total + legLen(cur, finish);
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function sixApart(points, start) {
  const six = [];
  for (const q of points) {
    if (dist(q, start) > RANDOM.radius || six.some((s) => dist(s, q) < RANDOM.minGap)) continue;
    six.push(q);
    if (six.length === 6) return six;
  }
  return null;
}

// deterministic for a given pool order and rng: the same seed gives every device the same course
export function randomCourse(pool, start, rng, legLen, ref) {
  for (let t = 0; t < RANDOM.tries; t++) {
    const six = sixApart(shuffled(pool, rng), start);
    if (!six) continue;   // the greedy pick follows the shuffled order: another order may well find six
    const cps = six.slice(0, 5).map(({ n, x, z }) => ({ n, x, z })), finish = (({ n, x, z }) => ({ n, x, z }))(six[5]);
    const len = nearestFirstLength(start, cps, finish, legLen);
    if (len >= RANDOM.lo * ref && len <= RANDOM.hi * ref) return { id: 'random', key: 'courseRandom', cps, finish };
  }
  return null;
}
