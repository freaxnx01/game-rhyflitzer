// gltfvehicle.js — rules every glTF vehicle shares (#236): load state machine, buildable id, model URL, paint on select, lamp role, race button.
// Pure module: no DOM, no three.js, so node --test can import it. index.html keeps the glue.

// 'idle' --want--> 'loading' --loaded--> 'ready' | --error--> 'failed'; 'ready' and 'failed' are sticky (no retry storm in one session)
export function loadStep(state, event) {
  if (state === 'idle' && event === 'want') return 'loading';
  if (state === 'loading' && event === 'loaded') return 'ready';
  if (state === 'loading' && event === 'error') return 'failed';
  return state;
}

// the id of the model to build right now: a glTF vehicle that is not ready yet is stood in for by its fallback
export function buildableId(id, def, state) { return def.gltf && state !== 'ready' ? def.gltf.fallback : id; }

// picking a car in the garage builds it only once its model is ready, so the stage car stays until then -- also for a car that is its own
// fallback (mini, bus), which would otherwise flash its primitives first; a failed load builds the fallback (vehicleFailed)
export function buildsOnSelect(def, state) { return !def.gltf || state === 'ready'; }

const GLB_OVERRIDE = /^\.\/assets\/[\w.-]+\.glb$/;

// def.gltf.url; `?glb=./assets/<name>.glb` overrides it (test hook), anything else is ignored
export function modelUrl(def, search) {
  const override = new URLSearchParams(search).get('glb');
  return override && GLB_OVERRIDE.test(override) && !override.includes('..') ? override : def.gltf.url;
}

// selecting a vehicle: a paint the player chose (even the factory colour) stays everywhere; an automatic paint -- the untouched factory
// paint, or the previous car's default paint -- follows the new car (its default paint, else the factory paint); any other paint is kept
export function paintOnSelect(def, currentPaint, paintChosen = false, factoryPaint = 'navy', previousDef = null) {
  if (paintChosen) return currentPaint;
  const automatic = currentPaint === factoryPaint || currentPaint === previousDef?.defaultPaint;
  return automatic ? def.defaultPaint || factoryPaint : currentPaint;
}

export function lampRole(extras) { return extras?.lamp === 'head' || extras?.lamp === 'tail' ? extras.lamp : null; }

// the Race! button waits while a glTF vehicle is idle or loading; a failed load falls back, so it must not hang
export function raceBlocked(def, state) { return Boolean(def.gltf) && (state === 'idle' || state === 'loading'); }

// #709: a floor the model only draws facing down (the bus's underbody: from inside the cabin it is culled and the road shows
// through). def.gltf.floor { material, maxY }: that material's faces below maxY that point down get a copy drawn from above.
// Only those: the same material also lines the walls and the roof, and drawn from both sides it covers the paint (#723).
// Fails fast when the model lacks the material.
export function floorPlan(def, materialNames) {
  const floor = def.gltf?.floor;
  if (!floor) return null;
  if (!materialNames.includes(floor.material)) throw new Error(`gltfvehicle: floor material ${floor.material} missing`);
  return floor;
}

// the corner indices of the faces that point down with every corner at or below maxY; pos is flat x, y, z in car metres
export function floorTriangles(pos, index, maxY) {
  const out = [], y = (i) => pos[3 * i + 1];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    if (Math.max(y(a), y(b), y(c)) > maxY) continue;
    const u = [0, 1, 2].map((k) => pos[3 * b + k] - pos[3 * a + k]), w = [0, 1, 2].map((k) => pos[3 * c + k] - pos[3 * a + k]);
    if (u[2] * w[0] - u[0] * w[2] < 0) out.push(a, b, c);   // the normal's y
  }
  return out;
}

// parts that turn all the time about their node's local x axis (the mixer's drum): def.spin [{ node, rate rad/s }];
// fails fast when the model lacks a named node
export function spinPlan(def, nodeNames) {
  return (def.spin ?? []).map(({ node, rate }) => {
    if (!nodeNames.includes(node)) throw new Error(`gltfvehicle: spinning node ${node} missing`);
    return { node, rate };
  });
}
