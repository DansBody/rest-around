// Entry point: load assets (placeholders for anything missing), restore the save, start the loop.
import { assets } from './assets.js';
import { models } from './models.js';
import { bakeModelIcons, bakeGlyphIcons } from './portrait.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui/ui.js';
import { DebugPanel } from './ui/debug.js';
import { setupInput } from './input.js';
import { load, save } from './save.js';
import { audio } from './audio.js';
import { t, localizeData } from './i18n.js';
import { OFFLINE } from './data.js';

const loading = document.getElementById('loading');
const bar = loading.querySelector('.load-bar i');
const msg = loading.querySelector('.load-msg');

/** Fill the loading bar and the cup on the loading card. */
function setLoad(pct) { const v = Math.round(pct) + '%'; bar.style.width = v; loading.style.setProperty('--p', v); }

async function boot() {
  localizeData();
  loading.querySelector('.load-msg').textContent = t('Warming up the espresso machine…');
  try {
    await assets.load((p) => setLoad(p * 30));
    msg.textContent = t('Unpacking the coffee beans…');
    await models.load(assets.manifest, (p) => setLoad(30 + p * 70));
    bakeModelIcons();
    await bakeGlyphIcons();
  } catch (e) {
    msg.textContent = t('Could not load assets/manifest.json — run a local server (see README).');
    console.error(e);
    return;
  }
  const game = new Game();
  window.game = game; // handy for the console / automated checks
  const status = load(game);
  if (status !== 'loaded') game.newGame();

  const canvas = document.getElementById('view');
  const renderer = new Renderer(canvas, document.getElementById('overlay'), game);
  game.renderer = renderer;
  const ui = new UI(game, document.getElementById('ui'));
  ui.init();
  const debug = new DebugPanel(game, ui, document.getElementById('ui'));
  setupInput(game, canvas, ui, debug);
  audio.enabled = game.state.settings.sound;
  audio.musicEnabled = game.state.settings.music !== false;
  audio.setVolume(game.state.settings.volume);
  document.title = `${game.state.name} · Refillit`;

  const resize = () => { renderer.resize(); };
  window.addEventListener('resize', resize);
  resize();
  game.camera.fit(game.world.size);

  if (status === 'corrupt') ui.toast(t('Your save was damaged, so a fresh café was opened. (A backup was kept.)'), 'bad');
  else if (status === 'loaded' && !game.awayReport) ui.toast(t('Welcome back to {name}!', { name: game.state.name }), 'good');
  else ui.toast(t('Welcome to your new café! Guests are on their way ☕'), 'good');

  // The café keeps trading while the game is closed, counted from the moment of the last save. So the save
  // must keep that moment: a hidden tab does not run the game, hence no autosave while hidden, and the one
  // save made as the tab was hidden is the one that counts.
  const persist = (force) => { if (!game.resetting && (force || !document.hidden)) save(game); };
  setInterval(() => persist(false), 10000);
  window.addEventListener('beforeunload', () => persist(false));
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { persist(true); hiddenAt = Date.now(); return; }
    // back after a long while: reload so the time away is settled the same way as after closing the game
    if (hiddenAt && (Date.now() - hiddenAt) / 1000 >= OFFLINE.minSeconds && !game.resetting) location.reload();
    hiddenAt = 0;
  });
  if (game.awayReport) { game.paused = true; ui.queueModal(() => ui.awayCard(game.awayReport)); }

  let last = performance.now();
  let fpsAcc = 0, frames = 0;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.update(dt);
    renderer.render(dt);
    ui.update(dt);
    debug.update();
    fpsAcc += dt; frames++;
    if (fpsAcc > 0.5) { game.fps = frames / fpsAcc; fpsAcc = 0; frames = 0; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  loading.classList.add('hide');
  setTimeout(() => loading.remove(), 500);
}
boot();
