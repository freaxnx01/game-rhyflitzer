// PoC: pure helpers for swapping the demo's taxi for the Rhyflitzer sedan (no three import, so node --test can load it).
import { lampRole } from '../../../gltfvehicle.js';

export const CAR_URL = '../../assets/bulldog.glb';
export const TAXI_LENGTH_M = 5.05;
const LAMP_ON_INTENSITY = 3;
const NIGHT_PRESETS = ['twilight', 'midnight'];

export function fitScale(modelLength, targetLength) {
  if (modelLength <= 0) throw new RangeError(`fitScale: model length must be positive, got ${modelLength}`);
  return targetLength / modelLength;
}

export function isNightPreset(timeId) {
  return NIGHT_PRESETS.includes(timeId);
}

// unique materials whose glTF extras mark them as head or tail lamps
export function lampMaterials(materials) {
  const lamps = materials.filter((material) => lampRole(material.userData) !== null);
  return [...new Set(lamps)];
}

export function setLampsLit(lamps, lit) {
  for (const lamp of lamps) lamp.emissiveIntensity = lit ? LAMP_ON_INTENSITY : 0;
}
