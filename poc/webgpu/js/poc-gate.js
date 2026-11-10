// PoC: WebGPU gate. three's WebGPURenderer silently falls back to WebGL2, so the page checks for a real adapter first.
export async function hasWebGPU(nav) {
  if (!nav || !nav.gpu) return false;
  try {
    return (await nav.gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}
