import { foldText } from './landmarks.js';

export function filterHelpRows(rows, query) {
  const q = foldText(query.trim());
  return q ? rows.filter(r => foldText(`${r.keys} ${r.text}`).includes(q)) : rows;
}
