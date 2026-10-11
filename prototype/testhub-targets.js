// #251: the Testhub jump targets -- pure rules, no DOM, no three.js. Unit-tested with `node --test prototype/tests/*.test.mjs`.
// A target is { id, label, kind, ... }: kind 'jump' carries a J entry, kind 'spot' carries { x, z, th, floor? }.
// The car's forward vector is (cos th, sin th) in (x, z), as everywhere in the game.

export const TARGET_ID_RE = /^[a-z0-9._-]+$/;

const UMLAUTS = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue' };

// "Reservoir Hübel" -> "reservoir-huebel"; a name with nothing usable in it -> "x"
export function slugify(name) {
  const slug = String(name).replace(/[äöüßÄÖÜ]/g, c => UMLAUTS[c]).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'x';
}

// every J entry -> j.<slug>; a repeated slug gets -2, -3 ... in list order, so ids are deterministic
export function jumpTargets(entries) {
  const seen = new Map();
  return entries.map(entry => {
    const slug = slugify(entry.n), count = (seen.get(slug) || 0) + 1;
    seen.set(slug, count);
    return { id: `j.${count === 1 ? slug : `${slug}-${count}`}`, label: entry.n, kind: 'jump', entry };
  });
}

const WRECK_RUN = 8;      // m east of a wreck: where the console shortcut `__mm.place(x + 8, z)` has always put the car
const GATE_BACK = 12;     // m back from the tunnel mouth, so the gate is in view ahead
const TOWER_BACK = 110;   // m before the hall centre: outside the tower's feet (|x|,|z| <= 53 + 17), inside the hall (r 168)

const spot = (id, label, x, z, th, extra = {}) => ({ id, label, kind: 'spot', spot: { x, z, th, ...extra } });

function underwaterSpots(u) {
  if (!u) return [];
  const beside = ([x, z]) => [x + WRECK_RUN, z];   // facing west (th = PI) looks at the wreck
  return [
    spot('uw.boat', 'Underwater: capsized rowing boat', ...beside(u.wreck), Math.PI),
    spot('uw.car', 'Underwater: rusty car', ...beside(u.wreckCar), Math.PI),
  ];
}

function hideoutSpots(h) {
  if (!h) return [];
  const gate = [h.mouth[0] - Math.cos(h.heading) * GATE_BACK, h.mouth[1] - Math.sin(h.heading) * GATE_BACK];
  const dx = h.hall[0] - h.n1[0], dz = h.hall[1] - h.n1[1], len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  return [
    spot('hideout.gate', 'Hideout: reservoir gate', ...gate, h.heading),
    spot('hideout.tower', 'Hideout: Eiffel Tower hall', h.hall[0] - ux * TOWER_BACK, h.hall[1] - uz * TOWER_BACK, Math.atan2(uz, ux), { floor: true }),
  ];
}

export function spotTargets({ underwater, hideout }) {
  return [...underwaterSpots(underwater), ...hideoutSpots(hideout)];
}

export function buildTargets({ entries, underwater, hideout }) {
  return [...jumpTargets(entries), ...spotTargets({ underwater, hideout })];
}
