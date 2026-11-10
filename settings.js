// settings.js (#842): the settings dialog's pure rules. No DOM, so node --test imports it.
export const SETTINGS_STORE = Object.freeze({ sound: 'mm.sound', soundVol: 'mm.soundVol' });
export const SOUND_VOLUME = Object.freeze({ min: 0, max: 10, start: 10 });   // 10 = today's fixed effects level
export const soundOnFrom = (stored) => stored !== '0';
export function soundVolFrom(stored) {
  const n = Number(stored);
  return stored !== null && stored !== '' && Number.isInteger(n) && n >= SOUND_VOLUME.min && n <= SOUND_VOLUME.max ? n : SOUND_VOLUME.start;
}
export const soundGain = (on, vol) => (on ? (vol / SOUND_VOLUME.max) ** 2 : 0);   // the radio's square law (radio.js trackGain)
const PASS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
export function settingsKeyAction(e) { if (e.code === 'Escape') return 'back'; return PASS.has(e.code) ? 'pass' : 'ignore'; }
export const musicCaptionKey = (inRun) => (inRun ? 'setMusicRadio' : 'setMusicMenu');
