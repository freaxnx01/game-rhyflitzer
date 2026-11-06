// postautodebug.js (#707): pure formatting for the Postauto section in the F3 debug panel.
// No DOM, no three.js: node --test only. All text comes in through t(key, args) so de/en stay in strings.js.
const DAY = 86400;
const pad2 = (n) => String(n).padStart(2, '0');

// seconds after midnight -> 'HH:MM:SS', wrapping past midnight
export function hhmmss(secs) {
  const t = ((secs % DAY) + DAY) % DAY;
  return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor(t / 60) % 60)}:${pad2(Math.floor(t) % 60)}`;
}

// the fleet clock line: HH:MM:SS and where the clock comes from -- ?patime=HH:MM or the Europe/Zurich wall clock
export function clockLine(clock, patime, t) {
  const time = hhmmss(clock);
  if (patime === null || patime === undefined) return t('dbgPaClockWall', { time });
  return t('dbgPaClockPatime', { time, given: `${pad2(Math.floor(patime / 3600))}:${pad2(Math.floor(patime / 60) % 60)}` });
}

// metres between the bus and the player, as text: m under 1000, else km with one decimal
function distText(d) {
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
}

// one panel row per bus: line 1 "133 → Stein-Säckingen  fahrt 30" (or "steht"), line 2 "Halt 4/11 · 2.1 km entfernt"
export function busRow(bus, player, t) {
  const phase = bus.phase === 'stand' ? t('dbgPaStand') : t('dbgPaDrive', { kmh: Math.round(bus.v * 3.6) });
  const dist = distText(Math.hypot(bus.x - player.x, bus.z - player.z));
  return {
    key: bus.key,
    line1: `${bus.line} → ${bus.to}  ${phase}`,
    line2: `${t('dbgPaStop', { k: bus.k + 1, n: bus.n })} · ${t('dbgPaAway', { dist })}`,
  };
}

// the earliest first-stop departure (mod 86400) at or after `now`, wrapping past midnight; null with no trips
export function nextDeparture(trips, now) {
  let best = null;
  for (const trip of trips) {
    const dep = ((trip.calls[0][2] % DAY) + DAY) % DAY, wait = ((dep - now) % DAY + DAY) % DAY;
    if (!best || wait < best.wait) best = { wait, dep, line: String(trip.line), to: trip.to };
  }
  return best ? { dep: best.dep, line: best.line, to: best.to } : null;
}

// a chase cam `back` metres behind the bus and `up` above it (y is an offset: the caller adds the ground height),
// looking at the bus. th = atan2(dz, dx) like route.js, so behind = minus the heading vector.
export function chaseCam(pose, back = 14, up = 5) {
  return {
    x: pose.x - Math.cos(pose.th) * back,
    y: up,
    z: pose.z - Math.sin(pose.th) * back,
    lookX: pose.x,
    lookZ: pose.z,
  };
}
