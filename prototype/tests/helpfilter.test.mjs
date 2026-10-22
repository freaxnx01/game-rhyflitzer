import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHelpRows, parseCommand, isHoldCommand, commandEventInit, moveSelection } from '../helpfilter.js';

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

test('commandEventInit_PlainLetter_DerivesKeyFromCode', () => {
  assert.deepEqual(commandEventInit('KeyC'), { code: 'KeyC', key: 'c', ctrlKey: false, bubbles: true });
  assert.equal(commandEventInit('Digit1').key, '1');
});
test('commandEventInit_CtrlPrefix_SetsCtrlKey', () => {
  assert.deepEqual(commandEventInit('ctrl+KeyD'), { code: 'KeyD', key: 'd', ctrlKey: true, bubbles: true });
});
test('commandEventInit_ExplicitKey_Wins', () => {
  assert.equal(commandEventInit('Equal|+').key, '+');
});
test('commandEventInit_HoldNoneOrMissing_ReturnsNull', () => {
  assert.equal(commandEventInit('hold'), null);
  assert.equal(commandEventInit('none'), null);
  assert.equal(commandEventInit(undefined), null);
});
test('isHoldCommand_OnlyHold', () => {
  assert.equal(isHoldCommand('hold'), true);
  assert.equal(isHoldCommand('KeyB'), false);
  assert.equal(parseCommand('').kind, 'none');
});
test('moveSelection_StepsOverVisibleRowsAndClamps', () => {
  assert.equal(moveSelection([2, 6, 10], 2, 1), 6);
  assert.equal(moveSelection([2, 6, 10], 10, 1), 10);
  assert.equal(moveSelection([2, 6, 10], 2, -1), 2);
});
test('moveSelection_UnknownCurrentOrEmpty', () => {
  assert.equal(moveSelection([4, 8], 99, 1), 4);
  assert.equal(moveSelection([], 0, 1), -1);
});
