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
