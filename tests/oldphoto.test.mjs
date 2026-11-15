import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMonoKey } from '../oldphoto.js';
import { translate } from '../strings.js';

test('isMonoKey: Ctrl+B only; a bare B stays look-back', () => {
  assert.equal(isMonoKey({ code: 'KeyB', ctrlKey: true }), true);
  assert.equal(isMonoKey({ code: 'KeyB', ctrlKey: false }), false);
  assert.equal(isMonoKey({ code: 'KeyH', ctrlKey: true }), false);
});

test('strings: mono toast and help label exist in en and de', () => {
  for (const lang of ['en', 'de']) for (const k of ['monoOn', 'monoOff', 'keyMono']) assert.notEqual(translate(lang, k), k, `${lang}.${k}`);
  assert.match(translate('en', 'monoOn'), /Ctrl\+B/);
  assert.match(translate('de', 'monoOn'), /Ctrl\+B/);
});
