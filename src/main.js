// Entry point: load assets (placeholders for anything missing), restore the save, start the loop.
import { assets } from './assets.js';
import { models } from './models.js';
import { bakeModelIcons, bakeGlyphIcons } from './portrait.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui/ui.js';
import { DebugPanel } from './ui/debug.js';
import { setupInput } from './input.js';
import { load, save, serialize, readLocal, apply } from './save.js';
import { settleOffline } from './offline.js';
import { cloud, HEARTBEAT } from './cloud.js';
import { initAccount } from './ui/account.js';
import { updateVisit } from './ui/visit.js';
import { helpedCard } from './ui/friends.js';
import { chooseStart } from './ui/welcome.js';
import { startTutorial } from './ui/tutorial.js';
import { audio } from './audio.js';
import { t, localizeData } from './i18n.js';
import { h } from './util.js';
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
  // no player signed in on this browser yet: sign in to an account, or start as a guest (skipped when offline)
  const startScreen = navigator.onLine === false ? null : () => {
    const error = cloud.returned.error;
    cloud.returned = { ...cloud.returned, error: '', errorCode: '' };   // said on the start screen, not again later
    const local = readLocal();   // a café from before going online (no owner) goes up with a new guest; another account's does not
    return chooseStart(loading, { hasLocal: typeof local === 'object' && !local.owner, error });
  };
  const game = new Game();
  window.game = game; // handy for the console / automated checks
  // online: the server has the café (and settles the time away); without it, this browser's copy
  let status, offline = false;
  msg.textContent = t('Opening the café…');
  try {
    if (new URLSearchParams(location.search).has('offline')) throw new Error('?offline: playing without the server');   // local testing
    status = await cloud.login(game, () => { game.newGame(); return serialize(game); }, startScreen);
  } catch (e) {
    console.warn('Server unreachable, playing offline', e);
    offline = true;
    status = load(game);
    if (status !== 'loaded') game.newGame();
  }

  const canvas = document.getElementById('view');
  const renderer = new Renderer(canvas, document.getElementById('overlay'), game);
  game.renderer = renderer;
  const ui = new UI(game, document.getElementById('ui'));
  window.ui = ui;     // same, for the UI
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
  else if (status !== 'loaded') ui.toast(t('Welcome to your new café! Guests are on their way ☕'), 'good');
  if (offline) ui.toast(t('Could not reach the server: playing offline. Progress made now stays on this device.'), 'bad');

  // the server turned this game away: it can no longer save, so stop and offer a reload
  cloud.onStop = (reason) => {
    game.paused = true;
    if (reason === 'rev') { location.reload(); return; }
    const text = reason === 'session' ? t('Your café was opened on another device, so it was closed here.') : t('A new version of Refillit is ready.');
    ui.queueModal(() => h('div.card', h('div.big-title', t('Café closed')), h('div.muted', text),
      h('button.btn.primary', { style: { marginTop: '12px' }, onclick: () => location.reload() }, t('Reload'))));
  };

  // The café keeps trading while the game is closed, counted from the moment of the last save. So the save
  // must keep that moment: a hidden tab does not run the game, hence no autosave while hidden, and the one
  // save made as the tab was hidden is the one that counts.
  initAccount(ui);   // the account section, the level-3 nudge, and news from a trip to Google / an email link
  // friends helped out (at login, or while playing): a card saying who did what
  cloud.onIncoming = (list) => { if (list.length) ui.queueModal(() => helpedCard(ui, list)); };

  // Online, the server counts the time away from the last heartbeat; the browser's copy is only a cache.
  const persist = (force) => { if (!game.resetting && (force || !document.hidden)) save(game); };
  setInterval(() => persist(false), 10000);
  setInterval(() => { if (!document.hidden) cloud.beat(game); }, HEARTBEAT * 1000);
  window.addEventListener('beforeunload', () => persist(false));
  window.addEventListener('pagehide', () => cloud.beat(game, true));
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { persist(true); cloud.beat(game, true); hiddenAt = Date.now(); return; }
    // back after a long while: reload so the time away is settled the same way as after closing the game
    if (hiddenAt && (Date.now() - hiddenAt) / 1000 >= OFFLINE.minSeconds && !game.resetting) location.reload();
    hiddenAt = 0;
  });
  // The game stood still for longer than it plays out on the spot (a long stretch in build mode, say):
  // settle that time the way the time away is settled, and say what the café did meanwhile.
  game.onLongGap = (sec) => {
    let away = null;
    try { away = settleOffline(serialize(game), sec, Date.now() + game.clockSkew * 1000, { minSeconds: 0 }); } catch (e) { console.warn('Settling the gap failed', e); }
    if (!away) { game.day.snap(); return; }
    apply(game, away.data);
    renderer.reset();
    save(game);
    ui.queueModal(() => ui.awayCard(away.report));
  };
  if (game.awayReport) ui.queueModal(() => ui.awayCard(game.awayReport));
  if (!game.visit) startTutorial(ui);   // a new café: pick a partner, who shows the player around
  cloud.onIncoming(cloud.incoming);   // after "Welcome back", which says what the café did on its own

  let last = performance.now();
  let fpsAcc = 0, frames = 0;
  // Phones draw at 30 fps while nobody touches the screen (a café of strolling staff doesn't need more,
  // and it halves the GPU work that warms the phone); a finger on the glass or a camera still easing
  // into place gets every frame the screen offers.
  const IDLE_MS = renderer.lowPower ? 1000 / 30 - 4 : 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    const busy = now - game.lastTouch < 800 || (game.renderer ? game.renderer.game : game).camera.settling();
    if (!busy && now - last < IDLE_MS) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.update(dt);
    updateVisit(dt);   // a friend's café, while visiting: drawn instead of yours, which keeps trading
    renderer.render(dt);
    ui.update(dt);
    debug.update();
    fpsAcc += dt; frames++;
    if (fpsAcc > 0.5) { game.fps = frames / fpsAcc; fpsAcc = 0; frames = 0; }
  };
  requestAnimationFrame(frame);
  loading.classList.add('hide');
  setTimeout(() => loading.remove(), 500);
}
boot();
