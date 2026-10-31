// gallery.js (#170): the curated world list from the API. Pure (fetch injected, no DOM). The server is trusted for
// availability, not for rendering: every field is re-checked here, and the page shows it with textContent only.
import { isWorldId } from './worlds.js';

const MAX_ENTRIES = 50, MAX_TITLE = 80, MAX_DESC = 300;
const CONTROL = /[\x00-\x1f\x7f-\x9f]/g;

export const galleryUrl = (host) => `${host}/api/gallery`;

const text = (v) => (typeof v === 'string' ? v.replace(CONTROL, '').trim() : null);

export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object' || !isWorldId(raw.id)) return null;
  const title = text(raw.title), description = raw.description === undefined ? '' : text(raw.description);
  if (title === null || description === null) return null;
  if (title.length < 1 || title.length > MAX_TITLE || description.length > MAX_DESC) return null;
  return { id: raw.id, title, description };
}

export function parseGallery(json) {
  if (!Array.isArray(json)) return [];
  const seen = new Set(), out = [];
  for (const raw of json) {
    const e = cleanEntry(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length === MAX_ENTRIES) break;
  }
  return out;
}

export async function loadGallery({ host, fetch: fetchFn }) {
  try {
    const res = await fetchFn(galleryUrl(host));
    return res.ok ? parseGallery(await res.json()) : [];
  } catch (e) {
    return [];
  }
}
