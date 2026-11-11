// tests/settings.test.mjs — #842: the settings dialog's pure rules
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_STORE, SOUND_VOLUME, soundOnFrom, soundVolFrom, soundGain, settingsKeyAction, musicCaptionKey } from '../settings.js';

const key = (code) => ({ code, shiftKey: false, repeat: false });

test('store keys and defaults', () => {
  assert.deepEqual(SETTINGS_STORE, { sound: 'mm.sound', soundVol: 'mm.soundVol' });
  assert.equal(soundOnFrom(null), true);
  assert.equal(soundOnFrom('0'), false);
  assert.equal(soundVolFrom(null), SOUND_VOLUME.start);
  assert.equal(soundVolFrom('7'), 7);
  assert.equal(soundVolFrom('x'), 10);
  assert.equal(soundVolFrom('11'), 10);
});

test('soundGain: square law, 0 when off', () => {
  assert.equal(soundGain(true, 10), 1);
  assert.equal(soundGain(true, 5), 0.25);
  assert.equal(soundGain(false, 10), 0);
});

test('keys: Esc back, native keys pass, game keys ignored', () => {
  assert.equal(settingsKeyAction(key('Escape')), 'back');
  for (const c of ['Tab', 'Enter', 'NumpadEnter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) assert.equal(settingsKeyAction(key(c)), 'pass', c);
  for (const c of ['KeyM', 'Digit5', 'Digit9', 'Digit0', 'KeyW', 'KeyP']) assert.equal(settingsKeyAction(key(c)), 'ignore', c);
});

test('music caption: menu music on the start screen, car radio in a run', () => {
  assert.equal(musicCaptionKey(false), 'setMusicMenu');
  assert.equal(musicCaptionKey(true), 'setMusicRadio');
});
