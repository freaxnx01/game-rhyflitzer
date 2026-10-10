// #9: the UI string table. Pure module, so node --test can import it without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, translate } from '../strings.js';

const render = (v) => (typeof v === 'function' ? v(...Array(v.length).fill('x')) : v);

test('English and German have exactly the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.de).sort(), Object.keys(STRINGS.en).sort());
});

test('every value is a string or a function in both languages, and functions agree on arity', () => {
  for (const key of Object.keys(STRINGS.en)) {
    const en = STRINGS.en[key], de = STRINGS.de[key];
    assert.ok(['string', 'function'].includes(typeof en), key);
    assert.equal(typeof de, typeof en, key);
    if (typeof en === 'function') assert.equal(de.length, en.length, key);
  }
});

test('the Eiffel Tower model is credited in both languages (#201)', () => {
  assert.match(translate('en', 'creditEiffel'), /Johnson Martin.*CC BY 4\.0/);
  assert.match(translate('de', 'creditEiffel'), /Johnson Martin.*CC BY 4\.0/);
});

test('German strings use Swiss spelling (no sharp s)', () => {
  for (const [key, value] of Object.entries(STRINGS.de)) assert.ok(!render(value).includes('ß'), key);
});

test('translate picks the language, falls back to English, then to the key', () => {
  assert.equal(translate('de', 'fishes'), 'Grüss mir die Fische!');
  assert.equal(translate('en', 'fishes'), 'Sleep with the fishes!');
  assert.equal(translate('fr', 'fishes'), 'Sleep with the fishes!');
  assert.equal(translate(undefined, 'fishes'), 'Sleep with the fishes!');
  assert.equal(translate('de', 'no-such-key'), 'no-such-key');
});

test('function values interpolate their arguments; names pass through untouched', () => {
  assert.equal(translate('de', 'cpTarget', 2, 'Bahnhof Sisseln'), 'Checkpoint 2 · Bahnhof Sisseln');
  assert.equal(translate('en', 'finishTarget', 'Münsterplatz'), 'Finish · Münsterplatz');
  assert.equal(translate('de', 'finishTarget', 'Münsterplatz'), 'Ziel · Münsterplatz');
  assert.equal(translate('en', 'camera', translate('en', 'camNear')), 'Camera: Chase near');
  assert.equal(translate('de', 'camera', translate('de', 'camNear')), 'Kamera: Verfolger nah');
  assert.equal(translate('en', 'best', null), 'Best —');
  assert.equal(translate('de', 'best', '01:02.3'), 'Bestzeit 01:02.3');
  assert.equal(translate('de', 'cpToast', 3, 'Smile-Kreisel'), 'Checkpoint 3/5<br><span style="font-size:17px">Smile-Kreisel</span>');
  assert.equal(translate('de', 'cpToastBlitz', 2, 'Sisslerfeld', 60).startsWith('Checkpoint 2/5 · +60 s'), true);
});

test('English texts stay exactly as the existing tests expect', () => {
  assert.ok(translate('en', 'terrainMeasured', false, 100, 50, 10, 'swisstopo').startsWith('Terrain: measured ·'));
  assert.ok(translate('en', 'terrainMeasured', true, 100, 50, 10, 'swisstopo').includes('(your file)'));
  assert.ok(translate('en', 'worldHand').includes('traced by hand'));
  assert.equal(translate('en', 'randomSpot'), 'Random spot');
  assert.equal(translate('en', 'chipAll'), 'All');
  assert.ok(translate('en', 'keyZoom').includes('zoom the map') && translate('en', 'keyZoom').includes('double-click'));
  assert.equal(translate('en', 'keySignals'), 'Turn signals left · right');
  assert.equal(translate('en', 'keyNitro'), 'Nitro (hold)');
  assert.ok(translate('en', 'worldOsm', 7, 9, 'OSM').startsWith('World: OpenStreetMap · 7 roads · 9 buildings ·'));
});

test('#18 autopilot strings exist in both languages', () => {
  assert.equal(translate('en', 'driveTitle'), 'Drive to');
  assert.equal(translate('de', 'driveTitle'), 'Fahren nach');
  assert.equal(translate('en', 'autoLine', 'Smile-Kreisel', '0.7'), 'AUTOPILOT → Smile-Kreisel · 0.7 km');
  assert.equal(translate('de', 'autoArrived', 'Smile-Kreisel'), 'Angekommen: Smile-Kreisel');
  assert.equal(translate('en', 'streetIn', 'Sisseln'), 'street · Sisseln');
  assert.equal(translate('en', 'notCountedAuto'), 'with the autopilot, not counted · ');
});

test('the Navi texts read as instructions in both languages (#106)', () => {
  assert.equal(translate('en', 'naviIn', '200 m', translate('en', 'dirTurnRight')), 'In 200 m turn right');
  assert.equal(translate('de', 'naviIn', '200 m', translate('de', 'dirTurnRight')), 'In 200 m rechts');
  assert.equal(translate('en', 'naviNow', translate('en', 'dirTurnRight')), 'Turn right now');
  assert.equal(translate('de', 'naviNow', translate('de', 'dirTurnRight')), 'Jetzt rechts');
  assert.equal(translate('en', 'naviDestIn', '300 m'), 'Destination in 300 m');
  assert.equal(translate('de', 'naviDestIn', '300 m'), 'Ziel in 300 m');
  assert.equal(translate('en', 'naviArrived', 'Hallenbad'), 'Arrived: Hallenbad');
  assert.equal(translate('de', 'naviArrived', 'Hallenbad'), 'Angekommen: Hallenbad');
  assert.equal(translate('en', 'naviTitle'), 'Navigate to');
  assert.equal(translate('de', 'naviTitle'), 'Navigieren nach');
  assert.equal(translate('en', 'naviNoWorld'), 'The Navi needs the OSM world');
  assert.equal(translate('de', 'naviNoWorld'), 'Das Navi braucht die OSM-Welt');
  for (const k of ['naviHint', 'naviOn', 'naviOff', 'naviReroute', 'naviNoRoute', 'naviDest', 'keyNavi',
    'dirSlightLeft', 'dirTurnLeft', 'dirSharpLeft', 'dirSlightRight', 'dirSharpRight', 'dirUturn']) {
    for (const lang of ['en', 'de']) assert.notEqual(translate(lang, k), k, `${lang}.${k}`);
  }
});

test('pause menu texts exist in both languages (#83)', () => {
  assert.equal(translate('en', 'pauseTitle'), 'Paused');
  assert.equal(translate('en', 'pauseResume'), 'Resume');
  assert.equal(translate('en', 'pauseRestart'), 'Restart race');
  assert.equal(translate('en', 'pauseMenu'), 'Main menu');
  assert.equal(translate('de', 'pauseTitle'), 'Pause');
  assert.equal(translate('de', 'pauseResume'), 'Weiter');
  assert.equal(translate('de', 'pauseRestart'), 'Rennen neu starten');
  assert.equal(translate('de', 'pauseMenu'), 'Hauptmenü');
  assert.equal(translate('en', 'abandonTitle'), 'Abandon this run?');
  assert.equal(translate('en', 'abandonCancel'), 'Cancel');
  assert.equal(translate('en', 'abandonOk'), 'Abandon');
  assert.equal(translate('de', 'abandonTitle'), 'Diesen Lauf abbrechen?');
  assert.equal(translate('de', 'abandonCancel'), 'Abbrechen');
  assert.equal(translate('de', 'abandonOk'), 'Verwerfen');
  for (const k of ['pauseHint', 'pauseAria', 'keyPause', 'abandonHint']) assert.notEqual(translate('de', k), k, k);
});

test('#108: the surprise hunt has its texts in both languages', () => {
  for (const key of ['hunt', 'modeHunt', 'presentsLabel', 'presentTarget', 'huntStart', 'presentToast', 'surpriseHop', 'surpriseTurbo', 'surpriseMoon', 'surpriseRepair', 'huntAllFound', 'huntFinishedText']) {
    assert.ok(key in STRINGS.en, key); assert.ok(key in STRINGS.de, key);
  }
  assert.equal(translate('en', 'surpriseTurbo', 6), 'Turbo for 6 seconds!');
  assert.equal(translate('de', 'surpriseMoon', 10), 'Mondschwerkraft für 10 Sekunden!');
  assert.match(translate('de', 'presentToast', 2, 5, 'x'), /^Geschenk 2\/5/);
});

test('car selection texts exist in both languages (#7)', () => {
  assert.equal(translate('en', 'chooseCar'), 'Choose car');
  assert.equal(translate('en', 'carselCount', 2, 3), 'Car 2 of 3');
  assert.equal(translate('en', 'garageLabel', 1), 'Garage · 1 vehicle');
  assert.equal(translate('en', 'garageLabel', 3), 'Garage · 3 vehicles');
  assert.equal(translate('en', 'veh_compact_name'), 'Sissle Speedster');
  assert.equal(translate('de', 'chooseCar'), 'Auto wählen');
  assert.equal(translate('de', 'carselCount', 2, 3), 'Auto 2 von 3');
  assert.equal(translate('de', 'garageLabel', 1), 'Garage · 1 Fahrzeug');
  assert.equal(translate('de', 'garageLabel', 3), 'Garage · 3 Fahrzeuge');
  assert.equal(translate('de', 'veh_compact_class'), 'Kompakt · Klasse B');
  assert.equal(translate('de', 'carselRace'), 'Los! ›');
  assert.equal(translate('en', 'veh_delorean_name'), 'Rhy Gullwing');
  assert.equal(translate('de', 'veh_delorean_class'), 'Edelstahl-Coupé · Klasse B');
  for (const k of ['veh_delorean_class', 'veh_delorean_desc']) for (const l of ['en', 'de']) assert.notEqual(translate(l, k), k, `${l} ${k}`);
  for (const k of ['carselTitle', 'carselPrev', 'carselNext', 'carselRotate', 'statTop', 'statAccel', 'statHandling', 'statMass', 'paintLabel', 'paintFixed', 'paintNavy', 'paintSunflower', 'paintSignal', 'paintSwiss', 'paintFlamingo', 'paintPlum', 'paintRhine', 'paintIce', 'paintMeadow', 'paintCream', 'paintCharcoal', 'carselBack', 'veh_compact_desc']) assert.notEqual(translate('de', k), k, k);
});

test('hideout strings exist in both languages (#102)', () => {
  assert.match(translate('en', 'hideoutFound'), /Hideout found/);
  assert.match(translate('de', 'hideoutFound'), /Versteck gefunden/);
  assert.match(translate('en', 'hideoutNoSky'), /drive out/);
  assert.match(translate('de', 'hideoutNoSky'), /fahr zuerst raus/);
});
