// PoC: WebGPU gate. three's WebGPURenderer silently falls back to WebGL2, so the page checks for a real adapter first.
// PoC: `?webgl=1` is a test/compare hook: skip the gate and render through three's WebGL2 backend
export function wantsForcedWebGL(search) {
  return new URLSearchParams(search || '').get('webgl') === '1';
}

export async function hasWebGPU(nav) {
  if (!nav || !nav.gpu) return false;
  try {
    return (await nav.gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}
