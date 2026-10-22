import { foldText } from './landmarks.js';

export function filterHelpRows(rows, query) {
  const q = foldText(query.trim());
  return q ? rows.filter(r => foldText(`${r.keys} ${r.text}`).includes(q)) : rows;
}

// #190: the help is a command search. Each key row carries a data-cmd: "hold" (only works while held), "none"
// (the help itself, a gesture: nothing to run), or "[ctrl+]Code[|key]" (the key press that runs it).
export function parseCommand(cmd) {
  if (!cmd || cmd === 'none') return { kind: 'none' };
  if (cmd === 'hold') return { kind: 'hold' };
  const ctrlKey = cmd.startsWith('ctrl+');
  const [code, explicitKey] = (ctrlKey ? cmd.slice(5) : cmd).split('|');
  return { kind: 'run', code, key: explicitKey ?? keyForCode(code), ctrlKey };
}

function keyForCode(code) {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export const isHoldCommand = cmd => parseCommand(cmd).kind === 'hold';

// the event init to dispatch for a row, or null when Enter on it must do nothing
export function commandEventInit(cmd) {
  const c = parseCommand(cmd);
  return c.kind === 'run' ? { code: c.code, key: c.key, ctrlKey: c.ctrlKey, bubbles: true } : null;
}

// ↑ ↓ over the visible rows only; clamps at both ends; an unknown or missing current starts at the first
export function moveSelection(visible, current, step) {
  if (!visible.length) return -1;
  const i = visible.indexOf(current);
  if (i < 0) return visible[0];
  return visible[Math.min(visible.length - 1, Math.max(0, i + step))];
}
