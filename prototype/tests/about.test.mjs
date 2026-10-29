import test from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT_LINKS, aboutKeyAction, aboutReturn } from '../about.js';

test('ABOUT_LINKS: every link https, the agreed set, frozen', () => {
  assert.deepEqual(Object.keys(ABOUT_LINKS).sort(), ['agentWorkflow', 'aiInstructions', 'altcha', 'crashcat', 'fonts', 'glossary', 'leaflet', 'midtown', 'osm', 'plattform', 'source', 'swisstopo', 'threejs']);
  for (const [id, url] of Object.entries(ABOUT_LINKS)) assert.match(url, /^https:\/\/[^\s]+$/, id);
  assert.equal(ABOUT_LINKS.plattform, 'https://www.plattform-sisslerfeld.com/');
  assert.equal(ABOUT_LINKS.midtown, 'https://en.wikipedia.org/wiki/Midtown_Madness');
  assert.equal(ABOUT_LINKS.aiInstructions, 'https://github.com/freaxnx01/ai-instructions');
  assert.equal(ABOUT_LINKS.agentWorkflow, 'https://github.com/freaxnx01/agent-workflow');
  assert.ok(Object.isFrozen(ABOUT_LINKS));
});

test('aboutKeyAction: Esc goes back, focus keys pass, game keys are ignored', () => {
  assert.equal(aboutKeyAction({ code: 'Escape' }), 'back');
  for (const code of ['Tab', 'Enter', 'NumpadEnter', 'Space']) assert.equal(aboutKeyAction({ code }), 'pass', code);
  for (const code of ['KeyW', 'KeyJ', 'KeyP', 'ArrowUp', 'KeyZ']) assert.equal(aboutKeyAction({ code }), 'ignore', code);
});

test('aboutReturn: over the paused game during a run, else the start screen', () => {
  assert.equal(aboutReturn(true), 'pause');
  assert.equal(aboutReturn(false), 'start');
});