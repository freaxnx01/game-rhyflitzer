// netsync.js — #835 part a: clock offset, pose track and start column. Pure module: no DOM, no three.js,
// no netlink; index.html wires it up (part b). A track is never mutated by a query: pushPose writes, sampleRemote reads.

export const DELAY = 100;        // ms: remote cars are rendered this far in the past, hiding latency jitter
export const EXTRAP = 250;       // ms: how far past the newest pose velocity-based extrapolation may run
export const HIDE = 3000;        // ms of silence before a remote car stops being drawn
export const SNAP = 25;          // m: bracketing poses further apart than this are a jump, not a movement
export const KEEP = 1000;        // ms: poses older than this behind the newest are dropped
export const MAX_POSES = 20;     // per track: the interpolation window
export const CLOCK_N = 5;        // clock samples the median is taken over
export const GRID_BACK = 8;      // m: start column spacing along the heading
export const GRID_SIDE = 1.5;    // m: lateral offset of the start column

// The pose record's flag bits, shared by part b's encoder and part c's lamps.
export const FLAG = { visible: 1, head: 2, brake: 4, left: 8, right: 16, nitro: 32 };

// ---- clock ----
// addClockSample(samples, a, b, c) — one ping/pong round: a = send time, b = host clock, c = receive time (guest ms).
// Returns a new array holding the last CLOCK_N offsets; never mutates the one it is given.
export function addClockSample(samples, a, b, c) {
  const next = [...(samples || []), b - (a + c) / 2];
  return next.length > CLOCK_N ? next.slice(next.length - CLOCK_N) : next;
}

// clockOffset(samples) — the median offset, or null while there is no sample yet.
export function clockOffset(samples) {
  if (!samples || samples.length === 0) return null;
  const sorted = [...samples].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---- pose track ----
export function createTrack() {
  return { poses: [] };
}

// pushPose(track, pose) — inserts sorted by t, drops duplicates and stragglers, trims the window. A command: mutates.
export function pushPose(track, pose) {
  const poses = track.poses;
  const newest = poses[poses.length - 1];
  if (poses.some((p) => p.t === pose.t)) return;
  if (newest && pose.t < newest.t - KEEP) return;
  poses.push(pose);
  poses.sort((a, b) => a.t - b.t);
  const cutoff = poses[poses.length - 1].t - KEEP;
  track.poses = poses.filter((p) => p.t >= cutoff).slice(-MAX_POSES);
}

const lerp = (a, b, f) => a + (b - a) * f;

// lerpAngle — the short way around: from 3.1 to -3.1 rad goes forward through ±π, not back through 0.
function lerpAngle(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * f;
}

const poseDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const pick = (p) => ({ x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz, steer: p.steer, flags: p.flags });

// sampleRemote(track, now) — the pose to draw at host-clock time `now`: interpolated, extrapolated or held, or null
// once the sender has been silent for HIDE. A query: reads the track, never mutates it.
export function sampleRemote(track, now) {
  const poses = track.poses;
  const newest = poses[poses.length - 1];
  if (!newest || now - newest.t > HIDE) return null;
  const rt = now - DELAY;
  const oldest = poses[0];
  if (rt <= oldest.t) return pick(oldest);
  if (rt >= newest.t) {
    const dt = Math.min(rt - newest.t, EXTRAP) / 1000;
    return { x: newest.x + newest.vx * dt, y: newest.y, z: newest.z + newest.vz * dt, rx: newest.rx, ry: newest.ry, rz: newest.rz, steer: newest.steer, flags: newest.flags };
  }
  let i = poses.length - 2;
  while (poses[i].t > rt) i--;
  const b0 = poses[i], b1 = poses[i + 1];
  if (poseDistance(b0, b1) > SNAP) return pick(b1);
  const f = (rt - b0.t) / (b1.t - b0.t);
  return {
    x: lerp(b0.x, b1.x, f),
    y: lerp(b0.y, b1.y, f),
    z: lerp(b0.z, b1.z, f),
    rx: lerpAngle(b0.rx, b1.rx, f),
    ry: lerpAngle(b0.ry, b1.ry, f),
    rz: lerpAngle(b0.rz, b1.rz, f),
    steer: lerpAngle(b0.steer, b1.steer, f),
    flags: b1.flags,
  };
}

// gridPose([x, z, th], slot) — the spawn point of lobby slot `slot`: a column behind the start, slot 0 on the start
// itself, each further slot GRID_BACK further back and alternately GRID_SIDE left and right of the road centre.
export function gridPose([x, z, th], slot) {
  const back = GRID_BACK * slot;
  const side = slot === 0 ? 0 : slot % 2 ? GRID_SIDE : -GRID_SIDE;
  return [x - Math.cos(th) * back - Math.sin(th) * side, z - Math.sin(th) * back + Math.cos(th) * side, th];
}
