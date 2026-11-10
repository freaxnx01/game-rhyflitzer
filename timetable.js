// timetable.js (#801): what the timetable view shows -- the lines of the net, the next departures at one stop and
// a line's directions with their runs. Pure: no DOM, no three.js; node --test only.
// Trips are the #500 cut (data/timetable_hochrhein.json): calls [uic, arr, dep] in seconds after midnight of the
// service day, `toOutside` when the trip drives on past the map edge.
export const TIMETABLE = { runs: 4, rows: 4, soon: 3600, reachFoot: 2.5, reachCar: 6, reachSpeed: 2 };

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
