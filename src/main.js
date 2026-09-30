// Entry point: load assets (placeholders for anything missing), restore the save, start the loop.
import { assets } from './assets.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui/ui.js';
import { DebugPanel } from './ui/debug.js';
import { setupInput } from './input.js';
import { load, save } from './save.js';
import { audio } from './audio.js';

const loading = document.getElementById('loading');
const bar = loading.querySelector('.load-bar i');
const msg = loading.querySelector('.load-msg');

async function boot() {
  try {
    await assets.load((p) => { bar.style.width = Math.round(p * 100) + '%'; });
  } catch (e) {
    msg.textContent = 'Could not load assets/manifest.json — run a local server (see README).';
    console.error(e);
    return;
  }
  const game = new Game();
  window.game = game; // handy for the console / automated checks
  const status = load(game);
  if (status !== 'loaded') game.newGame();

  const canvas = document.getElementById('view');
  const renderer = new Renderer(canvas, game);
  game.renderer = renderer;
  const ui = new UI(game, document.getElementById('ui'));
  ui.init();
  const debug = new DebugPanel(game, ui, document.getElementById('ui'));
  setupInput(game, canvas, ui, debug);
  audio.enabled = game.state.settings.sound;
  audio.setVolume(game.state.settings.volume);
  document.title = `${game.state.name} · Rest Around`;

  const resize = () => { renderer.resize(); game.camera.setRoom(game.world.size); };
  window.addEventListener('resize', resize);
  resize();
  game.camera.fit(game.world.size);

  if (status === 'corrupt') ui.toast('Your save was damaged, so a fresh restaurant was opened. (A backup was kept.)', 'bad');
  else if (status === 'loaded') ui.toast(`Welcome back to ${game.state.name}!`, 'good');
  else ui.toast('Welcome to your new restaurant! Guests are on their way ☕', 'good');

  // autosave
  setInterval(() => { if (!game.resetting) save(game); }, 10000);
  const onLeave = () => { if (!game.resetting) save(game); };
  window.addEventListener('beforeunload', onLeave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onLeave(); });

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
