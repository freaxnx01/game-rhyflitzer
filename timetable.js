// timetable.js (#801): what the timetable view shows -- the lines of the net, the next departures at one stop and
// a line's directions with their runs. Pure: no DOM, no three.js; node --test only.
// Trips are the #500 cut (data/timetable_hochrhein.json): calls [uic, arr, dep] in seconds after midnight of the
// service day, `toOutside` when the trip drives on past the map edge.
import { tripKey } from './postauto.js';

export const TIMETABLE ={ runs: 4, rows: 4, soon: 3600, reachFoot: 2.5, reachCar: 6, reachSpeed: 2 };

const DAY = 86400;
const byLine = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const wrap = (secs) => ((secs % DAY) + DAY) % DAY;

// every line of the net, lowest number first; never a hardcoded 133/143 (#808 adds more)
export function lineIds(trips) {
  return [...new Set(trips.map((t) => String(t.line)))].sort(byLine);
}

// the lines that call at this stop at all -- an arrival counts, so a terminus still lists its line
export function stopLines(trips, uic) {
  const key = String(uic);
  return [...new Set(trips.filter((t) => t.calls.some((c) => String(c[0]) === key)).map((t) => String(t.line)))].sort(byLine);
}

// a call is a departure unless it is the last call of a trip that ends inside the map (then it is an arrival)
function departsAt(trip, index) {
  return index < trip.calls.length - 1 || !!trip.toOutside;
}

// the rows of a stop's view: the next `count` departures, then the next one of every line + destination not yet among
// them (A10), so a rare line still shows. `wait` wraps over midnight; `dep` is the time of day.
export function stopDepartures(trips, uic, now, count = TIMETABLE.rows) {
  const key = String(uic), all = [];
  for (const trip of trips) {
    trip.calls.forEach((call, i) => {
      if (String(call[0]) !== key || !departsAt(trip, i)) return;
      all.push({ line: String(trip.line), to: trip.to, dep: wrap(call[2]), wait: wrap(call[2] - now) });
    });
  }
  all.sort((a, b) => a.wait - b.wait);
  const rows = all.slice(0, count), seen = new Set(rows.map((r) => `${r.line}|${r.to}`));
  for (const row of all) {
    const id = `${row.line}|${row.to}`;
    if (seen.has(id)) continue;
    seen.add(id); rows.push(row);
  }
  return rows;
}

// ---------- the run columns of a line view ----------
const lastArrival = (trip) => trip.calls[trip.calls.length - 1][1];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// the next run of a direction (A11): the first trip that has not reached its last call, so the bus that is underway
// still shows. Past the day's last run the window starts again at the first one.
export function nextRun(dir, now) {
  const i = dir.trips.findIndex((t) => lastArrival(t) >= now);
  return i < 0 ? 0 : i;
}

// `page` columns of `width` runs each, counted from the next run and clamped to the day
export function runWindow(dir, now, page, width = TIMETABLE.runs) {
  const next = nextRun(dir, now), last = Math.max(0, dir.trips.length - width);
  const start = clamp(next + page * width, 0, last);
  return { start, next, trips: dir.trips.slice(start, start + width), canPrev: start > 0, canNext: start < last };
}

// what a run's column shows at one stop: its departure there, or null when the run skips the stop (a short turn)
export function cellTime(trip, uic) {
  const key = String(uic), call = trip.calls.find((c) => String(c[0]) === key);
  return call ? call[2] : null;
}

// where the buses that are out right now stand (A3): trip key -> uic of the last stop each one passed. A bus driving
// in from the map edge (k = 0) has passed none yet, a finished one is no longer underway.
export function liveStops(buses) {
  const live = new Map();
  for (const bus of buses) {
    if (bus.phase === 'done') continue;
    const index = bus.phase === 'stand' ? bus.k : bus.k - 1;
    if (index < 0 || index >= bus.calls.length) continue;
    live.set(tripKey(bus.trip), String(bus.calls[index].uic));
  }
  return live;
}

// a time of day in the OS region's format; `secs` may run past midnight (a trip of the next service day)
export function clockText(secs, locale) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(wrap(secs) * 1000));
}

export const minutesUntil = (wait) => Math.ceil(wait / 60);

// the stop whose pole the player stands nearest, within `reach` metres; null when none is that close
export function stopInReach(stops, x, z, reach) {
  let best = null, bestDist = reach;
  for (const stop of stops) {
    const d = Math.hypot(x - stop.pole[0], z - stop.pole[1]);
    if (d <= bestDist) { bestDist = d; best = stop; }
  }
  return best;
}

// the destination the direction is named after: the one most of its trips carry (a short turn does not rename it)
function mainDestination(trips) {
  const count = new Map();
  for (const t of trips) count.set(t.to, (count.get(t.to) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

// the stops of a direction: those of its longest trip, so a short turn (143 to Sisseln DSM) keeps the full column
function directionStops(trips) {
  return trips.reduce((best, t) => (t.calls.length > best.calls.length ? t : best)).calls.map((c) => String(c[0]));
}

// one direction per route id (A8): its stops top to bottom, its trips by departure, and whether it leaves the map
export function lineDirections(trips, line) {
  const key = String(line), byRoute = new Map();
  for (const t of trips) {
    if (String(t.line) !== key) continue;
    byRoute.set(t.route, [...(byRoute.get(t.route) ?? []), t]);
  }
  return [...byRoute].map(([route, list]) => ({
    route,
    to: mainDestination(list),
    toOutside: list.some((t) => !!t.toOutside),
    stops: directionStops(list),
    trips: [...list].sort((a, b) => a.calls[0][2] - b.calls[0][2]),
  })).sort((a, b) => a.to.localeCompare(b.to));
}
