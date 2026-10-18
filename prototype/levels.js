// #277 / #361: the game's levels -- the surface world, the ring and the eight rooms far below it. Pure: it only knows which
// level is active and hands out that level's groundAt(x, z, y), collider grid and ceilingAt(x, z) (null when the level has
// none); index.html does the drawing (what to show, the light) from onChange. A jump (J, double-click beam, the Testhub, the
// autopilot) calls onJump() first and so always ends on the surface; R calls onReset(), which keeps the level, so R below
// puts the car back at the current room's portal or the lift exit in the ring.
export function createLevels() {
  const levels = new Map(), listeners = []; let id = 'surface';
  const current = () => levels.get(id);
  const set = (next) => {
    if (!levels.has(next)) throw new Error(`unknown level: ${next}`);
    if (next === id) return false;
    const from = id; id = next; for (const fn of listeners) fn(id, from);
    return true;
  };
  return {
    register(name, level) { levels.set(name, level); },
    get id() { return id; },
    isSurface: () => id === 'surface',
    groundAt: (x, z, y) => current().groundAt(x, z, y),
    get colliders() { return current().colliders; },
    ceilingAt: (x, z) => (current().ceilingAt ? current().ceilingAt(x, z) : null),
    set,
    onJump: () => set('surface'),
    onReset: () => false,
    onChange(fn) { listeners.push(fn); },
  };
}
