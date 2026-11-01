import test from 'node:test';
import assert from 'node:assert/strict';
import { ABOUT_LINKS, ABOUT_TABS, aboutKeyAction, aboutReturn, aboutTabIndex } from '../about.js';

test('ABOUT_LINKS: every link https, the agreed set, frozen', () => {
  assert.deepEqual(Object.keys(ABOUT_LINKS).sort(), ['agentWorkflow', 'agis', 'aiInstructions', 'altcha', 'crashcat', 'fonts', 'glossary', 'leaflet', 'midtown', 'osm', 'plattform', 'source', 'swisstopo', 'threejs']);
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

test('ABOUT_TABS: the four tabs in order, frozen', () => {
  assert.deepEqual([...ABOUT_TABS], ['people', 'game', 'credits', 'built']);
  assert.ok(Object.isFrozen(ABOUT_TABS));
});

test('aboutTabIndex: arrows wrap, Home/End jump, other keys give null', () => {
  assert.equal(aboutTabIndex('ArrowRight', 0), 1);
  assert.equal(aboutTabIndex('ArrowRight', 3), 0);
  assert.equal(aboutTabIndex('ArrowLeft', 1), 0);
  assert.equal(aboutTabIndex('ArrowLeft', 0), 3);
  assert.equal(aboutTabIndex('Home', 2), 0);
  assert.equal(aboutTabIndex('End', 1), 3);
  for (const code of ['ArrowUp', 'ArrowDown', 'KeyW', 'Tab']) assert.equal(aboutTabIndex(code, 1), null, code);
});

test('aboutKeyAction: the tab keys are claimed as tab, the other game keys stay ignored', () => {
  for (const code of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.equal(aboutKeyAction({ code }), 'tab', code);
  for (const code of ['ArrowUp', 'ArrowDown', 'KeyW']) assert.equal(aboutKeyAction({ code }), 'ignore', code);
  assert.equal(aboutKeyAction({ code: 'Escape' }), 'back');
});
test('the Aargau parcels are credited with a link (#506)', () => {
  assert.equal(ABOUT_LINKS.agis, 'https://geodienste.ch/services/lwb_nutzungsflaechen');
});
