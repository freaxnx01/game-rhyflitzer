// simclock.js (#875): the simulation clock that can run in fixed steps -- the frame-by-frame capture mode advances
// it with exact dt (no real-time clamp), so a scripted move renders identically on any machine. Pure: the caller
// passes the wall time; no DOM, no performance.now (node --test imports this).
//
// Real-time mode: now = wall + offset (offset 0 = follows the wall clock). Stepped mode: now = ms, and only
// simClockAdvance moves it. Switching either way is continuous: entering freezes at the current sim time,
// leaving rebases the offset so the sim clock runs on from exactly where it stands.

const MAX_STEP_S = 0.1;   // a step never jumps the sim further than the real-time clamp (0.05) ever would

export function createSimClock() {
  return { stepped: false, ms: 0, offset: 0 };
}

export function simClockNow(c, wall) {
  return c.stepped ? c.ms : wall + c.offset;
}

// switch stepped mode at wall time; the same state returns the same clock untouched
export function simClockSetStepped(c, on, wall) {
  const stepping = !!on;
  if (c.stepped === stepping) return c;
  return stepping
    ? { stepped: true, ms: wall + c.offset, offset: 0 }
    : { stepped: false, ms: 0, offset: c.ms - wall };
}

// advance a stepped clock by exactly dt seconds; dt must be in (0, 0.1]; a real-time clock is left alone
export function simClockAdvance(c, dt) {
  if (!c.stepped) return c;
  if (typeof dt !== 'number' || !(dt > 0) || !(dt <= MAX_STEP_S)) throw new RangeError(`dt must be in (0, ${MAX_STEP_S}] seconds, got ${dt}`);
  return { stepped: true, ms: c.ms + dt * 1000, offset: 0 };
}
