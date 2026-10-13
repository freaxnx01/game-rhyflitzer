// #169: the region editor's UI texts, en and de. Pure, same shape as prototype/strings.js. Proper names are arguments.
const en = {
  title: 'Region editor', tagline: 'Drag a frame anywhere in Switzerland — drive there in two minutes.',
  frame: 'Frame', sizeKm: (w, h) => `${w} × ${h} km`, nameLoading: '…', nameNone: '—',
  hint: 'Drag the frame, pull a corner to resize. Arrow keys move it, Shift + arrows resize it.',
  frameLabel: 'World frame on the map', mapLabel: 'Map of Switzerland', docTitle: 'Region editor · Map Madness',
  navLabel: 'Game navigation', navMore: 'More Games…', navSource: 'Source', navFeedback: 'Feedback', handle: (c) => `Resize corner ${c}`,
  outsideCh: 'The frame must lie entirely inside Switzerland.', outlineLoading: 'Loading the map of Switzerland…',
  freeDriving: 'Few roads here: this world will be free driving only, no race.',
  build: 'Build', building: 'Building', ready: 'Ready', sorry: 'Sorry', about: 'about 1–2 minutes',
  stepQueued: 'Queued', queuedAt: (n) => `Queued (#${n})`, stepCutting: 'Cutting the map', stepTerrain: 'Terrain', stepWorld: 'Roads and buildings',
  stepRace: 'Race and places', stepDone: 'Done', connectionLost: 'Connection lost, retrying…',
  drive: 'Drive!', share: 'Share link', copy: 'Copy', copied: 'Copied', download: 'Download world', newFrame: 'New frame', changeFrame: 'Change the frame',
  licence: 'Map data © OpenStreetMap contributors (ODbL) · Terrain, heights and map © swisstopo',
  errOutsideCh: 'The frame must lie entirely inside Switzerland.', errBadFrame: 'That frame is not allowed: 1 × 1 to 4 × 4 km.',
  errRateLimit: 'You have built enough worlds for today — try again tomorrow, or drive one you built.',
  errOneAtATime: 'You already have a world being built. Wait until it is done, then build the next one.',
  errServerDaily: 'The server has built all the worlds it can for today. Try again tomorrow.',
  dlError: 'The download did not work. Try again.',
  errBusy: 'The server is busy right now. Try again in a few minutes.', errTooComplex: 'Too many buildings or roads in this frame. Try a smaller one.',
  errSource: 'A data source is not reachable right now. Try again later.', errBuildFailed: 'The build failed. Try a different frame.',
  errServer: 'The server is not reachable. Check your connection and try again.',
  verifying: "Checking you're human…", humanNote: 'Pressing Build runs a short check on your device that you are not a bot (ALTCHA): no cookies, no third party, no puzzle. A world that already exists skips it.',
  errHuman: 'The human check did not work. Please try again.',
};
const de = {
  title: 'Region-Editor', tagline: 'Zieh einen Rahmen irgendwo in der Schweiz auf — in zwei Minuten fährst Du dort.',
  frame: 'Rahmen', sizeKm: (w, h) => `${w} × ${h} km`, nameLoading: '…', nameNone: '—',
  hint: 'Verschiebe den Rahmen, zieh an einer Ecke, um die Grösse zu ändern. Pfeiltasten verschieben, Shift + Pfeile ändern die Grösse.',
  frameLabel: 'Welt-Rahmen auf der Karte', mapLabel: 'Karte der Schweiz', docTitle: 'Region-Editor · Map Madness',
  navLabel: 'Spielnavigation', navMore: 'Weitere Spiele…', navSource: 'Quellcode', navFeedback: 'Feedback', handle: (c) => `Ecke ${c} ziehen`,
  outsideCh: 'Der Rahmen muss ganz in der Schweiz liegen.', outlineLoading: 'Die Schweizer Karte wird geladen…',
  freeDriving: 'Wenige Strassen hier: diese Welt wird nur freies Fahren haben, kein Rennen.',
  build: 'Bauen', building: 'Wird gebaut', ready: 'Fertig', sorry: 'Schade', about: 'etwa 1–2 Minuten',
  stepQueued: 'In der Warteschlange', queuedAt: (n) => `In der Warteschlange (Nr. ${n})`, stepCutting: 'Karte ausschneiden', stepTerrain: 'Gelände',
  stepWorld: 'Strassen und Häuser', stepRace: 'Rennen und Orte', stepDone: 'Fertig', connectionLost: 'Verbindung verloren, neuer Versuch…',
  drive: 'Losfahren!', share: 'Link zum Teilen', copy: 'Kopieren', copied: 'Kopiert', download: 'Welt herunterladen', newFrame: 'Neuer Rahmen', changeFrame: 'Rahmen ändern',
  licence: 'Kartendaten © OpenStreetMap-Mitwirkende (ODbL) · Gelände, Höhen und Karte © swisstopo',
  errOutsideCh: 'Der Rahmen muss ganz in der Schweiz liegen.', errBadFrame: 'Dieser Rahmen geht nicht: 1 × 1 bis 4 × 4 km.',
  errRateLimit: 'Du hast für heute genug Welten gebaut — versuch es morgen wieder oder fahr in einer, die Du schon gebaut hast.',
  errOneAtATime: 'Es wird schon eine Welt für Dich gebaut. Warte, bis sie fertig ist, und bau dann die nächste.',
  errServerDaily: 'Der Server hat für heute alle Welten gebaut, die er schafft. Versuch es morgen wieder.',
  dlError: 'Der Download hat nicht geklappt. Versuch es noch einmal.',
  errBusy: 'Der Server ist gerade ausgelastet. Versuch es in ein paar Minuten noch einmal.', errTooComplex: 'Zu viele Häuser oder Strassen in diesem Rahmen. Nimm einen kleineren.',
  errSource: 'Eine Datenquelle ist gerade nicht erreichbar. Versuch es später noch einmal.', errBuildFailed: 'Der Bau ist fehlgeschlagen. Versuch einen anderen Rahmen.',
  errServer: 'Der Server ist nicht erreichbar. Prüf Deine Verbindung und versuch es noch einmal.',
  verifying: 'Wir prüfen, ob Du ein Mensch bist…', humanNote: 'Beim Bauen läuft kurz eine Prüfung auf Deinem Gerät, dass Du kein Bot bist (ALTCHA): ohne Cookies, ohne Dritte, ohne Rätsel. Bei einer Welt, die es schon gibt, entfällt sie.',
  errHuman: 'Die Prüfung, ob Du ein Mensch bist, hat nicht geklappt. Versuch es noch einmal.',
};

export const STRINGS = { en, de };

export function translate(lang, key, ...args) {
  const table = STRINGS[lang] || en;
  const value = key in table ? table[key] : key in en ? en[key] : key;
  return typeof value === 'function' ? value(...args) : value;
}
