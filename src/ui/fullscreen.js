// Fullscreen. Browsers only enter it from a user gesture, so it happens on the first tap: the start screen's button
// for a new player, or the first tap / key in the game for a returning one. Android also locks to portrait (that only
// works in fullscreen; failures are ignored). Settings → Display → Fullscreen turns it off, and then it is not entered
// again on later visits. iPhone Safari can't put a page fullscreen at all: there the game asks once, after the tour,
// to add Refillit to the Home Screen (the web app manifest then opens it fullscreen, like an app).
import { h } from '../util.js';
import { t } from '../i18n.js';
import { pixIcon } from './os.js';

const PREF = 'refillit.fullscreen';   // a copy of settings.fullscreen, readable on the start screen before the save loads
const HINT = 'refillit.homeScreenHint';
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };

export const isIOS = () => /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || ['standalone', 'fullscreen'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
/** The page can go fullscreen here (not on iPhone, where Safari only does it for videos). */
export const canFullscreen = () => !/iPhone|iPod/.test(navigator.userAgent) && !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const wanted = () => store(PREF) !== '0';

/** Enter fullscreen (call from a user gesture) and lock to portrait where the device allows it. */
export function enterFullscreen() {
  if (!canFullscreen() || isFull() || isStandalone()) return;
  const el = document.documentElement, go = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen();
  Promise.resolve(go).then(() => {
    const o = screen.orientation;
    if (o && o.lock && matchMedia('(pointer: coarse)').matches) return o.lock('portrait').catch(() => {});
  }).catch(() => {});
}
export function exitFullscreen() {
  if (!isFull()) return;
  const go = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
  Promise.resolve(go).catch(() => {});
}

/** The start screen's tap: in we go, unless the player turned fullscreen off. */
export function startTap() { if (wanted()) enterFullscreen(); }

/** In the game: keep the start screen's copy of the setting, and go fullscreen on the first tap or key. Leaving it
 *  (Back, Esc) is the player's choice for this visit; the canvas is measured again either way. */
export function armFullscreen(game) {
  store(PREF, game.state.settings.fullscreen === false ? '0' : '1');
  const first = () => {
    for (const ev of ['click', 'touchend', 'keydown']) window.removeEventListener(ev, first, true);
    if (game.state.settings.fullscreen !== false) enterFullscreen();
  };
  for (const ev of ['click', 'touchend', 'keydown']) window.addEventListener(ev, first, true);
  if (!armFullscreen.done) {
    armFullscreen.done = true;
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => window.dispatchEvent(new Event('resize')));
  }
}

/** The Settings switch: on enters right away (the tap is the gesture), off leaves and stays off on later visits. */
export function setFullscreen(on) {
  store(PREF, on ? '1' : '0');
  if (on) enterFullscreen(); else exitFullscreen();
}

/** iPhone / iPad Safari, not already from the Home Screen: once, a small dialog on how to add it there. */
export function homeScreenHint(ui) {
  if (!isIOS() || isStandalone() || store(HINT)) return false;
  store(HINT, '1');   // asked once, whichever way it is answered
  const share = () => h('span.a2hs-share', pixIcon('share', 2));
  ui.queueModal(() => h('div.card.a2hs', { 'data-opening': 'pour' },
    h('div.hero-ico', h('span.a2hs-hero', pixIcon('share', 4))),
    h('div.big-title', t('Add Refillit to your Home Screen')),
    h('div.muted', t('In Safari, tap Share'), ' ', share(), ' ', t('then “Add to Home Screen”.')),
    h('div.muted', t('Refillit then opens full screen, like an app.')),
    h('div.btnrow', { style: { justifyContent: 'center' } },
      h('button.btn.ghost', { onclick: () => ui.closeModal() }, t('Not now')),
      h('button.btn.primary', { onclick: () => ui.closeModal() }, t('Got it')))));
  return true;
}
