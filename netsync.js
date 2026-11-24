// netsync.js — #835 part a: clock offset, pose track and start column. Pure module: no DOM, no three.js,
// no netlink; index.html wires it up (part b). A track is never mutated by a query: pushPose writes, sampleRemote reads.

export const DELAY = 100;        // ms: remote cars are rendered this far in the past, hiding latency jitter
export const EXTRAP = 250;       // ms: how far past the newest pose velocity-based extrapolation may run
export const HIDE = 3000;        // ms of silence before a remote car stops being drawn
export const SNAP = 25;          // m: bracketing poses further apart than this are a jump, not a movement
export const KEEP = 1000;        // ms: poses older than this behind the newest are dropped
export const MAX_POSES = 20;     // per track: the interpolation window
export const CLOCK_N = 5;        // clock samples the median is taken over
export const RTT_MAX = 1000;     // ms: a longer ping round trip (a stalled peer) is no clock sample once one exists (#1109)
export const GRID_BACK = 8;      // m: start column spacing along the heading
export const GRID_SIDE = 1.5;    // m: lateral offset of the start column
export const FADE = 1000;        // ms: a leaving player's car fades out over this long (#835 part c)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The pose record's flag bits, shared by part b's encoder and part c's lamps. #1112: bit 6 is the horn.
export const FLAG = { visible: 1, head: 2, brake: 4, left: 8, right: 16, nitro: 32, horn: 64 };

// ---- #1112: hearing the other player ----
export const HEAR_NEAR = 12;       // m: a remote sound is at full volume up to here
export const HEAR_FAR = 160;      // m: a remote sound is silent from here on
// hearGain(d) — the volume of a sound this far away: 1 up to HEAR_NEAR, 0 past HEAR_FAR, quadratic in between. A query: pure.
export function hearGain(d) {
  if (!Number.isFinite(d)) return 0;
  const t = clamp((d - HEAR_NEAR) / (HEAR_FAR - HEAR_NEAR), 0, 1);
  return (1 - t) * (1 - t);
}

// ---- #1179: the host's own gate on a relayed knock ----
export const KNOCK_GAP_MS = 60;   // the same gap netSendKnock keeps per sound
// knockAllowed(seen, slot, sound, now) — true (and records now) if this slot's knock of this sound is at least KNOCK_GAP_MS after
// the last accepted one. `seen` is the caller's plain object; a refused knock is not recorded.
export function knockAllowed(seen, slot, sound, now) {
  if (!Number.isFinite(now)) return false;
  const key = slot + ':' + sound;
  if (now - (seen[key] ?? -Infinity) < KNOCK_GAP_MS) return false;
  seen[key] = now;
  return true;
}

// ---- clock ----
// addClockSample(samples, a, b, c) — one ping/pong round: a = send time, b = host clock, c = receive time (guest ms).
// Returns a new array holding the last CLOCK_N offsets; never mutates the one it is given. A round trip longer than
// RTT_MAX is dropped once there is a sample: a pong that queued behind a stalled main thread (#1109: the lift ride's
// first renders) would move the median by seconds. The first sample is always kept, so a slow link still gets an offset.
export function addClockSample(samples, a, b, c) {
  if (samples && samples.length && c - a > RTT_MAX) return samples;
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
const pick = (p) => ({ x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz, vx: p.vx, vz: p.vz, steer: p.steer, flags: p.flags });

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
    return { x: newest.x + newest.vx * dt, y: newest.y, z: newest.z + newest.vz * dt, rx: newest.rx, ry: newest.ry, rz: newest.rz, vx: newest.vx, vz: newest.vz, steer: newest.steer, flags: newest.flags };
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
    vx: lerp(b0.vx, b1.vx, f),
    vz: lerp(b0.vz, b1.vz, f),
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

// ---- part c polish ----
// fadeAlpha(ms) — the opacity of a leaving player's car: 1 at leave, 0 after FADE ms. A query: pure.
export function fadeAlpha(ms) {
  return clamp(1 - ms / FADE, 0, 1);
}

// tagScale(d) — the world size of a name tag so its on-screen size stays ~constant: it grows with distance, clamped
// between 10 and 400 m so it never crowds a near car nor fills the screen far away. A query: pure.
export function tagScale(d) {
  return clamp(d, 10, 400) * 0.06;
}

// remoteLamps(flags, flashOn) — reads the pose flag bits back into per-lamp on/off states. The blinkers flash on the
// given phase (the caller passes the same 350 ms cadence the driven car's own blinkers use). A query: pure.
export function remoteLamps(flags, flashOn) {
  return {
    head: !!(flags & FLAG.head),
    brake: !!(flags & FLAG.brake),
    left: !!(flags & FLAG.left) && flashOn,
    right: !!(flags & FLAG.right) && flashOn,
  };
}
