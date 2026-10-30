// Developer mode (?dev, remembered by this browser; ?dev=0 turns it off): a sandbox café kept under its own save
// key, played offline (nothing goes to the server, the real café is never touched), and a DEV tab on top of
// everything that jumps straight to a scene, so testing one part never means playing from the start again.
// ?dev&scene=<id> opens a scene as the page loads (and skips the prologue / tour that would start on their own).
import { h } from '../util.js';
import { save, clearSave } from '../save.js';
import { UNIQUE_MODELS } from '../data.js';
import { isCart } from '../cart.js';
import { playPrologue, forgetPrologue, markSeen } from './prologue.js';
import { showPassersBy } from './tutorial.js';
import { openBrew } from './brew.js';
import { openBrew3d } from './brew3d.js';
import { openBattleRt } from './battlert.js';

const KEY = 'refillit.dev';
const q = new URLSearchParams(location.search);
/** Is developer mode on: ?dev turns it on for this browser, ?dev=0 off. */
export function isDev() {
  try {
    if (q.has('dev')) localStorage.setItem(KEY, q.get('dev') === '0' ? '0' : '1');
    return localStorage.getItem(KEY) === '1';
  } catch { return q.has('dev') && q.get('dev') !== '0'; }
}
/** The scene the page was opened at (?scene=…, or the older ?brew / ?battle), or null. */
export function startScene() {
  return q.get('scene') || (q.has('brew3d') ? 'brew3d' : q.has('brew') ? 'brew' : q.has('battle') ? 'battle' : null);
}

/** What the DEV tab offers: { id, label, run(game, ui, debug) }. */
const SCENES = [
  { id: 'prologue', label: '序章', run: (g, ui) => playPrologue(g).then(() => { if (!g.state.partner) showPassersBy(ui); }) },
  { id: 'passersby', label: '灰色路人（選夥伴）', run: (g, ui) => showPassersBy(ui) },
  { id: 'brew', label: '手沖', run: (g) => openBrew(g).then((r) => g.toast(`手沖 ${r.score}%（${r.verdict}）`)) },
  { id: 'brew3d', label: '手沖 3D（注水原型）', run: (g) => openBrew3d(g).then((r) => g.toast(`手沖 3D ${r.score}%（${r.why}）`)) },
  { id: 'cart', label: '新開一間攤車店（跳過序章和導覽）', run: (g) => freshCart(g, true) },
  { id: 'fresh', label: '新開一間（從序章開始）', run: (g) => freshCart(g, false) },
  { id: 'shop', label: '店舖彈出（攤車 → 10×10）', run: (g, ui) => popShop(g, ui) },
  { id: 'skiptour', label: '跳過導覽', run: (g, ui) => { if (ui.tutorial) ui.tutorial.end(); g.state.tutorialSeen = true; ui.closeModal(); } },
  { id: 'battle', label: '戰鬥（即時）', run: (g) => openBattleRt(g) },
  { id: 'debug', label: '除錯面板', run: (g, ui, debug) => { debug.toggle(); debug.rerender(); } },
];

/** A brand-new sandbox café: with the story (as a new player sees it) or straight to the cart with a partner. */
function freshCart(g, skipStory) {
  clearSave();
  forgetPrologue();
  if (skipStory) {
    g.newGame();
    g.setStarter(UNIQUE_MODELS[Math.floor(Math.random() * UNIQUE_MODELS.length)], '', {});
    g.state.tutorialSeen = true;
    save(g);
    markSeen();
  }
  g.resetting = true;   // no save on the way out over the one just made
  const u = new URL(location.href);   // and not back into the scene the page was opened at
  for (const k of ['scene', 'brew', 'brew3d', 'battle']) u.searchParams.delete(k);
  location.replace(u);
}

/** The cart's first expansion, finished now: the shop pops up round it (needs the cart stage). */
function popShop(g, ui) {
  if (!isCart(g)) return ui.toast('現在不是攤車階段：先「新開一間攤車店」', 'bad');
  const now = g.now();
  g.state.level = Math.max(g.state.level, 3);
  g.state.expansion = { size: 10, start: now - 2000, end: now - 1000 };
  g.build.finishExpansion();
  g.camera.fit(g.world.size);
}

/**
 * The DEV tab and its menu, and the scene asked for in the address (if any).
 * @param debug the debug panel (DebugPanel), opened from the menu
 */
export function setupDev(game, ui, debug) {
  const menu = h('div#devmenu', h('b', 'DEV · 沙盒存檔，不連 server'),
    SCENES.map((s) => h('button', { onclick: () => { menu.classList.remove('show'); s.run(game, ui, debug); } }, s.label)));
  const tab = h('button#devtab', { onclick: () => menu.classList.toggle('show') }, 'DEV');
  document.body.append(tab, menu);
  const scene = SCENES.find((s) => s.id === startScene());
  if (scene) scene.run(game, ui, debug);
}
