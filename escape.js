// escape.js (#176): HTML-escape data-derived text (OSM names, vehicle ids) before it goes into innerHTML,
// in text and in quoted attribute values. Our own strings in strings.js carry markup on purpose and are never escaped.
// Pure: no DOM, no window, so node --test can import it.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
