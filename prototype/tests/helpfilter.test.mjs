import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHelpRows } from '../helpfilter.js';

const rows = [
  { keys: 'M', text: 'Ton aus' },
  { keys: 'F3', text: 'debug: coordinates' },
  { keys: 'Esc · P', text: 'Pause: weiter' },
];

test('filterHelpRows_PartialText_KeepsMatchingRows', () => {
  assert.deepEqual(filterHelpRows(rows, 'ton').map(r => r.keys), ['M']);
});
test('filterHelpRows_KeyLabel_Matches', () => {
  assert.deepEqual(filterHelpRows(rows, 'f3').map(r => r.keys), ['F3']);
});
test('filterHelpRows_AccentsAndCase_AreFolded', () => {
  assert.equal(filterHelpRows([{ keys: 'X', text: 'Fahrzeug wählen' }], 'WAHLEN').length, 1);
});
test('filterHelpRows_EmptyOrBlank_ReturnsAll', () => {
  assert.equal(filterHelpRows(rows, '').length, 3);
  assert.equal(filterHelpRows(rows, '   ').length, 3);
});
test('filterHelpRows_NoMatch_ReturnsEmpty', () => {
  assert.deepEqual(filterHelpRows(rows, 'zzz'), []);
});
