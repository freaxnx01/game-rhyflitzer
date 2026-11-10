import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABOUT_LINKS, ABOUT_TABS, aboutKeyAction, aboutReturn, aboutTabIndex, contactAddress, contactHref } from '../about.js';

test('ABOUT_LINKS: every link https, the agreed set, frozen', () => {
  assert.deepEqual(Object.keys(ABOUT_LINKS).sort(), ['agentWorkflow', 'agis', 'aiInstructions', 'altcha', 'copernicus', 'crashcat', 'fonts', 'glossary', 'leaflet', 'midtown', 'osm', 'otd', 'plattform', 'privacy', 'source', 'swisstopo', 'threejs']);
  for (const [id, url] of Object.entries(ABOUT_LINKS)) assert.match(url, /^https:\/\/[^\s]+$/, id);
  assert.equal(ABOUT_LINKS.plattform, 'https://www.plattform-sisslerfeld.com/');
  assert.equal(ABOUT_LINKS.privacy, 'https://github.com/freaxnx01/game-rhyflitzer#datenschutz--privacy');
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

test('ABOUT_TABS: the five tabs in order, frozen', () => {
  assert.deepEqual([...ABOUT_TABS], ['people', 'game', 'credits', 'built', 'loading']);
  assert.ok(Object.isFrozen(ABOUT_TABS));
});

test('aboutTabIndex: arrows wrap, Home/End jump, other keys give null', () => {
  assert.equal(aboutTabIndex('ArrowRight', 0), 1);
  assert.equal(aboutTabIndex('ArrowRight', 3), 4);
  assert.equal(aboutTabIndex('ArrowRight', 4), 0);
  assert.equal(aboutTabIndex('ArrowLeft', 1), 0);
  assert.equal(aboutTabIndex('ArrowLeft', 0), 4);
  assert.equal(aboutTabIndex('Home', 2), 0);
  assert.equal(aboutTabIndex('End', 1), 4);
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
test('the horizon backdrop is credited with a link (#593)', () => {
  assert.equal(ABOUT_LINKS.copernicus, 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM');
});
test('ABOUT_LINKS: the Postauto timetable source (#500)', () => {
  assert.equal(ABOUT_LINKS.otd, 'https://opentransportdata.swiss/');
});

test('contactAddress: German and English address, unknown language falls back to English', () => {
  assert.equal(contactAddress('de'), 'kontakt@rhyflitzer.ch');
  assert.equal(contactAddress('en'), 'hello@freax.games');
  assert.equal(contactAddress('fr'), 'hello@freax.games');
  assert.equal(contactAddress(undefined), 'hello@freax.games');
});

test('contactHref: mailto plus the address of the language', () => {
  assert.equal(contactHref('de'), 'mailto:kontakt@rhyflitzer.ch');
  assert.equal(contactHref('en'), 'mailto:hello@freax.games');
});

test('index.html carries no contact address and no mailto (#853: crawlers read the raw HTML)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const bad of ['kontakt@', 'hello@', '@rhyflitzer.ch', '@freax.games', 'mailto:']) assert.ok(!html.includes(bad), bad);
});
