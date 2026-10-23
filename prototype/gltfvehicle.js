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

// selecting a vehicle with a default paint: the untouched factory paint becomes it; a paint the player chose (even the factory colour) stays
export function paintOnSelect(def, currentPaint, paintChosen = false, factoryPaint = 'navy') {
  return !paintChosen && currentPaint === factoryPaint && def.defaultPaint ? def.defaultPaint : currentPaint;
}

export function lampRole(extras) { return extras?.lamp === 'head' || extras?.lamp === 'tail' ? extras.lamp : null; }

// the Race! button waits while a glTF vehicle is idle or loading; a failed load falls back, so it must not hang
export function raceBlocked(def, state) { return Boolean(def.gltf) && (state === 'idle' || state === 'loading'); }
